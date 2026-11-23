package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/** 真实 Redis 原子性/TTL/栅栏验证；上游始终是假 transport，零 LLM 流量。 */
class RedisLlmFlightCoordinatorLiveTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static String host;
    private static int port;
    private static boolean reachable;
    private LettuceConnectionFactory factory;
    private StringRedisTemplate redis;

    @BeforeAll
    static void probeRedis() {
        host = System.getenv().getOrDefault("REDIS_HOST", "localhost");
        try {
            port = Integer.parseInt(System.getenv().getOrDefault("REDIS_PORT", "6379"));
        } catch (NumberFormatException e) {
            port = 6379;
        }
        LettuceConnectionFactory probe = new LettuceConnectionFactory(
                new RedisStandaloneConfiguration(host, port));
        try {
            probe.afterPropertiesSet();
            probe.getConnection().ping();
            reachable = true;
        } catch (RuntimeException e) {
            reachable = false;
        } finally {
            probe.destroy();
        }
    }

    @BeforeEach
    void openRedis() {
        Assumptions.assumeTrue(reachable, "没有可达 Redis，跳过真实合流联调");
        factory = new LettuceConnectionFactory(new RedisStandaloneConfiguration(host, port));
        factory.afterPropertiesSet();
        redis = new StringRedisTemplate(factory);
    }

    @AfterEach
    void closeRedis() {
        if (factory != null) factory.destroy();
    }

    private static LlmFlightProperties props() {
        LlmFlightProperties props = new LlmFlightProperties();
        props.setPollMs(5);
        props.setTerminalTtlMs(2_000);
        return props;
    }

    private static RedisLlmFlightCoordinator coordinator(StringRedisTemplate redis) {
        return new RedisLlmFlightCoordinator(redis, MAPPER, props());
    }

    private static String key(String digest) {
        return "ai:llm:flight:v1:" + digest;
    }

    @Test
    void 并发领取只有一个赢家且租约真实生效() throws Exception {
        String digest = "race-" + UUID.randomUUID();
        RedisLlmFlightCoordinator coordinator = coordinator(redis);
        int count = 16;
        ExecutorService pool = Executors.newFixedThreadPool(count);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Optional<LlmFlightCoordinator.Claim>>> futures = new ArrayList<>();
            for (int i = 0; i < count; i++) {
                futures.add(pool.submit(() -> {
                    start.await();
                    return coordinator.claim(digest, 5_000);
                }));
            }
            start.countDown();
            int winners = 0;
            for (Future<Optional<LlmFlightCoordinator.Claim>> future : futures) {
                if (future.get(5, TimeUnit.SECONDS).isPresent()) winners++;
            }
            assertEquals(1, winners);
            Long ttl = redis.getExpire(key(digest));
            assertTrue(ttl != null && ttl > 0 && ttl <= 5);
        } finally {
            redis.delete(key(digest));
            pool.shutdownNow();
        }
    }

    @Test
    void 租约过期接管后旧所有者不能覆盖新终态() throws Exception {
        String digest = "fence-" + UUID.randomUUID();
        RedisLlmFlightCoordinator first = coordinator(redis);
        RedisLlmFlightCoordinator second = coordinator(redis);
        try {
            LlmFlightCoordinator.Claim oldOwner = first.claim(digest, 80).orElseThrow();
            long deadline = System.currentTimeMillis() + 2_000;
            while (Boolean.TRUE.equals(redis.hasKey(key(digest))) && System.currentTimeMillis() < deadline) {
                Thread.sleep(5);
            }
            assertFalse(Boolean.TRUE.equals(redis.hasKey(key(digest))), "租约没有到期");
            LlmFlightCoordinator.Claim newOwner = second.claim(digest, 2_000).orElseThrow();
            assertFalse(first.complete(oldOwner, new LlmClient.Answer("stale", "gpt-test", false, false, 1)));
            assertTrue(second.complete(newOwner, new LlmClient.Answer("fresh", "gpt-test", false, true, 1)));
            LlmFlightCoordinator.Result result = coordinator(redis).await(digest, System.currentTimeMillis() + 500);
            assertEquals("fresh", result.answer());
            assertTrue(result.upstreamCached());
        } finally {
            redis.delete(key(digest));
        }
    }

    @Test
    void 未出上游的抢占可以所有者安全释放() {
        String digest = "release-" + UUID.randomUUID();
        try {
            RedisLlmFlightCoordinator coordinator = coordinator(redis);
            LlmFlightCoordinator.Claim claim = coordinator.claim(digest, 5_000).orElseThrow();
            assertTrue(coordinator.release(claim));
            assertFalse(Boolean.TRUE.equals(redis.hasKey(key(digest))));
            assertFalse(coordinator.complete(claim, new LlmClient.Answer("late", "gpt-test", false, false, 1)));
        } finally {
            redis.delete(key(digest));
        }
    }

    @Test
    void 畸形运行记录不会被当作完整答案() throws Exception {
        String digest = "malformed-" + UUID.randomUUID();
        try {
            redis.opsForValue().set(key(digest), "not-json", Duration.ofSeconds(1));
            assertNull(coordinator(redis).await(digest, System.currentTimeMillis() + 100));
        } finally {
            redis.delete(key(digest));
        }
    }

    @Test
    void 两个独立客户端经真实Redis只支付一次假上游() throws Exception {
        AiProperties props = new AiProperties();
        props.setApiKey("test-key");
        props.setModel("gpt-test");
        props.setMaxRetries(0);
        props.setTimeout(Duration.ofSeconds(5));
        String question = "real-redis-" + UUID.randomUUID();
        String digest = digest(props, question);
        Blocking leaderTransport = new Blocking();
        Counting followerTransport = new Counting();
        RedisLlmFlightCoordinator leaderFlights = coordinator(redis);
        Signalling followerFlights = new Signalling(coordinator(redis));
        LlmClient leaderClient = new LlmClient(props, leaderTransport, MAPPER, null, leaderFlights);
        LlmClient followerClient = new LlmClient(props, followerTransport, MAPPER, null, followerFlights);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<LlmClient.Answer> leader = pool.submit(() -> leaderClient.complete("system", question, LlmClient.CacheKeys.EMBER));
            assertTrue(leaderTransport.entered.await(5, TimeUnit.SECONDS));
            Future<LlmClient.Answer> follower = pool.submit(() -> followerClient.complete("system", question, LlmClient.CacheKeys.EMBER));
            assertTrue(followerFlights.waiting.await(5, TimeUnit.SECONDS));
            leaderTransport.release.countDown();
            LlmClient.Answer leaderAnswer = leader.get(10, TimeUnit.SECONDS);
            LlmClient.Answer followerAnswer = follower.get(10, TimeUnit.SECONDS);
            assertFalse(leaderAnswer.cached());
            assertTrue(followerAnswer.cached());
            assertTrue(followerAnswer.upstreamCached());
            assertEquals("redis-shared", followerAnswer.answer());
            assertEquals(1, leaderTransport.calls.get());
            assertEquals(0, followerTransport.calls.get());
        } finally {
            leaderTransport.release.countDown();
            redis.delete(key(digest));
            pool.shutdownNow();
        }
    }

    private static String digest(AiProperties props, String question) throws Exception {
        String identity = props.getModel() + "\u0000" + props.maxTokensFor(LlmClient.CacheKeys.EMBER)
                + "\u0000system\u0000" + question;
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(identity.getBytes(StandardCharsets.UTF_8)));
    }

    private static final class Signalling implements LlmFlightCoordinator {
        final CountDownLatch waiting = new CountDownLatch(1);
        private final LlmFlightCoordinator delegate;
        Signalling(LlmFlightCoordinator delegate) { this.delegate = delegate; }
        @Override public Optional<Claim> claim(String digest, long leaseMs) { return delegate.claim(digest, leaseMs); }
        @Override public Result await(String digest, long deadlineMs) throws InterruptedException {
            waiting.countDown();
            return delegate.await(digest, deadlineMs);
        }
        @Override public boolean complete(Claim claim, LlmClient.Answer answer) { return delegate.complete(claim, answer); }
        @Override public boolean fail(Claim claim, String reason) { return delegate.fail(claim, reason); }
    }

    private static final class Blocking implements LlmTransport {
        final AtomicInteger calls = new AtomicInteger();
        final CountDownLatch entered = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        @Override
        public String postJson(String url, String bearerToken, String jsonBody, Duration timeout) {
            calls.incrementAndGet();
            entered.countDown();
            try {
                assertTrue(release.await(10, TimeUnit.SECONDS));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new LlmUpstreamException(0, false, "interrupted");
            }
            return "{\"choices\":[{\"message\":{\"content\":\"redis-shared\"}}],"
                    + "\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":2,\"cached_tokens\":90}}";
        }
    }

    private static final class Counting implements LlmTransport {
        final AtomicInteger calls = new AtomicInteger();
        @Override
        public String postJson(String url, String bearerToken, String jsonBody, Duration timeout) {
            calls.incrementAndGet();
            return "{\"choices\":[{\"message\":{\"content\":\"unexpected\"}}]}";
        }
    }
}
