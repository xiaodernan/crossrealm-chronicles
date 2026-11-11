package com.crossrealm.chronicles.season;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
 * W-S1：/api/seasons/stats —— 只读运维面 + 默认分支的计数契约。
 *
 * <p>关键断言：
 * 1. 200 + 字段齐全（service/startedAt/uptimeSec/active/catalog/cache）；
 * 2. 默认（concurrent）分支：cache.type == "concurrent"，entries/hits/misses 都是 ≥0 的整数；
 * 3. @Cacheable 命中确实计数：连打两次 /api/seasons/active，hits ≥ 1；
 * 4. TTL 惰性失效：写入一个带假 TTL 的 CountingCache 直接验证 lookup 过期路径（单元腿）。
 */
@SpringBootTest
@AutoConfigureMockMvc
class SeasonStatsEndpointTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void statsReturnsCompositeView() throws Exception {
        mockMvc.perform(get("/api/seasons/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.service").value("season-service"))
                .andExpect(jsonPath("$.startedAt").isNotEmpty())
                .andExpect(jsonPath("$.uptimeSec").isNumber())
                .andExpect(jsonPath("$.active.id").isNotEmpty())
                .andExpect(jsonPath("$.active.dayInCycle").isNumber())
                .andExpect(jsonPath("$.active.daysRemaining").isNumber())
                .andExpect(jsonPath("$.active.soulsBonusPct").isNumber())
                .andExpect(jsonPath("$.catalog.size").value(4))
                .andExpect(jsonPath("$.catalog.cycleDays").isNumber())
                .andExpect(jsonPath("$.catalog.overrideActive").value(false))
                .andExpect(jsonPath("$.cache.name").value("seasons"))
                .andExpect(jsonPath("$.cache.type").value("concurrent"))
                .andExpect(jsonPath("$.cache.entries").isNumber())
                .andExpect(jsonPath("$.cache.hits").isNumber())
                .andExpect(jsonPath("$.cache.misses").isNumber());
    }

    @Test
    void cacheableHitsAreCounted() throws Exception {
        // /api/seasons/active 挂了 @Cacheable('seasons', key='active')：
        // 同上下文连打两次，至少一次是命中（第一次也可能是冷启动 miss）
        mockMvc.perform(get("/api/seasons/active")).andExpect(status().isOk());
        mockMvc.perform(get("/api/seasons/active")).andExpect(status().isOk());

        String body = mockMvc.perform(get("/api/seasons/stats"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Number hits = com.jayway.jsonpath.JsonPath.read(body, "$.cache.hits");
        assertTrue(hits.longValue() >= 1, "两次 /api/seasons/active 之后 hits 应 ≥ 1，实际 hits=" + hits);
    }

    @Test
    void expiredEntriesAreCountedAsMisses() {
        // 单元腿：假时钟式 TTL —— 写入 1ms 后必然过期，lookup 应回 null 且 misses 计数
        CountingCache cache = new CountingCache("seasons", java.time.Duration.ofMillis(1));
        cache.put("active", "view");
        try {
            Thread.sleep(10);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
        assertEquals(null, cache.get("active"), "过期项应惰性失效");
        assertTrue(cache.counters().get("misses") >= 1);
        assertTrue(cache.counters().get("puts") >= 1);
    }
}
