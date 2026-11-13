package com.crossrealm.chronicles.presence;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 在场服务旋钮（W-Z-同游）。
 *
 * - ttlSeconds：游侠离线判定（键 TTL），默认 15s。
 * - maxWanderersPerChannel：单频道成员硬上限，防刷。
 * - backend：memory（默认，无 Redis 也健康）/ redis（docker 栈用，真正走 Pub/Sub 扇出）。
 */
@ConfigurationProperties(prefix = "presence")
public class PresenceProperties {

    private int ttlSeconds = 15;
    private int maxWanderersPerChannel = 500;
    private String backend = "memory";

    public int getTtlSeconds() {
        return ttlSeconds;
    }

    public void setTtlSeconds(int ttlSeconds) {
        this.ttlSeconds = ttlSeconds;
    }

    public int getMaxWanderersPerChannel() {
        return maxWanderersPerChannel;
    }

    public void setMaxWanderersPerChannel(int maxWanderersPerChannel) {
        this.maxWanderersPerChannel = maxWanderersPerChannel;
    }

    public String getBackend() {
        return backend;
    }

    public void setBackend(String backend) {
        this.backend = backend;
    }
}
