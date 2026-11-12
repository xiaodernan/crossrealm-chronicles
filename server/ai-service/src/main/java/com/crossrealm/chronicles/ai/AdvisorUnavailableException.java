package com.crossrealm.chronicles.ai;

/**
 * 顾问不可用（未配置密钥 / 熔断打开 / 上游重试耗尽）。
 *
 * <p>只带一个**稳定的机器码**，不带上游原始响应：上游 5xx 的 body 里可能混着我们
 * 发出去的请求片段，把它回显给浏览器等于开了一条信息泄漏的缝。
 */
public class AdvisorUnavailableException extends RuntimeException {

    private final String reason;

    public AdvisorUnavailableException(String reason) {
        super(reason);
        this.reason = reason;
    }

    public String getReason() { return reason; }
}
