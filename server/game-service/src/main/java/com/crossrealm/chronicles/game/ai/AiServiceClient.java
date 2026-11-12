package com.crossrealm.chronicles.game.ai;

import java.util.Map;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 调 ai-service 的只读派生 —— 跨服务运维视图专用（W-Z8 切片1）。
 *
 * <p>为什么返回原始 Map 而不是强类型 record：
 * ai-service 的两种队列实现（内存版 / Redis Streams 版）字段集并不相同
 * （内存版多 processed / retried / tracked / maxTracked，Redis 版多 pending）。
 * 固定 record 会把其中一边的字段静默丢掉 —�?运维视图不许丢信息。
 * 与 {@code LeaderboardService.stats()} 等其它运维读数的口径一致：原样带回来，
 * 够不够格画出来由渲染层决定。
 *
 * <p>生效前提：`spring.cloud.openfeign.circuitbreaker.enabled=true`（见 application.yml）;
 * 缺它的 Feign 不走 fallbackFactory —�?失败会把异常直接抛给调用方
 * （本地那一侧的 try/catch 仍然接得住，两层保底不能反）。
 */
@FeignClient(
        name = "ai-service",
        path = "/api/ai",
        fallbackFactory = AiServiceClientFallbackFactory.class)
public interface AiServiceClient {

    /** ai-service 的健康快照（configured / model / circuit / cache / upstreamCalls） */
    @GetMapping("/health")
    Map<String, Object> health();

    /** ai-service 的异步队列读数（capacity / depth / pending / inFlight / enqueued / rejected / dedupHits / done / deadLettered …） */
    @GetMapping("/jobs/stats")
    Map<String, Object> jobsStats();
}
