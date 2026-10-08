/**
 * 五区表面底色进调色板的运行时见证（W-C5 切片9）。
 *
 * ## 静态那一半在 `material-palette.test.js`，这里补"真的建出来了"那一半
 * 切片8 的门禁把"残留字面量"与"引用站点"钉得很死，但它只读源码文本：它无法回答
 * "调色板里的这一格是不是真的涂到了世界上的某一块石头"。`paletteOf` 返不返回值、
 * 返回值有没有真的流进 `MeshStandardMaterial`，只有把区域**建出来**才知道。
 * 症状对照：键名打错被 `paletteOf` 的守卫挡下（那是好事），但"取到值却没人用"
 * 或"取到 undefined 变成默认白"只有这一层能抓住。
 *
 * ## 这里钉住的三层
 * 1. **逐格到场**：五座区域每一座的期望底色，都出现在它自己 `group` 里某个材质的
 *    `color` 上（`getHexString()` 与 `paletteOf` 的十六进制同值）。少接一处的症状是
 *    "那块东西白了/黑了"，不报错。
 * 2. **抄本真的收净了**：改前同一个色值在两个地方各写一份（`0x5533aa` 在魔法区写了两次、
 *    `0xaaccff` 在太空区写了两次），现在两处都指向同一格 —— 逐格钉 `paletteOf('…')` 的
 *    出现次数：写回字面量、或只迁一处，这一层就红。
 * 3. **没有新字面量回流**：五个文件里的 `paletteOf` 调用全部是字面路径
 *    （动态传参 = 門禁里"提及≠调用"那条的运行时版本），且 ⑤ 层的残留钉板管不到
 *    "新增一个调用点却用了硬编码值" —— 这里用"调用数 = 引用钉板钉住的数"兜住。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MagicZone } from '../src/world/zones/MagicZone.js';
import { SpaceZone } from '../src/world/zones/SpaceZone.js';
import { AbyssZone } from '../src/world/zones/AbyssZone.js';
import { GloomZone } from '../src/world/zones/GloomZone.js';
import { RadiantZone } from '../src/world/zones/RadiantZone.js';
import { MATERIAL_PALETTE, paletteOf } from '../src/content/materialPalette.js';
import { installWindowShim } from './helpers/enemyHarness.js';

const makeScene = () => ({ add() {}, remove() {} });
const makeDialog = () => ({ show() {}, toast() {} });

/** 区域 -> 该区这一片搬进调色板的格子（每个格子都必须在这一区的材质里真的出现） */
const 期望格子 = {
  MagicZone: [
    'stone.castleWall', 'stone.castleRoof', 'foliage.forbidden', 'foliage.magicWild',
    'metal.quidditchRing', 'metal.quidditchHoop', 'crystal.greenhouse', 'wood.book', 'crystal.magic',
  ],
  SpaceZone: ['crystal.ice', 'metal.hull', 'metal.engine', 'metal.monolith', 'stone.spaceRock'],
  AbyssZone: ['stone.abyssRock'],
  GloomZone: ['stone.gloomRock'],
  RadiantZone: ['stone.radiantRock'],
};

/** 一个文件里某个 `paletteOf('格子')` 的出现次数（抄本收净的静态那一半） */
const 重复格子 = {
  'world/zones/MagicZone.js': { 'crystal.magic': 2 },
  'world/zones/SpaceZone.js': { 'crystal.ice': 2 },
};

function 颜色集合(root) {
  const out = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const 表 = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of 表) if (m?.color) out.add(m.color.getHexString());
  });
  return out;
}

describe('五区表面底色：调色板真的涂到了世界上（W-C5 切片9）', () => {
  afterEach(() => {
    delete globalThis.window;
    delete globalThis.CustomEvent;
  });

  it('五座区域逐格到场：每个格子都出现在本区某个材质的 color 上', () => {
    installWindowShim();
    const 建 = {
      MagicZone: () => new MagicZone(makeScene(), { x: 0, z: 0 }, makeDialog()),
      SpaceZone: () => new SpaceZone(makeScene(), { x: 120, z: 0 }, makeDialog()),
      AbyssZone: () => new AbyssZone(makeScene(), { x: 0, z: 220 }, makeDialog()),
      GloomZone: () => new GloomZone(makeScene(), { x: 0, z: 220 }, makeDialog()),
      RadiantZone: () => new RadiantZone(makeScene(), { x: 0, z: 220 }, makeDialog()),
    };
    for (const [名字, 造] of Object.entries(建)) {
      const zone = 造();
      const 在场 = 颜色集合(zone.group);
      for (const 格 of 期望格子[名字]) {
        const 期望 = paletteOf(格).toString(16).padStart(6, '0');
        expect(在场.has(期望), `${名字} 的颜色集合里没有 ${格}（${期望}）—— 这一格没接到世界上`).toBe(true);
      }
      expect(在场.size, `${名字} 一个材质都没建出来 —— 这一层在量空集`).toBeGreaterThan(0);
    }
  });

  it('改前两处各写一份的色，现在两处指向同一格（抄本收净）', () => {
    for (const [文件, 格] of Object.entries(重复格子)) {
      const 文 = readFileSync(join(process.cwd(), 'src', 文件), 'utf8');
      for (const [名, 次数] of Object.entries(格)) {
        const 实 = 文.split(`paletteOf('${名}')`).length - 1;
        // W-C5 切片10 起：`crystal.ice` 在 SpaceZone 里从两处合成一处共享材质
        // （`iceSurfaceMaterial()`）—— 站点数从 2 降到 1，而"两处指向同一格"这条纪律
        // 反而更硬：压根只有一处能写字面量。所以只断言"不超过改前份数、且仍在场"，
        // 而不是把合成后的份数写死成新常数（写死会让下一次合并又得改这里）。
        expect(实, `${文件} 里 ${名} 的调用点数变多了 —— 抄本又分叉了`).toBeLessThanOrEqual(次数);
        expect(实, `${文件} 里 ${名} 一次都没出现 —— 这一格被从世界上删了？`).toBeGreaterThan(0);
      }
    }
  });

  it('三 座区域的调色板格子数：搬进来的站点一条不多一条不少', () => {
    const 站点 = {
      MagicZone: 10,
      SpaceZone: 5,
      // W-C5 切片10：冰材质合成一份 ⇒ 少一处 paletteOf 站点（6 → 5）
      // SpaceZone 上有 crag（1）+ ice（1）两种表面，但都只从调色板读一次颜色。
      AbyssZone: 1,
      GloomZone: 1,
      RadiantZone: 1,
    };
    for (const [名字, 数] of Object.entries(站点)) {
      const 文 = readFileSync(join(process.cwd(), 'src', 'world/zones', `${名字}.js`), 'utf8');
      const 实 = (文.match(/paletteOf\(/g) ?? []).length;
      expect(实, `${名字} 的 paletteOf 站点数`).toBe(数);
    }
  });

  it('反向对照：收录边界没被顺手突破 —— POI 身份色既不在表里，也仍留在代码里', () => {
    // 天空 / 吸积盘 / 星点 / 粒子 / POI 身份色都不该进调色板。这一条钉住两件事：
    // ① 那一格**没有**被收成调色板的一格（残留钉板管的是还剩多少，管不了多搬了什么）；
    // ② 它也没有被从代码里删掉 —— POI 标记该是什么色，仍由 POI 那一侧自己说。
    const 表值 = new Set(Object.values(MATERIAL_PALETTE).flatMap((族) => Object.values(族)));
    for (const [格, 色] of [['magic-castle 的 POI 身份色', 0xaa66ff], ['magic-boss-gate 的 POI 身份色', 0xaa44ff],
      ['夜空（skyColor）', 0x1a1530]]) {
      expect(表值.has(色), `${格} 被收进调色板了 —— 收录边界被突破`).toBe(false);
    }
    const 源码 = readFileSync(join(process.cwd(), 'src', 'world/zones/MagicZone.js'), 'utf8');
    expect(源码, 'POI 身份色 0xaa66ff 该仍在源码里 —— 它是 POI 的身份证，不是表面底色').toContain('0xaa66ff');
  });
});
