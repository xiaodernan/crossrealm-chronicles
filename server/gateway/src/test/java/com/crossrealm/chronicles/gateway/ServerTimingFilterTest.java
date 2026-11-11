package com.crossrealm.chronicles.gateway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.context.ApplicationContext;
import org.springframework.context.i18n.LocaleContext;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.codec.multipart.Part;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpResponse;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebSession;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * W-P9 单测：Server-Timing 的两条腿——
 * 格式化（纯函数，逐分支）+ 过滤器（commit 时落头、下游的同名头不覆盖，add 而不 set）。
 * 桩与 RequestIdFilterTest 同款——除自己那一格之外 exchange 一无所求。
 */
class ServerTimingFilterTest {

    private static final Pattern GW_DUR = Pattern.compile("^gw;dur=\\d+$");

    /* ---------- 格式化 ---------- */

    @Test
    void formatGwDurRoundsToIntegerMillis() {
        // 亚毫秒 → 0（求真不必求精，毫秒级够用）
        assertEquals("gw;dur=0", ServerTimingFilter.formatGwDur(123_456L));
        assertEquals("gw;dur=7", ServerTimingFilter.formatGwDur(7_000_000L));
        assertEquals("gw;dur=1000", ServerTimingFilter.formatGwDur(1_000_000_000L));
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
        @Override public String transformUrl(String path) { return path; }
        @Override public void addUrlTransformer(Function<String, String> transformer) { /* no-op */ }
        @Override public boolean isNotModified() { return false; }
        @Override public boolean checkNotModified(java.time.Instant lastModified) { return false; }
        @Override public boolean checkNotModified(String etag) { return false; }
        @Override public boolean checkNotModified(String etag, java.time.Instant lastModified) { return false; }
        @Override public String getLogPrefix() { return "stub"; }
    }

    private static ServerWebExchange exchangeOverGet(String path) {
        return new StubExchange(MockServerHttpRequest.get(path).build());
    }

    @Test
    void beforeCommitAddsGwMetricWhenResponseCommits() {
        ServerTimingFilter filter = new ServerTimingFilter();
        ServerWebExchange exchange = exchangeOverGet("/api/version");
        GatewayFilterChain chain = ex -> ex.getResponse()
                .writeWith(Flux.<DataBuffer>empty())
                .then();

        filter.filter(exchange, chain).block();

        List<String> values = exchange.getResponse().getHeaders().get("Server-Timing");
        assertTrue(values != null && values.stream().anyMatch((v) -> GW_DUR.matcher(v).matches()),
                "commit 时应落 gw;dur=<整数毫秒>：" + values);
    }

    @Test
    void downstreamMeasurementSurvivesOurAdd() {
        ServerTimingFilter filter = new ServerTimingFilter();
        ServerWebExchange exchange = exchangeOverGet("/api/version");
        // 下游先写了一个 server-timing —— 我们的 gw 必须是 add（逗号拼接）而不是覆盖
        exchange.getResponse().getHeaders().set("Server-Timing", "up;dur=42");
        GatewayFilterChain chain = ex -> ex.getResponse()
                .writeWith(Flux.<DataBuffer>empty())
                .then();

        filter.filter(exchange, chain).block();

        List<String> values = exchange.getResponse().getHeaders().get("Server-Timing");
        assertTrue(values != null && values.contains("up;dur=42"),
                "下游的指标必须原样保留：" + values);
        assertTrue(values != null && values.stream().anyMatch((v) -> GW_DUR.matcher(v).matches()),
                "同时还得有我们的 gw 行：" + values);
    }

    @Test
    void orderIsAfterRequestIdAndBeforeCacheControl() {
        // after RequestId(−90)：429 快路径不计时；before Cache-Control(−50)
        assertEquals(-80, new ServerTimingFilter().getOrder());
    }
}
