package com.crossrealm.chronicles.game.trial;

import com.crossrealm.chronicles.game.GameServiceProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 位面试炼榜的次序门禁（W-F3 切片6）。
 *
 * <p>这一层量的是**次序**，不是"能不能存"：榜单唯一的正确性就是"谁在前"。
 * 四条判据各自独立 —— 分数、层数、剩余秒、提交时间 —— 因为把它们合成一个"综合分"
 * 之后就再也解释不清"为什么他排我前面"。
 */
class TrialLeaderboardServiceTest {

    private GameServiceProperties properties;
    private TrialLeaderboardService service;

    @BeforeEach
    void setUp() {
        properties = new GameServiceProperties();
        properties.getTrial().setSeedDemoData(true);
        properties.getTrial().setMaxLimit(10);
        properties.getTrial().setMaxEntries(500);
        service = new TrialLeaderboardService(properties);
        service.seedDemoData();
    }

    private List<String> runners(String season, int limit) {
        return service.top(season, limit).stream().map(TrialRun::runner).toList();
    }

    @Test
    @DisplayName("播种之后按分数降序（与 Boss 榜的用时升序相反）")
    void seedsAndOrdersByScoreDescending() {
        List<TrialRun> top = service.top(null, 10);
        assertEquals(5, top.size());
        for (int i = 1; i < top.size(); i++) {
            assertTrue(top.get(i - 1).score() >= top.get(i).score(),
                    "试炼榜必须按分数降序");
        }
    }

    @Test
    @DisplayName("同分先看层数、再看剩余秒数、最后按提交时间（先做到的在前）")
    void tiesBreakByLayersThenSecondsThenTime() {
        // 独立赛季：不跟播种数据混在一起
        service.add(new TrialRun("少的", "tie", 500, 5, 0, "2026-01-01T00:00:00Z"));
        service.add(new TrialRun("多的", "tie", 500, 5, 30, "2026-01-01T00:00:01Z"));
        service.add(new TrialRun("浅的", "tie", 500, 4, 100, "2026-01-01T00:00:02Z"));
        service.add(new TrialRun("早的", "tie-2", 400, 4, 0, "2026-01-01T00:00:00Z"));
        service.add(new TrialRun("晚的", "tie-2", 400, 4, 0, "2026-01-01T00:00:09Z"));

        assertEquals(List.of("多的", "少的", "浅的"), runners("tie", 10));
        assertEquals(List.of("早的", "晚的"), runners("tie-2", 10));
    }

    @Test
    @DisplayName("按赛季过滤；缺省/空白 = 不分赛季（跨季总榜）")
    void filtersBySeason() {
        assertEquals(5, service.top(null, 50).size());
        assertEquals(5, service.top("  ", 50).size());
        for (TrialRun r : service.top("ember", 50)) {
            assertEquals("ember", r.seasonId());
        }
        assertEquals(0, service.top("no-such-season", 50).size());
    }

    @Test
    @DisplayName("limit 被夹到 [1, maxLimit] —— 传 0 或 999 都不该炸")
    void limitIsClamped() {
        properties.getTrial().setMaxLimit(3);
        assertEquals(3, service.top(null, 999).size());
        assertEquals(1, service.top(null, 0).size());
        assertEquals(1, service.top(null, -7).size());
    }

    @Test
    @DisplayName("超出 maxEntries 时丢**最老**的一条（不是丢最差的）")
    void trimsOldestBeyondMaxEntries() {
        GameServiceProperties p = new GameServiceProperties();
        p.getTrial().setSeedDemoData(false);
        p.getTrial().setMaxEntries(3);
        p.getTrial().setMaxLimit(50);
        TrialLeaderboardService s = new TrialLeaderboardService(p);
        for (int i = 0; i < 6; i++) {
            s.add(new TrialRun("r" + i, "s", i, 1, 0, "2026-01-01T00:00:0" + i + "Z"));
        }
        assertEquals(3, s.size());
        assertEquals(List.of("r5", "r4", "r3"),
                s.top("s", 10).stream().map(TrialRun::runner).toList());
    }

    @Test
    @DisplayName("关掉播种时榜是空的（不是一条假数据）")
    void seedingCanBeDisabled() {
        GameServiceProperties p = new GameServiceProperties();
        p.getTrial().setSeedDemoData(false);
        TrialLeaderboardService s = new TrialLeaderboardService(p);
        s.seedDemoData();
        assertEquals(0, s.size());
        assertEquals(0, s.top(null, 10).size());
    }

    @Test
    @DisplayName("add 回来的就是新榜（客户端拿它直接刷页面）")
    void addReturnsFreshBoard() {
        List<TrialRun> board = service.add(new TrialRun("新来的", "ember", 999, 5, 199, "2026-01-01T00:00:00Z"));
        assertEquals("新来的", board.get(0).runner());
        assertEquals(6, service.size());
    }
}
