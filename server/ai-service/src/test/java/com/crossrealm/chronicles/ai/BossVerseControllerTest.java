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
 * 余火回响 · 端点契约（W-Z289）：人格分层、限长生效、控制字符净化、lang 白名单、熔断 503。
 */
class BossVerseControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private LlmClient client;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        client = mock(LlmClient.class);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new BossVerseController(client))
                .setValidator(validator)
                .build();
    }

    private static String body(String bossId, String name, String lang, String chapter, String kills, String level, String zone)
            throws Exception {
        return MAPPER.writeValueAsString(Map.of(
                "bossId", bossId, "name", name, "lang", lang,
                "chapter", chapter, "kills", kills, "level", level, "zone", zone));
    }

    @Test
    void 成功时返回一句余火回响() throws Exception {
        when(client.complete(anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("火还在——它只是换了个方向烧", "gpt-6.1-terra", false, false, 9L));

        mvc.perform(post("/api/ai/boss-verse").contentType(MediaType.APPLICATION_JSON)
                        .content(body("shadow-warden", "影界守护者", "zh", "3", "1", "12", "灰白森林")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.verse").value("火还在——它只是换了个方向烧"))
                .andExpect(jsonPath("$.cached").value(false));
    }

    @Test
    void 人格与顾问回声烬灯都不同() throws Exception {
        when(client.complete(anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("收灯", "gpt-6.1-terra", false, false, 1L));
        mvc.perform(post("/api/ai/boss-verse").contentType(MediaType.APPLICATION_JSON)
                        .content(body("archmagus", "大奥术师萨尔林", "zh", "2", "2", "20", "魔法遗境")))
                .andExpect(status().isOk());

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(client).complete(captor.capture(), anyString());
        org.junit.jupiter.api.Assertions.assertTrue(captor.getValue().contains("倒下了"),
                "boss-verse 人格应以 Boss 倒下开场，实际：" + captor.getValue().substring(0, 60));
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().contains("星轨顾问"));
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().contains("回声先知"));
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().contains("unwritten"),
                "boss-verse 人格不应出现仲裁者特化词 unwritten");
    }

    @Test
    void 账本里的控制字符会被抹掉再进提示词() throws Exception {
        when(client.complete(anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("收灯", "gpt-6.1-terra", false, false, 1L));
        mvc.perform(post("/api/ai/boss-verse").contentType(MediaType.APPLICATION_JSON)
                        .content(body("sigil-lord", "\u0000影\u001b界\u0000守护者", "zh", "1", "1", "5", "\r\n灰白森林")))
                .andExpect(status().isOk());

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(client).complete(anyString(), captor.capture());
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().contains("\u001b"));
        org.junit.jupiter.api.Assertions.assertTrue(captor.getValue().contains("守护者"));
    }

    @Test
    void lang_白名单之外一律四百() throws Exception {
        mvc.perform(post("/api/ai/boss-verse").contentType(MediaType.APPLICATION_JSON)
                        .content(body("x", "影", "fr", "1", "1", "1", "")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void 上游不可用时回五零三而不是五零零() throws Exception {
        when(client.complete(anyString(), anyString()))
                .thenThrow(new AdvisorUnavailableException("circuit-open"));

        mvc.perform(post("/api/ai/boss-verse").contentType(MediaType.APPLICATION_JSON)
                        .content(body("x", "影", "zh", "1", "1", "1", "")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("advisor-unavailable"))
                .andExpect(jsonPath("$.reason").value("circuit-open"));
    }

    @Test
    void 超长name一律四百() throws Exception {
        mvc.perform(post("/api/ai/boss-verse").contentType(MediaType.APPLICATION_JSON)
                        .content(body("x", "守".repeat(81), "zh", "1", "1", "1", "")))
                .andExpect(status().isBadRequest());
    }
}
