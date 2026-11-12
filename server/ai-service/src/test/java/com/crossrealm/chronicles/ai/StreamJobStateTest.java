package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * W-Z1：可靠投递状态机的纯逻辑单测（不碰 Redis、不碰线程）。
 *
 * <p>钉死两件事：① 瞬态失败该重试、耗尽才进死信；② DONE / DEAD 终态互斥。
 * 真正的 Redis I/O 由 {@code RedisStreamAdvisorQueueLiveTest} 在真实 Redis 上验证。
 */
class StreamJobStateTest {

    @Test
    void 瞬态失败按次数重试_耗尽进死信() {
        StreamJobState s = new StreamJobState(3);
        // 第 1、2 次失败都应"还能重投"（attempts 1、2 都 < 3）
        s.begin();
        assertFalse(s.fail("upstream-foo"), "attempts=1 不该进死信");
        assertEquals(StreamJobState.Status.RUNNING, s.status());

        s.begin();
        assertFalse(s.fail("upstream-bar"), "attempts=2 不该进死信");

        // 第 3 次（已达 maxAttempts）失败 → 死信
        s.begin();
        assertTrue(s.fail("upstream-baz"), "attempts=3 应进死信");
        assertEquals(StreamJobState.Status.DEAD, s.status());
        assertEquals("upstream-baz", s.reason());
        assertTrue(s.isTerminal());
    }

    @Test
    void 成功即终态_不再重试() {
        StreamJobState s = new StreamJobState(3);
        s.begin();
        s.succeed("PONG", false, 12L);
        assertEquals(StreamJobState.Status.DONE, s.status());
        assertEquals("PONG", s.answer());
        assertEquals(12L, s.latencyMs());
        assertTrue(s.isTerminal());
    }

    @Test
    void 跨实例重建attempts_从Redis状态Hash恢复后继续计数() {
        StreamJobState s = new StreamJobState(3);
        s.restoreAttempts(2);     // 另一个实例已经试过两次
        s.begin();                // → 3
        assertTrue(s.fail("upstream-x"), "从 2 恢复再 begin 到 3，应直接死信");
        assertEquals(3, s.attempts());
    }
}
