package com.crossrealm.chronicles.gateway;

import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * 按 IP 滑动窗口限流的账口抽象（W-P10）。
 *
 * <p>为什么需要它：in-memory 实现只对单实例够用——多实例部署时，每个 pod 各有一本小岛账，
 * 攻击者把 M1 打爆后换 M2 继续刷，整个集群的总和仍然超过 {@code maxRequests}。
 * Redis 背板把这条账合到一处，全集群共享同一套滑动窗口成为可能。
 *
 * <p>契约：
 * <ul>
 *   <li><b>线程安全</b>：实现内部同步/原子完成（不要让两次读读到中间态）。</li>
 *   <li><b>容量有限</b>：跟踪的 IP 数量永远有上限（LRU 内存版 / Redis key 数控），满了踢最久未用的。</li>
 *   <li><b>失败开放</b>：Redis 挂了 → 降级到内存或放行（不许让网关变成单点故障源头）。</li>
 * </ul>
 */
public interface IpRateLimiter {

    /**
     * 这名客户端这次请求能不能放行。放行的同时把时间戳记入账本。
     *
     * <p>参数 {@code nowMs} 由调用方传入（方便测试用假时钟）；实现内部不依赖系统时钟，
     * 但测试里的固定值会真实地出现在账本里——不要在生产里传伪时钟。
     */
    Mono<Boolean> tryAcquire(String ip, long nowMs);

    /** 批量扫描（主动清理过期窗口那一侧的记账用 metadata；非必要不调用） */
    void sweep();

    /** 这名客户端还要等多少毫秒才能再请求（客户端看到 429 后的等待期） */
    long retryAfterMs();

    /** 单窗口允许的最大请求数 */
    int maxRequests();

    /** 滑动窗口长度（毫秒） */
    int windowMs();

    /** 当前实现里追踪的 IP 数量（测试/运维用） */
    int trackedSize();

    /** 当前实现里每个 IP 的窗口大小快照（测试用） */
    Map<String, Integer> snapshotWindowSizes();
}
