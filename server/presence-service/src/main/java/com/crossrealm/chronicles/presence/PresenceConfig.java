package com.crossrealm.chronicles.presence;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.scheduling.concurrent.CustomizableThreadFactory;

/**
 * 在场服务装配（W-Z-同游）。
 *
 * 后端选择：
 * - `presence.backend` 缺省或 =memory → 纯内存实现（无 Redis 也健康、可契约测试）。
 * - `presence.backend=redis` → Redis 哈希/集合 + Pub/Sub 实现。
 *
 * 两种方式下 Controller 拿到的都是同一个 `PresenceStore` + `PresenceEventHub` 接口，
 * 业务代码零分支。
 */
@Configuration
public class PresenceConfig {

    @Bean
    public ScheduledExecutorService presenceScheduler() {
        ScheduledExecutorService ex = Executors.newSingleThreadScheduledExecutor(
                new CustomizableThreadFactory("presence-keepalive-"));
        // 守护线程：JVM 关时不必等它
        return ex;
    }

    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(RedisConnectionFactory cf) {
        RedisMessageListenerContainer c = new RedisMessageListenerContainer();
        c.setConnectionFactory(cf);
        return c;
    }

    @Bean
    @ConditionalOnProperty(name = "presence.backend", havingValue = "redis")
    public PresenceStore redisPresenceStore(StringRedisTemplate redis, PresenceProperties props) {
        return new RedisPresenceStore(redis, props.getTtlSeconds() * 1000L);
    }

    @Bean
    @ConditionalOnMissingBean(PresenceStore.class)
    public PresenceStore inMemoryPresenceStore(PresenceProperties props) {
        return new InMemoryPresenceStore(props.getTtlSeconds() * 1000L);
    }

    @Bean
    @ConditionalOnProperty(name = "presence.backend", havingValue = "redis")
    public PresenceEventHub redisPresenceEventHub(RedisMessageListenerContainer container) {
        return new RedisPresenceEventHub(container);
    }

    @Bean
    @ConditionalOnMissingBean(PresenceEventHub.class)
    public PresenceEventHub inMemoryPresenceEventHub() {
        return new InMemoryPresenceEventHub();
    }
}
