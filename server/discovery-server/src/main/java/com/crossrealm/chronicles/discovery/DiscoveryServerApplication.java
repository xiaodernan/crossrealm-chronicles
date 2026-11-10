package com.crossrealm.chronicles.discovery;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.server.EnableEurekaServer;

/**
 * 跨服王冠（Crossrealm Chronicles）服务发现注册中心。
 *
 * 本服务本身不向任何客户端提供业务 API，只做一件事：
 * 各在线伙伴微服务（game-service 等）启动时向它注册自己的地址，
 * 网关（gateway）据此把对外请求按服务名做负载均衡转发。
 */
@EnableEurekaServer
@SpringBootApplication
public class DiscoveryServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(DiscoveryServerApplication.class, args);
    }
}
