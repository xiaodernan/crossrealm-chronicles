package com.crossrealm.chronicles.season;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * REST 契约门禁（standalone MockMvc：不起容器，只验路由/JSON 形状/状态码）。
 *
 * 这里量的是**契约**而不是业务：客户端（`OnlineServices` + Feign）依赖的字段名一旦改名，
 * 这一层必须红 —— 否则线上表现是"赛季面板空白但没有任何报错"。
 */
class SeasonControllerTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        SeasonServiceProperties props = new SeasonServiceProperties();
        // 固定到纪元日 0：第一周期第一天 ⇒ ember，dayInCycle=0，daysRemaining=14
        Clock clock = Clock.fixed(Instant.ofEpochSecond(0), ZoneOffset.UTC);
        SeasonCatalog catalog = new SeasonCatalog(props, clock);
        catalog.validate();
        mockMvc = MockMvcBuilders.standaloneSetup(new SeasonController(catalog)).build();
    }

    @Test
    @DisplayName("名册端点：四套主题，当前是灰烬")
    void rosterEndpointReturnsFourSeasonsAndActive() throws Exception {
        mockMvc.perform(get("/api/seasons"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeId", is("ember")))
                .andExpect(jsonPath("$.cycleDays", is(14)))
                .andExpect(jsonPath("$.seasons", hasSize(4)))
                .andExpect(jsonPath("$.seasons[0].id", is("ember")))
                .andExpect(jsonPath("$.seasons[0].modifierIds", contains("burning-ground", "elite-surge")));
    }

    @Test
    @DisplayName("当前赛季端点：带周期读数")
    void activeEndpointCarriesCycleReadings() throws Exception {
        mockMvc.perform(get("/api/seasons/active"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is("ember")))
                .andExpect(jsonPath("$.name", is("灰烬回响")))
                .andExpect(jsonPath("$.soulsBonusPct", is(25)))
                .andExpect(jsonPath("$.dayInCycle", is(0)))
                .andExpect(jsonPath("$.daysRemaining", is(14)));
    }

    @Test
    @DisplayName("按 id 取：未知返回 404 而不是空对象")
    void byIdReturns404ForUnknown() throws Exception {
        mockMvc.perform(get("/api/seasons/gloom"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is("gloom")));
        mockMvc.perform(get("/api/seasons/nope"))
                .andExpect(status().isNotFound());
    }
}
