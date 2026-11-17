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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * 烬灯回信 · 返炉（Ember Reply）· 端点契约（W-Z316）：
 * 分拣（classify）→ 编排（compose）→ 回灌（guard）三节点 StateGraph，
 * 人格隔离、输入净化、choice/lang 白名单、熔断 503、lane 分派、护栏拦截。
 */
class EmberReplyControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private LlmClient client;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        client = mock(LlmClient.class);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new EmberReplyController(client))
                .setValidator(validator)
                .build();
    }

    private static String body(String line, String choice, String lang, String stats) throws Exception {
        return MAPPER.writeValueAsString(Map.of("line", line, "choice", choice, "lang", lang, "stats", stats));
    }

    private LlmClient.Answer answerOf(String text) {
        return new LlmClient.Answer(text, "gpt-6.1-terra", false, false, 1L);
    }

    @Test
    void 分拣命中的是五条人格之一_编排走对应lane() throws Exception {
        when(client.complete(eq(EmberReplyController.CLASSIFIER_SYSTEM), anyString()))
                .thenReturn(answerOf("lore"));
        when(client.complete(eq(EmberReplyController.LORE_SYSTEM), anyString()))
                .thenReturn(answerOf("七百年的火一直在——它知道的人与事，它都记得。"));

        mvc.perform(post("/api/ai/ember-reply").contentType(MediaType.APPLICATION_JSON)
                        .content(body("炉火知道白桦吗？", "keep", "zh", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.lane").value("lore"))
                .andExpect(jsonPath("$.classified").value(true))
                .andExpect(jsonPath("$.guarded").value(false))
                .andExpect(jsonPath("$.reply").value("七百年的火一直在——它知道的人与事，它都记得。"));
    }

    @Test
    void 分拣回garbage_fallback到journey() throws Exception {
        when(client.complete(eq(EmberReplyController.CLASSIFIER_SYSTEM), anyString()))
                .thenReturn(answerOf("不知道"));
        when(client.complete(eq(EmberReplyController.JOURNEY_SYSTEM), anyString()))
                .thenReturn(answerOf("火听见了——它在，就在这锅旁边。"));

        mvc.perform(post("/api/ai/ember-reply").contentType(MediaType.APPLICATION_JSON)
                        .content(body("今天还好吗", "quiet", "zh", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lane").value("journey"))
                .andExpect(jsonPath("$.classified").value(false))
                .andExpect(jsonPath("$.reply").value("火听见了——它在，就在这锅旁边。"));
    }

    @Test
    void 五个lane各自命中人格() throws Exception {
        String[][] routes = {
                { "lore", "lore" }, { "journey", "journey" }, { "gratitude", "gratitude" },
                { "distress", "distress" }, { "offtopic", "offtopic" },
        };
        for (String[] r : routes) {
            LlmClient c = mock(LlmClient.class);
            MockMvc inner = MockMvcBuilders.standaloneSetup(new EmberReplyController(c))
                    .setValidator(new LocalValidatorFactoryBean() {{ afterPropertiesSet(); }})
                    .build();
            when(c.complete(eq(EmberReplyController.CLASSIFIER_SYSTEM), anyString())).thenReturn(answerOf(r[0]));
            when(c.complete(eq(EmberReplyController.laneSystem(r[0])), anyString())).thenReturn(answerOf("回信" + r[0]));

            inner.perform(post("/api/ai/ember-reply").contentType(MediaType.APPLICATION_JSON)
                            .content(body("hello", "keep", "en", "")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.lane").value(r[1]));
        }
    }

    @Test
    void 护栏_编排回了泄漏词_整行作废回安全句() throws Exception {
        when(client.complete(eq(EmberReplyController.CLASSIFIER_SYSTEM), anyString()))
                .thenReturn(answerOf("journey"));
        when(client.complete(eq(EmberReplyController.JOURNEY_SYSTEM), anyString()))
                .thenReturn(answerOf("我是AI，星轨顾问在此。"));

        mvc.perform(post("/api/ai/ember-reply").contentType(MediaType.APPLICATION_JSON)
                        .content(body("你是谁", "keep", "zh", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.guarded").value(true))
                .andExpect(jsonPath("$.reply").value(EmberReplyController.SAFE_ZH));
    }

    @Test
    void 护栏_编排回了超长的字_作废回安全句() throws Exception {
        when(client.complete(eq(EmberReplyController.CLASSIFIER_SYSTEM), anyString()))
                .thenReturn(answerOf("journey"));
        // 61 个汉字（超 60 上限）
        when(client.complete(eq(EmberReplyController.JOURNEY_SYSTEM), anyString()))
                .thenReturn(answerOf("你好世界".repeat(16)));

        mvc.perform(post("/api/ai/ember-reply").contentType(MediaType.APPLICATION_JSON)
                        .content(body("hi", "keep", "zh", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.guarded").value(true))
                .andExpect(jsonPath("$.reply").value(EmberReplyController.SAFE_ZH));
    }

    @Test
    void 护栏_markdown记号被剥掉() throws Exception {
        when(client.complete(eq(EmberReplyController.CLASSIFIER_SYSTEM), anyString()))
                .thenReturn(answerOf("journey"));
        when(client.complete(eq(EmberReplyController.JOURNEY_SYSTEM), anyString()))
                .thenReturn(answerOf("## 炉火说\n守着，不灭。"));

        mvc.perform(post("/api/ai/ember-reply").contentType(MediaType.APPLICATION_JSON)
                        .content(body("你好", "keep", "zh", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.guarded").value(false))
                .andExpect(jsonPath("$.reply").value("炉火说\n守着，不灭。"));
    }

    @Test
    void 分拣提示词里钉炉火印记且不越界() throws Exception {
        LlmClient captor = mock(LlmClient.class);
        MockMvc inner = MockMvcBuilders.standaloneSetup(new EmberReplyController(captor))
                .setValidator(new LocalValidatorFactoryBean() {{ afterPropertiesSet(); }})
                .build();
        when(captor.complete(anyString(), anyString())).thenReturn(answerOf("journey"));

        inner.perform(post("/api/ai/ember-reply").contentType(MediaType.APPLICATION_JSON)
                        .content(body("今天还好吗", "keep", "zh", "")))
                .andExpect(status().isOk());

        org.mockito.ArgumentCaptor<String> captorSys = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(captor, org.mockito.Mockito.times(2)).complete(captorSys.capture(),
                anyString());
        String first = captorSys.getAllValues().get(0);
        String second = captorSys.getAllValues().get(1);
        // classify 冻结 persona 必须按意图分拣 5 类且不含 story arc 数字
        assertTrue(first.contains("lore"));
        assertTrue(first.contains("distress"));
        // compose 是炉火声音、禁泄露、不说机制
        assertTrue(second.contains("炉火的记录者"));
        assertFalse(second.contains("星轨顾问"));
        assertFalse(second.contains("pressure"));
    }

    @Test
    void 控制字符净化_空信纸四百_超长信纸四百() throws Exception {
        when(client.complete(eq(EmberReplyController.CLASSIFIER_SYSTEM), anyString()))
                .thenReturn(answerOf("journey"));
        when(client.complete(eq(EmberReplyController.JOURNEY_SYSTEM), anyString()))
                .thenReturn(answerOf("火收到了"));

        mvc.perform(post("/api/ai/ember-reply").contentType(MediaType.APPLICATION_JSON)
                        .content(body("你好 \u001b[2J炉火", "keep", "zh", "")))
                .andExpect(status().isOk());

        mvc.perform(post("/api/ai/ember-reply").contentType(MediaType.APPLICATION_JSON)
                        .content(body("", "keep", "zh", "")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/ember-reply").contentType(MediaType.APPLICATION_JSON)
                        .content(body("h".repeat(281), "keep", "zh", "")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void choice_lang白名单之外四百_上游挂掉回五零三() throws Exception {
        mvc.perform(post("/api/ai/ember-reply").contentType(MediaType.APPLICATION_JSON)
                        .content(body("你好", "keepish", "zh", "")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/ember-reply").contentType(MediaType.APPLICATION_JSON)
                        .content(body("你好", "keep", "fr", "")))
                .andExpect(status().isBadRequest());

        LlmClient dead = mock(LlmClient.class);
        when(dead.complete(anyString(), anyString()))
                .thenThrow(new AdvisorUnavailableException("circuit-open"));
        MockMvc deadMvc = MockMvcBuilders.standaloneSetup(new EmberReplyController(dead))
                .setValidator(new LocalValidatorFactoryBean() {{ afterPropertiesSet(); }})
                .build();
        deadMvc.perform(post("/api/ai/ember-reply").contentType(MediaType.APPLICATION_JSON)
                        .content(body("你好", "keep", "zh", "")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("advisor-unavailable"))
                .andExpect(jsonPath("$.reason").value("circuit-open"));
    }

    @Test
    void 直接单测parseLane与guard() {
        assertEquals("lore", EmberReplyController.parseLane("LORE\n"));
        assertEquals("distress", EmberReplyController.parseLane(" distress. "));
        assertEquals("journey", EmberReplyController.parseLane("不存在"));
        assertEquals("journey", EmberReplyController.parseLane(null));

        EmberReplyController.GuardResult ok = EmberReplyController.guardReply("守着，不灭。", "zh");
        assertFalse(ok.guarded());
        assertEquals("守着，不灭。", ok.reply());

        EmberReplyController.GuardResult safe = EmberReplyController.guardReply("星轨顾问在此", "zh");
        assertTrue(safe.guarded());
        assertEquals(EmberReplyController.SAFE_ZH, safe.reply());

        // 英文长 clamp（72 codepoints）
        String longEn = "word ".repeat(20).trim(); // >72 codepoints
        EmberReplyController.GuardResult safeEn = EmberReplyController.guardReply(longEn, "en");
        assertTrue(safeEn.guarded());
        assertEquals(EmberReplyController.SAFE_EN, safeEn.reply());
    }
}
