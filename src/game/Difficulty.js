/**
 * 难度档的**运行时所有者**（W-E1 切片1）。
 *
 * ## 为什么是一个模块级的当前档，而不是注入进三个系统
 *
 * 三个消费者（`EnemyManager.spawnAt` / `CombatController.takeDamage` / `PlayerStats.addSouls`）
 * 长在三棵不同的子树上，而且 `PlayerStats` 与 `CombatController` 的构造签名被几十条用例
 * 直接调用（加参数就要动一大片夹具）。这一格的状态是"整局游戏一份"，与
 * `engine/i18n.js` 的 `setLanguage` 是同一个形状 —— **先例在那里**：那种"全局唯一、随设置落地"
 * 的状态走模块级，而不是给每个消费者挂一份副本（挂三份就是三个真源，正是 B36 那一族）。
 *
 * 与 `i18n.js` 一样，唯一写入口是 `setDifficulty`，而它的调用者是
 * `SettingsManager.applyToGame` —— 设置面板、存档、开机各一条路都汇到那一处。
 *
 * ## 限度（写清楚）
 *
 * 模块级状态在测试里是共享的：读档/换档的用例要自己 `resetDifficulty()` 收尾。
 * `tests/difficulty.test.js` 的 `afterEach` 就是这么做的；这条不是"设计缺陷"，
 * 而是"整局一份"这件事的必然代价（换成注入只是把这份代价挪到夹具里）。
 */
import {
  DIFFICULTY_IDS, DIFFICULTY_KEYS, difficultyOf, normalizeDifficulty,
} from '../content/difficulty.js';
import { DEFAULT_DIFFICULTY } from '../content/difficulty.js';
import { t } from '../engine/i18n.js';

export { DEFAULT_DIFFICULTY };

/** 当前档位（`DIFFICULTY_IDS` 里的一员） */
let currentId = DEFAULT_DIFFICULTY;
/** 当前档的行（避免每次读乘子都查一次表） */
let currentTier = difficultyOf(currentId);

/**
 * 换档。**脏值回落出厂档，不抛** —— 与 `normalizeShadowQuality` / `padTuning` 同一先例：
 * 参数可能是玩家可写的存储，一个错字不该把游戏拦在启动前。
 * 返回值是落地后的 id，调用方可以据此回报"你选的那档不存在，已回落"。
 */
export function setDifficulty(id) {
  currentId = normalizeDifficulty(id);
  currentTier = difficultyOf(currentId);
  return currentId;
}

/** 当前档位 id */
export function getDifficultyId() {
  return currentId;
}

/** 当前档位整行（只读用；调用方不要就地改它 —— 表是 `Object.freeze` 过的） */
export function getDifficulty() {
  return currentTier;
}

/** 面板要的选项名单（从名册现推，不抄第二份 —— B47 家族的老规矩） */
export function difficultyOptions() {
  // W-D2 切片16v：档位名与说明存的是**文案键** —— 面板要的是那句人看的话
  return DIFFICULTY_IDS.map((id) => {
    const tier = difficultyOf(id);
    return { ...tier, id, label: t(tier.label), desc: t(tier.desc) };
  });}

/**
 * 取一个乘子。**键写错当场抛** —— 与 `difficultyOf` / `enemyRosterOf` 同一口径：
 * 静默返回 `undefined` 的后果是乘出 `NaN`，而 `NaN` 血量在界面上表现为"血条消失"，
 * 报错栈里不会有任何一行指向那个拼错的键。
 */
export function difficultyMultiplier(key) {
  if (!DIFFICULTY_KEYS.includes(key)) {
    throw new Error(
      `未知难度乘子 "${key}"（可用：${DIFFICULTY_KEYS.join(' / ')}）—— `
      + '返回 undefined 会乘出 NaN，而 NaN 血量只表现为血条消失'
    );
  }
  return currentTier.multipliers[key];
}

/** 回出厂档。给用例收尾用（见文件头"限度"那段） */
export function resetDifficulty() {
  return setDifficulty(DEFAULT_DIFFICULTY);
}
