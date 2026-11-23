package com.crossrealm.chronicles.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 跨实例合流旋钮；默认仍只使用进程内 single-flight。 */
@ConfigurationProperties("ai-service.flight")
public class LlmFlightProperties {

    private String backend = "in-memory";
    private long pollMs = 50;
    private long terminalTtlMs = 5_000;

    public String getBackend() { return backend; }
    public void setBackend(String backend) { this.backend = backend; }
    public long getPollMs() { return pollMs; }
    public void setPollMs(long pollMs) { this.pollMs = pollMs; }
    public long getTerminalTtlMs() { return terminalTtlMs; }
    public void setTerminalTtlMs(long terminalTtlMs) { this.terminalTtlMs = terminalTtlMs; }
}
