/**
 * 区域身份 —— 全仓唯一的区域 key 来源（修 B36 / B35）。
 *
 * 改动之前：区域身份靠**中文显示名**做 `includes()` 匹配，重复 ≥5 处、散落在
 * 15 个文件里（`info.name.includes('米勒')` 这类）。后果是：
 * - 改一个字幕文案就会**静默**丢掉该区域的特效、天气、音频与叙事钩子，
 *   不报错、不降级，只是"这个区突然没音乐了"；
 * - 枢纽在 `WorldManager.applyHubAtmosphere()` 里是用一个**伪造对象**
 *   `{ info: { name: '交汇枢纽' } }` 冒充区域（B35），任何按
 *   `zone.id / zone.colliders / zone.radius` 取用的代码在枢纽内静默拿到 `undefined`；
 * - 单测没法钉住"哪个区走哪条分支"，因为测试也得跟着写中文字符串。
 *
 * 现在：区域自带稳定的英文 `id`，逻辑一律用 id；显示名只用于 UI 文本。
 * 枢纽与"区际走廊"这两个没有 Zone 实例的地方，也各有一份**真描述对象**
 * （`HUB_ZONE` / `CORRIDOR_ZONE`，带 id、几何与文案），而不是临时的假壳。
 * 未知区域回退到 `UNKNOWN` 并**在开发期喊出来**（静默兜底正是这个缺陷的成因，不能再留）。
 *
 * 本模块只放"身份与文案"，不放玩法数值：区域雾色、天气、音效仍归各系统。
 */

/** @type {Record<string, string>} */
export const ZONE_IDS = {
  HUB: 'hub',
  FANTASY: 'fantasy',
  MAGIC: 'magic',
  SPACE: 'space',
  VOID: 'void',
  ABYSS: 'abyss',
  /** 新增：幽暗林地 — 迷雾缠绕的古老森林，介于幻想与虚空之间 */
  GLOOM: 'gloom',
  /** 新增：辉煌圣域 — 金色沙海中的光辉神殿，连接魔法与深渊 */
  RADIANT: 'radiant',
  /** 位面之间的空旷走廊：不属于任何区域，大气取中性 */
  CORRIDOR: 'corridor',
  /** 兜底：不应该出现，出现即为接线错误 */
  UNKNOWN: 'unknown',
};

/** 所有"真实区域"（不含枢纽与走廊），顺序与 WorldManager.build() 一致 */
export const ZONE_ORDER = [
  ZONE_IDS.FANTASY,
  ZONE_IDS.MAGIC,
  ZONE_IDS.SPACE,
  ZONE_IDS.VOID,
  ZONE_IDS.ABYSS,
  ZONE_IDS.GLOOM,
  ZONE_IDS.RADIANT,
];

/**
 * 中文显示名 → id。**只用于迁移期与存档兼容**，新代码不得使用。
 *
 * 导出它**不是**为了让谁拿去做判定（那正是 B36 的病），而是让门禁能从两张表**推导**
 * "哪些名字曾经是区名、现在不是了"（`keys(本表) - values(ZONE_NAMES)`），
 * 于是"废弃区名还活在文案里"当场红 —— 而不是靠有人在测试里手抄一份旧名名单。
 * 唯一的读者是下面的 `zoneIdOf()`（旧数据按中文名回退那一条分支）。
 */
export const LEGACY_NAME_TO_ID = {
  交汇枢纽: ZONE_IDS.HUB,
  灰白森林: ZONE_IDS.FANTASY,
  魔法遗境: ZONE_IDS.MAGIC,
  霍格沃兹遗境: ZONE_IDS.MAGIC,
  米勒荒原: ZONE_IDS.SPACE,
  破碎时线: ZONE_IDS.VOID,
  混沌边境: ZONE_IDS.ABYSS,
  区际走廊: ZONE_IDS.CORRIDOR,
};

/** 显示名（UI 用）。与 id 分开维护，改文案不再影响逻辑。 */
export const ZONE_NAMES = {
  [ZONE_IDS.HUB]: '交汇枢纽',
  [ZONE_IDS.FANTASY]: '灰白森林',
  [ZONE_IDS.MAGIC]: '霍格沃兹遗境',
  [ZONE_IDS.SPACE]: '米勒荒原',
  [ZONE_IDS.VOID]: '破碎时线',
  [ZONE_IDS.ABYSS]: '混沌边境',
  [ZONE_IDS.GLOOM]: '幽暗林地',
  [ZONE_IDS.RADIANT]: '辉煌圣域',
  [ZONE_IDS.CORRIDOR]: '区际走廊',
};

/**
 * 枢纽 —— 世界之锚所在，`WorldManager` 直接把它当区域对象用。
 *
 * `radius` 是"算在枢纽里"的平面半径（大气与镜头归属），`mapRadius` 是小地图上
 * 画的那一圈；两者原本就不同值（地图圈故意画小），拆开命名而不是悄悄取同一个数。
 */
export const HUB_ZONE = Object.freeze({
  id: ZONE_IDS.HUB,
  center: Object.freeze({ x: 0, z: 55 }),
  radius: 50,
  mapRadius: 45,
  mapColor: '#888866',
  info: Object.freeze({
    id: ZONE_IDS.HUB,
    name: ZONE_NAMES[ZONE_IDS.HUB],
    subtitle: '位面中心',
    description: '三条古径通向不同的位面碎片。世界之锚在此闪烁，等待被修复。',
  }),
});

/** 区际走廊 —— 不属于任何位面，中性大气；它同样要有身份，不能是 `null` */
/** 幽暗林地 —— 迷雾缠绕的古老森林，介于幻想与虚空之间 */
export const GLOOM_ZONE = Object.freeze({
  id: ZONE_IDS.GLOOM,
  center: Object.freeze({ x: 180, z: 100 }),
  radius: 160,
  mapRadius: 145,
  mapColor: '#3a3a4a',
  info: Object.freeze({
    id: ZONE_IDS.GLOOM,
    name: ZONE_NAMES[ZONE_IDS.GLOOM],
    subtitle: '幽暗森林 · 迷雾之境',
    description: '永恒的薄雾笼罩着扭曲的树木。这里没有阳光，只有微弱的荧光苔藓指引方向。',
  }),
});

/** 辉煌圣域 — 金色沙海中的光辉神殿，连接魔法与深渊 */
export const RADIANT_ZONE = Object.freeze({
  id: ZONE_IDS.RADIANT,
  center: Object.freeze({ x: -180, z: -160 }),
  radius: 150,
  mapRadius: 135,
  mapColor: '#ffd700',
  info: Object.freeze({
    id: ZONE_IDS.RADIANT,
    name: ZONE_NAMES[ZONE_IDS.RADIANT],
    subtitle: '金沙圣域 · 晨曦之地',
    description: '流动的金沙构成的宏伟宫殿。晨曦初照时，整座城市都在发光。',
  }),
});

/** 区际走廊 —— 不属于任何区域，大气取中性 */
export const CORRIDOR_ZONE = Object.freeze({
  id: ZONE_IDS.CORRIDOR,
  center: null,
  radius: 0,
  mapRadius: 0,
  mapColor: null,
  info: Object.freeze({
    id: ZONE_IDS.CORRIDOR,
    name: ZONE_NAMES[ZONE_IDS.CORRIDOR],
    subtitle: '位面之间',
    description: '碎片之间的空旷走廊，风声代替区域的主题。',
  }),
});

/** 按 id 取静态描述（枢纽与走廊没有 Zone 实例，文案从这里拿） */
export function zoneDescriptor(id) {
  if (id === ZONE_IDS.HUB) return HUB_ZONE;
  if (id === ZONE_IDS.GLOOM) return GLOOM_ZONE;
  if (id === ZONE_IDS.RADIANT) return RADIANT_ZONE;
  if (id === ZONE_IDS.CORRIDOR) return CORRIDOR_ZONE;
  return null;
}

/**
 * 把一个区域对象（或它的 info）解析成稳定 id。
 * 优先读 `id`；只对**存档/旧数据**回退到中文名匹配。
 *
 * @param {{ id?: string, info?: { id?: string, name?: string }, name?: string } | null | undefined} zone
 * @returns {string}
 */
export function zoneIdOf(zone) {
  if (!zone) return ZONE_IDS.UNKNOWN;
  const direct = zone.id ?? zone.info?.id;
  if (direct) return direct;
  const name = zone.info?.name ?? zone.name;
  if (name && LEGACY_NAME_TO_ID[name]) return LEGACY_NAME_TO_ID[name];
  // 开发期喊出来：静默兜底是 B35/B36 的成因
  if (typeof console !== 'undefined' && name) {
    console.warn(`[zone] 无法解析区域 id（name="${name}"），已回退为 UNKNOWN。` +
      '请给该区域的 info 补上 id 字段 —— 逻辑不得依赖中文显示名。');
  }
  return ZONE_IDS.UNKNOWN;
}

/**
 * 由世界坐标反推区域 id —— 用几何而不是名字。
 * `zones` 是 WorldManager 维护的实例数组，各自带 `id / center / radius`。
 * 枢纽优先：它落在四区之间，按距离取最近会把"站在锚点上"算成某个位面。
 *
 * @param {{x: number, z: number}} pos
 * @param {Array<{id: string, center: {x: number, z: number}, radius: number}>} zones
 * @param {{hub?: {center: {x: number, z: number}, radius: number}}} [options]
 * @returns {string}
 */
export function zoneIdAt(pos, zones, options = {}) {
  const hub = options.hub ?? HUB_ZONE;
  const hubDist = Math.hypot(pos.x - hub.center.x, pos.z - hub.center.z);
  if (hubDist < hub.radius) return ZONE_IDS.HUB;

  let best = null;
  let bestDist = Infinity;
  for (const zone of zones ?? []) {
    const d = Math.hypot(pos.x - zone.center.x, pos.z - zone.center.z);
    if (d < zone.radius && d < bestDist) {
      bestDist = d;
      best = zone;
    }
  }
  return best?.id ?? ZONE_IDS.CORRIDOR;
}

/**
 * 按 id 找区域实例。致敬内容挂载器（`PopCultureZoneEnhancer*`）此前是用
 * `info.name.includes('米勒')` 或 `subtitle.includes('哈利')` 找区的，
 * 那是全仓最脆的一处文案耦合 —— 改字幕即整片 POI 消失。
 *
 * @param {Array<{id?: string, info?: {id?: string}}>} zones
 */
export function findZoneById(zones, id) {
  return (zones ?? []).find((z) => (z.id ?? z.info?.id) === id) ?? null;
}

/**
 * id → 区域对象，枢纽与走廊取各自的静态描述。
 * 用途是把几何判定的结果落回一个对象，于是 `WorldManager.currentZone`
 * 在任何位置上都是一个带 id 的真区域，而不是 `null` 或临时壳。
 */
export function resolveZone(zones, id) {
  return zoneDescriptor(id) ?? findZoneById(zones, id);
}

/** 该 id 是不是一个真实区域（用于"是否需要区域大气/特效"的判断） */
export function isRealZone(id) {
  return ZONE_ORDER.includes(id);
}
