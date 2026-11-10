package com.crossrealm.chronicles.gateway;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import reactor.core.publisher.Mono;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

/**
 * W-X12：{@code X-Forwarded-For}（优先）或连接端口（fallback）按 IP 计数；
 * 10 秒内最多 60 次——刚好是 smoke 全链路 ~15 次 + 改喷刷新的余量。
 * 超出返回 {@code 429} + JSON（不是上游的 503，是这一条路不听劝）。
 *
 * <p>与 circuitbreaker / retry 是两条独立逻辑：熔断保护上游，限流保护嘴部。
 * 正常玩家 / smoke 不会碰到；破防刷端 / 并发抓取会撞线。
 */
@Component
public class RateLimitByIpFilter implements GlobalFilter, Ordered {

    private static final int WINDOW_MS = 10_000;
    private static final int MAX_REQUESTS = 60;
    private static final int ORDER = -100;

    private final RateLimitTokenBucket bucket = new RateLimitTokenBucket(WINDOW_MS, MAX_REQUESTS);
    private final ConcurrentHashMap<String, Deque<Long>> windows = new ConcurrentHashMap<>();

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String ip = resolveClientIp(exchange);
        String key = (ip == null || ip.isBlank()) ? "unknown" : ip;
        Deque<Long> window = windows.computeIfAbsent(key, k -> new ArrayDeque<>());
        if (!bucket.allow(window)) {
            long retryAfter = bucket.retryAfterMs(window);
            String body = "{\"error\":\"rate-limited\",\"retryAfterMs\":" + retryAfter + "}";
            ServerHttpResponse response = exchange.getResponse();
            response.setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
            response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
            response.getHeaders().setContentLength(body.getBytes(StandardCharsets.UTF_8).length);
            response.getHeaders().add("X-RateLimit-Limit", String.valueOf(bucket.getMaxRequests()));
            response.getHeaders().add("X-RateLimit-Window-Ms", String.valueOf(bucket.getWindowMs()));
            return response.writeWith(Mono.just(response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8))));
        }
        return chain.filter(exchange);
    }

    /** 先信 X-Forwarded-For（信任代理），再退到远程地址 */
    private String resolveClientIp(ServerWebExchange exchange) {
        String xff = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int comma = xff.indexOf(',');
            return (comma >= 0 ? xff.substring(0, comma) : xff).trim();
        }
        if (exchange.getRequest().getRemoteAddress() != null) {
            return exchange.getRequest().getRemoteAddress().getHostString();
        }
        return null;
    }

    @Override
    public int getOrder() {
        return ORDER;
    }

    /** 测试或调试用：当前所有已追踪的 IP（按 key） */
    public Map<String, Integer> snapshotWindowSizes() {
        return windows.entrySet().stream()
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, e -> e.getValue().size()));
    }
}
