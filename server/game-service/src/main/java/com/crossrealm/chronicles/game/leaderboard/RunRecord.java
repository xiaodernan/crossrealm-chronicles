package com.crossrealm.chronicles.game.leaderboard;

/**
 * 一条通关记录。clearTimeMs 越小越靠前。
 *
 * @param runner       玩家名（由客户端提交，未做身份校验 —— 演示用途）
 * @param bossId       通关的 Boss / 终章标识
 * @param clearTimeMs  用时毫秒
 * @param chapter      终章章节（1-5）
 * @param submittedAt  ISO-8601 提交时间
 */
public record RunRecord(String runner, String bossId, long clearTimeMs, int chapter, String submittedAt) {
}
