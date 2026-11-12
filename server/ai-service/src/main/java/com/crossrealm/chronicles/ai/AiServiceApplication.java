package com.crossrealm.chronicles.ai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/**
 * W-Y1：星轨顾问服务（第六个微服务，:8083）。
 *
 * <p>它存在的唯一理由是**把密钥关在一个进程里**：浏览器永远只认识网关上的
 * {@code POST /api/ai/chat}，不认识上游、不认识模型、更不认识 Authorization 头。
 * 把 OpenAI 兼容接口直接放在前端调用，等于把密钥打包进每一个玩家的浏览器里。
 */
@SpringBootApplication
@EnableConfigurationProperties({AiProperties.class, AdvisorJobProperties.class})
public class AiServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(AiServiceApplication.class, args);
    }
}
