package com.crossrealm.chronicles.gateway;

import java.util.concurrent.TimeUnit;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * W-P9：{@code Server-Timing: gw;dur=<ms>} —— 每次调用都带一个服务端侧耗时读数。
 *
 * <h3>为什么</h3>
 * 玩家端/排查时最缺的一环往往是"**网关自己花了多少**"：客户端用了 curl 拿到的
 * {@code time_total} 里，哪些是网关路由、哪些是下游，凭经验猜极易误判。
 * Server-Timing 是 RFC 7231/9218 的标准答案：服务器把耗时写进响应头，
 * 浏览器 DevTools 的 Network 面板直接画出来，curl 一句 {@code -w} 也能拆开。
 * 这里只发网关这一个口径（下游自己若再发一个同名头，RFC 允许多个值逗号拼接，
 * 所以用 {@code add} 而非 {@code set}——下游的数不被我们覆盖）。
 *
 * <h3>口径</h3>
 * <ul>
 *   <li>顺位 −80：限流 −100 之后（被拒的 429 快路径不计时；若要看 429 的耗时也很小）；
 *       在 Cache-Control −50 之前——提交前就把 header 落定。</li>
 *   <li>计时区间 = 本过滤器入口 → 响应提交前（beforeCommit）。对下游耗时的量含于此。</li>
 *   <li>单位毫秒、整数毫秒（不足 1ms 向下显示为 0——这一格在毫秒级意义不大，求真不必求精）。</li>
 *   <li>数值只增不减——一旦观测，就无法回收，所以它不是性能门禁的依据；
 *       它只是**排障信号**。</li>
 * </ul>
 */
@Component
public class ServerTimingFilter implements GlobalFilter, Ordered {

    public static final String HEADER = "Server-Timing";
    public static final String METRIC = "gw";

    /** 生成一条符合 RFC 语法的 metric：`gw;dur=123`（整数毫秒） */
    public static String formatGwDur(long durationNanos) {
        return METRIC + ";dur=" + TimeUnit.NANOSECONDS.toMillis(durationNanos);
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        long start = System.nanoTime();
        ServerHttpResponse response = exchange.getResponse();
        response.beforeCommit(() -> {
            long dur = System.nanoTime() - start;
            response.getHeaders().add(HEADER, formatGwDur(dur));
            return Mono.empty();
        });
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        return -80;
    }
}
