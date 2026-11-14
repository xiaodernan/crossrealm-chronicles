package com.crossrealm.chronicles.notify;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 内存台账 —— 默认实现（{@code spring.cache.type} 不是 {@code redis} 时，含未配置）。
 *
 * <p>有界环形：超出 {@link #CAPACITY} 的老条目直接丢弃，永远不会把堆吃满；
 * 并发：push/recent 全程 synchronized（单实例吞吐远够这个场景）；统计走独立计数器，
 * 不查队列——O(1)。
 */
@Component
@ConditionalOnProperty(name = "spring.cache.type", havingValue = "simple", matchIfMissing = true)
public class InMemoryNotificationLedger implements NotificationLedger {

    static final int CAPACITY = 50;

    private final ArrayDeque<Notification> deque = new ArrayDeque<>(CAPACITY);
    private final ConcurrentHashMap<String, Long> kindCounts = new ConcurrentHashMap<>();

    @Override
    public void push(Notification notification) {
        synchronized (deque) {
            if (deque.size() >= CAPACITY) {
                deque.removeLast();
            }
            deque.addFirst(notification);
        }
        kindCounts.merge(notification.kind(), 1L, Long::sum);
    }

    @Override
    public List<Notification> recent(int limit) {
        synchronized (deque) {
            return new ArrayList<>(deque.stream().limit(limit).toList());
        }
    }

    @Override
    public Map<String, Long> countsByKind() {
        return new LinkedHashMap<>(kindCounts);
    }

    @Override
    public int size() {
        synchronized (deque) {
            return deque.size();
        }
    }

    @Override
    public void clear() {
        synchronized (deque) {
            deque.clear();
        }
        kindCounts.clear();
    }

    @Override
    public String backend() {
        return "simple";
    }
}
