package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * W-Z15：回声灯**真实上游**联调（W-X22 回声 hint 的真 LLM 路径）。
 * 只有进程里存在 LLM_API_KEY 时启用 —— CI 默认零外呼、零花费。
 * 本地 `source .env` 后跑这个就是一整条链路的实弹验证：
 *   TLS → 鉴权 → SSE 合拢 → extractAnswer → 2nd call 必须 local cache 命中。
 *
 * <pre>
 *   set -a; . ./.env; set +a
 *   mvn -o -pl ai-service test -Dtest=EchoHintLiveIntegrationTest
 * </pre>
 */
@EnabledIfEnvironmentVariable(named = "LLM_API_KEY", matches = ".+")
class EchoHintLiveIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void 回声先知给出一句短句() throws Exception {
        AiProperties p = new AiProperties();
        p.setApiKey(System.getenv("LLM_API_KEY"));
        String base = System.getenv("LLM_BASE_URL");
        if (base != null && !base.isBlank()) p.setBaseUrl(base);
        String model = System.getenv("LLM_MODEL");
        if (model != null && !model.isBlank()) p.setModel(model);
        p.setTimeout(Duration.ofSeconds(60));
        p.setMaxRetries(1);
        p.setRetryBaseMs(200);

        LlmClient client = new LlmClient(p, new HttpLlmTransport(), MAPPER);

        // 这里只断言“真实上游给出非空短句 + 第二回全同缓存”，不枚举内容 —— 先知口吻允许漂移
        ClientResult result = completeForHint(client, MAPPER);
        assertNotNull(result.hint);
        assertFalse(result.hint.isBlank(), "echo-hint 必须返回非空内容");
        assertTrue(result.hint.length() <= 60, "先知口吻不超过 45 字，给到 60 留有出口——现在收到:" + result.hint.length());

        // 第二回：同 question+SYSTEM 必须命中缓存——上游零额外调用
        long before = (long) client.health().get("upstreamCalls");
        ClientResult second = completeForHint(client, MAPPER);
        assertTrue(second.cached, "第二回同 prompt 必须命中摘要缓存");
        assertEquals(before, ((Number) client.health().get("upstreamCalls")).longValue());
    }

    private static ClientResult completeForHint(LlmClient client, ObjectMapper mapper) {
        try {
            com.crossrealm.chronicles.ai.EchoHintController controller = new EchoHintController(client);
            com.crossrealm.chronicles.ai.EchoHintController.EchoRequest req =
                    new com.crossrealm.chronicles.ai.EchoHintController.EchoRequest(
                            "middle-earth", "至尊石环", "戒指已碎，石环仍在。one ring to bind them all…");
            Map<String, Object> body = controller.echoHint(req, "trace-test-001");
            return new ClientResult((String) body.get("hint"), body.get("cached") == Boolean.TRUE);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private record ClientResult(String hint, boolean cached) {}
}
