package com.crossrealm.chronicles.season;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext.SerializationPair;

/**
 * Spring Cache 配置（W-P6）—— "本地即可开发/测试，生产按需切 Redis"。
 *
 * <p><b>默认</b>（不设 `spring.cache.type`）：Spring Boot 自动配置 ConcurrentMapCacheManager，
 * 行为与当前"纯内存"实现完全一致——CI 不需要 Redis，所有测试走同一条路。
 *
 * <p><b>生产</b>：设定 `spring.cache.type=redis` + 正确的 `spring.data.redis.host` 时，
 * Spring Boot 自动配置停止（`spring-boot-starter-data-redis` 做判据），本类
 * 注册 RedisCacheManager：
 * ① 全部 value 走 JSON 序列化（不要求 Serializable；运维可以直接 HGETALL 看内容）；
 * ② 统一 TTL 5 分钟；远小于赛季周期（14 天），远大于单次 p99 读取——缓存命中率仍>95%，
 *    赛季切换后也不会卡住超过这个窗口。
 *
 * <p>Cash 名空间统一为 `seasons`，与下一片要标注 @Cacheable 的方法对齐。
 */
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    @ConditionalOnProperty(name = "spring.cache.type", havingValue = "redis")
    public CacheManager redisCacheManager(RedisConnectionFactory connectionFactory, ObjectMapper objectMapper) {
        GenericJackson2JsonRedisSerializer valueSerializer =
                new GenericJackson2JsonRedisSerializer(objectMapper.copy()
                        .activateDefaultTyping(
                                new com.fasterxml.jackson.databind.jsontype.impl.LaissezFaireSubTypeValidator(),
                                com.fasterxml.jackson.databind.ObjectMapper.DefaultTyping.NON_FINAL));

        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(5))
                .serializeValuesWith(SerializationPair.fromSerializer(valueSerializer))
                .disableCachingNullValues();

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(config)
                .initialCacheNames(java.util.Set.of("seasons"))
                .build();
    }
}
