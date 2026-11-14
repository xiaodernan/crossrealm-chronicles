package com.crossrealm.chronicles.game.idem;

/**
 * 幂等台账中的一行：**响应体落盘不是 bug，是设计**——
 * 同一个 key + 同一个 payload 必须返回当年那一次的完全一样的回答，
 * 否则客户端重放后看到的不是「原来那次」的承诺（可能两次 total 不同、榜单中部变化等）。
 */
public record StoredResponse(String fingerprint, int status, String body, long expiresAtMs) {

    public StoredResponse(String fingerprint, int status, String body, long nowMs, long ttlMs) {
        this(fingerprint, status, body, nowMs + ttlMs);
    }

    public boolean expired(long nowMs) {
        return nowMs >= expiresAtMs;
    }
}
