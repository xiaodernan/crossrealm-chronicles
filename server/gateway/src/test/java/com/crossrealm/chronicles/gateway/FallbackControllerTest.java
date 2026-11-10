package com.crossrealm.chronicles.gateway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.crossrealm.chronicles.gateway.FallbackController;

/**
 * 兜底端点保证：熔断打开时调用方拿到的是语义清楚的 503
 * （而不是空 body / Spring 默认错误页 / 上游的半吊子响应）。
 */
class FallbackControllerTest {

    @Test
    void returns503WithUpstreamUnavailable() {
        ResponseEntity<Map<String, Object>> response = new FallbackController().unavailable();

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
        Map<String, Object> body = response.getBody();
        assertTrue(body != null, "兜底响应不该是空 body");
        assertEquals("upstream-unavailable", body.get("error"));
        assertEquals("game-service", body.get("service"));
        assertTrue(body.get("message") instanceof String && !body.toString().isEmpty(),
                "兜底响应应带人类可读的说明");
    }
}
