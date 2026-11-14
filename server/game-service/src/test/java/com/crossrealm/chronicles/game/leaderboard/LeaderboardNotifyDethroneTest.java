package com.crossrealm.chronicles.game.leaderboard;

import com.crossrealm.chronicles.game.GameServiceProperties;
import com.crossrealm.chronicles.game.notify.NotifyClient;
import com.crossrealm.chronicles.game.notify.NotifyEvent;
import com.crossrealm.chronicles.game.notify.NotifyMirrorService;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-Z56「首领速通新王」单测：钉的是**易主判定口径**，不是实现细节。
 *
 * <ul>
 *   <li>seed 演示数据零镜像</li>
 *   <li>首次提交（无旧榜首）= 静默</li>
 *   <li>更快的成绩挤下旧榜首 = 恰好一次易主，且带 Boss 中文名与用时</li>
 *   <li>更慢的成绩挤不进第一名 = 静默</li>
 *   <li>同一玩家刷新自己的纪录 = 静默（换位才算易主）</li>
 *   <li>notifyMirror == null（旧构造器）= 行为不变</li>
 * </ul>
 */
class LeaderboardNotifyDethroneTest {

    private GameServiceProperties properties;

    static class RecordingNotify implements NotifyClient {
        final List<NotifyEvent> calls = new ArrayList<>();
        @Override
        public com.crossrealm.chronicles.game.notify.NotifyAck publish(NotifyEvent event) {
            calls.add(event);
            return new com.crossrealm.chronicles.game.notify.NotifyAck("id", event.kind(), true, false);
        }
    }

    @BeforeEach
    void setUp() {
        properties = new GameServiceProperties();
        properties.getLeaderboard().setSeedDemoData(false);
        properties.getLeaderboard().setMaxLimit(10);
    }

    private LeaderboardService serviceWith(RecordingNotify notify) {
        return new LeaderboardService(properties, null,
                new NotifyMirrorService(notify, true));
    }

    private static RunRecord run(String runner, String bossId, long clearTimeMs, String at) {
        return new RunRecord(runner, bossId, clearTimeMs, 5, at);
    }

    @Test
    @DisplayName("seed 演示数据零镜像")
    void seedDemoDoesNotMirror() {
        RecordingNotify notify = new RecordingNotify();
        LeaderboardService service = serviceWith(notify);
        service.seedDemoData();
        assertTrue(notify.calls.isEmpty(), "seed 演示数据绝不该入报讯台");
    }

    @Test
    @DisplayName("首次提交（无旧榜首）= 静默")
    void firstSubmitIsSilent() {
        RecordingNotify notify = new RecordingNotify();
        LeaderboardService service = serviceWith(notify);
        service.add(run("首位", "shadow-warden", 6_000_000L, "2026-01-01T00:00:01Z"));
        assertTrue(notify.calls.isEmpty());
    }

    @Test
    @DisplayName("压过旧榜首 = 恰好一次易主，body 带中文名与用时")
    void dethroneFiresOnce() {
        RecordingNotify notify = new RecordingNotify();
        LeaderboardService service = serviceWith(notify);
        service.add(run(" keeper", "shadow-warden", 6_000_000L, "2026-01-01T00:00:01Z"));
        assertTrue(notify.calls.isEmpty());

        service.add(run(" challenger", "shadow-warden", 5_000_000L, "2026-01-02T00:00:01Z"));
        assertEquals(1, notify.calls.size(), "更快即易主");
        NotifyEvent sent = notify.calls.get(0);
        assertEquals("world", sent.kind());
        assertTrue(sent.title().contains("首领速通新王"), sent.title());
        assertTrue(sent.body().contains("影界守护者"), sent.body());
        assertTrue(sent.body().contains("1:23"), sent.body()); // 5_000_000 ms = 5000 s = 1h 23m 20s → 格式 "1:23:20"
    }

    @Test
    @DisplayName("慢于旧榜首的成绩 = 静默；同一玩家刷新自己纪录 = 静默")
    void slowerSubmissionIsSilent() {
        RecordingNotify notify = new RecordingNotify();
        LeaderboardService service = serviceWith(notify);
        service.add(run("keeper", "shadow-warden", 5_000_000L, "2026-01-01T00:00:01Z"));
        service.add(run("slow", "shadow-warden", 7_000_000L, "2026-01-02T00:00:01Z"));
        service.add(run("keeper", "shadow-warden", 4_000_000L, "2026-01-03T00:00:01Z")); // 同一人刷新
        assertTrue(notify.calls.isEmpty(), "更慢的成绩与本人刷新自己纪录都不是易主");
    }

    @Test
    @DisplayName("notifyMirror == null（旧构造器）= 行为不变")
    void nullMirrorKeepsLegacyBehavior() {
        LeaderboardService service = new LeaderboardService(properties);
        service.add(run("a", "shadow-warden", 5_000_000L, "2026-01-01T00:00:01Z"));
        service.add(run("b", "shadow-warden", 4_000_000L, "2026-01-02T00:00:01Z"));
        assertEquals("b", service.top(1).get(0).runner());
    }
}
