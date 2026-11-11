package com.crossrealm.chronicles.season;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.cache.concurrent.ConcurrentMapCache;

/**
 * ConcurrentMapCache with TTL + hit/miss/put/invalidation counters (W-S1).
 *
 * <p>解决两件事：
 * <ol>
 *   <li><b>默认分支的陈旧问题</b>：Boot 自带的 ConcurrentMapCacheManager 里缓存项<b>永不过期</b>——
 *   赛季切换后，跑着的实例会一直端出上一季（连 dayInCycle 都不动）。本实现让默认分支同样带 TTL
 *   （默认 300 秒，与 Redis 分支一致），过期项在下一次读取时惰性逐出并回源。</li>
 *   <li><b>命中率可上报</b>：Spring 的 Cache 抽象不给命中计数，而赛季服务的读路径全在 @Cacheable 上——
 *   没有计数就没法回答"这个 TTL 设得对不对"。</li>
 * </ol>
 *
 * <p>计数口径：{@link #lookup(Object)} 是 @Cacheable 读路径的汇聚点；每次查缓存计一次。
 * 过期项计 miss（不计 hit 也不计 invalidation——它只是自然老死）。
 */
public class CountingCache extends ConcurrentMapCache {

    private final long ttlNanos;
    private final AtomicLong hits = new AtomicLong();
    private final AtomicLong misses = new AtomicLong();
    private final AtomicLong puts = new AtomicLong();
    private final AtomicLong invalidations = new AtomicLong();
    /** key → 写入时的 nanoTime（与原生 Map 平行存放，避免侵入 ConcurrentMapCache 的存储结构） */
    private final ConcurrentHashMap<Object, Long> writtenAt = new ConcurrentHashMap<>();

    public CountingCache(String name, Duration ttl) {
        super(name);
        this.ttlNanos = ttl.toNanos();
    }

    @Override
    protected Object lookup(Object key) {
        Object value = super.lookup(key);
        if (value == null) {
            misses.incrementAndGet();
            return null;
        }
        Long at = writtenAt.get(key);
        if (at != null && System.nanoTime() - at > ttlNanos) {
            // 惰性逐出：过期项当场消失，由 @Cacheable 的 valueLoader 重新计算并回写
            super.evictIfPresent(key);
            writtenAt.remove(key);
            misses.incrementAndGet();
            return null;
        }
        hits.incrementAndGet();
        return value;
    }

    @Override
    public void put(Object key, Object value) {
        puts.incrementAndGet();
        super.put(key, value);
        writtenAt.put(key, System.nanoTime());
    }

    @Override
    public boolean evictIfPresent(Object key) {
        writtenAt.remove(key);
        if (super.evictIfPresent(key)) {
            invalidations.incrementAndGet();
            return true;
        }
        return false;
    }

    @Override
    public void clear() {
        invalidations.addAndGet(getNativeCache().size());
        writtenAt.clear();
        super.clear();
    }

    /** 快照（只读拷贝；给 /api/seasons/stats 与测试用） */
    public Map<String, Long> counters() {
        Map<String, Long> m = new LinkedHashMap<>();
        m.put("hits", hits.get());
        m.put("misses", misses.get());
        m.put("puts", puts.get());
        m.put("invalidations", invalidations.get());
        return m;
    }
}
