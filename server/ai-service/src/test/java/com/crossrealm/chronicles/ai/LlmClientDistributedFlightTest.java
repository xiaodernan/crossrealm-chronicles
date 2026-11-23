package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class LlmClientDistributedFlightTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String SYSTEM = "frozen system";
    private static final String QUESTION = "same question";
    private static final String LANE = LlmClient.CacheKeys.ADVISOR;

    private static AiProperties props() {
        AiProperties props = new AiProperties();
        props.setApiKey("test-key");
        props.setModel("gpt-test");
        props.setMaxRetries(0);
        props.setTimeout(Duration.ofSeconds(5));
        return props;
    }

    private static String body() {
        return "{\"choices\":[{\"message\":{\"content\":\"shared answer\"}}],"
                + "\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":3,\"cached_tokens\":80}}";
    }

    private static final class Blocking implements LlmTransport {
        final AtomicInteger calls = new AtomicInteger();
        final CountDownLatch entered = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final RuntimeException failure;

        Blocking(RuntimeException failure) { this.failure = failure; }

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
            if (failure != null) throw failure;
            return body();
        }
    }

    private static final class Counting implements LlmTransport {
        final AtomicInteger calls = new AtomicInteger();
        @Override
        public String postJson(String url, String bearerToken, String jsonBody, Duration timeout) {
            calls.incrementAndGet();
            return body();
        }
    }

    private static final class Switchable implements LlmTransport {
        final AtomicInteger calls = new AtomicInteger();
        volatile RuntimeException failure;
        @Override
        public String postJson(String url, String bearerToken, String jsonBody, Duration timeout) {
            calls.incrementAndGet();
            if (failure != null) throw failure;
            return body();
        }
    }

    private static final class Shared implements LlmFlightCoordinator {
        private static final class Entry {
            final String owner;
            Result result;
            Entry(String owner) { this.owner = owner; }
        }
        final Map<String, Entry> entries = new java.util.concurrent.ConcurrentHashMap<>();
        final CountDownLatch followerWaiting = new CountDownLatch(1);
        final AtomicInteger lastLease = new AtomicInteger();

        @Override
        public synchronized Optional<Claim> claim(String digest, long leaseMs) {
            lastLease.set((int) leaseMs);
            String owner = java.util.UUID.randomUUID().toString();
            return entries.putIfAbsent(digest, new Entry(owner)) == null
                    ? Optional.of(new Claim(digest, owner, leaseMs)) : Optional.empty();
        }

        @Override
        public Result await(String digest, long deadlineMs) throws InterruptedException {
            followerWaiting.countDown();
            Entry entry = entries.get(digest);
            while (entry != null && entry.result == null && System.currentTimeMillis() < deadlineMs) {
                Thread.sleep(1);
            }
            return entry == null ? null : entry.result;
        }

        @Override
        public synchronized boolean complete(Claim claim, LlmClient.Answer answer) {
            Entry entry = entries.get(claim.digest());
            if (entry == null || !entry.owner.equals(claim.owner())) return false;
            entry.result = new Result(answer.answer(), answer.upstreamCached(), null);
            return true;
        }

        @Override
        public synchronized boolean fail(Claim claim, String reason) {
            Entry entry = entries.get(claim.digest());
            if (entry == null || !entry.owner.equals(claim.owner())) return false;
            entry.result = new Result(null, false, reason);
            return true;
        }

        @Override
        public synchronized boolean release(Claim claim) {
            Entry entry = entries.get(claim.digest());
            return entry != null && entry.owner.equals(claim.owner()) && entries.remove(claim.digest(), entry);
        }
    }

    @Test
    void 两个客户端同键并发只调用一次并保留跟随者元数据() throws Exception {
        Shared flights = new Shared();
        Blocking leaderTransport = new Blocking(null);
        Counting followerTransport = new Counting();
        LlmClient leaderClient = new LlmClient(props(), leaderTransport, MAPPER, null, flights);
        LlmClient followerClient = new LlmClient(props(), followerTransport, MAPPER, null, flights);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<LlmClient.Answer> leader = pool.submit(() -> leaderClient.complete(SYSTEM, QUESTION, LANE));
            assertTrue(leaderTransport.entered.await(5, TimeUnit.SECONDS));
            Future<LlmClient.Answer> follower = pool.submit(() -> followerClient.complete(SYSTEM, QUESTION, LANE));
            assertTrue(flights.followerWaiting.await(5, TimeUnit.SECONDS));
            Thread.sleep(40);
            leaderTransport.release.countDown();

            LlmClient.Answer leaderAnswer = leader.get(10, TimeUnit.SECONDS);
            LlmClient.Answer followerAnswer = follower.get(10, TimeUnit.SECONDS);
            assertFalse(leaderAnswer.cached());
            assertTrue(leaderAnswer.upstreamCached());
            assertTrue(followerAnswer.cached());
            assertTrue(followerAnswer.upstreamCached());
            assertTrue(followerAnswer.latencyMs() >= 30);
            assertEquals("shared answer", followerAnswer.answer());
            assertEquals(1, leaderTransport.calls.get());
            assertEquals(0, followerTransport.calls.get());
            assertTrue(flights.lastLease.get() >= 7_000);
            assertEquals(1L, lane(followerClient, LANE).get("coalesced"));
            assertEquals(0L, lane(followerClient, LANE).get("calls"));

            LlmClient laterClient = new LlmClient(props(), followerTransport, MAPPER, null, flights);
            assertTrue(laterClient.complete(SYSTEM, QUESTION, LANE).cached());
            assertEquals(0, followerTransport.calls.get(), "终态保留期内的新实例也不该再打上游");
        } finally {
            leaderTransport.release.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void 跨实例失败跟随者收到同源稳定原因() throws Exception {
        Shared flights = new Shared();
        Blocking leaderTransport = new Blocking(new LlmUpstreamException(503, false, "unavailable"));
        Counting followerTransport = new Counting();
        LlmClient leaderClient = new LlmClient(props(), leaderTransport, MAPPER, null, flights);
        LlmClient followerClient = new LlmClient(props(), followerTransport, MAPPER, null, flights);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<LlmClient.Answer> leader = pool.submit(() -> leaderClient.complete(SYSTEM, QUESTION, LANE));
            assertTrue(leaderTransport.entered.await(5, TimeUnit.SECONDS));
            Future<LlmClient.Answer> follower = pool.submit(() -> followerClient.complete(SYSTEM, QUESTION, LANE));
            assertTrue(flights.followerWaiting.await(5, TimeUnit.SECONDS));
            leaderTransport.release.countDown();
            assertThrows(java.util.concurrent.ExecutionException.class, () -> leader.get(10, TimeUnit.SECONDS));
            java.util.concurrent.ExecutionException error = assertThrows(java.util.concurrent.ExecutionException.class,
                    () -> follower.get(10, TimeUnit.SECONDS));
            assertTrue(error.getCause() instanceof AdvisorUnavailableException);
            assertEquals("upstream-503", ((AdvisorUnavailableException) error.getCause()).getReason());
            assertEquals(1, leaderTransport.calls.get());
            assertEquals(0, followerTransport.calls.get());
            assertEquals(1L, lane(followerClient, LANE).get("coalesced"));
        } finally {
            leaderTransport.release.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void 不同问句不互相合流() throws Exception {
        Shared flights = new Shared();
        Counting first = new Counting();
        Counting second = new Counting();
        LlmClient firstClient = new LlmClient(props(), first, MAPPER, null, flights);
        LlmClient secondClient = new LlmClient(props(), second, MAPPER, null, flights);
        assertEquals("shared answer", firstClient.complete(SYSTEM, QUESTION, LANE).answer());
        assertEquals("shared answer", secondClient.complete(SYSTEM, QUESTION + " other", LANE).answer());
        assertEquals(1, first.calls.get());
        assertEquals(1, second.calls.get());
    }

    @Test
    void Redis领取与等待故障都回退到本实例上游() {
        LlmFlightCoordinator broken = new LlmFlightCoordinator() {
            @Override
            public Optional<Claim> claim(String digest, long leaseMs) {
                throw new IllegalStateException("redis down");
            }
            @Override
            public Result await(String digest, long deadlineMs) {
                throw new IllegalStateException("redis down");
            }
            @Override
            public boolean complete(Claim claim, LlmClient.Answer answer) { return false; }
            @Override
            public boolean fail(Claim claim, String reason) { return false; }
        };
        Counting transport = new Counting();
        LlmClient client = new LlmClient(props(), transport, MAPPER, null, broken);
        assertFalse(client.complete(SYSTEM, QUESTION, LANE).cached());
        assertEquals(1, transport.calls.get());

        LlmFlightCoordinator waitingFailure = new LlmFlightCoordinator() {
            @Override
            public Optional<Claim> claim(String digest, long leaseMs) { return Optional.empty(); }
            @Override
            public Result await(String digest, long deadlineMs) { throw new IllegalStateException("redis down"); }
            @Override
            public boolean complete(Claim claim, LlmClient.Answer answer) { return false; }
            @Override
            public boolean fail(Claim claim, String reason) { return false; }
        };
        Counting fallback = new Counting();
        LlmClient fallbackClient = new LlmClient(props(), fallback, MAPPER, null, waitingFailure);
        assertFalse(fallbackClient.complete(SYSTEM, QUESTION, LANE).cached());
        assertEquals(1, fallback.calls.get());
    }

    @Test
    void 单实例熔断抢占不把本地故障发布给健康实例() {
        Shared flights = new Shared();
        Switchable transport = new Switchable();
        transport.failure = new LlmUpstreamException(503, false, "trip");
        AiProperties failingProps = props();
        failingProps.setBreakerThreshold(1);
        LlmClient failingClient = new LlmClient(failingProps, transport, MAPPER, null, flights);
        LlmClient healthyClient = new LlmClient(props(), transport, MAPPER, null, flights);
        assertThrows(AdvisorUnavailableException.class,
                () -> failingClient.complete(SYSTEM, "trip breaker", LANE));
        transport.failure = null;
        assertThrows(AdvisorUnavailableException.class,
                () -> failingClient.complete(SYSTEM, QUESTION, LANE));
        assertEquals("shared answer", healthyClient.complete(SYSTEM, QUESTION, LANE).answer());
        assertEquals(2, transport.calls.get(), "只有真实触发熔断的那一次和健康实例的一次上游");
    }

    @Test
    void 终态发布故障不丢掉领队已经拿到的答案() {
        LlmFlightCoordinator publishFailure = new LlmFlightCoordinator() {
            @Override
            public Optional<Claim> claim(String digest, long leaseMs) {
                return Optional.of(new Claim(digest, "owner", leaseMs));
            }
            @Override
            public Result await(String digest, long deadlineMs) { return null; }
            @Override
            public boolean complete(Claim claim, LlmClient.Answer answer) {
                throw new IllegalStateException("redis down");
            }
            @Override
            public boolean fail(Claim claim, String reason) { return false; }
        };
        Counting transport = new Counting();
        LlmClient client = new LlmClient(props(), transport, MAPPER, null, publishFailure);
        assertFalse(client.complete(SYSTEM, QUESTION, LANE).cached());
        assertEquals(1, transport.calls.get());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> lane(LlmClient client, String lane) {
        Map<String, Object> upstream = (Map<String, Object>) client.health().get("upstreamUsage");
        return (Map<String, Object>) ((Map<String, Object>) upstream.get("byLane")).get(lane);
    }
}
