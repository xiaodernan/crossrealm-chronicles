package com.crossrealm.chronicles.gateway;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/**
 * 接线测试（源码级断言，不启动容器）：application.yml 里的 game-service 路由
 * 必须挂着 CircuitBreaker 滤镜，且兜底 URI 指向 /fallback/503 ——
 * 少了这根接线，熔断器再配得再好也不会被调用方感知。
 */
class GatewayConfigWiringTest {

    @Test
    void gameServiceRouteHasCircuitBreakerFallback() throws Exception {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("application.yml")) {
            assertTrue(in != null, "application.yml 应该在 classpath 上");
            String yml = new String(in.readAllBytes(), StandardCharsets.UTF_8);

            assertTrue(yml.contains("id: game-service"), "game-service 路由应该存在");
            assertTrue(yml.contains("name: CircuitBreaker"),
                    "game-service 路由挂了 CircuitBreaker 滤镜");
            assertTrue(yml.contains("fallbackUri: forward:/fallback/503"),
                    "兜底 URI 指向 /fallback/503（FallbackController）");
            assertTrue(yml.contains("name: gameServiceBreaker"),
                    "熔断器名是 gameServiceBreaker");
        }
    }
}
