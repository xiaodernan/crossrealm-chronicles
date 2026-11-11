package com.crossrealm.chronicles.gateway;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

/**
 * Redis 背板滑动窗口限流器（W-P10）。
 *
 * <p>多实例部署时，只有在 Redis 上合账才能让整个集群共享同一套"每 IP 10 秒最多 60 次"的配额；
 * 否则每个实例各有一套独立账，总配额会被放大 N 倍。
 *
 * <p>算法：Redis ZSET——member = `now-ns:random-suffix`，score = 时间戳；
 * {@code ZREMRANGEBYSCORE} 惰性清理过期条目，{@code ZCARD} 读当前计数，原子包在一个 Lua 脚本里。
 * 返回 `{是否允许, retryAfterMs}` 二元素列表。
 *
 * <p>失败策略：Redis 不可达 → 记录 WARN → <b>放行</b>（fail-open）。
 * 限流是保护上游的，不该因为限流器自己出问题把整个网关拖死。
 *
 * <p>启用方式：{@code gateway.ratelimit.backend=redis}（默认 {@code memory}，不碰 Redis）。
 * 生效条件：{@code SPRING_DATA_REDIS_HOST=…} + {@code gateway.ratelimit.backend=redis}。
 */
@Component
@ConditionalOnClass(ReactiveStringRedisTemplate.class)
@ConditionalOnProperty(name = "gateway.ratelimit.backend", havingValue = "redis")
public class RedisIpRateLimiter implements IpRateLimiter {

    private static final int WINDOW_MS = 10_000;
    private static final int MAX_REQUESTS = 60;

    private static final String LUA_ALLOW = """
            local key = KEYS[1]
            local now = tonumber(ARGV[1])
            local window = tonumber(ARGV[2])
            local maxReq = tonumber(ARGV[3])

            redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
            local current = redis.call('ZCARD', key)
            if current >= maxReq then
                local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
                local retryAfter = window
                if #oldest > 0 then
                    retryAfter = (tonumber(oldest[2]) + window) - now
                    if retryAfter < 0 then retryAfter = 0 end
                end
                return {0, retryAfter}
            end

            redis.call('ZADD', key, now, tostring(now) .. ':' .. math.random(2147483647))
            redis.call('PEXPIRE', key, window * 2)
            return {1, 0}
            """;

    private static final RedisScript<List> SCRIPT = RedisScript.of(LUA_ALLOW, List.class);

    private final ReactiveStringRedisTemplate redis;

    @Value("${spring.redis.host:localhost}")
    private String redisHost;

    @Value("${spring.redis.port:6379}")
    private int redisPort;

    public RedisIpRateLimiter(ReactiveStringRedisTemplate redis) {
        this.redis = redis;
    }

    @Override
    public Mono<Boolean> tryAcquire(String ip, long nowMs) {
        String key = "ratelimit:" + ((ip == null || ip.isBlank()) ? "unknown" : ip);
        List<String> keys = List.of(key);
        List<Object> args = List.of(String.valueOf(nowMs), String.valueOf(WINDOW_MS), String.valueOf(MAX_REQUESTS));
        return redis.execute(SCRIPT, keys, args)
                .next()
                .map(list -> {
                    @SuppressWarnings("unchecked")
                    List<Long> nums = (List<Long>) list;
                    return nums != null && !nums.isEmpty() && nums.get(0) == 1L;
                })
                .onErrorResume(e -> {
                    org.slf4j.LoggerFactory.getLogger(RedisIpRateLimiter.class)
                            .warn("[W-P10] Redis rate-limit backend error, allowing by default: {}", e.toString());
                    return Mono.just(true); // fail-open
                });
    }

    /** retryAfterMs 对于 Redis 背板要在被限流那一次里才能精确算出；这里回填整个窗口（最坏等待期） */
    @Override
    public long retryAfterMs() {
        return WINDOW_MS;
    }

    @Override
    public int maxRequests() {
        return MAX_REQUESTS;
    }

    @Override
    public int windowMs() {
        return WINDOW_MS;
    }

    /** Redis 无法廉价地给出当前 IP 数——返 -1 表示"不适用" */
    @Override
    public int trackedSize() {
        return -1;
    }

    /** Redis 无法廉价地给出每个 IP 的窗口大小——返空 Map */
    @Override
    public Map<String, Integer> snapshotWindowSizes() {
        return Map.of();
    }

    @Override
    public void sweep() {
        // Redis 背板靠 PEXPIRE 自动回收，不需要主动扫
    }

    /** ops 运维用：暴露真实连的 Redis（不含密码） */
    public String diagnosticRedisHost() {
        return redisHost + ":" + redisPort;
    }
}
