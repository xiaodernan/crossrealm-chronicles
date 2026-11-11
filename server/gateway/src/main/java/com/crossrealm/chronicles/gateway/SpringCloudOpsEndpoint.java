package com.crossrealm.chronicles.gateway;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.actuate.endpoint.annotation.Endpoint;
import org.springframework.boot.actuate.endpoint.annotation.ReadOperation;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * W-P11：网关自有只读 Actuator endpoint（{@code GET /actuator/springcloud}）。
 *
 * <p>故意小而严格：<b>只读、零外呼</b>——
 * <ul>
 *   <li>不泄露完整路由表、不泄露 registry 里的实例名列表；</li>
 *   <li>不问 Eureka（同 game-service {@code /actuator/health} 纪律）；</li>
 *   <li>ratelimit 的 live tracked size 只在内存背板上数出来；Redis 背板返 -1（不适用）；</li>
 *   <li>allowed/rejected 是<b>本实例</b>的累计计数（原子自增，零额外 RTT、零外呼）；</li>
 *   <li>返回 JSON 里不含 IP / ID / secret / 路径。</li>
 * </ul>
 *
 * <p>用途：<b>liveness + 谁在用哪种背板</b>，供运维在灰度期间核对
 * "这次到底是 memory 还是 redis 在挡流量"。
 */
@Endpoint(id = "springcloud")
@Component
public class SpringCloudOpsEndpoint {

    private final Environment env;
    private final RouteLocator routeLocator;
    private final IpRateLimiter rateLimiter;
    private final Instant startedAt = Instant.now();

    public SpringCloudOpsEndpoint(Environment env, RouteLocator routeLocator, IpRateLimiter rateLimiter) {
        this.env = env;
        this.routeLocator = routeLocator;
        this.rateLimiter = rateLimiter;
    }

    @ReadOperation
    public Map<String, Object> springCloudInfo() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("name", "crossrealm-chronicles-gateway");
        result.put("role", "spring-cloud-gateway");
        result.put("uptimeSec", Duration.between(startedAt, Instant.now()).getSeconds());
        result.put("startedAt", startedAt.toString());
        result.put("javaVersion", System.getProperty("java.version"));
        result.put("ratelimit", Map.of(
                "backend", env.getProperty("gateway.ratelimit.backend", "memory"),
                "maxRequests", rateLimiter.maxRequests(),
                "windowMs", rateLimiter.windowMs(),
                "trackedSize", rateLimiter.trackedSize(),
                // W-P13：本实例累计的放行/拒绝次数（限流真的生效了没、挡了多少）
                "allowed", rateLimiter.allowedCount(),
                "rejected", rateLimiter.rejectedCount()));
        result.put("gateway", Map.of(
                "routesConfigured", countRoutes(),
                "retryOnVersion", true,
                "circuitBreakerEnabled", true,
                "serverTimingEnabled", true,
                "xRequestIdEcho", true));
        return result;
    }

    private long countRoutes() {
        try {
            // RouteLocator 是 Flux<Route>；数一数有几条配置好的路由
            return routeLocator.getRoutes().count().blockOptional().orElse(0L);
        } catch (Exception e) {
            return -1L; // 路由表此刻不可读——不 panic、不猜，返 -1
        }
    }
}
