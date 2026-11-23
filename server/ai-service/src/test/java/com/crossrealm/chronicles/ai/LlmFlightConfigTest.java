package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;

class LlmFlightConfigTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(LlmFlightConfig.class, PropertiesConfig.class)
            .withBean(StringRedisTemplate.class, () -> org.mockito.Mockito.mock(StringRedisTemplate.class))
            .withBean(ObjectMapper.class, ObjectMapper::new);

    @Test
    void 默认保持进程内合流() {
        runner.run(context -> assertSame(LlmFlightCoordinator.DISABLED,
                context.getBean(LlmFlightCoordinator.class)));
    }

    @Test
    void 显式redis后端才装配协调器() {
        runner.withPropertyValues("ai-service.flight.backend=redis").run(context ->
                assertTrue(context.getBean(LlmFlightCoordinator.class) instanceof RedisLlmFlightCoordinator));
    }

    @Test
    void 没有Redis模板时即使配置redis也安全降级() {
        new ApplicationContextRunner()
                .withUserConfiguration(LlmFlightConfig.class, PropertiesConfig.class)
                .withPropertyValues("ai-service.flight.backend=redis")
                .withBean(ObjectMapper.class, ObjectMapper::new)
                .run(context -> assertSame(LlmFlightCoordinator.DISABLED,
                        context.getBean(LlmFlightCoordinator.class)));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(LlmFlightProperties.class)
    static class PropertiesConfig {}
}
