package com.crossrealm.chronicles.game.telemetry;

import java.time.Instant;

/**
 * 一条遥测事件：玩家的一次行为（进副本 / 击杀 Boss / 读档……）。
 * detail 是自由文本（例如 bossId），由客户端自行约定取值。
 */
public record TelemetryEvent(long id, String type, String detail, String receivedAt) {

    public TelemetryEvent withId(long id) {
        return new TelemetryEvent(id, type, detail, receivedAt);
    }

    static TelemetryEvent of(long id, String type, String detail) {
        return new TelemetryEvent(id, type, detail, Instant.now().toString());
    }
}
