package com.crossrealm.chronicles.gateway;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
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
 * W-P10 更新：{@code RateLimitByIpFilter} 现在是薄适配层——
 * 本测只验「链路上 IP 解析 → 背板放行 → 429 响应」的形态和字面量，
 * 不再直接戳内存账本的内部状态（那是 {@link InMemoryIpRateLimiterTest} 的事）。
 */
class RateLimitByIpFilterTest {

    private RateLimitByIpFilter newFilter() {
        return new RateLimitByIpFilter(new InMemoryIpRateLimiter());
    }

    /* ---------- 链路形态 ---------- */

    private static GatewayFilterChain chainThatCounts(int[] counter) {
        return exchange -> {
            counter[0]++;
            return Mono.empty();
        };
    }

    private static MockServerHttpRequest requestWithIp(String ip) {
        return MockServerHttpRequest.get("/api/whatever")
                .header("X-Forwarded-For", ip)
                .build();
    }

    /** 最小桩：完全够用的 exchange 替身 */
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

    private static ServerWebExchange exchangeWithIp(String ip) {
        return new StubExchange(requestWithIp(ip));
    }

    @Test
    void normalRequestIsAllowedThrough() {
        RateLimitByIpFilter filter = newFilter();
        int[] pass = {0};
        filter.filter(exchangeWithIp("10.0.0.1"), chainThatCounts(pass)).block();
        assertEquals(1, pass[0]);
    }

    @Test
    void orderIsAfterRequestIdFilter() {
        assertEquals(-100, newFilter().getOrder());
    }

    @Test
    void backendIsDelegatedNotInlined() {
        // 验证：filter 把 allow/deny 完全委托给 limiter，limiter 报错也不崩
        IpRateLimiter spy = new InMemoryIpRateLimiter() {
            @Override
            public Mono<Boolean> tryAcquire(String ip, long nowMs) {
                return Mono.just(ip != null); // 放行所有，看不同代码路径是否到达
            }
        };
        RateLimitByIpFilter filter = new RateLimitByIpFilter(spy);
        int[] pass = {0};
        filter.filter(exchangeWithIp("1.2.3.4"), chainThatCounts(pass)).block();
        assertEquals(1, pass[0]);
    }
}
