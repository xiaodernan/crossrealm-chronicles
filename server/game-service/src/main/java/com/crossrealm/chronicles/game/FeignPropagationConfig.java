package com.crossrealm.chronicles.game;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import feign.RequestInterceptor;

/**
 * W-M4：Feign 出站请求透传入站 {@code X-Request-Id}。
 *
 * <p>网关在每次 HTTP 入站都会注入/透传 X-Request-Id（不存在就生成 UUID）；
 * game-service 收到后，Feign 调 season-service 必须带上去——整条链就只有一个名字，
 * 运维一眼定哪台机器出了事。没有这一片的话，game-service 日志里有 id、season-service 日志里却是空白，
 * 不知道 Feign 调用是不是来自同一条请求链。
 */
@Configuration
public class FeignPropagationConfig {

    @org.springframework.context.annotation.Bean
    @org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication(type = org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication.Type.SERVLET)
    public RequestInterceptor xRequestIdForwarding() {
        return template -> {
            ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs != null) {
                HttpServletRequest req = attrs.getRequest();
                String id = req.getHeader("X-Request-Id");
                if (id != null && !id.isBlank()) {
                    template.header("X-Request-Id", id);
                }
            }
        };
    }
}
