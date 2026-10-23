/**
 * 真世界布局的钉死，与"读者必须钉死"（B125 余下那半）。
 *
 * ## 这一片防的是什么
 *
 * B125（2026-10-23，`fac6d2b`）把 `enemy-roster` 那条"每个原生出生点四向至少一向
 * 警觉"的门禁从运气里救了出来：世界里的障碍碰撞体是**未播种的 `Math.random()` 摆的**，
 * 每一轮 `WorldManager.build()` 都是另一份布局，于是同一条判据轮换红（300 轮 6 次）。
 *
 * 当时只钉了那一个读者，留了余下那半：**读真世界布局的不止它一个**。
 * - `dungeon-zone-coverage` 的"每个副本入口 5 米内站得住人"读的就是同一批碰撞体；
 * - `zone-cull-quests` 把真世界交给 `EnemyManager` 生敌人 —— 出生落点受脱困影响，
 *   而脱困判据正是碰撞体。
 *
 * 每个读者自己摆一份随机源，就是给"种子含义各自漂移"留门。这一片做三件事：
 *
 * ① **收编**：钉死布局收进共享助手 `helpers/seededWorld.js`，三个读者共用一份实现。
 * ② **钉子自证**：同种子逐位相同 / 异种子互不相同 / **不播种两份本来就不一样**
 *    （最后一条是反向控制：它红了才说明"钉种子"钉的不是空气）。
 * ③ **静态门禁**：读真世界布局的测试文件**必须**走这个助手 —— 新读者忘了钉，
 *    这里当场红，而不是等它在某个月全量套件里轮换红。
 *
 * ## 判据与执行分家
 *
 * - 判据在 `helpers/seededWorld.js`（钉随机源 + finally 还原）；
 * - 执行在本文件：钉子性质的行为见证 + 源码扫描。
 *
 * 本文件自己也建**不钉种子**的世界 —— 只用于反向控制（证明两份布局确实不一样），
 * 不承载任何布局断言。这条豁免写在这里，不写进扫描规则：规则只管"读者必须钉"。
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { installWindowShim } from './helpers/enemyHarness.js';
import { buildSeededWorld, buildUnseededWorld } from './helpers/seededWorld.js';
import { WorldManager } from '../src/world/WorldManager.js';

beforeAll(installWindowShim);

const ROOT = process.cwd();

/** 布局指纹：把每块碰撞体的形状/坐标/尺寸/高度带压成一个 32 位散列（与 enemy-roster 同口径） */
const 指纹 = (cs) => {
  let h = 0x811c9dc5;
  for (const c of cs) {
    const 尺 = c.shape === 'cyl' ? c.r : `${c.hx}x${c.hz}@${(c.rot ?? 0).toFixed(3)}`;
    const 串 = `${c.shape}|${c.x.toFixed(3)}|${c.z.toFixed(3)}|${尺}|${c.base.toFixed(3)}|${c.top.toFixed(3)}`;
    for (let i = 0; i < 串.length; i += 1) {
      h ^= 串.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h;
};
const 布局指纹 = (world) => 指纹(world.collision.colliders ?? []);

describe('① 钉子是钉子：同种子同布局、异种子异布局、不播种就漂', () => {
  it('同一颗种子两次建图逐位相同', () => {
    expect(布局指纹(buildSeededWorld(7))).toBe(布局指纹(buildSeededWorld(7)));
  });

  it('不同种子建出不同布局（否则六份钉死布局其实是同一份）', () => {
    const 几份 = [1, 2, 3, 5, 12, 52].map((s) => 布局指纹(buildSeededWorld(s)));
    expect(new Set(几份).size, '这些种子建出了同一份布局').toBe(6);
  });

  it('反向控制：不钉种子时两份布局本来就不一样（钉种子钉的不是空气）', () => {
    expect(布局指纹(buildUnseededWorld()), '不播种两次建图竟逐位相同 ⇒ 障碍布局并不由随机源摆放')
      .not.toBe(布局指纹(buildUnseededWorld()));
  });

  it('钉死的布局里碰撞体不是空的（空布局上"钉死"什么也没钉）', () => {
    expect((buildSeededWorld(7).collision.colliders ?? []).length).toBeGreaterThan(50);
  });
});

describe('② 播种不越界：建图抛错也不把替身随机数留给后面的用例', () => {
  it('正常建图后 Math.random 还原为原函数', () => {
    const 原 = Math.random;
    buildSeededWorld(3);
    expect(Math.random, '建完世界没有还原随机源 ⇒ 同 worker 后面的用例都跑在替身随机数上').toBe(原);
  });

  it('build() 抛错时也还原（finally 保证，不是运气）', () => {
    const 原 = Math.random;
    const spy = vi.spyOn(WorldManager.prototype, 'build')
      .mockImplementationOnce(() => { throw new Error('建图炸了'); });
    try {
      expect(() => buildSeededWorld(3)).toThrow('建图炸了');
      expect(Math.random, '建图抛错后随机源没有还原').toBe(原);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('③ 读真世界布局的用例必须走共享助手', () => {
  /** 扫出来的测试文件全集（含子目录），相对路径 */
  function 测试文件(dir = 'tests', out = []) {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) 测试文件(rel, out);
      else if (e.name.endsWith('.test.js')) out.push(rel);
    }
    return out;
  }

  /** 手上有一个真世界（自己建的或助手给的） */
  const 摸到真世界 = (src) => /new WorldManager\(|seededWorld\.js/.test(src);
  /** 读布局：碰撞体表 / 视线判据 / 把真世界交给敌人管理器（出生脱困与分离都吃碰撞体） */
  const 读布局 = (src) => /collision\.colliders|collision\.blocked|\.blockedBy\(|makeManager\(\{\s*world:/.test(src);
  /** 走了共享助手 */
  const 钉死了 = (src) => /seededWorld\.js/.test(src);

  it('每一个"摸到真世界且读布局"的文件都走了 buildSeededWorld', () => {
    const 漏钉 = [];
    for (const rel of 测试文件()) {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      if (摸到真世界(src) && 读布局(src) && !钉死了(src)) 漏钉.push(rel);
    }
    expect(漏钉, `这些文件读真世界布局却没有钉死随机源（走 helpers/seededWorld.js）：\n${漏钉.join('\n')}`)
      .toEqual([]);
  });

  it('分母自证：扫到的读者正是已知那三个（扫描器不是空转）', () => {
    const 读者 = 测试文件().filter((rel) => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      return 摸到真世界(src) && 读布局(src);
    });
    // 只读区位 / POI / 地面高度的世界构建用例**不该**在这个名单里（那些面与散布无关）
    for (const 已知 of ['tests/enemy-roster.test.js', 'tests/dungeon-zone-coverage.test.js', 'tests/zone-cull-quests.test.js']) {
      expect(读者, `已知读者 ${已知} 没被扫到 ⇒ 扫描器漏了这一族`).toContain(已知);
    }
    expect(读者.length, '读者名单比已知的三个还少 ⇒ 有读者被误豁免').toBeGreaterThanOrEqual(3);
    for (const 无关 of ['tests/poi-identity.test.js', 'tests/objective-target-refs.test.js', 'tests/zone-identity.test.js']) {
      expect(读者, `${无关} 只读与散布无关的面（区位 / POI / 区属性），不该被算成布局读者`).not.toContain(无关);
    }
  });
});