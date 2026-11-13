package com.crossrealm.chronicles.gateway;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.net.URI;
import java.time.Duration;
import java.util.Locale;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * W-Z14：网关金丝雀计数（GatewayMetricsFilter）。
 *
 * <p>口径：
 * <ul>
 *   <li>route = 一级路径段（/api/ai/** → {@code ai}、/api/version → {@code version} …），有限枚举</li>
 *   <li>outcome = 2xx/4xx/5xx/other；全是横向枚举，把 cardinality 绑死在 ≈ 8×4=32 个 counter + 1 个 timer</li>
 *   <li>order=100：业务 filter 之后记最终状态；order 靠后保证 CircuitBreaker 的 fallback 状态码也能记上</li>
 *   <li>registry 不存在（单测）时，整个 filter 零操作——单测仍可纯粹验证 routeBucket/outcomeBucket 的数学</li>
 * </ul>
 *
 * <p>Timer 只注册一次（pre-registered in ctor），否则高 QPS 下会泄漏 MeterRegistry。
 */
@Component
public class GatewayMetricsFilter implements GlobalFilter, Ordered {

    private static final Duration TIMER_SLO = Duration.ofSeconds(120);

    static final String[] ROUTE_NAMES = {"version", "ai", "seasons", "leaderboard", "trials", "telemetry", "ops", "other"};
    static final String[] OUTCOME_NAMES = {"2xx", "4xx", "5xx", "other"};

    private final MeterRegistry registry;
    private final Counter[][] counters;
    private final Timer duration;

    public GatewayMetricsFilter(MeterRegistry registry) {
        this.registry = registry;
        // 预驻：ROUTE×OUTCOME 各一只 counter，从不在热路径上 new
        this.counters = new Counter[ROUTE_NAMES.length][OUTCOME_NAMES.length];
        for (int ri = 0; ri < ROUTE_NAMES.length; ri++) {
            for (int oi = 0; oi < OUTCOME_NAMES.length; oi++) {
                counters[ri][oi] = registry.counter(
                        "gateway_requests_total",
                        "route", ROUTE_NAMES[ri],
                        "outcome", OUTCOME_NAMES[oi]);
            }
        }
        this.duration = Timer.builder("gateway_request_duration_seconds")
                .publishPercentileHistogram(true)
                .maximumExpectedValue(TIMER_SLO)
                .register(registry);
    }

    /** 路由桶：只取首段，落回常量集。 */
    public static String routeBucket(String rawPath) {
        if (rawPath == null) return "other";
        String p = rawPath;
        int q = p.indexOf('?');
        if (q >= 0) p = p.substring(0, q);
        String[] parts = p.split("/");
        if (parts.length < 3) return "other";
        String seg = parts[2];
        return routeBucketForSegment(seg);
    }

    private static String routeBucketForSegment(String seg) {
        if (seg == null) return "other";
        switch (seg.toLowerCase(Locale.ROOT)) {
            case "version": return "version";
            case "ai": return "ai";
            case "seasons": return "seasons";
            case "leaderboard": return "leaderboard";
            case "trials": return "trials";
            case "telemetry": return "telemetry";
            case "ops": return "ops";
            default: return "other";
        }
    }

    /** 状态码 → 4 类。 */
    public static String outcomeBucket(Integer statusValue) {
        if (statusValue == null) return "other";
        int v = statusValue.intValue();
        if (v >= 200 && v < 300) return "2xx";
        if (v >= 400 && v < 500) return "4xx";
        if (v >= 500 && v < 600) return "5xx";
        return "other";
    }

    private static int indexOf(String[] arr, String value) {
        for (int i = 0; i < arr.length; i++) {
            if (arr[i].equals(value)) return i;
        }
        return arr.length - 1; // "other"
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        final long startNanos = System.nanoTime();
        return chain.filter(exchange).doFinally(sig -> {
            URI uri = exchange.getRequest() != null ? exchange.getRequest().getURI() : null;
            String route = uri != null ? routeBucket(uri.getRawPath()) : "other";
            Integer status = exchange.getResponse() != null && exchange.getResponse().getStatusCode() != null
                    ? exchange.getResponse().getStatusCode().value()
                    : null;
            String outcome = outcomeBucket(status);
            int ri = indexOf(ROUTE_NAMES, route);
            int oi = indexOf(OUTCOME_NAMES, outcome);
            Counter counter = counters[ri][oi];
            if (counter != null) counter.increment();
            duration.record(Duration.ofNanos(System.nanoTime() - startNanos));
        });
    }

    @Override
    public int getOrder() {
        return 100;
    }
}
