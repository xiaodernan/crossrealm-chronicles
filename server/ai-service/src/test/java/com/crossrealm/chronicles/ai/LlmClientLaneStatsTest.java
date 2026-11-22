package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 分车道上游读数（W-Z514）。
 *
 * <p>从前 `/api/ai/health` 只交回一个**进程级累计** `hitRatio`。那不是"精度不够"的问题，
 * 是**这句话说不出口**的问题：13 条 lane 共用一个总账，"星轨顾问这一条掉了缓存"既不能证实
 * 也不能证伪，只能靠人肉翻 `ai.upstream.usage` 的日志行。这一门钉的是"账本按 lane 分得开、
 * 且分开的这本账仍然一个字的玩家内容都不带"。
 *
 * <p>零网络：上游由脚本化 fake 扮演，与 `LlmClientTest` 同一口径。
 */
class LlmClientLaneStatsTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 带 usage 的响应：prompt 1000、其中 cached 900 —— 命中率 90% 是这一门里所有断言的基准。 */
    private static String usageResponse(String text, int prompt, int cached) {
        return "{\"object\":\"chat.completion\",\"choices\":[{\"index\":0,\"message\":"
                + "{\"role\":\"assistant\",\"content\":\"" + text + "\"},\"finish_reason\":\"stop\"}],"
                + "\"usage\":{\"prompt_tokens\":" + prompt + ",\"completion_tokens\":7,"
                + "\"prompt_tokens_details\":{\"cached_tokens\":" + cached + "}}}";
    }

    /** 每次都按脚本报数的 fake；脚本报完就重复最后一条。 */
    private static final class Scripted implements LlmTransport {
        int calls;
        private final java.util.Deque<String> script = new java.util.ArrayDeque<>();

        Scripted(String... bodies) {
            script.addAll(java.util.List.of(bodies));
        }

        @Override
        public String postJson(String url, String bearerToken, String jsonBody, Duration timeout) {
            calls++;
            return script.size() > 1 ? script.poll() : script.peek();
        }
    }

    private static AiProperties props() {
        AiProperties p = new AiProperties();
        p.setApiKey("unit-test-key");
        p.setModel("gpt-test");
        p.setMaxRetries(0);
        p.setRetryBaseMs(1);
        p.setTimeout(Duration.ofSeconds(3));
        p.setCacheTtlSeconds(120);
        p.setBreakerThreshold(50);
        return p;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> byLane(LlmClient client) {
        Map<String, Object> health = client.health();
        Map<String, Object> upstream = (Map<String, Object>) health.get("upstreamUsage");
        assertNotNull(upstream, "health() 里没有 upstreamUsage 这一段");
        Map<String, Object> lanes = (Map<String, Object>) upstream.get("byLane");
        assertNotNull(lanes, "upstreamUsage 里没有 byLane —— 分车道那本账没装配");
        return lanes;
    }

    @Test
    void 两条车道各记各的prompt与cached读数() {
        Scripted transport = new Scripted(
                usageResponse("A", 1000, 900),
                usageResponse("B", 500, 100));
        LlmClient client = new LlmClient(props(), transport, MAPPER);

        client.complete("系统提示甲", "问题甲", LlmClient.CacheKeys.ADVISOR);
        client.complete("系统提示乙", "问题乙", LlmClient.CacheKeys.ORACLE);

        Map<String, Object> lanes = byLane(client);
        assertEquals(2, lanes.size(), "两条 lane 应当各占一桶：" + lanes.keySet());

        Map<String, Object> advisor = (Map<String, Object>) lanes.get(LlmClient.CacheKeys.ADVISOR);
        assertEquals(1L, advisor.get("calls"));
        assertEquals(1000L, advisor.get("promptTokens"));
        assertEquals(900L, advisor.get("cachedTokens"));
        assertEquals(0.9, (double) advisor.get("hitRatio"), 1e-9);

        Map<String, Object> oracle = (Map<String, Object>) lanes.get(LlmClient.CacheKeys.ORACLE);
        assertEquals(500L, oracle.get("promptTokens"));
        assertEquals(0.2, (double) oracle.get("hitRatio"), 1e-9);

        // 进程级总账仍在（老消费方读它），且等于两桶之和 —— 不是被替换掉了。
        assertEquals(1500L, ((Map<String, Object>) client.health().get("upstreamUsage")).get("promptTokens"));
    }

    @Test
    void 摘要缓存命中记到提问那一条车道头上() {
        Scripted transport = new Scripted(usageResponse("同一答案", 1000, 900));
        LlmClient client = new LlmClient(props(), transport, MAPPER);

        client.complete("系统", "同一问", LlmClient.CacheKeys.GUIDE);
        LlmClient.Answer second = client.complete("系统", "同一问", LlmClient.CacheKeys.GUIDE);

        assertTrue(second.cached(), "第二次同问应当走本地摘要缓存，这条腿的前提就没搭对");
        Map<String, Object> guide = (Map<String, Object>) byLane(client).get(LlmClient.CacheKeys.GUIDE);
        assertEquals(1L, guide.get("calls"), "命中本地缓存不该再花一次上游钱");
        assertEquals(1L, guide.get("localHits"));
        assertEquals(1L, guide.get("localMisses"));
    }

    @Test
    void 空跑时byLane是空的这门不是恒绿() {
        LlmClient client = new LlmClient(props(), new Scripted(usageResponse("没人问", 1, 1)), MAPPER);
        assertTrue(byLane(client).isEmpty(), "一次调用都没有，却已经有桶，说明这本账不是现算的");
    }

    @Test
    void 分车道快照里不许出现玩家内容与密钥() {
        Scripted transport = new Scripted(usageResponse("答案", 1000, 900));
        LlmClient client = new LlmClient(props(), transport, MAPPER);
        String 玩家输入 = "我卡在灰白森林第七个篝火_玩家原文标记";
        client.complete("系统提示", 玩家输入, LlmClient.CacheKeys.ADVISOR);

        String snapshot = String.valueOf(client.health());
        assertFalse(snapshot.contains(玩家输入), "健康快照里出现了玩家原文：" + snapshot);
        assertFalse(snapshot.contains("unit-test-key"), "健康快照里出现了密钥");
        assertFalse(snapshot.contains("答案"), "健康快照里出现了回答正文");
        assertTrue(snapshot.contains(LlmClient.CacheKeys.ADVISOR), "桶名（公开命名空间）应当在，否则这门量不到东西");
    }
}
