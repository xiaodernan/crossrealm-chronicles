package com.crossrealm.chronicles.game.leaderboard;

import com.crossrealm.chronicles.game.GameServiceProperties;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 内存排行榜：线程安全、无外部依赖。
 * 播种的演示数据只在启动时写入一次，且仅用于联调/演示。
 */
@Service
public class LeaderboardService {

    private final GameServiceProperties properties;
    private final List<RunRecord> runs = new ArrayList<>();

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
        add(new RunRecord("夜游人", "player", 7_200_000L, 1, now));
        add(new RunRecord("位面行者", "abyss-titan", 5_400_000L, 5, now));
        add(new RunRecord("渡鸦牧师", "magic-archon", 5_700_000L, 4, now));
    }

    public List<RunRecord> add(RunRecord run) {
        synchronized (runs) {
            runs.add(run);
            return top(properties.getLeaderboard().getMaxLimit());
        }
    }

    /** 按用时升序（同用时按提交时间升序），取前 limit 条 */
    public List<RunRecord> top(int limit) {
        int cap = Math.max(1, Math.min(limit, properties.getLeaderboard().getMaxLimit()));
        synchronized (runs) {
            return runs.stream()
                    .sorted(Comparator.comparingLong(RunRecord::clearTimeMs)
                            .thenComparing(RunRecord::submittedAt))
                    .limit(cap)
                    .toList();
        }
    }

    public int size() {
        synchronized (runs) {
            return runs.size();
        }
    }
}
