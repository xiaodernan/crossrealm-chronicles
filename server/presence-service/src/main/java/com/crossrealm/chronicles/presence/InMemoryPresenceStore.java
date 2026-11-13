package com.crossrealm.chronicles.presence;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 纯内存在场存储（默认后端，无 Redis 也健康、可契约测试）。
 *
 * 每个频道一个 ConcurrentHashMap<id, Wanderer>；新鲜度靠 ts 与 TTL 阈值过滤。
 * 没有后台扫表——过期游侠在 snapshot / memberCount 时被惰性清理（读取即自愈）。
 */
public class InMemoryPresenceStore implements PresenceStore {

    private final long ttlMillis;
    private final ConcurrentHashMap<String, ConcurrentHashMap<String, Wanderer>> channels =
            new ConcurrentHashMap<>();

    public InMemoryPresenceStore(long ttlMillis) {
        this.ttlMillis = ttlMillis;
    }

    public InMemoryPresenceStore() {
        this(15_000L);
    }

    private ConcurrentHashMap<String, Wanderer> lane(String channel) {
        return channels.computeIfAbsent(channel, k -> new ConcurrentHashMap<>());
    }

    @Override
    public void upsert(String channel, Wanderer w) {
        Wanderer stamped = new Wanderer(w.id(), w.name(), w.hue(), w.x(), w.z(), System.currentTimeMillis());
        lane(channel).put(w.id(), stamped);
    }

    @Override
    public Map<String, Wanderer> snapshot(String channel) {
        long cutoff = System.currentTimeMillis() - ttlMillis;
        LinkedHashMap<String, Wanderer> out = new LinkedHashMap<>();
        ConcurrentHashMap<String, Wanderer> lane = channels.get(channel);
        if (lane == null) return out;
        for (Map.Entry<String, Wanderer> e : lane.entrySet()) {
            if (e.getValue().ts() >= cutoff) {
                out.put(e.getKey(), e.getValue());
            } else {
                lane.remove(e.getKey());
            }
        }
        return out;
    }

    @Override
    public long memberCount(String channel) {
        long cutoff = System.currentTimeMillis() - ttlMillis;
        ConcurrentHashMap<String, Wanderer> lane = channels.get(channel);
        if (lane == null) return 0;
        long n = 0;
        for (Map.Entry<String, Wanderer> e : lane.entrySet()) {
            if (e.getValue().ts() >= cutoff) {
                n++;
            } else {
                lane.remove(e.getKey());
            }
        }
        return n;
    }

    /** 测试/运维用：清空全部频道。 */
    public void clearAll() {
        channels.clear();
    }

    /** 测试用：枚举某频道当前所有 id（含可能过期，未清理的）。 */
    public Set<String> rawIds(String channel) {
        ConcurrentHashMap<String, Wanderer> lane = channels.get(channel);
        return lane == null ? Set.of() : lane.keySet();
    }
}
