package com.crossrealm.chronicles.game;

import com.crossrealm.chronicles.game.ai.AiServiceClient;
import com.crossrealm.chronicles.game.leaderboard.LeaderboardService;
import com.crossrealm.chronicles.game.season.SeasonClient;
import com.crossrealm.chronicles.game.season.SeasonSnapshot;
import com.crossrealm.chronicles.game.telemetry.TelemetryService;
import com.crossrealm.chronicles.game.trial.TrialLeaderboardService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * `/api/ops/advisor` 的两条腿（W-Z8 切片1）。不拉 Spring 上下文：
 *
 * - 起容器就有 Eureka + Feign 代理，而这里要量的是「下游回答什么、怎么降级」；
 * - 直接构造控制器，能把 `AiServiceClient` 换成 stub —— 快乐路径 / 空 Map（fallback）/ 抛异常各一扇门。
 *
 * 契约：
 * - 空 Map = 没答上（fallbackFactory 的口径）→ 这一路 available=false + reason=fallback；
 * - stub 抛 RuntimeException = 熔断没开、异常直抛 → 本地兜底层接住 → available=false + reason=<异常类名>；
 * - 两种情况下都不许 500、都不许给半真半假的字段。
 */
class OpsAdvisorEndpointTest {

    private static OpsController controller(AiServiceClient advisor) {
        GameServiceProperties properties = new GameServiceProperties();
        return new OpsController(
                properties,
                new LeaderboardService(properties),
                new TrialLeaderboardService(properties),
                new TelemetryService(properties),
                SeasonSnapshot::unavailable,
                advisor,
                new RequestCountFilter(),
                new com.crossrealm.chronicles.game.cache.TtlCache(),
                null,
                "game-service",
                null,
                null,
                null);
    }

    private static AiServiceClient stub(Map<String, Object> health, Map<String, Object> jobs) {
        return new AiServiceClient() {
            @Override
            public Map<String, Object> health() {
                return health;
            }

            @Override
            public Map<String, Object> jobsStats() {
                return jobs;
            }

            @Override
            public Map<String, Object> deadLetter() {
                return Map.of("items", List.of(), "count", 0L, "limit", 20L);
            }
        };
    }

    @Test
    @DisplayName("下游答得上时：两格各自 available=true，字段原样透出")
    void advisorIsPassedThrough() {
        AiServiceClient client = stub(
                Map.of("configured", true, "model", "gpt-6-sol", "circuit", "CLOSED",
                        "cache", Map.of("hits", 41L), "upstreamCalls", 128L),
                Map.of("capacity", 64L, "depth", 0L, "workers", 2L, "inFlight", 0L,
                        "enqueued", 90L, "rejected", 1L, "dedupHits", 3L,
                        "done", 87L, "deadLettered", 1L));

        Map<String, Object> result = controller(client).advisor();

        @SuppressWarnings("unchecked")
        Map<String, Object> health = (Map<String, Object>) result.get("health");
        assertEquals(true, health.get("available"));
        assertEquals("gpt-6-sol", health.get("model"));
        assertEquals(128L, health.get("upstreamCalls"));

        @SuppressWarnings("unchecked")
        Map<String, Object> jobs = (Map<String, Object>) result.get("jobs");
        assertEquals(true, jobs.get("available"));
        assertEquals(64L, jobs.get("capacity"));
        assertEquals(87L, jobs.get("done"));
        assertEquals(1L, jobs.get("deadLettered"));
    }

    @Test
    @DisplayName("fallbackFactory 空 Map（熔断打开 / 实例全下线）：两格 available=false，不编造字段")
    void emptyFallbackIsHonest() {
        Map<String, Object> result = controller(stub(Map.of(), Map.of())).advisor();

        @SuppressWarnings("unchecked")
        Map<String, Object> health = (Map<String, Object>) result.get("health");
        assertEquals(false, health.get("available"));
        assertFalse(health.containsKey("model"), "降级时不该有 model — 空字符串会被前端当成一个真硅");

        @SuppressWarnings("unchecked")
        Map<String, Object> jobs = (Map<String, Object>) result.get("jobs");
        assertEquals(false, jobs.get("available"));
        assertFalse(jobs.containsKey("capacity"), "降级时不该有 capacity");
    }

    @Test
    @DisplayName("一格挂了另一格没挂：各自独立降级，不是一起落灰")
    void halfFailureIsPartialNotTotal() {
        AiServiceClient client = new AiServiceClient() {
            @Override
            public Map<String, Object> health() {
                throw new IllegalStateException("connection refused");
            }

            @Override
            public Map<String, Object> jobsStats() {
                return Map.of("capacity", 64L, "depth", 0L);
            }

            @Override
            public Map<String, Object> deadLetter() {
                return Map.of("items", List.of(), "count", 0L, "limit", 20L);
            }
        };

        Map<String, Object> result = controller(client).advisor();

        @SuppressWarnings("unchecked")
        Map<String, Object> health = (Map<String, Object>) result.get("health");
        assertEquals(false, health.get("available"));
        assertEquals("IllegalStateException", health.get("reason"));

        @SuppressWarnings("unchecked")
        Map<String, Object> jobs = (Map<String, Object>) result.get("jobs");
        assertEquals(true, jobs.get("available"));
        assertEquals(64L, jobs.get("capacity"));
    }

    @Test
    @DisplayName("两格都直抛异常：仍然 200 + available=false（本地兜底层），原因留得住")
    void throwingClientIsCaughtLocally() {
        AiServiceClient broken = new AiServiceClient() {
            @Override
            public Map<String, Object> health() {
                throw new IllegalStateException("no instances available for ai-service");
            }

            @Override
            public Map<String, Object> jobsStats() {
                throw new IllegalStateException("no instances available for ai-service");
            }

            @Override
            public Map<String, Object> deadLetter() {
                throw new IllegalStateException("no instances available for ai-service");
            }
        };

        Map<String, Object> result = controller(broken).advisor();

        @SuppressWarnings("unchecked")
        Map<String, Object> health = (Map<String, Object>) result.get("health");
        assertEquals(false, health.get("available"));
        assertEquals("IllegalStateException", health.get("reason"));

        @SuppressWarnings("unchecked")
        Map<String, Object> jobs = (Map<String, Object>) result.get("jobs");
        assertEquals(false, jobs.get("available"));
        assertEquals("IllegalStateException", jobs.get("reason"));
    }

    @Test
    @DisplayName("/api/ops/stats 保持零外呼：advisor 不在其中")
    void statsStaysZeroOutcall() {
        // 即使 client 必抛，stats() 也必须正常返回且不含 advisor 键
        AiServiceClient broken = new AiServiceClient() {
            @Override
            public Map<String, Object> health() {
                throw new IllegalStateException("must not be called");
            }

            @Override
            public Map<String, Object> jobsStats() {
                throw new IllegalStateException("must not be called");
            }

            @Override
            public Map<String, Object> deadLetter() {
                throw new IllegalStateException("must not be called");
            }
        };

        Map<String, Object> result = controller(broken).stats();
        assertFalse(result.containsKey("advisor"),
                "advisor 是 Feign 外呼，stats 保持零外呼 —— 两格不是同一扇门");
        assertTrue(result.containsKey("leaderboard"));
        assertTrue(result.containsKey("telemetryQueue"));
    }
}
