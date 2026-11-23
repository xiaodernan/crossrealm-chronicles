package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

class RedisLlmFlightCoordinatorTest {

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final RedisLlmFlightCoordinator coordinator = new RedisLlmFlightCoordinator(
            redis, new ObjectMapper(), props());

    private static LlmFlightProperties props() {
        LlmFlightProperties props = new LlmFlightProperties();
        props.setPollMs(1);
        props.setTerminalTtlMs(2_000);
        return props;
    }

    @Test
    @SuppressWarnings({"rawtypes", "unchecked"})
    void 原子领取成功时只返回带租约的所有者() {
        when(redis.execute(any(RedisScript.class), anyList(), anyList())).thenReturn(1L);
        Optional<LlmFlightCoordinator.Claim> claim = coordinator.claim("digest-only", 7_000);
        assertTrue(claim.isPresent());
        assertEquals("digest-only", claim.get().digest());
        assertEquals(7_000, claim.get().leaseMs());
        verify(redis).execute(any(RedisScript.class), anyList(), anyList());
    }

    @Test
    @SuppressWarnings({"rawtypes", "unchecked"})
    void 已存在领队时领取为空且不覆盖() {
        when(redis.execute(any(RedisScript.class), anyList(), anyList())).thenReturn(0L);
        assertTrue(coordinator.claim("digest-only", 7_000).isEmpty());
    }

    @Test
    void 只接受完整且版本正确的成功终态() throws Exception {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get(anyString())).thenReturn("""
                {"version":1,"state":"DONE","owner":"owner","answer":"complete",
                 "upstreamCached":true,"failureReason":null}
                """);
        LlmFlightCoordinator.Result result = coordinator.await("digest", System.currentTimeMillis() + 100);
        assertEquals("complete", result.answer());
        assertTrue(result.upstreamCached());
        assertNull(result.failureReason());
    }

    @Test
    void 失败终态带回稳定原因() throws Exception {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get(anyString())).thenReturn("""
                {"version":1,"state":"FAILED","owner":"owner","answer":null,
                 "upstreamCached":false,"failureReason":"upstream-503"}
                """);
        LlmFlightCoordinator.Result result = coordinator.await("digest", System.currentTimeMillis() + 100);
        assertNull(result.answer());
        assertEquals("upstream-503", result.failureReason());
    }

    @Test
    void 运行中畸形或错误版本记录都不当作答案() throws Exception {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get(anyString())).thenReturn("not-json", "{\"version\":2,\"state\":\"DONE\",\"answer\":\"old\"}");
        assertNull(coordinator.await("digest", System.currentTimeMillis() + 100));
        assertNull(coordinator.await("digest", System.currentTimeMillis() + 100));
    }

    @Test
    @SuppressWarnings({"rawtypes", "unchecked"})
    void 旧所有者发布被栅栏拒绝() {
        when(redis.execute(any(RedisScript.class), anyList(), anyList())).thenReturn(0L);
        LlmFlightCoordinator.Claim stale = new LlmFlightCoordinator.Claim("digest", "old-owner", 1_000);
        assertFalse(coordinator.complete(stale, new LlmClient.Answer("late", "gpt-test", false, false, 1)));
        assertFalse(coordinator.fail(stale, "late-failure"));
        assertFalse(coordinator.release(stale));
    }

    @Test
    void 健康快照只暴露后端和轮询旋钮() {
        assertEquals("redis", coordinator.health().get("backend"));
        assertEquals(1L, coordinator.health().get("pollMs"));
        assertEquals(2_000L, coordinator.health().get("terminalTtlMs"));
        assertFalse(coordinator.health().toString().contains("digest"));
    }
}
