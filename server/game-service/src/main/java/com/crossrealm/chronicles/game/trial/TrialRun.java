package com.crossrealm.chronicles.game.trial;

/**
 * 一条位面试炼的成绩。**分数越高越靠前** —— 与 Boss 榜那条"用时越短越靠前"相反。
 *
 * <p>为什么不复用 {@code RunRecord}：那一条的主键是 {@code bossId} + 用时，而试炼的
 * 成绩是"打到第几层 + 剩多少秒"折算出来的分。把试炼塞进 Boss 榜（客户端曾经用
 * {@code trial-layer-N} 冒充 bossId 那么干过）的后果是**服务端多出五个不存在的 Boss**，
 * 而正确的动作是给试炼开自己的表。
 *
 * @param runner        玩家名（由客户端提交，未做身份校验 —— 演示用途）
 * @param seasonId      这一局带的赛季 id。赛季轮换之后旧成绩不该混进新榜，所以它参与过滤
 * @param score         计分（层数×100 + 剩余秒/10，口径在客户端 {@code content/trial.js} 与
 *                      服务端各自独立算 —— 服务端只信提交上来的数，但会校验区间）
 * @param layersCleared 清到第几层（0 = 一层都没打完）
 * @param secondsLeft   通关时剩下的秒数（失败时是 0）
 * @param submittedAt   ISO-8601 提交时间（同分时的最后一道次序）
 */
public record TrialRun(
        String runner,
        String seasonId,
        int score,
        int layersCleared,
        int secondsLeft,
        String submittedAt) {
}
