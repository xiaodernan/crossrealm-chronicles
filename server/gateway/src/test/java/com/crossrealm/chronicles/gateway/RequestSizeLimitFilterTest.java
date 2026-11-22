package com.crossrealm.chronicles.gateway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.context.ApplicationContext;
import org.springframework.context.i18n.LocaleContext;
import org.springframework.http.HttpStatus;
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
 * 请求体大小闸门契约（用户「瞬间大数据量冲击」）。
 *
 * <p>核心不变量：<b>已知超限的 Content-Length 必须在网关就被 413 拦下</b>，
 * 不能让它进业务服务被 Jackson 完整读入解析；缺失/未知长度放行（不误伤 chunked 上传）；
 * 恰好等于上限放行。
 */
class RequestSizeLimitFilterTest {

    private static final long MAX = 1024L;

    private static GatewayFilterChain countingChain(int[] counter) {
        return exchange -> {
            counter[0]++;
            return Mono.empty();
        };
    }

    private static ServerWebExchange exchangeWithLength(long contentLength) {
        MockServerHttpRequest.BaseBuilder<?> b = MockServerHttpRequest.post("/api/telemetry/events");
        if (contentLength >= 0) {
            b = b.header("Content-Length", String.valueOf(contentLength));
        }
        return new StubExchange(b.build());
    }

    @Test
    void 超限的ContentLength在网关就被413拦下_不进业务链() {
        RequestSizeLimitFilter f = new RequestSizeLimitFilter(MAX);
        int[] counter = { 0 };
        ServerWebExchange ex = exchangeWithLength(MAX + 1);
        f.filter(ex, countingChain(counter)).block();
        assertEquals(0, counter[0], "超限请求不该进入下游链");
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, ex.getResponse().getStatusCode());
    }

    @Test
    void 恰好等于上限放行() {
        RequestSizeLimitFilter f = new RequestSizeLimitFilter(MAX);
        int[] counter = { 0 };
        f.filter(exchangeWithLength(MAX), countingChain(counter)).block();
        assertEquals(1, counter[0]);
    }

    @Test
    void 正常大小放行() {
        RequestSizeLimitFilter f = new RequestSizeLimitFilter(MAX);
        int[] counter = { 0 };
        f.filter(exchangeWithLength(64), countingChain(counter)).block();
        assertEquals(1, counter[0]);
    }

    @Test
    void 没有ContentLength时放行_不误伤chunked() {
        RequestSizeLimitFilter f = new RequestSizeLimitFilter(MAX);
        int[] counter = { 0 };
        f.filter(exchangeWithLength(-1), countingChain(counter)).block();
        assertEquals(1, counter[0], "未知长度不能预判，必须放行");
    }

    @Test
    void 阈值可配且非法值回落默认() {
        assertEquals(4096L, new RequestSizeLimitFilter(4096L).maxBytes());
        assertEquals(1024L * 1024L, new RequestSizeLimitFilter(0L).maxBytes());
        assertEquals(1024L * 1024L, new RequestSizeLimitFilter(-5L).maxBytes());
    }

    @Test
    void 顺位在限流之后_RequestId之前() {
        int order = new RequestSizeLimitFilter(MAX).getOrder();
        assertEquals(-95, order);
        assertTrue(order > new RateLimitByIpFilter(new InMemoryIpRateLimiter()).getOrder(), "必须在限流之后");
        assertTrue(order < new RequestIdFilter().getOrder(), "必须在 RequestId 之前");
    }

    /** 与 RateLimitByIpFilterTest 同款最小桩 */
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
        @Override public String transformUrl(String path) { return path; }
        @Override public void addUrlTransformer(Function<String, String> transformer) { }
        @Override public boolean isNotModified() { return false; }
        @Override public boolean checkNotModified(Instant lastModified) { return false; }
        @Override public boolean checkNotModified(String etag) { return false; }
        @Override public boolean checkNotModified(String etag, Instant lastModified) { return false; }
        @Override public String getLogPrefix() { return "stub"; }
    }
}
