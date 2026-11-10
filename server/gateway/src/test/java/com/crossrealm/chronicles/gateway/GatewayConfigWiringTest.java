package com.crossrealm.chronicles.gateway;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/**
 * 网关接线测试（W-X11）：
 * - `game-service-version` 优先级路由（Path=/api/version，order=-1）——必须有 CircuitBreaker + Retry，且 Retry 只对 GET 生效；
 * - `game-service` 主路由（Path=/api/**）——必须有 CircuitBreaker，且**不许**带 Retry（避免 POST /api/leaderboard 双重提交）。
 */
class GatewayConfigWiringTest {

    private String readYml() throws Exception {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("application.yml")) {
            assertTrue(in != null, "application.yml 应该在 classpath 上");
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void gameServiceVersionRouteHasCircuitBreakerAndRetry() throws Exception {
        String yml = readYml();

        assertTrue(yml.contains("id: game-service-version"), "必须存在 game-service-version 优先路由");
        assertTrue(yml.contains("Path=/api/version"), "game-service-version 该只匹配 /api/version");
        assertTrue(yml.contains("order: -1"), "game-service-version 必须 order=-1 先于 Path=/api/** 的主路由");
        assertTrue(yml.contains("name: CircuitBreaker"), "game-service-version 应挂 CircuitBreaker 滤镜");
        assertTrue(yml.contains("fallbackUri: forward:/fallback/503"), "game-service-version 应有 503 兜底");
    }

    @Test
    void versionRouteRetryIsGetOnlyAndLimitedToTwoRetriesAnd503Series() throws Exception {
        String yml = readYml();

        int idx = yml.indexOf("id: game-service-version");
        assertTrue(idx >= 0, "需要 game-service-version 的 anchor");
        int end = yml.indexOf("id: game-service\n", idx);
        String section = yml.substring(idx, end >= 0 ? end : yml.length());

        assertTrue(section.contains("name: Retry"), "version 路由必须挂 Retry 滤镜");
        assertTrue(section.contains("methods: GET"), "version Retry 必须只对 GET 生效（避免带副作用）\n" + section);
        assertTrue(section.contains("statuses: BAD_GATEWAY,SERVICE_UNAVAILABLE"), "version Retry 只应对 502/503 生效\n" + section);
        assertTrue(section.contains("retries: 2"), "version Retry 只应重试 2 次");
    }

    @Test
    void gameServiceMainRouteHasNoRetry() throws Exception {
        String yml = readYml();

        int idx = yml.indexOf("id: game-service\n");
        assertTrue(idx >= 0, "需要 game-service anchor");
        String mainSection = yml.substring(idx);

        assertFalse(mainSection.contains("name: Retry"), "主路由（/api/**）不许带 Retry —— POST /api/leaderboard 不能重复提交");
        assertTrue(mainSection.contains("name: CircuitBreaker"), "主路由应有 CircuitBreaker");
        assertTrue(mainSection.contains("fallbackUri: forward:/fallback/503"), "主路由兜底向 \u2192 /fallback/503");
    }

    /**
     * W-X14：赛季路由必须存在、必须走 lb://、必须 order=-1（先于 Path=/api/** 的主路由），
     * 而且**不许**带 Retry —— 赛季读数不会因为重试变对，重试只会把"服务没起来"藏起来。
     */
    @Test
    void seasonRouteIsExplicitAndCircuitBroken() throws Exception {
        String yml = readYml();

        assertTrue(yml.contains("id: season-service"), "必须存在 season-service 显式路由");
        assertTrue(yml.contains("uri: lb://season-service"), "season 路由要走服务名负载均衡");
        assertTrue(yml.contains("Path=/api/seasons,/api/seasons/**"), "season 路由要同时匹配根与子路径");

        int idx = yml.indexOf("id: season-service");
        int end = yml.indexOf("id: game-service\n", idx);
        String section = yml.substring(idx, end > idx ? end : yml.length());

        assertTrue(section.contains("order: -1"), "season 路由必须 order=-1 才抢得过 Path=/api/**");
        assertTrue(section.contains("name: CircuitBreaker"), "season 路由应挂 CircuitBreaker");
        assertTrue(section.contains("fallbackUri: forward:/fallback/503"), "season 路由应有 503 兜底");
        assertFalse(section.contains("name: Retry"), "season 路由不该带 Retry");
    }
}
