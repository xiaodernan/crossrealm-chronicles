package com.crossrealm.chronicles.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.config.server.EnableConfigServer;

/**
 * 跨服王冠（Crossrealm Chronicles）统一配置中心。
 *
 * 默认工作在 {@code native} profile 下，直接把 classpath:/config 目录里的
 * 各服务配置文件当作配置来源（本地联调零依赖）。生产环境把它换成
 * git 仓库后端即可（{@code spring.cloud.config.server.git.uri}），业务代码零改动。
 */
@EnableConfigServer
@SpringBootApplication
public class ConfigServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(ConfigServerApplication.class, args);
    }
}
