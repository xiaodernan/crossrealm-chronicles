package com.crossrealm.chronicles.gateway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 速率限制桶的单元测试：
 * - 窗口满之前全部放行，满了之后全部拒绝；
 * - 过期的旧记录会被惰性清理；
 * - retryAfterMs 返回最早一条请求还要多久过期；
 * - 参数非法时构造抛异常。
 */
class RateLimitTokenBucketTest {

    private AtomicLong clock;
    private RateLimitTokenBucket bucket;
    private Deque<Long> window;

    @BeforeEach
    void setUp() {
        clock = new AtomicLong(1_000_000L);
        bucket = new RateLimitTokenBucket(1_000, 3, clock::get);
        window = new ArrayDeque<>();
    }

    @Test
    void allowsUpToMaxRequestsPerWindow() {
        assertTrue(bucket.allow(window));
        assertTrue(bucket.allow(window));
        assertTrue(bucket.allow(window));
        assertFalse(bucket.allow(window));
    }

    @Test
    void doesNotCountRejectedRequests() {
        bucket.allow(window);
        bucket.allow(window);
        bucket.allow(window);
        bucket.allow(window); // 这一条应被拒
        assertEquals(3, window.size(), "被拒的那条不应该记入窗口");
    }

    @Test
    void prunesExpiredEntriesOnAllow() {
        clock.set(1_000_000L);
        bucket.allow(window);
        clock.addAndGet(1_100L);
        bucket.allow(window);
        clock.addAndGet(10_000L); // 远超窗口
        bucket.allow(window);
        assertEquals(1, window.size(), "过期的旧记录应在下一次 allow 时清空，剩下最新一条");
    }

    @Test
    void allowsAgainAfterWindowPasses() {
        bucket.allow(window);
        bucket.allow(window);
        bucket.allow(window);
        assertFalse(bucket.allow(window));
        clock.addAndGet(1_001L); // 窗口滑出
        assertTrue(bucket.allow(window));
    }

    @Test
    void retryAfterMsPointsAtEarliestExpiry() {
        bucket.allow(window);
        clock.addAndGet(400L);
        bucket.allow(window);
        clock.addAndGet(400L);
        long retry = bucket.retryAfterMs(window);
        assertEquals(200L, retry, "最早那条请求要再活 200ms");
    }

    @Test
    void retryAfterMsIsZeroOnEmptyWindow() {
        assertEquals(0L, bucket.retryAfterMs(new ArrayDeque<>()));
    }

    @Test
    void rejectsInvalidConstructorArgs() {
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> new RateLimitTokenBucket(0, 3, clock::get));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> new RateLimitTokenBucket(1000, 0, clock::get));
    }

    @Test
    void constantsAreSane() {
        assertEquals(1_000, bucket.getWindowMs());
        assertEquals(3, bucket.getMaxRequests());
    }
}
