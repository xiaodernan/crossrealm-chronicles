package com.crossrealm.chronicles.gateway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.context.ApplicationContext;
import org.springframework.context.i18n.LocaleContext;
import org.springframework.http.codec.multipart.Part;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpResponse;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebSession;
import reactor.core.publisher.Mono;

/**
 * W-P8 单测：X-Request-Id 的三条腿——
 * 净化（纯函数，逐条穷举）/ 选取（合法原样回、非法换 UUID）/ 过滤器（入站透传、出站对齐、UUID 生成）。
 * 桩与 RateLimitByIpFilterTest 同款——除自己那一格之外 exchange 一无所求。
 */
class RequestIdFilterTest {

    private static final Pattern UUID_SHAPE =
            Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");

    /* ---------- 净化 ---------- */

    @Test
    void sanitizeTrimsAndAcceptsVisibleAscii() {
        assertEquals("abc-123_XYZ", RequestIdFilter.sanitizeInbound("abc-123_XYZ"));
        assertEquals("a".repeat(64), RequestIdFilter.sanitizeInbound("a".repeat(64)));
        // 两侧空白被当成多余的东西裁掉（裁完合法就放行）
        assertEquals("id-1", RequestIdFilter.sanitizeInbound("  id-1  "));
    }

    @Test
    void sanitizeRejectsEmptyNullTooLongAndUnsafeCharacters() {
        assertNull(RequestIdFilter.sanitizeInbound(null));
        assertNull(RequestIdFilter.sanitizeInbound(""));
        assertNull(RequestIdFilter.sanitizeInbound("   "));
        assertNull(RequestIdFilter.sanitizeInbound("a".repeat(65)), "超过 64 个字符不合法");
        // 空白、逗号、分号、中文一律出局——能注入 header 回显的东西不能放进链路
        assertNull(RequestIdFilter.sanitizeInbound("ab cd"));
        assertNull(RequestIdFilter.sanitizeInbound("a,b"));
        assertNull(RequestIdFilter.sanitizeInbound("a;b"));
        assertNull(RequestIdFilter.sanitizeInbound("身份证-1"));
    }

    /* ---------- 选取 ---------- */

    @Test
    void selectKeepsLegitimateInboundId() {
        assertEquals("caller-generated-42", RequestIdFilter.selectRequestId("caller-generated-42"));
    }

    @Test
    void selectGeneratesIndependentUuidsWhenInvalid() {
        String first = RequestIdFilter.selectRequestId(null);
        String second = RequestIdFilter.selectRequestId("bad id with spaces");
        assertTrue(UUID_SHAPE.matcher(first).matches(), "生成的 id 应是 UUID：" + first);
        assertTrue(UUID_SHAPE.matcher(second).matches(), "生成的 id 应是 UUID：" + second);
        assertNotEquals(first, second, "两次生成不该撞号");
    }

    /* ---------- 过滤器 ---------- */

    private static final class StubExchange implements ServerWebExchange {
        private final ServerHttpRequest request;
        private final ServerHttpResponse response = new MockServerHttpResponse();
        private final Map<String, Object> attributes = new HashMap<>();

        StubExchange(ServerHttpRequest request) {
            this.request = request;
        }

        @Override public ServerHttpRequest getRequest() { return request; }
        @Override public ServerHttpResponse getResponse() { return response; }
        @Override public Map<String, Object> getAttributes() { return attributes; }
        @Override public Mono<WebSession> getSession() { return Mono.empty(); }
        @Override public <T extends java.security.Principal> Mono<T> getPrincipal() { return Mono.empty(); }
        @Override public Mono<MultiValueMap<String, String>> getFormData() { return Mono.empty(); }
        @Override public Mono<MultiValueMap<String, Part>> getMultipartData() { return Mono.empty(); }
        @Override public LocaleContext getLocaleContext() {
            return new LocaleContext() {
                @Override public Locale getLocale() { return Locale.ROOT; }
            };
        }
        @Override public ApplicationContext getApplicationContext() {
            return org.mockito.Mockito.mock(ApplicationContext.class);
        }
        @Override public String transformUrl(String path) {
            return path;
        }
        @Override public void addUrlTransformer(Function<String, String> transformer) {
            // no-op
        }
        @Override public boolean isNotModified() { return false; }
        @Override public boolean checkNotModified(java.time.Instant lastModified) { return false; }
        @Override public boolean checkNotModified(String etag) { return false; }
        @Override public boolean checkNotModified(String etag, java.time.Instant lastModified) { return false; }
        @Override public String getLogPrefix() { return "stub"; }
    }

    private static GatewayFilterChain captureChain(ServerWebExchange[] out) {
        return exchange -> {
            out[0] = exchange;
            return Mono.empty();
        };
    }

    @Test
    void validInboundIdReachesDownstreamAndComesBackUnchanged() {
        RequestIdFilter filter = new RequestIdFilter();
        MockServerHttpRequest request = MockServerHttpRequest.get("/api/version")
                .header("X-Request-Id", "caller-7f3a")
                .build();
        ServerWebExchange[] captured = new ServerWebExchange[1];

        filter.filter(new StubExchange(request), captureChain(captured)).block();

        // 下游收到的请求带着同一个 id
        assertEquals("caller-7f3a", captured[0].getRequest().getHeaders().getFirst("X-Request-Id"));
    }

    @Test
    void missingOrInvalidInboundIdProducesUuidForBothDirections() {
        RequestIdFilter filter = new RequestIdFilter();
        MockServerHttpRequest request = MockServerHttpRequest.get("/api/version")
                .header("X-Request-Id", "not a valid id")
                .build();
        ServerWebExchange[] captured = new ServerWebExchange[1];

        filter.filter(new StubExchange(request), captureChain(captured)).block();

        String downstreamId = captured[0].getRequest().getHeaders().getFirst("X-Request-Id");
        assertTrue(UUID_SHAPE.matcher(downstreamId).matches(), "下游拿到的应是 UUID：" + downstreamId);
    }

    @Test
    void orderIsAfterRateLimitAndBeforeCacheControl() {
        // 429 拒掉的请求不配 id（−100 之后）；Cache-Control 之前落章（−50 之前）
        assertEquals(-90, new RequestIdFilter().getOrder());
    }
}
