package com.crossrealm.chronicles.game.trial;

import com.crossrealm.chronicles.game.GameServiceProperties;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 位面试炼的内存榜：线程安全、无外部依赖（与 Boss 榜同一套做法）。
 *
 * <p>三条口径写在这里，免得下一片自己发明：
 * <ol>
 *   <li><b>降序</b>：分数高的在前。同分先看层数（打到更深更难），再看剩余秒数，
 *       最后按提交时间升序 —— "先做到的排前面"。</li>
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

    /**
     * 次序：分数降 → 层数降 → 剩余秒降 → 提交时间升。
     *
     * <p>{@code submittedAt} 是 ISO-8601 字符串，字典序即时间序（同行长度一致），
     * 所以不必解析成 {@link Instant} —— 解析失败会让一条脏记录把整次出榜打掉。
     */
    private static final Comparator<TrialRun> COMPARATOR =
            Comparator.comparingInt(TrialRun::score).reversed()
                    .thenComparing(Comparator.comparingInt(TrialRun::layersCleared).reversed())
                    .thenComparing(Comparator.comparingInt(TrialRun::secondsLeft).reversed())
                    .thenComparing(TrialRun::submittedAt);


    public TrialLeaderboardService(GameServiceProperties properties) {
        this.properties = properties;
    }

    /** 演示数据：只在启动时写一次，且只用于联调/演示（与 Boss 榜同一条纪律） */
    @PostConstruct
    void seedDemoData() {
        if (!properties.getTrial().isSeedDemoData()) {
            return;
        }
        String now = Instant.now().toString();
        add(new TrialRun("执灯的巡礼者", "ember", 613, 5, 113, now));
        add(new TrialRun("断桥上的琴师", "tide", 528, 5, 28, now));
        add(new TrialRun("深井抄书人", "gloom", 402, 4, 2, now));
        add(new TrialRun("赤手的老兵", "radiant", 311, 3, 11, now));
        add(new TrialRun("迷路的学徒", "ember", 118, 1, 18, now));
    }

    /**
     * 收一条成绩并回一份新榜（客户端拿它直接刷页面，不用再发一次 GET）。
     *
     * @return 新榜（按当前配置的 {@code maxLimit} 截断）
     */
    public List<TrialRun> add(TrialRun run) {
        synchronized (runs) {
            runs.add(run);
            trim();
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
        synchronized (runs) {
            return runs.stream()
                    .filter(r -> season.isEmpty() || season.equals(r.seasonId()))
                    .sorted(COMPARATOR)
                    .limit(cap)
                    .toList();
        }
    }

    public int size() {
        synchronized (runs) {
            return runs.size();
        }
    }

    /** 超出上限时丢**最老**的一条（列表是按到达顺序追加的，所以就是下标 0） */
    private void trim() {
        int max = Math.max(1, properties.getTrial().getMaxEntries());
        while (runs.size() > max) {
            runs.remove(0);
        }
    }
}
