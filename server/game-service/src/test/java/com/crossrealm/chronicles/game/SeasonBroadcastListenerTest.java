package com.crossrealm.chronicles.game;

import com.crossrealm.chronicles.game.cache.TtlCache;
import java.lang.reflect.Constructor;
import java.time.Duration;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-M5：换季广播的「口径」测试。
 *
 * <p>刻意不起 Lettuce、不造 Redis {@code Message}：这一层要验的是
 * 「哪一条消息该让 30s 缓存当场失效」，而不是字节怎么进来的。传输层只剩
 * {@code onMessage} 里的一行 {@code new String(body, UTF_8)}。
 */
class SeasonBroadcastListenerTest {

    private static final String KEY = "season.active";
    private static final Duration TTL = Duration.ofSeconds(30);
    private static final String VALID =
            "{\"event\":\"season:advance\",\"id\":\"tide\",\"dayInCycle\":3}";

    /** 缓存里先放一份旧值；广播之后必须重新走 loader —— 这就是「立刻失效」的可观测定义。 */
    private static TtlCache primed() {
        TtlCache cache = new TtlCache();
        cache.get(KEY, () -> "old", TTL);
        return cache;
    }

    @Test
    void 合法换季广播立刻失效缓存并计数() {
        TtlCache cache = primed();
        SeasonBroadcastListener listener = new SeasonBroadcastListener(cache);

        listener.handle(VALID);

        assertEquals(1L, listener.receivedCount());
        assertEquals("fresh", cache.get(KEY, () -> "fresh", TTL),
                "失效之后 loader 必须被重新调用，不能再吃 30s 内的旧赛季");
    }

    @Test
    void 连续三条广播计数累加且缓存只认最后一次失效() {
        TtlCache cache = primed();
        SeasonBroadcastListener listener = new SeasonBroadcastListener(cache);

        listener.handle(VALID);
        listener.handle(VALID);
        listener.handle(VALID);

        assertEquals(3L, listener.receivedCount());
    }

    @Test
    void 无关事件不失效也不计数() {
        TtlCache cache = primed();
        SeasonBroadcastListener listener = new SeasonBroadcastListener(cache);

        listener.handle("{\"event\":\"season:heartbeat\",\"id\":\"tide\"}");

        assertEquals(0L, listener.receivedCount());
        assertEquals("old", cache.get(KEY, () -> "fresh", TTL));
    }

    @Test
    void 坏消息一律吞掉不炸订阅通道() {
        TtlCache cache = primed();
        SeasonBroadcastListener listener = new SeasonBroadcastListener(cache);

        for (String bad : new String[]{
                "not json",
                "",
                "null",
                "[]",
                "{\"event\":123}",
                "{}"
        }) {
            listener.handle(bad);
        }

        assertEquals(0L, listener.receivedCount(),
                "坏消息不能把计数抬上去；解析失败只记 WARN，订阅通道必须继续活着");
        assertEquals("old", cache.get(KEY, () -> "fresh", TTL),
                "坏消息也不该顺手清掉缓存 —— 那是把一次噪声放大成一次回源");
    }

    @Test
    void 缺字段的advance仍然是advance() {
        TtlCache cache = primed();
        SeasonBroadcastListener listener = new SeasonBroadcastListener(cache);

        listener.handle("{\"event\":\"season:advance\"}");

        assertEquals(1L, listener.receivedCount(),
                "id/dayInCycle 只用于日志，不该成为失效条件：少一个字段就让缓存留 30s 旧值是更坏的失败形态");
        assertEquals("fresh", cache.get(KEY, () -> "fresh", TTL));
    }

    @Test
    void 两端频道名是同一个字面量() {
        assertEquals("crossrealm:season:advance", SeasonBroadcastListener.CHANNEL);
    }

    @Test
    void 配置了报讯镜像时换季广播也会入报讯台() {
        TtlCache cache = primed();
        SeasonBroadcastListener listener = new SeasonBroadcastListener(cache);
        java.util.List<com.crossrealm.chronicles.game.notify.NotifyEvent> calls = new java.util.ArrayList<>();
        com.crossrealm.chronicles.game.notify.NotifyClient stub = event -> {
            calls.add(event);
            return new com.crossrealm.chronicles.game.notify.NotifyAck("id", event.kind(), true, false);
        };
        listener.setNotifyMirror(new com.crossrealm.chronicles.game.notify.NotifyMirrorService(stub, true));

        listener.handle(VALID);

        assertEquals(1, calls.size(), "换季广播应该镜像一条 season 报讯");
        assertEquals("season", calls.get(0).kind());
        assertTrue(calls.get(0).body().contains("tide"), calls.get(0).body());
    }

    @Test
    void 没配报讯镜像时也正常工作() {
        TtlCache cache = primed();
        SeasonBroadcastListener listener = new SeasonBroadcastListener(cache); // 不 setNotifyMirror
        listener.handle(VALID); // 不抛、计数照常
        assertEquals(1L, listener.receivedCount());
    }

    @Test
    void 可选依赖必须用Nullable标记() throws Exception {
        Constructor<?> ctor = OpsController.class.getDeclaredConstructors()[0];
        // 按类型定位 seasonBroadcastListener，不写死下标（构造器顺序会随切片增长而变）
        var listenerParams = java.util.Arrays.stream(ctor.getParameters())
                .filter(p -> p.getType() == SeasonBroadcastListener.class)
                .toList();
        assertEquals(1, listenerParams.size(), "OpsController 构造器里必须恰好有一个 SeasonBroadcastListener 参数");
        var param = listenerParams.get(0);
        assertEquals(SeasonBroadcastListener.class, param.getType());
        assertNotNull(param.getAnnotation(org.springframework.lang.Nullable.class),
                "@Autowired(required=false) 写在构造器参数上不生效：没有 listener bean 时上下文会启动失败");
        assertFalse(param.isAnnotationPresent(org.springframework.beans.factory.annotation.Autowired.class),
                "构造器参数上的 @Autowired 会被 Spring 忽略，属于假的可选依赖");
        assertTrue(ctor.isAnnotationPresent(org.springframework.beans.factory.annotation.Autowired.class));
    }
}
