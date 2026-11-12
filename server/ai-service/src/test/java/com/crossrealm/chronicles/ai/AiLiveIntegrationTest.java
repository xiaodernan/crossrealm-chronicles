package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-Y1：**真实上游**联调。
 *
 * <p>只有进程里存在 LLM_API_KEY 时才启用 —— CI 默认零外呼、零花费；
 * 本地 `source .env` 之后跑它，就是一次端到端的真实验证（含 TLS、鉴权、
 * 请求形状、响应解析、超时与缓存路径）。
 *
 * <pre>
 *   set -a; . ./.env; set +a
 *   mvn -o -pl ai-service test -Dtest=AiLiveIntegrationTest
 * </pre>
 */
@EnabledIfEnvironmentVariable(named = "LLM_API_KEY", matches = ".+")
class AiLiveIntegrationTest {

    @Test
    void 真实大模型回答一句顾问口吻的话() {
        AiProperties p = new AiProperties();
        p.setApiKey(System.getenv("LLM_API_KEY"));
        String base = System.getenv("LLM_BASE_URL");
        if (base != null && !base.isBlank()) p.setBaseUrl(base);
        String model = System.getenv("LLM_MODEL");
        if (model != null && !model.isBlank()) p.setModel(model);
        p.setTimeout(Duration.ofSeconds(60));
        p.setMaxRetries(1);
        p.setRetryBaseMs(200);

        LlmClient client = new LlmClient(p, new HttpLlmTransport(), new ObjectMapper());
        LlmClient.Answer answer = client.ask(
                "篝火快灭了，下一步该往哪里走？",
                Map.of("zone", "hub", "season", "ember"));

        assertNotNull(answer.answer());
        assertFalse(answer.answer().isBlank(), "真实上游必须给出非空内容");
        assertTrue(answer.answer().length() < 800, "顾问被要求 ≤120 字，明显超长说明系统提示没生效");
        assertFalse(answer.answer().contains("sk-"), "回答里不许出现任何密钥片段");
        assertFalse(answer.cached());
        assertEqualsModel(p, answer);

        // 同一个问题再问一次：缓存必须命中，且不再产生第二次上游调用
        long before = (long) client.health().get("upstreamCalls");
        LlmClient.Answer again = client.ask(
                "篝火快灭了，下一步该往哪里走？",
                Map.of("zone", "hub", "season", "ember"));
        assertTrue(again.cached());
        assertEquals(before, ((Number) client.health().get("upstreamCalls")).longValue());

        System.out.println("[W-Y1 live] model=" + answer.model()
                + " latency=" + answer.latencyMs() + "ms answer=" + answer.answer());
    }

    private static void assertEqualsModel(AiProperties p, LlmClient.Answer a) {
        assertTrue(p.getModel().equals(a.model()), "响应里带的模型名必须与配置一致");
    }
}
