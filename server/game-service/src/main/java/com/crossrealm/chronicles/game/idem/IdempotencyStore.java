package com.crossrealm.chronicles.game.idem;

import java.util.Optional;

/**
 * 幂等台账（Idempotency Ledger）—— 提交若已带 `X-Idempotency-Key` 的响应快照。
 *
 * <p>两种实现同契约：
 * <ul>
 *   <li>{@link InMemoryIdempotencyStore} —— 本进程 LRU + TTL（默认），不限外部依赖</li>
 *   <li>{@link RedisIdempotencyStore} —— `crossrealm:idem:{key}` SET + PX，跨实例共享</li>
 * </ul>
 * 两者都不得在后端异常时抛出到请求路径——镜像/超时都是 best-effort：
 * 台账查不出来就是台账查不出来，请求照旧落到后端（不可用 > 可用）。
 */
public interface IdempotencyStore {

    /**
     * 查台账。
     *
     * @param key 规范化后的 key（调用方已完成校验）
     * @param nowMs 当前时间（毫秒）
     * @return 命中且未过期的一行；过期或没命中 → Optional.empty()
     */
    Optional<StoredResponse> find(String key, long nowMs);

    /** 存一行。key 不存在 → 覆盖；容量满 → 淘汰最旧（具体策略见各实现） */
    void save(String key, StoredResponse value);
}
