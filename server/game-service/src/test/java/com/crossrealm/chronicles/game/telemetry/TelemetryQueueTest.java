package com.crossrealm.chronicles.game.telemetry;

import com.crossrealm.chronicles.game.GameServiceProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-M1：telemetry 异步摄取的背压契约。
 *
 * <p>注意：这里用 <b>new TelemetryService(...)</b>（不经 Spring 容器），
 * 所以 {@code @PostConstruct} 的守护线程<b>不会</b>启动 —— 背压行为完全确定：
 * inbox 只进不出，满 1024 后 drop-oldest。Spring 上下文里（controller 测试）走守护线程，
 * drain-then-read 保证同一套读后即见语义。
 */
class TelemetryQueueTest {

    private TelemetryService service(int maxEvents) {
        GameServiceProperties properties = new GameServiceProperties();
        properties.getTelemetry().setMaxEvents(maxEvents);
        return new TelemetryService(properties);
    }

    @Test
    @DisplayName("inbox 满（1024）时 drop-oldest：本条进、最老那条让位并计数")
    void dropsOldestWhenInboxFull() {
        TelemetryService service = service(10);
        for (int i = 0; i < 1024 + 76; i++) {
            service.record("type_" + i, "d");
        }
        Map<String, Long> stats = service.queueStats();
        assertEquals(1100L, stats.get("enqueued"));
        assertEquals(76L, stats.get("dropped"), "超出 1024 的 76 条应让最老让位");
        assertEquals(1024L, stats.get("depth"));
        // 没人 drain：都还在 inbox 里
        assertEquals(0L, stats.get("processed"));
    }

    @Test
    @DisplayName("drainPending 在读路径上生效：record → count 立刻可见，且只摄入一次")
    void drainPendingOnReadIsAtomic() {
        TelemetryService service = service(10);
        service.record("a", "1");
        service.record("b", "2");
        assertEquals(2, service.count());
        assertEquals(2, service.count(), "二次读取不得重复摄入");
        Map<String, Long> stats = service.queueStats();
        assertEquals(2L, stats.get("processed"));
        assertEquals(0L, stats.get("depth"));
    }

    @Test
    @DisplayName("保序：drain 后 snapshot 的 id 单调递增（单消费者 FIFO）")
    void orderIsPreserved() {
        TelemetryService service = service(50);
        for (int i = 0; i < 30; i++) {
            service.record("t", String.valueOf(i));
        }
        List<TelemetryEvent> snap = service.snapshot();
        for (int i = 1; i < snap.size(); i++) {
            assertTrue(snap.get(i).id() > snap.get(i - 1).id(), "id 应单调递增");
        }
    }

    @Test
    @DisplayName("at-most-once：守护线程不会重复摄入同一格（processed 总数等于 enqueued 减 dropped）")
    void atMostOnceAccounting() {
        TelemetryService service = service(500);
        for (int i = 0; i < 100; i++) {
            service.record("t", "d");
        }
        service.count(); // 触发 drainPending
        Map<String, Long> stats = service.queueStats();
        assertEquals(stats.get("enqueued") - stats.get("dropped"), stats.get("processed"),
                "enqueued − dropped = processed（每格只被摄入一次）");
    }
}
