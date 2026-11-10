package com.crossrealm.chronicles.season;

import java.time.Clock;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

/**
 * 《Crossrealm Chronicles》赛季服务（season-service，W-X14）。
 *
 * 它回答一个问题：**这一轮该带哪几条词缀**。
 *
 * 与 game-service 的分工：
 * - game-service 管"玩家留下了什么"（排行榜 / 遥测）；
 * - season-service 管"世界这阵子是什么样"（主题 / 词缀 / 加成）。
 *
 * 两者都不碰数据库：这一层是**可选的在线伙伴**，删掉它游戏照样离线可玩
 * （客户端拿不到赛季就退回本地默认赛季，见 `src/online/OnlineServices.js`）。
 *
 * `Clock` 在这里显式建 Bean：赛季轮转必须能在测试里用假时钟走完一个周期，
 * 而 `LocalDate.now()` 的隐式时钟没法替换。
 */
@SpringBootApplication
@EnableConfigurationProperties(SeasonServiceProperties.class)
public class SeasonServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(SeasonServiceApplication.class, args);
    }

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
