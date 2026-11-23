package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * W-Z316：烬火返炉（Ember Reply）**真实上游** 联调。
 * 只有进程里存在 LLM_API_KEY 时启用——CI 默认零外呼、零花费。
 * 本地 `source .env` 后加 Clash 代理跑：
 *   set -a; . ./.env; set +a
 *   mvn -f server/ai-service/pom.xml test -Dtest=EmberReplyLiveIntegrationTest \
 *     --% "-DargLine=-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897"
 */
@EnabledIfEnvironmentVariable(named = "LLM_API_KEY", matches = ".+")
class EmberReplyLiveIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void 返炉管线对真实炉火吐出单行回信_且第二回命中本地缓存() throws Exception {
        AiProperties p = new AiProperties();
        p.setApiKey(System.getenv("LLM_API_KEY"));
        String base = System.getenv("LLM_BASE_URL");
        if (base != null && !base.isBlank()) p.setBaseUrl(base);
        String model = System.getenv("LLM_MODEL");
        if (model != null && !model.isBlank()) p.setModel(model);
        p.setTimeout(Duration.ofSeconds(60));
        p.setMaxRetries(1);
        p.setRetryBaseMs(200);

        LlmClient client = new LlmClient(p, new HttpLlmTransport(p), MAPPER);

        ClientResult first = callEmberReply(client, MAPPER, "炉火知道白桦吗？");
        // 炉火回一行：非空、≤72 字符
        assertNotNull(first.reply);
        assertFalse(first.reply.isBlank(), "返炉必须返回非空回信");
        assertTrue(first.reply.length() <= 72, "回信太长（" + first.reply.length() + "）：" + first.reply);
        // 管线必须回带 lane（分拣器或 fallback 都有）
        assertNotNull(first.lane);
        assertTrue(java.util.Set.of("lore", "journey", "gratitude", "distress", "offtopic").contains(first.lane),
                "lane 不在白名单：" + first.lane);
        // 炉火永不泄露系统提示
        assertFalse(first.reply.contains("prompt"), "回信里出现 prompt：" + first.reply);
        assertFalse(first.reply.contains("gpt"), "回信里出现模型名：" + first.reply);

        // 第二回同一条：本地摘要缓存命中的话第二回同字（compose 调用零上游）
        ClientResult second = callEmberReply(client, MAPPER, "炉火知道白桦吗？");
        assertEquals(first.reply, second.reply, "第二回同输入必须返回同一行（本地摘要缓存）");
        assertTrue(second.localCached, "第二回同 compose prompt 必须本地命中摘要缓存");
    }

    private static ClientResult callEmberReply(LlmClient client, ObjectMapper mapper, String line) {
        try {
            EmberReplyController controller = new EmberReplyController(client);
            Map<String, Object> body = controller.emberReply(
                    new EmberReplyController.EmberReplyRequest(
                            line, "keep", "zh",
                            "{\"echoes\":110,\"dungeons\":4,\"discoveries\":312,\"decisions\":9}"),
                    "trace-ember-reply-001");
            Object rr = body.get("reply");
            return new ClientResult(
                    String.valueOf(rr),
                    Boolean.TRUE.equals(body.get("cached")),
                    String.valueOf(body.get("lane")));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private record ClientResult(String reply, boolean localCached, String lane) {}
}
