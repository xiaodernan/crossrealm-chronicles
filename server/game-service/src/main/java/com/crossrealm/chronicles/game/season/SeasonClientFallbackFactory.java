package com.crossrealm.chronicles.game.season;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

/**
 * season-service 的降级工厂（W-X14）。
 *
 * 降级返回 `SeasonSnapshot.unavailable()`：调用方据此回答"这一格现在没有赛季"，
 * 而不是 500。这一点很重要 —— **在线伙伴服务是可选的**，赛季服务没部署时，
 * 运维视图仍然该能用，只是少一格。
 *
 * 记一条 warn 而不只是吞掉：熔断被打开、实例全下线、超时，这三种情况在日志里
 * 长得一样，但处理方式完全不同。把异常类名与消息留下，是为了下一个人能分辨。
 */
@Component
public class SeasonClientFallbackFactory implements FallbackFactory<SeasonClient> {

    private static final Logger log = LoggerFactory.getLogger(SeasonClientFallbackFactory.class);

    @Override
    public SeasonClient create(Throwable cause) {
        return () -> {
            log.warn("season-service 不可用，赛季降级为空：{}: {}",
                    cause == null ? "unknown" : cause.getClass().getSimpleName(),
                    cause == null ? "" : cause.getMessage());
            return SeasonSnapshot.unavailable();
        };
    }
}
