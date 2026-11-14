package com.crossrealm.chronicles.game.idem;

import com.crossrealm.chronicles.game.GameServiceProperties;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import jakarta.servlet.ServletException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** W-Z65：幂等过滤器 —— 契约钉死在 3 个断言里：重放字节一致 / 409 不到业务 / 未命中才进业务 */
class IdempotencyFilterTest {

    private GameServiceProperties properties;

    @BeforeEach
    void setUp() {
        properties = new GameServiceProperties();
        properties.getIdempotency().setEnabled(true);
        properties.getIdempotency().setBackend("memory");
        properties.getIdempotency().setTtlSeconds(600);
        properties.getIdempotency().setMaxEntries(512);
    }

    private IdempotencyFilter filter() {
        return new IdempotencyFilter(properties, null);
    }

    private static MockHttpServletRequest post(String uri, String key, String body) {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", uri);
        req.setContent(body.getBytes(StandardCharsets.UTF_8));
        req.setContentType("application/json");
        if (key != null) {
            req.addHeader(IdempotencyFilter.HEADER, key);
        }
        return req;
    }

    /** 模拟下游控制器：+201 + 固定体；记录调用次数 */
    private static final class RecordingChain extends MockFilterChain {
        final AtomicInteger calls = new AtomicInteger();
        final String body;

        RecordingChain(String body) {
            this.body = body;
        }

        @Override
        public void doFilter(jakarta.servlet.ServletRequest request, jakarta.servlet.ServletResponse response)
                throws IOException, ServletException {
            calls.incrementAndGet();
            jakarta.servlet.http.HttpServletResponse res = (jakarta.servlet.http.HttpServletResponse) response;
            res.setStatus(201);
            res.setContentType("application/json");
            res.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
        }
    }

    @Test
    @DisplayName("未提供 key：链照常跑，响应不带 REPLAY 头（零拦截）")
    void noKeyPassthrough() throws Exception {
        RecordingChain chain = new RecordingChain("{\"accepted\":true}");
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter().doFilter(post("/api/leaderboard", null, "{\"runner\":\"x\"}"), res, chain);
        assertEquals(1, chain.calls.get());
        assertEquals(201, res.getStatus());
        assertEquals(null, res.getHeader(IdempotencyFilter.REPLAY_HEADER));
    }

    @Test
    @DisplayName("总开关关（enabled=false）：带 key 也照常落业务")
    void disabledPassthrough() throws Exception {
        properties.getIdempotency().setEnabled(false);
        RecordingChain chain = new RecordingChain("{\"accepted\":true}");
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter().doFilter(post("/api/leaderboard", "key-1", "{\"runner\":\"x\"}"), res, chain);
        assertEquals(1, chain.calls.get());
    }

    @Test
    @DisplayName("非法 key：400 + {\"error\":\"invalid-idempotency-key\"}，业务永远不到服务层")
    void invalidKeyRejected() throws Exception {
        RecordingChain chain = new RecordingChain("{\"accepted\":true}");
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter().doFilter(post("/api/leaderboard", "!!nope", "{\"runner\":\"x\"}"), res, chain);
        assertEquals(400, res.getStatus());
        assertTrue(res.getContentAsString().contains("invalid-idempotency-key"));
        assertEquals(0, chain.calls.get());
    }

    @Test
    @DisplayName("首次提交 + 原样重放：第二次返回与第一次字节一致、X-Idempotent-Replayed=true、链只跑一次")
    void replayIdentical() throws Exception {
        IdempotencyFilter filter = filter(); // 同一实例才共享台账（生产就是 Spring 单例）
        RecordingChain chain = new RecordingChain("{\"accepted\":true,\"total\":42}");
        MockHttpServletResponse first = new MockHttpServletResponse();
        filter.doFilter(post("/api/leaderboard", "k-1", "{\"runner\":\"smoke\",\"bossId\":\"x\",\"clearTimeMs\":1,\"chapter\":1}"), first, chain);
        assertEquals(1, chain.calls.get());
        assertEquals(201, first.getStatus());
        assertEquals("false", first.getHeader(IdempotencyFilter.REPLAY_HEADER));

        MockHttpServletResponse second = new MockHttpServletResponse();
        RecordingChain chain2 = new RecordingChain("{\"accepted\":true,\"total\":99}"); // 故意不同 —— 重放必须无视它
        filter.doFilter(post("/api/leaderboard", "k-1", "{\"runner\":\"smoke\",\"bossId\":\"x\",\"clearTimeMs\":1,\"chapter\":1}"), second, chain2);
        assertEquals(0, chain2.calls.get(), "重放绝不再次触达业务");
        assertEquals(201, second.getStatus());
        assertEquals(first.getContentAsString(), second.getContentAsString(), "重放必须逐字节一致");
        assertEquals("true", second.getHeader(IdempotencyFilter.REPLAY_HEADER));
    }

    @Test
    @DisplayName("同 key 不同 payload → 409 {\"error\":\"idempotency-key-conflict\"}，业务永远不到服务层")
    void conflictRejected() throws Exception {
        IdempotencyFilter filter = filter();
        RecordingChain chain = new RecordingChain("{\"accepted\":true}");
        MockHttpServletResponse first = new MockHttpServletResponse();
        filter.doFilter(post("/api/leaderboard", "k-2", "{\"runner\":\"smoke\",\"clearTimeMs\":1}"), first, chain);

        RecordingChain chain2 = new RecordingChain("{\"accepted\":true}");
        MockHttpServletResponse second = new MockHttpServletResponse();
        filter.doFilter(post("/api/leaderboard", "k-2", "{\"runner\":\"smoke\",\"clearTimeMs\":2}"), second, chain2);
        assertEquals(409, second.getStatus());
        assertTrue(second.getContentAsString().contains("idempotency-key-conflict"));
        assertEquals(0, chain2.calls.get());
    }

    @Test
    @DisplayName("请求体超过 64KB → 413 {\"error\":\"idempotency-body-too-large\"}，业务永远不到服务层")
    void oversizedBodyRejected() throws Exception {
        RecordingChain chain = new RecordingChain("{\"accepted\":true}");
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/leaderboard");
        req.setContent(new byte[70 * 1024]); // 全零字节 —— 不需要是合法 JSON，也不会读完
        req.setContentType("application/json");
        req.addHeader(IdempotencyFilter.HEADER, "k-body-limit");
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter().doFilter(req, res, chain);
        assertEquals(413, res.getStatus());
        assertTrue(res.getContentAsString().contains("idempotency-body-too-large"));
        assertEquals(0, chain.calls.get());
    }

    @Test
    @DisplayName("GET 不拦截；其他 POST 路径不拦截（幂等只服务那两条写路径）")
    void pathsAndMethodsScoped() throws Exception {
        RecordingChain getChain = new RecordingChain("{}");
        MockHttpServletRequest getReq = new MockHttpServletRequest("GET", "/api/leaderboard");
        getReq.addHeader(IdempotencyFilter.HEADER, "k-3");
        MockHttpServletResponse getRes = new MockHttpServletResponse();
        filter().doFilter(getReq, getRes, getChain);
        assertEquals(1, getChain.calls.get());

        RecordingChain otherChain = new RecordingChain("{}");
        MockHttpServletResponse otherRes = new MockHttpServletResponse();
        filter().doFilter(post("/api/telemetry/events", "k-4", "{\"type\":\"x\"}"), otherRes, otherChain);
        assertEquals(1, otherChain.calls.get());
    }

    @Test
    @DisplayName("TTL 过期后同 key 可再次提交（台账不拖长命）")
    void ttlExpiresAllowsResubmit() throws Exception {
        properties.getIdempotency().setTtlSeconds(0); // 立即过期（= 每次提交都是新的）——先于构造
        IdempotencyFilter filter = filter();
        RecordingChain chain = new RecordingChain("{\"accepted\":true}");
        filter.doFilter(post("/api/leaderboard", "k-5", "{\"runner\":\"x\",\"clearTimeMs\":1}"),
                new MockHttpServletResponse(), chain);
        RecordingChain chain2 = new RecordingChain("{\"accepted\":true}");
        filter.doFilter(post("/api/leaderboard", "k-5", "{\"runner\":\"x\",\"clearTimeMs\":1}"),
                new MockHttpServletResponse(), chain2);
        assertEquals(1, chain2.calls.get(), "TTL 过期后旧 key 不再劫持");
    }
}
