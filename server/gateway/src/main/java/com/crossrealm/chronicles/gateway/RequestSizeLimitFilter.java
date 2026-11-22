package com.crossrealm.chronicles.gateway;

import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * 请求体大小闸门（用户「瞬间大数据量冲击」的直接落点）。
 *
 * <h3>为什么放在网关</h3>
 * 五个业务服务都是 Spring MVC（Tomcat + Jackson）。JSON body 在进入 controller 之前
 * 就已经被完整读进内存并解析——`@Size` 校验发生在**解析之后**，挡不住「解析本身」的
 * CPU/内存开销。一个 100 MB 的 JSON 足以让单个实例的堆抖一下。正确的位置是入口：
 * 看 {@code Content-Length} 就拒绝，不让它进业务服务。
 *
 * <h3>口径</h3>
 * <ul>
 *   <li>只拦<b>已知且超限</b>的 {@code Content-Length}；缺失/未知（{@code -1}，
 *       chunked 传输）放行——预判不了就不该误伤正常长连接上传；</li>
 *   <li>恰好等于上限放行（{@code >} 不是 {@code >=}）——上限是「允许的最大值」；</li>
 *   <li>拒绝时回 {@code 413} + JSON，语义比 500 准确，也不会污染 5xx 错误率指标；</li>
 *   <li>顺位 −95：在限流（−100）之后——被 429 的请求不必再算大小；
 *       在 RequestId（−90）之前——被 413 的请求不配关联 id。</li>
 * </ul>
 *
 * <p>阈值 {@code gateway.max-request-bytes}，默认 1 MiB：业务请求都带 {@code @Size}
 * 上限（最大的是 Oracle 提问 400 字），1 MiB 对正常流量是宽松的天花板。
 */
@Component
public class RequestSizeLimitFilter implements GlobalFilter, Ordered {

    private static final int ORDER = -95;
    private static final long DEFAULT_MAX_BYTES = 1024L * 1024L;

    private final long maxBytes;

    public RequestSizeLimitFilter(@Value("${gateway.max-request-bytes:" + DEFAULT_MAX_BYTES + "}") long maxBytes) {
        this.maxBytes = maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        long declared = request.getHeaders().getContentLength();
        if (declared > maxBytes) {
            String body = "{\"error\":\"payload-too-large\",\"maxBytes\":" + maxBytes + "}";
            ServerHttpResponse response = exchange.getResponse();
            response.setStatusCode(HttpStatus.PAYLOAD_TOO_LARGE);
            response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            response.getHeaders().setContentLength(bytes.length);
            return response.writeWith(Mono.just(response.bufferFactory().wrap(bytes)));
        }
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        return ORDER;
    }

    /** 测试/诊断用 */
    long maxBytes() {
        return maxBytes;
    }
}
