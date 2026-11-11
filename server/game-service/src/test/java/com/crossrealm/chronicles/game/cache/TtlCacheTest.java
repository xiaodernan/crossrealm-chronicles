package com.crossrealm.chronicles.game.cache;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * W-P4 有界 TTL 缓存的核心语义：loader 的红绿、命中未命中的账目、异常不进缓存、
 * ttl=0 语义（关掉缓存）、invalidate 钩。
 */
class TtlCacheTest {

    @Test
    void missThenHitReturnsSameValue() {
        TtlCache cache = new TtlCache();
        AtomicInteger loaderCalls = new AtomicInteger();

        String v1 = cache.get("k", () -> { loaderCalls.incrementAndGet(); return "v"; }, Duration.ofMinutes(1));
        String v2 = cache.get("k", () -> { loaderCalls.incrementAndGet(); return "other"; }, Duration.ofMinutes(1));

        assertEquals("v", v1);
        assertEquals("v", v2);
        assertEquals(1, loaderCalls.get(), "命中不重算");
    }

    @Test
    void statsAreCountedExactly() {
        TtlCache cache = new TtlCache();
        cache.get("a", () -> "a", Duration.ofMinutes(1));   // miss
        cache.get("a", () -> "a", Duration.ofMinutes(1));   // hit
        cache.get("a", () -> "a", Duration.ofMinutes(1));   // hit
        cache.get("b", () -> "b", Duration.ofMinutes(1));   // miss

        Map<String, Object> s = cache.stats();
        assertEquals(2L, ((Number) s.get("hits")).longValue());
        assertEquals(2L, ((Number) s.get("misses")).longValue());
        assertEquals(2, ((Number) s.get("entries")).intValue());
    }

    @Test
    void loaderThrowingExceptionsDoesNotStoreAndRecounts() {
        TtlCache cache = new TtlCache();
        AtomicInteger calls = new AtomicInteger();
        Supplier<String> explode = () -> { calls.incrementAndGet(); throw new IllegalStateException("boom"); };

        assertThrows(IllegalStateException.class, () -> cache.get("k", explode, Duration.ofMinutes(1)));
        assertThrows(IllegalStateException.class, () -> cache.get("k", explode, Duration.ofMinutes(1)));

        assertEquals(2, calls.get(), "异常不缓存：每次都重新走 loader");
        assertEquals(2L, ((Number) cache.stats().get("misses")).longValue());
        assertEquals(0, ((Number) cache.stats().get("entries")).intValue());
    }

    @Test
    void invalidateDropsEntry() {
        TtlCache cache = new TtlCache();
        cache.get("k", () -> "v", Duration.ofMinutes(1));
        cache.invalidate("k");
        assertEquals(0, ((Number) cache.stats().get("entries")).intValue());
    }

    @Test
    void zeroTtlDisablesCaching() {
        TtlCache cache = new TtlCache();
        AtomicInteger calls = new AtomicInteger();
        Supplier<String> loader = () -> { calls.incrementAndGet(); return "v"; };
        cache.get("k", loader, Duration.ZERO);
        cache.get("k", loader, Duration.ZERO);
        cache.get("k", loader, Duration.ZERO);
        assertEquals(3, calls.get());
    }
}
