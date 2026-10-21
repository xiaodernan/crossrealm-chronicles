/**
 * 资源销毁的**普查闭环**（W-C1 切片3k）—— 把"故意不释放"的那几处钉成一张表。
 *
 * ## 这一片是什么
 *
 * W-C1 切片 3a~3j 把「谁造的资源谁释放」这条纪律从**逐个补**变成了**有账可查**：
 *
 * - 普查（扫 `src/` 里 `new THREE.*Geometry|Material`）量出 **57 个文件造资源**；
 * - 切片 3a~3j 逐片补掉了 **18 个**（魂火层 / 掉落层 / 营火两处 / 宝箱与 NPC 两处 /
 *   天气 / 信标 / 特效 / 世界 / 装饰层 / Boss 场 / 弹体 / 法术 / 武器 / 营火 NPC 一族 /
 *   残影 / 闪雷 / 玩家模型与控制器）；
 * - 剩下的**每一个**都有正当理由 —— 这一片把那份理由**写成表**并让门禁盯着它。
 *
 * ## 两张表
 *
 * **① 「没有销毁路径」的那 12 处**（各自一条理由）——
 * 新增一个"造资源又没销毁路径"的文件 ⇒ **当场红**（不是靠人记得）。
 *
 * **② 「有销毁路径但没进登记表」的那些** —— 它们**有属主**：
 * 属主的 `dispose()` 替它们拆（或它们是**开发工具**，不进正式局）。
 * 这张表同样被盯着：属主一旦被删掉，那一处就变成真缺口 ⇒ **当场红**。
 *
 * ## 为什么"没进登记表"不等于缺口
 *
 * 拆卸登记表收的是**顶层子系统**；位面归 `WorldManager` 管、Boss 归 `EnemyManager` 管、
 * 魂火归 `RestNpcManager` 管 ⇒ 它们**本来就不该**各自登记一遍（登记两遍就是释放两遍）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const 读 = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function files(dir = 'src', out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) files(rel, out);
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

const 建资源 = /new THREE\.[A-Za-z]*(?:Geometry|Material)\b/;

/** 类名 → { 文件, 基类, 有自己的 dispose } */
function 类表() {
  const 表 = new Map();
  for (const f of files()) {
    const s = 读(f);
    const 有自己的 = /^\s{2}dispose\s*\(/m.test(s);
    for (const m of s.matchAll(/export class (\w+) extends (\w+)/g)) {
      表.set(m[1], { 文件: f, 基类: m[2], 有自己的 });
    }
    for (const m of s.matchAll(/export class (\w+)\s*\{/g)) {
      if (!表.has(m[1])) 表.set(m[1], { 文件: f, 基类: null, 有自己的 });
    }
  }
  return 表;
}

/** 沿继承链找：这一类（含祖先）有没有 dispose */
function 有销毁路径(类名, 表) {
  const seen = new Set();
  let cur = 类名;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const info = 表.get(cur);
    if (!info) return false;
    if (info.有自己的) return true;
    cur = info.基类;
  }
  return false;
}

describe('① 「造了资源又没有销毁路径」的那几处，每一处都有正当理由', () => {
  /**
   * 冻结表（W-C1 切片3k）：每一行 = 一处 + 一条理由。
   * 新增一个"造资源又没销毁路径"的文件 ⇒ 这一条当场红（表里没有它）✓
   */
  const 故意 = new Map([
    ['src/assets/TextureLibrary.js', '共享贴图/材质库 —— 进程生命周期（它的 `sharedMaterial` 带 `userData.shared` 标记，释放器跳过）'],
    ['src/combat/CombatController.js', '它那两份环是**一次性**的（0.35 / 0.4 秒后自己摘下并释放），不是常驻资源'],
    ['src/engine/uvGeometry.js', '纯构造、无缓存 —— 造出来的几何归**调用方**所有'],
    ['src/player/DemoRunner.js', '开发用演示器，不进正式局'],
    ['src/world/dungeonAssets.js', '副本共享资产库 —— 进程生命周期（`owned` 集合 + `userData.shared` 标记）'],
    ['src/world/InternalSpace.js', '它自己那一组是**空的**（空间里的网格挂在**位面**那一组上 ⇒ 归 WorldManager 释放）'],
    ['src/world/PopCultureZoneEnhancer.js', '**函数**（不是子系统）—— 它的网格挂在**位面**那一组上 ⇒ 归 WorldManager 释放'],
    ['src/world/PopCultureZoneEnhancerWave2.js', '同上（函数 + 网格挂在位面那一组上）'],
    ['src/world/PopCultureZoneEnhancerWave3.js', '同上（函数 + 网格挂在位面那一组上）'],
    ['src/world/PopCultureZoneEnhancerWave4.js', '同上（函数 + 网格挂在位面那一组上）'],
    ['src/world/ProceduralDungeonGenerator.js', '静态类 —— 它只往**共享库**里取资源（副本可进出，库是进程生命周期）'],
    ['src/world/regionSurfaces.js', '材质工厂（纯构造）—— 造出来的材质归**调用方**所有'],
  ]);

  it('实际缺口与冻结表逐条相符（多一处少一处都红）', () => {
    const 表 = 类表();
    const 实际 = [];
    for (const f of files()) {
      const s = 读(f);
      if (!建资源.test(s)) continue;
      const 类名 = [...s.matchAll(/export class (\w+)/g)].map((m) => m[1])[0] ?? null;
      if (类名 && 有销毁路径(类名, 表)) continue;
      实际.push(f);
    }
    const 多 = 实际.filter((f) => !故意.has(f));
    const 少 = [...故意.keys()].filter((f) => !实际.includes(f));
    expect(多, `这些文件造了资源又没有销毁路径，而冻结表里没有它们：\n  ${多.join('\n  ')}`)
      .toEqual([]);
    expect(少, `冻结表里这些文件已经有销毁路径了（表该删行）：\n  ${少.join('\n  ')}`)
      .toEqual([]);
  });

  it('每一行都写明了理由（空理由 = 没想清楚）', () => {
    for (const [f, 理由] of 故意) {
      expect(理由.length, `${f} 那行没写理由`).toBeGreaterThan(10);
    }
  });
});

describe('② 「有销毁路径但没进登记表」的每一处，都有属主替它拆', () => {
  /**
   * 冻结表：文件 → 属主（属主的 `dispose()` 替它拆）。
   * 属主被删掉 ⇒ 这一处就变成真缺口 ⇒ 当场红 ✓
   */
  const 属主表 = new Map([
    ['src/combat/ChaosBoss.js', 'combat/EnemyManager'],
    ['src/combat/GroundHazards.js', 'combat/EnemyManager'],
    ['src/combat/MagicBoss.js', 'combat/EnemyManager'],
    ['src/combat/SpaceBoss.js', 'combat/EnemyManager'],
    ['src/combat/VoidBoss.js', 'combat/EnemyManager'],
    ['src/player/CharacterModel.js', 'player/PlayerController'],
    ['src/world/RestNpcModel.js', 'world/RestNpcManager'],
    ['src/world/RestNpcProceduralGestures.js', 'world/RestNpcAnimDirector'],
    ['src/world/WorldTerrain.js', 'world/WorldManager'],
    ['src/world/zones/AbyssZone.js', 'world/WorldManager'],
    ['src/world/zones/BaseZone.js', 'world/WorldManager'],
    ['src/world/zones/FantasyZone.js', 'world/WorldManager'],
    ['src/world/zones/GloomZone.js', 'world/WorldManager'],
    ['src/world/zones/MagicZone.js', 'world/WorldManager'],
    ['src/world/zones/RadiantZone.js', 'world/WorldManager'],
    ['src/world/zones/SpaceZone.js', 'world/WorldManager'],
    ['src/world/zones/VoidZone.js', 'world/WorldManager'],
  ]);

  it('每一处的属主都在拆卸登记表里（属主没了 = 那一处变成真缺口）', () => {
    const gameSrc = 读('src/core/Game.js');
    const 已登记 = new Set([...gameSrc.matchAll(/_adopt\('([^']+)'/g)].map((m) => m[1]));
    for (const [f, 属主] of 属主表) {
      expect(已登记.has(属主), `${f} 的属主 "${属主}" 不在拆卸登记表里 —— 那一处的资源没人拆`).toBe(true);
    }
  });

  it('`LevelEditor` 是**开发工具**（挂在 `window` 上，不进正式局）—— 不在登记表里是对的', () => {
    const 源 = 读('src/world/LevelEditor.js');
    expect(源, '关卡编辑器不再挂在 window 上 —— 那它就不是开发工具了，这一行的理由要改').toContain('window.LevelEditor = LevelEditor');
    expect(源, '关卡编辑器没有 dispose() —— 开发工具也得能拆干净').toMatch(/^\s{2}dispose\s*\(/m);
  });
});

describe('③ 顶层子系统全都在登记表里', () => {
  it('`Game` 直接 new 且自己造资源的子系统，都收进了拆卸登记表', () => {
    // 普查里"造资源 + 自己 new"的那几个顶层子系统，逐条点名
    const gameSrc = 读('src/core/Game.js');
    for (const tag of [
      'world/WorldManager', 'world/WorldDecorations',
      'world/RestPointManager', 'world/RestPointEnhancer', 'world/SoulWispManager',
      'world/CollectibleManager', 'world/NPCManager', 'world/RestNpcManager',
      'world/RestNpcAnimDirector', 'world/RestCampfireAmbient',
      'world/WeatherSystem', 'world/BossBeacons', 'world/WorldEffects',
      'combat/EnemyManager', 'combat/ProjectileManager', 'combat/SpellSystem',
      'combat/WeaponSystem', 'game/LootSystem',
      'effects/VoidEcho', 'effects/ChaosLightning',
      'player/PlayerController',
    ]) {
      expect(gameSrc, `Game 没有收编 ${tag}`).toContain(`_adopt('${tag}'`);
    }
  });
});
