package com.crossrealm.chronicles.gateway;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.function.LongSupplier;

/**
 * 每 IP 滑动窗口计数器（纯函数，无状态）：
 * 窗口 `windowMs` 毫秒内，最多允许 `maxRequests` 次请求。
 *
 * <p>供 gateway 里的速率限制滤镜使用；与线程安全无关，因为 caller 自己同步 `Deque` 即可。
 * 构造接受 `LongSupplier` 以便测试用假时钟。
 */
public class RateLimitTokenBucket {

    private final int windowMs;
    private final int maxRequests;
    private final LongSupplier clock;

    public RateLimitTokenBucket(int windowMs, int maxRequests, LongSupplier clock) {
        if (windowMs <= 0) {
            throw new IllegalArgumentException("windowMs must be > 0");
        }
        if (maxRequests <= 0) {
            throw new IllegalArgumentException("maxRequests must be > 0");
        }
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        this.clock = clock;
    }

    public RateLimitTokenBucket(int windowMs, int maxRequests) {
        this(windowMs, maxRequests, System::currentTimeMillis);
    }

    /**
     * 判断 `now` 这一刻是否允许。允许的同时把 `now` 记入窗口；超出就只返回 false，不记入。
     * 过期的老请求会被惰性清理掉。
     */
    public boolean allow(Deque<Long> window, long now) {
        long cutoff = now - windowMs;
        while (!window.isEmpty() && window.peekFirst() <= cutoff) {
            window.pollFirst();
        }
        if (window.size() >= maxRequests) {
            return false;
        }
        window.addLast(now);
        return true;
    }

    public boolean allow(Deque<Long> window) {
        return allow(window, clock.getAsLong());
    }

    public int getWindowMs() {
        return windowMs;
    }

    public int getMaxRequests() {
        return maxRequests;
    }

    /**
     * 估算重试窗口：当前窗口最早一条请求的有效期——客户端看到 429 后多久可以重试。
     */
    public long retryAfterMs(Deque<Long> window, long now) {
        if (window.isEmpty()) {
            return 0;
        }
        long first = window.peekFirst();
        long retryAfter = first + windowMs - now;
        return Math.max(0, retryAfter);
    }

    public long retryAfterMs(Deque<Long> window) {
        return retryAfterMs(window, clock.getAsLong());
    }
}
