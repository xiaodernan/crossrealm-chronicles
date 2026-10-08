/**
 * 色觉档的**运行时所有者**（W-D6 切片3）。
 *
 * ## 为什么是模块级当前档，而不是把档位递进每个消费者
 *
 * `content/semanticColors.js` 只回答"某个语义在某个档下是什么颜色"，**不回答现在是哪一档**。
 * 消费者散在几棵不同的子树上（掉落层读稀有度色、HUD 读状态条色、飘字读治疗色），
 * 而它们的构造签名被几十条用例直接调用（加参数就要动一大片夹具）。这一格的状态是
 * "整局游戏一份"，与 `engine/i18n.js` 的 `setLanguage` / `game/Difficulty.js` 的
 * `setDifficulty` 是同一个形状 —— **先例在那里**：那种"全局唯一、随设置落地"的状态走模块级，
 * 而不是给每个消费者挂一份副本（挂三份就是三个真源，正是 B36 那一族）。
 *
 * 与它们一样，唯一写入口是 `setColorVision`，而它的调用者是 `SettingsManager.applyToGame` ——
 * 设置面板、存档、开机各一条路都汇到那一处（门禁按调用点计数钉住）。
 *
 * ## 为什么"默认档"这件事值得单独一个常量
 *
 * 出厂档必须是 `default`：它保证"接上色盲模式"与"没接"逐字节相同（`tests/color-vision.test.js`
 * 拿迁移前的四个冻结色值对账）。如果出厂档落在某个色盲档上，那么默认玩家的画面就被改了，
 * 而"改了"这件事不会有任何提示。
 *
 * ## 生效时机（写进注释）
 *
 * 新生成的掉落按当前档取色；**场上已有的掉落会当场重涂**（`LootSystem.update` 每帧比对一次档位）。
 * 难度档对场上敌人是"出生那一瞬间定死"，色觉档不一样：它是**可访问性**开关，
 * 玩家切档的唯一目的就是让眼前已经存在的东西变得可分辫 —— 让他退出去重打一遍没有意义。
 * HUD 状态条与治疗飘字同理，只是它们不需要每帧比对（`applyToGame` 换档时直接重写一次）。
 *
 * ## 限度（写清楚）
 *
 * 模块级状态在测试里是共享的：换档的用例要自己 `resetColorVision()` 收尾。
 * 这条不是"设计缺陷"，而是"整局一份"这件事的必然代价（换成注入只是把这份代价挪到夹具里）。
 */
import {
  COLOR_MODES, COLOR_VISION_LABELS, DEFAULT_COLOR_MODE, normalizeColorVision, semanticColor,
} from '../content/semanticColors.js';
import { gearRarityDisplay } from '../content/gear.js';

export { DEFAULT_COLOR_MODE };

/** 当前色觉档（`COLOR_MODES` 里的一员） */
let currentMode = DEFAULT_COLOR_MODE;

/**
 * 换档。**脏值回落出厂档，不抛** —— 与 `setDifficulty` / `normalizeShadowQuality` 同一先例：
 * 参数可能是玩家可写的存储，一个错字不该把游戏拦在启动前。
 * 返回值是落地后的档位，调用方可以据此回报"你选的那档不存在，已回落"。
 */
export function setColorVision(mode) {
  currentMode = normalizeColorVision(mode);
  return currentMode;
}

/** 当前色觉档 id */
export function getColorVisionMode() {
  return currentMode;
}

/** 面板要的选项名单（从名册现推，不抄第二份 —— B47 家族的老规矩） */
export function colorVisionOptions() {
  return COLOR_MODES.map((id) => ({ id, label: COLOR_VISION_LABELS[id] }));
}

/**
 * 一个语义在当前档下的颜色（**数**，给 three 的 `setHex` 用）。
 * **语义写错当场抛** —— 与 `difficultyMultiplier` 同一口径：
 * 静默返回 `undefined` 的后果是把 `undefined` 涂到材质上，而那在画面上只是"那个东西没颜色"，
 * 报错栈里不会有任何一行指向那个拼错的语义名。
 */
export function colorOf(semanticId) {
  return semanticColor(semanticId, currentMode);
}

/**
 * 一个语义在某档下的 **CSS 颜色串**（`#rrggbb`，给 DOM/CSS 用）。
 *
 * 为什么要单开这一个出口：DOM 那一侧（飘字的 `style.color`、CSS 自定义属性）要的是串，
 * three 那一侧（`material.color.setHex`）要的是数。两处各自 `toString(16)` 就是两条算式，
 * 而其中一条写错时的症状只是"那个颜色悄悄地不对"，报错栈里一行都不会指过来。
 */
export function cssColorOf(semanticId, mode = currentMode) {
  return `#${semanticColor(semanticId, mode).toString(16).padStart(6, '0')}`;
}

/**
 * 一件装备的稀有度色，按**当前档**取。
 *
 * 这里不直接读 gear.js 那份**出厂档快照**（注册表校验与"零视觉变更"对账都指着它）：
 * 运行时换档必须走 `gearRarityDisplay(rarity, mode)` 这条带档位的路 ——
 * 否则"切了色盲档，地上已经掉的那件还是旧色"。
 */
export function rarityTint(rarityId) {
  return gearRarityDisplay(rarityId, currentMode).tint;
}

/** 回出厂档。给用例收尾用（见文件头"限度"那段） */
export function resetColorVision() {
  return setColorVision(DEFAULT_COLOR_MODE);
}
