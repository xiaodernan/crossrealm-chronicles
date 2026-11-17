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
 * W-Z343 端点契约：残章冻结口径、桶号不与其他 lane 共享、故障不砸穿。
 */
class ChapterCodaControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private LlmClient client;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        client = mock(LlmClient.class);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new ChapterCodaController(client))
                .setValidator(validator)
                .build();
    }

    private static String body(Integer chapter, Integer prev, String lang) throws Exception {
        return MAPPER.writeValueAsString(Map.of("chapter", chapter, "prev", prev, "lang", lang));
    }

    @Test
    void 成功时返回一句残章() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("这一章落了，灯还亮着", "gpt-6.1-terra", false, false, 10L));

        mvc.perform(post("/api/ai/chapter-coda").contentType(MediaType.APPLICATION_JSON)
                        .content(body(2, 1, "zh")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.line").value("这一章落了，灯还亮着"))
                .andExpect(jsonPath("$.cached").value(false));
    }

    @Test
    void 人格是残章执笔人且桶号独立() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("", "gpt-6.1-terra", false, false, 1L));
        mvc.perform(post("/api/ai/chapter-coda").contentType(MediaType.APPLICATION_JSON)
                        .content(body(3, 2, "en")))
                .andExpect(status().isOk());

        var systemCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        var keyCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(client).complete(systemCaptor.capture(), anyString(), keyCaptor.capture());
        org.junit.jupiter.api.Assertions.assertTrue(systemCaptor.getValue().contains("残章执笔人"));
        org.junit.jupiter.api.Assertions.assertFalse(systemCaptor.getValue().contains("回声先知"));
        org.junit.jupiter.api.Assertions.assertFalse(systemCaptor.getValue().contains("星轨顾问"));
        org.junit.jupiter.api.Assertions.assertEquals("crossrealm-chapter-coda-v1", keyCaptor.getValue());
    }

    @Test
    void 上游不可用时五零三而不是五() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenThrow(new AdvisorUnavailableException("circuit-open"));

        mvc.perform(post("/api/ai/chapter-coda").contentType(MediaType.APPLICATION_JSON)
                        .content(body(2, 1, "zh")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("advisor-unavailable"))
                .andExpect(jsonPath("$.reason").value("circuit-open"));
    }

    @Test
    void 越界与缺字段都拒绝() throws Exception {
        mvc.perform(post("/api/ai/chapter-coda").contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/chapter-coda").contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(Map.of("chapter", 0, "prev", 1))))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/chapter-coda").contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(Map.of("chapter", 2, "prev", 100))))
                .andExpect(status().isBadRequest());
    }
}
