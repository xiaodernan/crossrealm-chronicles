package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * W-Z289：余火回响**真实上游**联调（Boss 倒下那一刻的真 LLM 路径）。
 * 只有进程里存在 LLM_API_KEY 时启用 —— CI 默认零外呼、零花费。
 * 本地 `source .env` 后加 Clash 代理跑：
 *   set -a; . ./.env; set +a
 *   mvn -f server/ai-service/pom.xml test -Dtest=BossVerseLiveIntegrationTest \
 *     --% "-DargLine=-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897"
 */
@EnabledIfEnvironmentVariable(named = "LLM_API_KEY", matches = ".+")
class BossVerseLiveIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void 烬灯记录者为Boss说一句可以落字幕的话_且第二回命中本地缓存() throws Exception {
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

        ClientResult result = completeForBossVerse(client, MAPPER);
        assertNotNull(result.verse);
        assertFalse(result.verse.isBlank(), "余火回响必须返回非空内容");
        // 余火回响的尺度收箍在 72 字符以内——比 echo-hint 更松，给出口
        assertTrue(result.verse.length() <= 72, "回响太长（" + result.verse.length() + "）：" + result.verse);
        // 不会带引号（prompt 禁止）
        assertFalse(result.verse.contains("\""), "回响带了英文引号：" + result.verse);

        // 第二回：同 prompt 必须命中本地摘要缓存——上游零额外调用
        long before = (long) client.health().get("upstreamCalls");
        ClientResult second = completeForBossVerse(client, MAPPER);
        assertTrue(second.cached, "第二回同 prompt 必须命中摘要缓存");
        assertEquals(before, ((Number) client.health().get("upstreamCalls")).longValue());
    }

    private static ClientResult completeForBossVerse(LlmClient client, ObjectMapper mapper) {
        try {
            BossVerseController controller = new BossVerseController(client);
            BossVerseController.BossVerseRequest req = new BossVerseController.BossVerseRequest(
                    "shadow-warden", "影界守护者", "zh", "3", "1", "12", "灰白森林");
            Map<String, Object> body = controller.bossVerse(req, "trace-boss-verse-001");
            return new ClientResult((String) body.get("verse"), body.get("cached") == Boolean.TRUE);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private record ClientResult(String verse, boolean cached) {}
}
