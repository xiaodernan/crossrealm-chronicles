package com.crossrealm.chronicles.game;

import com.crossrealm.chronicles.game.GameServiceProperties;
import com.crossrealm.chronicles.game.leaderboard.LeaderboardService;
import com.crossrealm.chronicles.game.season.SeasonClient;
import com.crossrealm.chronicles.game.season.SeasonSnapshot;
import com.crossrealm.chronicles.game.telemetry.TelemetryService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * W-X13：/api/ops/health —— 复合健康视图（服务端 + 配置 + 缓存大小）
 *
 * 用途：
 * - 面板常态不打它；
 * - 运维点通 `curl /api/ops/health` 时，它能答出
 *   "这个实例用了哪份 config（seed + version note + maxLimit）、谁注册进了它身边的缓存、
 *    leaderboard 有多少事件落在内存" —— 全是无外呼的只读字段，不会打挂自己。
 *
 * 与 `/actuator/health` 的分工：acuter 只是 liveness；这一路是 readiness-ish 的**配置快照**。
 *
 * W-X14 追加 `/api/ops/season`：把下游 season-service 的当前赛季**聚合**到同一个运维面。
 * 这是这一片唯一一处外呼 —— 所以它**单独一格**，不和 `/api/ops/health` 混在一起：
 * 健康视图必须永远零依赖、读即快；而"下游现在回答什么"天然可能慢或失败。
 */
@RestController
public class OpsController {

    private final GameServiceProperties properties;
    private final LeaderboardService leaderboardService;
    private final TelemetryService telemetryService;
    private final SeasonClient seasonClient;
    private final String applicationName;

    public OpsController(
            GameServiceProperties properties,
            LeaderboardService leaderboardService,
            TelemetryService telemetryService,
            SeasonClient seasonClient,
            @Value("${spring.application.name:game-service}") String applicationName) {
        this.properties = properties;
        this.leaderboardService = leaderboardService;
        this.telemetryService = telemetryService;
        this.seasonClient = seasonClient;
        this.applicationName = applicationName;
    }

    @GetMapping("/api/ops/health")
    public Map<String, Object> health() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("service", applicationName);
        result.put("version", "0.1.0-SNAPSHOT");
        result.put("javaVersion", System.getProperty("java.version"));
        result.put("config", Map.of(
                "leaderboardMaxLimit", properties.getLeaderboard().getMaxLimit(),
                "seedDemoData", properties.getLeaderboard().isSeedDemoData(),
                "telemetryMaxEvents", properties.getTelemetry().getMaxEvents(),
                "versionNote", properties.getVersionNote()));
        result.put("inMemory", Map.of(
                "leaderboardRecords", leaderboardService.size(),
                "telemetryEvents", telemetryService.count()));
        return result;
    }

    /**
     * 下游 season-service 的当前赛季（W-X14）。
     *
     * 两层保底：
     * 1. Feign 的 `fallbackFactory` 在熔断/连不上时返回 `unavailable()`；
     * 2. 这里再包一层 try/catch —— 万一熔断没开（配置被改掉）导致异常直抛，
     *    运维视图仍然回答 `available: false`，而不是 500。
     *
     * 两层的顺序不能反：先靠契约降级，再靠本地兜底。只有第二层的话，
     * 每次失败都要等 Feign 抛完才知道，而 Feign 的异常里没有"这一季是什么"。
     */
    @GetMapping("/api/ops/season")
    public Map<String, Object> season() {
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            SeasonSnapshot snapshot = seasonClient.active();
            result.put("available", snapshot.available());
            if (snapshot.available()) {
                result.put("id", snapshot.id());
                result.put("name", snapshot.name());
                result.put("tagline", snapshot.tagline());
                result.put("modifierIds", snapshot.modifierIds());
                result.put("soulsBonusPct", snapshot.soulsBonusPct());
                result.put("dayInCycle", snapshot.dayInCycle());
                result.put("daysRemaining", snapshot.daysRemaining());
            }
        } catch (RuntimeException error) {
            result.put("available", false);
            result.put("reason", error.getClass().getSimpleName());
        }
        return result;
    }
}
