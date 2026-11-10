package com.crossrealm.chronicles.game;

import com.crossrealm.chronicles.game.GameServiceProperties;
import com.crossrealm.chronicles.game.leaderboard.LeaderboardService;
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
 */
@RestController
public class OpsController {

    private final GameServiceProperties properties;
    private final LeaderboardService leaderboardService;
    private final TelemetryService telemetryService;
    private final String applicationName;

    public OpsController(
            GameServiceProperties properties,
            LeaderboardService leaderboardService,
            TelemetryService telemetryService,
            @Value("${spring.application.name:game-service}") String applicationName) {
        this.properties = properties;
        this.leaderboardService = leaderboardService;
        this.telemetryService = telemetryService;
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
}
