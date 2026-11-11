package com.crossrealm.chronicles.gateway;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * W-X12（W-P10 升级）：{@code X-Forwarded-For}（优先）或连接端口（fallback）按 IP 计数，
 * 10 秒内最多 60 次——刚好是 smoke 全链路 ~15 次 + 改喷刷新的余量。
 * 超出返回 {@code 429} + JSON（不是上游的 503，是这一条路不听劝）。
 *
 * <p>W-P10：计数逻辑搬进 {@link IpRateLimiter}——默认 {@link InMemoryIpRateLimiter}，
 * 多实例场景下 `gateway.ratelimit.backend=redis` 切到 {@link RedisIpRateLimiter}
 * （Redis ZSET 集群共享同一把计数器；Redis 不可达则 fail-open）。
 * 本类现在只做两件事：<b>从请求解析客户端 IP</b> + <b>到 IpRateLimiter 问能不能过</b>。</p>
 */
@Component
public class RateLimitByIpFilter implements GlobalFilter, Ordered {

    private static final int ORDER = -100;

    private final IpRateLimiter limiter;

    public RateLimitByIpFilter(IpRateLimiter limiter) {
        this.limiter = limiter;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String ip = resolveClientIp(exchange);
        long nowMs = System.currentTimeMillis();

        return limiter.tryAcquire(ip, nowMs)
                .flatMap(allowed -> {
                    if (Boolean.TRUE.equals(allowed)) {
                        return chain.filter(exchange);
                    }
                    long retryAfter = limiter.retryAfterMs();
                    String body = "{\"error\":\"rate-limited\",\"retryAfterMs\":" + retryAfter + "}";
                    ServerHttpResponse response = exchange.getResponse();
                    response.setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
                    response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
                    response.getHeaders().setContentLength(body.getBytes(StandardCharsets.UTF_8).length);
                    response.getHeaders().add("X-RateLimit-Limit", String.valueOf(limiter.maxRequests()));
                    response.getHeaders().add("X-RateLimit-Window-Ms", String.valueOf(limiter.windowMs()));
                    return response.writeWith(Mono.just(
                            response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8))));
                });
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

    /** 测试/调试用：返回当前背板的快照 */
    Map<String, Integer> snapshotWindowSizes() {
        return limiter.snapshotWindowSizes();
    }

    /** 测试用：当前追踪的 IP 数量 */
    int trackedIpCount() {
        return limiter.trackedSize();
    }
}
