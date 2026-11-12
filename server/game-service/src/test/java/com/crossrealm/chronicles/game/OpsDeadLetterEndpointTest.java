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
 * `/api/ops/dead-letter` 的三扇门（W-Z8 切片3）。不拉 Spring 上下文：
 *
 * - 快乐路径：白名单 items 透传 + 直方图（同一 reason 合并计数）；
 * - fallbackFactory 空 Map → available:false + reason:fallback（不编造）；
 * - 直抛 → available:false + reason:<异常类名>（本地兜底）。
 */
class OpsDeadLetterEndpointTest {

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
                "game-service");
    }

    private static AiServiceClient stub(Map<String, Object> deadLetter) {
        return new AiServiceClient() {
            @Override public Map<String, Object> health() { return Map.of("configured", true); }
            @Override public Map<String, Object> jobsStats() { return Map.of("capacity", 64L); }
            @Override public Map<String, Object> deadLetter() { return deadLetter; }
        };
    }

    @Test
    @DisplayName("items 透传 + 直方图：not-configured ×2 / upstream-500 ×1")
    void deadLetterIsPassedThrough() {
        List<Map<String, Object>> items = List.of(
                Map.of("id", "j1", "reason", "not-configured", "attempts", 1L),
                Map.of("id", "j2", "reason", "not-configured", "attempts", 1L),
                Map.of("id", "j3", "reason", "upstream-500", "attempts", 3L));
        Map<String, Object> result = controller(stub(Map.of("items", items, "count", 3L, "limit", 20L))).deadLetter();

        assertTrue((Boolean) result.get("available"));
        assertEquals(3L, result.get("count"));

        @SuppressWarnings("unchecked")
        Map<String, Long> reasons = (Map<String, Long>) result.get("reasons");
        assertEquals(Map.of("not-configured", 2L, "upstream-500", 1L), reasons);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> out = (List<Map<String, Object>>) result.get("items");
        assertEquals("j1", out.get(0).get("id"), "白名单 items 原样透传（不加工、不加字段）");
    }

    @Test
    @DisplayName("空 items → reasons:{} / count 原样，但 available=true（空信件不是失败）")
    void emptyItemsIsNotAnError() {
        Map<String, Object> result = controller(stub(Map.of("items", List.of(), "count", 0L, "limit", 20L))).deadLetter();
        assertEquals(true, result.get("available"));
        @SuppressWarnings("unchecked")
        Map<String, Long> reasons = (Map<String, Long>) result.get("reasons");
        assertTrue(reasons.isEmpty());
    }

    @Test
    @DisplayName("fallbackFactory 空 Map：available=false + reason:fallback，不编造 reasons")
    void emptyFallbackIsHonest() {
        Map<String, Object> result = controller(stub(Map.of())).deadLetter();
        assertEquals(false, result.get("available"));
        assertEquals("fallback", result.get("reason"));
        assertFalse(result.containsKey("reasons"));
    }

    @Test
    @DisplayName("stub 直抛：仍然 200 + available=false（本地兜底层）")
    void throwingClientIsCaughtLocally() {
        AiServiceClient broken = new AiServiceClient() {
            @Override public Map<String, Object> health() { throw new IllegalStateException("boom"); }
            @Override public Map<String, Object> jobsStats() { throw new IllegalStateException("boom"); }
            @Override public Map<String, Object> deadLetter() { throw new IllegalStateException("no instances"); }
        };
        Map<String, Object> result = controller(broken).deadLetter();
        assertEquals(false, result.get("available"));
        assertEquals("IllegalStateException", result.get("reason"));
    }
}
