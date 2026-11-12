package com.crossrealm.chronicles.ai;

import java.time.Duration;

/**
 * 上游 HTTP 的**唯一出口**。抽成接口不是为了"面向接口编程"这句口号，
 * 而是让所有单测可以在零网络的前提下验证重试、熔断与缓存的口径 ——
 * CI 不该因为一个第三方 API 抖了一下就变红。
 */
public interface LlmTransport {

    String postJson(String url, String bearerToken, String jsonBody, Duration timeout);
}
