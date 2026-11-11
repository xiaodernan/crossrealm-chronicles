package com.crossrealm.chronicles.gateway;

import reactor.core.publisher.Mono;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 内存版滑动窗口限流器（W-X12 / W-P3）。
 *
 * <ul>
 *   <li><b>有界 LRU</b>：access-order + cap 4096，满了踢最久未用的。</li>
 *   <li><b>主动 purge</b>：每 512 次调用扫一次，把整个窗口已过期的 IP 删掉。</li>
 *   <li><b>失败总是开放</b>：内部任何异常都不影响放行（这个实现不碰外部资源）。</li>
 * </ul>
 *
 * <p>被选作默认背板（无 Redis / 配置关闭时）。</p>
 */
public class InMemoryIpRateLimiter implements IpRateLimiter {

    private static final int WINDOW_MS = 10_000;
    private static final int MAX_REQUESTS = 60;
    static final int MAX_TRACKED_IPS = 4096;
    static final int SWEEP_EVERY = 512;

    private final RateLimitTokenBucket bucket = new RateLimitTokenBucket(WINDOW_MS, MAX_REQUESTS);

    /** access-order LinkedHashMap = 可驱逐 LRU；满了踢最久未用的那一格 */
    private final Map<String, Deque<Long>> windows = new LinkedHashMap<>(256, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Deque<Long>> eldest) {
            return size() > MAX_TRACKED_IPS;
        }
    };

    private long callsSinceSweep = 0;

    /** W-P13：本进程放行/拒绝累计（运维可观测性——限流真的生效了没、挡了多少） */
    private final java.util.concurrent.atomic.AtomicLong allowedTotal = new java.util.concurrent.atomic.AtomicLong();
    private final java.util.concurrent.atomic.AtomicLong rejectedTotal = new java.util.concurrent.atomic.AtomicLong();

    @Override
    public Mono<Boolean> tryAcquire(String ip, long nowMs) {
        String key = (ip == null || ip.isBlank()) ? "unknown" : ip;
        Deque<Long> window;
        synchronized (windows) {
            sweepIfDue(nowMs);
            window = windows.computeIfAbsent(key, k -> new ArrayDeque<>());
        }
        boolean allowed = bucket.allow(window, nowMs);
        if (allowed) {
            allowedTotal.incrementAndGet();
        } else {
            rejectedTotal.incrementAndGet();
        }
        return Mono.just(allowed);
    }

    /** 外层调度判断用：被明确拒时计算客户端 retryAfterMs */
    public long retryAfterMs(String ip, long nowMs) {
        Deque<Long> window;
        synchronized (windows) {
            window = windows.get(ip);
        }
        return window == null ? WINDOW_MS : bucket.retryAfterMs(window, nowMs);
    }

    @Override
    public void sweep() {
        doSweep(System.currentTimeMillis());
    }

    /** 测试用：显式触发清理（传 now，方便测试用假时钟） */
    public void sweepForTest(long nowMs) {
        doSweep(nowMs);
    }

    public void sweepForTest() {
        doSweep(System.currentTimeMillis());
    }

    private void sweepIfDue(long now) {
        callsSinceSweep++;
        if (callsSinceSweep >= SWEEP_EVERY) {
            callsSinceSweep = 0;
            doSweep(now);
        }
    }

    private void doSweep(long nowMs) {
        long cutoff = nowMs - WINDOW_MS;
        windows.entrySet().removeIf(e -> {
            Long newest = e.getValue().peekLast();
            return newest == null || newest <= cutoff;
        });
    }

    @Override
    public long retryAfterMs() {
        return WINDOW_MS;
    }

    @Override
    public int maxRequests() {
        return bucket.getMaxRequests();
    }

    @Override
    public int windowMs() {
        return bucket.getWindowMs();
    }

    @Override
    public int trackedSize() {
        synchronized (windows) {
            return windows.size();
        }
    }

    @Override
    public Map<String, Integer> snapshotWindowSizes() {
        synchronized (windows) {
            Map<String, Integer> snapshot = new LinkedHashMap<>();
            windows.forEach((key, value) -> snapshot.put(key, value.size()));
            return snapshot;
        }
    }

    @Override
    public long allowedCount() {
        return allowedTotal.get();
    }

    @Override
    public long rejectedCount() {
        return rejectedTotal.get();
    }
}
