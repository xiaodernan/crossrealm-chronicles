package com.crossrealm.chronicles.gateway;

import java.net.URI;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * W-P2：按路径给 <b>GET</b> 响应加 {@code Cache-Control}。
 *
 * <h3>为什么做这个</h3>
 *
 * 玩家端（浏览器/webview）在短时间内会被限制请求频率，但 HTTP 语义本身就有一套
 * 更有效的工具——<b>让中间缓存/浏览器替服务端挡住重复请求</b>。在没有任何响应头的
 * 形状下，浏览器默认不会把这些响应共享缓存，任何 CDN/代理也纹丝不动，
 * 所有 GET 都打到网关。
 *
 * <h3>口径</h3>
 *
 * <ul>
 *   <li>只对 GET/HEAD 生效；其它方法直接透传（POST 的响应绝不进共享缓存）；</li>
 *   <li>{@code /api/ops/**} → {@code no-store}：复合健康视图是运维专用的、不应缓存；</li>
 *   <li>其余三种只给 <b>读确定性内容</b>的端点放宽缓存，各配一个合理 max-age；</li>
 *   <li>错误响应（状态 ≥ 400）一律 {@code no-store}：避免 4xx/5xx 被共享缓存
 *       交给后续用户，造成"明明是偶发故障却持续 503"的错觉；</li>
 *   <li>只给确实没有 {@code Cache-Control} 的响应写头——如果下游自己已经声明，
 *       尊重下游自己的判断（与 AddResponseHeader 的 append/set 口径不同，
 *       这里刻意是"缺位才补"）；</li>
 *   <li>HOOK 挂在 {@code beforeCommit}：响应提交前最后的机会改 header，
 *       不会出现"header 已随 body 冲出去后又改"的毛病。</li>
 * </ul>
 */
@Component
public class CacheControlByPathFilter implements GlobalFilter, Ordered {

    static final String NO_STORE = "no-store";

    /** 找错的话直接返回 null = 这一条不动它 */
    public static String cacheControlFor(String method, String rawPath) {
        if (method == null || rawPath == null) {
            return null;
        }
        String m = method.toUpperCase();
        if (!m.equals("GET") && !m.equals("HEAD")) {
            return null;
        }
        String path = stripQuery(rawPath);
        // 运维专用——绝不缓存、绝不被共享缓存
        if (path.equals("/api/ops") || path.startsWith("/api/ops/") || path.startsWith("/api/ops-")) {
            return NO_STORE;
        }
        // 版本/健康——每 60 秒才需要新答案
        if (path.startsWith("/api/version")) {
            return "public, max-age=60";
        }
        // 纯只读的当前赛季——一幅"本周/本周期"的快照，容忍最多 5 分钟的陈旧
        if (path.startsWith("/api/seasons/active")) {
            return "public, max-age=300, stale-while-revalidate=60";
        }
        // 榜读——写后立即失效由后端保证（写路径清缓存），读可以短暂命中浏览器
        if (path.equals("/api/leaderboard")) {
            return "public, max-age=15";
        }
        // 试炼排行榜——只读而频繁轮询，给最短的公
        if (path.startsWith("/api/trials/leaderboard")) {
            return "public, max-age=10";
        }
        return null;
    }

    private static String stripQuery(String raw) {
        int q = raw.indexOf('?');
        return q >= 0 ? raw.substring(0, q) : raw;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpResponse response = exchange.getResponse();
        String method = exchange.getRequest().getMethod().name();
        URI uri = exchange.getRequest().getURI();
        String rawPath = uri.getRawPath();
        String cc = cacheControlFor(method, rawPath);
        String path = stripQuery(rawPath);
        boolean isOps = path.equals("/api/ops") || path.startsWith("/api/ops/");

        if (cc == null && !isOps) {
            // 普通业务路径，交给下游自己的响应头（如果有）
            return chain.filter(exchange);
        }

        response.beforeCommit(() -> {
            HttpHeaders headers = response.getHeaders();
            if (headers.containsKey(HttpHeaders.CACHE_CONTROL)) {
                // 下游已经表态了——别覆盖
                return Mono.empty();
            }
            HttpStatusCode statusCode = response.getStatusCode();
            boolean error = statusCode != null && statusCode.value() >= 400;
            String finalValue = error ? NO_STORE : (cc != null ? cc : NO_STORE);
            headers.set(HttpHeaders.CACHE_CONTROL, finalValue);
            return Mono.empty();
        });
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        return -50;
    }
}
