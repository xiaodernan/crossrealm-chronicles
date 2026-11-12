package com.crossrealm.chronicles.ai;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * W-Z1：Redis Streams 可靠投递的<b>内存 faithful 模型</b>（仅用于单测，不进生产）。
 *
 * <p>它把 Redis 消费者组 + {@code XAUTOCLAIM} 的语义<b>逐条</b>照搬成内存结构，好让契约测试
 * 不必起真实 Redis 也能钉死「跨实例可靠」这件事：
 * <ul>
 *   <li>新条目：{@link #claimNew} ≈ {@code XREADGROUP GROUP ... >}（从未投递）；</li>
 *   <li>崩溃重投：{@link #claimIdle} ≈ {@code XAUTOCLAIM}（pending 且 idle 超时，换消费者认领）；</li>
 *   <li>{@link #ack} ≈ {@code XACK}（销 pending）；</li>
 *   <li>{@link #fail}：瞬态失败留 pending 等重投，达上限进 {@link #deadLetters()}（≈ XADD 死信流）。</li>
 * </ul>
 * 真实 {@link RedisStreamAdvisorQueue} 在真实 Redis 上复现同一套保证，由
 * {@code RedisStreamAdvisorQueueLiveTest} 验证。
 */
final class StreamsReliabilityModel {

    enum Status { QUEUED, RUNNING, DONE, DEAD }

    record SubmitResult(boolean accepted, boolean duplicate, String jobId, String reason) {
        static SubmitResult queued(String id) { return new SubmitResult(true, false, id, "queued"); }
        static SubmitResult duplicate(String id) { return new SubmitResult(true, true, id, "duplicate"); }
        static SubmitResult rejected() { return new SubmitResult(false, false, null, "queue-full"); }
    }

    private final int maxAttempts;
    private final int capacity;
    private final ConcurrentHashMap<String, Job> jobs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> requestIds = new ConcurrentHashMap<>();
    private final List<String> dlq = new ArrayList<>();

    static final class Job {
        String id;
        String requestId;
        String question;
        volatile Status status = Status.QUEUED;
        volatile int attempts;
        volatile long pendingSinceMs = -1;
        volatile String claimedBy;
        volatile String reason;
        volatile String answer;
    }

    StreamsReliabilityModel(int maxAttempts, int capacity) {
        this.maxAttempts = Math.max(1, maxAttempts);
        this.capacity = Math.max(1, capacity);
    }

    SubmitResult submit(String question, String requestId) {
        if (requestId != null && requestIds.containsKey(requestId)) {
            return SubmitResult.duplicate(requestIds.get(requestId));
        }
        if (jobs.size() >= capacity) return SubmitResult.rejected();
        String id = UUID.randomUUID().toString();
        Job j = new Job();
        j.id = id;
        j.requestId = requestId;
        j.question = question;
        jobs.put(id, j);
        if (requestId != null) requestIds.put(requestId, id);
        return SubmitResult.queued(id);
    }

    /** ≈ XREADGROUP GROUP cg consumer >：拿一条从未投递的新条目。 */
    Job claimNew(String consumerId, long nowMs) {
        for (Job j : jobs.values()) {
            if (j.status == Status.QUEUED) {
                j.status = Status.RUNNING;
                j.attempts++;
                j.claimedBy = consumerId;
                j.pendingSinceMs = nowMs;
                return j;
            }
        }
        return null;
    }

    /** ≈ XAUTOCLAIM：拿一条 pending 且 idle 超时的条目，换消费者认领（崩溃重投）。 */
    Job claimIdle(String consumerId, long nowMs, long idleMs) {
        for (Job j : jobs.values()) {
            if (j.status == Status.RUNNING && j.pendingSinceMs >= 0
                    && (nowMs - j.pendingSinceMs) >= idleMs) {
                j.claimedBy = consumerId;
                j.pendingSinceMs = nowMs;   // 重置 idle 计时，避免同一次被反复捞
                j.attempts++;
                return j;
            }
        }
        return null;
    }

    /** ≈ XACK：正常终态，销 pending。 */
    void ack(String jobId) {
        Job j = jobs.get(jobId);
        if (j == null) return;
        if (j.status != Status.DEAD) j.status = Status.DONE;
        j.pendingSinceMs = -1;
    }

    /** 处理失败：瞬态则留 pending 等重投；耗尽进死信。返回是否进死信。 */
    boolean fail(String jobId, String reason) {
        Job j = jobs.get(jobId);
        if (j == null) return false;
        if (j.attempts >= maxAttempts) {
            j.status = Status.DEAD;
            j.reason = reason;
            j.pendingSinceMs = -1;
            dlq.add(jobId);
            return true;
        }
        // 仍 RUNNING 且 pending：等 claimIdle 重投。
        return false;
    }

    void answer(String jobId, String text) {
        Job j = jobs.get(jobId);
        if (j != null) j.answer = text;
    }

    Optional<Map<String, Object>> view(String jobId) {
        Job j = jobs.get(jobId);
        if (j == null) return Optional.empty();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("jobId", j.id);
        m.put("status", j.status.name());
        m.put("attempts", j.attempts);
        if (j.status == Status.DONE) m.put("answer", j.answer);
        if (j.status == Status.DEAD) m.put("reason", j.reason);
        return Optional.of(m);
    }

    List<String> deadLetters() { return List.copyOf(dlq); }
    int tracked() { return jobs.size(); }
}
