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
 * `/api/ops/season` 的两条腿（W-X14）。不起 Spring 上下文：
 *
 * - 起容器就要 Eureka + Feign 代理，而这里要量的恰好是"下游回答什么、怎么降级"；
 * - 直接构造控制器，能把 `SeasonClient` 换成一个 lambda —— 一个返回赛季、一个抛异常。
 *   后者是**降级路径**：熔断没开时异常会直抛，本地那一层 catch 必须接住它。
 */
class OpsSeasonEndpointTest {

    private static OpsController controller(SeasonClient client) {
        GameServiceProperties properties = new GameServiceProperties();
        return new OpsController(
                properties,
                new LeaderboardService(properties),
                new TrialLeaderboardService(properties),
                new TelemetryService(properties),
                client,
                stubAdvisor(Map.of("configured", false), Map.of("capacity", 64L)),
                new RequestCountFilter(),
                new com.crossrealm.chronicles.game.cache.TtlCache(),
                null,
                "game-service",
                null,
                null);
    }

    /** 默认 stub：ai-service 视为"答得上但没配 key"，本套测试不关心 advisor 那一格 */
    static AiServiceClient stubAdvisor(Map<String, Object> health, Map<String, Object> jobs) {
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
    @DisplayName("下游有赛季时：available=true，字段逐个透出")
    void seasonIsPassedThrough() {
        SeasonClient client = () -> new SeasonSnapshot(
                "gloom", "薄暮回响", "灯一盏盏灭下去",
                List.of("gloom-veil", "swift-shades"), 30, 3, 11);

        Map<String, Object> result = controller(client).season();

        assertEquals(true, result.get("available"));
        assertEquals("gloom", result.get("id"));
        assertEquals("薄暮回响", result.get("name"));
        assertEquals(List.of("gloom-veil", "swift-shades"), result.get("modifierIds"));
        assertEquals(30, result.get("soulsBonusPct"));
        assertEquals(3, result.get("dayInCycle"));
        assertEquals(11, result.get("daysRemaining"));
    }

    @Test
    @DisplayName("下游降级（unavailable）时：available=false，不编造字段")
    void unavailableFallbackIsHonest() {
        Map<String, Object> result = controller(SeasonSnapshot::unavailable).season();
        assertEquals(false, result.get("available"));
        assertFalse(result.containsKey("id"), "降级时不该有 id —— 空字符串会被前端当成一个真赛季");
    }

    @Test
    @DisplayName("客户端直接抛异常时：仍然 200 + available=false（本地兜底层）")
    void throwingClientIsCaughtLocally() {
        SeasonClient broken = () -> {
            throw new IllegalStateException("no instances available for season-service");
        };
        Map<String, Object> result = controller(broken).season();
        assertEquals(false, result.get("available"));
        assertEquals("IllegalStateException", result.get("reason"));
        assertTrue(result.containsKey("reason"), "要把原因留下，否则运维只看到一格 false");
    }
}
