package com.crossrealm.chronicles.gateway;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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

    /**
     * W-Z314：{@code trustForwardedFor} 默认 {@code false}——**不信任**客户端送来的
     * {@code X-Forwarded-For}（普通对外网关上，任何客户端都可以伪造第一跳 IP，把
     * 60 次/10s 的桶当成无限额度刷下游）。
     * <p>只有在「链路前面有受控反向代理/负载均衡器、且它会清掉客户端 XFF 并自己
     * 写真值」的部署里才应置 {@code true}（compose 里按 {@code GATEWAY_RATELIMIT_XFFTRUST}
     * 显式开启——Spring relaxed binding 把 {@code gateway.ratelimit.xff-trust} 压平成
     * {@code XFFTRUST}；缺省 false）。
     */
    private final boolean trustForwardedFor;

    public RateLimitByIpFilter(IpRateLimiter limiter) {
        this(limiter, false);
    }

    @Autowired
    public RateLimitByIpFilter(IpRateLimiter limiter,
            @Value("${gateway.ratelimit.xff-trust:false}") boolean trustForwardedFor) {
        this.limiter = limiter;
        this.trustForwardedFor = trustForwardedFor;
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

    /**
     * 解析客户端 IP。
     * <p>默认（{@code trustForwardedFor=false}）只用连接对端地址——XFF 是请求头，
     * 外网客户端想怎么写就怎么写；信它的限流器等于关掉限流器。
     * <p>仅在部署位于受控反向代理/负载均衡之后（LB 会清掉客户端 XFF 并自己写第一跳）
     * 时置 true，此时取 XFF 第一个 hop（离客户端最近的身份）。
     */
    String resolveClientIp(ServerWebExchange exchange) {
        if (trustForwardedFor) {
            String xff = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
            if (xff != null && !xff.isBlank()) {
                int comma = xff.indexOf(',');
                return (comma >= 0 ? xff.substring(0, comma) : xff).trim();
            }
        }
        if (exchange.getRequest().getRemoteAddress() != null
                && exchange.getRequest().getRemoteAddress().getHostString() != null) {
            return exchange.getRequest().getRemoteAddress().getHostString();
        }
        // 拿不到对端地址时归入共享的 unknown 桶——限流器永远看到非空键
        return "unknown";
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
