package com.crossrealm.chronicles.gateway;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
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

    /**
     * W-Y1：AI 顾问路由专用兜底。
     *
     * <p>为什么不能用上面那个 {@code /fallback/503}：Spring Cloud Gateway 的
     * {@code forward:} 会保留原始 HTTP method，而 {@code /api/ai/chat} 是 POST ——
     * forward 到一个只标了 {@code @GetMapping} 的方法会拿到 405，
     * 客户端会把「顾问挂了」误读成「我这次请求写错了」。
     *
     * <p>这里同时接 GET/POST，返回体里给一个稳定的 {@code error} 码，
     * 前端据此显示「顾问离线」而不是把 503 当成游戏错误往上抛。
     */
    @RequestMapping(value = "/fallback/advisor", method = {RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<Map<String, Object>> advisorUnavailable() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "advisor-unavailable");
        body.put("service", "ai-service");
        body.put("reason", "gateway-circuit-open");
        body.put("message", "星轨顾问暂时连不上星图，请稍后再问");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }
}
