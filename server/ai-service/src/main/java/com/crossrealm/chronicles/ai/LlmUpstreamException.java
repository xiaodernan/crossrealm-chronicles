package com.crossrealm.chronicles.ai;

/** 上游失败。status=0 表示连接/超时（没有 HTTP 状态），retryable 决定是否值得再花一次钱。 */
public class LlmUpstreamException extends RuntimeException {

    private final int status;
    private final boolean retryable;

    public LlmUpstreamException(int status, boolean retryable, String message) {
        super(message);
        this.status = status;
        this.retryable = retryable;
    }

    public int status() { return status; }
    public boolean retryable() { return retryable; }
}
