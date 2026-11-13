package com.crossrealm.chronicles.presence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * Wanderer 编解码契约。这是记录在场状态的唯一载体：字段名/数量/类型漂了，
 * Redis 存的每条心跳都会读坏、SSE 也会推出残缺帧。钉住这一条，Redis 与 memory 两条后端都共用它。
 */
class WandererTest {

    @Test
    void toJson与parse往返保持字段() {
        Wanderer w = new Wanderer("crimson-gavel", "Crimson", 310, 0.5, -0.25, 1_700_000_000_000L);
        String json = w.toJson();
        assertTrue(json.contains("\"id\":\"crimson-gavel\""), json);
        assertTrue(json.contains("\"hue\":310"), json);

        Wanderer back = Wanderer.parse(json);
        assertEquals(w.id(), back.id());
        assertEquals(w.name(), back.name());
        assertEquals(w.hue(), back.hue());
        assertEquals(w.x(), back.x(), 1e-9);
        assertEquals(w.z(), back.z(), 1e-9);
        assertEquals(w.ts(), back.ts());
    }

    @Test
    void parse缺id或name抛异常() {
        assertThrows(IllegalArgumentException.class, () -> Wanderer.parse("{\"name\":\"n\"}"));
        assertThrows(IllegalArgumentException.class, () -> Wanderer.parse("{\"id\":\"x\"}"));
        assertThrows(IllegalArgumentException.class, () -> Wanderer.parse("not json"));
    }

    @Test
    void parse容忍缺省数字字段() {
        Wanderer w = Wanderer.parse("{\"id\":\"x\",\"name\":\"n\"}");
        assertEquals(0, w.hue());
        assertEquals(0.0, w.x(), 1e-9);
        assertEquals(0.0, w.z(), 1e-9);
        assertEquals(0L, w.ts());
    }

    @Test
    void parse容忍数值以字符串形式出现() {
        Wanderer w = Wanderer.parse("{\"id\":\"x\",\"name\":\"n\",\"hue\":\"200\",\"x\":\"0.5\",\"z\":-1,\"ts\":123}");
        assertEquals(200, w.hue());
        assertEquals(0.5, w.x(), 1e-9);
        assertEquals(-1.0, w.z(), 1e-9);
        assertEquals(123L, w.ts());
    }
}
