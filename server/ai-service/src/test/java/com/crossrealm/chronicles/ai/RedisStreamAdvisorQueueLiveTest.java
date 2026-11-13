package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * W-Z1：Redis Streams 可靠投递的<b>真实端到端</b>验证。
 *
 * <p>只在能连上 Redis 时才跑（默认 {@code localhost:6379}，可用 {@code REDIS_HOST} /
 * {@code REDIS_PORT} 覆盖）。CI 没有 Redis 时整类跳过 —— 离线纪律与 LLM 联调测试一致。
 *
 * <p>钉的是「真实 Redis 上的消费者组语义」：提交 → 由 worker 经 {@code XREADGROUP} 取走 →
 * 成功 {@code XACK}；瞬态失败留 pending、由 {@code XAUTOCLAIM} 按 idle 重投（实测重试次数
 * 跨投递累计）；耗尽进死信流；幂等键去重；容量满明确 429。
 */
class RedisStreamAdvisorQueueLiveTest {

    private static String host;
    private static int port;
    private static boolean reachable;

    private LettuceConnectionFactory factory;
    private StringRedisTemplate redis;
    private AdvisorJobQueue.Handler handler;

    /** 脚本化 handler：前 {@code failTimes} 次抛瞬态，之后返回 PONG。 */
    static final class ScriptedHandler implements AdvisorJobQueue.Handler {
        private final int failTimes;
        private int calls;
        ScriptedHandler(int failTimes) { this.failTimes = failTimes; }
        @Override
        public LlmClient.Answer handle(String question, Map<String, Object> context) {
            calls++;
            if (calls <= failTimes) {
                throw new AdvisorUnavailableException("upstream-flop");
            }
            return new LlmClient.Answer("PONG", "gpt-6-sol", false, false, 7L);
        }
    }

    @BeforeAll
    static void 探测Redis() {
        host = System.getenv().getOrDefault("REDIS_HOST", "localhost");
        try {
            port = Integer.parseInt(System.getenv().getOrDefault("REDIS_PORT", "6379"));
        } catch (NumberFormatException e) {
            port = 6379;
        }
        try {
            LettuceConnectionFactory probe = new LettuceConnectionFactory(
                    new RedisStandaloneConfiguration(host, port));
            probe.afterPropertiesSet();
            probe.getConnection().ping();
            probe.destroy();
            reachable = true;
        } catch (RuntimeException e) {
            reachable = false;
        }
    }

    @BeforeEach
    void 准备() {
        Assumptions.assumeTrue(reachable, "没有可达的 Redis —— 跳过真实 Streams 联调");
        factory = new LettuceConnectionFactory(new RedisStandaloneConfiguration(host, port));
        factory.afterPropertiesSet();
        redis = new StringRedisTemplate(factory);
        redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    }

    @AfterEach
    void 关闭() {
        if (factory != null) factory.destroy();
    }

    private static AdvisorJobProperties props(int capacity, int workers, int maxAttempts, long pollAfterMs) {
        AdvisorJobProperties p = new AdvisorJobProperties();
        p.setCapacity(capacity);
        p.setWorkers(workers);
        p.setMaxAttempts(maxAttempts);
        p.setRetryBaseMs(10);
        p.setPollAfterMs(pollAfterMs);
        p.setMaxTracked(100);
        p.setBackend("redis");
        return p;
    }

    private RedisStreamAdvisorQueue 起队列(AdvisorJobQueue.Handler h, int workers, int maxAttempts, long pollAfterMs) {
        return 起队列(h, workers, maxAttempts, pollAfterMs, 64);
    }

    private RedisStreamAdvisorQueue 起队列(AdvisorJobQueue.Handler h, int workers, int maxAttempts, long pollAfterMs, int capacity) {
        RedisStreamAdvisorQueue q = new RedisStreamAdvisorQueue(
                props(capacity, workers, maxAttempts, pollAfterMs), h, Thread::sleep, redis);
        q.start();
        return q;
    }

    private Map<String, Object> 轮询到终态(RedisStreamAdvisorQueue q, String jobId, long timeoutMs)
            throws InterruptedException {
        long end = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < end) {
            Optional<Map<String, Object>> v = q.view(jobId);
            if (v.isPresent()) {
                String status = (String) v.get().get("status");
                if ("DONE".equals(status) || "DEAD".equals(status)) return v.get();
            }
            Thread.sleep(50);
        }
        return q.view(jobId).orElseThrow();
    }

    @Test
    void 提交后由worker经消费者组取走_成功终态带答案() throws InterruptedException {
        ScriptedHandler h = new ScriptedHandler(0);
        try (var q = 起队列(h, 1, 3, 200)) {
            var r = q.submit("hello", Map.of(), null);
            assertTrue(r.accepted());
            Map<String, Object> v = 轮询到终态(q, r.jobId(), 4000);
            assertEquals("DONE", v.get("status"));
            assertEquals("PONG", v.get("answer"));
        }
    }

    @Test
    void 瞬态失败留pending_由XAUTOCLAIM按idle重投_重试次数跨投递累计() throws InterruptedException {
        ScriptedHandler h = new ScriptedHandler(2);   // 前两次抛，第三次成功
        try (var q = 起队列(h, 1, 3, 150)) {
            var r = q.submit("retry-me", Map.of(), null);
            Map<String, Object> v = 轮询到终态(q, r.jobId(), 6000);
            assertEquals("DONE", v.get("status"));
            assertEquals(3L, v.get("attempts"), "两次失败 + 一次成功，attempts 必须累计到 3（XREADGROUP + XCLAIM 同一个）");
        }
    }

    @Test
    void 重试耗尽进死信_真实Redis的DLQ与stats() throws InterruptedException {
        ScriptedHandler h = new ScriptedHandler(99);  // 永远失败
        try (var q = 起队列(h, 1, 3, 100)) {
            var r = q.submit("doomed", Map.of(), null);
            Map<String, Object> v = 轮询到终态(q, r.jobId(), 6000);
            assertEquals("DEAD", v.get("status"));
            @SuppressWarnings("unchecked")
            Map<String, Object> stats = (Map<String, Object>) q.stats();
            assertTrue((Long) stats.get("deadLettered") >= 1, "死信计数应 >=1");
        }
    }

    @Test
    void 幂等键去重_重复提交返回同一jobId() {
        ScriptedHandler h = new ScriptedHandler(0);
        try (var q = 起队列(h, 1, 3, 200)) {
            var a = q.submit("q", Map.of(), "same-req");
            var b = q.submit("q", Map.of(), "same-req");
            assertTrue(b.duplicate());
            assertEquals(a.jobId(), b.jobId());
        }
    }

    @Test
    void 容量满明确拒绝_不静默丢() {
        ScriptedHandler h = new ScriptedHandler(0);
        // 容量 2、0 个 worker（不入队处理，专门卡容量）：提交 3 条，第 3 条应被拒。
        try (var q = 起队列(h, 0, 3, 200, 2)) {
            q.submit("a", Map.of(), null);
            q.submit("b", Map.of(), null);
            var c = q.submit("c", Map.of(), null);
            assertFalse(c.accepted());
            assertEquals("queue-full", c.reason());
        }
    }
}
