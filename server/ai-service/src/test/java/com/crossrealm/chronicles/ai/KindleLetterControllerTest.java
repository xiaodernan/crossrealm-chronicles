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
 * 烬灯回信 · 烬火答 · 端点契约（W-Z292）：人格隔离、输入净化、choice/lang 白名单、熔断 503。
 */
class KindleLetterControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private LlmClient client;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        client = mock(LlmClient.class);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new KindleLetterController(client))
                .setValidator(validator)
                .build();
    }

    private static String body(String line, String choice, String lang, String stats) throws Exception {
        return MAPPER.writeValueAsString(Map.of("line", line, "choice", choice, "lang", lang, "stats", stats));
    }

    @Test
    void 成功时返回炉火写回的那一行() throws Exception {
        when(client.complete(anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("这趟没白走——下一锅米要留给后来人。", "gpt-6.1-terra", false, false, 8L));

        mvc.perform(post("/api/ai/kindle-letter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("我想问问火，我的这一趟值不值得", "keep", "zh", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.reply").value("这趟没白走——下一锅米要留给后来人。"))
                .andExpect(jsonPath("$.cached").value(false));
    }

    @Test
    void 人格与顾问烬灯回信都不同() throws Exception {
        when(client.complete(anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("回信的第一笔", "gpt-6.1-terra", false, false, 1L));
        mvc.perform(post("/api/ai/kindle-letter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("收到", "quiet", "zh", "")))
                .andExpect(status().isOk());

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(client).complete(captor.capture(), anyString());
        org.junit.jupiter.api.Assertions.assertTrue(captor.getValue().contains("炉火的记录者"));
        org.junit.jupiter.api.Assertions.assertTrue(captor.getValue().contains("仍是炉火自己的声音"),
                "烬火答人格应钉炉火自己的声音这一句，实际：" + captor.getValue().substring(0, 80));
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().contains("星轨顾问"));
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().contains("回声先知"));
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().contains("boss-verse"));
    }

    @Test
    void 信纸里的控制字符会被抹掉再进提示词() throws Exception {
        when(client.complete(anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("火收到了", "gpt-6.1-terra", false, false, 1L));
        mvc.perform(post("/api/ai/kindle-letter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("你好\u0000\u001b[2J炉火", "keep", "zh", "")))
                .andExpect(status().isOk());

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(client).complete(anyString(), captor.capture());
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().contains("\u001b"));
        org.junit.jupiter.api.Assertions.assertTrue(captor.getValue().contains("炉火"));
    }

    @Test
    void choice_lang_白名单之外一律四百() throws Exception {
        mvc.perform(post("/api/ai/kindle-letter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("你好", "resign", "zh", "")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/kindle-letter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("你好", "keep", "fr", "")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void 上游不可用时回五零三而不是五零零() throws Exception {
        when(client.complete(anyString(), anyString()))
                .thenThrow(new AdvisorUnavailableException("circuit-open"));

        mvc.perform(post("/api/ai/kindle-letter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("你好", "keep", "zh", "")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("advisor-unavailable"))
                .andExpect(jsonPath("$.reason").value("circuit-open"));
    }

    @Test
    void 超长信纸一律四百_空信纸也四百() throws Exception {
        mvc.perform(post("/api/ai/kindle-letter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("好".repeat(281), "keep", "zh", "")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/kindle-letter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("", "keep", "zh", "")))
                .andExpect(status().isBadRequest());
    }
}
