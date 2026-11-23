package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.locks.LockSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

/**
 * Redis 跨实例合流：租约只防止并发重复领队，终态发布受 owner 栅栏保护。
 * 租期覆盖单次请求全部重试与退避；崩溃后到期接管，旧 owner 不能覆盖新结果。
 */
class RedisLlmFlightCoordinator implements LlmFlightCoordinator {

    private static final Logger LOG = LoggerFactory.getLogger(RedisLlmFlightCoordinator.class);
    private static final String PREFIX = "ai:llm:flight:v1:";
    private static final int VERSION = 1;

    private static final RedisScript<Long> CLAIM = RedisScript.of("""
            if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
            redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
            return 1
            """, Long.class);

    private static final RedisScript<Long> PUBLISH = RedisScript.of("""
            local raw = redis.call('GET', KEYS[1])
            if not raw then return 0 end
            local current = cjson.decode(raw)
            if current.owner ~= ARGV[1] then return 0 end
            redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
            return 1
            """, Long.class);

    private static final RedisScript<Long> RELEASE = RedisScript.of("""
            local raw = redis.call('GET', KEYS[1])
            if not raw then return 0 end
            local current = cjson.decode(raw)
            if current.owner ~= ARGV[1] then return 0 end
            redis.call('DEL', KEYS[1])
            return 1
            """, Long.class);

    private final StringRedisTemplate redis;
    private final ObjectMapper mapper;
    private final long pollMs;
    private final long terminalTtlMs;

    RedisLlmFlightCoordinator(StringRedisTemplate redis, ObjectMapper mapper, LlmFlightProperties props) {
        this.redis = redis;
        this.mapper = mapper;
        this.pollMs = Math.max(1L, props.getPollMs());
        this.terminalTtlMs = Math.max(1L, props.getTerminalTtlMs());
    }

    private record FlightRecord(int version, String state, String owner, String answer,
                                boolean upstreamCached, String failureReason) {}

    private static String key(String digest) {
        return PREFIX + digest;
    }

    @Override
    public Optional<Claim> claim(String digest, long leaseMs) {
        String owner = UUID.randomUUID().toString();
        String json = write(new FlightRecord(VERSION, "RUNNING", owner, null, false, null));
        Long claimed = redis.execute(CLAIM, List.of(key(digest)), List.of(json, Long.toString(leaseMs)));
        return claimed != null && claimed == 1L
                ? Optional.of(new Claim(digest, owner, leaseMs)) : Optional.empty();
    }

    @Override
    public Result await(String digest, long deadlineMs) throws InterruptedException {
        while (true) {
            String raw = redis.opsForValue().get(key(digest));
            Result result = decode(raw);
            if (result != null) return result;
            if (raw != null || System.currentTimeMillis() >= deadlineMs) return null;
            LockSupport.parkNanos(Duration.ofMillis(pollMs).toNanos());
            if (Thread.interrupted()) throw new InterruptedException();
        }
    }

    @Override
    public boolean complete(Claim claim, LlmClient.Answer answer) {
        return publish(claim, new FlightRecord(VERSION, "DONE", claim.owner(), answer.answer(),
                answer.upstreamCached(), null));
    }

    @Override
    public boolean fail(Claim claim, String reason) {
        return publish(claim, new FlightRecord(VERSION, "FAILED", claim.owner(), null, false, reason));
    }

    private boolean publish(Claim claim, FlightRecord record) {
        Long written = redis.execute(PUBLISH, List.of(key(claim.digest())),
                List.of(claim.owner(), write(record), Long.toString(terminalTtlMs)));
        return written != null && written == 1L;
    }

    @Override
    public boolean release(Claim claim) {
        Long released = redis.execute(RELEASE, List.of(key(claim.digest())), List.of(claim.owner()));
        return released != null && released == 1L;
    }

    private Result decode(String raw) {
        if (raw == null) return null;
        try {
            FlightRecord record = mapper.readValue(raw, FlightRecord.class);
            if (record == null || record.version() != VERSION) return null;
            if ("DONE".equals(record.state()) && record.answer() != null && !record.answer().isBlank()) {
                return new Result(record.answer(), record.upstreamCached(), null);
            }
            if ("FAILED".equals(record.state()) && record.failureReason() != null
                    && !record.failureReason().isBlank()) {
                return new Result(null, false, record.failureReason());
            }
        } catch (JsonProcessingException | IllegalArgumentException e) {
            LOG.warn("ai.flight.invalid-terminal digest-key ignored");
        }
        return null;
    }

    private String write(FlightRecord record) {
        try {
            return mapper.writeValueAsString(record);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("cannot serialize LLM flight", e);
        }
    }

    @Override
    public Map<String, Object> health() {
        return Map.of("backend", "redis", "pollMs", pollMs, "terminalTtlMs", terminalTtlMs);
    }
}
