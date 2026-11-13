package com.crossrealm.chronicles.presence;

import java.util.function.Consumer;

/**
 * 在场事件扇出（消息队列/发布订阅抽象）。
 *
 * subscribe 在某个频道上挂一个监听器，返回可关闭的句柄（取消订阅）。
 * 实现：InMemory 走进程内列表；Redis 走 {@code RedisMessageListenerContainer} + Pub/Sub 订阅。
 */
public interface PresenceEventHub {

    /**
     * 订阅某频道的游侠事件。
     * @return 句柄：close() 即取消订阅。
     */
    AutoCloseable subscribe(String channel, Consumer<Wanderer> onEvent);

    /** 广播一位游侠到频道（让已订阅者立刻收到）。 */
    void publish(String channel, Wanderer w);
}
