package com.crossrealm.chronicles.gateway;

import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * W-P8：{@code X-Request-Id} 关联 ID —— 每次调用进得来、出得去都带着同一个 id。
 *
 * <h3>为什么值得做</h3>
 * 排障时最痛的不是"500 了"，而是"**哪一次** 500 了"。没有关联 id 时，玩家丢来一条报错，
 * 运维只能靠时间窗去捞日志；有了它，一次调用从网关到游戏服务全链路只有一个名字，
 * 复现一此就能定位到这一次请求的下游慢在哪、熔断没、还是限了流。
 *
 * <h3>口径</h3>
 * <ul>
 *   <li>入站带了合法的 {@code X-Request-Id}（1–64 个可见 ASCII，不含空白/逗号）→
 *       <b>原样透传</b>——调用方自己的 id 有意义（它生成的 UUID 要和自己的日志对上）；</li>
 *   <li>入站没带 / 不合法 → 网关生成一个 UUID 写进行/出行两边；</li>
 *   <li><b>出行侧无条件钉住</b>（beforeCommit 覆盖下游可能写的同名头）：网关是调用方唯一
 *       看得见的闸门，id 必须在这扇门上落章；</li>
 *   <li>不打日志——仓里没有结构化日志层，id 是**契约**不是日志：契约靠这里、靠测试，
 *       日志归后面哪一片去补。</li>
 * </ul>
 *
 * <p>顺位 −90：在限流（−100）之后——被 429 拒掉的请求不需要配 id；
 * 在 Cache-Control（−50）之前——响应头提交前这扇门要先落 id。</p>
 */
@Component
public class RequestIdFilter implements GlobalFilter, Ordered {

    public static final String HEADER = "X-Request-Id";

    /** 1–64 个可见 ASCII，排除逗号/分号/空白 —— header 回显与参数表都不该吃这些 */
    private static final Pattern SAFE = Pattern.compile("^[^\\s,;\\u0000-\\u001F\\u007F-\\uFFFF]{1,64}$");

    /** 净化入站 id：合法原样回；不合法回 {@code null}（语义：请生成新的） */
    public static String sanitizeInbound(String raw) {
        if (raw == null) {
            return null;
        }
        String v = raw.trim();
        return SAFE.matcher(v).matches() ? v : null;
    }

    /** 决定这次调用用哪个 id：合法入站用它，否则生成 UUID（每次调用独立） */
    public static String selectRequestId(String raw) {
        String clean = sanitizeInbound(raw);
        return clean != null ? clean : UUID.randomUUID().toString();
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String id = selectRequestId(exchange.getRequest().getHeaders().getFirst(HEADER));
        ServerHttpRequest mutated = exchange.getRequest().mutate()
                .headers(h -> h.set(HEADER, id))
                .build();
        // 出行侧：无条件钉住（下游写了同名头也覆盖）——见类头注释
        exchange.getResponse().beforeCommit(() -> {
            exchange.getResponse().getHeaders().set(HEADER, id);
            return Mono.empty();
        });
        return chain.filter(exchange.mutate().request(mutated).build());
    }

    @Override
    public int getOrder() {
        return -90;
    }
}
