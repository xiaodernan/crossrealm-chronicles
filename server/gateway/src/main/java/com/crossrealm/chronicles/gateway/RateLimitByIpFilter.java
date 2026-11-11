package com.crossrealm.chronicles.gateway;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Map;
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
 * <p>W-P3 升级：这个 map 现在是<b>有界 LRU</b>。旧版的 {@code ConcurrentHashMap} 会让
 * 每一个见过的 IP 键永远留在 JVM 堆里——伪造 X-Forwarded-For 的刷子可以一次填满内存，
 * 而这里信了 XFF，攻击者不需要代价。现在：access-order + cap 4096，满之后新的 IP
 * 仍然会被记录，但"最久没用过的"被淘汰；每 512 次调用再做一次主动 purge，
 * 把时间窗口已经滑出、deque 全空的键删掉（过期条目残留等于白占 key）。
 *
 * <p>与 circuitbreaker / retry 是两条独立逻辑：熔断保护上游，限流保护嘴部。
 * 正常玩家 / smoke 不会碰到；破防刷端 / 并发抓取会撞线。
 */
@Component
public class RateLimitByIpFilter implements GlobalFilter, Ordered {

    private static final int WINDOW_MS = 10_000;
    private static final int MAX_REQUESTS = 60;
    private static final int ORDER = -100;
    /** 最多跟踪多少个不同的 IP——超出时踢最久未用 */
    static final int MAX_TRACKED_IPS = 4096;
    /** 每多少次请求做一次"清空已过期窗口"的扫荡 */
    static final int SWEEP_EVERY = 512;

    private final RateLimitTokenBucket bucket = new RateLimitTokenBucket(WINDOW_MS, MAX_REQUESTS);

    /** access-order LinkedHashMap = 可驱逐 LRU；满了踢最久未用的那一条 */
    private final Map<String, Deque<Long>> windows = new LinkedHashMap<>(256, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Deque<Long>> eldest) {
            return size() > MAX_TRACKED_IPS;
        }
    };

    private long callsSinceSweep = 0;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String ip = resolveClientIp(exchange);
        String key = (ip == null || ip.isBlank()) ? "unknown" : ip;

        Deque<Long> window;
        synchronized (windows) {
            sweepIfDue();
            window = windows.computeIfAbsent(key, k -> new ArrayDeque<>());
        }

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

    /** 每 SWEEP_EVERY 次调用做一次主动 purge：把窗口整体过期的键删掉。 */
    private void sweepIfDue() {
        callsSinceSweep++;
        if (callsSinceSweep < SWEEP_EVERY) {
            return;
        }
        callsSinceSweep = 0;
        sweep();
    }

    /** 删掉窗口里最新一条都已经超出 WINDOW_MS 的 IP —— 把"来过一条请求就再也没来"的残留挤掉。 */
    void sweep() {
        long cutoff = System.currentTimeMillis() - WINDOW_MS;
        windows.entrySet().removeIf(e -> {
            Long newest = e.getValue().peekLast();
            // 旧到 entry 里**最新**的一条都过期了 —— 整个队列都可以丢
            return newest == null || newest <= cutoff;
        });
    }

    /** 测试用：直接触发一次 purge（不依赖调用计数） */
    void sweepForTest() {
        sweep();
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
        synchronized (windows) {
            Map<String, Integer> snapshot = new LinkedHashMap<>();
            windows.forEach((key, value) -> snapshot.put(key, value.size()));
            return snapshot;
        }
    }

    /** 测试用：当前追踪的 IP 数量 */
    int trackedIpCount() {
        synchronized (windows) {
            return windows.size();
        }
    }
}
