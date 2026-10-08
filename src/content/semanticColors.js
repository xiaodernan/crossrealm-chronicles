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
 * `default` 一列的值取自**改前在役的那些色**：稀有度四档对齐装备稀有度显示表的旧值，
 * 战斗三件套自切片4 起对齐 HUD 三条状态条的亮端（血条 `#cc4444` / 精力条 `#c9a962` /
 * 法力条 `#8866cc`）；Boss 血条与架势条自切片6 起对齐它们各自改前那一枚
 * （`#ff3333` / `#8888ff`）。见 `ui/barTheme.js`。所以接上消费者之后默认档**零视觉变更**。
 * 调色是美术决定，机制片不夹带。
 *
 * ## 为什么 Boss 血条不直接用 `danger`
 * 它俩是同一个语义（"有东西在掉血"），但**同时出现在屏幕上**：玩家血条在左下，
 * Boss 血条在顶部居中。共用一个语义的后果是换档时两条一起变、变成同一枚色 ——
 * 那时"我的血"与"它的血"只剩位置可分。所以另立 `threat`，并让 `DISTINCT_IN_ANY_MODE`
 * 把这一对钉住：任何一档下都不许撞色。
 *
 * ## 切片3 补上"现在是哪一档"
 * 上面那一层只回答"某个语义在某个档下是什么颜色"，**不回答当前是哪一档** ——
 * 后者是 `game/ColorVision.js` 的模块级当前档（与 `game/Difficulty.js` 同一形状），
 * 唯一写入口是 `SettingsManager.applyToGame` 里的 `setColorVision`。分成两层是为了
 * 让 content/ 继续不依赖 game/：表是纯数据，当前档是运行时状态。
 */

/** 色觉档位。`default` 是出厂档；其余三档是常见的色觉异常类型 */
export const COLOR_MODES = Object.freeze(['default', 'deuteranopia', 'protanopia', 'tritanopia']);

/** 出厂色觉档，也是存储脏值的回落点 */
export const DEFAULT_COLOR_MODE = 'default';

/**
 * 四个档位给人看的名字。放在这里而不是面板里，理由与 `content/difficulty.js` 的
 * `label` 一样：**选项名单只有一个来源**（面板从 `colorVisionOptions()` 现推），
 * 抄第二份的表现是"加了第四个档位而面板里只有三个"—— 不报错，只是选不到。
 */
export const COLOR_VISION_LABELS = Object.freeze({
  default: '默认',
  deuteranopia: '红绿色盲',
  protanopia: '红色盲',
  tritanopia: '蓝黄色盲',
});

/**
 * 存储脏值回落出厂档，**不抛** —— 与 `normalizeDifficulty` / `normalizeShadowQuality`
 * 同一先例：这一格是玩家可写的 localStorage，一行手改的错字不该把开机炸了。
 * （代码里写死的档位仍然该抛 —— 那条路由 `semanticColor` 自己守。）
 */
export function normalizeColorVision(mode) {
  return COLOR_MODES.includes(mode) ? mode : DEFAULT_COLOR_MODE;
}

const c = (label, glyph, colors) => Object.freeze({ label, glyph, colors: Object.freeze(colors) });

/**
 * 语义色表。键是**语义**（这东西在表达什么），不是颜色名 ——
 * "危险"是一个语义，"红"只是一种表达。
 */
export const SEMANTIC_COLORS = Object.freeze({
  // 战斗状态三件套。三者在任何一档里都必须互不同色（门禁钉住）。
  danger: c('危险', '!', {
    // 切片4 起对齐在役的血条亮端 `#cc4444`（HUD 状态条从这一格取色，见 ui/barTheme.js）
    default: 0xcc4444,
    deuteranopia: 0xff9a00,   // 红→橙黄（红绿型最易混的就是红与绿）
    protanopia: 0xffb000,
    tritanopia: 0xff4488,     // 蓝黄型对红仍可辨，但避开与黄撞
  }),
  warning: c('警告', '▲', {
    // 切片4 起对齐在役的精力条亮端 `#c9a962`
    default: 0xc9a962,
    deuteranopia: 0xffffff,   // 提到纯白：与 danger 的橙黄靠明度拉开
    protanopia: 0xfff2cc,
    tritanopia: 0xffcc44,
  }),
  safe: c('恢复', '+', {
    // 与 rarity-uncommon 的绿错开一格：两个语义撞色，玩家在治疗提示与良品光晕前分不出谁是谁
    default: 0x4fd68a,
    deuteranopia: 0x66ccff,   // 绿→青蓝（红绿型下蓝黄轴仍可辨）
    protanopia: 0x4ea8ff,
    tritanopia: 0x66d9c0,
  }),
  resource: c('资源', '◆', {
    // 切片4 起对齐在役的法力条亮端 `#8866cc`
    default: 0x8866cc,
    deuteranopia: 0xaa88ff,
    protanopia: 0x9a7bff,
    tritanopia: 0x8899ff,
  }),
  threat: c('威胁', '☠', {
    // 切片6 起对齐在役的 Boss 血条亮端 `#ff3333`。
    // 色盲档走**深红**而不是另一个色相：这一条要的还是"它是红的、而且比我自己的血更凶"，
    // 靠明度与 `danger` 的橙黄 / 琥珀拉开（`DISTINCT_IN_ANY_MODE` 钉住这一对不许撞）。
    default: 0xff3333,
    deuteranopia: 0xd7263d,
    protanopia: 0xc0392b,
    tritanopia: 0xe01e37,
  }),
  posture: c('架势', '◈', {
    // 切片6 起对齐在役的架势条亮端 `#8888ff`。
    // 这一条是蓝黄色盲（tritanopia）最吃亏的一格 —— 改前 `#8888ff` 在那一档下几乎读不出明暗。
    // 色盲档统一压成**深蓝**：色相还在"蓝"这一族里，明度与 `resource` / `rarity-rare` 拉开。
    default: 0x8888ff,
    deuteranopia: 0x2b4acb,
    protanopia: 0x3d5afe,
    tritanopia: 0x3949ab,
  }),
  // 稀有度四档：默认档与**装备稀有度显示表的旧值**逐格同值（零视觉变更；
  // 那张表现在反过来从这四条取值，`content/gear.js` 只做 id → 语义键的翻译）。
  // 色盲档走**明度递进 + 形状递进**（○◇◆★），两条冗余互相印证。
  // 注：这里刻意不写那张表的标识符 —— `tests/gear-drop.test.js` 有一条静态门禁
  // 按标识符点名"谁在读它"，注释里提一句会把它误算成第二个读者。
  'rarity-common': c('凡品', '○', {
    default: 0xbfc7d1, deuteranopia: 0xc0c0c0, protanopia: 0xd2d2dc, tritanopia: 0xc8c8d8,
  }),
  'rarity-uncommon': c('良品', '◇', {
    default: 0x63d97a, deuteranopia: 0xffe066, protanopia: 0xffd633, tritanopia: 0x9fe8b0,
  }),
  'rarity-rare': c('稀有', '◆', {
    // tritanopia 那一格第一版与默认档**同值**（写成 0x4ea8ff），被 ② 那条门禁当场抓出来 ——
    // 同值意味着这一档对"稀有"这个语义什么都没做，那就是个空转的档位。
    default: 0x4ea8ff, deuteranopia: 0x66d9ff, protanopia: 0x8fd4ff, tritanopia: 0x8fc4ff,
  }),
  'rarity-epic': c('史诗', '★', {
    default: 0xc77bff, deuteranopia: 0xff99ee, protanopia: 0xffb0e8, tritanopia: 0xd9a0ff,
  }),
});

/** 语义键清单（由表推导 —— 加一条只需要往表里加一行） */
export const SEMANTIC_IDS = Object.freeze(Object.keys(SEMANTIC_COLORS));

/** 任一档下都不许撞色的四个语义（门禁钉住）。含 `threat`：它与 `danger` 同屏出现 */
export const DISTINCT_IN_ANY_MODE = Object.freeze(['danger', 'warning', 'safe', 'threat']);

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










