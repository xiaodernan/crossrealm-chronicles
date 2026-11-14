package com.crossrealm.chronicles.notify;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Redis 台账 —— {@code spring.cache.type=redis} 时启用，与 season-service 同一约定。
 *
 * <p>两个键，都是「最近 N 条 + 计数」的典型双写，不上数据库：
 * <ul>
 *   <li>{@value #RECENT_KEY} —— List，LPUSH 新报讯 + LTRIM 50（环形台账）；</li>
 *   <li>{@value #STATS_KEY} —— Hash，HINCRBY 按 kind 计数（永久累计，含已环出的历史）。</li>
 * </ul>
 *
 * <p>两个键都带 7 天 TTL（首个建键者设置、未设置时补）。到期自动消失——
 * 报讯是「最近发生了什么」，不是账本，过期即销，不写淘汰脚本。
 *
 * <p>Redis 不可达 / 反序列化失败 → 抛 {@link IllegalStateException}，
 * 控制器翻译成 503（不伪装成功、不静默缺数据）。
 */
@Component
@ConditionalOnProperty(name = "spring.cache.type", havingValue = "redis")
public class RedisNotificationLedger implements NotificationLedger {

    static final String RECENT_KEY = "crossrealm:notify:recent";
    static final String STATS_KEY = "crossrealm:notify:stats";
    static final int CAPACITY = 50;
    static final Duration TTL = Duration.ofDays(7);

    public static final String CHANNEL = "crossrealm:notify:channel";

    private final StringRedisTemplate redis;
    private final ObjectMapper mapper = new ObjectMapper();

    public RedisNotificationLedger(StringRedisTemplate redis) {
        this.redis = redis;
    }

    @Override
    public void push(Notification notification) {
        final String json = toJson(notification);
        try {
            redis.opsForList().leftPush(RECENT_KEY, json);
            redis.opsForList().trim(RECENT_KEY, 0, CAPACITY - 1L);
            redis.opsForHash().increment(STATS_KEY, notification.kind(), 1);
            expireIfMissing(RECENT_KEY);
            expireIfMissing(STATS_KEY);
        } catch (RuntimeException e) {
            throw new IllegalStateException("redis ledger write failed", e);
        }
    }

    @Override
    public List<Notification> recent(int limit) {
        final List<String> raw;
        try {
            raw = redis.opsForList().range(RECENT_KEY, 0, limit - 1L);
        } catch (RuntimeException e) {
            throw new IllegalStateException("redis ledger read failed", e);
        }
        List<Notification> out = new ArrayList<>();
        if (raw == null) {
            return out;
        }
        for (String json : raw) {
            Notification n = fromJson(json);
            if (n != null) {
                out.add(n);
            }
        }
        return out;
    }

    @Override
    public Map<String, Long> countsByKind() {
        final Map<Object, Object> raw;
        try {
            raw = redis.opsForHash().entries(STATS_KEY);
        } catch (RuntimeException e) {
            throw new IllegalStateException("redis stats read failed", e);
        }
        Map<String, Long> out = new HashMap<>();
        for (Map.Entry<Object, Object> e : raw.entrySet()) {
            try {
                out.put(String.valueOf(e.getKey()), Long.parseLong(String.valueOf(e.getValue())));
            } catch (NumberFormatException ignored) {
                // 脏数据：跳过这一格不崩——计数是辅助信息，不值得让整个端点 500。
            }
        }
        return out;
    }

    @Override
    public int size() {
        try {
            Long len = redis.opsForList().size(RECENT_KEY);
            return len == null ? 0 : len.intValue();
        } catch (RuntimeException e) {
            throw new IllegalStateException("redis ledger size read failed", e);
        }
    }

    @Override
    public void clear() {
        try {
            redis.delete(RECENT_KEY);
            redis.delete(STATS_KEY);
        } catch (RuntimeException e) {
            throw new IllegalStateException("redis ledger clear failed", e);
        }
    }

    @Override
    public String backend() {
        return "redis";
    }

    private void expireIfMissing(String key) {
        Long ttl = redis.getExpire(key);
        if (ttl == null || ttl < 0) {
            redis.expire(key, TTL);
        }
    }

    private String toJson(Notification n) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", n.id());
        m.put("kind", n.kind());
        m.put("title", n.title());
        m.put("body", n.body());
        m.put("ts", n.ts());
        try {
            return mapper.writeValueAsString(m);
        } catch (Exception e) {
            throw new IllegalStateException("serialize notification failed", e);
        }
    }

    private Notification fromJson(String json) {
        try {
            JsonNode node = mapper.readTree(json);
            JsonNode id = node.get("id");
            JsonNode kind = node.get("kind");
            JsonNode title = node.get("title");
            JsonNode body = node.get("body");
            JsonNode ts = node.get("ts");
            if (id == null || kind == null || title == null || body == null || ts == null) {
                return null;
            }
            return new Notification(id.asText(), kind.asText(), title.asText(),
                    body.asText(), ts.asLong());
        } catch (Exception e) {
            return null; // 脏数据条目整条跳过，最近列表不因此整体不可用
        }
    }
}
