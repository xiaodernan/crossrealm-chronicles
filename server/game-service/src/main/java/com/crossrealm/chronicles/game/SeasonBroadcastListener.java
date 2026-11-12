package com.crossrealm.chronicles.game;

import com.crossrealm.chronicles.game.cache.TtlCache;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.annotation.Nullable;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.stereotype.Component;

/**
 * W-M5：season-service 经 Redis Pub/Sub 广播的「换季」事件监听器。
 *
 * <p>为什么需要它：game-service 的 SeasonClient 缓存（W-P4 的 TtlCache，30s）是惰性加载——
 * 下游 season-service 被推换季之后，旧的 active season 会继续有效最长 30 秒。
 * <p><b>Redis Pub/Sub 是广播</b>而不是 pull：season-service 推一次，所有订阅者同一时刻收到。
 * 只在 {@code spring.cache.type=redis} 时创建（与 season-service 同口径）；缺省 ConcurrentMap 时
 * 这条路径根本不启用，Lettuce 也不初始化、不连接本地 Redis。
 * <p><b>fire-and-forget</b>：listener 里只做两件事——
 * <ol>
 *   <li>调 {@link TtlCache#invalidate(String)} 清掉 "season.active"；</li>
 *   <li>{@code received.incrementAndGet()} —— /api/ops/health 把它暴露成
 *       {@code seasonBroadcastReceived: N}，运维可一眼看到「上次听到广播是什么时候」。</li>
 * </ol>
 * 解析失败的广播只记 WARN，不炸订阅通道。
 */
@Component
@ConditionalOnProperty(name = "spring.cache.type", havingValue = "redis")
public class SeasonBroadcastListener {

    public static final String CHANNEL = "crossrealm:season:advance";

    private final TtlCache seasonCache;
    private final AtomicLong received = new AtomicLong();
    private volatile RedisMessageListenerContainer container;

    @Autowired
    public SeasonBroadcastListener(TtlCache seasonCache) {
        this.seasonCache = seasonCache;
    }

    /** 注入 RedisConnectionFactory —— 缺省没有 Redis（spring.cache.type!=redis）就不注册这一条通道 */
    @Autowired
    public void setConnectionFactory(@Nullable RedisConnectionFactory connectionFactory) {
        if (connectionFactory == null) return;
        RedisMessageListenerContainer c = new RedisMessageListenerContainer();
        c.setConnectionFactory(connectionFactory);
        c.addMessageListener(this::onMessage, new ChannelTopic(CHANNEL));
        this.container = c;
    }

    @PostConstruct
    public void start() {
        if (container == null) {
            org.slf4j.LoggerFactory.getLogger(SeasonBroadcastListener.class)
                    .info("[W-M5] spring.cache.type=redis but no RedisConnectionFactory available; season broadcast listener NOT subscribed");
            return;
        }
        container.afterPropertiesSet();
        container.start();
        org.slf4j.LoggerFactory.getLogger(SeasonBroadcastListener.class)
                .info("[W-M5] season-broadcast listener subscribed to {}", CHANNEL);
    }

    @PreDestroy
    public void stop() {
        if (container != null) {
            try {
                container.destroy();
            } catch (Exception e) {
                org.slf4j.LoggerFactory.getLogger(SeasonBroadcastListener.class)
                        .warn("[W-M5] failed to stop listener container: {}", e.toString());
            }
        }
    }

    private void onMessage(org.springframework.data.redis.connection.Message message, byte[] pattern) {
        handle(new String(message.getBody(), StandardCharsets.UTF_8));
    }

    /**
     * 包内可见：把「解析 → 认事件 → 失效缓存 → 计数」与 Redis 传输层分开。
     * 测试不必为了验这一段去造 {@code Message} / 起 Lettuce —— 广播最容易错的是口径
     * （哪条消息该让缓存失效），不是字节怎么进来的。
     */
    void handle(String payload) {
        try {
            Map<String, Object> parsed = parse(payload);
            if ("season:advance".equals(parsed.get("event"))) {
                seasonCache.invalidate("season.active");
                received.incrementAndGet();
                org.slf4j.LoggerFactory.getLogger(SeasonBroadcastListener.class)
                        .info("[W-M5] season-advance received, id={} dayInCycle={}, cache invalidated",
                                parsed.get("id"), parsed.get("dayInCycle"));
            }
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(SeasonBroadcastListener.class)
                    .warn("[W-M5] bad broadcast, dropped: {}", e.toString());
        }
    }

    private static Map<String, Object> parse(String payload) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = new com.fasterxml.jackson.databind.ObjectMapper().readValue(payload, Map.class);
            return parsed;
        } catch (Exception e) {
            return Map.of();
        }
    }

    public long receivedCount() {
        return received.get();
    }
}
