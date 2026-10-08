/**
 * 材料调色板（W-C5 切片8）—— 世界实体表面底色的**单一所有者**。
 *
 * ## 为什么要有这一层
 *
 * 改前普查（`.tmp-20261007/wc5s8-census.mjs` / `wc5s8-census2.mjs`）：11 个文件
 * **104 处十六进制颜色字面量、81 种色值**；其中 15 种色值被抄了 ≥2 份（38 个站点）——
 * 同一桶"门板木色" `0x3a3028` 在副本几何、路灯柱、营火木牌三处各一份；"鎏金" `0xc9a962`
 * 在剑、时环、枢纽环、八面幡四处各一份。W-C5 的六个表面切片把法线/粗糙度收进了烘焙贴图
 * （`materialSurfaces.js` 是唯一一份表面规格），但每片的交付说明里都留了同一句
 * "颜色仍归各材料" —— 这一片把那句话兑现：**表面底色只说一处**。
 *
 * ## 收录边界（机械规则；用例逐文件钉住"残留字面量"的集合与条数）
 *
 * **入表**：几何是实体、`color` 是它的表面底色 —— 一眼看过去"这东西是什么做的"。
 * **不入表**（留在原处）：
 *   - 光与自发光：`Light` 的色、`emissive` 值、灯泡/光柱/光晕；
 *   - 标记与界面：POI 色、血条、预警圈、招牌身份色、锁定标记；
 *   - 招式与特效：能力外壳、符文、命中闪光；
 *   - 乘色基底：`instanceColor` 的白色基底（那是一次乘法，不是一种颜色）；
 *   - 已经别处单一所有的：副本 theme/accent（`content/dungeons.js`）、敌人名册色
 *     （`content/enemies.js`）、语义色（`semanticColors.js`）、区名色（`ZoneIdentity`）。
 *
 * 人口边界是那 11 个文件（六种烘焙表面的消费方 + 相邻实体表面 + 共享几何助手
 * `BaseZone`）。**W-C5 切片9 把其余五区（魔法/太空/深渊/微光/辐光）的表面底色也搬了进来** ——
 * 五区里仍在原处的是光与自发光、粒子、线框能量体、POI 身份色与 skyColor / mapColor
 * （逐文件逐条见 `tests/material-palette.test.js` 的残留钉板）。五区的**法线/粗糙度还没进烘焙管线**，
 * 那是各自表面切片的事（切片9 的记录在 §9）。
 *
 * ## 默认 = 现状，逐格同值
 *
 * 每一格的值取自**改前在役的字面量**（普查逐行可查），接上消费者之后逐格同值 ⇒
 * 默认零视觉变更。调色是美术决定，机制片不夹带。
 *
 * ## 认不出就抛
 *
 * 消费方一律走 `paletteOf('族.条目')`：键写错**当场抛错**并报出这一层可用的键 ——
 * 直接读表写错键会拿到 `undefined`，而 `undefined` 喂给 three 的 `color` 是**静默变白**，
 * 那是最难查的一类"看起来没事"。
 */

/** 三层深冻结：表、族、族里的数组（leaf / awning）都冻上 */
function deepFreeze(obj) {
  Object.freeze(obj);
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  }
  return obj;
}

export const MATERIAL_PALETTE = deepFreeze({
  /** 木 —— 门板 / 桥 / 摊位 / 路标 / 长椅 / 树干 */
  wood: {
    /** 副本门板 / 路灯柱 / 营火木牌板（深胡桃）—— 三处共用 */
    door: 0x3a3028,
    /** 精灵木桥板 / 集市摊位底座 */
    bridge: 0x5a4030,
    /** 木桥栏杆 */
    rail: 0x4a3525,
    /** 枢纽路标柱 / 营火木牌柱 */
    post: 0x4a4035,
    /** 集市长椅 */
    bench: 0x4a3828,
    /** 行道树干 */
    trunk: 0x4a3528,
    /** 树皮共享材质的 tint（`WorldDecorations.applyTreeTextures`） */
    bark: 0x6a5040,
    /** 区域树树干（`BaseZone.createTree`） */
    zoneTrunk: 0x4a3020,
    /** 魔法区漂浮古书（15 本共用） */
    book: 0x6a4030,
  },
  /** 石 —— 废墟 / 山体 / 散石 / 拱门 */
  stone: {
    /** 灰白森林废墟石柱（drum 表面）/ 山锥 rock tint */
    pale: 0x8a8580,
    /** 废墟残块 / 枢纽地标石柱（drum 表面） */
    gray: 0x5a5550,
    /** 世界散石（`WorldDecorations._scatterRocks`） */
    fieldRock: 0x5a5558,
    /** 至尊石环立柱 / 灰白守望塔 */
    tower: 0x6a6560,
    /** 断柱簇 */
    ruin: 0x7a756e,
    /** 灰白山脉的山锥 */
    mountain: 0x7a8088,
    /** 虚空区岩块 */
    voidRock: 0x3a3548,
    /** 方尖碑柱身（drum 表面的退路底色；自发光另算） */
    voidPillar: 0x2a2535,
    /** Boss 场入口拱门 */
    arch: 0x3a2838,
    /** 道具整备：树干 / 立柱类的 rock tint */
    propTrunk: 0x6a5a48,
    /** 道具整备：柱状道具的 rock tint */
    propPost: 0x5a5048,
    /** 区域山石（`BaseZone.createRock`） */
    zoneRock: 0x5a5a58,
    /** 魔法区悬浮城堡墙体 */
    castleWall: 0x4a4458,
    /** 魔法区城堡塔顶（锥顶共用一份） */
    castleRoof: 0x2a2040,
    /** 深渊区外野岩块（`AbyssZone.buildOuterWilds`） */
    abyssRock: 0x3a1828,
    /** 微光区外野岩块 */
    gloomRock: 0x3a3a4a,
    /** 辐光区外野岩块（暖白） */
    radiantRock: 0xffcc88,
    /** 太空区外野散石 */
    spaceRock: 0x2a3545,
  },
  /** 金属 —— 剑与金环、船体与方碑 */
  metal: {
    /** 鎏金：剑身（steel 表面）/ 时环 / 枢纽环 / 八面幡 */
    gilt: 0xc9a962,
    /** 至尊石环 */
    ring: 0xc9a030,
    /** 魔法区魁地奇大环 */
    quidditchRing: 0xffcc44,
    /** 魔法区魁地奇球筐（两处共用） */
    quidditchHoop: 0xffaa22,
    /** 太空区飞船壳体（船身 + 机翼共用） */
    hull: 0x3a4048,
    /** 太空区引擎舱 */
    engine: 0x2a3040,
    /** 太空区独石方碑（四根共用） */
    monolith: 0x111118,
  },
  /** 植被 */
  foliage: {
    /** 行道树冠四色（每棵随机取一） */
    leaf: [0x3a5a32, 0x2d4a28, 0x456838, 0x5a7040],
    /** 外野树（干 + 冠同色） */
    wild: 0x2a4030,
    /** 区域树冠（`BaseZone.createTree` 的锥形树冠） */
    zoneCrown: 0x2a5a30,
    /** 魔法区禁林树冠（深到近黑） */
    forbidden: 0x0a1a10,
    /** 魔法区外野针叶 */
    magicWild: 0x1a3020,
  },
  /** 水 */
  water: {
    /** 灰白森林溪流 */
    river: 0x3a6a8a,
  },
  /** 织物 */
  fabric: {
    /** 集市雨棚三色（每摊取一） */
    awning: [0x884422, 0x225588, 0x446633],
  },
  /** 晶体 / 玻璃 / 发光实体的底色（自发光值与光色不在此列） */
  crystal: {
    /** 世界之锚核心 / 枢纽喷泉环 */
    hub: 0x88ccff,
    /** 荒原野性水晶 */
    wild: 0xaaddff,
    /** 时线碎片 */
    shard: 0x8899cc,
    /** 魔法区外野水晶 / Boss 门拱（两处同色） */
    magic: 0x5533aa,
    /** 太空区冰构与冰刺（两处同色） */
    ice: 0xaaccff,
    /** 魔法区温室玻璃（透明实体表面） */
    greenhouse: 0x88ccaa,
  },
  /** 装甲 */
  armor: {
    /** 装甲板名册色的缺省（`Enemy` 的 `config.color ?? …`） */
    fallback: 0x553333,
  },
});

/** 族清单（由表推导） */
export const MATERIAL_FAMILIES = Object.freeze(Object.keys(MATERIAL_PALETTE));

/** 全部条目路径（`族.条目` 形式；表只有两层：族 → 条目） */
export const MATERIAL_PATHS = Object.freeze(
  Object.entries(MATERIAL_PALETTE).flatMap(([族, 表]) => Object.keys(表).map((键) => `${族}.${键}`)),
);

/** 取一格；族或条目认不出就抛（报出这一步可用的键） */
export function paletteOf(path) {
  const 段 = String(path).split('.');
  let 现 = MATERIAL_PALETTE;
  for (let i = 0; i < 段.length; i++) {
    const 上 = 现;
    现 = 上?.[段[i]];
    if (现 === undefined) {
      const 可用的 = 上 && typeof 上 === 'object' ? Object.keys(上).join(' / ') : '（上一层不是表）';
      throw new Error(
        `paletteOf: 未知的调色板路径 "${path}" —— "${段.slice(0, i + 1).join('.')}" 处认不出，这一步可用的是 ${可用的}`,
      );
    }
  }
  return 现;
}
