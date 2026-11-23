package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;

@Configuration
public class LlmFlightConfig {

    @Bean
    public LlmFlightCoordinator llmFlightCoordinator(
            LlmFlightProperties props, ObjectProvider<StringRedisTemplate> redisProvider,
            ObjectProvider<ObjectMapper> mapperProvider) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if ("redis".equalsIgnoreCase(props.getBackend()) && redis != null && mapperProvider.getIfAvailable() != null) {
            return new RedisLlmFlightCoordinator(redis, mapperProvider.getIfAvailable(), props);
        }
        return LlmFlightCoordinator.DISABLED;
    }
}
