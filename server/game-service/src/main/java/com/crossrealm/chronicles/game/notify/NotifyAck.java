package com.crossrealm.chronicles.game.notify;

/**
 * 报讯回执（W-Z50）—— notification-service 的 POST /api/notify 响应体。
 *
 * <p>字段顺序刻意与发布端一致；缺字段由 Jackson 宽松映射（不做 strict），
 * 我们不读除 {@code stored/broadcast} 之外的字段。
 */
public record NotifyAck(String id, String kind, boolean stored, boolean broadcast) {

    /** 供 FallbackFactory 构造「降级回执」：连不上通知服务时也不抛异常。 */
    public static NotifyAck degraded() {
        return new NotifyAck(null, null, false, false);
    }
}
