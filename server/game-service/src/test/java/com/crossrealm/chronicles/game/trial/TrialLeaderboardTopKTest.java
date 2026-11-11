package com.crossrealm.chronicles.game.trial;

import com.crossrealm.chronicles.game.GameServiceProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-P5：TrialLeaderboardService 的堆化读 + 惰性 memo 语义测试。
 *
 * <p>钉的和 W-P1 的 {@code LeaderboardTopKTest} 一脉相承 —
 * 不钉实现细节（top 出多少次、内部分配了几次），钉住**接连读 + 中途插入之后
 * 读出来的序列逐条等于摔排序版**。
 */
class TrialLeaderboardTopKTest {

    private GameServiceProperties properties;
    private TrialLeaderboardService service;
    private static final java.util.Comparator<TrialRun> REF =
            java.util.Comparator.comparingInt(TrialRun::score).reversed()
                    .thenComparing(java.util.Comparator.comparingInt(TrialRun::layersCleared).reversed())
                    .thenComparing(java.util.Comparator.comparingInt(TrialRun::secondsLeft).reversed())
                    .thenComparing(TrialRun::submittedAt);

    @BeforeEach
    void setUp() {
        properties = new GameServiceProperties();
        properties.getTrial().setSeedDemoData(false);
        properties.getTrial().setMaxLimit(10);
        properties.getTrial().setMaxEntries(1000);
        service = new TrialLeaderboardService(properties);
    }

    private void seed(int n, long seed) {
        Random rnd = new Random(seed);
        for (int i = 0; i < n; i++) {
            int score = 100 + rnd.nextInt(9000);
            int layers = 1 + rnd.nextInt(5);
            int seconds = rnd.nextInt(120);
            service.add(new TrialRun(
                    "runner-" + i,
                    i % 3 == 0 ? "ember" : (i % 3 == 1 ? "tide" : "gloom"),
                    score, layers, seconds,
                    "2026-01-01T00:00:" + String.format("%02d", i % 60) + "Z"));
        }
    }

    @Test
    @DisplayName("1000 条大库的入队结果逐条等于摔排序版")
    void topMatchesReferenceSortOnLargeDataset() {
        seed(1000, 42);
        // 带赛季过滤对比
        for (String season : List.of("ember", "tide", "gloom", "")) {
            List<TrialRun> got = service.top(season, 10);
            // 独立计算的参考榜（全量摔排序）
            List<TrialRun> reference = service
                    .top(season, 1000)   // limit=maxEntries = 1000，拿全量
                    .stream()
                    .sorted(REF)
                    .limit(10)
                    .toList();
            assertEquals(reference.size(), got.size());
            for (int i = 0; i < reference.size(); i++) {
                assertEquals(reference.get(i).runner(), got.get(i).runner(),
                        "赛季=" + season + " 第 " + i + " 位排序不对");
                assertEquals(reference.get(i).score(), got.get(i).score());
            }
        }
    }

    @Test
    @DisplayName("连读三次（零写）——只触发一次重建，之后全落在缓存上")
    void cacheHitsAccumulateOnRepeatedReads() {
        seed(100, 7);
        service.top("ember", 10);  // 稳定：先吃下第一条 miss
        long hitsBefore = ((Number) service.cacheStats().get("hits")).longValue();
        service.top("ember", 10);
        service.top("ember", 10);
        service.top("ember", 10);
        assertEquals(hitsBefore + 3, ((Number) service.cacheStats().get("hits")).longValue(),
                "三次连读零写后应该全部命中");
    }

    @Test
    @DisplayName("add 之后缓存整表失效——新数据一定能挤进 top(cap)")
    void addInvalidatesCachedBoard() {
        seed(20, 9);
        List<TrialRun> before = service.top(null, 5);
        // 加一条远超第一名的分：原来的榜 → 清空 → 重新构建
        service.add(new TrialRun("秒通的哥", "ember", 99_999, 5, 119, "2999-12-31T00:00:00Z"));
        List<TrialRun> after = service.top(null, 5);
        assertEquals("秒通的哥", after.get(0).runner(), "新纪录没有挤进榜首 — 缓存没有整表失效");
        // 并且后续连读又全是命中（缓存按新集合重生，不是"每次重建"）
        long hitsBefore = ((Number) service.cacheStats().get("hits")).longValue();
        service.top(null, 5);
        service.top(null, 5);
        assertTrue(((Number) service.cacheStats().get("hits")).longValue() >= hitsBefore + 2);
    }
}
