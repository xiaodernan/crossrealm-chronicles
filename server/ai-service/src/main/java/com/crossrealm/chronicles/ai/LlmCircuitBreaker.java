package com.crossrealm.chronicles.ai;

import java.util.function.LongSupplier;

/**
 * 三态熔断器（CLOSED / OPEN / HALF_OPEN），只保护**上游大模型**这一个依赖。
 *
 * <p>为什么不用 Resilience4j：这里要的只是「连续失败 N 次就先别再花钱、冷却后放一个试探」，
 * 三态 + 两个计数器就够；多引一个库等于多一份要跟着 Spring Cloud BOM 对齐的版本。
 *
 * <p>关键口径：
 * <ul>
 *   <li>失败以**一次提问**为单位，不是以一次 HTTP 重试为单位 —— 否则一次带 2 次重试的
 *       抖动就能把熔断直接推到 OPEN；</li>
 *   <li>HALF_OPEN 只放一个试探请求，其余继续快速失败，避免冷却结束瞬间把上游打回来（惊群）；</li>
 *   <li>时钟可注入，测试不必真的等 15 秒。</li>
 * </ul>
 */
public class LlmCircuitBreaker {

    public enum State { CLOSED, OPEN, HALF_OPEN }

    private final int threshold;
    private final long cooldownMs;
    private final LongSupplier clock;

    private State state = State.CLOSED;
    private int consecutiveFailures;
    private long openedAt;
    private boolean probeInFlight;

    public LlmCircuitBreaker(int threshold, long cooldownMs) {
        this(threshold, cooldownMs, System::currentTimeMillis);
    }

    public LlmCircuitBreaker(int threshold, long cooldownMs, LongSupplier clock) {
        this.threshold = Math.max(1, threshold);
        this.cooldownMs = Math.max(0, cooldownMs);
        this.clock = clock;
    }

    /** 是否允许发一次上游请求。HALF_OPEN 只放一个，其余拒绝。 */
    public synchronized boolean allow() {
        if (state == State.CLOSED) return true;
        if (state == State.OPEN) {
            if (clock.getAsLong() - openedAt >= cooldownMs) {
                state = State.HALF_OPEN;
                probeInFlight = true;
                return true;
            }
            return false;
        }
        if (probeInFlight) return false;
        probeInFlight = true;
        return true;
    }

    public synchronized void onSuccess() {
        state = State.CLOSED;
        consecutiveFailures = 0;
        openedAt = 0;
        probeInFlight = false;
    }

    public synchronized void onFailure() {
        probeInFlight = false;
        if (state == State.HALF_OPEN) {
            open();
            return;
        }
        consecutiveFailures++;
        if (consecutiveFailures >= threshold) open();
    }

    private void open() {
        state = State.OPEN;
        openedAt = clock.getAsLong();
    }

    public synchronized State state() {
        // 惰性推进：冷却到了但还没人来问时不必有后台线程
        if (state == State.OPEN && clock.getAsLong() - openedAt >= cooldownMs) {
            state = State.HALF_OPEN;
        }
        return state;
    }
}
