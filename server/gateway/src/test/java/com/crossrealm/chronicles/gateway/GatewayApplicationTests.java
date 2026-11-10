package com.crossrealm.chronicles.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 弹簧上下文能全起来：网关 + eureka 客户端（禁用注册，避免测试时向外连）+ 熔断定制器。
 */
@SpringBootTest(properties = {"eureka.client.enabled=false"})
class GatewayApplicationTests {

    @Test
    void contextLoads() {
        // 能走到这里就算过 —— 装配链（gateway + circuitbreaker + customizer）没坏
    }
}
