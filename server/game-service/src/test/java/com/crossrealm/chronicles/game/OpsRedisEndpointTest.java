package com.crossrealm.chronicles.game;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

/**
 * W-Z13：/api/ops/redis 只读 JSON——后端标志 / mirror 是否装配 / ZCARD 计数。
 * backend=memory（默认）时 mirror 不注册，mirror=false / mirrorEntries=-1（按约定不装配）。
 */
@SpringBootTest
@AutoConfigureMockMvc
class OpsRedisEndpointTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void redisDiagnosticsDefaultsToMemory() throws Exception {
        mockMvc.perform(get("/api/ops/redis"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.leaderboard.backend").value("memory"))
                .andExpect(jsonPath("$.leaderboard.mirror").value(false))
                .andExpect(jsonPath("$.leaderboard.mirrorEntries").value(-1))
                .andExpect(jsonPath("$.leaderboard.maxLimit").isNumber())
                .andExpect(jsonPath("$.leaderboard.seedDemoData").value(true))
                .andExpect(jsonPath("$.trials.backend").value("memory"))
                .andExpect(jsonPath("$.trials.mirror").value(false))
                .andExpect(jsonPath("$.trials.mirrorEntries").value(-1))
                .andExpect(jsonPath("$.trials.maxLimit").isNumber())
                .andExpect(jsonPath("$.trials.seedDemoData").value(true))
                .andExpect(jsonPath("$.note").isString());
    }
}
