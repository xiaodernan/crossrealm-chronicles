package com.crossrealm.chronicles.presence;

import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.function.Consumer;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

/**
 * Redis Pub/Sub 在场事件扇出（docker 栈后端，W-Z-同游 的"消息队列"落地）。
 *
 * 每条 SSE 连接在打开时 subscribe 一次：把 MessageListener 挂到共享的
 * {@link RedisMessageListenerContainer} 上订阅 `presence:events:{channel}`；
 * 任意游侠心跳一来（RedisPresenceStore.upsert 后由本 hub 的 publish 调 convertAndSend），
 * 容器把消息推到回调，回调再喂给 SSE 的 emitter。close() 即从容器移除该监听器。
 *
 * 这是教科书式的"发布/订阅扇出"：一个生产者、N 个消费者、Redis 做 broker，
 * 横向扩展时多个 presence-service 实例共享同一 Redis 频道，订阅者不会漏收。
 */
public class RedisPresenceEventHub implements PresenceEventHub {

    private final RedisMessageListenerContainer container;

    public RedisPresenceEventHub(RedisMessageListenerContainer container) {
        this.container = container;
    }

    private static String eventsChannel(String channel) {
        return "presence:events:" + channel;
    }

    @Override
    public AutoCloseable subscribe(String channel, Consumer<Wanderer> onEvent) {
        ChannelTopic topic = new ChannelTopic(eventsChannel(channel));
        MessageListener listener = (Message msg, byte[] pattern) -> {
            try {
                String body = new String(msg.getBody(), StandardCharsets.UTF_8);
                onEvent.accept(Wanderer.parse(body));
            } catch (RuntimeException ignore) {
                // 坏消息：丢弃，不阻断其他消息
            }
        };
        container.addMessageListener(listener, topic);
        return () -> container.removeMessageListener(listener, topic);
    }

    /** 广播一位游侠到 Redis 频道（convertAndSend）。 */
    public void publish(String channel, Wanderer w) {
        // 复用 RedisPresenceStore 的频道命名；这里直接发，避免跨类耦合键名。
        // 注意：RedisPresenceStore 也持有同一命名，保持一致。
        container.getConnectionFactory().getConnection()
                .publish(eventsChannel(channel).getBytes(StandardCharsets.UTF_8), w.toJson().getBytes(StandardCharsets.UTF_8));
    }
}
