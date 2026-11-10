/**
 * 出生缩放的**运行时当前值**（W-F3 切片2）。
 *
 * ## 为什么是模块级的一份，而不是注入进 EnemyManager
 *
 * 与 `game/Difficulty.js` 完全同一个先例（那一份文件头写得很长，理由不再抄一遍）：
 * 这是"整局一份、随某个系统开关"的状态，消费者只有一个（`EnemyManager.spawnAt`
 * 那条咽喉），而给它加构造参数要动几十条直接 `new EnemyManager(...)` 的夹具。
 *
 * ## 与难度、成长的关系：三个乘子各占一边
 *
 * `spawnAt` 里最终血量 = 名册 hp × **难度**（玩家选的）× **成长**（地方给的）× **本档**（试炼给的）。
 * 三者都是正有限数，乘法可交换 —— 谁也不覆盖谁，谁也不读谁的内部。
 *
 * ## 限度（写清楚）
 *
 * ① **脏值回落 1，不抛**：与 `normalizeDifficulty` / `normalizeShadowQuality` 同一口径 ——
 *    这一格的值来自运行时状态，一个坏值不该让整局出不了怪。
 * ② **中性值必须逐字节等价**：`speed` 那一格只有在乘子 ≠ 1 时才写进 config，
 *    否则 `spawnAt` 产出的 config 会多一个键，与改动前不一致（已有用例逐格对比配置）。
 * ③ **谁写谁收**：今天唯一的写入口是试炼。`TrialSystem` 在开层时写、在结束/放弃/销毁时
 *    归位 —— 归位漏了，玩家离开试炼之后世界里的怪会一直按最后一层的强度长。
 */
export const NEUTRAL_SPAWN_SCALE = Object.freeze({ hp: 1, damage: 1, speed: 1 });

/** 当前的出生缩放（冻结对象：读者拿不到可写引用，改值只能走 `setSpawnScale`） */
let current = NEUTRAL_SPAWN_SCALE;

/** 一格是否可用：正有限数才认，其余一律回落 1 */
const 归一 = (v) => (Number.isFinite(v) && v > 0 ? v : 1);

/**
 * 写当前出生缩放。缺格 / 脏格 / 非对象一律回落 1（不抛）。
 * @param {{hp?:number,damage?:number,speed?:number}|null} scale
 * @returns {{hp:number,damage:number,speed:number}} 落地后的那一份
 */
export function setSpawnScale(scale) {
  if (!scale || typeof scale !== 'object') {
    current = NEUTRAL_SPAWN_SCALE;
    return current;
  }
  current = Object.freeze({
    hp: 归一(scale.hp),
    damage: 归一(scale.damage),
    speed: 归一(scale.speed),
  });
  return current;
}

/** 读当前出生缩放（冻结，直接返回内部那份，不为每次出生分配） */
export function getSpawnScale() {
  return current;
}

/** 归位到中性（试炼结束/放弃/销毁时调） */
export function resetSpawnScale() {
  current = NEUTRAL_SPAWN_SCALE;
  return current;
}

/** 是不是中性（`spawnAt` 用它决定要不要往 config 里写 `speed` —— 见文件头限度 ②） */
export function isNeutralSpawnScale(scale = current) {
  return scale.hp === 1 && scale.damage === 1 && scale.speed === 1;
}
