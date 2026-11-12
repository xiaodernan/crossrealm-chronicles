package com.crossrealm.chronicles.ai;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * W-Z1：可靠投递的<b>纯逻辑</b>状态机 —— 不碰 Redis、不碰线程，单测就能钉死。
 *
 * <p>Redis Streams 的「pending 列表重投」解决的是<b>崩溃</b>场景：消费者拿到条目（PEL 里
 * 记一笔 pending）但没 XACK 就挂了，条目会一直 pending；另一个消费者用
 * {@code XAUTOCLAIM} 按 idle 时间把它捞回来重投。这条语义与「重试次数上限」「死信」
 * 是两件事，本类只负责后者两件事的<b>判定</b>，I/O 交给 {@link RedisStreamAdvisorQueue}。
 *
 * <p>状态流转：{@code QUEUED → RUNNING → DONE | DEAD}。只有瞬态失败（上游抖动）才
 * 该重试；达到 {@code maxAttempts} 仍失败 → {@code DEAD} 并进死信。
 * {@code CANCELLED} 由外部（W-Z7「真取消」）直写：排队中的任务被客户端撤回时，
 * worker 捞到即丢弃、不调上游——不进本类的判定链。
 */
public final class StreamJobState {

    public enum Status { QUEUED, RUNNING, DONE, DEAD, CANCELLED }

    private final int maxAttempts;
    private final AtomicInteger attempts = new AtomicInteger(0);
    private final AtomicReference<Status> status = new AtomicReference<>(Status.QUEUED);
    private volatile String reason;
    private volatile String answer;
    private volatile boolean answerCached;
    private volatile long latencyMs;

    public StreamJobState(int maxAttempts) {
        this.maxAttempts = Math.max(1, maxAttempts);
    }

    public int maxAttempts() { return maxAttempts; }
    public int attempts() { return attempts.get(); }

    /** 从 Redis 状态 Hash 重建 attempts（跨实例重投时调用；本类只在内存里计数）。 */
    public void restoreAttempts(int value) {
        attempts.set(Math.max(0, value));
    }
    public Status status() { return status.get(); }
    public String reason() { return reason; }
    public String answer() { return answer; }
    public boolean answerCached() { return answerCached; }
    public long latencyMs() { return latencyMs; }

    /** 开始一次处理：状态抬到 RUNNING，attempts +1。 */
    public void begin() {
        status.set(Status.RUNNING);
        attempts.incrementAndGet();
    }

    /** 处理成功。 */
    public void succeed(String answer, boolean cached, long latencyMs) {
        this.answer = answer;
        this.answerCached = cached;
        this.latencyMs = latencyMs;
        this.status.set(Status.DONE);
    }

    /**
     * 处理失败。
     *
     * @return {@code true} 表示应进死信（重试已耗尽）；{@code false} 表示还应按 pending
     *         被重投重试（本类只判定，重投的 I/O 由调用方负责）。
     */
    public boolean fail(String reason) {
        this.reason = reason;
        boolean exhausted = attempts.get() >= maxAttempts;
        if (exhausted) {
            this.status.set(Status.DEAD);
            return true;
        }
        // 仍 RUNNING：等 pending 重投再 begin()
        return false;
    }

    public boolean isTerminal() {
        Status s = status.get();
        return s == Status.DONE || s == Status.DEAD || s == Status.CANCELLED;
    }
}
