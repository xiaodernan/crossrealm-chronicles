package com.crossrealm.chronicles.game;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

/**
 * W-X13：/api/ops/health 复合健康视图——config + inMemory，无外呼、不依赖 Eureka/Config 活着。
 * 验证：端点 200、字段齐全、inMemory 体能读出来（>=0）。
 */
@SpringBootTest
@AutoConfigureMockMvc
class OpsControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void opsHealthReturnsCompositeView() throws Exception {
        mockMvc.perform(get("/api/ops/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.service").value("game-service"))
                .andExpect(jsonPath("$.version").value("0.1.0-SNAPSHOT"))
                .andExpect(jsonPath("$.javaVersion").isNotEmpty())
                .andExpect(jsonPath("$.config.leaderboardMaxLimit").isNumber())
                .andExpect(jsonPath("$.config.telemetryMaxEvents").isNumber())
                .andExpect(jsonPath("$.config.versionNote").isNotEmpty())
                .andExpect(jsonPath("$.inMemory.leaderboardRecords").isNumber())
                .andExpect(jsonPath("$.inMemory.trialRecords").isNumber())
                .andExpect(jsonPath("$.inMemory.telemetryEvents").isNumber())
                // W-P1（W-P5 同一版式）：缓存观测三件套，全部整数
                .andExpect(jsonPath("$.inMemory.leaderboardCache.hits").isNumber())
                .andExpect(jsonPath("$.inMemory.leaderboardCache.misses").isNumber())
                .andExpect(jsonPath("$.inMemory.leaderboardCache.entries").isNumber())
                .andExpect(jsonPath("$.inMemory.trialCache.hits").isNumber())
                .andExpect(jsonPath("$.inMemory.trialCache.misses").isNumber())
                .andExpect(jsonPath("$.inMemory.trialCache.entries").isNumber())
                .andExpect(jsonPath("$.inMemory.seasonCache.hits").isNumber())
                .andExpect(jsonPath("$.inMemory.seasonCache.misses").isNumber())
                .andExpect(jsonPath("$.inMemory.seasonCache.entries").isNumber());
    }
}
