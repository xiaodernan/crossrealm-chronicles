package com.crossrealm.chronicles.ai;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.stereotype.Component;

/**
 * JDK {@link HttpClient} 实现。
 *
 * <p>为什么不用 WebClient / RestTemplate / OkHttp：这一条链路只需要「一个 POST、
 * 一个超时、一个 bearer 头」，JDK 内置的客户端已经带连接池与 keep-alive，
 * 再引入一个 HTTP 栈只是多一层要跟着升级的东西。
 *
 * <p>计网上的三个取舍：① 一个**静态共享** client —— 每次请求 new 一个会丢掉连接池，
 * TLS 握手会变成每问一句话重做一次（最贵的那部分恰好在冷路径上）；
 * ② 显式 connectTimeout 与 per-request timeout —— 上游不响应时不能把 Servlet 线程挂住，
 * 网关后面还有玩家在等这一帧；③ 优先 HTTP/2（ALPN 协商，上游不支持时 JDK 自动回落 1.1）。
 */
@Component
public class HttpLlmTransport implements LlmTransport {

    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .version(HttpClient.Version.HTTP_2)
            .build();

    @Override
    public String postJson(String url, String bearerToken, String jsonBody, Duration timeout) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(timeout)
                .header("Authorization", "Bearer " + bearerToken)
                .header("Content-Type", "application/json; charset=UTF-8")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                .build();
        try {
            HttpResponse<String> response = CLIENT.send(request,
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            int status = response.statusCode();
            if (status / 100 != 2) {
                // 429 与 5xx 才值得重试；401/400 是请求本身的错，再试只是重复扣费
                boolean retryable = status == 429 || status >= 500;
                throw new LlmUpstreamException(status, retryable, "upstream status " + status);
            }
            return response.body();
        } catch (IOException e) {
            // 含 HttpTimeoutException：网络层没有 HTTP 状态，但值得重试
            throw new LlmUpstreamException(0, true, "upstream io");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LlmUpstreamException(0, false, "interrupted");
        }
    }
}
