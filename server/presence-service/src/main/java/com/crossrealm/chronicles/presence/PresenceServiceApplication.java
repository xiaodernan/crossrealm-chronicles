package com.crossrealm.chronicles.presence;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/**
 * 《Crossrealm Chronicles》在场服务（presence-service，W-Z-同游）。
 *
 * 它回答一个问题：**此刻还有谁在这片世界里游荡**。
 *
 * 架构（把"网络/消息队列/缓存"三件事各归其位）：
 * - 存在感状态：Redis 哈希 + 集合（每位游侠一个带 TTL 的键，集合负责列举快照）。
 *   这是"缓存/状态"层——键过期即自动离线，不需要后台扫表。
 * - 实时扇出：Redis Pub/Sub。某位游侠心跳一来，publish 到频道，
 *   所有已订阅的 SSE 连接立刻收到——这是"消息队列/发布订阅"层。
 * - 下发：SSE（Server-Sent Events）穿过 Spring Cloud Gateway（已 Webflux，原生流式）。
 *   比 WebSocket 轻：单向广播、HTTP 长连接、自动重连，正好契合"看别人在动"这种只读场景。
 *
 * 与 season/game 一样：删掉它游戏照样离线可玩（客户端默认关闭，见 `src/online/`）。
 * 默认后端是 `memory`（无 Redis 也能健康启动、也能跑通契约测试）；docker 栈里
 * 通过 `PRESENCE_BACKEND=redis` 切到真实的 Redis 实现，真正用上 Pub/Sub 扇出。
 */
@SpringBootApplication
@EnableConfigurationProperties(PresenceProperties.class)
public class PresenceServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(PresenceServiceApplication.class, args);
    }
}
