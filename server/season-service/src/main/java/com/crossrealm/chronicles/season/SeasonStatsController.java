package com.crossrealm.chronicles.season;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * W-S1：season-service 的只读运维面（{@code GET /api/seasons/stats}）。
 *
 * <p>挂在 {@code /api/seasons/**} 下而不是 {@code /api/ops/**} —— 网关把 {@code /api/ops/**}
 * 路由给 game-service，在 season-service 上再开一枚同路径会制造两枚同名端点。
 * {@code /api/seasons/stats} 与名册接口同名族，网关直接 lb://season-service，不冲突。
 *
 * <p>零外呼、零写：active 读赛季名册（内存常量），cache 读本地计数器。
 * Redis 分支的计数返 -1（"不适用"），绝不编造。
 */
@RestController
public class SeasonStatsController {

    private final SeasonCatalog catalog;
    private final SeasonServiceProperties properties;
    private final CacheManager cacheManager;
    private final Instant startedAt = Instant.now();

    public SeasonStatsController(SeasonCatalog catalog,
                                 SeasonServiceProperties properties,
                                 CacheManager cacheManager) {
        this.catalog = catalog;
        this.properties = properties;
        this.cacheManager = cacheManager;
    }

    @GetMapping("/api/seasons/stats")
    public Map<String, Object> stats() {
        Season active = catalog.active();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("service", "season-service");
        result.put("startedAt", startedAt.toString());
        result.put("uptimeSec", Duration.between(startedAt, Instant.now()).getSeconds());
        result.put("active", Map.of(
                "id", active.id(),
                "dayInCycle", catalog.dayInCycle(),
                "daysRemaining", catalog.daysRemaining(),
                "soulsBonusPct", active.soulsBonusPct()));
        result.put("catalog", Map.of(
                "size", catalog.seasons().size(),
                "cycleDays", properties.getCycleDays(),
                "overrideActive", !properties.getOverride().isBlank()));
        result.put("cache", cacheStats());
        return result;
    }

    private Map<String, Object> cacheStats() {
        Map<String, Object> cache = new LinkedHashMap<>();
        cache.put("name", "seasons");
        cache.put("cacheManager", cacheManager.getClass().getSimpleName());

        Cache c = cacheManager.getCache("seasons");
        if (c instanceof CountingCache counting) {
            cache.put("type", "concurrent");
            cache.put("entries", counting.getNativeCache().size());
            cache.putAll(counting.counters());
            long hits = counting.counters().getOrDefault("hits", 0L);
            long misses = counting.counters().getOrDefault("misses", 0L);
            cache.put("hitRate", (hits + misses) == 0 ? -1.0 : Math.round(hits * 1000.0 / (hits + misses)) / 1000.0);
        } else {
            // Redis 分支：计数不可廉价给出——如实返 -1（"不适用"），不编造
            cache.put("type", "redis-or-other");
            cache.put("entries", -1);
            cache.put("hits", -1);
            cache.put("misses", -1);
            cache.put("puts", -1);
            cache.put("invalidations", -1);
            cache.put("hitRate", -1.0);
        }
        return cache;
    }
}
