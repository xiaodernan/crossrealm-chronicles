package com.crossrealm.chronicles.presence;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * Redis 在场存储（docker 栈后端，W-Z-同游 的"消息队列 + 缓存"落脚点）。
 *
 * 选型：每位游侠一个带 TTL 的字符串键（值 = Wanderer JSON），频道成员用 Redis Set 列举。
 * - 键 TTL：心跳即续命，断线后自动离线——不用后台扫表，天然贴合"在线/离线"语义。
 * - Set：snapshot 时 SMEMBERS 拿 id 列表，再 MGET 各键；读到空键顺手 SREM 自愈。
 *
 * 与 InMemory 同一个新鲜度口径（ts ≥ now - ttl），保证两种后端行为一致、契约测试可复用。
 */
public class RedisPresenceStore implements PresenceStore {

    private final StringRedisTemplate redis;
    private final long ttlMillis;

    public RedisPresenceStore(StringRedisTemplate redis, long ttlMillis) {
        this.redis = redis;
        this.ttlMillis = ttlMillis;
    }

    private String wandererKey(String channel, String id) {
        return "presence:" + channel + ":" + id;
    }

    private String idsKey(String channel) {
        return "presence:" + channel + ":ids";
    }

    @Override
    public void upsert(String channel, Wanderer w) {
        Wanderer stamped = new Wanderer(w.id(), w.name(), w.hue(), w.x(), w.z(), System.currentTimeMillis());
        redis.opsForValue().set(wandererKey(channel, w.id()), stamped.toJson(), java.time.Duration.ofMillis(ttlMillis));
        redis.opsForSet().add(idsKey(channel), w.id());
        // 注意：广播交给 PresenceEventHub.publish（RedisPresenceEventHub 走 convertAndSend）。
        // 这里不重复 publish，避免一条心跳被发两次。
    }

    @Override
    public Map<String, Wanderer> snapshot(String channel) {
        long cutoff = System.currentTimeMillis() - ttlMillis;
        LinkedHashMap<String, Wanderer> out = new LinkedHashMap<>();
        Set<String> ids = redis.opsForSet().members(idsKey(channel));
        if (ids == null || ids.isEmpty()) return out;
        for (String id : ids) {
            String v = redis.opsForValue().get(wandererKey(channel, id));
            if (v == null) {
                redis.opsForSet().remove(idsKey(channel), id);
                continue;
            }
            try {
                Wanderer w = Wanderer.parse(v);
                if (w.ts() >= cutoff) out.put(id, w);
            } catch (RuntimeException ignore) {
                redis.opsForSet().remove(idsKey(channel), id);
            }
        }
        return out;
    }

    @Override
    public long memberCount(String channel) {
        Long n = redis.opsForSet().size(idsKey(channel));
        return n == null ? 0 : n;
    }
}
