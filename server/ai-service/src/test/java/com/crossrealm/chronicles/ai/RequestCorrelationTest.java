package com.crossrealm.chronicles.ai;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

/**
 * W-Z6：X-Request-Id 贯通（网关 W-P8 的下游那一截）。
 *
 * <p>三条契约钉死：
 * ① 只带 header、没带 body requestId → 网关铸/透传的那个 id 落进 job 的 body 与轮询视图两处；
 * ② body requestId（幂等键）与 header 都有 → body 赢（幂等键永远由客户端说了算）；
 * ③ 畸形 header（空白 / 逗号 / 分号 / 非 ASCII）→ 当没带（不编造，不 500）。
 */
class RequestCorrelationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        AdvisorJobProperties p = new AdvisorJobProperties();
        p.setCapacity(8);
        p.setWorkers(0);        // 不启 worker：只验证入队时的 correlation 解析
        p.setMaxAttempts(2);
        p.setRetryBaseMs(1);
        p.setPollAfterMs(250);
        AdvisorJobQueue queue = new AdvisorJobQueue(p,
                (question, ctx) -> new LlmClient.Answer("星图说：往前", "gpt-6-sol", false, 1L),
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
    void header只透传到异步任务里() throws Exception {
        String id = "trace-async-1";
        String submitted = mvc.perform(post("/api/ai/chat/async")
                        .header("X-Request-Id", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("在哪里？", null)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.requestId").value(id))
                .andReturn().getResponse().getContentAsString();
        String jobId = MAPPER.readTree(submitted).path("jobId").asText();

        mvc.perform(get("/api/ai/jobs/" + jobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestId").value(id));
    }

    @Test
    void body幂等键优先于网关header() throws Exception {
        String submitted = mvc.perform(post("/api/ai/chat/async")
                        .header("X-Request-Id", "trace-header-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("同一句", "req-body-1")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.requestId").value("req-body-1"))
                .andReturn().getResponse().getContentAsString();
        String jobId = MAPPER.readTree(submitted).path("jobId").asText();

        mvc.perform(get("/api/ai/jobs/" + jobId))
                .andExpect(jsonPath("$.requestId").value("req-body-1"));
    }

    @Test
    void 畸形header当没带() throws Exception {
        for (String bad : new String[]{"a b", "a,b", "a;b", "中文id"}) {
            mvc.perform(post("/api/ai/chat/async")
                            .header("X-Request-Id", bad)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body("一", null)))
                    .andExpect(status().isAccepted())
                    .andExpect(jsonPath("$.requestId").doesNotExist());
        }
    }
}
