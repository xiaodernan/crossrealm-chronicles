package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * W-Z340 端点契约：执笔人三档、故障不砸穿、字段越界必拒。
 */
class DeathEpitaphControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private LlmClient client;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        client = mock(LlmClient.class);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new DeathEpitaphController(client))
                .setValidator(validator)
                .build();
    }

    private static String body(String bossName, Integer attempts) throws Exception {
        return MAPPER.writeValueAsString(Map.of("bossName", bossName, "attempts", attempts));
    }

    @Test
    void 成功时返回一句执笔人的话() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("再摔两次，火就还你三分", "gpt-6.1-terra", false, false, 10L));

        mvc.perform(post("/api/ai/death-epitaph").contentType(MediaType.APPLICATION_JSON)
                        .content(body("影界守护者", 3)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.line").value("再摔两次，火就还你三分"))
                .andExpect(jsonPath("$.cached").value(false));
    }

    @Test
    void 人格提示为三档执笔人且不与其他lane共享缓存桶() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("", "gpt-6.1-terra", false, false, 1L));
        mvc.perform(post("/api/ai/death-epitaph").contentType(MediaType.APPLICATION_JSON)
                        .content(body("时线执政官", 8)))
                .andExpect(status().isOk());

        var systemCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        var keyCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(client).complete(systemCaptor.capture(), anyString(), keyCaptor.capture());
        org.junit.jupiter.api.Assertions.assertTrue(systemCaptor.getValue().contains("执笔人"));
        org.junit.jupiter.api.Assertions.assertFalse(systemCaptor.getValue().contains("回声先知"));
        org.junit.jupiter.api.Assertions.assertFalse(systemCaptor.getValue().contains("星轨顾问"));
        org.junit.jupiter.api.Assertions.assertEquals("crossrealm-death-epitaph-v1", keyCaptor.getValue());
    }

    @Test
    void 上游不可用时五零三而不是五() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenThrow(new AdvisorUnavailableException("circuit-open"));

        mvc.perform(post("/api/ai/death-epitaph").contentType(MediaType.APPLICATION_JSON)
                        .content(body("影界守护者", 3)))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("advisor-unavailable"))
                .andExpect(jsonPath("$.reason").value("circuit-open"));
    }

    @Test
    void 缺字段与越界都拒绝() throws Exception {
        mvc.perform(post("/api/ai/death-epitaph").contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/death-epitaph").contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(Map.of("bossName", "影界守护者"))))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/death-epitaph").contentType(MediaType.APPLICATION_JSON)
                        .content(body("影界守护者", 0)))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/death-epitaph").contentType(MediaType.APPLICATION_JSON)
                        .content(body("影界守护者", 1000)))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/death-epitaph").contentType(MediaType.APPLICATION_JSON)
                        .content(body("", 3)))
                .andExpect(status().isBadRequest());
    }
}
