package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-Z519：API 因成本/用量关闭后的离线口径 —— 密钥保留，但上游一个字节都不打。
 *
 * <p>为什么量"调用次数"而不只是"抛异常"：抛异常只证明结果对，不能证明没偷偷打过网络。
 * 这里用计数 transport 把"零上游调用"钉住——这正是成本控制的要害。
 */
class LlmOfflineTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 计数 transport：一旦被调用就记一笔；真的回了答案也只是诱饵，不该被走到。 */
    static final class CountingTransport implements LlmTransport {
        int calls;

        @Override
        public String postJson(String url, String bearerToken, String jsonBody, Duration timeout) {
            calls++;
            return "{\"choices\":[{\"message\":{\"content\":\"不该被调用\"}}]}";
        }
    }

    private static AiProperties props() {
        AiProperties p = new AiProperties();
        p.setApiKey("still-present-key"); // 密钥故意留着：关的是开关，不是密钥
        p.setLlmEnabled(false);
        p.setMaxRetries(0);
        p.setRetryBaseMs(1);
        return p;
    }

    @Test
    void 开关关掉即视为未配置即使密钥还在() {
        CountingTransport t = new CountingTransport();
        LlmClient c = new LlmClient(props(), t, MAPPER);

        assertFalse(c.isConfigured(), "总开关关掉后不能再声称 configured");
        assertEquals(0, t.calls);
        Map<String, Object> health = c.health();
        assertEquals(false, health.get("configured"));
        assertEquals(false, health.get("llmEnabled"), "运维要能分清「被关掉」与「没填 key」");
    }

    @Test
    void 顾问_典籍_深潜_启动热身都不打上游() {
        CountingTransport t = new CountingTransport();
        LlmClient c = new LlmClient(props(), t, MAPPER);

        AdvisorUnavailableException e = assertThrows(AdvisorUnavailableException.class,
                () -> c.ask("随便问一句", Map.of("zone", "hub")));
        assertEquals("llm-disabled", e.getReason());
        assertThrows(AdvisorUnavailableException.class,
                () -> c.complete("sys", "user", LlmClient.CacheKeys.ORACLE_DEEP));
        c.warmupUpstream(); // 启动热身也必须闭嘴

        assertEquals(0, t.calls, "关掉开关后一个上游请求都不该发生");
    }

    @Test
    void 开关打开即恢复_密钥不用重填() {
        AiProperties p = props();
        p.setLlmEnabled(true);
        CountingTransport t = new CountingTransport();
        LlmClient c = new LlmClient(p, t, MAPPER);

        assertTrue(c.isConfigured(), "API 恢复后把开关翻回来就该可用，不必重新填 key");
        assertEquals(0, t.calls, "判定与装配本身不该打网络");
        assertEquals(true, c.health().get("llmEnabled"));
    }
}
