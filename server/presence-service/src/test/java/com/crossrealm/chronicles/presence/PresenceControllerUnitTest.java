package com.crossrealm.chronicles.presence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * 控制器的确定性行为（不拉 Spring 上下文）：校验口径、429 硬上限、count 契约。
 * 判据直接对路由方法——不合格的请求哪一层都拦不住（Redis / Pub/Sub / SSE 全都不该看见脏数据）。
 */
class PresenceControllerUnitTest {

    private InMemoryPresenceStore store;
    private InMemoryPresenceEventHub hub;
    private PresenceProperties props;
    private PresenceController controller;
    private java.util.concurrent.ScheduledExecutorService scheduler;

    @BeforeEach
    void setUp() {
        store = new InMemoryPresenceStore(15_000L);
        hub = new InMemoryPresenceEventHub();
        props = new PresenceProperties();
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "test-keepalive");
            t.setDaemon(true);
            return t;
        });
        controller = new PresenceController(store, hub, props, scheduler);
    }

    @AfterEach
    void tearDown() {
        scheduler.shutdownNow();
    }

    private static Map<String, Object> body(Object id, Object name, Object hue, Object x, Object z) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("name", name);
        m.put("hue", hue);
        m.put("x", x);
        m.put("z", z);
        return m;
    }

    @Test
    void 合法心跳返回202并进入计数() {
        var resp = controller.beat("world", body("crimson-gavel", "Crimson", 310, 0.5, -0.5));
        assertEquals(HttpStatus.ACCEPTED, resp.getStatusCode());

        Map<String, Object> count = controller.count("world");
        assertEquals(1L, ((Number) count.get("count")).longValue());
    }

    @Test
    void 非法频道直接拒绝() {
        assertThrows(ResponseStatusException.class,
                () -> controller.beat("bad channel!", body("ok", "Name", 1, 0, 0)));
        assertThrows(ResponseStatusException.class,
                () -> controller.count("bad channel!"));
        assertThrows(ResponseStatusException.class,
                () -> controller.stream("bad channel!", null));
    }

    @Test
    void 非法id直接拒绝() {
        assertThrows(ResponseStatusException.class,
                () -> controller.beat("world", body("寄", "Name", 1, 0, 0)));
        assertThrows(ResponseStatusException.class,
                () -> controller.beat("world", body("", "Name", 1, 0, 0)));
        assertThrows(ResponseStatusException.class,
                () -> controller.beat("world", body(null, "Name", 1, 0, 0)));
    }

    @Test
    void 空name或纯控制字符name被拒绝() {
        assertThrows(ResponseStatusException.class,
                () -> controller.beat("world", body("okid", "   ", 1, 0, 0)));
        assertThrows(ResponseStatusException.class,
                () -> controller.beat("world", body("okid", "", 1, 0, 0)));
    }

    @Test
    void 控制字符被替换掉不进状态层() {
        controller.beat("world", body("okid", "ab\ncd\u0000ef\u007Fgh", 0, 0, 0));
        Wanderer stored = store.snapshot("world").get("okid");
        assertEquals("ab cd ef gh", stored.name());
    }

    @Test
    void hue归一到360度范围且非有限值落到0() {
        controller.beat("world", body("neg", "N", -10, 0, 0));
        assertEquals(350, store.snapshot("world").get("neg").hue());

        controller.beat("world", body("nan", "NN", Double.NaN, 0, 0));
        assertEquals(0, store.snapshot("world").get("nan").hue());

        controller.beat("world", body("str", "S", "200", 0, 0));
        assertEquals(200, store.snapshot("world").get("str").hue());
    }

    @Test
    void x与z夹紧到负1到1() {
        controller.beat("world", body("clamp", "C", 0, 99, -99));
        Wanderer w = store.snapshot("world").get("clamp");
        assertEquals(1.0, w.x(), 1e-9);
        assertEquals(-1.0, w.z(), 1e-9);
    }

    @Test
    void 单频道到顶回429_且其他频道不受影响() {
        props.setMaxWanderersPerChannel(2);
        controller.beat("world", body("a1", "A", 1, 0, 0));
        controller.beat("world", body("a2", "B", 2, 0, 0));

        ResponseStatusException full = assertThrows(ResponseStatusException.class,
                () -> controller.beat("world", body("a3", "C", 3, 0, 0)));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, full.getStatusCode());

        assertEquals(HttpStatus.ACCEPTED,
                controller.beat("other", body("a3", "C", 3, 0, 0)).getStatusCode());
    }

    @Test
    void 计数的频道隔离与坏channel() {
        controller.beat("world", body("x1", "X", 1, 0, 0));
        controller.beat("dungeon-1", body("x2", "Y", 2, 0, 0));

        Map<String, Object> world = controller.count("world");
        Map<String, Object> dungeon = controller.count("dungeon-1");
        assertEquals(1L, ((Number) world.get("count")).longValue());
        assertEquals(1L, ((Number) dungeon.get("count")).longValue());
        assertEquals(0L, ((Number) controller.count("nope").get("count")).longValue());
    }

    @Test
    void stream非法频道抛400而不接线() {
        assertThrows(ResponseStatusException.class,
                () -> controller.stream("bad channel!", null));
    }

    @Test
    void stream合法频道返回SseEmitter() {
        assertNotNull(controller.stream("world", new org.springframework.mock.web.MockHttpServletResponse()));
    }
}
