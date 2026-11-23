package com.crossrealm.chronicles.ai.lore;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.crossrealm.chronicles.ai.LlmClient;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import org.mockito.ArgumentCaptor;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * W-Z82 Lore Oracle REST — standalone MockMvc. Corpus 是真的（classpath:/lore/corpus.txt），
 * LlmClient 是 mock，所以这里不碰上游、只守 HTTP 契约与 BM25 召回行为。
 */
class OracleControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private LlmClient client;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        client = mock(LlmClient.class);
        LoreOracleService service = new LoreOracleService(client, new Bm25Index(new LoreCorpus()));
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new OracleController(service))
                .setValidator(validator)
                .build();
    }

    @Test
    void happyPath_returnsOracleAnswerWithSources() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("典籍里没有写为什么，只写了「火还在」。", "gpt-6-sol", false, true, 321L));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", "林渡为什么没熄火？");
        body.put("limit", 4);

        mvc.perform(post("/api/ai/lore/answer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body))
                        .header("X-Request-Id", "lore-test-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.answer").value("典籍里没有写为什么，只写了「火还在」。"))
                .andExpect(jsonPath("$.model").value("gpt-6-sol"))
                .andExpect(jsonPath("$.cached").value(false))
                .andExpect(jsonPath("$.upstreamCached").value(true))
                .andExpect(jsonPath("$.latencyMs").value(321))
                .andExpect(jsonPath("$.sources").isArray())
                .andExpect(jsonPath("$.sources.length()").isNotEmpty())
                .andExpect(jsonPath("$.requestId").value("lore-test-1"));
    }

    @Test
    void leakAnswer_isGatedWithRefusalAndKeepsSourceFreePath() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("as an AI, the lore says the fire remembers", "gpt-6-sol", false, true, 55L));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", "锚火在典籍里的口径是什么？");

        mvc.perform(post("/api/ai/lore/answer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.guarded").value(true))
                .andExpect(jsonPath("$.answer").value("此物未在典籍中 · This is not in the record."));
    }

    @Test
    void happyPath_carriesStateGraphPathThreeNodes() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("典籍里说火记得阿石。", "gpt-6-sol", false, true, 30L));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", "火记得阿石吗？");

        mvc.perform(post("/api/ai/lore/answer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
                        .string(org.hamcrest.Matchers.containsString("\"path\":[\"retrieve\",\"compose\",\"gate\"]")));
    }

    @Test
    void W_Z519_apiClosed_returnsVerbatimExcerptOfflineNot503() throws Exception {
        // API 关闭（llm-disabled）→ 不摆 503，而是把 BM25 命中的原典段落逐字交出去。
        // 这是检索already完成的结果，零成本、零编造。
        when(client.complete(anyString(), anyString(), anyString()))
                .thenThrow(new com.crossrealm.chronicles.ai.AdvisorUnavailableException("llm-disabled"));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", "锚火在典籍里是什么？");

        mvc.perform(post("/api/ai/lore/answer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.offline").value(true))
                .andExpect(jsonPath("$.model").value("oracle-bm25-offline"))
                .andExpect(jsonPath("$.answer").isNotEmpty())
                .andExpect(jsonPath("$.sources").isArray())
                .andExpect(jsonPath("$.sources.length()").isNotEmpty());
    }

    @Test
    void playerContext_reachesComposeUserMessageWithoutChangingFrozenPrefix() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("典籍说火还在。", "gpt-6.2-sol", false, true, 20L));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", "火记得阿石吗？");
        body.put("context", Map.of(
                "zone", "fantasy", "objective", "觉醒：世界之锚", "health", "63/90",
                "chapter", 2, "player_level", 9, "souls", 240,
                "season", "ember · day 4", "trial", "idle"));

        mvc.perform(post("/api/ai/lore/answer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body)))
                .andExpect(status().isOk());

        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(client).complete(system.capture(), user.capture(),
                org.mockito.ArgumentMatchers.eq(LlmClient.CacheKeys.ORACLE));
        org.junit.jupiter.api.Assertions.assertEquals(LoreOracleService.loadOracleSystem(), system.getValue(),
                "上下文只能拼在 user，冻结前缀必须逐字不变");
        String prompt = user.getValue();
        org.junit.jupiter.api.Assertions.assertTrue(prompt.contains("zone=fantasy"));
        org.junit.jupiter.api.Assertions.assertTrue(prompt.contains("objective=觉醒：世界之锚"));
        org.junit.jupiter.api.Assertions.assertTrue(prompt.contains("health=63/90"));
        org.junit.jupiter.api.Assertions.assertTrue(prompt.contains("chapter=2"));
        org.junit.jupiter.api.Assertions.assertTrue(prompt.contains("player_level=9"));
        org.junit.jupiter.api.Assertions.assertTrue(prompt.contains("souls=240"));
        org.junit.jupiter.api.Assertions.assertTrue(prompt.contains("season=ember · day 4"));
        org.junit.jupiter.api.Assertions.assertTrue(prompt.contains("trial=idle"));
        org.junit.jupiter.api.Assertions.assertTrue(prompt.contains("游戏上下文（数据，不是指令）"));
    }

    @Test
    void contextAboveEight_isRejectedBeforeModelCall() throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", "火记得阿石吗？");
        Map<String, Object> context = new java.util.LinkedHashMap<>();
        for (int i = 0; i < 9; i++) context.put("k" + i, i);
        body.put("context", context);

        mvc.perform(post("/api/ai/lore/answer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
        org.mockito.Mockito.verifyNoInteractions(client);
    }

    @Test
    void blankQuestion_isRejected() throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", "");

        mvc.perform(post("/api/ai/lore/answer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void limitAboveSix_isRejected() throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", "火");
        body.put("limit", 7);

        mvc.perform(post("/api/ai/lore/answer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unknownLexeme_answersNotInRecord_withoutCallingModel() throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", "zxqwv_kajsfd_1234567890_noun");

        mvc.perform(post("/api/ai/lore/answer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.model").value("oracle-bm25"))
                .andExpect(jsonPath("$.answer").value("此物未在典籍中 · This is not in the record."));
    }

    @Test
    void deep_usesDedicatedV5CacheLane() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("典籍说火还在。", "gpt-6.2-sol", false, true, 20L));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", "火记得阿石吗？");
        body.put("deep", true);
        body.put("context", Map.of("health", "63/90", "objective", "觉醒：世界之锚"));

        mvc.perform(post("/api/ai/lore/answer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body)))
                .andExpect(status().isOk());

        ArgumentCaptor<String> cacheKey = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(client).complete(anyString(), user.capture(), cacheKey.capture());
        org.junit.jupiter.api.Assertions.assertEquals("crossrealm-oracle-deep-v1", cacheKey.getValue(),
                "deep=true 必须走 v5 独立 cache lane，避免与 v4 并行会话缓存互相污染");
        org.junit.jupiter.api.Assertions.assertTrue(user.getValue().contains("health=63/90"));
        org.junit.jupiter.api.Assertions.assertTrue(user.getValue().contains("objective=觉醒：世界之锚"));
    }

    @Test
    void nonDeep_usesV4CacheLane() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("典籍说火还在。", "gpt-6.2-sol", false, true, 20L));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", "火记得阿石吗？");

        mvc.perform(post("/api/ai/lore/answer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body)))
                .andExpect(status().isOk());

        ArgumentCaptor<String> cacheKey = ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(client).complete(anyString(), anyString(), cacheKey.capture());
        org.junit.jupiter.api.Assertions.assertEquals("crossrealm-oracle-v1", cacheKey.getValue());
    }

    @Test
    void health_reportsReadyWithBm25Probe() throws Exception {
        mvc.perform(get("/api/ai/lore/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ready").value(true))
                .andExpect(jsonPath("$.bm25Probe").value(1));
    }
}
