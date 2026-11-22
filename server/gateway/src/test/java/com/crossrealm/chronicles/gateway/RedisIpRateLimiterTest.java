package com.crossrealm.chronicles.gateway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import reactor.core.publisher.Flux;

/**
 * W-P10 补测：Redis 背板限流器的行为契约（此前只有内存背板有测试）。
 *
 * <p>与 {@link InMemoryIpRateLimiterTest} 的分工：那份测内存账本；这份只测 Redis 背板
 * 对「脚本返回值」的解读，以及**失败/空结果时是否 fail-open**。
 *
 * <p>关键不变量（与 {@link InMemoryIpRateLimiter} 对齐）：{@code tryAcquire} 必须
 * **永远发出一个布尔值**——不能因为 Redis 返回空 Flux 就发出空 Mono。空 Mono 在
 * {@link RateLimitByIpFilter#filter} 里会走 {@code flatMap} 的空路径：既不限流、
 * 也不转发，请求静默完成（玩家收到空响应）。Redis 不可用时放行是既定策略，
 * 「拿不到答案」等价于「不可用」。
 */
class RedisIpRateLimiterTest {

    private ReactiveStringRedisTemplate redis;
    private RedisIpRateLimiter limiter;

    @BeforeEach
    void setUp() {
        redis = mock(ReactiveStringRedisTemplate.class);
        limiter = new RedisIpRateLimiter(redis);
    }

    @SuppressWarnings("unchecked")
    private void scriptReturns(Flux<Object> flux) {
        doReturn(flux).when(redis).execute(any(RedisScript.class), anyList(), anyList());
    }

    @Test
    void 脚本回_允许_时放行并计入allowed() {
        scriptReturns(Flux.just(List.of(1L, 0L)));
        Boolean allowed = limiter.tryAcquire("1.2.3.4", 1000L).block();
        assertEquals(Boolean.TRUE, allowed);
        assertEquals(1L, limiter.allowedCount());
        assertEquals(0L, limiter.rejectedCount());
    }

    @Test
    void 脚本回_拒绝_时拦下并计入rejected() {
        scriptReturns(Flux.just(List.of(0L, 5000L)));
        Boolean allowed = limiter.tryAcquire("1.2.3.4", 1000L).block();
        assertEquals(Boolean.FALSE, allowed);
        assertEquals(0L, limiter.allowedCount());
        assertEquals(1L, limiter.rejectedCount());
    }

    @Test
    void Redis返回空Flux时fail_open而不是发出空Mono() {
        scriptReturns(Flux.empty());
        Boolean allowed = limiter.tryAcquire("1.2.3.4", 1000L).block();
        assertNotNull(allowed, "空结果必须 fail-open 成 true，不能是空 Mono（否则 filter 会静默吞请求）");
        assertEquals(Boolean.TRUE, allowed);
        assertEquals(1L, limiter.allowedCount());
    }

    @Test
    void Redis抛错时fail_open并记入allowed() {
        when(redis.execute(any(RedisScript.class), anyList(), anyList()))
                .thenReturn(Flux.error(new IllegalStateException("redis down")));
        Boolean allowed = limiter.tryAcquire("1.2.3.4", 1000L).block();
        assertEquals(Boolean.TRUE, allowed);
        assertEquals(1L, limiter.allowedCount());
    }

    @Test
    void 脚本返回空列表时不抛且给出明确布尔值() {
        // 畸形返回（空列表）：可以拒绝，但**不能抛**、也不能发空 Mono
        scriptReturns(Flux.just(List.of()));
        Boolean allowed = limiter.tryAcquire("1.2.3.4", 1000L).block();
        assertNotNull(allowed, "畸形返回也必须给出明确布尔值");
    }

    @Test
    void 空IP归入unknown桶且不抛() {
        scriptReturns(Flux.just(List.of(1L, 0L)));
        assertEquals(Boolean.TRUE, limiter.tryAcquire(null, 1000L).block());
        assertEquals(Boolean.TRUE, limiter.tryAcquire("   ", 1000L).block());
    }

    @Test
    void 常量与内存背板同一口径() {
        assertEquals(60, limiter.maxRequests());
        assertEquals(10_000, limiter.windowMs());
        assertEquals(10_000, limiter.retryAfterMs());
        assertEquals(-1, limiter.trackedSize());
        assertTrue(limiter.snapshotWindowSizes().isEmpty());
    }
}
