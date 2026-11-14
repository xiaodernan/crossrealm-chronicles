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
        when(client.complete(anyString(), anyString()))
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
    void health_reportsReadyWithBm25Probe() throws Exception {
        mvc.perform(get("/api/ai/lore/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ready").value(true))
                .andExpect(jsonPath("$.bm25Probe").value(1));
    }
}
