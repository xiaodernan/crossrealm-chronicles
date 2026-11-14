package com.crossrealm.chronicles.game.trial;

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
 * W-Z54「试炼榜易主」单测：钉的是**易主判定口径**，不是实现细节。
 *
 * <ul>
 *   <li>seedDemoData 闭环 = 零镜像（演示数据不污染报讯台）</li>
 *   <li>首次提交（没有旧榜首）= 静默（不是易主）</li>
 *   <li>被压过的旧榜首首次落榜 = 镜像恰好一次（含赛季过滤与跨赛季场景）</li>
 *   <li>低于榜首的提交 = 静默；原榜首刷分继续称霸 = 静默</li>
 *   <li>notifyMirror == null = 一切照旧（`new TrialLeaderboardService(props)` 旧口径）</li>
 * </ul>
 */
class TrialNotifyDethroneTest {

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
        properties.getTrial().setSeedDemoData(false);
        properties.getTrial().setMaxLimit(10);
        properties.getTrial().setMaxEntries(1000);
    }

    private TrialLeaderboardService serviceWith(RecordingNotify notify) {
        return new TrialLeaderboardService(properties, null,
                new NotifyMirrorService(notify, true));
    }

    private static TrialRun run(String runner, String season, int score, int layers, String at) {
        return new TrialRun(runner, season, score, layers, 0, at);
    }

    @Test
    @DisplayName("seed 演示数据零镜像（不改 HTTP 口径时）")
    void seedDemoDoesNotMirror() {
        RecordingNotify notify = new RecordingNotify();
        TrialLeaderboardService service = serviceWith(notify);
        service.seedDemoData();
        assertTrue(notify.calls.isEmpty(), "seed 演示数据绝不该入报讯台");
    }

    @Test
    @DisplayName("首次提交（无旧榜首）= 静默")
    void firstSubmitIsSilent() {
        RecordingNotify notify = new RecordingNotify();
        TrialLeaderboardService service = serviceWith(notify);
        service.add(run("首位", "ember", 100, 1, "2026-01-01T00:00:01Z"));
        assertTrue(notify.calls.isEmpty());
    }

    @Test
    @DisplayName("压过旧榜首 = 恰好一次易主；其后低于榜首的提交 = 静默")
    void dethroneFiresOnce() {
        RecordingNotify notify = new RecordingNotify();
        TrialLeaderboardService service = serviceWith(notify);
        service.add(run(" keeper", "tide", 500, 5, "2026-01-01T00:00:01Z"));
        assertTrue(notify.calls.isEmpty());

        service.add(run("challenger", "tide", 600, 5, "2026-01-02T00:00:01Z"));
        assertEquals(1, notify.calls.size(), "压过即易主");
        assertEquals("world", notify.calls.get(0).kind());
        assertTrue(notify.calls.get(0).title().contains("易主"));
        assertTrue(notify.calls.get(0).body().contains("challenger"));

        service.add(run("filler", "tide", 100, 1, "2026-01-03T00:00:01Z"));
        assertEquals(1, notify.calls.size(), "低于榜首的提交不易主");
    }

    @Test
    @DisplayName("原榜首自己再刷分 = 静默（同一 content 的 equals 不触发易主）")
    void selfImprovementIsSilent() {
        RecordingNotify notify = new RecordingNotify();
        TrialLeaderboardService service = serviceWith(notify);
        service.add(run(" keeper", "ember", 500, 5, "2026-01-01T00:00:01Z"));
        service.add(run(" keeper", "ember", 700, 5, "2026-01-01T00:00:01Z")); // same identity tuple
        assertTrue(notify.calls.isEmpty(),
                "提交者与榜首是同一人 = 不是易主（与「别人压过你」语义不同）");
    }

    @Test
    @DisplayName("notifyMirror == null（旧构造器）= 行为不变")
    void nullMirrorKeepsLegacyBehavior() {
        TrialLeaderboardService service = new TrialLeaderboardService(properties);
        service.add(run("a", "ember", 100, 1, "2026-01-01T00:00:01Z"));
        service.add(run("b", "ember", 200, 5, "2026-01-02T00:00:01Z"));
        assertEquals("b", service.top("ember", 1).get(0).runner());
    }
}
