package com.crossrealm.chronicles.game.trial;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 位面试炼榜 Redis mirror（W-Y6 切片3）：与 LeaderboardRedisMirror 同一形态。
 *
 * <p>key=`trial-leaderboard:runs`，ZSET：member=JSON TrialRun，score=score (int)--Redis 按 score 降序：
 * ZREVRANGE 出榜，得到按 score 数字降序。</p>
 *
 * <p>在 `game-service.trial.backend=redis` 时注册（@ConditionalOnProperty）。写穿不抛；
 * 进程间消失不挂提交；启动时 pullAll 优先回收，如果不存在/不可达 → 退回 demo。</p>
 */
@Component
@ConditionalOnProperty(name = "game-service.trial.backend", havingValue = "redis")
public class TrialRedisMirror {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String KEY = "trial-leaderboard:runs";
    private static final int MAX_PULL = 1024;

    private final RedisTemplate<String, String> redis;

    public TrialRedisMirror(RedisTemplate<String, String> redis) {
        this.redis = redis;
    }

    public List<TrialRun> pullAll() {
        try {
            // ZREVRANGE with scores: score DESC. Use largest-first approach to preserve ordering.
            Set<String> raw = redis.opsForZSet().reverseRange(KEY, 0, MAX_PULL - 1);
            if (raw == null || raw.isEmpty()) return List.of();
            List<TrialRun> result = new ArrayList<>(raw.size());
            for (String entry : raw) {
                try {
                    JsonNode n = MAPPER.readTree(entry);
                    String runner = n.path("runner").asText("");
                    String seasonId = n.path("seasonId").asText("");
                    int score = n.path("score").asInt(0);
                    int layersCleared = n.path("layersCleared").asInt(0);
                    int secondsLeft = n.path("secondsLeft").asInt(0);
                    String submittedAt = n.path("submittedAt").asText("unknown");
                    if (runner.isEmpty() || seasonId.isEmpty()) continue;
                    result.add(new TrialRun(runner, seasonId, score, layersCleared, secondsLeft, submittedAt));
                } catch (Exception ignored) {
                    // 损坏行跳过
                }
            }
            return result;
        } catch (RuntimeException e) {
            return List.of();
        }
    }

    public void mirror(TrialRun run) {
        try {
            ObjectNode n = MAPPER.createObjectNode();
            n.put("runner", run.runner());
            n.put("seasonId", run.seasonId());
            n.put("score", run.score());
            n.put("layersCleared", run.layersCleared());
            n.put("secondsLeft", run.secondsLeft());
            n.put("submittedAt", run.submittedAt());
            // score field is integer; Redis member must be unique, so append submittedAt to each JSON-keyed member -- it is part of the payload itself
            redis.opsForZSet().add(KEY, MAPPER.writeValueAsString(n), run.score());
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(getClass())
                    .warn("trial-leaderboard mirror 写入失败（忽略）：{}", e.getMessage());
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
