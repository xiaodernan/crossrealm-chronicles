package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 真实联调：验证「稳定前缀 + 流式」能命中上游 prompt-cache。
 *
 * <p>仅当显式打开 {@code -Dai.live.test=true} 且环境变量 {@code LLM_API_KEY} 存在时才运行，
 * 默认在 CI / 普通构建中跳过，不会消耗额度也不会因无网络而失败。
 *
 * <p>关键断言：对同一个稳定（system+user）请求连续发两次，第二次的 {@code cached_tokens}
 * 必须显著大于第一次（第一次是冷启动，前缀尚未进缓存）。这直接证明「扩展稳定 system 提示 +
 * 始终流式」这一修复让上游缓存真正生效，从而提高缓存命中率与 token 利用效率。
 */
@EnabledIfSystemProperty(named = "ai.live.test", matches = "true")
class PromptCacheLiveTest {

    private static final Logger LOG = LoggerFactory.getLogger(PromptCacheLiveTest.class);
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void repeatedStablePrefixHitsUpstreamCache() throws Exception {
        String apiKey = System.getenv("LLM_API_KEY");
        assertNotNull(apiKey, "LLM_API_KEY env required for live test");
        String baseUrl = System.getenv().getOrDefault("LLM_BASE_URL", "https://wkapi.pro/v1");
        String model = System.getenv().getOrDefault("LLM_MODEL", "gpt-6-sol");

        String system = new String(getClass().getResourceAsStream("/ai/system-prompt.txt")
                .readAllBytes(), StandardCharsets.UTF_8).trim();
        String question = "什么是母题?请简短回答。";

        HttpLlmTransport transport = new HttpLlmTransport();
        LlmTransport.UpstreamReply first = call(transport, baseUrl, apiKey, model, system, question);
        Thread.sleep(1500);
        LlmTransport.UpstreamReply second = call(transport, baseUrl, apiKey, model, system, question);

        LOG.info("LIVE cache first  prompt={} cached={}", first.promptTokens(), first.cachedTokens());
        LOG.info("LIVE cache second prompt={} cached={}", second.promptTokens(), second.cachedTokens());

        assertNotNull(first.promptTokens(), "first call must return prompt tokens");
        assertNotNull(second.promptTokens(), "second call must return prompt tokens");
        assertTrue(second.cachedTokens() != null && second.cachedTokens() > 0,
                "second call should hit upstream prompt cache, cached=" + second.cachedTokens());
        if (first.cachedTokens() != null) {
            assertTrue(second.cachedTokens() > first.cachedTokens(),
                    "second cached should exceed first (cold start): first=" + first.cachedTokens()
                            + " second=" + second.cachedTokens());
        }
    }

    private LlmTransport.UpstreamReply call(HttpLlmTransport t, String baseUrl, String key,
                                            String model, String system, String question) throws Exception {
        Map<String, Object> systemMsg = Map.of("role", "system", "content", system,
                "cache_control", Map.of("type", "ephemeral"));
        Map<String, Object> userMsg = Map.of("role", "user", "content", question);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("messages", List.of(systemMsg, userMsg));
        body.put("max_tokens", 160);
        body.put("temperature", 0.7);
        body.put("stream", Boolean.TRUE);
        body.put("stream_options", Map.of("include_usage", Boolean.TRUE));
        String url = baseUrl.replaceAll("/+$", "") + "/chat/completions";
        return t.postJsonWithUsage(url, key, mapper.writeValueAsString(body), Duration.ofSeconds(30));
    }
}
