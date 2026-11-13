package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
 * <p>为什么不用来 WebClient / RestTemplate / OkHttp：这一条链路只需要「一个 POST、
 * 一个超时、一个 bearer 头」，JDK 内置的客户端已经带连接池 keep-alive，
 * 再引入一个 HTTP 栈只是多一层要跟着升级的东西。
 *
 * <p>计网上的三个取舍：① 一个<b>静态共享</b> client —— 每次请求 new 一个会丢掉连接池，
 * TLS 握手会变成每问一句话重做一次（最贵的那部分恰好在冷路径上）；
 * ② 显式 connectTimeout + per-request timeout —— 上游不响应时不能让 Servlet 线程挂住，
 * 网关后面还有玩家在等这一帧；③ 优先 HTTP/2（ALPN 协商，上游不支持时 JDK 自动回落 1.1）。
 *
 * <p><b>流式口径（W-Z11）</b>：上游请求始终带 {@code stream:true} + {@code stream_options.include_usage}。
 * 若上游回 SSE（{@code data:} 开头），本类在<b>传输边界</b>把整段增量合并为一份规范的
 * {@code chat.completion} JSON（内容拼进 message.content，usage 原样挂到根对象）；
 * 下游 LlmClient / 熔断器 / 缓存完全不感知 SSE。若上游忽略 stream 标记直接回普通 JSON，
 * 原样透传。这样既满足「wkapi 控制台只显示流式调用」的调度口径，又不让解析逻辑扩散到链路各处。
 */
@Component
public class HttpLlmTransport implements LlmTransport {

    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .version(HttpClient.Version.HTTP_2)
            .build();

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String postJson(String url, String bearerToken, String jsonBody, Duration timeout) {
        return postJsonWithUsage(url, bearerToken, jsonBody, timeout).rawJson();
    }

    @Override
    public UpstreamReply postJsonWithUsage(String url, String bearerToken, String jsonBody, Duration timeout) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(timeout)
                .header("Authorization", "Bearer " + bearerToken)
                .header("Content-Type", "application/json; charset=UTF-8")
                .header("Accept", "application/json, text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                .build();
        try {
            HttpResponse<String> response = CLIENT.send(request,
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            int status = response.statusCode();
            if (status / 100 != 2) {
                // 429 或 5xx 才值得重试；401/400 是请求本身的错，再试只是重复扣费
                boolean retryable = status == 429 || status >= 500;
                throw new LlmUpstreamException(status, retryable, "upstream status " + status);
            }
            String body = response.body();
            if (isSse(body)) {
                return drainSse(body);
            }
            // 上游忽略 stream 标记 → 普通 JSON：原样返回，usage 现问出来
            Integer prompt = null, completion = null, cached = null;
            try {
                JsonNode usage = MAPPER.readTree(body).path("usage");
                prompt = usage.path("prompt_tokens").isNumber() ? usage.get("prompt_tokens").asInt() : null;
                completion = usage.path("completion_tokens").isNumber() ? usage.get("completion_tokens").asInt() : null;
                JsonNode details = usage.path("prompt_tokens_details");
                if (details.isMissingNode()) details = usage.path("input_token_details");
                cached = details.path("cached_tokens").isNumber() ? details.get("cached_tokens").asInt()
                        : (usage.path("cached_tokens").isNumber() ? usage.get("cached_tokens").asInt() : null);
            } catch (Exception ignored) {
                // usage 字段坏了不影响主链路：回答仍然有效
            }
            return new UpstreamReply(body, prompt, completion, cached);
        } catch (IOException e) {
            // 含 HttpTimeoutException：网络层没有 HTTP 状态，但值得重试
            throw new LlmUpstreamException(0, true, "upstream io");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LlmUpstreamException(0, false, "interrupted");
        }
    }

    /** 判断响应体是不是 SSE（data: 开头的行即 SSE；前面容忍空行/空格）。 */
    static boolean isSse(String body) {
        if (body == null || body.isBlank()) return false;
        for (String line : body.split("\n", 8)) {
            String t = line.trim();
            if (t.isEmpty()) continue;
            return t.startsWith("data:");
        }
        return false;
    }

    /**
     * 把 SSE 正文合并为规范的 chat.completion JSON。公开为包内静态，便于零网络单测。
     * 解析不到任何内容增量时抛 LlmUpstreamException(200,false,"empty answer") —— 与旧口径一致：不重试、不当成功。
     */
    static UpstreamReply drainSse(String sse) {
        StringBuilder content = new StringBuilder();
        String finishReason = null;
        Integer prompt = null, completion = null, cached = null;

        for (String rawLine : sse.split("\n")) {
            String line = rawLine.trim();
            if (line.isEmpty() || !line.startsWith("data:")) continue;
            String data = line.substring("data:".length()).trim();
            if (data.equals("[DONE]")) continue;
            try {
                JsonNode node = MAPPER.readTree(data);
                JsonNode delta = node.path("choices").path(0).path("delta");
                String piece = delta.path("content").asText("");
                if (!piece.isEmpty()) content.append(piece);
                if (delta.path("finish_reason").isTextual()) finishReason = delta.get("finish_reason").asText();
                JsonNode usage = node.path("usage");
                if (usage.isObject()) {
                    prompt = usage.path("prompt_tokens").isNumber() ? usage.get("prompt_tokens").asInt() : prompt;
                    completion = usage.path("completion_tokens").isNumber() ? usage.get("completion_tokens").asInt() : completion;
                    JsonNode details = usage.path("prompt_tokens_details");
                    if (details.isMissingNode()) details = usage.path("input_token_details");
                    Integer c = details.path("cached_tokens").isNumber() ? details.get("cached_tokens").asInt()
                            : (usage.path("cached_tokens").isNumber() ? usage.get("cached_tokens").asInt() : null);
                    if (c != null) cached = c;
                }
            } catch (Exception ignored) {
                // 单行坏 JSON 跳过，不带走整批（与 QA 脚本宽容度一致）
            }
        }
        if (content.isEmpty()) {
            throw new LlmUpstreamException(200, false, "empty answer");
        }

        ObjectNode root = MAPPER.createObjectNode();
        root.put("object", "chat.completion");
        ArrayNode choices = root.putArray("choices");
        ObjectNode choice = choices.addObject();
        choice.put("index", 0);
        ObjectNode message = choice.putObject("message");
        message.put("role", "assistant");
        message.put("content", content.toString());
        choice.put("finish_reason", finishReason != null ? finishReason : "stop");
        if (prompt != null || completion != null || cached != null) {
            ObjectNode usage = root.putObject("usage");
            if (prompt != null) usage.put("prompt_tokens", prompt);
            if (completion != null) usage.put("completion_tokens", completion);
            if (cached != null) {
                usage.putObject("prompt_tokens_details").put("cached_tokens", cached);
                usage.put("cached_tokens", cached);
            }
        }
        try {
            return new UpstreamReply(MAPPER.writeValueAsString(root), prompt, completion, cached);
        } catch (Exception e) {
            throw new IllegalStateException("cannot normalize sse payload", e);
        }
    }
}
