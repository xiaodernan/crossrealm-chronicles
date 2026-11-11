package com.crossrealm.chronicles.gateway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Field;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.context.ApplicationContext;
import org.springframework.context.i18n.LocaleContext;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpResponse;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.http.codec.multipart.Part;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebSession;
import reactor.core.publisher.Mono;

/**
 * W-P3 限流器内存上限的单元测试：
 * ① LRU 淘汰——超过 4096 条不同 IP 后最久未用的被踢；
 * ② 主动 purge——deque 里最新一条都过期了的键整体删除，避免"IP 来过一次就永远挂着一个 key"。
 *
 * <p>构造一个极简的 {@link ServerWebExchange} 桩——不依赖 spring-test-webflux（仓里没有）。
 * 顺带也证明了这个过滤器除了它自己那一格窗口外对 exchange 一无所求。
 */
class RateLimitByIpFilterTest {

    private RateLimitByIpFilter newFilter() {
        return new RateLimitByIpFilter();
    }

    private static GatewayFilterChain chainThatCounts(int[] counter) {
        return new GatewayFilterChain() {
            @Override
            public Mono<Void> filter(ServerWebExchange exchange) {
                counter[0]++;
                return Mono.empty();
            }
        };
    }

    private static MockServerHttpRequest requestWithIp(String ip) {
        return MockServerHttpRequest.get("/api/whatever")
                .header("X-Forwarded-For", ip)
                .build();
    }

    /** 最小桩：只实现接口上的抽象方法，全能。 */
    private static final class StubExchange implements ServerWebExchange {
        private final ServerHttpRequest request;
        private final ServerHttpResponse response = new MockServerHttpResponse();
        private final Map<String, Object> attributes = new HashMap<>();

        StubExchange(ServerHttpRequest request) {
            this.request = request;
        }

        @Override
        public ServerHttpRequest getRequest() {
            return request;
        }

        @Override
        public ServerHttpResponse getResponse() {
            return response;
        }

        @Override
        public Map<String, Object> getAttributes() {
            return attributes;
        }

        @Override
        public Mono<WebSession> getSession() {
            return Mono.empty();
        }

        @Override
        public <T extends java.security.Principal> Mono<T> getPrincipal() {
            return Mono.empty();
        }

        @Override
        public Mono<MultiValueMap<String, String>> getFormData() {
            return Mono.empty();
        }

        @Override
        public Mono<MultiValueMap<String, Part>> getMultipartData() {
            return Mono.empty();
        }

        @Override
        public LocaleContext getLocaleContext() {
            return new LocaleContext() {
                @Override
                public Locale getLocale() {
                    return Locale.ROOT;
                }
            };
        }

        @Override
        public ApplicationContext getApplicationContext() {
            return org.mockito.Mockito.mock(ApplicationContext.class);
        }

        @Override
        public boolean isNotModified() {
            return false;
        }

        @Override
        public boolean checkNotModified(java.time.Instant lastModified) {
            return false;
        }

        @Override
        public boolean checkNotModified(String etag) {
            return false;
        }

        @Override
        public boolean checkNotModified(String etag, java.time.Instant lastModified) {
            return false;
        }

        @Override
        public String transformUrl(String path) {
            return path;
        }

        @Override
        public void addUrlTransformer(Function<String, String> transformer) {
            // no-op
        }

        @Override
        public String getLogPrefix() {
            return "stub";
        }
    }

    private static ServerWebExchange exchangeWithIp(String ip) {
        return new StubExchange(requestWithIp(ip));
    }

    @Test
    void lruEvictsOldestWhenMapExceedsCap() {
        RateLimitByIpFilter filter = newFilter();
        int[] passThrough = {0};
        GatewayFilterChain chain = chainThatCounts(passThrough);

        for (int i = 1; i <= RateLimitByIpFilter.MAX_TRACKED_IPS + 1; i++) {
            String ip = "10." + (i / 256) + "." + (i % 256) + ".1";
            filter.filter(exchangeWithIp(ip), chain).block();
        }

        assertEquals(RateLimitByIpFilter.MAX_TRACKED_IPS, filter.trackedIpCount(),
                "LRU 上限生效后不应该超过 4096 条");
        Map<String, Integer> snapshot = filter.snapshotWindowSizes();
        assertFalse(snapshot.containsKey("10.0.0.1"), "最久未用的那条应已被 LRU 踢出");
        assertTrue(snapshot.containsKey("10.16.1.1"), "走到第 4097 次时最新插入的那一条还在 LRU 头上");
    }

    @Test
    void sweepRemovesStaleWindowsButKeepsFresh() {
        RateLimitByIpFilter filter = newFilter();
        int[] passThrough = {0};
        GatewayFilterChain chain = chainThatCounts(passThrough);

        filter.filter(exchangeWithIp("1.2.3.4"), chain).block();

        // 塞一笔 60 秒前的旧时间条——purge 必须把它整个窗口删掉
        Field f;
        try {
            f = RateLimitByIpFilter.class.getDeclaredField("windows");
            f.setAccessible(true);
            @SuppressWarnings("unchecked")
            Map<String, Deque<Long>> w = (Map<String, Deque<Long>>) f.get(filter);
            Deque<Long> stale = new ArrayDeque<>();
            stale.add(System.currentTimeMillis() - 60_000L);
            stale.add(System.currentTimeMillis() - 58_000L);
            w.put("9.8.7.6", stale);

            assertTrue(filter.snapshotWindowSizes().containsKey("9.8.7.6"), "前置条件：旧条目确实在 map 里");
            filter.sweepForTest();
            assertFalse(filter.snapshotWindowSizes().containsKey("9.8.7.6"), "60 秒前的整条窗口应该被 purge 掉");
            assertTrue(filter.snapshotWindowSizes().containsKey("1.2.3.4"), "新近窗口不应被误伤");
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("测试用反射拿 windows 失败", e);
        }
    }

    @Test
    void recentlyUsedEntriesAreNotDroppedBySweep() {
        RateLimitByIpFilter filter = newFilter();
        int[] passThrough = {0};
        GatewayFilterChain chain = chainThatCounts(passThrough);

        filter.filter(exchangeWithIp("7.7.7.7"), chain).block();
        Field f;
        try {
            f = RateLimitByIpFilter.class.getDeclaredField("windows");
            f.setAccessible(true);
            @SuppressWarnings("unchecked")
            Map<String, Deque<Long>> w = (Map<String, Deque<Long>>) f.get(filter);
            w.clear();
            Deque<Long> freshish = new ArrayDeque<>();
            freshish.add(System.currentTimeMillis() - 5_000L);   // 5 秒前，还在窗口里
            freshish.add(System.currentTimeMillis() - 1_000L);
            w.put("8.8.8.8", freshish);

            filter.sweepForTest();
            assertTrue(filter.snapshotWindowSizes().containsKey("8.8.8.8"),
                    "窗口里最新一条还在 10 秒内，不能被 purge");
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("测试用反射拿 windows 失败", e);
        }
    }
}
