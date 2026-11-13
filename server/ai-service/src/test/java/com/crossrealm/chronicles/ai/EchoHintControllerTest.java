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

/** W-X22 收编后的端点契约：人格不同、限长生效、故障不砸穿游戏。 */
class EchoHintControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private LlmClient client;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        client = mock(LlmClient.class);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new EchoHintController(client))
                .setValidator(validator)
                .build();
    }

    private static String body(String franchise, String title, String desc) throws Exception {
        return MAPPER.writeValueAsString(Map.of("franchise", franchise, "title", title, "desc", desc));
    }

    @Test
    void 成功时返回一句梦话() throws Exception {
        when(client.complete(anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("星河在那之前已经有人走过", "gpt-6-sol", false, false, 10L));

        mvc.perform(post("/api/ai/echo-hint").contentType(MediaType.APPLICATION_JSON)
                        .content(body("星际位面", "引擎低鸣", "舷窗外流过一缕星光")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.hint").value("星河在那之前已经有人走过"))
                .andExpect(jsonPath("$.cached").value(false));
    }

    @Test
    void 人格提示与星轨顾问不同() throws Exception {
        when(client.complete(anyString(), anyString()))
                .thenReturn(new LlmClient.Answer("好", "gpt-6-sol", false, false, 1L));
        mvc.perform(post("/api/ai/echo-hint").contentType(MediaType.APPLICATION_JSON)
                        .content(body("CYBER", "浮空赌场", "云层里的赌场")))
                .andExpect(status().isOk());

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(client).complete(captor.capture(), anyString());
        org.junit.jupiter.api.Assertions.assertTrue(captor.getValue().contains("回声先知"));
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().contains("星轨顾问"));
    }

    @Test
    void 上游不可用时五零三而不是五百() throws Exception {
        when(client.complete(anyString(), anyString()))
                .thenThrow(new AdvisorUnavailableException("circuit-open"));

        mvc.perform(post("/api/ai/echo-hint").contentType(MediaType.APPLICATION_JSON)
                        .content(body("CYBER", "黑市舱", "")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("advisor-unavailable"))
                .andExpect(jsonPath("$.reason").value("circuit-open"));
    }

    @Test
    void 缺字段与超长都拒绝() throws Exception {
        mvc.perform(post("/api/ai/echo-hint").contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/echo-hint").contentType(MediaType.APPLICATION_JSON)
                        .content(body("A".repeat(65), "标题", "")))
                .andExpect(status().isBadRequest());
    }
}
