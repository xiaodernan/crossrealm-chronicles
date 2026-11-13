package com.crossrealm.chronicles.presence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * 内存后端的行为钉子（默认后端、CI 可无 Redis 跑）：
 * 新鲜度口径（ts >= now - ttl）、过期惰性自愈、频道隔离、clearAll 测试钩子。
 */
class InMemoryPresenceStoreTest {

    @Test
    void upsert后snapshot能新鲜拿到并注入服务端时间戳() {
        InMemoryPresenceStore store = new InMemoryPresenceStore(15_000L);
        store.upsert("world", new Wanderer("crimson-gavel", "Crimson", 310, 0.5, -0.5, 0L));

        assertEquals(1, store.snapshot("world").size());
        Wanderer w = store.snapshot("world").get("crimson-gavel");
        assertTrue(w.ts() > 0, "服务端必须打 ts（不信任客户端时钟）");
        assertEquals("Crimson", w.name());
        assertEquals(310, w.hue());
    }

    @Test
    void 过期条目由读路径惰性清理() throws InterruptedException {
        InMemoryPresenceStore store = new InMemoryPresenceStore(1L);
        store.upsert("world", new Wanderer("ephemeral", "Gone", 10, 0, 0, 0L));

        Thread.sleep(20L);
        assertTrue(store.snapshot("world").isEmpty(), "新鲜度口径：过期的不能出现在快照里");
        assertEquals(0L, store.memberCount("world"));
    }

    @Test
    void memberCount只数新鲜条目且频道隔离() {
        InMemoryPresenceStore store = new InMemoryPresenceStore(15_000L);
        store.upsert("world", new Wanderer("a", "A", 1, 0, 0, 0L));
        store.upsert("world", new Wanderer("b", "B", 2, 0, 0, 0L));
        store.upsert("dungeon-1", new Wanderer("c", "C", 3, 0, 0, 0L));

        assertEquals(2L, store.memberCount("world"));
        assertEquals(1L, store.memberCount("dungeon-1"));
        assertEquals(0L, store.memberCount("nope"));
    }

    @Test
    void clearAll与rawIds钩子() {
        InMemoryPresenceStore store = new InMemoryPresenceStore();
        store.upsert("world", new Wanderer("x", "X", 90, 0, 0, 0L));
        assertEquals(1, store.rawIds("world").size());

        store.clearAll();
        assertTrue(store.rawIds("world").isEmpty());
        assertTrue(store.snapshot("world").isEmpty());
    }
}
