package com.crossrealm.chronicles.ai;

import java.util.Map;
import java.util.Optional;

/**
 * W-Z1：顾问任务队列的抽象。
 *
 * <p>W-Y4 的 {@link AdvisorJobQueue} 是<b>进程内</b>实现（默认后端，零额外基础设施）；
 * 本接口允许把它换成 <b>Redis Streams</b> 后端，从而跨多个 ai-service 实例共享同一份
 * 在途任务、进程重启不丢、崩溃的任务由其它实例通过 pending 列表自动重投。
 *
 * <p>契约只对「提交 / 轮询 / 读数 / 撤回」四件事负责；worker 与重试是各实现的内部事务。
 * 任何实现都必须保证：问出去就 {@code DONE}，或明确 {@code DEAD}（带 reason），
 * 或（Redis 后端）在消费者崩溃后由另一实例把 pending 条目重投 —— 不许静默蒸发。
 */
public interface AdvisorQueue {

    /** 收下一句提问；返回受理结果（受理 / 重复幂等 / 队列满拒绝）。 */
    AdvisorJobQueue.SubmitResult submit(String question, Map<String, Object> context, String requestId);

    /** 轮询视图（不回显 question/context）。 */
    Optional<Map<String, Object>> view(String jobId);

    /** 撤回一个还在排队的任务（W-Z7）。终态 / 在飞 / 未知 jobId：cancelled=false 或 Optional.empty()。 */
    Optional<Map<String, Object>> cancel(String jobId);

    /**
     * 死信只读白名单（W-Z1 切片2）。最多返回 `limit` 条（1..50），字段只含
     * id / requestId / reason / attempts —— 刻意不带 question / answer（玩家输入与模型输出
     * 不该流进一个"运维列表"；排障要的是"同一类失败出现多少次"，不是看聊天记录）。
     */
    java.util.List<Map<String, Object>> deadLetters(int limit);

    /** 运维一眼读数：深度 / 背压 / 重试 / 死信。 */
    Map<String, Object> stats();

    /** 客户端轮询间隔提示（毫秒）。 */
    long pollAfterMs();

    /** 生命周期：启动 worker / 关闭。 */
    void start();

    void stop();
}
