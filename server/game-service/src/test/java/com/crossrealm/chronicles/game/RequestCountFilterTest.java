package com.crossrealm.chronicles.game;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

/**
 * W-P14：game-service 请求计数器的契约测试。
 *
 * 断言三条：
 * 1. 业务请求（/api/version）被计入 total；
 * 2. /api/ops/* 与 /actuator/* **不**被计入（运维轮询不是业务流量）；
 * 3. 4xx 响应被计入 rejected4xx；total == rejected4xx + serverError5xx + 其余（口径自洽）。
 */
@SpringBootTest
@AutoConfigureMockMvc
class RequestCountFilterTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RequestCountFilter requestCountFilter;

    @Test
    void businessRequestsAreCounted() throws Exception {
        long before = requestCountFilter.counters().get("total");
        mockMvc.perform(get("/api/version")).andExpect(status().isOk());
        long after = requestCountFilter.counters().get("total");
        assertEquals(before + 1, after, "业务请求应被计入 total");
    }

    @Test
    void opsAndActuatorRequestsAreNotCounted() throws Exception {
        long before = requestCountFilter.counters().get("total");
        mockMvc.perform(get("/api/ops/health")).andExpect(status().isOk());
        mockMvc.perform(get("/actuator/health")).andExpect(status().isOk());
        long after = requestCountFilter.counters().get("total");
        assertEquals(before, after, "/api/ops 与 /actuator 不应被计入业务流量");
    }

    @Test
    void rejected4xxAreCounted() throws Exception {
        long before = requestCountFilter.counters().get("rejected4xx");
        // 未知路径 → Spring MVC 404（not filtered out：它是业务面的真实 4xx）
        mockMvc.perform(get("/api/definitely-not-exists-12345"));
        long after = requestCountFilter.counters().get("rejected4xx");
        assertEquals(before + 1, after, "404 应计入 rejected4xx");
    }

    @Test
    void countersAreInternallyConsistent() throws Exception {
        mockMvc.perform(get("/api/version"));
        var counters = requestCountFilter.counters();
        long total = counters.get("total");
        long r4 = counters.get("rejected4xx");
        long r5 = counters.get("serverError5xx");
        assertTrue(total >= r4 + r5, "total 应 ≥ rejected4xx + serverError5xx，实际 total=" + total + " r4=" + r4 + " r5=" + r5);
    }
}
