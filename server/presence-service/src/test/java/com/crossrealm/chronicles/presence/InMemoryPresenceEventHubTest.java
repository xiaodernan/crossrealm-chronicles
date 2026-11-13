package com.crossrealm.chronicles.presence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;

/**
 * 进程内扇出钉子：订阅者数量/抛错隔离/取消订阅——这三条直接对应 SSE 连接的吞吐与存活。
 */
class InMemoryPresenceEventHubTest {

    @Test
    void publish扇出给同频道全部订阅者() {
        InMemoryPresenceEventHub hub = new InMemoryPresenceEventHub();
        List<Wanderer> received = new ArrayList<>();
        Consumer<Wanderer> probe = received::add;

        hub.subscribe("world", probe);
        hub.subscribe("world", probe);
        hub.subscribe("dungeon-1", w -> { throw new AssertionError("别的频道不该收到 world 的消息"); });

        Wanderer w = new Wanderer("crimson-gavel", "Crimson", 310, 0, 0, 1L);
        hub.publish("world", w);

        assertEquals(2, received.size());
        assertEquals("crimson-gavel", received.get(0).id());
    }

    @Test
    void 单个订阅者抛错不阻断其他订阅者() {
        InMemoryPresenceEventHub hub = new InMemoryPresenceEventHub();
        List<String> ok = new ArrayList<>();
        hub.subscribe("world", w -> { throw new IllegalStateException("boom"); });
        hub.subscribe("world", w -> ok.add(w.id()));

        assertDoesNotThrow(() -> hub.publish("world", new Wanderer("alive", "OK", 1, 0, 0, 2L)));
        assertEquals(List.of("alive"), ok);
    }

    @Test
    void close句柄解除订阅() throws Exception {
        InMemoryPresenceEventHub hub = new InMemoryPresenceEventHub();
        List<Wanderer> received = new ArrayList<>();
        AutoCloseable handle = hub.subscribe("world", received::add);

        handle.close();
        hub.publish("world", new Wanderer("gone", "G", 0, 0, 0, 3L));
        assertEquals(0, received.size(), "close 之后不再投递");
    }

    @Test
    void 没有订阅者时publish不报错() {
        InMemoryPresenceEventHub hub = new InMemoryPresenceEventHub();
        assertDoesNotThrow(() -> hub.publish("empty", new Wanderer("x", "X", 0, 0, 0, 4L)));
    }
}
