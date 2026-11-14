package com.crossrealm.chronicles.game.idem;

import java.util.Optional;
import java.util.function.LongSupplier;

/**
 * 内存幂等台账（默认实现）：
 * <ul>
 *   <li><b>LRU 逐出</b>：`ConcurrentHashMap` + 链表挂尾，容量满时逐出最久未使用——
 *       榜单提交是低频写路径，O(1) 均摊足够。</li>
 *   <li><b>TTL 懒失效</b>：读时检查过期，删除并返回 miss——不建定时器线程（与 B39 定时器纪律同源）。</li>
 *   <li><b>线程安全</b>：`synchronized` 包住全部路径（容量小、访问频率低，热点不是瓶颈）。</li>
 * </ul>
 */
public class InMemoryIdempotencyStore implements IdempotencyStore {

    private final int maxEntries;
    private final long ttlMs;
    private final LongSupplier clock;

    /** 访问序链表：头=最久未用，尾=刚用过（与顶新思维一致） */
    private final java.util.LinkedHashMap<String, StoredResponse> map =
            new java.util.LinkedHashMap<>(16, 0.75f, true);

    public InMemoryIdempotencyStore(int maxEntries, int ttlSeconds) {
        this(maxEntries, ttlSeconds, System::currentTimeMillis);
    }

    /** 测试口：可注入时钟（过期不等真实时钟） */
    InMemoryIdempotencyStore(int maxEntries, int ttlSeconds, LongSupplier clock) {
        this.maxEntries = Math.max(1, maxEntries);
        this.ttlMs = Math.max(1L, ttlSeconds) * 1000L;
        this.clock = clock;
    }

    @Override
    public Optional<StoredResponse> find(String key, long nowMs) {
        synchronized (map) {
            StoredResponse hit = map.get(key);
            if (hit == null) {
                return Optional.empty();
            }
            if (hit.expired(nowMs)) {
                map.remove(key);
                return Optional.empty();
            }
            return Optional.of(hit);
        }
    }

    @Override
    public void save(String key, StoredResponse value) {
        synchronized (map) {
            // 写前清一遍过期的（容量压力下最先失效的优先腾位）
            if (map.size() >= maxEntries) {
                long now = clock.getAsLong();
                map.values().removeIf(v -> v.expired(now));
            }
            // 最旧的逐出——O(1)，这就是 LinkedHashMap(accessOrder=true) 的第一格
            while (map.size() >= maxEntries) {
                var it = map.keySet().iterator();
                if (!it.hasNext()) {
                    break;
                }
                it.next();
                it.remove();
            }
            map.put(key, value);
        }
    }

    /** 仅测试可见：容量（含过期但还没被清掉的） */
    int size() {
        synchronized (map) {
            return map.size();
        }
    }
}
