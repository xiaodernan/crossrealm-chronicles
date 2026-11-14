package com.crossrealm.chronicles.notify;

import java.time.Instant;
import java.util.UUID;

/**
 * 一条「报讯」—— 跨界纪元里任何一次值得被记下来的事件。
 *
 * <p>{@code kind} 是枚举字符串（不开 Java enum：JSON 进出都是字符串，
 * 校验在请求层做，enum 化只会给反序列化绕一圈）。合法取值见
 * {@link NotifyController#KIND_PATTERN}。
 *
 * <p>{@code ts} 是纪元毫秒（客户端自管时区），不存时区名字——
 * 存名字会让"同 ttl 的两条记录"在不同机器上读出不同时区解释。
 */
public record Notification(String id, String kind, String title, String body, long ts) {

    public static Notification of(String kind, String title, String body) {
        return new Notification(UUID.randomUUID().toString(), kind, title, body, Instant.now().toEpochMilli());
    }
}
