package com.crossrealm.chronicles.game.leaderboard;

import com.crossrealm.chronicles.game.GameServiceProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-P1：top-K 堆化 + 惰性 memo 的两个性质测试。
 *
 * <p>这个测试不钉死实现（不用问 hit/miss 各几次），钉死的是**语义**：
 * 无论底层是全排序还是堆，连续读 + 中途插入 之后读出来的序列必须逐条等于参考实现。
 */
class LeaderboardTopKTest {

    private LeaderboardService service;

    @BeforeEach
    void setUp() {
        GameServiceProperties properties = new GameServiceProperties();
        properties.getLeaderboard().setSeedDemoData(false);   // 用受控数据驱动
        properties.getLeaderboard().setMaxLimit(10);
        service = new LeaderboardService(properties);
    }

    private static final Comparator<RunRecord> REF =
            Comparator.comparingLong(RunRecord::clearTimeMs)
                    .thenComparing(RunRecord::submittedAt);

    private static List<RunRecord> referenceTop(List<RunRecord> all, int k) {
        return all.stream().sorted(REF).limit(k).toList();
    }

    private void seed(int n, long seed) {
        Random rnd = new Random(seed);
        for (int i = 0; i < n; i++) {
            // clearTimeMs 取 1..2_000_000_000 的宽分布，制造真实竞争；
            // submittedAt 让重名竞争有一个稳定的第二关键字
            long t = Math.abs(rnd.nextLong() % 2_000_000_000L) + 1;
            service.add(new RunRecord("r" + i, "boss-" + (i % 7), t, 1 + (i % 5), "2026-01-01T00:00:" + String.format("%02d", i % 60) + "Z"));
        }
    }

    @Test
    void topMatchesReferenceSortOnLargeDataset() {
        seed(1_000, 42);
        List<RunRecord> ref = referenceTop(new ArrayList<>(serviceRuns(service)), 10);
        List<RunRecord> got = service.top(10);
        assertEquals(ref.size(), got.size());
        for (int i = 0; i < ref.size(); i++) {
            assertEquals(ref.get(i).runner(), got.get(i).runner(), "第 " + i + " 位排序不对");
            assertEquals(ref.get(i).clearTimeMs(), got.get(i).clearTimeMs());
        }
    }

    @Test
    void cacheHitsAccumulateOnRepeatedReadsWithoutWrites() {
        seed(50, 7);
        service.top(10);  // 稳定：seed 之后表里已有入口（最后一次 add 建立的）
        long hitsBefore = hits(service);
        long missesBefore = ((Number) service.cacheStats().get("misses")).longValue();
        service.top(10);
        service.top(10);
        service.top(10);
        assertEquals(hitsBefore + 3, hits(service), "三次读取零写、limit 不变，应该全部命中");
        long missesAfter = ((Number) service.cacheStats().get("misses")).longValue();
        assertEquals(missesBefore, missesAfter, "三次读取期间不应发生一次重建");
    }

    @Test
    void addInvalidatesCache() {
        seed(20, 9);
        List<RunRecord> before = service.top(5);
        // 插入一条远超第一名的极速纪录：缓存必须整表失效，新的 top(5) 一定要含这条
        service.add(new RunRecord("秒通的哥", "chaos-overlord", 1L, 5, "2999-12-31T00:00:00Z"));
        List<RunRecord> after = service.top(5);
        assertEquals("秒通的哥", after.get(0).runner(), "插入最快纪录后榜首没变——缓存没有失效");
        // 再读两次：这两次都应当命中（证明缓存已经按新表重建，而不是每次重建）
        long hitsBefore = hits(service);
        service.top(5);
        service.top(5);
        assertTrue(hits(service) >= hitsBefore + 2);
    }

    /** 通过反射拿内部 runs 列表——只在测试侧使用，断言对象身份与顺序 */
    private static List<RunRecord> serviceRuns(LeaderboardService s) {
        try {
            java.lang.reflect.Field f = LeaderboardService.class.getDeclaredField("runs");
            f.setAccessible(true);
            return new ArrayList<>((List<RunRecord>) f.get(s));
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private static long hits(LeaderboardService s) {
        return ((Number) s.cacheStats().get("hits")).longValue();
    }
}
