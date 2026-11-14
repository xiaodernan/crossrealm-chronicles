package com.crossrealm.chronicles.game;

import com.crossrealm.chronicles.game.ai.AiServiceClient;
import com.crossrealm.chronicles.game.leaderboard.LeaderboardService;
import com.crossrealm.chronicles.game.notify.NotifyAck;
import com.crossrealm.chronicles.game.notify.NotifyClient;
import com.crossrealm.chronicles.game.notify.NotifyEvent;
import com.crossrealm.chronicles.game.notify.NotifyMirrorService;
import com.crossrealm.chronicles.game.season.SeasonSnapshot;
import com.crossrealm.chronicles.game.telemetry.TelemetryService;
import com.crossrealm.chronicles.game.trial.TrialLeaderboardService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-Z59：`/api/ops/health` 的 `notifyMirrors` 节 —— 报讯流到没到没到不靠翻日志回答。
 *
 * - bean 装配且启用：四类镜像依次走一遍 → published 各类计数 +1、total=4
 * - bean 没装配（@Nullable=null）：`{available:false}`（如实沉默，与 seasonBroadcastReceived=-1 同族）
 * - bean 装配但 disabled：`{available:true, published:{...total:0}}`（“装了但关着”要与“没装”区分开）
 */
class OpsHealthNotifyTest {

    private static AiServiceClient stubAdvisor() {
        return new AiServiceClient() {
            @Override
            public Map<String, Object> health() {
                return Map.of("configured", false);
            }

            @Override
            public Map<String, Object> jobsStats() {
                return Map.of("capacity", 64L);
            }

            @Override
            public Map<String, Object> deadLetter() {
                return Map.of("items", List.of(), "count", 0L, "limit", 20L);
            }
        };
    }

    private static OpsController controller(NotifyMirrorService mirror) {
        GameServiceProperties properties = new GameServiceProperties();
        return new OpsController(
                properties,
                new LeaderboardService(properties),
                new TrialLeaderboardService(properties),
                new TelemetryService(properties),
                SeasonSnapshot::unavailable,
                stubAdvisor(),
                new RequestCountFilter(),
                new com.crossrealm.chronicles.game.cache.TtlCache(),
                null,
                "game-service",
                null,
                null,
                mirror);
    }

    static class RecordingClient implements NotifyClient {
        @Override
        public NotifyAck publish(NotifyEvent event) {
            return new NotifyAck("id-" + event.kind(), event.kind(), true, false);
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> published(Map<String, Object> health) {
        Map<String, Object> notifyMirrors = (Map<String, Object>) health.get("notifyMirrors");
        assertEquals(true, notifyMirrors.get("available"));
        return (Map<String, Object>) notifyMirrors.get("published");
    }

    @Test
    @DisplayName("bean 装配且启用 → 五类镜像计数齐全、total=5")
    void countsEveryMirror() {
        NotifyMirrorService mirror = new NotifyMirrorService(new RecordingClient(), true);
        mirror.mirror("boss_defeated", "shadow-warden");
        mirror.mirrorTrialDethrone("沉默的琴师", "ember", 90, 3);
        mirror.mirrorSeasonAdvance("ember");
        mirror.mirrorLeaderboardDethrone("沉默的琴师", "shadow-warden", 5_000_000L);
        mirror.mirrorDualCrown("沉默的琴师", java.util.List.of("ember"));

        Map<String, Object> health = controller(mirror).health(null);
        Map<String, Object> pub = published(health);
        assertEquals(1L, pub.get("bossDefeated"));
        assertEquals(1L, pub.get("seasonAdvance"));
        assertEquals(1L, pub.get("trialDethrone"));
        assertEquals(1L, pub.get("leaderboardDethrone"));
        assertEquals(1L, pub.get("dualCrown"));
        assertEquals(5L, pub.get("total"));
    }

    @Test
    @DisplayName("bean 没装配 → available=false（从不谎称走过）")
    void absentMirrorIsHonest() {
        Map<String, Object> health = controller(null).health(null);
        @SuppressWarnings("unchecked")
        Map<String, Object> notifyMirrors = (Map<String, Object>) health.get("notifyMirrors");
        assertEquals(false, notifyMirrors.get("available"));
    }

    @Test
    @DisplayName("bean 装配但 enabled=false → available=true、total=0")
    void disabledBeanShowsZeroNotAbsent() {
        NotifyMirrorService mirror = new NotifyMirrorService(new RecordingClient(), false);
        assertTrue(!mirror.mirror("boss_defeated", "shadow-warden"));
        Map<String, Object> health = controller(mirror).health(null);
        Map<String, Object> pub = published(health);
        assertEquals(0L, pub.get("total"));
    }
}
