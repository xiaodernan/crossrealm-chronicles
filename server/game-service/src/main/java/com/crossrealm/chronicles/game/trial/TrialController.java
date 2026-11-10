package com.crossrealm.chronicles.game.trial;

import com.crossrealm.chronicles.game.GameServiceProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * 位面试炼榜 API（W-F3 切片6）：{@code /api/trials/**}。
 *
 * <p>为什么单开一条而不是复用 {@code /api/leaderboard}：那一条的主键是 bossId + 用时，
 * 而试炼的成绩是"层数 + 剩余秒"折算的分。客户端曾经用 {@code trial-layer-N} 冒充
 * bossId 塞进 Boss 榜 —— 后果是服务端多出五个不存在的 Boss，而榜单本身还分不开。
 *
 * <p>网关那一侧不需要改：{@code /api/trials/**} 命中 {@code Path=/api/**} 的主路由。
 */
@RestController
public class TrialController {

    private final TrialLeaderboardService service;
    private final GameServiceProperties properties;

    public TrialController(TrialLeaderboardService service, GameServiceProperties properties) {
        this.service = service;
        this.properties = properties;
    }

    /**
     * 出榜。{@code season} 省略 = 跨季总榜（这是刻意的默认：新玩家第一次打开时
     * 还没打任何一局，看总榜比看空榜有意思）。
     */
    @GetMapping("/api/trials/leaderboard")
    public Map<String, Object> leaderboard(
            @RequestParam(required = false) String season,
            @RequestParam(defaultValue = "10") @Min(1) @Max(50) int limit) {
        List<TrialRun> items = service.top(season, limit);
        // Map.of 不收 null：season 缺省时给空串，表示"不分赛季"
        return Map.of(
                "items", items,
                "count", items.size(),
                "season", season == null ? "" : season,
                "maxLimit", properties.getTrial().getMaxLimit());
    }

    @PostMapping("/api/trials/runs")
    public ResponseEntity<Map<String, Object>> submit(@Valid @RequestBody SubmitTrialRun body) {
        TrialRun record = new TrialRun(
                body.runner().trim(),
                body.seasonId().trim(),
                body.score(),
                body.layersCleared(),
                body.secondsLeft(),
                Instant.now().toString());
        List<TrialRun> after = service.add(record);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "accepted", true,
                "total", service.size(),
                "top", after));
    }

    /**
     * 提交体。区间都是"不可能发生"的边界，不是玩法平衡：
     * 五层每层最多 120 秒、每层 100 分，所以分数上限 1000 已经留了两倍余量。
     * 把脏数据挡在入口而不是让榜单自己长出负数。
     */
    public record SubmitTrialRun(
            @NotBlank(message = "runner 不能为空") @Size(max = 64) String runner,
            @NotBlank(message = "seasonId 不能为空") @Size(max = 32) String seasonId,
            @NotNull(message = "score 必填") @Min(0) @Max(100_000) Integer score,
            @NotNull(message = "layersCleared 必填") @Min(0) @Max(5) Integer layersCleared,
            @NotNull(message = "secondsLeft 必填") @Min(0) @Max(3_600) Integer secondsLeft) {
    }
}
