package com.crossrealm.chronicles.ai;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * W-Y4：把「一次慢速大模型调用」从请求线程里挪出来，做成**可靠**的进程内任务队列。
 *
 * <p><b>真实痛点</b>：{@code POST /api/ai/chat} 是同步的，一轮上游 2~30 秒。浏览器多开
 * 几个顾问面板，Tomcat 的工作线程就被慢 I/O 钉住了 —— 而这些线程本该去处理毫秒级的
 * 存档、榜单、遥测请求。熔断与 TTL 缓存解决的是「上游坏了怎么办」，解决不了
 * 「上游只是慢」。队列解决的是**资源隔离**：慢活儿走独立的有界车道。
 *
 * <p><b>为什么不用现成 MQ</b>：本仓刻意零额外基础设施；W-M1 的遥测 inbox 是
 * at-most-once（影子数据可丢），但「玩家问了一句」不是影子数据 —— 问出去就该有答案，
 * 或者至少有一个说清楚的失败。这里给的是 at-least-once 的**处理语义**：
 * <ul>
 *   <li><b>背压</b>：有界 {@link ArrayBlockingQueue}，满则 {@code submit} 立即返回
 *       {@code rejected}，由 Controller 明确回 429 + Retry-After；绝不让请求线程阻塞等空位，
 *       也绝不静默丢掉一句已经收下的话；</li>
 *   <li><b>幂等</b>：可选的 {@code requestId}（玩家重连/重试同一句时用），
 *       {@code putIfAbsent} 去重，重复提交返回**同一个 jobId**，不会连问上游两次、扣两份钱；</li>
 *   <li><b>多消费者按任务并行</b>：N 个 worker（默认 2）从同一队列取，
 *       每条任务只会被一个 worker 拿到（{@code poll} 是原子的）。这里没有按 key 分区，
 *       因为任务之间无状态、无顺序依赖；保序由响应里的 jobId 承担，不由出队顺序承担；</li>
 *   <li><b>选择性重试</b>：只有 {@code upstream-*} / {@code circuit-open}
 *       （瞬态）才重试并做指数退避；{@code not-configured} 是配置错误，
 *       再问一百次也不会自己长出一个密钥；</li>
 *   <li><b>死信</b>：重试耗尽进 DEAD，机器码原因留在任务视图里可以轮询到 ——
 *       「问了没答」与「问过、上游挂了」是两件事，不许都化作一个 503；</li>
 *   <li><b>有界保留</b>：终态任务按完成时间 LRU 淘汰，永不淘汰在飞的任务。</li>
 * </ul>
 *
 * <p><b>边界（诚实写在这里）</b>：这是**进程内**队列。进程重启会丢在途任务，
 * 多实例之间不共享 jobId。要跨实例可靠，正确做法是把 {@link BlockingQueue} 换成
 * Redis Streams（消费者组 + XACK + pending 列表重投），而不是给这个 HashMap 加分布式锁。
 * W-M5 的 Redis Pub/Sub 是 broadcast（掉线就永久丢），本队列与其互补而非替代。
 */
public class AdvisorJobQueue implements AdvisorQueue {

    public enum Status { QUEUED, RUNNING, DONE, DEAD, CANCELLED }

    /** 队列与 LlmClient 之间唯一的缝；测试注入 lambda，生产注入 {@code client::ask}。 */
    @FunctionalInterface
    public interface Handler {
        LlmClient.Answer handle(String question, Map<String, Object> context);
    }

    /** 可注入的等待器：生产 {@code Thread::sleep}，测试用 no-op，不真的等退避。 */
    @FunctionalInterface
    public interface Sleeper {
        void sleep(long millis) throws InterruptedException;
    }

    public record SubmitResult(boolean accepted, boolean duplicate, String jobId, String reason) {
        static SubmitResult queued(String id) { return new SubmitResult(true, false, id, "queued"); }
        static SubmitResult duplicate(String id) { return new SubmitResult(true, true, id, "duplicate"); }
        static SubmitResult rejected() { return new SubmitResult(false, false, null, "queue-full"); }
    }

    private static final class Job {
        final String id;
        final String requestId;
        final String question;
        final Map<String, Object> context;
        final long createdAtMs;
        volatile Status status = Status.QUEUED;
        volatile int attempts;
        volatile String reason;
        volatile LlmClient.Answer answer;
        volatile long finishedAtMs;
        volatile long completionOrder;

        Job(String id, String requestId, String question, Map<String, Object> context) {
            this.id = id;
            this.requestId = requestId;
            this.question = question;
            this.context = context;
            this.createdAtMs = System.currentTimeMillis();
        }
    }

    private final int maxAttempts;
    private final long retryBaseMs;
    private final long pollAfterMs;
    private final int maxTracked;
    private final int workers;
    private final Handler handler;
    private final Sleeper sleeper;
    private final BlockingQueue<String> inbox;
    private final ConcurrentHashMap<String, Job> jobs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> requestIds = new ConcurrentHashMap<>();
    private final AtomicBoolean running = new AtomicBoolean(true);
    private final List<Thread> workerThreads = new ArrayList<>();
    private final AtomicLong enqueued = new AtomicLong();
    private final AtomicLong rejected = new AtomicLong();
    private final AtomicLong dedupHits = new AtomicLong();
    private final AtomicLong processed = new AtomicLong();
    private final AtomicLong retried = new AtomicLong();
    private final AtomicLong done = new AtomicLong();
    private final AtomicLong deadLettered = new AtomicLong();
    private final AtomicLong cancelled = new AtomicLong();
    private final AtomicLong inFlight = new AtomicLong();
    /** 终态淘汰的次序：挂钟只有毫秒分辨率，同一毫秒完成的三个任务无法排序。 */
    private final AtomicLong completionSeq = new AtomicLong();

    public AdvisorJobQueue(AdvisorJobProperties props, Handler handler) {
        this(props, handler, Thread::sleep);
    }

    /** 包内可见：测试关掉 worker 线程、注入 no-op 等待器，行为完全确定。 */
    AdvisorJobQueue(AdvisorJobProperties props, Handler handler, Sleeper sleeper) {
        this.maxAttempts = Math.max(1, props.getMaxAttempts());
        this.retryBaseMs = Math.max(1L, props.getRetryBaseMs());
        this.pollAfterMs = Math.max(1L, props.getPollAfterMs());
        this.maxTracked = Math.max(1, props.getMaxTracked());
        this.workers = Math.max(0, props.getWorkers());
        this.handler = handler;
        this.sleeper = sleeper;
        this.inbox = new ArrayBlockingQueue<>(Math.max(1, props.getCapacity()));
    }

    @PostConstruct
    public void start() {
        for (int i = 0; i < workers; i++) {
            Thread t = new Thread(this::workerLoop, "advisor-job-worker-" + i);
            t.setDaemon(true);
            workerThreads.add(t);
            t.start();
        }
    }

    @PreDestroy
    public void stop() {
        running.set(false);
        for (Thread t : workerThreads) t.interrupt();
        for (Thread t : workerThreads) {
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
            String id;
            try {
                id = inbox.poll(200, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            if (id != null) process(id);
        }
    }

    /**
     * 收下一句提问。**不阻塞**：队列满就当场拒绝，由调用方回 429。
     * 上下文在这里做一次防御性拷贝 —— 调用方的 Map 可能在请求结束后被复用/清空。
     */
    public SubmitResult submit(String question, Map<String, Object> context, String requestId) {
        String id = UUID.randomUUID().toString();
        String dedupKey = normalizeRequestId(requestId);
        if (dedupKey != null) {
            String prior = requestIds.putIfAbsent(dedupKey, id);
            if (prior != null) {
                dedupHits.incrementAndGet();
                return SubmitResult.duplicate(prior);
            }
        }
        Map<String, Object> snapshot = context == null
                ? Map.of() : new LinkedHashMap<>(context);
        Job job = new Job(id, dedupKey, question, snapshot);
        jobs.put(id, job);
        if (!inbox.offer(id)) {
            // 回滚两处登记：被拒的任务既不该出现在轮询里，也不该占住幂等键。
            jobs.remove(id, job);
            if (dedupKey != null) requestIds.remove(dedupKey, id);
            rejected.incrementAndGet();
            return SubmitResult.rejected();
        }
        enqueued.incrementAndGet();
        return SubmitResult.queued(id);
    }

    /** 包内可见：测试手动推进一格（workers=0 时没有守护线程抢活）。 */
    boolean drainOne() {
        String id = inbox.poll();
        return id != null && process(id);
    }

    /** 处理一条任务；返回 false 表示这格已经不在可处理态（被淘汰/重复出队）。 */
    private boolean process(String id) {
        Job job = jobs.get(id);
        if (job == null || job.status != Status.QUEUED) return false;
        job.status = Status.RUNNING;
        inFlight.incrementAndGet();
        try {
            for (int attempt = job.attempts + 1; attempt <= maxAttempts; attempt++) {
                job.attempts = attempt;
                try {
                    job.answer = handler.handle(job.question, job.context);
                    job.status = Status.DONE;
                    done.incrementAndGet();
                    return true;
                } catch (RuntimeException e) {
                    String reason = reasonOf(e);
                    if (!isRetryable(reason) || attempt == maxAttempts) {
                        job.reason = reason;
                        job.status = Status.DEAD;
                        deadLettered.incrementAndGet();
                        return true;
                    }
                    retried.incrementAndGet();
                    try {
                        sleeper.sleep(backoff(attempt));
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        job.reason = "interrupted";
                        job.status = Status.DEAD;
                        deadLettered.incrementAndGet();
                        return true;
                    }
                }
            }
            return false;
        } finally {
            job.finishedAtMs = System.currentTimeMillis();
            job.completionOrder = completionSeq.incrementAndGet();
            inFlight.decrementAndGet();
            processed.incrementAndGet();
            evictIfNeeded();
        }
    }

    /** 终态任务超过保留上限时淘汰最老的；QUEUED/RUNNING 一律不动。 */
    private synchronized void evictIfNeeded() {
        int overflow = jobs.size() - maxTracked;
        if (overflow <= 0) return;
        List<Job> terminal = new ArrayList<>();
        for (Job j : jobs.values()) {
            if (j.status == Status.DONE || j.status == Status.DEAD || j.status == Status.CANCELLED) terminal.add(j);
        }
        terminal.sort(Comparator.comparingLong(j -> j.completionOrder));
        for (int i = 0; i < Math.min(overflow, terminal.size()); i++) {
            Job victim = terminal.get(i);
            jobs.remove(victim.id, victim);
            if (victim.requestId != null) requestIds.remove(victim.requestId, victim.id);
        }
    }

    private long backoff(int attempt) {
        return retryBaseMs << Math.min(attempt - 1, 4);
    }

    private static boolean isRetryable(String reason) {
        return reason != null
                && (reason.startsWith("upstream-") || "circuit-open".equals(reason));
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

    /** 轮询视图。刻意**不回显 question / context**：那是玩家输入，不是轮询该拿的东西。 */
    public Optional<Map<String, Object>> view(String jobId) {
        Job job = jobs.get(jobId);
        if (job == null) return Optional.empty();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("jobId", job.id);
        body.put("status", job.status.name());
        body.put("attempts", job.attempts);
        body.put("createdAtMs", job.createdAtMs);
        if (job.requestId != null) {
            body.put("requestId", job.requestId);
        }
        if (job.status == Status.DONE && job.answer != null) {
            body.put("answer", job.answer.answer());
            body.put("model", job.answer.model());
            body.put("cached", job.answer.cached());
            body.put("latencyMs", job.answer.latencyMs());
        } else if (job.status == Status.DEAD) {
            body.put("reason", job.reason == null ? "unknown" : job.reason);
        } else if (job.status == Status.CANCELLED) {
            body.put("reason", job.reason == null ? "client-cancel" : job.reason);
        }
        return Optional.of(body);
    }

    /** 死信只读白名单（W-Z1 切片2）：deadLettered 报「多少次」，这里报「哪些」——没有玩家输入。 */
    @Override
    public java.util.List<Map<String, Object>> deadLetters(int limit) {
        int cap = Math.max(1, Math.min(50, limit));
        List<Job> dead = new ArrayList<>();
        for (Job j : jobs.values()) {
            if (j.status == Status.DEAD) dead.add(j);
        }
        dead.sort(Comparator.comparingLong((Job j) -> j.completionOrder).reversed());
        List<Map<String, Object>> out = new ArrayList<>(Math.min(cap, dead.size()));
        for (Job j : dead) {
            if (out.size() >= cap) break;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", j.id);
            if (j.requestId != null) m.put("requestId", j.requestId);
            m.put("reason", j.reason == null ? "unknown" : j.reason);
            m.put("attempts", (long) j.attempts);
            m.put("finishedAtMs", j.finishedAtMs);
            // question / context / answer 刻意不带出（排障要的是同一类失败出现多少次，不是看聊天记录）
            out.add(m);
        }
        return out;
    }

    /**
     * 撤回一个还在排队的任务（W-Z7）。
     *
     * 排队中 → 从 inbox 拿掉、标 CANCELLED、`cancelled:true`——这一问从未被上游问到，
     * 顺带释放幂等键：撤回后以同一 requestId 再问，该走一次新的受理流程（否则玩家手滑撤回后
     * 原样再问，会被幂等判定静默指回一个已取消的任务，等于问了个寂寞）；
     * 运行中 / 已终结 → `cancelled:false` + 原因（already-running / already-terminal）——不谎称撤得回；
     * 未知 jobId → Optional.empty()。
     */
    public Optional<Map<String, Object>> cancel(String jobId) {
        Job job = jobs.get(jobId);
        if (job == null) return Optional.empty();
        synchronized (job) {
            if (job.status == Status.QUEUED) {
                job.status = Status.CANCELLED;
                job.reason = "client-cancel";
                job.finishedAtMs = System.currentTimeMillis();
                job.completionOrder = completionSeq.incrementAndGet();
                inbox.remove(jobId);
                if (job.requestId != null) requestIds.remove(job.requestId, job.id);
                cancelled.incrementAndGet();
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("jobId", jobId);
                body.put("status", "CANCELLED");
                body.put("cancelled", true);
                body.put("reason", "queued");
                return Optional.of(body);
            }
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("jobId", jobId);
            body.put("status", job.status.name());
            body.put("cancelled", false);
            body.put("reason", job.status == Status.RUNNING ? "already-running" : "already-terminal");
            return Optional.of(body);
        }
    }

    /** 给运维看的一眼读数：队列深度、背压拒绝、重试与死信。 */
    public Map<String, Object> stats() {
        Map<String, Object> m = new LinkedHashMap<>();
        // 全部计数统一用 long：一半 int 一半 long 的读数，客户端按数值类型分支迟早踩坑。
        m.put("capacity", (long) inbox.size() + inbox.remainingCapacity());
        m.put("depth", (long) inbox.size());
        m.put("workers", (long) workers);
        m.put("maxAttempts", (long) maxAttempts);
        m.put("maxTracked", (long) maxTracked);
        m.put("inFlight", inFlight.get());
        m.put("tracked", (long) jobs.size());
        m.put("enqueued", enqueued.get());
        m.put("rejected", rejected.get());
        m.put("dedupHits", dedupHits.get());
        m.put("processed", processed.get());
        m.put("retried", retried.get());
        m.put("done", done.get());
        m.put("deadLettered", deadLettered.get());
        m.put("cancelled", cancelled.get());
        return m;
    }

    public long pollAfterMs() { return pollAfterMs; }
}
