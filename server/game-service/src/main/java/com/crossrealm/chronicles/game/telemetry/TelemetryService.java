package com.crossrealm.chronicles.game.telemetry;

import com.crossrealm.chronicles.game.GameServiceProperties;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
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
}
