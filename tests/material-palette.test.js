/**
 * W-C5 切片8 调色板 —— 实体表面底色的单一所有者（`src/content/materialPalette.js`）
 *
 * ## 修的是什么
 *
 * W-C5 前七个表面切片把法线/粗糙度收进了 `materialSurfaces.js` 与烘焙贴图，但每片的
 * 交付说明都留着同一句"**颜色仍归各材料**"。改前普查（`.tmp-20261007/wc5s8-census2.mjs`）：
 * 11 个文件的几何材料里散着 **104 处** `0x` 颜色字面量、**81 种**色值，其中 15 种被抄了
 * ≥2 份（38 个站点）—— 同一桶"门板木色" `0x3a3028` 在副本几何、路灯柱、营火木牌三处各一份；
 * "鎏金" `0xc9a962` 在剑、时环、枢纽环、八面幡四处各一份。抄本的症状不是今天算错
 * （它们今天恰好同值），而是**改一个色要改四处，漏一处的症状是静默偏色**。
 *
 * ## 收录边界（表本体在 `materialPalette.js` 的模块文档里，这里只钉读数）
 *
 * **入表**：实体几何的表面底色。**不入表**（留在原处，由本文件 ④ 层逐文件钉住）：
 * 光与自发光、标记与界面（POI/血条/预警/招牌身份色）、招式特效、`instanceColor` 的
 * 白色乘色基底、已别处单一所有的（副本 theme/accent、敌人名册、`semanticColors`、
 * `ZoneIdentity` 的 mapColor）。人口是那 11 个文件（六种烘焙表面的消费方 + 相邻实体
 * 表面 + 共享几何助手 `BaseZone`）；**其余区域（魔法/太空/深渊/微光/辐光）的表面色不在本片** ——
 * 等各自的表面切片再搬进来。
 *
 * ## 零视觉变更
 *
 * 每一格的值取自改前在役的字面量（普查逐行可查），消费者改读表之后逐格同值。
 * 本文件之外还有三条**运行时**见证恰好钉着其中几枚值：`enemy-armor-surface`（0x553333 =
 * `armor.fallback`）、`player-weapon-surface`（0xc9a962 = `metal.gilt`）、`region-surface`
 * （0x8a8580 = `stone.pale`）—— 它们读的是真消费者建出来的材质，改表就会红。
 *
 * ## 用例分五层
 * ① 表值层：48 格逐格同值（历史字面量）；族名册与 `MATERIAL_PATHS` 由表推导，与期望闭合。
 * ② 契约层：`paletteOf` 取值；族名/条目/深路径三处认不出各当场抛，且报错文本读得到可用键。
 * ③ 冻结层：表、族、族里的数组三层深冻结 —— 改不动（`Reflect.set` 为假、数组 push 抛）。
 * ④ 残留层：16 个文件逐一钉"残留字面量"的**集合与条数**（合计 100 处 / 77 种）；尺先在一段
 *    陈旧字面上认过 —— 否则"扫到 0 处"可能只是在读空集。
 * ⑤ 引用层：15 个消费方逐文件钉 `paletteOf('…')` 调用数 + 提及数 + import 数（提及=调用，
 *    动态传参会让两者不等）；其余 src 文件 0 提及；每个字面路径有效且并集恰是那 48 格（无死格）。
 *
 * 反向证据由变异臂脚本 `.tmp-20261007/wc5s8-arms.mjs` 承担：改一格的值、把一个消费方
 * 退回字面量、删掉守卫、解开冻结，各点名哪几档会红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  MATERIAL_PALETTE,
  MATERIAL_FAMILIES,
  MATERIAL_PATHS,
  paletteOf,
} from '../src/content/materialPalette.js';

const SRC = join(process.cwd(), 'src');

/** 剥注释但保留行数（跟普查同一把帚 —— `materialPalette.js` 文档里的示例 `paletteOf('族.条目')` 不算调用） */
function 去注释(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (_all, head) => `${head}${' '.repeat(Math.max(0, _all.length - head.length))}`);
}

/** 同一把尺：`0x` 字面量（不限位数）→ 小写、保持出现顺序 */
const 扫字面量 = (text) => [...text.matchAll(/0x[0-9a-fA-F]+\b/g)].map((m) => m[0].toLowerCase());

/** 同一把尺：`paletteOf('…')` 字面调用 → 路径列表 */
const 扫调用 = (text) => [...text.matchAll(/paletteOf\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);

const 数提及 = (text) => (text.match(/paletteOf\(/g) ?? []).length;

const 读 = (相对) => 去注释(readFileSync(join(SRC, 相对), 'utf8'));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** ① 逐格同值：值 = 改前在役的字面量；键 = `MATERIAL_PATHS` 全集 */
const 期望值 = {
  'wood.door': 0x3a3028,
  'wood.bridge': 0x5a4030,
  'wood.rail': 0x4a3525,
  'wood.post': 0x4a4035,
  'wood.bench': 0x4a3828,
  'wood.trunk': 0x4a3528,
  'wood.bark': 0x6a5040,
  'wood.zoneTrunk': 0x4a3020,
  'stone.pale': 0x8a8580,
  'stone.gray': 0x5a5550,
  'stone.fieldRock': 0x5a5558,
  'stone.tower': 0x6a6560,
  'stone.ruin': 0x7a756e,
  'stone.mountain': 0x7a8088,
  'stone.voidRock': 0x3a3548,
  'stone.voidPillar': 0x2a2535,
  'stone.arch': 0x3a2838,
  'stone.propTrunk': 0x6a5a48,
  'stone.propPost': 0x5a5048,
  'stone.zoneRock': 0x5a5a58,
  'metal.gilt': 0xc9a962,
  'metal.ring': 0xc9a030,
  'foliage.leaf': [0x3a5a32, 0x2d4a28, 0x456838, 0x5a7040],
  'foliage.wild': 0x2a4030,
  'foliage.zoneCrown': 0x2a5a30,
  'water.river': 0x3a6a8a,
  'fabric.awning': [0x884422, 0x225588, 0x446633],
  'crystal.hub': 0x88ccff,
  'crystal.wild': 0xaaddff,
  'crystal.shard': 0x8899cc,
  'armor.fallback': 0x553333,
  'stone.castleWall': 0x4a4458,
  'stone.castleRoof': 0x2a2040,
  'stone.abyssRock': 0x3a1828,
  'stone.gloomRock': 0x3a3a4a,
  'stone.radiantRock': 0xffcc88,
  'stone.spaceRock': 0x2a3545,
  'metal.quidditchRing': 0xffcc44,
  'metal.quidditchHoop': 0xffaa22,
  'metal.hull': 0x3a4048,
  'metal.engine': 0x2a3040,
  'metal.monolith': 0x111118,
  'foliage.forbidden': 0x0a1a10,
  'foliage.magicWild': 0x1a3020,
  'wood.book': 0x6a4030,
  'crystal.magic': 0x5533aa,
  'crystal.ice': 0xaaccff,
  'crystal.greenhouse': 0x88ccaa,
};

/** ④ 人口与钉板：16 个文件、残留字面量的集合与条数（读数来自普查脚本，同一把帚） */
const 残留钉板 = {
  'world/ProceduralDungeonGenerator.js': { 数: 0, 集: [] },
  'world/zones/FantasyZone.js': {
    数: 8,
    集: ['0x110022', '0x443300', '0x6a7a88', '0x88aa88', '0xc9a030', '0xff2244', '0xff6622'],
  },
  'world/zones/VoidZone.js': {
    数: 6,
    集: ['0x121018', '0x223355', '0x664400', '0x6688aa', '0xc9a962'],
  },
  'world/zones/BaseZone.js': { 数: 2, 集: ['0x87a8c4', '0xc9a962'] },
  'world/WorldManager.js': {
    数: 7,
    集: ['0x224466', '0x2a4a6a', '0x3d5c3a', '0x443300', '0x5a3a8a', '0x6a2040', '0x6a5a30'],
  },
  'world/WorldDecorations.js': {
    数: 12,
    集: ['0x224466', '0x443300', '0x4466bb', '0x4488cc', '0x6644aa', '0x668855',
      '0xaa2244', '0xaa8844', '0xff9922', '0xffcc66', '0xffffff'],
  },
  'world/RestPointEnhancer.js': { 数: 2, 集: ['0x221100', '0xffaa44'] },
  'effects/SceneEnhancer.js': { 数: 2, 集: ['0x2a3828', '0xc8d8f0'] },
  'combat/Enemy.js': {
    // W-E3 切片2：敌方治疗域的圈色（`0x66ff99`）—— 治疗域是**绿色**的一圈，
    // 与所有红色危险区一眼分得开（玩家看到绿圈要知道那是敌方在给自己回血）。
    数: 18,
    集: ['0x222222', '0x224466', '0x335577', '0x442266', '0x4a2f7a', '0x66ff99', '0x88bbff',
      '0xaa66ff', '0xaaddff', '0xbfa8ff', '0xcc3333', '0xff0000', '0xff2222', '0xff4444',
      '0xffcc44', '0xffee88', '0xffff44'],
  },
  'player/PlayerController.js': { 数: 1, 集: ['0x332200'] },
  'world/regionSurfaces.js': { 数: 0, 集: [] },
  'world/zones/MagicZone.js': {
    数: 11,
    集: ['0x1a1530', '0x220044', '0x443300', '0x44aa66', '0x6644cc', '0x8844ff', '0xaa44ff',
      '0xaa66ff', '0xaa88ff', '0xffaa44'],
  },
  'world/zones/SpaceZone.js': {
    数: 11,
    集: ['0x000000', '0x050810', '0x112244', '0x4488ff', '0x66aaff', '0x66ccff',
      '0x88aacc', '0x88ccff', '0xff8844', '0xffffff'],
  },
  'world/zones/AbyssZone.js': {
    数: 7,
    集: ['0x120810', '0x880022', '0xff0044', '0xff2244', '0xff4488'],
  },
  'world/zones/GloomZone.js': {
    数: 7,
    集: ['0x1a1a2a', '0x2a2a4a', '0x3a3a5a', '0x4a4a6a', '0x6a6a8a'],
  },
  'world/zones/RadiantZone.js': {
    数: 7,
    集: ['0xffaa00', '0xffcc00', '0xffee00', '0xffeeaa'],
  },
};

/** ⑤ 引用钉板：消费方逐文件 {调用, 提及, import}；新增消费方要把人口与钉子一起改 */
const 引用钉板 = {
  'world/ProceduralDungeonGenerator.js': { 调用: 1, 提及: 1, import: 1 },
  'world/zones/FantasyZone.js': { 调用: 11, 提及: 11, import: 1 },
  // W-E3 切片35 之后 W-C2/W-D2 归位（2026-10-30）：seal-stone / echo-pages 两座 POI 的标记色
  // 一开始写的是裸字面量（0x9fd8ff、0xd8b46a），④ 残留层当场红 —— 这两格改走调色板
  // （`crystal.ice` / `metal.gilt`：与原有桶同族，不为它们新开一格）。残留层因此一格没涨，
  // 涨的是这里：VoidZone 4 → 5、MagicZone 10 → 11。
  'world/zones/VoidZone.js': { 调用: 5, 提及: 5, import: 1 },
  'world/zones/BaseZone.js': { 调用: 3, 提及: 3, import: 1 },
  'world/WorldManager.js': { 调用: 4, 提及: 4, import: 1 },
  // 切片H 给八面幡补了幡杆（`hubBannerPole`），杆的材质走调色板的 `wood.door` ——
  // 那是**已有的一条路径**（灯柱在用），所以路径集合不变，只有这一处的调用/提及各多 1。
  'world/WorldDecorations.js': { 调用: 13, 提及: 13, import: 1 },
  'world/RestPointEnhancer.js': { 调用: 2, 提及: 2, import: 1 },
  'effects/SceneEnhancer.js': { 调用: 3, 提及: 3, import: 1 },
  'combat/Enemy.js': { 调用: 1, 提及: 1, import: 1 },
  'player/PlayerController.js': { 调用: 1, 提及: 1, import: 1 },
  'world/zones/MagicZone.js': { 调用: 11, 提及: 11, import: 1 },
  'world/zones/SpaceZone.js': { 调用: 5, 提及: 5, import: 1 },
  'world/zones/AbyssZone.js': { 调用: 1, 提及: 1, import: 1 },
  'world/zones/GloomZone.js': { 调用: 1, 提及: 1, import: 1 },
  'world/zones/RadiantZone.js': { 调用: 1, 提及: 1, import: 1 },
};
const 定义文件 = 'content/materialPalette.js';

describe('W-C5 切片8 调色板', () => {
  describe('① 表值层：48 格逐格同值，名册由表推导', () => {
    it('每格经 paletteOf 取到的值与历史字面量相同', () => {
      for (const [路径, 期望] of Object.entries(期望值)) {
        expect(paletteOf(路径), 路径).toEqual(期望);
      }
    });

    it('期望集合与 MATERIAL_PATHS 闭合（48 格，两侧都不多不少）', () => {
      expect(MATERIAL_PATHS.length, '条目总数').toBe(48);
      expect([...MATERIAL_PATHS].sort(), 'MATERIAL_PATHS').toEqual(Object.keys(期望值).sort());
    });

    it('族名册恰好八族，且与表的顶层键一致', () => {
      expect([...MATERIAL_FAMILIES].sort()).toEqual(
        ['armor', 'crystal', 'fabric', 'foliage', 'metal', 'stone', 'water', 'wood'],
      );
      expect(MATERIAL_FAMILIES).toEqual(Object.keys(MATERIAL_PALETTE));
    });
  });

  describe('② 契约层：取值与「认不出就抛」', () => {
    it('取值：色值是数字，多值格是数组', () => {
      expect(paletteOf('wood.door')).toBe(0x3a3028);
      expect(paletteOf('foliage.leaf')).toEqual([0x3a5a32, 0x2d4a28, 0x456838, 0x5a7040]);
      expect(paletteOf('metal.gilt')).toBe(0xc9a962);
    });

    it('族名认不出：当场抛，报错里读得到写错的段与这一步可用的键', () => {
      let 炸;
      try { paletteOf('wooden.door'); } catch (e) { 炸 = e; }
      expect(炸, 'wooden.door 必须抛').toBeInstanceOf(Error);
      expect(炸.message, '报错文本').toContain('wooden');
      expect(炸.message, '报错文本要报出可用键').toMatch(/可用/);
      expect(炸.message, '可用键里要有 wood').toContain('wood');
    });

    it('条目认不出：当场抛，报出这一族的可用条目', () => {
      let 炸;
      try { paletteOf('wood.nope'); } catch (e) { 炸 = e; }
      expect(炸, 'wood.nope 必须抛').toBeInstanceOf(Error);
      expect(炸.message).toContain('wood.nope');
      expect(炸.message, '可用条目里要有 door').toContain('door');
    });

    it('深路径（数值再往下取）：抛，且说明上一层不是表', () => {
      expect(() => paletteOf('wood.door.x')).toThrow(/上一层不是表/);
    });
  });

  describe('③ 冻结层：三层深冻结，改不动', () => {
    it('表与每一族都是冻结的', () => {
      expect(Object.isFrozen(MATERIAL_PALETTE)).toBe(true);
      for (const 族 of MATERIAL_FAMILIES) {
        expect(Object.isFrozen(MATERIAL_PALETTE[族]), 族).toBe(true);
      }
    });

    it('族里的数组也是冻结的：改值不生效、push 抛 TypeError', () => {
      expect(Object.isFrozen(MATERIAL_PALETTE.foliage.leaf)).toBe(true);
      expect(Object.isFrozen(MATERIAL_PALETTE.fabric.awning)).toBe(true);
      expect(Reflect.set(MATERIAL_PALETTE.metal, 'gilt', 0), '冻结对象的改写必须失败').toBe(false);
      expect(MATERIAL_PALETTE.metal.gilt, '值保持原样').toBe(0xc9a962);
      expect(() => { MATERIAL_PALETTE.foliage.leaf.push(0x000000); }).toThrow(TypeError);
      expect(MATERIAL_PALETTE.foliage.leaf.length, '数组长度不变').toBe(4);
    });
  });

  describe('④ 残留层：16 个文件的残留字面量逐文件钉死', () => {
    it('尺先在陈旧字面上认过（识别力下限；注释里的不算）', () => {
      const 样例 = 'a 0x3a3028 b 0xfff c 0x11223344; // 0xdeadbeef\n/* 0x00ff00 */\n';
      expect(扫字面量(去注释(样例)), '尺要认得出 6/3/8 位，且不把注释算进来').toEqual(
        ['0x3a3028', '0xfff', '0x11223344'],
      );
    });

    it('逐文件：集合与条数都不许漂（合计 100 处 / 77 种）', () => {
      let 总 = 0;
      const 全 = new Set();
      for (const [文件, 期望] of Object.entries(残留钉板)) {
        const 命中 = 扫字面量(读(文件));
        总 += 命中.length;
        for (const v of 命中) 全.add(v);
        expect([...new Set(命中)].sort(), `${文件} 的残留字面量集合`).toEqual(期望.集);
        expect(命中.length, `${文件} 的残留字面量条数`).toBe(期望.数);
      }
      // W-E3 切片2：新增敌方治疗域的圈色（0x66ff99）—— 合计 100 → 101 处 / 77 → 78 种
      expect(总, '残留字面量合计').toBe(101);
      expect(全.size, '残留字面量不同值合计').toBe(78);
    });
  });

  describe('⑤ 引用层：paletteOf 站点逐文件钉死，字面路径全部有效', () => {
    const 读数 = new Map();
    for (const f of walk(SRC)) {
      const 相对 = relative(SRC, f).split(sep).join('/');
      const 文 = 去注释(readFileSync(f, 'utf8'));
      读数.set(相对, {
        调用: 扫调用(文),
        提及: 数提及(文),
        import: (文.match(/import\s*\{[^}]*\bpaletteOf\b[^}]*\}\s*from/g) ?? []).length,
      });
    }

    it('15 个消费文件：调用 = 提及（动态传参会让两者不等），import 恰好一次', () => {
      let 调用总 = 0;
      for (const [文件, 期望] of Object.entries(引用钉板)) {
        const 实 = 读数.get(文件);
        expect(实, `${文件} 要在 src 树里`).toBeTruthy();
        调用总 += 实.调用.length;
        expect(实.调用.length, `${文件} 的字面调用数`).toBe(期望.调用);
        expect(实.提及, `${文件} 的 paletteOf( 提及数`).toBe(期望.提及);
        expect(实.提及, `${文件}：提及数 ≠ 调用数 —— 只准传字面路径`).toBe(实.调用.length);
        expect(实.import, `${文件} 的 import 数`).toBe(期望.import);
      }
      expect(调用总, '消费方调用合计').toBe(63);
    });

    it('其余 src 文件 0 提及；定义文件自己 0 字面调用', () => {
      for (const [文件, 实] of 读数) {
        if (文件 === 定义文件) {
          expect(实.调用.length, `${定义文件} 不该引用自己`).toBe(0);
          continue;
        }
        if (引用钉板[文件]) continue;
        expect(实.提及, `${文件} 不该触碰 paletteOf —— 新增消费方要把这一层的人口与钉子一起改`).toBe(0);
      }
    });

    it('每个字面路径都解析得开，且并集恰是表里那 48 格（无死格）', () => {
      const 引用 = new Set();
      for (const [, 实] of 读数) for (const p of 实.调用) 引用.add(p);
      for (const p of 引用) {
        expect(() => paletteOf(p), `引用 ${p}`).not.toThrow();
        expect(MATERIAL_PATHS, `引用 ${p} 要在表里`).toContain(p);
      }
      expect([...引用].sort(), '被引用的路径集合 = 表的条目全集').toEqual([...MATERIAL_PATHS].sort());
    });
  });
});
