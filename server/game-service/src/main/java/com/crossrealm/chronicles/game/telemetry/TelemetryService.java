package com.crossrealm.chronicles.game.telemetry;

import com.crossrealm.chronicles.game.GameServiceProperties;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 限容内存事件队列：超过 maxEvents 就丢弃最老的一条。
 * 生产环境应换成消息队列/时序库；这里刻意保持零依赖。
 */
@Service
public class TelemetryService {

    private final GameServiceProperties properties;
    private final Deque<TelemetryEvent> events = new ArrayDeque<>();
    private final AtomicLong sequence = new AtomicLong();

    public TelemetryService(GameServiceProperties properties) {
        this.properties = properties;
    }

    public TelemetryEvent record(String type, String detail) {
        synchronized (events) {
            while (events.size() >= properties.getTelemetry().getMaxEvents()) {
                events.pollFirst();
            }
            TelemetryEvent event = TelemetryEvent.of(sequence.incrementAndGet(), type, detail);
            events.addLast(event);
            return event;
        }
    }

    public int count() {
        synchronized (events) {
            return events.size();
        }
    }

    /** 调试用：按时间序返回全部缓存事件 */
    public List<TelemetryEvent> snapshot() {
        synchronized (events) {
            return List.copyOf(events);
        }
    }

    /**
     * 窗口内的事件频次摘要（W-X15）—— {@code /api/telemetry/summary} 的后端。
     *
     * <p><b>为什么不做缓存</b>（与 Boss 榜 W-P1 刻意不同）：遥测是持续写入、偶有读取的流，
     * 摘要是冷数据聚合 —— 缓存它只会让"最新一条"迟迟不出现；直接 O(n + m log k)
     * 现算（n ≤ maxEvents，m ≤ distinct types）反而说得清楚什么时候算的。
     *
     * <p><b>算法</b>：全窗口扫一遍计数 O(n)；再用最小堆只留 k 条最高频（W-P1 同一习惯用法，
     * O(m log k)，k ≤ 20），最后一次性倒出并按频次降序 + 类型升序排定——堆里留下的就是最小
     * k 项的优势集，取出后排序 m' log m'（m' ≤ k），没有全量 m log m 的排序税。
     *
     * @param topN 要几条（夹到 [1, 20]）
     */
    public Map<String, Object> summarize(int topN) {
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
}
