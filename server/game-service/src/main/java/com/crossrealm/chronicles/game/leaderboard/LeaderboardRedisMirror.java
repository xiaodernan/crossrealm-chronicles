package com.crossrealm.chronicles.game.leaderboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

/**
 * 排行榜 Redis mirror（W-Y5）：写穿 + 启动恢复保底重启损失。
 *
 * <p>只有在 `game-service.leaderboard.backend=redis` 时才注册（{@link ConditionalOnProperty}）。
 * 写穿顺序在内存 `add` 之后——内存写入成功就写 Redis，失败也仅 WARN 不抛（保底，不是必须）；
 * `RedisTemplate` 直接取 opsForZSet()，member=JSON RunRecord，score=clearTimeMs 升序。
 *
 * <p>"保底"含义：如果 Redis 进程在游戏运行间消失，已有得分只在内存内，重启后从 Redis
 * 最新快照拉回（最近一次写入的结果）。这是"最终一致的回声"，不是跨实例全局排序。
 */
@Component
@ConditionalOnProperty(name = "game-service.leaderboard.backend", havingValue = "redis")
public class LeaderboardRedisMirror {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String KEY = "leaderboard:runs";
    private static final int MAX_PULL = 1024;

    private final RedisTemplate<String, String> redis;

    public LeaderboardRedisMirror(RedisTemplate<String, String> redis) {
        this.redis = redis;
    }

    /** 全量拉回最近 N 条（按 score 升序；过旧算法的行以 0 填充 submittedAt） */
    public List<RunRecord> pullAll() {
        try {
            Set<String> raw = redis.opsForZSet().range(KEY, 0, MAX_PULL - 1);
            if (raw == null || raw.isEmpty()) return List.of();
            List<RunRecord> result = new ArrayList<>(raw.size());
            for (String entry : raw) {
                try {
                    JsonNode n = MAPPER.readTree(entry);
                    String runner = n.path("runner").asText("");
                    String bossId = n.path("bossId").asText("");
                    long clearTimeMs = n.path("clearTimeMs").asLong(Long.MAX_VALUE);
                    int chapter = n.path("chapter").asInt(1);
                    String submittedAt = n.path("submittedAt").asText("unknown");
                    if (runner.isEmpty() || bossId.isEmpty()) continue;   // 损坏行跳过
                    result.add(new RunRecord(runner, bossId, clearTimeMs, chapter, submittedAt));
                } catch (Exception ignored) {
                    // 损坏行跳过
                }
            }
            return result;
        } catch (RuntimeException e) {
            return List.of();   // Redis 不可达：静默回落，不打 /api/ops 500
        }
    }

    /** 写穿：把一条 RunRecord 塞进同一个 ZSET */
    public void mirror(RunRecord run) {
        try {
            ObjectNode n = MAPPER.createObjectNode();
            n.put("runner", run.runner());
            n.put("bossId", run.bossId());
            n.put("clearTimeMs", run.clearTimeMs());
            n.put("chapter", run.chapter());
            n.put("submittedAt", run.submittedAt());
            redis.opsForZSet().add(KEY, MAPPER.writeValueAsString(n), run.clearTimeMs());
        } catch (Exception e) {
            // WARN 即可；不抛——Redis 进程间消失不阻碍提交
            org.slf4j.LoggerFactory.getLogger(getClass())
                    .warn("leaderboard mirror 写入失败（忽略）：{}", e.getMessage());
        }
    }


    /** ZCARD 计数（只读 diag；出错回 -1，不抛异常——上游满/空都正常）。 */
    public long zcard() {
        try {
            Long c = redis.opsForZSet().zCard(KEY);
            return c == null ? 0L : c.longValue();
        } catch (Exception ignored) {
            return -1L;
        }
    }
}
