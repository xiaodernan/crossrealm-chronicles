package com.crossrealm.chronicles.game.idem;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** W-Z65：内存幂等台账 —— TTL 与 LRU 两条硬契约，直接钉死。 */
class InMemoryIdempotencyStoreTest {

    @Test
    @DisplayName("存取回环：fingerprint / status / body 原样返回")
    void roundTrip() {
        InMemoryIdempotencyStore store = new InMemoryIdempotencyStore(8, 600);
        StoredResponse row = new StoredResponse("fp1", 201, "{\"accepted\":true}", 1000L, 600_000L);
        store.save("k1", row);
        Optional<StoredResponse> hit = store.find("k1", 1001L);
        assertTrue(hit.isPresent());
        assertEquals("fp1", hit.get().fingerprint());
        assertEquals(201, hit.get().status());
        assertEquals("{\"accepted\":true}", hit.get().body());
    }

    @Test
    @DisplayName("TTL 过期后按未命中处理（且条目被清除，不留尸）")
    void expiredPruned() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        InMemoryIdempotencyStore store = new InMemoryIdempotencyStore(8, 1, clock::get);
        store.save("k1", new StoredResponse("fp", 201, "b", clock.get(), 1000L)); // ttl=1s
        Optional<StoredResponse> early = store.find("k1", clock.get());
        assertTrue(early.isPresent());
        // 前进 1 秒 + 1 毫秒
        clock.addAndGet(1001L);
        Optional<StoredResponse> late = store.find("k1", clock.get());
        assertTrue(late.isEmpty(), "过期行必须按未命中处理");
        assertEquals(0, store.size(), "过期行必须从台账里清掉，不腾位给 LRU 误判");
    }

    @Test
    @DisplayName("容量满 → 逐出最久未用的一条（存到第 N+1 条时第 1 条被挤走）")
    void lruEviction() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        InMemoryIdempotencyStore store = new InMemoryIdempotencyStore(2, 600, clock::get);
        long now = clock.get();
        store.save("k1", new StoredResponse("a", 201, "1", now, 600_000L));
        store.save("k2", new StoredResponse("b", 201, "2", now, 600_000L));
        // 读一下 k1（它现在是"刚用过"），再写入 k3 → k2（最久未用）应当被逐出
        store.find("k1", now);
        store.save("k3", new StoredResponse("c", 201, "3", now, 600_000L));
        assertTrue(store.find("k1", now).isPresent(), "k1 被刚刚读过，不该被逐出");
        assertTrue(store.find("k3", now).isPresent());
        assertTrue(store.find("k2", now).isEmpty(), "LRU 应当逐出 k2 而不是 k1");
    }

    @Test
    @DisplayName("同 key 覆盖写：fingerprint 可更新（同 key 不同 payload 的 409 判定依赖此行为）")
    void overwriteRefreshes() {
        InMemoryIdempotencyStore store = new InMemoryIdempotencyStore(8, 600);
        store.save("k1", new StoredResponse("fp-old", 201, "a", 1000L, 600_000L));
        store.save("k1", new StoredResponse("fp-new", 201, "b", 1001L, 600_000L));
        assertEquals("fp-new", store.find("k1", 1002L).orElseThrow().fingerprint());
    }
}
