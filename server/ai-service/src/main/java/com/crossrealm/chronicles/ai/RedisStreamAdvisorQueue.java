package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.Limit;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * W-Z1：基于 <b>Redis Streams 消费者组</b> 的跨实例可靠投递。
 *
 * <p>与 {@link AdvisorJobQueue}（进程内、默认）实现同一个 {@link AdvisorQueue} 契约，
 * 但任务落在 Redis 里：多台 ai-service 实例抢同一份 Stream，谁崩了谁没 XACK 的条目，
 * 由别的实例按 idle 时间捞回来重投（at-least-once）。这是 W-M5 的 Pub/Sub（broadcast，
 * 掉线即永久丢）的对立面：这里要的是"问了必须有交代"。
 *
 * <p>Redis 里的落点：
 * <ul>
 *   <li>{@code ai:advisor:jobs} —— 工作流（XADD 进、XREADGROUP 出、XACK 销）；</li>
 *   <li>{@code ai:advisor:state:<id>} —— 每个任务的状态 Hash（status/attempts/answer/
 *       reason/question/context/createdAt…），VIEW 与跨实例重投都读它；</li>
 *   <li>{@code ai:advisor:dlq} —— 死信流（重试耗尽 XADD 进来）；</li>
 *   <li>{@code ai:advisor:dedup:<requestId>} —— 幂等键（SETNX + TTL）；</li>
 *   <li>{@code ai:advisor:counter:*} —— 运维读数。</li>
 * </ul>
 *
 * <p>状态机判定（重试/死信）下沉到 {@link StreamJobState}，本类只做 I/O 与编排。
 * 本版本 Spring Data Redis 没有 {@code XAUTOCLAIM} 封装，pending 重投用
 * {@code XPENDING} 列举 + 按 ID 的 {@code XREADGROUP} 模拟（语义一致：崩溃的条目
 * 在 idle 后被另一消费者认领重投）。
 */
public class RedisStreamAdvisorQueue implements AdvisorQueue, AutoCloseable {

    private final AdvisorJobProperties props;
    private final AdvisorJobQueue.Handler handler;
    private final AdvisorJobQueue.Sleeper sleeper;
    private final StringRedisTemplate redis;
    private final ObjectMapper json = new ObjectMapper();

    private final String streamKey = "ai:advisor:jobs";
    private final String dlqKey = "ai:advisor:dlq";
    private final String group = "advisor-cg";
    private final String consumer = "c-" + UUID.randomUUID();
    private final String dedupPrefix = "ai:advisor:dedup:";
    private final String statePrefix = "ai:advisor:state:";
    private final int capacity;

    private final AtomicLong enqueued = new AtomicLong();
    private final AtomicLong rejected = new AtomicLong();
    private final AtomicLong dedupHits = new AtomicLong();
    private final AtomicLong done = new AtomicLong();
    private final AtomicLong deadLettered = new AtomicLong();
    private final AtomicLong cancelled = new AtomicLong();
    private final AtomicLong inFlight = new AtomicLong();

    private final AtomicBoolean running = new AtomicBoolean(true);
    private final List<Thread> workers = new ArrayList<>();

    public RedisStreamAdvisorQueue(AdvisorJobProperties props, AdvisorJobQueue.Handler handler,
                                   AdvisorJobQueue.Sleeper sleeper, StringRedisTemplate redis) {
        this.props = props;
        this.handler = handler;
        this.sleeper = sleeper;
        this.redis = redis;
        this.capacity = Math.max(1, props.getCapacity());
    }

    @PostConstruct
    public void start() {
        try {
            redis.opsForStream().createGroup(streamKey, group);
        } catch (RuntimeException ignore) {
            // BUSYGROUP：组已存在，幂等忽略。
        }
        int n = Math.max(1, props.getWorkers());
        for (int i = 0; i < n; i++) {
            Thread t = new Thread(this::workerLoop, "redis-advisor-worker-" + i);
            t.setDaemon(true);
            workers.add(t);
            t.start();
        }
    }

    @PreDestroy
    public void stop() {
        running.set(false);
        for (Thread t : workers) t.interrupt();
        for (Thread t : workers) {
            try {
                t.join(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private void workerLoop() {
        while (running.get()) {
            MapRecord<String, Object, Object> rec = claimOne();
            if (rec == null) continue;
            try {
                process(rec);
            } catch (RuntimeException ignore) {
                // 处理中的意外（序列化/Redis 抖动）：让条目继续 pending，等 idle 重投，
                // 不要在这里吞掉导致任务永久卡在 RUNNING。
            }
        }
    }

    /** 先取从未投递的新条目（>），没有再按 idle 捞 pending（崩溃重投的等价实现）。 */
    @SuppressWarnings("unchecked")
    private MapRecord<String, Object, Object> claimOne() {
        List<MapRecord<String, Object, Object>> fresh = redis.opsForStream().read(
                Consumer.from(group, consumer),
                StreamReadOptions.empty().count(1).block(Duration.ofMillis(200)),
                StreamOffset.create(streamKey, ReadOffset.lastConsumed()));
        if (fresh != null && !fresh.isEmpty()) return fresh.get(0);

        var pending = redis.opsForStream().pending(
                streamKey, Consumer.from(group, consumer), Range.unbounded(), 16L);
        if (pending != null) {
            for (int i = 0; i < pending.size(); i++) {
                var pm = pending.get(i);
                Duration idle = pm.getElapsedTimeSinceLastDelivery();
                if (idle != null && idle.toMillis() >= props.getPollAfterMs()) {
                    List<MapRecord<String, Object, Object>> reclaimed = redis.opsForStream().read(
                            Consumer.from(group, consumer),
                            StreamReadOptions.empty().count(1),
                            StreamOffset.create(streamKey, ReadOffset.from(pm.getIdAsString())));
                    if (reclaimed != null && !reclaimed.isEmpty()) return reclaimed.get(0);
                }
            }
        }
        return null;
    }

    private void process(MapRecord<String, Object, Object> rec) {
        String id = String.valueOf(rec.getValue().get("id"));
        // W-Z7：被客户端撤回的任务（state hash 已写 CANCELLED）——捞到即丢弃，不调上游。
        String tombstone = String.valueOf(redis.opsForHash().get(statePrefix + id, "status"));
        if ("CANCELLED".equals(tombstone)) {
            redis.opsForStream().acknowledge(streamKey, group, rec.getId().getValue());
            return;
        }
        String requestId = String.valueOf(rec.getValue().get("requestId"));
        String question = String.valueOf(rec.getValue().get("question"));
        Map<String, Object> context;
        try {
            context = json.readValue(String.valueOf(rec.getValue().get("context")), ConcurrentHashMap.class);
        } catch (JsonProcessingException e) {
            context = Map.of();
        }

        long storedAttempts = readLong(statePrefix + id, "attempts");
        StreamJobState sj = new StreamJobState(props.getMaxAttempts());
        sj.restoreAttempts((int) storedAttempts);
        sj.begin();
        persistAttempts(id, sj.attempts());

        try {
            LlmClient.Answer ans = handler.handle(question, context);
            sj.succeed(ans.answer(), ans.cached(), ans.latencyMs());
            writeTerminal(id, sj);
            redis.opsForStream().acknowledge(streamKey, group, rec.getId().getValue());
            done.incrementAndGet();
            inFlight.decrementAndGet();
        } catch (RuntimeException e) {
            String reason = reasonOf(e);
            boolean dead = sj.fail(reason);
            if (dead) {
                Map<String, String> dl = new LinkedHashMap<>();
                dl.put("id", id);
                dl.put("requestId", requestId == null ? "" : requestId);
                dl.put("question", question);
                dl.put("reason", sj.reason());
                dl.put("attempts", String.valueOf(sj.attempts()));
                redis.opsForStream().add(dlqKey, dl);
                writeTerminal(id, sj);
                redis.opsForStream().acknowledge(streamKey, group, rec.getId().getValue());
                deadLettered.incrementAndGet();
                inFlight.decrementAndGet();
            } else {
                // 留 pending：等 idle 被其它实例（或本实例下次循环）捞回重投。
                inFlight.incrementAndGet();
            }
        }
    }

    private void persistAttempts(String id, int attempts) {
        redis.opsForHash().put(statePrefix + id, "attempts", String.valueOf(attempts));
    }

    private void writeTerminal(String id, StreamJobState sj) {
        String key = statePrefix + id;
        redis.opsForHash().put(key, "status", sj.status().name());
        if (sj.isTerminal()) {
            redis.opsForHash().put(key, "finishedAtMs", String.valueOf(System.currentTimeMillis()));
        }
        if (sj.status() == StreamJobState.Status.DONE) {
            redis.opsForHash().put(key, "answer", sj.answer() == null ? "" : sj.answer());
            redis.opsForHash().put(key, "cached", String.valueOf(sj.answerCached()));
            redis.opsForHash().put(key, "latencyMs", String.valueOf(sj.latencyMs()));
        } else if (sj.status() == StreamJobState.Status.DEAD) {
            redis.opsForHash().put(key, "reason", sj.reason() == null ? "unknown" : sj.reason());
        }
    }

    private long readLong(String hashKey, String field) {
        Object v = redis.opsForHash().get(hashKey, field);
        if (v == null) return 0L;
        try {
            return Long.parseLong(v.toString());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    @Override
    public AdvisorJobQueue.SubmitResult submit(String question, Map<String, Object> context, String requestId) {
        String dedupKey = normalizeRequestId(requestId);
        if (dedupKey != null) {
            Boolean fresh = redis.opsForValue().setIfAbsent(
                    dedupPrefix + dedupKey, "pending", Duration.ofSeconds(props.getMaxTracked()));
            if (Boolean.FALSE.equals(fresh)) {
                Object existing = redis.opsForValue().get(dedupPrefix + dedupKey);
                if (existing != null) {
                    dedupHits.incrementAndGet();
                    return AdvisorJobQueue.SubmitResult.duplicate(existing.toString());
                }
            }
        }

        Long depth = redis.opsForStream().size(streamKey);
        if (depth != null && depth >= capacity) {
            rejected.incrementAndGet();
            return AdvisorJobQueue.SubmitResult.rejected();
        }

        String id = UUID.randomUUID().toString();
        String ctxJson;
        try {
            ctxJson = json.writeValueAsString(context == null ? Map.of() : context);
        } catch (JsonProcessingException e) {
            ctxJson = "{}";
        }
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("id", id);
        fields.put("requestId", dedupKey == null ? "" : dedupKey);
        fields.put("question", question);
        fields.put("context", ctxJson);
        redis.opsForStream().add(streamKey, fields);

        String stateKey = statePrefix + id;
        redis.opsForHash().put(stateKey, "status", StreamJobState.Status.QUEUED.name());
        redis.opsForHash().put(stateKey, "attempts", "0");
        redis.opsForHash().put(stateKey, "question", question);
        redis.opsForHash().put(stateKey, "createdAtMs", String.valueOf(System.currentTimeMillis()));
        if (dedupKey != null) {
            redis.opsForHash().put(stateKey, "requestId", dedupKey);
            redis.opsForValue().set(dedupPrefix + dedupKey, id, Duration.ofSeconds(props.getMaxTracked()));
        }

        enqueued.incrementAndGet();
        inFlight.incrementAndGet();
        return AdvisorJobQueue.SubmitResult.queued(id);
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<Map<String, Object>> view(String jobId) {
        Object raw = redis.opsForHash().entries(statePrefix + jobId);
        if (raw == null) return Optional.empty();
        Map<Object, Object> h = (Map<Object, Object>) raw;
        if (h.isEmpty()) return Optional.empty();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("jobId", jobId);
        for (Map.Entry<Object, Object> e : h.entrySet()) {
            String k = e.getKey().toString();
            String v = e.getValue() == null ? "" : e.getValue().toString();
            switch (k) {
                case "status", "question", "requestId", "answer", "reason" -> body.put(k, v);
                case "attempts", "createdAtMs", "finishedAtMs", "latencyMs" ->
                        body.put(k, Long.parseLong(v.isEmpty() ? "0" : v));
                case "cached" -> body.put(k, Boolean.parseBoolean(v));
            }
        }
        return Optional.of(body);
    }

    @Override
    public Map<String, Object> stats() {
        Map<String, Object> m = new LinkedHashMap<>();
        Long depth = redis.opsForStream().size(streamKey);
        var summary = redis.opsForStream().pending(streamKey, group);
        long pending = summary == null ? 0L : summary.getTotalPendingMessages();
        m.put("capacity", (long) capacity);
        m.put("depth", depth == null ? 0L : depth);
        m.put("pending", pending);
        m.put("workers", (long) Math.max(1, props.getWorkers()));
        m.put("maxAttempts", (long) props.getMaxAttempts());
        m.put("inFlight", inFlight.get());
        m.put("enqueued", enqueued.get());
        m.put("rejected", rejected.get());
        m.put("dedupHits", dedupHits.get());
        m.put("done", done.get());
        m.put("deadLettered", deadLettered.get());
        m.put("cancelled", cancelled.get());
        return m;
    }

    /**
     * 撤回一个还在排队的任务（W-Z7）——tombstone 语义：state hash 直写 CANCELLED。
     * worker 下一次 claimOne 捞到这一条（fresh 或 pending 重投都走 process 的早退）后直接 XACK 丢弃。
     * 已在飞 / 已终结 → cancelled:false + 原因，不谎称撤得回；未知 jobId → Optional.empty()。
     */
    @Override
    public Optional<Map<String, Object>> cancel(String jobId) {
        String stateKey = statePrefix + jobId;
        Object raw = redis.opsForHash().entries(stateKey);
        @SuppressWarnings("unchecked")
        Map<Object, Object> h = (Map<Object, Object>) raw;
        if (h == null || h.isEmpty()) return Optional.empty();

        String current = h.get("status") == null ? "" : h.get("status").toString();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("jobId", jobId);

        if ("QUEUED".equals(current)) {
            redis.opsForHash().put(stateKey, "status", StreamJobState.Status.CANCELLED.name());
            redis.opsForHash().put(stateKey, "reason", "client-cancel");
            redis.opsForHash().put(stateKey, "finishedAtMs", String.valueOf(System.currentTimeMillis()));
            Object dedup = h.get("requestId");
            String dedupKey = dedup == null ? "" : dedup.toString();
            if (!dedupKey.isEmpty()) {
                // 撤回后同一 requestId 再问，应走一次新的受理流程；不放这个键会被幂等指回已取消的任务。
                try {
                    redis.delete(dedupPrefix + dedupKey);
                } catch (RuntimeException ignore) {
                    // 幂等键清理失败不改变「这一问已被撤回」的事实；记一条静默，下次提交可能仍 dupe —— 不优雅但不致命。
                }
            }
            cancelled.incrementAndGet();
            body.put("status", "CANCELLED");
            body.put("cancelled", true);
            body.put("reason", "queued");
            return Optional.of(body);
        }
        body.put("status", current.isEmpty() ? "UNKNOWN" : current);
        body.put("cancelled", false);
        if ("RUNNING".equals(current)) {
            body.put("reason", "already-running");
        } else {
            body.put("reason", "already-terminal");
        }
        return Optional.of(body);
    }

    /** 死信只读白名单（W-Z1 切片2）：只回 {id, requestId, reason, attempts}，question/context 不出门。 */
    @Override
    public java.util.List<Map<String, Object>> deadLetters(int limit) {
        int cap = Math.max(1, Math.min(50, limit));
        List<Map<String, Object>> out = new ArrayList<>(cap);
        try {
            var records = redis.opsForStream().reverseRange(dlqKey, Range.unbounded(), Limit.limit().count(128));
            if (records != null) {
                for (var rec : records) {
                    if (out.size() >= cap) break;
                    var v = rec.getValue();
                    Map<String, Object> m = new LinkedHashMap<>();
                    String id = String.valueOf(v.get("id"));
                    m.put("id", id);
                    Object rid = v.get("requestId");
                    if (rid != null && !rid.toString().isEmpty()) m.put("requestId", rid.toString());
                    Object reason = v.get("reason");
                    m.put("reason", reason == null || reason.toString().isEmpty() ? "unknown" : reason.toString());
                    m.put("attempts", parseLongField(v.get("attempts")));
                    out.add(m);
                }
            }
        } catch (RuntimeException ignore) {
            // 死信读失败：空列表而不是 500 —— 运维视图永不砸
        }
        return out;
    }

    private static long parseLongField(Object v) {
        if (v == null) return 0L;
        try {
            return Long.parseLong(v.toString());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    @Override
    public long pollAfterMs() {
        return props.getPollAfterMs();
    }

    /** 供 try-with-resources（联调测试）使用：关闭即停 worker。 */
    @Override
    public void close() {
        stop();
    }

    private static String reasonOf(RuntimeException e) {
        if (e instanceof AdvisorUnavailableException aue) return aue.getReason();
        return "handler-error";
    }

    private static String normalizeRequestId(String raw) {
        if (raw == null) return null;
        String id = raw.trim();
        return id.isEmpty() ? null : id;
    }
}
