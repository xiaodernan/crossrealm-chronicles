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
                // W-X17：uptime 两格（起点 ISO-8601 + 已活秒数 ≥0）
                .andExpect(jsonPath("$.startedAt").isNotEmpty())
                .andExpect(jsonPath("$.uptimeSec").isNumber())
                // W-X18：没带 X-Request-Id 时回 null（不编造）
                .andExpect(jsonPath("$.requestId").value(org.hamcrest.Matchers.nullValue()))
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

    @Test
    void requestIdIsEchoedVerbatimWhenProvided() throws Exception {
        // W-X18：带 id 进来就原样带回去——整条链只有一个名字
        mockMvc.perform(get("/api/ops/health").header("X-Request-Id", "trace-abc-123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestId").value("trace-abc-123"));
    }

    @Test
    void opsStatsReturnsAggregateView() throws Exception {
        // W-P12：跨域聚合——leaderboard / trials / telemetry 三块全量快照，字段对齐
        mockMvc.perform(get("/api/ops/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.since").isNotEmpty())
                .andExpect(jsonPath("$.leaderboard.total").isNumber())
                .andExpect(jsonPath("$.leaderboard.fastestMs").isNumber())
                .andExpect(jsonPath("$.leaderboard.slowestMs").isNumber())
                .andExpect(jsonPath("$.leaderboard.avgMs").isNumber())
                .andExpect(jsonPath("$.leaderboard.uniqueBosses").isNumber())
                .andExpect(jsonPath("$.leaderboard.p50Ms").isNumber())
                .andExpect(jsonPath("$.leaderboard.p95Ms").isNumber())
                .andExpect(jsonPath("$.trials.total").isNumber())
                .andExpect(jsonPath("$.trials.topScore").isNumber())
                .andExpect(jsonPath("$.trials.avgScore").isNumber())
                .andExpect(jsonPath("$.trials.uniqueRunners").isNumber())
                .andExpect(jsonPath("$.trials.uniqueSeasons").isNumber())
                .andExpect(jsonPath("$.telemetry.windowSize").isNumber())
                .andExpect(jsonPath("$.telemetry.distinctTypes").isNumber())
                .andExpect(jsonPath("$.telemetry.byType").isArray())
                // W-P14：请求计数三条
                .andExpect(jsonPath("$.requests.total").isNumber())
                .andExpect(jsonPath("$.requests.rejected4xx").isNumber())
                .andExpect(jsonPath("$.requests.serverError5xx").isNumber())
                // W-M1：遥测队列背压
                .andExpect(jsonPath("$.telemetryQueue.capacity").isNumber())
                .andExpect(jsonPath("$.telemetryQueue.enqueued").isNumber())
                .andExpect(jsonPath("$.telemetryQueue.depth").isNumber())
                .andExpect(jsonPath("$.telemetryQueue.dropped").isNumber())
                .andExpect(jsonPath("$.telemetryQueue.processed").isNumber());
    }

    @Test
    void opsStatsWithSeedDataIsSelfConsistent() throws Exception {
        // W-P12：seedDemoData=true 时 leaderboard 至少有一条 seed 记录，
        // 且 fastest ≤ avg ≤ slowest（统计口径自洽——别让运维读到一个反直觉的榜）
        String body = mockMvc.perform(get("/api/ops/stats"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Number total = com.jayway.jsonpath.JsonPath.read(body, "$.leaderboard.total");
        Number fastest = com.jayway.jsonpath.JsonPath.read(body, "$.leaderboard.fastestMs");
        Number avg = com.jayway.jsonpath.JsonPath.read(body, "$.leaderboard.avgMs");
        Number slowest = com.jayway.jsonpath.JsonPath.read(body, "$.leaderboard.slowestMs");
        org.junit.jupiter.api.Assertions.assertTrue(total.intValue() >= 1,
                "seed 数据应保证 leaderboard 至少一条");
        org.junit.jupiter.api.Assertions.assertTrue(fastest.longValue() <= avg.longValue()
                        && avg.longValue() <= slowest.longValue(),
                "fastest ≤ avg ≤ slowest 必须成立，实际 fastest=" + fastest + " avg=" + avg + " slowest=" + slowest);
    }
}
