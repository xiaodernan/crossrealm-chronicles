package com.crossrealm.chronicles.game.idem;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Redis 幂等台账（`game-service.idempotency.backend=redis` 时装配）。
 *
 * <p>键 `crossrealm:idem:{key}` → JSON {fingerprint, status, body}，PX=ttl-seconds。
 * 所有异常一律吞掉返回 miss（fail-open）——台账挂了不挡业务；镜像真值是业务自己的主表。
 */
@Component
@ConditionalOnProperty(prefix = "game-service.idempotency", name = "backend", havingValue = "redis")
public class RedisIdempotencyStore implements IdempotencyStore {

    private static final Logger LOG = LoggerFactory.getLogger(RedisIdempotencyStore.class);
    private static final String PREFIX = "crossrealm:idem:";

    private final StringRedisTemplate redis;
    private final ObjectMapper mapper = new ObjectMapper();

    @Autowired
    public RedisIdempotencyStore(StringRedisTemplate redis) {
        this.redis = redis;
    }

    @Override
    public Optional<StoredResponse> find(String key, long nowMs) {
        try {
            String raw = redis.opsForValue().get(PREFIX + key);
            if (raw == null) {
                return Optional.empty();
            }
            JsonNode node = mapper.readTree(raw);
            String fingerprint = node.path("fingerprint").asText(null);
            int status = node.path("status").asInt(0);
            String body = node.path("body").asText(null);
            long expiresAtMs = node.path("expiresAtMs").asLong(0);
            if (fingerprint == null || body == null || status == 0) {
                return Optional.empty(); // 脏数据 = 没存过
            }
            if (nowMs >= expiresAtMs) {
                try {
                    redis.delete(PREFIX + key);
                } catch (RuntimeException ignored) {
                    // 删除失败无所谓——过期键不会再被读到
                }
                return Optional.empty();
            }
            return Optional.of(new StoredResponse(fingerprint, status, body, expiresAtMs));
        } catch (com.fasterxml.jackson.core.JsonProcessingException | RuntimeException e) {
            LOG.warn("idempotency redis lookup failed (fail-open): {}", e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    @Override
    public void save(String key, StoredResponse value) {
        try {
            ObjectNode node = mapper.createObjectNode();
            node.put("fingerprint", value.fingerprint());
            node.put("status", value.status());
            node.put("body", value.body());
            node.put("expiresAtMs", value.expiresAtMs());
            String payload = mapper.writeValueAsString(node);
            long ttl = Math.max(1L, value.expiresAtMs() - System.currentTimeMillis());
            redis.opsForValue().set(PREFIX + key, payload, ttl, TimeUnit.MILLISECONDS);
        } catch (com.fasterxml.jackson.core.JsonProcessingException | RuntimeException e) {
            LOG.warn("idempotency redis save failed (fail-open): {}", e.getClass().getSimpleName());
        }
    }
}
