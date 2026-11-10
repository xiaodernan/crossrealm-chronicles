package com.crossrealm.chronicles.game.season;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 调 season-service 的声明式客户端（W-X14）。
 *
 * `name` 是 Eureka 里的服务名（不是 host:port）—— Feign 经 LoadBalancer 解析实例，
 * 于是 season-service 起两个实例时不需要改任何配置。
 *
 * `fallbackFactory` 而不是 `fallback`：降级时要能看见**为什么**降级（连不上？超时？
 * 熔断打开？），`FallbackFactory` 收得到那个 `Throwable`。`fallback` 拿不到原因，
 * 出了事只能靠猜。
 *
 * 生效前提：`spring.cloud.openfeign.circuitbreaker.enabled=true`（见 application.yml）——
 * 不开的话 Feign 会忽略 fallbackFactory，而这件事**不会报错**，只会在真正失败时把
 * 异常直接抛给调用方。
 */
@FeignClient(
        name = "season-service",
        path = "/api/seasons",
        fallbackFactory = SeasonClientFallbackFactory.class)
public interface SeasonClient {

    /** 当前赛季（服务端按周期算好的那一份） */
    @GetMapping("/active")
    SeasonSnapshot active();
}
