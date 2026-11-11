package com.crossrealm.chronicles.game.cache;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;

/**
 * 有界 TTL 缓存 —— 唯一入口的 load-through 缓存（W-P4）。
 *
 * <p>几个刻意不叫泛型 "CacheManager" 的原因：
 * <ul>
 *   <li>泛型入口收窄成 {@code String → T}，没有"按键存整个 map"的 API——
 *       缓存最大的事故形态不是慢，是人手写出"每次 put 都全清一遍"这种无上限行为；</li>
 *   <li>不用 Caffeine/Guava 的本地依赖（依赖太少门槛太低，没有就不要借）；</li>
 *   <li>写 {@code get(key, loader, ttl)} 一个签名就足够，迭代器、弱引用、soft 全部可以以后再加。</li>
 * </ul>
 *
 * <p>内存纪律：
 * <ul>
 *   <li>请求进来先清过期键（O(n) 而且只跑在写路径）；</li>
 *   <li>键数满 128 时丢最久没碰过的一个（LinkedHashMap accessOrder 自动收）。</li>
 * </ul>
 */
public class TtlCache {

    private static final int MAX_ENTRIES = 128;

    /** entry = (value, expiresAtMillis) */
    private final LinkedHashMap<String, Object[]> store = new LinkedHashMap<>(16, 0.75f, true);
    private long hits;
    private long misses;

    /**
     * 取 key；若 miss 或过期，用 loader 算一次并塞进去。
     * loader 抛异常时<b>不存</b>、且把异常抛回给调用方 —— 缓存不该吞故障信号。
     */
    public <T> T get(String key, Supplier<T> loader, Duration ttl) {
        long now = System.currentTimeMillis();
        Object[] entry;
        synchronized (this) {
            entry = store.get(key);
            if (entry != null && (Long) entry[1] > now) {
                hits++;
                @SuppressWarnings("unchecked")
                T hit = (T) entry[0];
                // LRU 移序由 accessOrder 自动做
                return hit;
            }
            // 过期的，或者 miss —— 下掉、算
            store.remove(key);
            misses++;
        }
        T value = loader.get();
        if (ttl.isNegative() || ttl.isZero()) {
            return value;   // ttl=0 语义 = 不缓存（主要给测试用来显式关掉）
        }
        synchronized (this) {
            purgeExpired(now);
            if (store.size() >= MAX_ENTRIES) {
                // 超限了：踢出 "most recently evicted" —
                // accessOrder 的第一个键就是最久未用
                var it = store.entrySet().iterator();
                it.next();
                it.remove();
            }
            store.put(key, new Object[]{ value, now + ttl.toMillis() });
        }
        return value;
    }

    private void purgeExpired(long now) {
        store.entrySet().removeIf(e -> (Long) e.getValue()[1] <= now);
    }

    /** 清空对应 key（比如观测到主动 flush 的时候）。主要给测试与联调用。 */
    public void invalidate(String key) {
        synchronized (this) {
            store.remove(key);
        }
    }

    /** 快照：命中 / 未命中 / 当前占了多少键。只出不进，不放入可变引用。 */
    public Map<String, Object> stats() {
        synchronized (this) {
            purgeExpired(System.currentTimeMillis());
            return Map.of("hits", hits, "misses", misses, "entries", store.size());
        }
    }

    /** 测试/调试：总请求数（hits + misses）；方便断言 cache 确实命中。 */
    public long requests() {
        synchronized (this) {
            return hits + misses;
        }
    }
}
