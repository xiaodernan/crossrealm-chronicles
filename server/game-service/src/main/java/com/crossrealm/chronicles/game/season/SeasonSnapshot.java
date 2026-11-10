package com.crossrealm.chronicles.game.season;

import java.util.List;

/**
 * season-service 的**客户端视图**（W-X14）。
 *
 * 刻意不复用服务端的 `SeasonView`：两个服务之间靠 JSON 契约耦合，不靠共享 jar。
 * 这样 season-service 可以先升级字段，game-service 不会因为编译期依赖而被打断；
 * 反过来，客户端多认一个字段也只是"老服务端不返回它"而已。
 *
 * `available()` 用 id 是否为空来判 —— 降级时返回的那一份是 `unavailable()`，
 * 而不是 `null`：调用方（`OpsController`）不必写两层空判断，也不会把
 * "服务没部署"误当成"服务返回了空赛季"。
 */
public record SeasonSnapshot(
        String id,
        String name,
        String tagline,
        List<String> modifierIds,
        int soulsBonusPct,
        int dayInCycle,
        int daysRemaining) {

    public SeasonSnapshot {
        modifierIds = modifierIds == null ? List.of() : List.copyOf(modifierIds);
    }

    public boolean available() {
        return id != null && !id.isBlank();
    }

    /** 降级占位：字段全空，`available()` 为 false */
    public static SeasonSnapshot unavailable() {
        return new SeasonSnapshot("", "", "", List.of(), 0, 0, 0);
    }
}
