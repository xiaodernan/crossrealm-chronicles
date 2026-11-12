package com.crossrealm.chronicles.ai;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/** 降级响应的**唯一形状**：两个 AI 端点的 handler 都从这里取，不许各写一份 503。 */
public final class AiErrors {

    private AiErrors() {}

    public static ResponseEntity<Map<String, Object>> unavailable(String reason) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "advisor-unavailable");
        body.put("reason", reason);
        body.put("message", "星轨顾问暂时连不上星图，请稍后再问");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }
}
