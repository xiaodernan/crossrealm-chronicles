/**
 * 语义色板 —— 色盲友好的单一所有者（W-D6 切片1）
 *
 * ## 为什么要有这一层
 * 改前普查（`.tmp-20261007/wd6s1-census.mjs`）：全仓 **756 处颜色字面量、408 种色值、
 * 散在 79 个文件**；设置项里**没有任何可访问性开关**（只有音量 / 泛光 / 阴影 / 画质档）。
 * "危险是红的、安全是绿的"这件事没有一处说得算的地方，于是
 * **色盲模式无从下手** —— 没有一个可以整体替换的语义层。
 *
 * ## 每一格都必须带"非颜色冗余"
 * 这是这一层的核心约束，不是注释里的建议而是门禁：**只靠颜色表达状态，对色觉异常
 * 就等于没有表达**。所以每个语义除颜色外还必须给两样：
 *   - `glyph`：一个形状/符号（危险 `!`、安全 `+`、警告 `▲`、稀有度用 `○◇◆★` 递进）
 *   - `label`：一个词（面板与提示里可以直接用）
 *
 * 门禁强制三件事：① `glyph` 与 `label` 都非空；② 每个色盲档下的颜色**与默认档不同**
 * （否则"色盲模式"是个空转的开关）；③ 同一档内 `danger` / `warning` / `safe` 三者互不同色
 * （否则两种状态撞成一个颜色，比没配色更糟）。
 *
 * ## 默认档 = 现状，逐格同值
 * `default` 一列的值取自**改前在役的那些色**（稀有度四档直接对齐装备稀有度显示表的旧值），
 * 所以接上消费者之后默认档**零视觉变更**。调色是美术决定，机制片不夹带。
 */

/** 色觉档位。`default` 是出厂档；其余三档是常见的色觉异常类型 */
export const COLOR_MODES = Object.freeze(['default', 'deuteranopia', 'protanopia', 'tritanopia']);

const c = (label, glyph, colors) => Object.freeze({ label, glyph, colors: Object.freeze(colors) });

/**
 * 语义色表。键是**语义**（这东西在表达什么），不是颜色名 ——
 * "危险"是一个语义，"红"只是一种表达。
 */
export const SEMANTIC_COLORS = Object.freeze({
  // 战斗状态三件套。三者在任何一档里都必须互不同色（门禁钉住）。
  danger: c('危险', '!', {
    default: 0xff4444,
    deuteranopia: 0xff9a00,   // 红→橙黄（红绿型最易混的就是红与绿）
    protanopia: 0xffb000,
    tritanopia: 0xff4488,     // 蓝黄型对红仍可辨，但避开与黄撞
  }),
  warning: c('警告', '▲', {
    default: 0xffaa44,
    deuteranopia: 0xffffff,   // 提到纯白：与 danger 的橙黄靠明度拉开
    protanopia: 0xfff2cc,
    tritanopia: 0xffcc44,
  }),
  safe: c('恢复', '+', {
    default: 0x63d97a,
    deuteranopia: 0x66ccff,   // 绿→青蓝（红绿型下蓝黄轴仍可辨）
    protanopia: 0x4ea8ff,
    tritanopia: 0x66d9c0,
  }),
  resource: c('资源', '◆', {
    default: 0x66ccff,
    deuteranopia: 0xaa88ff,
    protanopia: 0xaa88ff,
    tritanopia: 0x8899ff,
  }),
  // 稀有度四档：默认档与**装备稀有度显示表的旧值**逐格同值（零视觉变更；
  // 那张表现在反过来从这四条取值，`content/gear.js` 只做 id → 语义键的翻译）。
  // 色盲档走**明度递进 + 形状递进**（○◇◆★），两条冗余互相印证。
  // 注：这里刻意不写那张表的标识符 —— `tests/gear-drop.test.js` 有一条静态门禁
  // 按标识符点名"谁在读它"，注释里提一句会把它误算成第二个读者。
  'rarity-common': c('凡品', '○', {
    default: 0xbfc7d1, deuteranopia: 0xc0c0c0, protanopia: 0xc0c0c0, tritanopia: 0xc8c8d8,
  }),
  'rarity-uncommon': c('良品', '◇', {
    default: 0x63d97a, deuteranopia: 0xffe066, protanopia: 0xffd633, tritanopia: 0x9fe8b0,
  }),
  'rarity-rare': c('稀有', '◆', {
    // tritanopia 那一格第一版与默认档**同值**（写成 0x4ea8ff），被 ② 那条门禁当场抓出来 ——
    // 同值意味着这一档对"稀有"这个语义什么都没做，那就是个空转的档位。
    default: 0x4ea8ff, deuteranopia: 0x66d9ff, protanopia: 0x66d9ff, tritanopia: 0x8fc4ff,
  }),
  'rarity-epic': c('史诗', '★', {
    default: 0xc77bff, deuteranopia: 0xff99ee, protanopia: 0xff99ee, tritanopia: 0xd9a0ff,
  }),
});

/** 语义键清单（由表推导 —— 加一条只需要往表里加一行） */
export const SEMANTIC_IDS = Object.freeze(Object.keys(SEMANTIC_COLORS));

/** 任一档下都不许撞色的三个语义（门禁钉住） */
export const DISTINCT_IN_ANY_MODE = Object.freeze(['danger', 'warning', 'safe']);

/** 取一条语义；认不出就抛（说得出有哪些键） */
export function semanticOf(id) {
  const hit = SEMANTIC_COLORS[id];
  if (!hit) {
    throw new Error(`semanticOf: 未知的语义色 "${id}"，可用的是 ${SEMANTIC_IDS.join(' / ')}`);
  }
  return hit;
}

/** 取某语义在某档下的颜色；档位认不出就抛 */
export function semanticColor(id, mode = 'default') {
  if (!COLOR_MODES.includes(mode)) {
    throw new Error(`semanticColor: 未知的色觉档 "${mode}"，可用的是 ${COLOR_MODES.join(' / ')}`);
  }
  return semanticOf(id).colors[mode];
}

/** 非颜色冗余：形状符号 */
export const semanticGlyph = (id) => semanticOf(id).glyph;

/** 非颜色冗余：词 */
export const semanticLabel = (id) => semanticOf(id).label;

/** 稀有度 id → 语义键（`common` → `rarity-common`） */
export const raritySemanticId = (rarityId) => `rarity-${rarityId}`;
