package com.crossrealm.chronicles.ai;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-Y4：可靠任务队列的**行为**契约。
 *
 * <p>全部用 workers=0 + 包内构造器 + no-op Sleeper + 手动 {@code drainOne()}：
 * 没有守护线程抢活、没有真的退避等待，红绿完全确定。
 * 唯一例外是末尾的多消费者用例，它验证的正是真实线程下的「每格恰好一次」。
 */
class AdvisorJobQueueTest {

    private static AdvisorJobProperties props(int capacity) {
        AdvisorJobProperties p = new AdvisorJobProperties();
        p.setCapacity(capacity);
        p.setWorkers(0);
        p.setMaxAttempts(3);
        p.setRetryBaseMs(1);
        p.setPollAfterMs(250);
        p.setMaxTracked(50);
        return p;
    }

    private static AdvisorJobQueue queue(AdvisorJobProperties p, AdvisorJobQueue.Handler handler) {
        return new AdvisorJobQueue(p, handler, ms -> {});
    }

    private static LlmClient.Answer answer(String text) {
        return new LlmClient.Answer(text, "gpt-6-sol", false, false, 12L);
    }

    @Test
    @DisplayName("背压：队列满当场拒绝，不静默丢、不阻塞，且拒绝登记被完整回滚")
    void backpressureRejectsExplicitly() {
        AdvisorJobQueue q = queue(props(1), (question, ctx) -> answer("ok"));
        AdvisorJobQueue.SubmitResult first = q.submit("一", Map.of(), null);
        AdvisorJobQueue.SubmitResult second = q.submit("二", Map.of(), null);

        assertTrue(first.accepted());
        assertFalse(first.duplicate());
        assertFalse(second.accepted());
        assertEquals("queue-full", second.reason());
        Map<String, Object> stats = q.stats();
        assertEquals(1L, stats.get("enqueued"));
        assertEquals(1L, stats.get("rejected"));
        assertEquals(1L, stats.get("depth"));
        assertEquals(1L, stats.get("tracked"), "被拒任务不该留在 jobs 里");
    }

    @Test
    @DisplayName("幂等：同一 requestId 返回同一个 jobId，不会连问上游两次")
    void requestIdDeduplicates() {
        AtomicInteger calls = new AtomicInteger();
        AdvisorJobQueue q = queue(props(4), (question, ctx) -> {
            calls.incrementAndGet();
            return answer("ok");
        });
        AdvisorJobQueue.SubmitResult a = q.submit("一", Map.of(), "req-42");
        AdvisorJobQueue.SubmitResult b = q.submit("一", Map.of(), "req-42");

        assertEquals(a.jobId(), b.jobId());
        assertTrue(b.duplicate());
        assertEquals(1L, q.stats().get("dedupHits"));
        assertEquals(1L, q.stats().get("enqueued"));
        q.drainOne();
        assertEquals(1, calls.get(), "重复提交只能触发一次上游调用");
    }

    @Test
    @DisplayName("成功视图：answer/model/cached/latencyMs 四段齐全，且不回显玩家输入")
    void doneViewCarriesAnswerOnly() {
        AdvisorJobQueue q = queue(props(2), (question, ctx) -> answer("往有灯的地方走"));
        String id = q.submit("该往哪走？", Map.of("zone", "hub"), null).jobId();
        assertNotNull(id);
        assertTrue(q.drainOne());

        Map<String, Object> view = q.view(id).orElseThrow();
        assertEquals("DONE", view.get("status"));
        assertEquals("往有灯的地方走", view.get("answer"));
        assertEquals("gpt-6-sol", view.get("model"));
        assertEquals(false, view.get("cached"));
        assertEquals(12L, view.get("latencyMs"));
        assertEquals(1, view.get("attempts"));
        assertFalse(view.containsKey("question"));
        assertEquals(1L, q.stats().get("done"));
    }

    @Test
    @DisplayName("选择性重试：upstream-* 重试并指数退避，第三次成功")
    void retriesTransientFailures() {
        AtomicInteger calls = new AtomicInteger();
        AdvisorJobQueue q = queue(props(2), (question, ctx) -> {
            if (calls.incrementAndGet() < 3) throw new AdvisorUnavailableException("upstream-503");
            return answer("终于好了");
        });
        String id = q.submit("再问一次", Map.of(), null).jobId();
        q.drainOne();

        assertEquals("DONE", q.view(id).orElseThrow().get("status"));
        assertEquals(3, q.view(id).orElseThrow().get("attempts"));
        assertEquals(2L, q.stats().get("retried"));
        assertEquals(1L, q.stats().get("processed"));
    }

    @Test
    @DisplayName("死信：重试耗尽进 DEAD，机器码原因可轮询到（不是无声 503）")
    void exhaustedTaskBecomesDeadLetter() {
        AdvisorJobQueue q = queue(props(2),
                (question, ctx) -> { throw new AdvisorUnavailableException("upstream-429"); });
        String id = q.submit("一", Map.of(), null).jobId();
        q.drainOne();

        Map<String, Object> view = q.view(id).orElseThrow();
        assertEquals("DEAD", view.get("status"));
        assertEquals("upstream-429", view.get("reason"));
        assertEquals(3, view.get("attempts"));
        assertEquals(1L, q.stats().get("deadLettered"));
    }

    @Test
    @DisplayName("not-configured 是配置错误，不重试（再问一百次也长不出密钥）")
    void nonRetryableFailsFast() {
        AdvisorJobQueue q = queue(props(2),
                (question, ctx) -> { throw new AdvisorUnavailableException("not-configured"); });
        String id = q.submit("一", Map.of(), null).jobId();
        q.drainOne();

        assertEquals("DEAD", q.view(id).orElseThrow().get("status"));
        assertEquals(1, q.view(id).orElseThrow().get("attempts"));
        assertEquals(0L, q.stats().get("retried"));
    }

    @Test
    @DisplayName("在飞任务绝不被 LRU 淘汰：淘汰只发生在终态")
    void evictionNeverTouchesInFlightJobs() {
        AdvisorJobProperties p = props(4);
        p.setMaxTracked(1);
        AtomicInteger calls = new AtomicInteger();
        AdvisorJobQueue q = queue(p, (question, ctx) -> {
            calls.incrementAndGet();
            return answer("ok");
        });
        String done = q.submit("一", Map.of(), null).jobId();
        String queued = q.submit("二", Map.of(), null).jobId();
        String running = q.submit("三", Map.of(), null).jobId();
        q.drainOne();

        assertTrue(q.view(queued).isPresent(), "QUEUED 不能被淘汰");
        assertTrue(q.view(running).isPresent(), "QUEUED 不能被淘汰");
        Optional<Map<String, Object>> finished = q.view(done);
        assertTrue(finished.isEmpty() || "DONE".equals(finished.get().get("status")),
                "要淘汰也只能淘汰那个已完成的");
        assertEquals(1, calls.get());
    }

    @Test
    @DisplayName("终态按完成时间 LRU 淘汰，并把幂等键一起释放")
    void evictsOldestTerminalJobAndReleasesDedupKey() {
        AdvisorJobProperties p = props(4);
        p.setMaxTracked(2);
        AdvisorJobQueue q = queue(p, (question, ctx) -> answer("ok"));
        String first = q.submit("一", Map.of(), "req-1").jobId();
        q.drainOne();
        String second = q.submit("二", Map.of(), "req-2").jobId();
        q.drainOne();
        String third = q.submit("三", Map.of(), "req-3").jobId();
        q.drainOne();

        assertTrue(q.view(first).isEmpty(), "最老的终态应先走");
        assertTrue(q.view(second).isPresent());
        assertTrue(q.view(third).isPresent());
        // req-1 被释放后，同键再次提交应是一个新任务，而不是拿到已淘汰的旧 jobId
        assertFalse(q.submit("一", Map.of(), "req-1").duplicate());
    }

    @Test
    @DisplayName("中断：worker 被停机打断时任务落 DEAD 并留下 interrupted 原因")
    void interruptionBecomesDeadLetter() {
        AdvisorJobProperties p = props(2);
        AdvisorJobQueue q = new AdvisorJobQueue(p,
                (question, ctx) -> { throw new AdvisorUnavailableException("upstream-503"); },
                ms -> { throw new InterruptedException("shutdown"); });
        String id = q.submit("一", Map.of(), null).jobId();
        q.drainOne();
        assertEquals("interrupted", q.view(id).orElseThrow().get("reason"));
        Thread.interrupted(); // 清掉中断标志，别污染同池里的其它用例
    }

    @Test
    @DisplayName("两个真 worker 并发：30 条任务每条恰好处理一次，processed 守恒")
    void concurrentWorkersProcessEachJobExactlyOnce() throws Exception {
        AdvisorJobProperties p = props(64);
        p.setWorkers(2);
        ConcurrentHashMap<String, AtomicInteger> handled = new ConcurrentHashMap<>();
        AdvisorJobQueue q = new AdvisorJobQueue(p, (question, ctx) -> {
            handled.computeIfAbsent(question, k -> new AtomicInteger()).incrementAndGet();
            return answer("ok");
        }, ms -> {});
        try {
            q.start();
            for (int i = 0; i < 30; i++) q.submit("q-" + i, Map.of(), null);
            long deadline = System.currentTimeMillis() + 8000;
            while (System.currentTimeMillis() < deadline
                    && ((Long) q.stats().get("done")) < 30L) {
                Thread.sleep(10);
            }
            assertEquals(30L, q.stats().get("done"));
            assertEquals(30L, q.stats().get("processed"));
            assertEquals(0L, q.stats().get("depth"));
            assertEquals(30, handled.size());
            assertTrue(handled.values().stream().allMatch(c -> c.get() == 1),
                    "同一条任务不能被两个 worker 重复处理");
        } finally {
            q.stop();
        }
    }
}
