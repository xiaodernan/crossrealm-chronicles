package com.crossrealm.chronicles.game.trial;

import com.crossrealm.chronicles.game.GameServiceProperties;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.lang.Nullable;
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
 * 位面试炼的内存榜：线程安全、无外部依赖（与 Boss 榜同一套做法）。
 *
 * <p>两条优化（W-P5），与 Boss 榜（W-P1）完全一致：
 * <ul>
 *   <li><b>按 limit 惰性 memo</b>：一次过的 top(season, limit) 结果按
 *       {@code season:limit} 键缓存。写（{@link #add}）时整表清空。</li>
 *   <li><b>按赛季分桶的最小堆</b>：大库时只维持 top-cap 而不是全排序 —
 *       堆容量固定 cap，扫一遍入堆 O(n log cap)，而再读从缓存 O(1)。</li>
 * </ul>
 *
 * <p>三条口径写在这里，免得下一片自己发明：
 * <ol>
 *   <li><b>降序</b>：分数高的在前。同分先看层数（打到更深更难），再看剩余秒数。
 *       最后按提交时间升序 — "先做到的排前面"。</li>
 *   <li><b>按赛季过滤</b>：{@code seasonId} 为空表示"不分赛季"（跨季总榜）。
 *       赛季轮换之后旧成绩不该混进新榜，所以它是过滤键而不是展示字段。</li>
 *   <li><b>有界</b>：内存里最多留 {@code maxEntries} 条，超出后丢**最老**的一条。
 *       不限容的内存榜在长跑进程里是内存泄漏的一种，而它长得不像 bug。</li>
 * </ol>
 */
@Service
public class TrialLeaderboardService {

    private final GameServiceProperties properties;
    private final List<TrialRun> runs = new ArrayList<>();
    // W-Y6 切片3：可选 Redis mirror（`game-service.trial.backend=redis` 才能注入）
    private final @Nullable TrialRedisMirror mirror;

    /** seasonId → 按当前 cap 缓存的榜单（add 时整表失效） */
    private final Map<String, List<TrialRun>> topCache = new ConcurrentHashMap<>();
    private final AtomicLong cacheHits = new AtomicLong();
    private final AtomicLong cacheMisses = new AtomicLong();

    /**
     * 次序：分数降 → 层数降 → 剩余秒降 → 提交时间升。
     *
     * <p>{@code submittedAt} 是 ISO-8601 字符串，字典序即时间序（同行长度一致）。
     * 所以不必解析成 {@link Instant} — 解析失败会让一条脏记录把整次出榜打掉。
     */
    private static final Comparator<TrialRun> COMPARATOR =
            Comparator.comparingInt(TrialRun::score).reversed()
                    .thenComparing(Comparator.comparingInt(TrialRun::layersCleared).reversed())
                    .thenComparing(Comparator.comparingInt(TrialRun::secondsLeft).reversed())
                    .thenComparing(TrialRun::submittedAt);


    public TrialLeaderboardService(GameServiceProperties properties) {
        this(properties, null);
    }

    @Autowired
    public TrialLeaderboardService(GameServiceProperties properties,
                                    @Nullable TrialRedisMirror mirror) {
        this.properties = properties;
        this.mirror = mirror;
    }

    /** 演示数据：只在启动时写一次，且只用于联调/演示（与 Boss 榜同一条纪律） */
    @PostConstruct
    void seedDemoData() {
        if (mirror != null) {
            List<TrialRun> persisted = mirror.pullAll();
            if (!persisted.isEmpty()) {
                synchronized (runs) {
                    runs.addAll(persisted);
                    topCache.clear();
                }
                return;
            }
        }
        if (!properties.getTrial().isSeedDemoData()) {
            return;
        }
        String now = Instant.now().toString();
        add(new TrialRun("执灯的巡礼者", "ember", 613, 5, 113, now));
        add(new TrialRun("断桥上的琴师", "tide", 528, 5, 28, now));
        add(new TrialRun("深井抄书的人", "gloom", 402, 4, 2, now));
        add(new TrialRun("赤手的老兵", "radiant", 311, 3, 11, now));
        add(new TrialRun("迷路的学者", "ember", 118, 1, 18, now));
    }

    /**
     * 收一条成绩并回一份新榜（客户端拿它直接刷页面，不用再发一条 GET）。
     *
     * @return 新榜（按当前配置的 {@code maxLimit} 截断）
     */
    public List<TrialRun> add(TrialRun run) {
        synchronized (runs) {
            runs.add(run);
            trim();
            synchronized (topCache) {
                // add 进来的一条可以搅动任何 season:cap 组合的榜首 — 整表失效最保险。
                topCache.clear();
            }
            if (mirror != null) {
                try {
                    mirror.mirror(run);
                } catch (RuntimeException ignored) {
                    // Redis 进程间消失不阻碍提交
                }
            }
            return top(run.seasonId(), properties.getTrial().getMaxLimit());
        }
    }

    /**
     * 出榜。
     *
     * @param seasonId 赛季 id；{@code null} / 空白 = 不分赛季
     * @param limit    要几条（会被夹到 {@code [1, maxLimit]}）
     */
    public List<TrialRun> top(String seasonId, int limit) {
        int cap = Math.max(1, Math.min(limit, properties.getTrial().getMaxLimit()));
        String season = seasonId == null ? "" : seasonId.trim();

        String cacheKey = season + ":" + cap;
        List<TrialRun> cached = topCache.get(cacheKey);
        if (cached != null) {
            cacheHits.incrementAndGet();
            return cached;
        }
        cacheMisses.incrementAndGet();
        return topCache.computeIfAbsent(cacheKey, k -> rebuildTop(season, cap));
    }

    /**
     * 全表扫，用最小堆只留 cap 条（O(n log cap)），再按 COMPARATOR 输出一次。
     * 调用方在写侧已经整表失效，所以这里只会在 miss 时走一次。
     */
    private List<TrialRun> rebuildTop(String season, int cap) {
        synchronized (runs) {
            if (runs.size() <= cap) {
                return runs.stream()
                        .filter(r -> season.isEmpty() || season.equals(r.seasonId()))
                        .sorted(COMPARATOR)
                        .limit(cap)
                        .toList();
            }
            PriorityQueue<TrialRun> heap = new PriorityQueue<>(cap, COMPARATOR.reversed());
            for (TrialRun r : runs) {
                if (!season.isEmpty() && !season.equals(r.seasonId())) {
                    continue;
                }
                if (heap.size() < cap) {
                    heap.offer(r);
                } else if (COMPARATOR.compare(r, heap.peek()) < 0) {
                    heap.poll();
                    heap.offer(r);
                }
            }
            return heap.stream().sorted(COMPARATOR).toList();
        }
    }

    public int size() {
        synchronized (runs) {
            return runs.size();
        }
    }

    /** 缓存命中/未命中/当前缓存栏位数，供 /api/ops/health 与调试面板使用。 */
    public Map<String, Object> cacheStats() {
        synchronized (topCache) {
            return Map.of(
                    "hits", cacheHits.get(),
                    "misses", cacheMisses.get(),
                    "entries", topCache.size());
        }
    }

    /** 超出上限时丢**最老**的一条（列表是按到达顺序追加的，所以就是下标 0） */
    private void trim() {
        int max = Math.max(1, properties.getTrial().getMaxEntries());
        while (runs.size() > max) {
            runs.remove(0);
        }
    }

    /** 全量聚合（W-P12）：总数/最高/平均/去重跑者/去重赛季 */
    public Map<String, Object> stats() {
        synchronized (runs) {
            long topScore = runs.stream().mapToLong(TrialRun::score).max().orElse(0);
            double avgScore = runs.stream().mapToLong(TrialRun::score).average().orElse(0.0);
            long uniqueRunners = runs.stream().map(TrialRun::runner).distinct().count();
            long uniqueSeasons = runs.stream().map(TrialRun::seasonId)
                    .filter(s -> s != null && !s.isEmpty()).distinct().count();
            return Map.of(
                    "total", runs.size(),
                    "topScore", topScore,
                    "avgScore", Math.round(avgScore),
                    "uniqueRunners", uniqueRunners,
                    "uniqueSeasons", uniqueSeasons);
        }
    }
}
