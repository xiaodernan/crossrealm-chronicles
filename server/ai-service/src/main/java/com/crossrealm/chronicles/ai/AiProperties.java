package com.crossrealm.chronicles.ai;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 顾问服务的全部旋钮。
 *
 * <p>默认值写在这里，config-server 里那份是上线版本。**apiKey 是唯一的例外**：
 * 它只从 {@code LLM_API_KEY} 环境变量经 application.yml 的占位符进来，
 * 既不在配置中心，也不在代码里给一个"看起来能用"的默认值。
 */
@ConfigurationProperties("ai-service")
public class AiProperties {

    private String baseUrl = "https://wkapi.pro/v1";
    private String model = "gpt-6-sol";
    private String apiKey = "";
    private Duration timeout = Duration.ofSeconds(20);
    private int maxRetries = 2;
    private long retryBaseMs = 200;
    private int cacheTtlSeconds = 120;
    private int cacheMaxEntries = 256;
    private int maxQuestionChars = 400;
    private int maxTokens = 320;
    private int breakerThreshold = 4;
    private long breakerCooldownMs = 15_000;

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }

    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }

    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }

    public Duration getTimeout() { return timeout; }
    public void setTimeout(Duration timeout) { this.timeout = timeout; }

    public int getMaxRetries() { return maxRetries; }
    public void setMaxRetries(int maxRetries) { this.maxRetries = maxRetries; }

    public long getRetryBaseMs() { return retryBaseMs; }
    public void setRetryBaseMs(long retryBaseMs) { this.retryBaseMs = retryBaseMs; }

    public int getCacheTtlSeconds() { return cacheTtlSeconds; }
    public void setCacheTtlSeconds(int cacheTtlSeconds) { this.cacheTtlSeconds = cacheTtlSeconds; }

    public int getCacheMaxEntries() { return cacheMaxEntries; }
    public void setCacheMaxEntries(int cacheMaxEntries) { this.cacheMaxEntries = cacheMaxEntries; }

    public int getMaxQuestionChars() { return maxQuestionChars; }
    public void setMaxQuestionChars(int maxQuestionChars) { this.maxQuestionChars = maxQuestionChars; }

    public int getMaxTokens() { return maxTokens; }
    public void setMaxTokens(int maxTokens) { this.maxTokens = maxTokens; }

    public int getBreakerThreshold() { return breakerThreshold; }
    public void setBreakerThreshold(int breakerThreshold) { this.breakerThreshold = breakerThreshold; }

    public long getBreakerCooldownMs() { return breakerCooldownMs; }
    public void setBreakerCooldownMs(long breakerCooldownMs) { this.breakerCooldownMs = breakerCooldownMs; }
}
