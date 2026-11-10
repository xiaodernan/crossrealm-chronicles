package com.crossrealm.chronicles.game;

import com.crossrealm.chronicles.game.GameServiceProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

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
public class GameServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(GameServiceApplication.class, args);
    }
}
