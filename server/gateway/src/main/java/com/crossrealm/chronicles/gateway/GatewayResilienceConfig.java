package com.crossrealm.chronicles.gateway;

import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import java.time.Duration;
import org.springframework.cloud.circuitbreaker.resilience4j.ReactiveResilience4JCircuitBreakerFactory;
import org.springframework.cloud.circuitbreaker.resilience4j.Resilience4JConfigBuilder;
import org.springframework.cloud.client.circuitbreaker.Customizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 网关熔断的默认策略。
 *
 * <p>只在「game-service 路由真的挂了」时挡住调用方（快速 503 兜底），平时不该感知：
 * 滑动窗口 10 次、至少 5 次才参与判定、50% 失败率才开熔断、开熔断后 5 秒再半开试探、
 * 半开时放 3 个请求验证恢复。阈值保守一点是为了不让一次抖动把网关锁死在 open 状态。
 */
@Configuration
public class GatewayResilienceConfig {

    @Bean
    public Customizer<ReactiveResilience4JCircuitBreakerFactory> defaultCustomizer() {
        return factory -> factory.configureDefault(id -> new Resilience4JConfigBuilder(id)
                .circuitBreakerConfig(CircuitBreakerConfig.custom()
                        .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)
                        .slidingWindowSize(10)
                        .minimumNumberOfCalls(5)
                        .failureRateThreshold(50.0f)
                        .waitDurationInOpenState(Duration.ofSeconds(5))
                        .permittedNumberOfCallsInHalfOpenState(3)
                        .build())
                .build());
    }
}
