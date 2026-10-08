/**
 * HUD 状态条的颜色主题（W-D6 切片4，切片6 扩到五条）。
 *
 * ## 这一片解决什么
 * 切片3 把色盲档接上了"地上掉落物的档位色"。但玩家**看得最多的三条颜色**一直没接：
 * 血条（红）、精力条（金）、法力条（蓝紫）—— 而"红 vs 金"正是红绿色盲最难分的一对。
 * 可访问性开关切了，最该变的地方没变。
 *
 * ## 为什么亮端取色板、暗端不动
 * 渐变是两停（暗 → 亮）。色盲破坏的是**色相分辨**，明度阶梯还留着；
 * 所以暗端沿用改前那一枚（`BAR_SHADE`），亮端（最饱和的那一端）从语义色板取。
 * 这样默认档与改前**逐字节相同**（亮端的默认列就是改前在役的那枚），
 * 而色盲档只换色相、不破坏"这一条快满了还是快空了"的明度读数。
 *
 * ## 为什么走 CSS 自定义属性，而不是 JS 每帧写 style
 * 状态条每帧都在改 `width`（`HUD.update`），但**颜色**只在换档时变一次。
 * 写成 `--bar-hp` 之类的变量挂在 `documentElement` 上，CSS 里 `var(--bar-hp, #cc4444)`
 * 取用：JS 侧一次写入，帧循环一格都不碰颜色。回落值就是改前那一枚 ——
 * 所以"没有 JS 的那一帧"与"出厂档"看到的画面完全相同。
 *
 * ## 映射只有一份
 * `BAR_SEMANTIC` 是"哪条条读哪个语义"的唯一答案（与 `DROP_RING_BY_RARITY` 同一纪律）。
 * 门禁按调用点计数钉住：写颜色的地方只有这一个文件，HUD 只负责调用。
 *
 * ## 切片6 为什么把 Boss 血条与架势条也收进来
 * 切片4 刻意把这两条留在表外，理由是"它们与玩家三条分居屏幕两端，保持旧色反而让
 * '我的血'与'它的血'更好分"。那个理由对**默认档**成立，对色盲档不成立：
 * Boss 血条那枚 `#ff3333` 是写死的，切了档它一动不动 —— 开关切了，最该变的地方还是没变。
 * 所以它们各立一个语义（`threat` / `posture`）而不是复用 `danger`：
 * 复用会让两条血条在换档时变成同一枚色，那时"我的血"与"它的血"只剩位置可分。
 * 这一对由 `DISTINCT_IN_ANY_MODE` 在任何一档下钉住不许撞色。
 *
 * ## 十六进制化只有一处
 * "颜色"在本仓有两种形状：three 那侧要**数**（`material.color.setHex`），
 * DOM 那侧要**串**（飘字的 `style.color`、这里的 CSS 自定义属性）。
 * 两处各自 `toString(16)` 就是两条算式，其中一条写错时的症状只是
 * "那个颜色悄悄地不对"，报错栈里一行都不会指过来。所以十六进制化只在
 * `game/ColorVision.js` 的 `cssColorOf` 一处，本文件与 CombatController 都调它。
 */
import { cssColorOf, getColorVisionMode } from '../game/ColorVision.js';

/** CSS 变量名：`bar-hp` → `--bar-hp` */
const BAR_VAR = (bar) => `--bar-${bar}`;

/**
 * 哪条状态条读哪个语义。键是 CSS 类名（`.bar-fill.hp` / `.bar-fill.st` / `.bar-fill.mana` /
 * `.bar-fill.boss-hp` / `.bar-fill.po`），这样"加一条条"与"给它配色"在同一处看得见。
 *
 * **五个语义互不重复**：两条条共用一个语义就会在换档时一起变，玩家分不清哪条是哪条。
 * 其中 `boss-hp` 与 `hp` 这一对最要紧 —— 它们同屏出现，撞色比没配色更糟
 * （见 `content/semanticColors.js` 的"为什么 Boss 血条不直接用 danger"）。
 */
export const BAR_SEMANTIC = Object.freeze({
  hp: 'danger',
  st: 'warning',
  mana: 'resource',
  'boss-hp': 'threat',
  po: 'posture',
});

/**
 * 每条条的暗端（渐变起点）。四个色觉档下都不动 —— 见文件头"为什么亮端取色板、暗端不动"。
 * 值与改前 `style.css` 里那一枚逐字相同（门禁按 CSS 回落值对账）。
 */
export const BAR_SHADE = Object.freeze({
  hp: '#8b2020',
  st: '#8b6914',
  mana: '#224488',
  'boss-hp': '#661111',
  po: '#444488',
});

/**
 * 某条条在某档下的亮端。纯函数，不碰 DOM —— 门禁直接喂档位读数，不需要假浏览器。
 * 出厂档读出来必须与改前 CSS 那一枚逐字相同（`BAR_BRIGHT_DEFAULT` 由它推导并反向对账）。
 *
 * 颜色不从色板直接算，而是过 `cssColorOf`：十六进制化全仓只有那一处（见文件头末段）。
 */
export function barBright(bar, mode = getColorVisionMode()) {
  const semantic = BAR_SEMANTIC[bar];
  if (!semantic) {
    throw new Error(`barBright: 未知的状态条 "${bar}"（可用：${Object.keys(BAR_SEMANTIC).join(' / ')}）`);
  }
  return cssColorOf(semantic, mode);
}

/** 出厂档下每条条的亮端 —— 就是改前 `style.css` 里那一枚（零视觉变更的冻结读数） */
export const BAR_BRIGHT_DEFAULT = Object.freeze(
  Object.fromEntries(Object.keys(BAR_SEMANTIC).map((bar) => [bar, barBright(bar, 'default')])),
);

/**
 * 某档下要写进 `documentElement` 的整套变量。纯函数：返回 `{ '--bar-hp': '#cc4444', … }`。
 * 暗端也在这里给（不随档位变，但一起写，省得 CSS 里每个 var 都带一回回落值）。
 */
export function barThemeVars(mode = getColorVisionMode()) {
  const out = {};
  for (const bar of Object.keys(BAR_SEMANTIC)) {
    out[BAR_VAR(bar)] = barBright(bar, mode);
    out[`${BAR_VAR(bar)}-shade`] = BAR_SHADE[bar];
  }
  return out;
}

/**
 * 落地：把当前档的颜色写进 `documentElement` 的 CSS 自定义属性。
 * 没有 DOM 的环境（纯逻辑测试）安静返回 —— 与 `applyTranslations` 的兜底同一条先例。
 */
export function applyBarTheme(mode = getColorVisionMode()) {
  if (typeof document === 'undefined' || !document.documentElement) return null;
  for (const [name, value] of Object.entries(barThemeVars(mode))) {
    document.documentElement.style.setProperty(name, value);
  }
  return mode;
}