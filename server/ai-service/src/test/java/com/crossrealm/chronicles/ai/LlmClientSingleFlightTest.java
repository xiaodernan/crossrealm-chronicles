package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 同键合流（single-flight，W-Z514）。
 *
 * <p>钉的是一件很具体的事：`ResponseCache` 的 `get` / `put` 各自 `synchronized`，
 * 所以**同一问句同时到 N 次**时，每一次都在"还没人写进来"的那一刻 miss —— N 次上游付费
 * 换一个字符串。顾问面板刷新一次就是几条同样的问句，而每一次都是真金白银的 token。
 *
 * <p>零网络，且**不靠 sleep 赌时序**：fake transport 走进上游就卡在闩上，
 * 测试先轮询"跟随者已经挂上合流表"这个**被检的读数本身**（`byLane.coalesced`），
 * 挂满了才放行。于是断言里的次数不是运气，是结构。
 */
class LlmClientSingleFlightTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String SYSTEM = "冻结的系统提示";
    private static final String QUESTION = "同一个问题原文";
    private static final String ANSWER = "唯一那份答案";

    private static String body() {
        return "{\"object\":\"chat.completion\",\"choices\":[{\"index\":0,\"message\":"
                + "{\"role\":\"assistant\",\"content\":\"" + ANSWER + "\"},\"finish_reason\":\"stop\"}],"
                + "\"usage\":{\"prompt_tokens\":1000,\"completion_tokens\":7,"
                + "\"prompt_tokens_details\":{\"cached_tokens\":900}}}";
    }

    private static AiProperties props() {
        AiProperties p = new AiProperties();
        p.setApiKey("unit-test-key");
        p.setModel("gpt-test");
        p.setMaxRetries(0);
        p.setRetryBaseMs(1);
        p.setTimeout(Duration.ofSeconds(5));
        p.setCacheTtlSeconds(120);
        p.setBreakerThreshold(50);
        return p;
    }

    /** 走进上游就卡在闩上的 transport；它同时是"上游到底被打了几次"的证人。 */
    private static final class Blocking implements LlmTransport {
        final AtomicInteger calls = new AtomicInteger();
        final CountDownLatch entered = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        private final RuntimeException toThrow;

        Blocking(RuntimeException toThrow) { this.toThrow = toThrow; }

        @Override
        public String postJson(String url, String bearerToken, String jsonBody, Duration timeout) {
            calls.incrementAndGet();
            entered.countDown();
            try {
                assertTrue(release.await(20, TimeUnit.SECONDS), "测试没有放行，领队不该一直等");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new LlmUpstreamException(0, false, "interrupted");
            }
            if (toThrow != null) throw toThrow;
            return body();
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> laneView(LlmClient client, String lane) {
        Map<String, Object> upstream = (Map<String, Object>) client.health().get("upstreamUsage");
        Map<String, Object> lanes = (Map<String, Object>) upstream.get("byLane");
        Object one = lanes.get(lane);
        assertNotNull(one, "byLane 里没有这条车道：" + lanes.keySet());
        return (Map<String, Object>) one;
    }

    private static long coalesced(LlmClient client, String lane) {
        Object one = laneMap(client).get(lane);
        if (one == null) return 0L;   // 桶还没被建出来：跟随者一个都还没到，交给轮询去等
        return (long) ((Map<String, Object>) one).get("coalesced");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> laneMap(LlmClient client) {
        Map<String, Object> upstream = (Map<String, Object>) client.health().get("upstreamUsage");
        return (Map<String, Object>) upstream.get("byLane");
    }

    /** 等 N 位跟随者真的挂上合流表（读的是被检的那本账，不是 sleep）。 */
    private static void awaitFollowers(LlmClient client, String lane, int n) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5_000L;
        while (coalesced(client, lane) < n) {
            if (System.currentTimeMillis() >= deadline) {
                throw new AssertionError("跟随者没在 5 秒内挂上合流表（期望 " + n
                        + "，读到 " + coalesced(client, lane) + "）—— 合流表装配本身有问题");
            }
            Thread.sleep(5L);
        }
    }

    private static final class Pack {
        final ExecutorService pool = Executors.newFixedThreadPool(8);
        final List<Future<LlmClient.Answer>> followers = new ArrayList<>();

        void submit(LlmClient client, int n, String lane) {
            for (int i = 0; i < n; i++) {
                followers.add(pool.submit(() -> client.complete(SYSTEM, QUESTION, lane)));
            }
        }

        List<LlmClient.Answer> awaitAll() throws Exception {
            List<LlmClient.Answer> got = new ArrayList<>();
            for (Future<LlmClient.Answer> f : followers) got.add(f.get(20, TimeUnit.SECONDS));
            pool.shutdownNow();
            return got;
        }

        List<Class<? extends Throwable>> awaitFailures() {
            List<Class<? extends Throwable>> kinds = new ArrayList<>();
            for (Future<LlmClient.Answer> f : followers) {
                try {
                    f.get(20, TimeUnit.SECONDS);
                } catch (java.util.concurrent.ExecutionException e) {
                    kinds.add(e.getCause().getClass());
                } catch (Exception e) {
                    kinds.add(e.getClass());
                }
            }
            pool.shutdownNow();
            return kinds;
        }
    }

    @Test
    void 八个同一问句并发只付一次上游钱() throws Exception {
        Blocking transport = new Blocking(null);
        LlmClient client = new LlmClient(props(), transport, MAPPER);
        ExecutorService starter = Executors.newSingleThreadExecutor();
        Future<LlmClient.Answer> leader = starter.submit(() -> client.complete(SYSTEM, QUESTION, LlmClient.CacheKeys.ADVISOR));

        assertTrue(transport.entered.await(5, TimeUnit.SECONDS), "领队没走到上游，这一门的夹具就没搭对");
        Pack pack = new Pack();
        pack.submit(client, 7, LlmClient.CacheKeys.ADVISOR);
        awaitFollowers(client, LlmClient.CacheKeys.ADVISOR, 7);
        transport.release.countDown();

        assertEquals(ANSWER, leader.get(20, TimeUnit.SECONDS).answer());
        List<LlmClient.Answer> rest = pack.awaitAll();
        starter.shutdownNow();

        assertEquals(1, transport.calls.get(), "同键并发穿透了上游：合流没生效");
        for (LlmClient.Answer a : rest) assertEquals(ANSWER, a.answer(), "跟着走的那几位必须拿到同一份答案");

        Map<String, Object> view = laneView(client, LlmClient.CacheKeys.ADVISOR);
        assertEquals(1L, view.get("calls"), "车道账上也只能记一次上游");
        assertEquals(7L, view.get("coalesced"));
        // 8 = 领队那一次 miss + 七位跟随各自 miss：他们都先在本地摘要缓存上扑空，
        // 区别只在于领队去打上游、其余跟着那份结果走。
        assertEquals(8L, view.get("localMisses"));
        assertEquals(0, inFlight(client), "收尾之后在飞表必须是空的，否则下一位会跟着旧结果走");
    }

    /** 对照臂用的证人：只数次数、不卡闩 —— 它要证的是"不同键各打一次"，重不重叠与它无关。 */
    private static final class Counting implements LlmTransport {
        final AtomicInteger calls = new AtomicInteger();

        @Override
        public String postJson(String url, String bearerToken, String jsonBody, Duration timeout) {
            calls.incrementAndGet();
            return body();
        }
    }

    @Test
    void 对照臂八个不同问句就该各打一次上游() throws Exception {
        Counting transport = new Counting();
        LlmClient client = new LlmClient(props(), transport, MAPPER);
        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            List<Future<LlmClient.Answer>> futures = new ArrayList<>();
            for (int i = 0; i < 8; i++) {
                final int n = i;
                futures.add(pool.submit(() -> client.complete(SYSTEM, QUESTION + "#" + n, LlmClient.CacheKeys.EMBER)));
            }
            for (Future<LlmClient.Answer> f : futures) assertEquals(ANSWER, f.get(20, TimeUnit.SECONDS).answer());
        } finally {
            pool.shutdownNow();
        }
        assertEquals(8, transport.calls.get(), "不同问句该各打一次；少了说明夹具把上游绕过了");
        assertEquals(0L, laneView(client, LlmClient.CacheKeys.EMBER).get("coalesced"), "不同键不该被合流");
    }

    @Test
    void 上游失败时跟着走的那几位拿到同一种异常() throws Exception {
        Blocking transport = new Blocking(new LlmUpstreamException(503, false, "unavailable"));
        LlmClient client = new LlmClient(props(), transport, MAPPER);
        ExecutorService starter = Executors.newSingleThreadExecutor();
        Future<LlmClient.Answer> leader = starter.submit(() -> client.complete(SYSTEM, QUESTION, LlmClient.CacheKeys.ORACLE));

        assertTrue(transport.entered.await(5, TimeUnit.SECONDS), "领队没走到上游，夹具没搭对");
        Pack pack = new Pack();
        pack.submit(client, 4, LlmClient.CacheKeys.ORACLE);
        awaitFollowers(client, LlmClient.CacheKeys.ORACLE, 4);
        transport.release.countDown();

        assertThrows(java.util.concurrent.ExecutionException.class, () -> leader.get(20, TimeUnit.SECONDS));
        List<Class<? extends Throwable>> kinds = pack.awaitFailures();
        starter.shutdownNow();

        assertEquals(1, transport.calls.get(), "失败也不许被 N 位各付一次");
        assertEquals(4, kinds.size(), "跟着走的那几位也必须被告知失败，而不是拿到一份空答案");
        for (Class<? extends Throwable> kind : kinds) {
            assertEquals(AdvisorUnavailableException.class, kind,
                    "合流者看到的异常类型必须与领队同源，否则 503 兜底会跟着包装层走形");
        }
        assertEquals(4L, laneView(client, LlmClient.CacheKeys.ORACLE).get("coalesced"));
        assertEquals(0, inFlight(client), "失败之后不许留尸体在飞表里");
    }

    @Test
    void 跨车道同内容也只付一次且两边账各记各的() throws Exception {
        // digest 里没有车道名：同 (model, system, user) 的内容本来就等价，
        // 所以这一位不该因为"车道不同"再花一次钱；上游那一次记在真去打的那条车道上，
        // 跟随次数记在跟随者自己的车道账上。
        Blocking transport = new Blocking(null);
        LlmClient client = new LlmClient(props(), transport, MAPPER);
        ExecutorService starter = Executors.newSingleThreadExecutor();
        Future<LlmClient.Answer> leader = starter.submit(() -> client.complete(SYSTEM, QUESTION, LlmClient.CacheKeys.GUIDE));
        assertTrue(transport.entered.await(5, TimeUnit.SECONDS));

        String otherLane = LlmClient.CacheKeys.CHAPTER_CODA;
        Pack pack = new Pack();
        pack.submit(client, 3, otherLane);
        awaitFollowers(client, otherLane, 3);
        transport.release.countDown();

        assertEquals(ANSWER, leader.get(20, TimeUnit.SECONDS).answer());
        List<LlmClient.Answer> rest = pack.awaitAll();
        starter.shutdownNow();

        assertEquals(1, transport.calls.get());
        assertEquals(3, rest.size());
        assertEquals(3L, laneView(client, otherLane).get("coalesced"), "三位跟随记在他们自己的车道账上");
        assertEquals(0L, laneView(client, LlmClient.CacheKeys.GUIDE).get("coalesced"), "领队不是跟随者");
        assertEquals(1L, laneView(client, LlmClient.CacheKeys.GUIDE).get("calls"), "上游那一次记在真去打的那条车道上");
        assertEquals(0L, laneView(client, otherLane).get("calls"), "没打上游的车道不许摊到上游次数");
    }

    @SuppressWarnings("unchecked")
    private static int inFlight(LlmClient client) {
        Map<String, Object> upstream = (Map<String, Object>) client.health().get("upstreamUsage");
        return ((Number) upstream.get("inFlight")).intValue();
    }
}
