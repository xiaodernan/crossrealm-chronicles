package com.crossrealm.chronicles.ai.lore;

import com.crossrealm.chronicles.ai.AiProperties;
import com.crossrealm.chronicles.ai.HttpLlmTransport;
import com.crossrealm.chronicles.ai.LlmClient;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-Z238：Lore Oracle 全链路**真实上游**联调（BM25 真检索 → 真 LlmClient → 原典引用式作答）。
 *
 * <p>与 {@code AiLiveIntegrationTest} / {@code EchoHintLiveIntegrationTest} 同一口径：
 * 只有进程里存在 LLM_API_KEY 时才启用 —— CI 默认零外呼、零花费；本机带 .env 实测，就是一次
 * 端到端验证（语料加载、BM25 召回、system 前缀作答、prompt_cache_key 复用）。</p>
 *
 * <pre>
 *   node scripts/_live-env.mjs 之后：
 *   mvn -o -pl ai-service test -Dtest=LoreOracleLiveIntegrationTest -DargLine="-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897"
 * </pre>
 */
@EnabledIfEnvironmentVariable(named = "LLM_API_KEY", matches = ".+")
class LoreOracleLiveIntegrationTest {

    private final Bm25Index index = new Bm25Index(new LoreCorpus());

    private LlmClient liveClient() {
        AiProperties p = new AiProperties();
        p.setApiKey(System.getenv("LLM_API_KEY"));
        String base = System.getenv("LLM_BASE_URL");
        if (base != null && !base.isBlank()) p.setBaseUrl(base);
        String model = System.getenv("LLM_MODEL");
        if (model != null && !model.isBlank()) p.setModel(model);
        p.setTimeout(Duration.ofSeconds(60));
        p.setMaxRetries(1);
        p.setRetryBaseMs(200);
        return new LlmClient(p, new HttpLlmTransport(), new com.fasterxml.jackson.databind.ObjectMapper());
    }

    @Test
    void oracleFullChainBm25RecallThenGroundedAnswer() {
        LoreOracleService oracle = new LoreOracleService(liveClient(), index);
        LoreOracleService.OracleResult r = oracle.answer("锚火是什么？", 4);

        assertTrue(r.ok(), "真实上游必须完成作答");
        assertNotNull(r.answer());
        assertFalse(r.answer().isBlank(), "答案不许空白");
        assertFalse(r.sources().isEmpty(), "原典命中时必须给出处");
        for (String s : r.sources()) {
            assertNotNull(s);
            assertFalse(s.isBlank());
        }
        assertNotNull(r.model());
        assertTrue(r.latencyMs() >= 0);

        System.out.println("[W-Z238 live] sources=" + r.sources()
                + " model=" + r.model() + " latency=" + r.latencyMs() + "ms\n" + r.answer());
    }

    @Test
    void oracleRealWorldPrototypeAnswersWithRefs() {
        // refs 卷（现实对照札记）只在「现实世界对应什么」类问题里被召回。
        // 这条问句几乎只会命中 refs（祭灶/Vesta/白桦/永恒火焰全是 refs 卷的专属 token），
        // 用它钉住 refs 入典后仍能被 BM25 检索到——Oracle 回答得诚实即可，不问输出具体措辞。
        LoreOracleService oracle = new LoreOracleService(liveClient(), index);
        LoreOracleService.OracleResult r = oracle.answer(
                "锚火在现实世界对应祭灶还是维斯塔？以及秋分的节气对照是什么？", 4);

        assertTrue(r.ok(), "真实上游必须完成作答");
        assertFalse(r.answer().isBlank());
        boolean refsHit = r.sources().stream().anyMatch(s -> s.startsWith("creative/refs/"));
        assertTrue(refsHit, "现实对照类问题必须召回 refs 卷出处，实际 sources=" + r.sources());

        System.out.println("[W-Z243 live] refs-question sources=" + r.sources()
                + " model=" + r.model() + " latency=" + r.latencyMs() + "ms\n" + r.answer());
    }

    @Test
    void oracleOutOfCorpusRefusesWithoutTokens() {
        // 语料是 101 卷双语锚火线 + 配套番外/词囊/剧本/OST。BM25 按单字切分，纯中文提问几乎
        // 总能召回一些token；要命中「此物未在典籍中」的拒答分支，问题的 token 必须**整个都不在语料里**——
        // ASCII 无义字符的确只会被检出 0 个 doc，于是走 0 召回分支，不经过 LLM、不花 token。
        LoreOracleService oracle = new LoreOracleService(liveClient(), index);
        LoreOracleService.OracleResult r = oracle.answer(
                "zxqjwop qkdjw zqwvjqmw rfjklw", 4);

        assertTrue(r.ok());
        assertTrue(r.sources().isEmpty(), "原典没有的问题不应给出处");
        assertTrue(r.answer().contains("此物未在典籍中"),
                "必须给出原典无此条目的诚实拒答，实际: " + r.answer());
        assertEquals(0L, r.latencyMs(), "BM25 空召回不应进入 LLM 调用");
    }
}
