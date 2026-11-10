package com.crossrealm.chronicles.game;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * W-X9：配置热刷新 —— /actuator/refresh 必须可达，且返回 JSON 数组（变更键名列表，可空）。
 * 真正"改了配置没重启出新值"的链路在 server/scripts/smoke.ps1 里对着 temp 目录真打一遍。
 */
@SpringBootTest
@AutoConfigureMockMvc
class RefreshEndpointTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void refreshEndpointReturnsJsonArray() throws Exception {
        MvcResult result = mockMvc.perform(post("/actuator/refresh").contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andReturn();
        String body = result.getResponse().getContentAsString();
        assertTrue(body.trim().startsWith("["), "refresh 返回的不是 JSON 数组: " + body);
        assertTrue(body.trim().endsWith("]"), "refresh 返回的不是 JSON 数组: " + body);
    }
}
