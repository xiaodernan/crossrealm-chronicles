package com.crossrealm.chronicles.game.ai;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

/**
 * ai-service 派生的降级工厂（W-Z8 切片1）。
 *
 * <p>降级返回<b>空 Map</b>：运维视图据此把这一路判成 {@code available: false}，
 * 而不拿到一个半真半假的对象、更不抛 500。
 * 真正的 ai-service 永远不会返回空 Map —�?`/health` 至少带 configured/model/circuit/cache,
 * `/jobs/stats` 至少带 capacity/depth。空 = 没答上，和 season-service 降级里
 * 用 `unavailable()` 哨兵是同一口径，只是载体换成了 Map。
 *
 * <p>两个方法独立降级：health 挂了 jobsStats 仍可能是好的（两个表单端点是两条彼此独立的
 * HTTP 路径，熔断器按方法粒度记录）。
 *
 * <p>记一条 warn 而不是只吞掉：熔断打开、实例全下线、超时三种长得一样，处理方式完全不同 —�? * 把异常类名与消息留下，下一个人能分辨。
 */
@Component
public class AiServiceClientFallbackFactory implements FallbackFactory<AiServiceClient> {

    private static final Logger log = LoggerFactory.getLogger(AiServiceClientFallbackFactory.class);

    @Override
    public AiServiceClient create(Throwable cause) {
        String why = cause == null ? "unknown" : cause.getClass().getSimpleName();
        String msg = cause == null ? "" : cause.getMessage();
        log.warn("ai-service 只读派生降级为空：{}: {}", why, msg);
        return new AiServiceClient() {
            @Override
            public Map<String, Object> health() {
                return Map.of();
            }

            @Override
            public Map<String, Object> jobsStats() {
                return Map.of();
            }

            @Override
            public Map<String, Object> deadLetter() {
                return Map.of();
            }
        };
    }
}
