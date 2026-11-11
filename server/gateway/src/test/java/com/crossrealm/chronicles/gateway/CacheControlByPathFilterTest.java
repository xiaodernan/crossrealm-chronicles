package com.crossrealm.chronicles.gateway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

/**
 * W-P2 纯函数腿：{@code CacheControlByPathFilter.cacheControlFor(method, rawPath)}
 * 的所有分支逐条穷举——金线/错误不依赖 netty、不依赖 Spring context，只验证这条函数。
 */
class CacheControlByPathFilterTest {

    @Test
    void nonGetMethodsReturnNull() {
        assertNull(CacheControlByPathFilter.cacheControlFor("POST", "/api/leaderboard"));
        assertNull(CacheControlByPathFilter.cacheControlFor("PUT", "/api/version"));
        assertNull(CacheControlByPathFilter.cacheControlFor("DELETE", "/api/seasons/active"));
        assertNull(CacheControlByPathFilter.cacheControlFor("PATCH", "/api/trials/leaderboard"));
    }

    @Test
    void opsRoutesAreNoStore() {
        assertEquals("no-store", CacheControlByPathFilter.cacheControlFor("GET", "/api/ops/health"));
        assertEquals("no-store", CacheControlByPathFilter.cacheControlFor("HEAD", "/api/ops/season"));
        assertEquals("no-store", CacheControlByPathFilter.cacheControlFor("GET", "/api/ops"));
        // ops 子路径也不能沾亲——运维面不进任何共享缓存
        assertEquals("no-store", CacheControlByPathFilter.cacheControlFor("GET", "/api/ops/anything-else"));
    }

    @Test
    void versionGetsPublicMaxAge60() {
        assertEquals("public, max-age=60",
                CacheControlByPathFilter.cacheControlFor("GET", "/api/version"));
    }

    @Test
    void seasonsActiveGetsPublicMaxAge300() {
        assertEquals("public, max-age=300, stale-while-revalidate=60",
                CacheControlByPathFilter.cacheControlFor("GET", "/api/seasons/active"));
    }

    @Test
    void leaderboardsGetShortPublicMaxAges() {
        assertEquals("public, max-age=15",
                CacheControlByPathFilter.cacheControlFor("GET", "/api/leaderboard"));
        assertEquals("public, max-age=10",
                CacheControlByPathFilter.cacheControlFor("GET", "/api/trials/leaderboard"));
    }

    @Test
    void pathsWithQueryStringsStillMatchBasePath() {
        assertEquals("public, max-age=15",
                CacheControlByPathFilter.cacheControlFor("GET", "/api/leaderboard?limit=10"));
        assertEquals("public, max-age=300, stale-while-revalidate=60",
                CacheControlByPathFilter.cacheControlFor("GET", "/api/seasons/active?at=2026-11-11T00:00:00Z"));
        assertEquals("no-store",
                CacheControlByPathFilter.cacheControlFor("GET", "/api/ops/health?verbose=true"));
    }

    @Test
    void telemetryEndpointsAreCapped() {
        assertEquals("public, max-age=5",
                CacheControlByPathFilter.cacheControlFor("GET", "/api/telemetry/summary"));
        assertEquals("public, max-age=5",
                CacheControlByPathFilter.cacheControlFor("GET", "/api/telemetry/summary?topN=5"));
        assertEquals("no-store",
                CacheControlByPathFilter.cacheControlFor("GET", "/api/telemetry/events"));
        assertEquals("no-store",
                CacheControlByPathFilter.cacheControlFor("GET", "/api/telemetry/events/count"));
        assertEquals("no-store",
                CacheControlByPathFilter.cacheControlFor("HEAD", "/api/telemetry/events"));
        // 摘要只读的是聚合值，POST 上报绝不进共享缓存
        assertNull(CacheControlByPathFilter.cacheControlFor("POST", "/api/telemetry/events"));
    }

    @Test
    void unknownPathsReturnNull() {
        assertNull(CacheControlByPathFilter.cacheControlFor("GET", "/api/echo/anything"));
        assertNull(CacheControlByPathFilter.cacheControlFor("GET", "/"));
        assertNull(CacheControlByPathFilter.cacheControlFor("GET", "/index.html"));
    }
}
