package com.crossrealm.chronicles.gateway;

import static org.junit.jupiter.api.Assertions.*;

import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;

/**
 * W-Z14：路由桶 / 结果桶单元钉 —— 守住有限枚举不被玩家输入污染；并钉两个总数。
 */
class GatewayMetricsFilterTest {

    @Test
    void routeBucketIsFiniteEnum() {
        assertEquals("version", GatewayMetricsFilter.routeBucket("/api/version"));
        assertEquals("ai", GatewayMetricsFilter.routeBucket("/api/ai/chat"));
        assertEquals("seasons", GatewayMetricsFilter.routeBucket("/api/seasons/active"));
        assertEquals("leaderboard", GatewayMetricsFilter.routeBucket("/api/leaderboard"));
        assertEquals("trials", GatewayMetricsFilter.routeBucket("/api/trials/leaderboard"));
        assertEquals("telemetry", GatewayMetricsFilter.routeBucket("/api/telemetry/events"));
        assertEquals("ops", GatewayMetricsFilter.routeBucket("/api/ops/health"));
        assertEquals("other", GatewayMetricsFilter.routeBucket("/api/app/x"));
        assertEquals("other", GatewayMetricsFilter.routeBucket("/api"));
        assertEquals("other", GatewayMetricsFilter.routeBucket(""));
        assertEquals("other", GatewayMetricsFilter.routeBucket("/api/my-app?param=x"));
        assertEquals("ai", GatewayMetricsFilter.routeBucket("/api/ai?param=x")); // query 不参与桶判
    }

    @Test
    void outcomeBucketWrapsStatuses() {
        assertEquals("2xx", GatewayMetricsFilter.outcomeBucket(200));
        assertEquals("2xx", GatewayMetricsFilter.outcomeBucket(204));
        assertEquals("4xx", GatewayMetricsFilter.outcomeBucket(400));
        assertEquals("4xx", GatewayMetricsFilter.outcomeBucket(404));
        assertEquals("5xx", GatewayMetricsFilter.outcomeBucket(500));
        assertEquals("5xx", GatewayMetricsFilter.outcomeBucket(503));
        assertEquals("other", GatewayMetricsFilter.outcomeBucket(301));
        assertEquals("other", GatewayMetricsFilter.outcomeBucket(null));
    }

    @Test
    void registryContainsAllPrewireMeters() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        new GatewayMetricsFilter(registry);
        assertEquals(
                GatewayMetricsFilter.ROUTE_NAMES.length * GatewayMetricsFilter.OUTCOME_NAMES.length + 1,
                registry.getMeters().size());
        Predicate<Meter> isRequestsTotal = m -> m.getId().getName().equals("gateway_requests_total");
        for (String route : GatewayMetricsFilter.ROUTE_NAMES) {
            for (String outcome : GatewayMetricsFilter.OUTCOME_NAMES) {
                Predicate<Meter> isMatch = isRequestsTotal
                        .and(m -> route.equals(m.getId().getTag("route")))
                        .and(m -> outcome.equals(m.getId().getTag("outcome")));
                long count = registry.getMeters().stream().filter(isMatch).count();
                assertEquals(1, count, "missing counter for route=" + route + " outcome=" + outcome);
            }
        }
    }
}
