package com.crossrealm.chronicles.game.telemetry;

import com.crossrealm.chronicles.game.GameServiceProperties;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * W-M1：telemetry 异步摄取 —— 有界 inbox + 单消费者守护线程 + 背压度量。
 *
 * <p><b>改前</b>：POST /api/telemetry/events 在请求线程内同步写共享 deque（record 与
 * count/summarize 抢同一把锁）。
 * <p><b>改后</b>：{@link #record} 只往有界 inbox（{@link ArrayBlockingQueue}，容量 1024）
 * 塞一格并即刻返回（id 单调）；守护线程 {@code telemetry-drainer} take 落 deque。
 * 请求线程不再摸 deque 那把锁。
 *
 * <p><b>为什么不直接上 RabbitMQ/Kafka</b>：本仓库刻意保持零额外基础设施依赖；
 * inbox 模式给出的正是消息队列的本质语义——生产者与消费者解耦、<b>有界缓冲</b>、
 * <b>背压</b>（满则丢最老 + dropped 计数，与现有"超 maxEvents 丢弃最老"一字同口径）、
 * at-most-once（进程崩溃丢在途事件，遥测本就是可丢弃的影子数据、不是账本）、
 * <b>单消费者保序</b>（id 单调 == 写入顺序，与改前 synchronized 口径一致）。
 * 零新依赖、零运维面、测试不需要起中间件。
 *
 * <p><b>契约不变</b>：record() 同步返回带 id 的 TelemetryEvent；
 * count/snapshot/summarize 先 {@link #drainPending()}（把 inbox 搬进 deque）再读——
 * 写完就能读到，与改前同语义。
 *
 * <p><b>口径</b>：
 * <ul>
 *   <li>inbox 容量 1024（maxEvents=500 的 2× 余量；满则丢最老 + dropped 计数）</li>
 *   <li>单消费者 → 写入顺序 = id 顺序</li>
 *   <li>读侧先 drainPending 再读：count/snapshot/summarize 都不会看到
 *       "inbox 里还没搬走的事件"</li>
 *   <li>at-most-once；崩溃丢在途事件可接受</li>
 * </ul>
 */
@Service
public class TelemetryService {

    private static final int INBOX_CAPACITY = 1024;

    private final GameServiceProperties properties;
    private final io.micrometer.core.instrument.MeterRegistry meterRegistry;
    private final io.micrometer.core.instrument.Counter telemetryEnqueued;
    private final io.micrometer.core.instrument.Counter telemetryDropped;
    private final io.micrometer.core.instrument.Counter telemetryProcessed;
    private final Deque<TelemetryEvent> events = new ArrayDeque<>();
    private final AtomicLong sequence = new AtomicLong();

    /* W-M1：有界 inbox + 守护消费者 + 背压度量（enqueued/dropped/processed/depth） */
    private final BlockingQueue<TelemetryEvent> inbox = new ArrayBlockingQueue<>(INBOX_CAPACITY);
    private final AtomicLong enqueued = new AtomicLong();
    private final AtomicLong dropped = new AtomicLong();
    private final AtomicLong processed = new AtomicLong();
    private final AtomicBoolean running = new AtomicBoolean(true);
    private Thread drainer;

    public TelemetryService(GameServiceProperties properties) {
        this(properties, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public TelemetryService(GameServiceProperties properties,
                            @org.springframework.lang.Nullable io.micrometer.core.instrument.MeterRegistry meterRegistry) {
        this.properties = properties;
        this.meterRegistry = meterRegistry;
        this.telemetryEnqueued = meterRegistry != null ? meterRegistry.counter("game_telemetry_enqueued_total") : null;
        this.telemetryDropped  = meterRegistry != null ? meterRegistry.counter("game_telemetry_dropped_total") : null;
        this.telemetryProcessed = meterRegistry != null ? meterRegistry.counter("game_telemetry_processed_total") : null;
    }

    @PostConstruct
    void startDraining() {
        drainer = new Thread(this::drainLoop, "telemetry-drainer");
        drainer.setDaemon(true);
        drainer.start();
    }

    @PreDestroy
    void stopDraining() {
        running.set(false);
        if (drainer != null) {
            drainer.interrupt();
            try {
                drainer.join(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        drainPending();   // 收尾：把在途事件落完再走
    }

    private void drainLoop() {
        while (running.get()) {
            TelemetryEvent event;
            try {
                event = inbox.poll(250, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            if (event != null) {
                ingest(event);
            }
        }
    }

    /** 把 inbox 里现存的事件全部落 deque（读侧的前置动作；每格只会被一个人吃掉，poll 是原子的） */
    private void drainPending() {
        for (;;) {
            TelemetryEvent event = inbox.poll();
            if (event == null) {
                return;
            }
            ingest(event);
        }
    }

    private void ingest(TelemetryEvent event) {
        synchronized (events) {
            while (events.size() >= properties.getTelemetry().getMaxEvents()) {
                events.pollFirst();
            }
            events.addLast(event);
        }
        processed.incrementAndGet();
        if (telemetryProcessed != null) telemetryProcessed.increment();
    }

    /**
     * 记录一条遥测事件。**不阻塞请求线程**：只 offer 一格 inbox，立刻返回带 id 的事件。
     * inbox 满则丢最老一格（与"超 maxEvents 丢弃最老"同一口径）并记 dropped——本条照样进。
     */
    public TelemetryEvent record(String type, String detail) {
        TelemetryEvent event = TelemetryEvent.of(sequence.incrementAndGet(), type, detail);
        enqueued.incrementAndGet();
        if (telemetryEnqueued != null) telemetryEnqueued.increment();
        if (!inbox.offer(event)) {
            inbox.poll();          // 丢最老一格
            dropped.incrementAndGet();
            if (telemetryDropped != null) telemetryDropped.increment();
            inbox.offer(event);    // 必然成功（刚空出一格）
        }
        return event;
    }

    public int count() {
        drainPending();
        synchronized (events) {
            return events.size();
        }
    }

    /** 调试用：按时间序返回全部缓存事件 */
    public List<TelemetryEvent> snapshot() {
        drainPending();
        synchronized (events) {
            return List.copyOf(events);
        }
    }

    /**
     * 窗口内的事件频次摘要（W-X15）—— {@code /api/telemetry/summary} 的后端。
     *
     * <p><b>为什么不做缓存</b>：遥测是持续写入、偶有读取的流，直接 O(n + m log k) 现算。
     * 读之前先 drainPending，保证"写完就能读到"的语义。
     */
    public Map<String, Object> summarize(int topN) {
        drainPending();
        int cap = Math.max(1, Math.min(topN, 20));
        synchronized (events) {
            Map<String, Long> counts = new java.util.HashMap<>();
            for (TelemetryEvent e : events) {
                counts.merge(e.type(), 1L, Long::sum);
            }
            PriorityQueue<Map.Entry<String, Long>> heap =
                    new PriorityQueue<>(cap, Map.Entry.comparingByValue());
            for (var entry : counts.entrySet()) {
                if (heap.size() < cap) {
                    heap.offer(entry);
                } else if (entry.getValue() > heap.peek().getValue()) {
                    heap.poll();
                    heap.offer(entry);
                }
            }
            List<Map.Entry<String, Long>> top = new java.util.ArrayList<>(heap);
            top.sort(Map.Entry.<String, Long>comparingByValue().reversed()
                    .thenComparing(Map.Entry::getKey));
            List<Map<String, Object>> byType = new java.util.ArrayList<>(top.size());
            for (var entry : top) {
                byType.add(Map.of("type", entry.getKey(), "count", entry.getValue()));
            }
            return Map.of(
                    "windowSize", events.size(),
                    "distinctTypes", counts.size(),
                    "topN", byType.size(),
                    "byType", byType);
        }
    }

    /** W-M1：背压度量——capacity / depth / enqueued / dropped / processed，给 /api/ops/stats 与测试用 */
    public Map<String, Long> queueStats() {
        Map<String, Long> m = new java.util.LinkedHashMap<>();
        m.put("capacity", (long) INBOX_CAPACITY);
        m.put("depth", (long) inbox.size());
        m.put("enqueued", enqueued.get());
        m.put("dropped", dropped.get());
        m.put("processed", processed.get());
        return m;
    }
}
