package com.crossrealm.chronicles.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** W-Y1：缓存的三种边界 —— 过期、容量、禁用。 */
class ResponseCacheTest {

    @Test
    void TTL内命中过期后失效() throws Exception {
        ResponseCache cache = new ResponseCache(4, 40);
        cache.put("a", "答案");
        assertEquals("答案", cache.get("a"));
        Thread.sleep(55);
        assertNull(cache.get("a"));
    }

    @Test
    void 满容量踢掉最久没碰过的那个() {
        ResponseCache cache = new ResponseCache(2, 60_000);
        cache.put("a", "甲");
        cache.put("b", "乙");
        assertEquals("甲", cache.get("a"), "读一次把 a 挪到最近使用");
        cache.put("c", "丙");

        assertNull(cache.get("b"), "b 是最久没碰过的，该被踢");
        assertEquals("甲", cache.get("a"));
        assertEquals("丙", cache.get("c"));
    }

    @Test
    void TTL非正数等于关掉缓存() {
        ResponseCache cache = new ResponseCache(4, 0);
        cache.put("a", "甲");
        assertNull(cache.get("a"));
        assertEquals(0, cache.stats().get("entries"), "禁用缓存时 put 也必须是 no-op，不能白占内存");
    }

    @Test
    void 命中未命中与条目数进健康快照() {
        ResponseCache cache = new ResponseCache(4, 60_000);
        cache.get("miss");
        cache.put("a", "甲");
        cache.get("a");

        assertEquals(1L, cache.stats().get("hits"));
        assertEquals(1L, cache.stats().get("misses"));
        assertEquals(1, cache.stats().get("entries"));
    }
}
