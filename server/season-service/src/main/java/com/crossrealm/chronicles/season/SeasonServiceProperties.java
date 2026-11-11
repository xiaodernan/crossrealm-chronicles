package com.crossrealm.chronicles.season;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 赛季服务的集中配置（config-server 的 `season-service.yml` 与本地默认值同一套）。
 *
 * `cycle-days` 是**唯一的旋钮**：改它等于改赛季长度，不需要动代码、不需要重启服务之外的任何东西。
 * `override` 是运维强制指定（留空 = 按周期轮转）。
 */
@ConfigurationProperties("season-service")
public class SeasonServiceProperties {

    /** 一个赛季持续多少天（默认两周） */
    private int cycleDays = 14;

    /** 强制指定当前赛季 id；留空表示按周期轮转 */
    private String override = "";

    /** 缓存项保留多少秒（默认 300 = 5 分钟；Redis 与 concurrent 两个分支同一旋钮） */
    private int cacheTtlSeconds = 300;

    public int getCacheTtlSeconds() {
        return cacheTtlSeconds;
    }

    public void setCacheTtlSeconds(int cacheTtlSeconds) {
        this.cacheTtlSeconds = cacheTtlSeconds;
    }

    public int getCycleDays() {
        return cycleDays;
    }

    public void setCycleDays(int cycleDays) {
        this.cycleDays = cycleDays;
    }

    public String getOverride() {
        return override;
    }

    public void setOverride(String override) {
        this.override = override;
    }
}
