package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** W-Y1：玩家侧 REST 契约。standalone MockMvc 手工挂 validator，否则 @Valid 全是摆设。 */
class AiControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private LlmClient client;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        client = mock(LlmClient.class);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new AiController(client))
                .setValidator(validator)
                .build();
    }

    private static String request(String question, Map<String, Object> context) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", question);
        if (context != null) body.put("context", context);
        return MAPPER.writeValueAsString(body);
    }

    @Test
    void 正常提问返回四段契约() throws Exception {
        when(client.ask(anyString(), org.mockito.Mockito.<Map<String, Object>>any()))
                .thenReturn(new LlmClient.Answer("往有灯的地方走", "gpt-6-sol", false, 42L));

        mvc.perform(post("/api/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request("该往哪走？", Map.of("zone", "hub"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answer").value("往有灯的地方走"))
                .andExpect(jsonPath("$.model").value("gpt-6-sol"))
                .andExpect(jsonPath("$.cached").value(false))
                .andExpect(jsonPath("$.latencyMs").value(42));
    }

    @Test
    void 空问题与超长问题都拒绝() throws Exception {
        mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content(request("", null)))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content(request("x".repeat(401), null)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void 上下文超过八条拒绝() throws Exception {
        Map<String, Object> context = new LinkedHashMap<>();
        for (int i = 0; i < 9; i++) context.put("k" + i, "v" + i);

        mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content(request("问题", context)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void 上游不可用时是结构化五零三而不是五百() throws Exception {
        when(client.ask(anyString(), org.mockito.Mockito.<Map<String, Object>>any()))
                .thenThrow(new AdvisorUnavailableException("circuit-open"));

        mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content(request("还在吗", null)))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("advisor-unavailable"))
                .andExpect(jsonPath("$.reason").value("circuit-open"))
                .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void 健康快照是字段白名单且绝不回显密钥() throws Exception {
        AiProperties p = new AiProperties();
        p.setApiKey("super-secret-key");
        LlmClient real = new LlmClient(p,
                (url, key, body, timeout) -> LlmClientTest.response("好"),
                MAPPER);
        MockMvc realMvc = MockMvcBuilders.standaloneSetup(new AiController(real)).build();

        String body = realMvc.perform(get("/api/ai/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configured").value(true))
                .andExpect(jsonPath("$.circuit").value("CLOSED"))
                .andExpect(jsonPath("$.cache.hits").isNumber())
                .andReturn().getResponse().getContentAsString();

        assertFalse(body.contains("super-secret-key"));
        assertFalse(body.contains("apiKey"));
        assertFalse(body.contains("baseUrl"));
        assertFalse(body.contains("wkapi.pro"));
    }

    @Test
    void 模型输出原样返回转义由前端负责() throws Exception {
        String raw = "石阶上有 <script> 三个字";
        when(client.ask(anyString(), org.mockito.Mockito.<Map<String, Object>>any()))
                .thenReturn(new LlmClient.Answer(raw, "gpt-6-sol", false, 1L));

        mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content(request("看见了什么", null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answer").value(raw));
    }
}
