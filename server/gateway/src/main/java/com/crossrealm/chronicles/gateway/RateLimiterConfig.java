package com.crossrealm.chronicles.gateway;

import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 限流背板选择（W-P10）。
 *
 * <p>两套背板（互斥启用）：
 * <ul>
 *   <li><b>memory</b>（默认）：{@link InMemoryIpRateLimiter}——进程内 LRU + 纯函数桶，CI/smoke 走这条，
 *       不碰 Redis。</li>
 *   <li><b>redis</b>：{@link RedisIpRateLimiter}——Redis ZSET + Lua 脚本，多实例共享每 IP 10 秒内 60 次的配额；
 *       Redis 不可达 fail-open（放行，不让限流把整个网关变成单点故障）。</li>
 * </ul>
 *
 * <p>property {@code gateway.ratelimit.backend}：
 * <ul>
 *   <li>缺省 / {@code memory} → memory 背板</li>
 *   <li>{@code redis} → Redis 背板（要求 classpath 有 RedisStarter；RedisiTemplate 缺席直接启动失败并报错，
 *       不因"静默回退"让配置悄悄不生效）</li>
 * </ul>
 */
@Configuration
public class RateLimiterConfig {

    /** memory 背板——永远注册，REDIS 分支按 havingValue 才注册，两分支语义等价 */
    @Bean
    @ConditionalOnProperty(name = "gateway.ratelimit.backend", havingValue = "memory", matchIfMissing = true)
    @ConditionalOnMissingBean
    public IpRateLimiter memoryIpRateLimiter() {
        return new InMemoryIpRateLimiter();
    }
}
