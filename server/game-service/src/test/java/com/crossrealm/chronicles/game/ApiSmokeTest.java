package com.crossrealm.chronicles.game;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 冒烟：上下文能起来 + 三个端点都通。测试 profile 已关闭 Eureka/Config 网络依赖。
 */
@SpringBootTest
@AutoConfigureMockMvc
class ApiSmokeTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void leaderboardEndpointReturnsSeededTop() throws Exception {
        mockMvc.perform(get("/api/leaderboard?limit=5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count", greaterThanOrEqualTo(1)));
    }

    @Test
    void telemetryEndpointAcceptsAndCounts() throws Exception {
        mockMvc.perform(post("/api/telemetry/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"boss_defeated\",\"detail\":\"void-chronarch\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accepted", is(true)));

        mockMvc.perform(get("/api/telemetry/events/count"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count", greaterThanOrEqualTo(1)));
    }

    @Test
    void telemetryEndpointRejectsBlankType() throws Exception {
        mockMvc.perform(post("/api/telemetry/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void versionEndpointReportsService() throws Exception {
        mockMvc.perform(get("/api/version"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.service", is("game-service")));
    }
}
