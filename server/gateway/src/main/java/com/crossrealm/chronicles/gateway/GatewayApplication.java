package com.crossrealm.chronicles.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 跨服王冠（Crossrealm Chronicles）统一 API 网关。
 *
 * 对外只暴露 8080 一个端口：
 *   /api/**  → 负载均衡转发到 game-service（Eureka 按服务名解析）
 * 同时支持 discovery locator（可选，见 application.yml）：
 *   /<service-id>/** → 对应服务原始路径（调试时方便直接打各服务）
 */
@SpringBootApplication
public class GatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(GatewayApplication.class, args);
    }
}
