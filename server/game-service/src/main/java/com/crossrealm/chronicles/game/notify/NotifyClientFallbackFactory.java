package com.crossrealm.chronicles.game.notify;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

/**
 * NotifyClient 的降级工厂（W-Z50）。
 *
 * <p>降级 = 静默丢弃 + WARN 日志（不带玩家数据，只带原因类名）。
 * 上报世界事件永远不阻塞玩家的 telemetry 响应——
 * 「这件事没能写进报讯台」比「玩家等了 2 秒」严重得多。
 */
@Component
public class NotifyClientFallbackFactory implements FallbackFactory<NotifyClient> {

    private static final Logger LOG = LoggerFactory.getLogger(NotifyClientFallbackFactory.class);

    @Override
    public NotifyClient create(Throwable cause) {
        LOG.warn("notification-service 不可达，本次世界事件报讯已丢弃（cause={}）",
                cause == null ? "unknown" : cause.getClass().getSimpleName());
        return event -> NotifyAck.degraded();
    }
}
