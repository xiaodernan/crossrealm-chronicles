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
 * 烬灯回信 · 端点契约（W-Z288）：人格隔离、账本限长、抉择白名单、故障不砸穿片尾。
 */
class ArbiterControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private LlmClient client;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        client = mock(LlmClient.class);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new ArbiterController(client))
                .setValidator(validator)
                .build();
    }

    private static String body(String choice, String lang, String stats, String player) throws Exception {
        return MAPPER.writeValueAsString(Map.of("choice", choice, "lang", lang, "stats", stats, "player", player));
    }

    @Test
    void 成功时返回原文与统计_客户端自己解析JSON文本() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("{\"title\":\"灯还亮着\",\"epilogue\":\"走完七百年的人，门还开着。\",\"omen\":\"下一盏灯，等你叫它的名字。\"}",
                        "gpt-6.1-terra", false, true, 12L));

        mvc.perform(post("/api/ai/arbiter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("keep", "zh", "{\"echoes\":110,\"bosses\":5}", "周弈")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.cached").value(false))
                .andExpect(jsonPath("$.upstreamCached").value(true))
                .andExpect(jsonPath("$.raw").value(org.hamcrest.Matchers.containsString("灯还亮着")));
    }

    @Test
    void 人格提示是烬灯记录者而不是顾问也不是回声先知() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("{}", "gpt-6.1-terra", false, false, 1L));
        mvc.perform(post("/api/ai/arbiter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("quiet", "zh", "", "")))
                .andExpect(status().isOk());

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(client).complete(captor.capture(), anyString(), anyString());
        org.junit.jupiter.api.Assertions.assertTrue(captor.getValue().contains("炉火的记录者"));
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().contains("星轨顾问"));
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().contains("回声先知"));
    }

    @Test
    void 账本里的控制字符会被抹掉再进提示词() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("{}", "gpt-6.1-terra", false, false, 1L));
        mvc.perform(post("/api/ai/arbiter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("keep", "zh", "{\"echoes\":110}\u0000\u001b[2J", "周\r\n弈")))
                .andExpect(status().isOk());

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(client).complete(anyString(), captor.capture(), anyString());
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().contains("\u001b"));
        org.junit.jupiter.api.Assertions.assertTrue(captor.getValue().contains("echoes"));
    }

    @Test
    void choice_与_lang_白名单之外一律四百() throws Exception {
        mvc.perform(post("/api/ai/arbiter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("resign", "zh", "", "")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/arbiter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("keep", "fr", "", "")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void 上游不可用时回五零三而不是五零零() throws Exception {
        when(client.complete(anyString(), anyString(), anyString()))
                .thenThrow(new AdvisorUnavailableException("circuit-open"));

        mvc.perform(post("/api/ai/arbiter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("keep", "zh", "", "")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("advisor-unavailable"))
                .andExpect(jsonPath("$.reason").value("circuit-open"));
    }

    @Test
    void 超长账本一律四百() throws Exception {
        mvc.perform(post("/api/ai/arbiter").contentType(MediaType.APPLICATION_JSON)
                        .content(body("keep", "zh", "A".repeat(501), "")))
                .andExpect(status().isBadRequest());
    }
}
