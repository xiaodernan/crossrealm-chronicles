package com.crossrealm.chronicles.ai;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 有界 TTL + LRU 的答案缓存。
 *
 * <p>为什么不用 Spring Cache：这一格只需要「按内容摘要取一段字符串」，
 * 而 Spring Cache 的键是 SpEL 表达式拼出来的 —— 拼错一个字符的表现是
 * 「所有玩家共享同一份答案」，那比没有缓存糟得多。摘要在 LlmClient 里算，
 * 这里只认一个已经算好的字符串。
 *
 * <p>内存纪律：{@code accessOrder=true} 的 LinkedHashMap，读命中即把键挪到尾部；
 * 满 {@code maxEntries} 时踢掉队首（最久没碰过的那个）。
 * 这是 O(1) 均摊，不引入后台线程、不引入淘汰定时器 —— 过期键只在写路径顺手清一次。
 */
public class ResponseCache {

    private record Entry(String value, long expiresAt) {}

    private final LinkedHashMap<String, Entry> store = new LinkedHashMap<>(16, 0.75f, true);
    private final int maxEntries;
    private final long ttlMillis;
    private long hits;
    private long misses;

    public ResponseCache(int maxEntries, long ttlMillis) {
        this.maxEntries = Math.max(1, maxEntries);
        this.ttlMillis = ttlMillis;
    }

    public synchronized String get(String key) {
        if (ttlMillis <= 0) { misses++; return null; }
        long now = System.currentTimeMillis();
        Entry entry = store.get(key);
        if (entry == null || entry.expiresAt() <= now) {
            if (entry != null) store.remove(key);
            misses++;
            return null;
        }
        hits++;
        return entry.value();
    }

    public synchronized void put(String key, String value) {
        if (ttlMillis <= 0) return;
        long now = System.currentTimeMillis();
        store.entrySet().removeIf(e -> e.getValue().expiresAt() <= now);
        while (store.size() >= maxEntries) {
            var it = store.entrySet().iterator();
            it.next();
            it.remove();
        }
        store.put(key, new Entry(value, now + ttlMillis));
    }

    public synchronized Map<String, Object> stats() {
        long now = System.currentTimeMillis();
        store.entrySet().removeIf(e -> e.getValue().expiresAt() <= now);
        return Map.of("hits", hits, "misses", misses, "entries", store.size());
    }
}
