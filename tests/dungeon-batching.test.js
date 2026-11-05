/**
 * 副本静态装饰合批（W-E3 切片63）
 *
 * 切片57 量到副本的代价在 draw call：16~32 间副本 209~414 个网格、只有 1.4~1.6 万三角形。
 * 这一片把野外区那套合批（`zoneBatching.js`）抽成 `batchStaticsOf(root)`，在副本进场时对
 * `dungeon.group` 跑一遍。门禁钉五件事：
 *
 * ① **三角形守恒** —— 合批不许丢面（每条几何合并前后的索引 / 顶点都在账上）；
 * ② **动件全留** —— 门板（door_*）、出口（exit）、经文（lore_shard）靠名字认领，必须还在树上，
 *    否则开门那行 `layout.doorMeshes` 会静默拿到被合并掉的 dead 对象；
 * ③ **幂等** —— 再调一次是 `批数 0`，不是把合并件再合一遍；
 * ④ **合并件可画** —— 有自己的包围球（切片2 的教训：null 包围球会把整批裁掉），
 *    且坐标是**相对副本根**的（组原点在 5000 的独立坐标系里，烘错就是整座副本飞到天外）；
 * ⑤ **接线** —— `DungeonManager.enter` 里合批必须在建几何与关门之后、且只有一处。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ProceduralDungeonGenerator } from '../src/world/ProceduralDungeonGenerator.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { batchStaticsOf } from '../src/world/zoneBatching.js';

const DEF = DUNGEON_DEFS.find((d) => d.id === 'forest-shrine');
if (!DEF) throw new Error('genesis 城缺少 forest-shrine —— 本文件的样本副本不在了');

function build() {
  const layout = ProceduralDungeonGenerator.generate(DEF, 20261106);
  const group = new THREE.Group();
  group.position.set(DEF.origin.x, DEF.origin.y, DEF.origin.z);
  ProceduralDungeonGenerator.buildGeometry(group, layout, DEF, null);
  for (const door of layout.doors) {
    ProceduralDungeonGenerator.setDoorOpen(layout, door, false);
  }
  return { layout, group };
}

const 三角形数 = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

function 全量(group) {
  const 网格 = [];
  group.traverse((o) => { if (o.isMesh) 网格.push(o); });
  return {
    网格,
    三角形: 网格.reduce((n, m) => n + 三角形数(m.geometry), 0),
    类别: new Set(网格.map((m) => `${m.castShadow ? 1 : 0}/${m.receiveShadow ? 1 : 0}`)),
  };
}

describe('副本静态装饰合批（W-E3 切片63）', () => {
  it('真建一座副本：批数 / 合入件数 / 省下绘制都真的非零，回退 0', () => {
    const { group } = build();
    const 前 = 全量(group);
    expect(前.网格.length).toBeGreaterThan(150);
    const 计 = batchStaticsOf(group, { id: `dungeon-${DEF.id}` });
    expect(计).not.toBeNull();
    expect(计.回退).toBe(0);
    expect(计.批数).toBeGreaterThanOrEqual(3);
    expect(计.合入件数).toBeGreaterThan(100);
    expect(计.省下绘制).toBe(计.合入件数 - 计.批数);
    const 后 = 全量(group);
    expect(后.网格.length).toBe(前.网格.length - 计.合入件数 + 计.批数);
  });

  it('三角形总数守恒：合进去的每一面都还在', () => {
    const { group } = build();
    const 前 = 全量(group);
    batchStaticsOf(group, { id: `dungeon-${DEF.id}` });
    const 后 = 全量(group);
    expect(后.三角形).toBe(前.三角形);
  });

  it('动的件靠名字留下：每扇门板、出口、经文都还在树上', () => {
    const { layout, group } = build();
    expect(layout.doorMeshes.length).toBe(layout.doors.length);
    batchStaticsOf(group, { id: `dungeon-${DEF.id}` });
    for (const door of layout.doorMeshes) {
      expect(group.getObjectByName(door.name), `门板 ${door.name} 被合掉了`).toBe(door);
    }
    expect(group.getObjectByName('exit')).not.toBeNull();
    const 经文 = layout.loreMeshes ?? [];
    expect(经文.length).toBeGreaterThan(0);
    const 树上经文 = [];
    group.traverse((o) => { if (o.name === 'lore_shard') 树上经文.push(o); });
    expect(树上经文.length, '经文应全部留在树上').toBe(经文.length);
    for (const shard of 经文) expect(树上经文).toContain(shard);
  });

  it('幂等：第二次调用批数 0、网格数与三角形数都不动', () => {
    const { group } = build();
    batchStaticsOf(group, { id: `dungeon-${DEF.id}` });
    const 第一次 = 全量(group);
    const 计 = batchStaticsOf(group, { id: `dungeon-${DEF.id}` });
    expect(计.批数).toBe(0);
    expect(计.合入件数).toBe(0);
    expect(计.省下绘制).toBe(0);
    const 第二次 = 全量(group);
    expect(第二次.网格.length).toBe(第一次.网格.length);
    expect(第二次.三角形).toBe(第一次.三角形);
  });

  it('合并件可画：包围球有限，坐标是副本根局部坐标（不是 5000 那一层世界坐标）', () => {
    const { group } = build();
    batchStaticsOf(group, { id: `dungeon-${DEF.id}` });
    const 批 = 全量(group).网格.filter((m) => m.name.startsWith(`合批-dungeon-${DEF.id}-`));
    expect(批.length).toBeGreaterThanOrEqual(3);
    for (const m of 批) {
      expect(m.position.lengthSq(), '合并件应挂在根原点（坐标已烘进几何）').toBe(0);
      const bs = m.geometry.boundingSphere;
      expect(bs, `${m.name} 没有包围球`).not.toBeNull();
      expect(Number.isFinite(bs.radius) && bs.radius > 0).toBe(true);
      expect(Math.hypot(bs.center.x, bs.center.z)).toBeLessThan(400);
      expect(m.userData.zoneBatch?.区).toBe(`dungeon-${DEF.id}`);
    }
  });

  it('阴影类别守恒：合并前后的 (cast/receive) 组合集合一致', () => {
    const { group } = build();
    const 前 = 全量(group);
    batchStaticsOf(group, { id: `dungeon-${DEF.id}` });
    const 后 = 全量(group);
    expect([...后.类别].sort()).toEqual([...前.类别].sort());
  });

  it('碰撞表不受合批影响（合的是画，不是走位）', () => {
    const { layout, group } = build();
    const 前 = layout.colliders.map((c) => `${c.x},${c.z},${c.hw},${c.hd}`).join('|');
    batchStaticsOf(group, { id: `dungeon-${DEF.id}` });
    const 后 = layout.colliders.map((c) => `${c.x},${c.z},${c.hw},${c.hd}`).join('|');
    expect(后).toBe(前);
  });

  it('接线：enter() 在建几何与关门之后合批，且全仓只有这一处调它', () => {
    const 源 = readFileSync('src/world/DungeonManager.js', 'utf8');
    const 建几何 = 源.indexOf('ProceduralDungeonGenerator.buildGeometry(dungeon.group, dungeon.layout, dungeon.def)');
    const 关门 = 源.indexOf('ProceduralDungeonGenerator.setDoorOpen(dungeon.layout, door, false)', 建几何);
    const 合批 = 源.indexOf('batchStaticsOf(dungeon.group');
    expect(建几何).toBeGreaterThan(-1);
    expect(关门).toBeGreaterThan(建几何);
    expect(合批).toBeGreaterThan(关门);
    expect(源.split('batchStaticsOf(').length - 1).toBe(1);
  });
});
