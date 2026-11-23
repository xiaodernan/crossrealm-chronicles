package com.crossrealm.chronicles.ai;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
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

    private String baseUrl = "https://api.aizzz.xyz/v1";
    private String model = "gpt-6.2-sol";
    private String apiKey = "";
    private Duration timeout = Duration.ofSeconds(20);
    private int maxRetries = 2;
    private long retryBaseMs = 200;
    private int cacheTtlSeconds = 120;
    private int cacheMaxEntries = 256;
    private int maxQuestionChars = 400;
    private int maxTokens = 320;
    /** 输出预算按车道收敛；未知车道沿用 maxTokens，配置缺项仍有安全默认。 */
    private Map<String, Integer> laneMaxTokens = defaultLaneMaxTokens();
    private int breakerThreshold = 4;
    private long breakerCooldownMs = 15_000;
    /** W-Z490：是否给「大前缀」车道（v4≈4.7万 tok 的 oracle/arbiter、v5≈8.3万 tok 的 oracle-deep）
     *  做启动热身。默认 false —— 每次开机都铺这几页会烧掉十几万 token，且深潜是低频功能，
     *  首问冷一次、第二问即热（实测 warm 88.8%）远比开机常暖划算。廉价车道（v3≈5K）不受影响。 */
    private boolean warmupDeepLanes = false;

    /**
     * LLM 总开关（W-Z519）：API 因成本/用量关闭后置 false —— 上游一个字节都不打，
     * 所有车道统一走 AdvisorUnavailableException → AiErrors 503 → 前端确定性降级。
     * 密钥保留在配置里不删：开关一开即恢复，不必重新填 key。
     */
    private boolean llmEnabled = true;

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

    public Map<String, Integer> getLaneMaxTokens() { return laneMaxTokens; }
    public void setLaneMaxTokens(Map<String, Integer> laneMaxTokens) {
        this.laneMaxTokens = new LinkedHashMap<>(laneMaxTokens);
    }

    public int maxTokensFor(String cacheKey) {
        int budget = laneMaxTokens.getOrDefault(cacheKey, maxTokens);
        if (budget <= 0) throw new IllegalStateException("invalid llm token budget for " + cacheKey);
        return budget;
    }

    private static Map<String, Integer> defaultLaneMaxTokens() {
        Map<String, Integer> budgets = new LinkedHashMap<>();
        budgets.put(LlmClient.CacheKeys.ADVISOR, 320);
        budgets.put(LlmClient.CacheKeys.EMBER, 96);
        budgets.put(LlmClient.CacheKeys.KINDLE_LETTER, 96);
        budgets.put(LlmClient.CacheKeys.BOSSVERSE, 96);
        budgets.put(LlmClient.CacheKeys.ECHO, 96);
        budgets.put(LlmClient.CacheKeys.GUIDE, 192);
        budgets.put(LlmClient.CacheKeys.ARBITER, 384);
        budgets.put(LlmClient.CacheKeys.ORACLE, 512);
        budgets.put(LlmClient.CacheKeys.ORACLE_DEEP, 768);
        budgets.put(LlmClient.CacheKeys.FORTUNE_PATH, 160);
        budgets.put(LlmClient.CacheKeys.VIGIL_VOW, 160);
        budgets.put(LlmClient.CacheKeys.DEATH_EPITAPH, 64);
        budgets.put(LlmClient.CacheKeys.CHAPTER_CODA, 96);
        return budgets;
    }

    public int getBreakerThreshold() { return breakerThreshold; }
    public void setBreakerThreshold(int breakerThreshold) { this.breakerThreshold = breakerThreshold; }

    public long getBreakerCooldownMs() { return breakerCooldownMs; }
    public void setBreakerCooldownMs(long breakerCooldownMs) { this.breakerCooldownMs = breakerCooldownMs; }

    public boolean isWarmupDeepLanes() { return warmupDeepLanes; }
    public void setWarmupDeepLanes(boolean warmupDeepLanes) { this.warmupDeepLanes = warmupDeepLanes; }

    public boolean isLlmEnabled() { return llmEnabled; }
    public void setLlmEnabled(boolean llmEnabled) { this.llmEnabled = llmEnabled; }
}
