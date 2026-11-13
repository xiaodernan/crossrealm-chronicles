package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** W-Y4：异步端点的 REST 契约（standalone MockMvc，手工挂 validator 让 @Valid 生效）。 */
class AdvisorJobControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private AdvisorJobQueue queue;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        AdvisorJobProperties p = new AdvisorJobProperties();
        p.setCapacity(1);
        p.setWorkers(0);
        p.setMaxAttempts(2);
        p.setRetryBaseMs(1);
        p.setPollAfterMs(250);
        queue = new AdvisorJobQueue(p,
                (question, ctx) -> new LlmClient.Answer("星图说：往东", "gpt-6-sol", true, false, 7L),
                ms -> {});
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new AdvisorJobController(queue))
                .setValidator(validator)
                .build();
    }

    private static String body(String question, String requestId) throws Exception {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("question", question);
        if (requestId != null) m.put("requestId", requestId);
        return MAPPER.writeValueAsString(m);
    }

    @Test
    void 提交返回202与轮询提示() throws Exception {
        mvc.perform(post("/api/ai/chat/async")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("该往哪走？", null)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("queued"))
                .andExpect(jsonPath("$.duplicate").value(false))
                .andExpect(jsonPath("$.pollAfterMs").value(250))
                .andExpect(jsonPath("$.jobId").isString());
    }

    @Test
    void 队列满回429并带RetryAfter() throws Exception {
        mvc.perform(post("/api/ai/chat/async")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("第一句", null)))
                .andExpect(status().isAccepted());
        mvc.perform(post("/api/ai/chat/async")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("第二句", null)))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "1"))
                .andExpect(jsonPath("$.error").value("advisor-queue-full"))
                .andExpect(jsonPath("$.retryAfterMs").value(250));
    }

    @Test
    void 同一幂等键返回同一任务() throws Exception {
        String first = mvc.perform(post("/api/ai/chat/async")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("再问一次", "req-7")))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        String jobId = MAPPER.readTree(first).path("jobId").asText();
        mvc.perform(post("/api/ai/chat/async")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("再问一次", "req-7")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.duplicate").value(true))
                .andExpect(jsonPath("$.jobId").value(jobId));
    }

    @Test
    void 未知任务回404() throws Exception {
        mvc.perform(get("/api/ai/jobs/does-not-exist"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("job-not-found"));
    }

    @Test
    void 轮询在飞与终态() throws Exception {
        String submitted = mvc.perform(post("/api/ai/chat/async")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("一", null)))
                .andReturn().getResponse().getContentAsString();
        String id = MAPPER.readTree(submitted).path("jobId").asText();

        mvc.perform(get("/api/ai/jobs/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("QUEUED"))
                .andExpect(jsonPath("$.answer").doesNotExist());

        queue.drainOne();
        mvc.perform(get("/api/ai/jobs/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.answer").value("星图说：往东"))
                .andExpect(jsonPath("$.cached").value(true))
                .andExpect(jsonPath("$.latencyMs").value(7))
                .andExpect(jsonPath("$.question").doesNotExist());
    }

    @Test
    void 队列读数端点可读() throws Exception {
        mvc.perform(get("/api/ai/jobs/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.capacity").value(1))
                .andExpect(jsonPath("$.workers").value(0))
                .andExpect(jsonPath("$.enqueued").value(0))
                .andExpect(jsonPath("$.deadLettered").value(0));
    }

    @Test
    void 空问题被校验挡在队列外面() throws Exception {
        mvc.perform(post("/api/ai/chat/async")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("   ", null)))
                .andExpect(status().isBadRequest());
        assertEqualsDepth();
    }

    @Test
    void 撤回排队任务_真撤回并释放幂等键() throws Exception {
        String submitted = mvc.perform(post("/api/ai/chat/async")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("撤回我", "req-cancel-1")))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        String jobId = MAPPER.readTree(submitted).path("jobId").asText();

        mvc.perform(post("/api/ai/jobs/" + jobId + "/cancel"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.cancelled").value(true))
                .andExpect(jsonPath("$.reason").value("queued"));

        mvc.perform(get("/api/ai/jobs/" + jobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.reason").value("client-cancel"));

        Map<String, Object> stats = queue.stats();
        assertEquals(1L, ((Number) stats.get("cancelled")).longValue());

        // 撤回后同一 requestId 再问：应当受理一次新任务（幂等键已释放），而不是指回已取消的任务
        mvc.perform(post("/api/ai/chat/async")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("换个问法", "req-cancel-1")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.duplicate").value(false));
    }

    @Test
    void 撤回后worker不上游() throws Exception {
        String submitted = mvc.perform(post("/api/ai/chat/async")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("撤回我", null)))
                .andReturn().getResponse().getContentAsString();
        String jobId = MAPPER.readTree(submitted).path("jobId").asText();

        mvc.perform(post("/api/ai/jobs/" + jobId + "/cancel"))
                .andExpect(status().isOk());

        assertFalse(queue.drainOne(), "已被撤回的任务不该被 worker 捞起来处理");
        Map<String, Object> stats = queue.stats();
        assertEquals(0L, ((Number) stats.get("done")).longValue());
    }

    @Test
    void 未知任务_撤回404() throws Exception {
        mvc.perform(post("/api/ai/jobs/does-not-exist/cancel"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("job-not-found"));
    }

    @Test
    void 死信白名单_只回可排障字段_不带玩家输入() throws Exception {
        // 一个注定 DEAD 的队列（handler 永远抛），1 个 worker=0，手动 drain
        AdvisorJobProperties p = new AdvisorJobProperties();
        p.setCapacity(2);
        p.setWorkers(0);
        p.setMaxAttempts(1);
        p.setRetryBaseMs(1);
        p.setPollAfterMs(100);
        AdvisorJobQueue deadQueue = new AdvisorJobQueue(p,
                (question, ctx) -> { throw new IllegalStateException("handler boom"); },
                ms -> {});
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        MockMvc deadMvc = MockMvcBuilders.standaloneSetup(new AdvisorJobController(deadQueue))
                .setValidator(validator).build();

        deadMvc.perform(post("/api/ai/chat/async")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("绝对不可以出现的玩家秘密XYZ", "req-dead-1")))
                .andExpect(status().isAccepted());
        deadQueue.drainOne(); // → DEAD（handler-error，maxAttempts=1）

        String payload = deadMvc.perform(get("/api/ai/jobs/dead-letter?limit=5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(1))
                .andExpect(jsonPath("$.limit").value(5))
                .andExpect(jsonPath("$.items[0].id").isString())
                .andExpect(jsonPath("$.items[0].reason").value("handler-error"))
                .andExpect(jsonPath("$.items[0].attempts").value(1))
                .andExpect(jsonPath("$.items[0].requestId").value("req-dead-1"))
                .andReturn().getResponse().getContentAsString();

        if (payload.contains("绝对不可以出现的玩家秘密XYZ")) {
            throw new AssertionError("dead-letter 泄露了玩家输入：" + payload);
        }
        if (payload.contains("answer")) {
            throw new AssertionError("dead-letter 泄露了模型输出：" + payload);
        }
        if (payload.contains("context")) {
            throw new AssertionError("dead-letter 泄露了上下文：" + payload);
        }
    }

    @Test
    void 死信白名单_limit封顶与空信件() throws Exception {
        // 空队列：count=0，items 为空数组，limit 按封顶规则夹到 50
        mvc.perform(get("/api/ai/jobs/dead-letter?limit=9999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(0))
                .andExpect(jsonPath("$.limit").value(50))
                .andExpect(jsonPath("$.items").isArray());
    }

    private void assertEqualsDepth() {
        Map<String, Object> stats = queue.stats();
        if ((Long) stats.get("enqueued") != 0L) {
            throw new AssertionError("校验失败的请求不该进队列");
        }
    }
}
