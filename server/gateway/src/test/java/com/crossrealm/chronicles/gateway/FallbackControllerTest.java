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

    @Test
    void advisorFallbackAcceptsPostAndReturnsStructured503() throws Exception {
        // W-Y1：/api/ai/chat 是 POST，forward 到只接 GET 的 /fallback/503 会变成 405。
        // 这一条把「POST 也在映射里」钉住，否则熔断时玩家拿到的是 405 而不是「顾问离线」。
        var method = FallbackController.class.getDeclaredMethod("advisorUnavailable");
        var mapping = method.getAnnotation(org.springframework.web.bind.annotation.RequestMapping.class);
        assertTrue(mapping != null, "顾问兜底必须是 method 无关的 @RequestMapping");
        assertTrue(java.util.Arrays.asList(mapping.method())
                        .contains(org.springframework.web.bind.annotation.RequestMethod.POST),
                "POST 必须在兜底映射里");
        assertTrue(java.util.Arrays.asList(mapping.method())
                        .contains(org.springframework.web.bind.annotation.RequestMethod.GET));

        ResponseEntity<Map<String, Object>> response = new FallbackController().advisorUnavailable();
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
        Map<String, Object> body = response.getBody();
        assertTrue(body != null);
        assertEquals("advisor-unavailable", body.get("error"));
        assertEquals("ai-service", body.get("service"));
        assertEquals("gateway-circuit-open", body.get("reason"));
    }
}
