package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-Y4：**真实上游 + 真实队列**的端到端联调。
 *
 * <p>与 {@link AiLiveIntegrationTest} 同一条纪律：只有进程里有 {@code LLM_API_KEY}
 * 才启用，CI 永远零外呼、零花费。这里额外验证的是 W-Y1 测不到的那一段——
 * 任务在 worker 线程里被取走、真的调用了上游、终态能被轮询到、缓存复用不产生第二次外呼。
 *
 * <pre>
 *   set -a; . ./.env; set +a
 *   mvn -o -pl ai-service test -Dtest=AdvisorJobLiveIntegrationTest
 * </pre>
 */
@EnabledIfEnvironmentVariable(named = "LLM_API_KEY", matches = ".+")
class AdvisorJobLiveIntegrationTest {

    @Test
    void 真实上游跑通异步提交与轮询() throws Exception {
        AiProperties p = new AiProperties();
        p.setApiKey(System.getenv("LLM_API_KEY"));
        String base = System.getenv("LLM_BASE_URL");
        if (base != null && !base.isBlank()) p.setBaseUrl(base);
        String model = System.getenv("LLM_MODEL");
        if (model != null && !model.isBlank()) p.setModel(model);
        p.setTimeout(Duration.ofSeconds(60));
        p.setMaxRetries(1);
        LlmClient client = new LlmClient(p, new HttpLlmTransport(), new ObjectMapper());

        AdvisorJobProperties jp = new AdvisorJobProperties();
        jp.setWorkers(2);
        jp.setCapacity(8);
        jp.setMaxAttempts(2);
        jp.setRetryBaseMs(200);
        jp.setPollAfterMs(100);
        AdvisorJobQueue queue = new AdvisorJobQueue(jp, client::ask);
        try {
            queue.start();
            AdvisorJobQueue.SubmitResult a = queue.submit(
                    "用一句话说说在枢纽该先去哪里", Map.of("zone", "hub"), "live-async-1");
            assertTrue(a.accepted());
            // 幂等键重复提交：不该产生第二次上游调用
            assertTrue(queue.submit(
                    "用一句话说说在枢纽该先去哪里", Map.of("zone", "hub"), "live-async-1").duplicate());
            AdvisorJobQueue.SubmitResult b = queue.submit(
                    "用一句话说说试炼场怎么开局", Map.of("zone", "trial"), "live-async-2");
            assertTrue(b.accepted());

            Map<String, Object> va = awaitTerminal(queue, a.jobId());
            Map<String, Object> vb = awaitTerminal(queue, b.jobId());
            assertEquals("DONE", va.get("status"), "真实上游失败原因: " + va.get("reason"));
            assertEquals("DONE", vb.get("status"), "真实上游失败原因: " + vb.get("reason"));
            for (Map<String, Object> v : java.util.List.of(va, vb)) {
                String answer = String.valueOf(v.get("answer"));
                assertTrue(answer.length() > 1, "答案不能是空壳");
                assertFalse(answer.contains("sk-"), "回答里不许出现任何密钥片段");
                assertEquals(p.getModel(), v.get("model"));
                assertFalse(v.containsKey("question"), "轮询视图不回显玩家输入");
            }
            long calls = (long) client.health().get("upstreamCalls");
            assertTrue(calls >= 2, "两个不同问题应各产生一次上游调用");
            assertEquals(2L, queue.stats().get("done"));
            assertEquals(1L, queue.stats().get("dedupHits"));
            assertEquals(0L, queue.stats().get("deadLettered"));

            // 缓存复用：同一句再走一次队列，答案来自缓存，外呼数不涨
            AdvisorJobQueue.SubmitResult c = queue.submit(
                    "用一句话说说在枢纽该先去哪里", Map.of("zone", "hub"), "live-async-3");
            Map<String, Object> vc = awaitTerminal(queue, c.jobId());
            assertEquals("DONE", vc.get("status"));
            assertEquals(true, vc.get("cached"));
            assertEquals(calls, ((Number) client.health().get("upstreamCalls")).longValue(),
                    "缓存命中不得再打一次上游");
            System.out.println("[W-Y4 live] model=" + p.getModel()
                    + " calls=" + client.health().get("upstreamCalls")
                    + " stats=" + queue.stats());
        } finally {
            queue.stop();
        }
    }

    private static Map<String, Object> awaitTerminal(AdvisorJobQueue queue, String jobId)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + 120_000L;
        while (System.currentTimeMillis() < deadline) {
            Map<String, Object> view = queue.view(jobId).orElseThrow();
            if ("DONE".equals(view.get("status")) || "DEAD".equals(view.get("status"))) {
                return view;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("真实上游 120 秒内没给出终态: jobId=" + jobId);
    }
}
