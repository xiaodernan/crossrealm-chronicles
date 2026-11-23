package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 真实联调：生产 LlmClient 的 Advisor 冻结前缀连续两轮达到 90% 上游命中。
 *
 * <p>仅当显式打开 {@code -Dai.live.test=true} 且环境变量 {@code LLM_API_KEY} 存在时才运行。
 * 请求形状、缓存桶与用量记账全部走生产代码，不再手抄一份容易漂移的 HTTP body。
 * 首发允许冷启；后两次各自按车道增量计算，缺 cached_tokens 也算失败。
 */
@EnabledIfSystemProperty(named = "ai.live.test", matches = "true")
class PromptCacheLiveTest {

    private static final Logger LOG = LoggerFactory.getLogger(PromptCacheLiveTest.class);

    static boolean warmHitPasses(long promptDelta, long cachedDelta) {
        return promptDelta > 0 && cachedDelta >= 0 && cachedDelta <= promptDelta
                && cachedDelta * 100 >= promptDelta * 90;
    }

    @Test
    void repeatedStablePrefixHitsUpstreamCache() throws Exception {
        String apiKey = System.getenv("LLM_API_KEY");
        assertNotNull(apiKey, "LLM_API_KEY env required for live test");
        AiProperties props = new AiProperties();
        props.setApiKey(apiKey);
        props.setBaseUrl(System.getenv().getOrDefault("LLM_BASE_URL", "https://api.aizzz.xyz/v1"));
        props.setModel(System.getenv().getOrDefault("LLM_MODEL", "gpt-6.2-sol"));
        props.setMaxRetries(0);
        props.setTimeout(Duration.ofSeconds(30));
        props.setCacheTtlSeconds(120);
        props.setBreakerThreshold(50);
        props.setLlmEnabled(true);

        String system;
        try (InputStream in = getClass().getResourceAsStream("/ai/system-prompt.txt")) {
            assertNotNull(in, "missing Advisor system prompt");
            system = new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
        }
        LlmClient client = new LlmClient(props, new HttpLlmTransport(), new ObjectMapper());
        long previousPrompt = 0;
        long previousCached = 0;
        for (int i = 1; i <= 3; i++) {
            LlmClient.Answer answer = client.complete(system,
                    "玩家提问：什么是母题?请简短回答 #" + i, LlmClient.CacheKeys.ADVISOR);
            assertFalse(answer.cached(), "不同问题必须真打上游，不能拿本地摘要缓存冒充上游命中");
            assertFalse(answer.answer().isBlank(), "上游必须返回非空回答");

            Map<String, Object> upstream = upstreamUsage(client);
            Map<String, Object> lane = advisorLane(upstream);
            Map<?, ?> last = (Map<?, ?>) upstream.get("last");
            long prompt = ((Number) lane.get("promptTokens")).longValue();
            long cached = ((Number) lane.get("cachedTokens")).longValue();
            long promptDelta = prompt - previousPrompt;
            long cachedDelta = last != null && last.containsKey("cachedTokens")
                    ? cached - previousCached : -1;
            LOG.info("LIVE cache call={} promptDelta={} cachedDelta={} ratio={}",
                    i, promptDelta, cachedDelta, promptDelta > 0 ? cachedDelta * 100.0 / promptDelta : 0.0);
            if (i > 1) {
                assertTrue(warmHitPasses(promptDelta, cachedDelta),
                        "warm call " + i + " below 90%: promptDelta=" + promptDelta
                                + " cachedDelta=" + cachedDelta + "（缺用量按 -1 计）");
            }
            previousPrompt = prompt;
            previousCached = cached;
            if (i < 3) Thread.sleep(1500);
        }
        assertEquals(3, ((Number) advisorLane(upstreamUsage(client)).get("calls")).intValue(),
                "三次不同问题必须记成三次真实上游调用");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> upstreamUsage(LlmClient client) {
        Map<String, Object> upstream = (Map<String, Object>) client.health().get("upstreamUsage");
        assertNotNull(upstream, "upstream usage missing from health snapshot");
        return upstream;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> advisorLane(Map<String, Object> upstream) {
        Map<String, Map<String, Object>> lanes = (Map<String, Map<String, Object>>) upstream.get("byLane");
        Map<String, Object> lane = lanes.get(LlmClient.CacheKeys.ADVISOR);
        assertNotNull(lane, "Advisor lane missing from health snapshot");
        return lane;
    }
}

class PromptCacheCriteriaTest {

    @Test
    void 热命中判据要求两轮各自达到九成且用量完整() {
        assertTrue(PromptCacheLiveTest.warmHitPasses(1000, 900));
        assertTrue(PromptCacheLiveTest.warmHitPasses(1000, 1000));
        assertFalse(PromptCacheLiveTest.warmHitPasses(1000, 899));
        assertFalse(PromptCacheLiveTest.warmHitPasses(0, 0));
        assertFalse(PromptCacheLiveTest.warmHitPasses(1000, -1));
        assertFalse(PromptCacheLiveTest.warmHitPasses(1000, 1001));
    }
}
