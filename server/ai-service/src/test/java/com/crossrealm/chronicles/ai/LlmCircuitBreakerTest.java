package com.crossrealm.chronicles.ai;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** W-Y1：三态熔断。时钟注入，测试不真的等 15 秒。 */
class LlmCircuitBreakerTest {

    @Test
    void 连续失败到阈值才打开() {
        LlmCircuitBreaker b = new LlmCircuitBreaker(3, 100);
        assertTrue(b.allow());
        b.onFailure();
        assertEquals(LlmCircuitBreaker.State.CLOSED, b.state());
        assertTrue(b.allow());
        b.onFailure();
        assertTrue(b.allow());
        b.onFailure();
        assertEquals(LlmCircuitBreaker.State.OPEN, b.state());
        assertFalse(b.allow());
    }

    @Test
    void 冷却结束只放一个试探请求() {
        AtomicLong now = new AtomicLong(0);
        LlmCircuitBreaker b = new LlmCircuitBreaker(1, 100, now::get);
        b.onFailure();
        assertEquals(LlmCircuitBreaker.State.OPEN, b.state());
        assertFalse(b.allow(), "冷却没到就是快速失败");

        now.set(100);
        assertTrue(b.allow(), "冷却到了，放一个试探");
        assertFalse(b.allow(), "试探还在路上，其余请求不许一起涌向上游");
        assertEquals(LlmCircuitBreaker.State.HALF_OPEN, b.state());
    }

    @Test
    void 半开成功恢复半开失败重新打开() {
        AtomicLong now = new AtomicLong(0);
        LlmCircuitBreaker b = new LlmCircuitBreaker(1, 10, now::get);
        b.onFailure();
        now.set(10);
        assertTrue(b.allow());
        b.onSuccess();
        assertEquals(LlmCircuitBreaker.State.CLOSED, b.state());
        assertTrue(b.allow());

        // 再来一轮：半开的试探失败，必须回到 OPEN 且重新计时
        b.onFailure();
        assertEquals(LlmCircuitBreaker.State.OPEN, b.state());
        now.set(20);
        assertTrue(b.allow());
        b.onFailure();
        assertEquals(LlmCircuitBreaker.State.OPEN, b.state());
        assertFalse(b.allow());
    }

    @Test
    void 一次成功把连续失败计数清零() {
        LlmCircuitBreaker b = new LlmCircuitBreaker(2, 100);
        b.onFailure();
        b.onSuccess();
        b.onFailure();
        assertEquals(LlmCircuitBreaker.State.CLOSED, b.state(), "清零之后不该被上一次的旧账推到 OPEN");
    }
}
