package com.crossrealm.chronicles.game.notify;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/**
 * 调 notification-service 的声明式客户端（W-Z50）。
 *
 * <p>与 SeasonClient 同构：`name` 是 Eureka 服务名（经 LoadBalancer 解析）；
 * `fallbackFactory` 在下游不可用时返回一个「静默降级回执」——遥测路径不允许抛异常，
 * 上报世界事件是一件值得记下、但不值得拖垮上游 2xx 的小事。
 *
 * <p>生效前提：`spring.cloud.openfeign.circuitbreaker.enabled=true`（application.yml 已开）。
 */
@FeignClient(
        name = "notification-service",
        path = "/api/notify",
        fallbackFactory = NotifyClientFallbackFactory.class)
public interface NotifyClient {

    /** 发布一条报讯（kind 已在调用侧白名单化）。 */
    @PostMapping
    NotifyAck publish(@RequestBody NotifyEvent event);
}
