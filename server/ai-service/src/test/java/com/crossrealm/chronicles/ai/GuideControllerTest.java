package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * W-Z486 守夜人指路 —— LlmClient mock，零网络。守 HTTP 契约 + LLM 驱动的条件边状态流转。
 */
class GuideControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private LlmClient client;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        client = mock(LlmClient.class);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new GuideController(client))
                .setValidator(validator)
                .build();
    }

    private static LlmClient.Answer answer(String text) {
        return new LlmClient.Answer(text, "gpt-6.2-sol", false, true, 42L);
    }

    private Map<String, Object> body(String zone, String objective, int idle, int actions, String lang) {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("zone", zone);
        b.put("objective", objective);
        b.put("idleSeconds", idle);
        b.put("recentActions", actions);
        b.put("lang", lang);
        return b;
    }

    @Test
    void lostSignal_routesThroughGuideLost() throws Exception {
        // assess 判 LOST，随后 guideLost 产出指路
        when(client.complete(anyString(), anyString(), eq(LlmClient.CacheKeys.GUIDE)))
                .thenReturn(answer("LOST"), answer("火还在，先看看手边那盏灯，路会自己亮起来。"));

        mvc.perform(post("/api/ai/guide")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body("灰白森林", "点亮回声灯", 90, 9, "zh"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mood").value("lost"))
                .andExpect(jsonPath("$.nudge").value("火还在，先看看手边那盏灯，路会自己亮起来。"))
                .andExpect(jsonPath("$.lang").value("zh"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
                        .string(org.hamcrest.Matchers.containsString(
                                "\"path\":[\"observe\",\"assess\",\"guideLost\",\"guard\"]")));
    }

    @Test
    void onTrackSignal_routesThroughGuideOnTrack() throws Exception {
        when(client.complete(anyString(), anyString(), eq(LlmClient.CacheKeys.GUIDE)))
                .thenReturn(answer("ON_TRACK"), answer("这一程走得稳，火光会替你记住来路。"));

        mvc.perform(post("/api/ai/guide")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body("Intersection Hub", "Reach the third Boss", 2, 3, "en"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mood").value("on-track"))
                .andExpect(jsonPath("$.nudge").value("这一程走得稳，火光会替你记住来路。"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
                        .string(org.hamcrest.Matchers.containsString(
                                "\"path\":[\"observe\",\"assess\",\"guideOnTrack\",\"guard\"]")));
    }

    @Test
    void allLlmNodesShareOneCacheKey() throws Exception {
        when(client.complete(anyString(), anyString(), eq(LlmClient.CacheKeys.GUIDE)))
                .thenReturn(answer("LOST"), answer("坐下来暖一会儿，火没灭。"));

        mvc.perform(post("/api/ai/guide")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body("hub", "quest", 10, 1, "zh"))))
                .andExpect(status().isOk());

        ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
        verify(client, atLeastOnce()).complete(anyString(), anyString(), key.capture());
        assertEquals("crossrealm-guide-v1", key.getValue(),
                "判读与措辞节点必须共用同一 cache key —— 同一张 cache page，并行会话不互相冲掉");
    }

    @Test
    void leakAnswer_isGuardedToSafeLine() throws Exception {
        when(client.complete(anyString(), anyString(), eq(LlmClient.CacheKeys.GUIDE)))
                .thenReturn(answer("ON_TRACK"), answer("as an AI, I suggest you press E"));

        mvc.perform(post("/api/ai/guide")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(body("hub", "quest", 1, 1, "en"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.guarded").value(true));
    }

    @Test
    void richContext_reachesAssessAndComposeWithoutChangingFrozenPrefix() throws Exception {
        when(client.complete(anyString(), anyString(), eq(LlmClient.CacheKeys.GUIDE)))
                .thenReturn(answer("LOST"), answer("火还在，先歇一口气。"));

        Map<String, Object> b = body("fantasy", "点亮回声灯", 90, 9, "zh");
        b.put("context", Map.of(
                "zone", "duplicate-zone", "objective", "duplicate-objective",
                "health", "63/90", "souls", 240, "season", "ember · day 4",
                "chapter", 2, "player_level", 9, "trial", "idle"));

        mvc.perform(post("/api/ai/guide")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(b)))
                .andExpect(status().isOk());

        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(client, org.mockito.Mockito.times(2)).complete(system.capture(), user.capture(),
                eq(LlmClient.CacheKeys.GUIDE));
        assertEquals(List.of(GuideController.GUIDE_SYSTEM, GuideController.GUIDE_SYSTEM), system.getAllValues(),
                "玩家状态只能进 user，不能破坏所有节点共享的冻结前缀");
        for (String prompt : user.getAllValues()) {
            assertTrue(prompt.contains("health=63/90"));
            assertTrue(prompt.contains("souls=240"));
            assertTrue(prompt.contains("season=ember · day 4"));
            assertTrue(prompt.contains("chapter=2"));
            assertTrue(prompt.contains("player_level=9"));
            assertTrue(prompt.contains("trial=idle"));
            assertFalse(prompt.contains("duplicate-zone"));
            assertFalse(prompt.contains("duplicate-objective"));
        }
    }

    @Test
    void contextAboveEight_isRejected() throws Exception {
        Map<String, Object> b = body("hub", "quest", 0, 0, "zh");
        Map<String, Object> context = new java.util.LinkedHashMap<>();
        for (int i = 0; i < 9; i++) context.put("k" + i, i);
        b.put("context", context);
        mvc.perform(post("/api/ai/guide")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(b)))
                .andExpect(status().isBadRequest());
        org.mockito.Mockito.verifyNoInteractions(client);
    }

    @Test
    void blankZone_ok_defaultsToUnprovided() throws Exception {
        when(client.complete(anyString(), anyString(), eq(LlmClient.CacheKeys.GUIDE)))
                .thenReturn(answer("ON_TRACK"), answer("火还亮着，往前走。"));

        mvc.perform(post("/api/ai/guide")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"objective\":\"quest\",\"lang\":\"zh\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nudge").value("火还亮着，往前走。"));
    }
}