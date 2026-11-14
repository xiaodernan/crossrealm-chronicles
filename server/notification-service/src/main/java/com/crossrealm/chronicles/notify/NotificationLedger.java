package com.crossrealm.chronicles.notify;

import java.util.List;
import java.util.Map;

/**
 * 报讯台账的唯一抽象 —— 两种实现，靠 {@code spring.cache.type} 二选一：
 *
 * <ul>
 *   <li>{@code simple}（默认，含未配置时 matchIfMissing）：{@link InMemoryNotificationLedger}
 *       —— 进程内有界环形队列，丢不怕、不跨实例、零 Redis 依赖。</li>
 *   <li>{@code redis}：{@link RedisNotificationLedger} —— Redis List（LPUSH/LTRIM 50）
 *       + Hash（HINCRBY 计数）+ 7 天 TTL，跨实例一致、可被任意实例读到。</li>
 * </ul>
 *
 * <p>两种实现都必须<b>同一契约</b>：push 之后 recent(1) 立刻包含它；recent 返回 ≤ limit 条、
 * 新的在前；countsByKind 之和 ≤ size()（clear 之后归零）。
 */
public interface NotificationLedger {

    /** 写入一条报讯（推入队首）。失败抛 {@link IllegalStateException}，控制器翻译成 503。 */
    void push(Notification notification);

    /** 最近 limit 条，新的在前。limit 已在控制器夹到 [1, 50]。 */
    List<Notification> recent(int limit);

    /** 按 kind 计数（HINCRBY / 内存计数器）。返回空 map 表示一条都没写过。 */
    Map<String, Long> countsByKind();

    /** 当前台账里还留着多少条（环形容量 ≤ 50）。 */
    int size();

    /** 清台账（仅 admin-enabled 的 DELETE 端点可以调用）。 */
    void clear();

    /** 当前激活的台账后端标识：'simple'（内存）或 'redis'。 */
    String backend();
}
