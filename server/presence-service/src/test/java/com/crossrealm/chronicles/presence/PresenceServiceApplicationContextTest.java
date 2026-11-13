package com.crossrealm.chronicles.presence;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 上下文冒烟：内存后端（默认）下，应用整体能起、聚合 Bean 非空、/actuator/health 为 UP。
 * 这是「删掉它游戏照样离线可玩」契约的另一面——它必须能静态健康地启动。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PresenceServiceApplicationContextTest {

    @LocalServerPort
    int port;

    @Autowired
    PresenceStore store;

    @Autowired
    PresenceEventHub hub;

    @Autowired
    PresenceController controller;

    @Autowired
    TestRestTemplate rest;

    @Test
    void contextLoads_默认内存后端装配齐全() {
        assertThat(store).isInstanceOf(InMemoryPresenceStore.class);
        assertThat(hub).isInstanceOf(InMemoryPresenceEventHub.class);
        assertThat(controller).isNotNull();
    }

    @Test
    void actuatorHealth端点上报UP() {
        ResponseEntity<String> resp = rest.getForEntity("http://127.0.0.1:" + port + "/actuator/health", String.class);
        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        assertThat(resp.getBody()).contains("\"status\":\"UP\"");
    }
}
