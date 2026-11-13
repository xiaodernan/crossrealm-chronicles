package com.crossrealm.chronicles.presence;

import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

/**
 * 进程内在场事件扇出（默认内存后端用）。
 *
 * 每个频道一份监听器列表；publish 时同步遍历回调（调用方保证在 upsert 之后调）。
 * subscribe 返回句柄：close() 即从列表移除。无网络、无序列化，纯函数式扇出。
 */
public class InMemoryPresenceEventHub implements PresenceEventHub {

    private final ConcurrentChannelListeners lanes = new ConcurrentChannelListeners();

    private static final class ConcurrentChannelListeners {
        final java.util.concurrent.ConcurrentHashMap<String, CopyOnWriteArrayList<Consumer<Wanderer>>> map =
                new java.util.concurrent.ConcurrentHashMap<>();

        CopyOnWriteArrayList<Consumer<Wanderer>> lane(String channel) {
            return map.computeIfAbsent(channel, k -> new CopyOnWriteArrayList<>());
        }
    }

    @Override
    public AutoCloseable subscribe(String channel, Consumer<Wanderer> onEvent) {
        CopyOnWriteArrayList<Consumer<Wanderer>> lane = lanes.lane(channel);
        lane.add(onEvent);
        return () -> lane.remove(onEvent);
    }

    /** 广播一位游侠给某频道的所有订阅者（同步）。 */
    public void publish(String channel, Wanderer w) {
        for (Consumer<Wanderer> c : lanes.lane(channel)) {
            try {
                c.accept(w);
            } catch (RuntimeException ignore) {
                // 单个订阅者抛错不应阻断其他订阅者
            }
        }
    }
}
