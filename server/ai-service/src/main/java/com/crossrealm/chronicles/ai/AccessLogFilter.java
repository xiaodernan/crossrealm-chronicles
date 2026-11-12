package com.crossrealm.chronicles.ai;

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
 * 结构化访问日志（W-Z9）——ai-service 此前连一条「谁来了、状态多少、多慢」都没有。
 *
 * <p>刻意只记：
 * <ul>
 *   <li>{@code ts} / {@code app} / {@code requestId}（网关盖的 X-Request-Id 原样透出）/
 *       {@code method} / {@code path} / {@code status} / {@code durationMs}；</li>
 *   <li>{@code path} 用 {@code getRequestURI()} —— <b>不含 query、不含 body</b>：
 *       玩家输入只许活在 ResponseCache / 队列状态里，不许活进日志文件；</li>
 *   <li>{@code /actuator} 不记（探活噪音 100%、信息量 0%）。</li>
 * </ul>
 * 一条一行 JSON，grep 起来不需要正则学位。
 */
@Component
public class AccessLogFilter extends OncePerRequestFilter {

    private static final Logger ACCESS = LoggerFactory.getLogger("access");
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String APP = "ai-service";

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
            // 字段里全是过 Jackson 的安全类型，走不到这里；真走到就退化成一条可读的告警行，不抛
            return "{\"app\":\"ai-service\",\"error\":\"access-log-serialization\"}";
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
