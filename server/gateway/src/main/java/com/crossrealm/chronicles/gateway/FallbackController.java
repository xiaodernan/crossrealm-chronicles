package com.crossrealm.chronicles.gateway;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 熔断兜底端点：网关判定 game-service 路由故障时，请求被 `forward:` 到这里，
 * 调用方拿到的是一个语义清楚的 503（不是空响应、也不是 Spring 默认错误页）。
 *
 * <p>它是 controller 方法、不是 route，不会再进熔断链，不会递归。
 */
@RestController
public class FallbackController {

    @GetMapping("/fallback/503")
    public ResponseEntity<Map<String, Object>> unavailable() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "upstream-unavailable");
        body.put("service", "game-service");
        body.put("message", "游戏伙伴服务暂时不可用（网关熔断中），请稍后重试");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }
}
