package com.crossrealm.chronicles.season;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.support.SimpleCacheManager;
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
 * <p><b>默认</b>（`spring.cache.type: simple`，本仓库 application.yml 显式默认）：本类注册 SimpleCacheManager + CountingCache（W-S1）——
 * 内存实现、带 300s 惰性 TTL 与 hits/misses/puts/invalidations 计数器（/api/seasons/stats 上报）。
 * 早期 Boot 自带的 ConcurrentMapCacheManager 缓存项永不过期，赛季切换后会一直端出上一季——W-S1 修掉。
 *
 * <p><b>生产</b>：设定 `spring.cache.type=redis` + 正确的 `spring.data.redis.host` 时，
 * Spring Boot 自动配置停止（`spring-boot-starter-data-redis` 做判据），本类
 * 注册 RedisCacheManager：
 * ① 全部 value 走 JSON 序列化（不要求 Serializable；运维可以直接 HGETALL 看内容）；
 * ② 统一 TTL（`season-service.cache-ttl-seconds`，默认 300 秒）；远小于赛季周期（14 天），远大于单次 p99 读取——缓存命中率仍>95%，
 *    赛季切换后也不会卡住超过这个窗口。
 *
 * <p>Cash 名空间统一为 `seasons`，与下一片要标注 @Cacheable 的方法对齐。
 */
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    @ConditionalOnProperty(name = "spring.cache.type", havingValue = "redis")
    public CacheManager redisCacheManager(RedisConnectionFactory connectionFactory, ObjectMapper objectMapper,
                                          SeasonServiceProperties properties) {
        /**
         * W-S2 实证：NON_FINAL 曾是坏的——`SeasonView` 是 **final record**，序列化时不加类型标记，
         * 反序列化时 `readValue(bytes, Object.class)` 又只能按 As.WRAPPER_ARRAY 读 →
         * "Unexpected token (START_OBJECT), expected START_ARRAY" → 500。
         * 改 EVERYTHING：final 类也带 `@class`，读侧按字段回家，零猜测。
         */
        GenericJackson2JsonRedisSerializer valueSerializer =
                new GenericJackson2JsonRedisSerializer(objectMapper.copy()
                        .activateDefaultTyping(
                                new com.fasterxml.jackson.databind.jsontype.impl.LaissezFaireSubTypeValidator(),
                                com.fasterxml.jackson.databind.ObjectMapper.DefaultTyping.EVERYTHING));

        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofSeconds(properties.getCacheTtlSeconds()))
                .serializeValuesWith(SerializationPair.fromSerializer(valueSerializer))
                .disableCachingNullValues();

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(config)
                .initialCacheNames(java.util.Set.of("seasons"))
                .build();
    }

    /**
     * W-S1：默认（simple/concurrent）分支。
     *
     * 本仓库 `application.yml` 显式写了 `spring.cache.type: simple`（防 Redis classpath 下 Boot
     * 自动上 RedisCacheManager 把健康检查打成 DOWN），所以 havingValue 对齐 `simple`；
     * `matchIfMissing = true` 兼容没写的外部部署。设成 `redis` 时 havingValue 不匹配 → 本 bean 不注册。
     * 与 Boot 自带的 ConcurrentMapCacheManager 语义接近，但**多了两样**：
     * ① 惰性 TTL（默认 300s，与 redis 分支同一 `season-service.cache-ttl-seconds` 旋钮）——
     *    否则默认分支缓存项永不过期，赛季切换后跑着的实例会一直端出上一季；
     * ② hits/misses/puts/invalidations 计数器 —— 供 /api/seasons/stats 上报。
     */
    @Bean
    @ConditionalOnProperty(name = "spring.cache.type", havingValue = "simple", matchIfMissing = true)
    public CacheManager concurrentCacheManager(SeasonServiceProperties properties) {
        SimpleCacheManager manager = new SimpleCacheManager();
        manager.setCaches(List.of(new CountingCache("seasons", Duration.ofSeconds(properties.getCacheTtlSeconds()))));
        return manager;
    }
}
