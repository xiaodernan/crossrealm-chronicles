package com.crossrealm.chronicles.ai;

import java.time.Duration;

/**
 * 上游 HTTP 的唯一出口。抽成接口不是为了“面向接口编程”这句口号，
 * 而是让所有单测可以在零网络的前提下验证重试、熔断与缓存的口径 ——
 * CI 不该因为一个第三方 API 抖了一下就变红。
 */
public interface LlmTransport {

    String postJson(String url, String bearerToken, String jsonBody, Duration timeout);

    /**
     * 上游响应体 + 可选的用量快照。流式上游（SSE）由 transport 在此边界收拢为
     * <b>规范的 chat.completion JSON</b>：内容增量全部合并进 message.content，
     * usage 原样挂在根对象上 —— LlmClient 与其余链路完全不感知 SSE。
     *
     * @param promptTokens     上游报的输入 tokens（没报就 null）
     * @param completionTokens 上游报的输出 tokens（没报就 null）
     * @param cachedTokens     上游报的缓存命中 tokens（不同厂商字段名不同，没报就 null）
     */
    record UpstreamReply(String rawJson, Integer promptTokens, Integer completionTokens, Integer cachedTokens) {}

    /**
     * 默认实现：回退到 {@link #postJson} 并从响应里现问出 usage（平台支持的话）。
     * 旧的测试 Scripted transport 只实现 postJson —— 行为与从前完全一致。
     */
    default UpstreamReply postJsonWithUsage(String url, String bearerToken, String jsonBody, Duration timeout) {
        String raw = postJson(url, bearerToken, jsonBody, timeout);
        int u = raw == null ? -1 : raw.indexOf("\"usage\"");
        if (u < 0) return new UpstreamReply(raw, null, null, null);
        try {
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            var root = mapper.readTree(raw);
            var usage = root.path("usage");
            Integer prompt = usage.path("prompt_tokens").isNumber() ? usage.get("prompt_tokens").asInt() : null;
            Integer completion = usage.path("completion_tokens").isNumber() ? usage.get("completion_tokens").asInt() : null;
            var details = usage.path("prompt_tokens_details");
            if (details.isMissingNode()) details = usage.path("input_token_details");
            Integer cached = details.path("cached_tokens").isNumber() ? details.get("cached_tokens").asInt()
                    : (usage.path("cached_tokens").isNumber() ? usage.get("cached_tokens").asInt() : null);
            return new UpstreamReply(raw, prompt, completion, cached);
        } catch (Exception e) {
            return new UpstreamReply(raw, null, null, null);
        }
    }
}
