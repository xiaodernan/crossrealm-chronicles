package com.crossrealm.chronicles.game.leaderboard;

import com.crossrealm.chronicles.game.GameServiceProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LeaderboardServiceTest {

    private LeaderboardService service;

    @BeforeEach
    void setUp() {
        GameServiceProperties properties = new GameServiceProperties();
        properties.getLeaderboard().setSeedDemoData(true);
        properties.getLeaderboard().setMaxLimit(10);
        service = new LeaderboardService(properties);
        service.seedDemoData();
    }

    @Test
    void seedsDemoDataAndOrdersByClearTime() {
        List<RunRecord> top = service.top(10);
        assertEquals(5, top.size());
        for (int i = 1; i < top.size(); i++) {
            assertTrue(top.get(i - 1).clearTimeMs() <= top.get(i).clearTimeMs(),
                    "排行榜必须按用时升序");
        }
    }

    @Test
    void topHonorsLimitAndMaxLimit() {
        List<RunRecord> top = service.top(3);
        assertEquals(3, top.size());
        // 超过记录条数的请求被夹回"现有条数"（seedDemoData 只播了 5 条）
        assertEquals(5, service.top(999).size());
    }

    @Test
    void addRecordKeepsListSorted() {
        service.add(new RunRecord("极速玩家", "shadow-warden", 1_000_000L, 5, "2999-01-01T00:00:00Z"));
        List<RunRecord> top = service.top(10);
        assertEquals("极速玩家", top.get(0).runner(), "新提交的快通记录应排到最前");
    }
}
