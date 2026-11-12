package com.crossrealm.chronicles.game;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 结构化访问日志（W-Z9）——game-service 此前只有计数器（RequestCountFilter）没有「哪条路径、多慢」。
 *
 * <p>口径与 ai-service 的 AccessLogFilter 逐字一致：
 * 只记 ts/app/requestId/method/path/status/durationMs；path 不含 query、不含 body；
 * /actuator 不记；网关盖的 X-Request-Id 原样透出；一条一行 JSON。
 */
@Component
public class AccessLogFilter extends OncePerRequestFilter {

    private static final Logger ACCESS = LoggerFactory.getLogger("access");
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String APP = "game-service";

    /** 行构造器内聚成包内可见静态方法：单测钉 JSON 形状，不碰过滤链 */
    static String formatLine(String requestId, String method, String path, int status, long durationMs) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ts", System.currentTimeMillis());
        m.put("app", APP);
        m.put("requestId", requestId == null ? "" : requestId);
        m.put("method", method == null ? "" : method);
        m.put("path", path == null ? "" : path);
        m.put("status", status);
        m.put("durationMs", durationMs);
        try {
            return MAPPER.writeValueAsString(m);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return "{\"app\":\"game-service\",\"error\":\"access-log-serialization\"}";
        }
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        if (path != null && path.startsWith("/actuator")) {
            chain.doFilter(request, response);
            return;
        }
        long start = System.currentTimeMillis();
        try {
            chain.doFilter(request, response);
        } finally {
            String rid = request.getHeader("X-Request-Id");
            ACCESS.info(formatLine(rid, request.getMethod(), path, response.getStatus(),
                    Math.max(0L, System.currentTimeMillis() - start)));
        }
    }
}
