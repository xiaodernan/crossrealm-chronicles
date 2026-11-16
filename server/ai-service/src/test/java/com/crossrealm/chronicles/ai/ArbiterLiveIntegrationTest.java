package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * W-Z288：烬灯回信**真实上游**联调（W-Z288 的真 LLM 路径）。
 * 只有进程里存在 LLM_API_KEY 时启用 —— CI 默认零外呼、零花费。
 * 本地 `source .env` 后加 Clash 代理跑：
 *   set -a; . ./.env; set +a
 *   mvn -o -pl server/ai-service test -Dtest=ArbiterLiveIntegrationTest \
 *     -DargLine="-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897"
 */
@EnabledIfEnvironmentVariable(named = "LLM_API_KEY", matches = ".+")
class ArbiterLiveIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void 燼灯记录者写出一封可以解析的短信_且第二回命中本地缓存() throws Exception {
        AiProperties p = new AiProperties();
        p.setApiKey(System.getenv("LLM_API_KEY"));
        String base = System.getenv("LLM_BASE_URL");
        if (base != null && !base.isBlank()) p.setBaseUrl(base);
        String model = System.getenv("LLM_MODEL");
        if (model != null && !model.isBlank()) p.setModel(model);
        p.setTimeout(Duration.ofSeconds(90));
        p.setMaxRetries(1);
        p.setRetryBaseMs(200);

        LlmClient client = new LlmClient(p, new HttpLlmTransport(), MAPPER);

        ClientResult result = completeForArbiter(client, MAPPER);
        assertNotNull(result.raw);
        assertFalse(result.raw.isBlank(), "烬灯回信必须返回非空内容");

        // 协议落地的硬信号：返回里至少能抓到 title/epilogue 的 JSON 骨架（真模型每天都在变，prompt 协议是唯一的锚）
        String lowered = result.raw.toLowerCase(java.util.Locale.ROOT);
        assertTrue(lowered.contains("{"), "应返回 JSON 对象，实际：" + abbreviate(result.raw));
        assertTrue(lowered.contains("title"), "应包含 title 字段，实际：" + abbreviate(result.raw));
        assertTrue(lowered.contains("epilogue"), "应包含 epilogue 字段，实际：" + abbreviate(result.raw));

        // 第二回：同 choice+stats+SYSTEM 必须命中本地摘要缓存——上游零额外调用
        long before = (long) client.health().get("upstreamCalls");
        ClientResult second = completeForArbiter(client, MAPPER);
        assertTrue(second.cached, "第二回同 prompt 必须命中摘要缓存");
        assertEquals(before, ((Number) client.health().get("upstreamCalls")).longValue());
    }

    private static String abbreviate(String s) {
        return s.length() <= 200 ? s : s.substring(0, 200) + "…";
    }

    private static ClientResult completeForArbiter(LlmClient client, ObjectMapper mapper) {
        try {
            ArbiterController controller = new ArbiterController(client);
            ArbiterController.ArbiterRequest req = new ArbiterController.ArbiterRequest(
                    "keep", "zh",
                    "{\"echoes\":110,\"dungeons\":4,\"discoveries\":312,\"decisions\":9,\"level\":18,\"killsTotal\":840}",
                    "");
            Map<String, Object> body = controller.arbiter(req, "trace-arbiter-001");
            return new ClientResult((String) body.get("raw"), body.get("cached") == Boolean.TRUE);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private record ClientResult(String raw, boolean cached) {}
}
