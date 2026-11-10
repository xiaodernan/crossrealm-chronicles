package com.crossrealm.chronicles.game.leaderboard;

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

/** 排行榜 API：/api/leaderboard */
@RestController
public class LeaderboardController {

    private final LeaderboardService service;
    private final GameServiceProperties properties;

    public LeaderboardController(LeaderboardService service, GameServiceProperties properties) {
        this.service = service;
        this.properties = properties;
    }

    @GetMapping("/api/leaderboard")
    public Map<String, Object> leaderboard(
            @RequestParam(defaultValue = "10") @Min(1) @Max(50) int limit) {
        List<RunRecord> items = service.top(limit);
        return Map.of(
                "items", items,
                "count", items.size(),
                "maxLimit", properties.getLeaderboard().getMaxLimit());
    }

    @PostMapping("/api/leaderboard")
    public ResponseEntity<Map<String, Object>> submit(@Valid @RequestBody SubmitRun body) {
        RunRecord record = new RunRecord(
                body.runner().trim(),
                body.bossId().trim(),
                body.clearTimeMs(),
                body.chapter(),
                Instant.now().toString());
        List<RunRecord> after = service.add(record);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "accepted", true,
                "total", service.size(),
                "top", after));
    }

    /** 提交体；runner/bossId 去空白后不许为空，用时不许为负 */
    public record SubmitRun(
            @NotBlank(message = "runner 不能为空") @Size(max = 64) String runner,
            @NotBlank(message = "bossId 不能为空") @Size(max = 64) String bossId,
            @NotNull(message = "clearTimeMs 必填") @Min(1) @Max(86_400_000L) Long clearTimeMs,
            @Min(1) @Max(5) int chapter) {
    }
}
