package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * W-Z292：烬火答 **真实上游** 联调。
 * 只有进程里存在 LLM_API_KEY 时启用 —— CI 默认零外呼、零花费。
 * 本地 `source .env` 后加 Clash 代理跑：
 *   set -a; . ./.env; set +a
 *   mvn -f server/ai-service/pom.xml test -Dtest=KindleLetterLiveIntegrationTest \
 *     --% "-DargLine=-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897"
 */
@EnabledIfEnvironmentVariable(named = "LLM_API_KEY", matches = ".+")
class KindleLetterLiveIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void 炉火收到那一行并写回来_且第二回命中本地缓存() throws Exception {
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

        ClientResult result = completeForKindleLetter(client, MAPPER);
        assertNotNull(result.reply);
        assertFalse(result.reply.isBlank(), "烬火答必须返回非空回信");
        // 单行、≤72 字符、不带引号（live 断言尺度给出口，比端点契约宽松）
        assertTrue(result.reply.length() <= 72, "回信太长（" + result.reply.length() + "）：" + result.reply);
        assertFalse(result.reply.contains("\""), "回信带了英文引号：" + result.reply);

        // 第二回：同 line+choice+SYSTEM 必须命中本地摘要缓存——上游零额外调用
        long before = (long) client.health().get("upstreamCalls");
        ClientResult second = completeForKindleLetter(client, MAPPER);
        assertTrue(second.cached, "第二回同 prompt 必须命中摘要缓存");
        assertEquals(before, ((Number) client.health().get("upstreamCalls")).longValue());
    }

    private static ClientResult completeForKindleLetter(LlmClient client, ObjectMapper mapper) {
        try {
            KindleLetterController controller = new KindleLetterController(client);
            KindleLetterController.KindleLetterRequest req = new KindleLetterController.KindleLetterRequest(
                    "我想问问火，我的这一趟值不值得", "keep", "zh",
                    "{\"echoes\":110,\"dungeons\":4,\"discoveries\":312,\"decisions\":9,\"level\":18,\"killsTotal\":840}");
            Map<String, Object> body = controller.kindleLetter(req, "trace-kindle-letter-001");
            return new ClientResult((String) body.get("reply"), body.get("cached") == Boolean.TRUE);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private record ClientResult(String reply, boolean cached) {}
}
