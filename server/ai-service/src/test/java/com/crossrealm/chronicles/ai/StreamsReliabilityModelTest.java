package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * W-Z1：跨实例可靠投递的契约测试（走内存 faithful 模型，不依赖真实 Redis）。
 *
 * <p>这一份钉的是 Redis Streams 相对 W-Y4 进程内队列<b>新增的那一档保证</b>：
 * 消费者崩溃（claim 了但没 ack）之后，任务由另一个消费者按 idle 重投，且重试次数跨实例累计。
 */
class StreamsReliabilityModelTest {

    @Test
    void 新条目只被一个消费者认领_另一个拿不到() {
        StreamsReliabilityModel m = new StreamsReliabilityModel(3, 64);
        var r = m.submit("hello", null);
        assertNotNull(m.claimNew("A", 1000));
        assertNull(m.claimNew("B", 1001), "新条目已被 A 认领，B 不该再拿到同一条");
    }

    @Test
    void 消费者崩溃未ack_另一消费者按idle重投同一条() {
        StreamsReliabilityModel m = new StreamsReliabilityModel(3, 64);
        var r = m.submit("hello", null);
        // A 认领（模拟崩溃：不 ack）
        var j = m.claimNew("A", 1000);
        assertEquals(1, j.attempts);
        // 未到 idle 阈值，B 捞不到
        assertNull(m.claimIdle("B", 1500, 1000));
        // 超过 idle，B 通过 XAUTOCLAIM 等价逻辑重投同一 jobId
        var reclaimed = m.claimIdle("B", 2500, 1000);
        assertNotNull(reclaimed, "崩溃的任务应在 idle 后被重投");
        assertEquals(j.id, reclaimed.id, "重投的必须是同一条，不是新开一条");
        assertEquals(2, reclaimed.attempts, "重投要累计 attempts（跨实例语义）");
    }

    @Test
    void 重投两次仍失败_进死信且不再重投() {
        StreamsReliabilityModel m = new StreamsReliabilityModel(3, 64);
        var r = m.submit("hello", null);
        m.claimNew("A", 1000);
        assertFalse(m.fail(r.jobId(), "upstream-x"), "attempts=1 不该死信");
        m.claimIdle("B", 2000, 1000);                 // 重投 → attempts=2
        assertFalse(m.fail(r.jobId(), "upstream-y"), "attempts=2 不该死信");
        m.claimIdle("C", 3000, 1000);                 // 重投 → attempts=3
        assertTrue(m.fail(r.jobId(), "upstream-z"), "attempts=3 应死信");
        assertTrue(m.deadLetters().contains(r.jobId()));
        // 死信后即便再 idle 也不再被认领
        assertNull(m.claimIdle("D", 5000, 1000), "死信任务不应再被重投");
    }

    @Test
    void 正常ack后终态DONE_且幂等键去重() {
        StreamsReliabilityModel m = new StreamsReliabilityModel(3, 64);
        var a = m.submit("q", "req-1");
        var b = m.submit("q", "req-1");   // 同 requestId
        assertTrue(b.duplicate());
        assertEquals(a.jobId(), b.jobId(), "重复幂等键返回同一个 jobId");
        var j = m.claimNew("A", 1000);
        m.answer(j.id, "PONG");
        m.ack(j.id);
        assertEquals("DONE", m.view(j.id).orElseThrow().get("status"));
    }

    @Test
    void 容量满明确拒绝_不静默丢() {
        StreamsReliabilityModel m = new StreamsReliabilityModel(3, 2);
        m.submit("a", null);
        m.submit("b", null);
        var c = m.submit("c", null);
        assertFalse(c.accepted(), "队列满应明确拒绝，而非静默接受");
        assertEquals("queue-full", c.reason());
    }
}
