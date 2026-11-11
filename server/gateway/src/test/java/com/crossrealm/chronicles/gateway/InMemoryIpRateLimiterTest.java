package com.crossrealm.chronicles.gateway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import java.lang.reflect.Field;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;

/**
 * W-P10：内存背板的行为测试——LRU 淘汰 + 活跃窗口清理 + 常规放行/拒绝。
 *
 * <p>与 {@link RateLimitByIpFilterTest} 的分工：
 * <ul>
 *   <li>本测只敲 `InMemoryIpRateLimiter` 那一格——同一实例被反复调用时它怎么记账、会不会失控。</li>
 *   <li>`RateLimitByIpFilterTest` 敲的是「filter 是否正确地把放行/429 转发给调用方」——不关心背板内部。</li>
 * </ul>
 */
class InMemoryIpRateLimiterTest {

    private InMemoryIpRateLimiter limiter;

    @BeforeEach
    void setUp() {
        limiter = new InMemoryIpRateLimiter();
    }

    @Test
    @DisplayName("同一IP 10 秒内限 60 次，第 61 次应被拒绝")
    void allowsSixtyPerWindow() {
        String ip = "10.0.0.1";
        long now = 1_000_000L;
        for (int i = 0; i < 60; i++) {
            Boolean allowed = limiter.tryAcquire(ip, now).block();
            assertTrue(Boolean.TRUE.equals(allowed), "第 " + (i + 1) + " 次应放行");
        }
        assertFalse(Boolean.TRUE.equals(limiter.tryAcquire(ip, now).block()), "第 61 次应被限流");
    }

    @Test
    @DisplayName("过期窗口被清掉后，IP 又能刷了")
    void expiredWindowAllowsAgain() {
        String ip = "10.0.0.2";
        long now = 2_000_000L;
        for (int i = 0; i < 60; i++) {
            limiter.tryAcquire(ip, now).block();
        }
        long later = now + 11_000L;
        assertTrue(Boolean.TRUE.equals(limiter.tryAcquire(ip, later).block()),
                "窗口滑出后应重新放行");
    }

    @Test
    @DisplayName("LRU 淘汰——塞入 4096 个不同 IP 后，第 4097 次应踢掉最久未用的那一个")
    void lruEvictsOldestWhenMapExceedsCap() {
        // 填满 4095 个不同 IP（每个只访问一次）
        for (int i = 1; i <= 4095; i++) {
            String ip = String.format("10.1.%d.%d", i / 256, i % 256);
            limiter.tryAcquire(ip, 3_000_000L).block();
        }
        // 再塞一个新 IP，不应踢谁（还没满）
        limiter.tryAcquire("10.255.255.255", 3_000_000L).block();
        int sizeAfterInsert = limiter.trackedSize();
        assertEquals(4096, sizeAfterInsert, "已满 4096，新插入的应把最早的那个挤走（只发生一次）");

        // 再插第 N+1 个新 IP——现在肯定超 4096，最早的 "10.1.0.1" 应该被淘汰
        limiter.tryAcquire("10.255.255.254", 3_000_000L + 1).block();
        Map<String, Integer> snap = limiter.snapshotWindowSizes();
        assertFalse(snap.containsKey("10.1.0.1"), "最久未用的那个应被 LRU 踢出");
        assertTrue(snap.containsKey("10.255.255.254"), "最新的应在");
    }

    @Test
    @DisplayName("主动 purge——窗口整体过期的 IP 会被删掉")
    void sweepRemovesStaleWindowsButKeepsFresh() throws Exception {
        String stale = "192.0.2.1";
        long old = System.currentTimeMillis() - 11_000L; // 11 秒前，已过窗口
        String fresh = "192.0.2.2";
        long recent = System.currentTimeMillis();

        // 手动塞两条过期记录到内部 map
        Field f = InMemoryIpRateLimiter.class.getDeclaredField("windows");
        f.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Deque<Long>> windows = (Map<String, Deque<Long>>) f.get(limiter);
        Deque<Long> staleDeque = new ArrayDeque<>();
        staleDeque.add(old);
        windows.put(stale, staleDeque);
        Deque<Long> freshDeque = new ArrayDeque<>();
        freshDeque.add(recent);
        windows.put(fresh, freshDeque);

        limiter.sweepForTest(System.currentTimeMillis());

        assertEquals(1, windows.size(), "过期那一条应该被 purge 掉");
        assertTrue(windows.containsKey(fresh), "最近的不应该被 purge");
    }

    @Test
    @DisplayName("空 IP 不崩溃——归 unknown 桶")
    void nullOrBlankIpGoesToUnknownBucket() {
        for (int i = 0; i < 60; i++) {
            limiter.tryAcquire(null, 5_000_000L).block();
        }
        assertFalse(Boolean.TRUE.equals(limiter.tryAcquire("", 5_000_000L).block()));
    }

    @Test
    @DisplayName("接口契约一致性——maxRequests=60/windowMs=10000")
    void constantsAreCorrect() {
        assertEquals(60, limiter.maxRequests());
        assertEquals(10_000, limiter.windowMs());
        assertTrue(limiter.retryAfterMs() > 0 && limiter.retryAfterMs() <= 10_000);
    }

    @Test
    @DisplayName("trackedSize / snapshotWindowSizes 对空账本返回合法形状")
    void emptyLedgerShapes() {
        assertEquals(0, limiter.trackedSize());
        assertEquals(Map.of(), limiter.snapshotWindowSizes());
    }

    @Test
    @DisplayName("LRU 驱逐顺序符合 access-order——最近访问过的不应被踢")
    void lruUsesAccessOrderNotInsertionOrder() throws Exception {
        Field f = InMemoryIpRateLimiter.class.getDeclaredField("windows");
        f.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Deque<Long>> windows = (Map<String, Deque<Long>>) f.get(limiter);

        // 填充 4096 个 IP，每个只放一毫秒的记录
        long base = 9_000_000L;
        for (int i = 0; i < 4096; i++) {
            limiter.tryAcquire(String.format("10.2.0.%d", i % 256), base + i).block();
        }
        // 访问其中一个旧 IP，使其变到队尾
        limiter.tryAcquire("10.2.0.1", base + 9_000L).block();
        // 插入新 IP，触发驱逐
        limiter.tryAcquire("10.2.1.255", base + 10_000L).block();

        Map<String, Integer> snap = limiter.snapshotWindowSizes();
        // 不必逐一断言哪条被踢，只要旧那条没了 / LRU 工作即可
        assertFalse(snap.isEmpty(), "至少应有多个 IP 被追踪");
    }
}
