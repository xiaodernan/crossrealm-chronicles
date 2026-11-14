package com.crossrealm.chronicles.game;

import com.crossrealm.chronicles.game.notify.AsyncNotifyMirrorService;
import com.crossrealm.chronicles.game.notify.NotifyClient;
import com.crossrealm.chronicles.game.notify.NotifyMirrorService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.cloud.openfeign.EnableFeignClients;

/**
 * 《Crossrealm Chronicles》在线伙伴服务（game-service）。
 *
 * 职责（本切片刻意保持纯内存实现、零数据库）：
 * 1. 排行榜：记通关记录、按用时升序出榜（/api/leaderboard）
 * 2. 遥测：接收玩家事件并限容缓存（/api/telemetry/events）
 * 3. 版本：回显服务版本与配置中心下发的备注（/api/version）
 *
 * 它不是必须的：前端静态构建完全离线可玩；本服务只在接部署了
 * Eureka/Config/Gateway 的环境时才有意义，属于"在线伙伴"部件。
 */
@SpringBootApplication
@EnableConfigurationProperties(GameServiceProperties.class)
// W-X14：声明式调用 season-service。扫描范围限定在本服务的包内 ——
// 不写 basePackages 时 Feign 会从本类所在包往下扫，恰好就是我们要的那一棵。
@EnableFeignClients
public class GameServiceApplication {

    /**
     * W-Z79（2026-11-14 压测定位）：报讯镜像默认走**异步派发**——易主/双冠/换季几条
     * Feign 外呼脱离请求线程，notification-service 不答时端到端 p50 不再被 loopback
     * RST 放大。单测直构造 NotifyMirrorService 不经此 bean，行为确定性不受影响；
     * 要回滚为外呼同步只需 `GAMESERVICE_NOTIFY_MIRROR_ASYNC=false`。
     */
    @Bean
    @Primary
    public NotifyMirrorService notifyMirrorService(NotifyClient client,
            @Value("${game-service.notify-mirror-enabled:true}") boolean enabled,
            @Value("${game-service.notify-mirror-async:true}") boolean async) {
        if (async) {
            return new AsyncNotifyMirrorService(client, enabled);
        }
        return new NotifyMirrorService(client, enabled);
    }

    public static void main(String[] args) {
        SpringApplication.run(GameServiceApplication.class, args);
    }
}
