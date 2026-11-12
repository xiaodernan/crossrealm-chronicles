package com.crossrealm.chronicles.game.leaderboard;

import com.crossrealm.chronicles.game.GameServiceProperties;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 内存排行榜：线程安全、无外部依赖。
 *
 * <p>两条优化（W-P1）：
 * <ul>
 *   <li><b>top-K 用最小堆维护</b>：旧版每次读榜都全表 `sorted(…).limit(k)`，
 *       O(n log n) 且会把整个优先区都排一遍。大 n 场景下读路径变成
 *       O(n log k)（k ≤ maxLimit，一般 ≤ 50），而且只让堆里存 k 条。</li>
 *   <li><b>读结果做了按 limit 的惰性 memo</b>：榜单读远多于写，写路径
 *       （{@link #add}）顺手清空缓存。<b>失效粒度是整表</b>而不是按 limit——
 *       榜上任何一条纪录可能挤进任意 k 档的头部，按档分别失效会把"刚提交的
 *       极速纪录没挤进 top(3) 却显示在 top(10)"做成一种契约上不可能但实现上
 *       可能的不一致，而这种不一致最难被测试发现。</li>
 * </ul>
 *
 * <p>播种的演示数据只在启动时写入一次，且仅用于联调/演示。
 */
@Service
public class LeaderboardService {

    private static final Comparator<RunRecord> BY_CLEAR_TIME_THEN_SUBMITTED =
            Comparator.comparingLong(RunRecord::clearTimeMs)
                    .thenComparing(RunRecord::submittedAt);

    private final GameServiceProperties properties;
    private final List<RunRecord> runs = new ArrayList<>();

    // W-P1：每个 limit 一份惰性快照。writes 清空整表，reads 命中零排序成本。
    private final Map<Integer, List<RunRecord>> topCache = new ConcurrentHashMap<>();
    private final AtomicLong cacheHits = new AtomicLong();
    private final AtomicLong cacheMisses = new AtomicLong();

    public LeaderboardService(GameServiceProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    void seedDemoData() {
        if (!properties.getLeaderboard().isSeedDemoData()) {
            return;
        }
        String now = Instant.now().toString();
        add(new RunRecord("横冲直撞的铁匠", "void-chronarch", 6_120_000L, 5, now));
        add(new RunRecord("误入荒野的学者", "shadow-warden", 4_830_000L, 5, now));
        add(new RunRecord("夜游者", "player", 7_200_000L, 1, now));
        add(new RunRecord("位面行者", "abyss-titan", 5_400_000L, 5, now));
        add(new RunRecord("渡鸦牧师", "magic-archon", 5_700_000L, 4, now));
    }

    public List<RunRecord> add(RunRecord run) {
        synchronized (runs) {
            runs.add(run);
            // 头条的每一次 add 都可能挤进任意 k 档的头部；整表失效是唯一
            // 永远不会漏的方案，而榜单写是低频路径，代价可以忽略。
            topCache.clear();
            return top(properties.getLeaderboard().getMaxLimit());
        }
    }

    /** 按用时升序（同用时按提交时间升序），取前 {@code limit} 行。 */
    public List<RunRecord> top(int limit) {
        int cap = Math.max(1, Math.min(limit, properties.getLeaderboard().getMaxLimit()));
        List<RunRecord> cached = topCache.get(cap);
        if (cached != null) {
            cacheHits.incrementAndGet();
            return cached;
        }
        cacheMisses.incrementAndGet();
        return topCache.computeIfAbsent(cap, this::rebuildTop);
    }

    /**
     * 全表重排出 cap 条，返回不可变语义的新列表。
     * 数据量小于 cap 时退回全排序（省掉堆的初始化，常路径更短）。
     */
    private List<RunRecord> rebuildTop(int cap) {
        synchronized (runs) {
            if (runs.size() <= cap) {
                return runs.stream().sorted(BY_CLEAR_TIME_THEN_SUBMITTED).toList();
            }
            // 大小固定 cap 的最小堆（顶端是当前第 cap 名）：比全量 sort 少动的比较次数
            // = O(n log k)，而且堆容量不随 n 增长，常数因子也更稳。
            PriorityQueue<RunRecord> heap = new PriorityQueue<>(cap, BY_CLEAR_TIME_THEN_SUBMITTED.reversed());
            for (RunRecord r : runs) {
                if (heap.size() < cap) {
                    heap.offer(r);
                } else if (BY_CLEAR_TIME_THEN_SUBMITTED.compare(r, heap.peek()) < 0) {
                    heap.poll();
                    heap.offer(r);
                }
            }
            return heap.stream().sorted(BY_CLEAR_TIME_THEN_SUBMITTED).toList();
        }
    }

    public int size() {
        synchronized (runs) {
            return runs.size();
        }
    }

    /** 缓存命中/未命中/当前缓存条目数，供 /api/ops/health 与调试面板使用。 */
    public Map<String, Object> cacheStats() {
        return Map.of(
                "hits", cacheHits.get(),
                "misses", cacheMisses.get(),
                "entries", topCache.size());
    }

    /** 全量聚合（W-P12 + W-M2）：总数/最快/最慢/平均/唯一 Boss/P50/P95。 */
    public Map<String, Object> stats() {
        synchronized (runs) {
            long fastest = runs.stream().mapToLong(RunRecord::clearTimeMs).min().orElse(0);
            long slowest = runs.stream().mapToLong(RunRecord::clearTimeMs).max().orElse(0);
            double avg = runs.stream().mapToLong(RunRecord::clearTimeMs).average().orElse(0.0);
            long uniqueBosses = runs.stream().map(RunRecord::bossId).distinct().count();
            // P50/P95 —— 排一次的 O(n log n)；maxEntries 常态 ≤ 1000，无需 quickselect。
            long[] times = runs.stream().mapToLong(RunRecord::clearTimeMs).sorted().toArray();
            int n = times.length;
            long p50 = n == 0 ? 0 : times[n / 2];
            long p95 = n == 0 ? 0 : times[Math.min(n - 1, (int) Math.ceil(n * 0.95) - 1)];
            Map<String, Object> result = new java.util.LinkedHashMap<>();
            result.put("total", runs.size());
            result.put("fastestMs", fastest);
            result.put("slowestMs", slowest);
            result.put("avgMs", Math.round(avg));
            result.put("uniqueBosses", uniqueBosses);
            result.put("p50Ms", p50);
            result.put("p95Ms", p95);
            return result;
        }
    }
}
