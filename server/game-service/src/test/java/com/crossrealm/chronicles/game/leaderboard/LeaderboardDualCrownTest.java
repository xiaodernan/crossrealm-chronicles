package com.crossrealm.chronicles.game.leaderboard;

import com.crossrealm.chronicles.game.GameServiceProperties;
import com.crossrealm.chronicles.game.notify.NotifyAck;
import com.crossrealm.chronicles.game.notify.NotifyClient;
import com.crossrealm.chronicles.game.notify.NotifyEvent;
import com.crossrealm.chronicles.game.notify.NotifyMirrorService;
import com.crossrealm.chronicles.game.trial.TrialLeaderboardService;
import com.crossrealm.chronicles.game.trial.TrialRun;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-Z60「双冠」—— 首领榜皇位易主 + 试炼榜已加冕 = 世界级新闻。
 *
 * <p>钉的是双冠的**触发口径**：
 * <ol>
 *   <li>易主 + 这位玩家正戴着试炼榜皇冠 → 单冠报讯 + 双冠报讯各一条</li>
 *   <li>易主但新王没有试炼榜皇冠 → 只有单冠报讯</li>
 *   <li>本人刷新自己的首领榜纪录 → 一条都不镜（连双冠也不）</li>
 *   <li>trialCrownCheck == null（旧构造路径）→ 行为与 W-Z56 完全一致</li>
 * </ol>
 */
class LeaderboardDualCrownTest {

    private GameServiceProperties properties;
    private GameServiceProperties trialProperties;

    static class RecordingNotify implements NotifyClient {
        final List<NotifyEvent> calls = new ArrayList<>();
        @Override
        public NotifyAck publish(NotifyEvent event) {
            calls.add(event);
            return new NotifyAck("id", event.kind(), true, false);
        }
    }

    @BeforeEach
    void setUp() {
        properties = new GameServiceProperties();
        properties.getLeaderboard().setSeedDemoData(false);
        properties.getLeaderboard().setMaxLimit(10);
        trialProperties = new GameServiceProperties();
        trialProperties.getTrial().setSeedDemoData(false);
    }

    private static RunRecord run(String runner, long clearTimeMs, String at) {
        return new RunRecord(runner, "shadow-warden", clearTimeMs, 5, at);
    }

    private TrialLeaderboardService trialsWithCrown(String runner) {
        TrialLeaderboardService trials = new TrialLeaderboardService(trialProperties, null, null);
        trials.add(new TrialRun(runner, "ember", 900, 5, 90, "2026-01-01T00:00:00Z"));
        return trials;
    }

    @Test
    @DisplayName("易主 + 新王已是试炼榜冠军 → 单冠 + 双冠各一条，双冠带 season")
    void dualCrownFiresWithDethrone() {
        RecordingNotify notify = new RecordingNotify();
        TrialLeaderboardService trials = trialsWithCrown("keeper");
        LeaderboardService service = new LeaderboardService(properties, null,
                new NotifyMirrorService(notify, true), trials);
        // 首次提交：无旧榜首 → 全程静默
        service.add(run("challenger", 6_000_000L, "2026-01-01T00:00:01Z"));
        assertTrue(notify.calls.isEmpty());
        // challenger 只是首领榜王，没有试炼冠 → 只有单冠报讯
        service.add(run("newborn", 5_000_000L, "2026-01-02T00:00:01Z"));
        assertEquals(1, notify.calls.size());
        assertTrue(notify.calls.get(0).title().contains("首领速通新王"));
        // "keeper"（试炼冠军）挤下 newborn → 单冠 + 双冠 = 2 条
        service.add(run("keeper", 4_000_000L, "2026-01-03T00:00:01Z"));
        assertEquals(3, notify.calls.size());
        NotifyEvent dualCrown = notify.calls.get(2);
        assertEquals("world", dualCrown.kind());
        assertTrue(dualCrown.title().contains("双冠"), dualCrown.title());
        assertTrue(dualCrown.body().contains("keeper"), dualCrown.body());
        assertTrue(dualCrown.body().contains("ember"), dualCrown.body());
    }

    @Test
    @DisplayName("本人刷新自己的首领纪录（+ 试炼皇冠）→ 一条都不镜")
    void selfRefreshStaysSilentEvenForDual() {
        RecordingNotify notify = new RecordingNotify();
        TrialLeaderboardService trials = trialsWithCrown("keeper");
        LeaderboardService service = new LeaderboardService(properties, null,
                new NotifyMirrorService(notify, true), trials);
        service.add(run("keeper", 6_000_000L, "2026-01-01T00:00:01Z"));
        service.add(run("keeper", 5_000_000L, "2026-01-02T00:00:01Z")); // 自己刷新自己
        assertTrue(notify.calls.isEmpty());
    }

    @Test
    @DisplayName("trialCrownCheck == null（旧构造路径）→ 单冠照发、双冠为零")
    void nullCrownCheckKeepsLegacyBehavior() {
        RecordingNotify notify = new RecordingNotify();
        LeaderboardService service = new LeaderboardService(properties, null,
                new NotifyMirrorService(notify, true));
        service.add(run("a", 6_000_000L, "2026-01-01T00:00:01Z"));
        service.add(run("b", 5_000_000L, "2026-01-02T00:00:01Z"));
        assertEquals(1, notify.calls.size());
        assertTrue(notify.calls.get(0).title().contains("首领速通新王"));
    }

    @Test
    @DisplayName("新王有多季试炼皇冠 → 双冠 body 列出季节（最多 3 个，去重）")
    void multipleTrialCrownsListSeasons() {
        RecordingNotify notify = new RecordingNotify();
        TrialLeaderboardService trials = new TrialLeaderboardService(trialProperties, null, null);
        trials.add(new TrialRun("keeper", "ember", 900, 5, 90, "2026-01-01T00:00:00Z"));
        trials.add(new TrialRun("keeper", "tide", 800, 5, 80, "2026-01-01T00:00:00Z"));
        LeaderboardService service = new LeaderboardService(properties, null,
                new NotifyMirrorService(notify, true), trials);
        service.add(run("a", 6_000_000L, "2026-01-01T00:00:01Z"));
        service.add(run("keeper", 5_000_000L, "2026-01-02T00:00:01Z"));
        NotifyEvent dualCrown = notify.calls.get(1);
        assertTrue(dualCrown.body().contains("ember"), dualCrown.body());
        assertTrue(dualCrown.body().contains("tide"), dualCrown.body());
    }
}
