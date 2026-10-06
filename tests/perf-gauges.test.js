/**
 * 泄漏 watchdog 的接线门禁（W-C1 切片4）。
 *
 * ## 这一片修的是"从没被启用过的验证工具"
 *
 * `PerfHUD` 里那套"`leak: true` 且增长超过容忍带就标红"的逻辑一直是完整的，
 * `stats()` 的注释也写着"供测试与回归门禁读取" —— 但**生产里一条 gauge 都没带 `leak: true`**：
 * `Game.js` 那六行 `.gauge(...)` 全用缺省值，于是 `stats().leaks` 永远是 `{}`。
 * 也就是说这套 watchdog 从接上那天起就不可能报过一次警。
 *
 * 而 `tests/engine-perfhud.test.js` 一直绿 —— 因为那条用例**自己注册了一条带 `leak` 的 gauge**，
 * 覆盖了**机制**、没覆盖**接线**。这是 §0.3 那条的又一个实例：
 * 验证工具自己没启用的时候，它会报告一切正常。
 *
 * 所以本文件的第一条断言就是"注册完之后 `stats().leaks` 不是空的"——
 * 它在修前会红（修前 `Game` 用的是内联链式调用，压根没有可注入的注册表）。
 *
 * ## 为什么清单搬成可注入的模块
 *
 * 留在 `Game` 的链式调用里就只能去静态扫源码，而静态扫描恰好是"覆盖了写法、没覆盖行为"
 * 的那种绿。搬成 `registerPerfGauges(hud, game)` 之后，用例拿一个假 `game` 就能把
 * **真实的注册路径**跑一遍并读 `stats()`。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PerfHUD } from '../src/engine/PerfHUD.js';
import { PERF_GAUGES, registerPerfGauges } from '../src/game/perfGauges.js';

const SRC = join(process.cwd(), 'src');

/** 只给清单真正读到的那些字段，形状与生产一致（缺一个就是清单写错了） */
function fakeGame(n = {}) {
  return {
    enemyManager: {
      getAliveEnemies: () => Array.from({ length: n.enemies ?? 0 }),
      hazards: { count: () => n.hazards ?? 0 },
    },
    projectiles: { count: () => n.projectiles ?? 0 },
    spells: { count: () => n.spells ?? 0 },
    damageNumbers: { activeCount: () => n.damageNumbers ?? 0 },
    combatFeedback: { activeCount: () => n.feedback ?? 0 },
    loot: { drops: Array.from({ length: n.loot ?? 0 }), pooled: () => n.lootPool ?? 0 },
    voidEcho: { pooled: () => n.echoPool ?? 0 },
  };
}

/** 一个不碰 DOM 的 HUD：`_render` 只往 `el.innerHTML` 写，给个替身就能读红灯 */
function fakeHud() {
  const hud = new PerfHUD({ renderer: null, scene: null });
  hud.el = { innerHTML: '' };
  return hud;
}

const build = (game = fakeGame()) => registerPerfGauges(fakeHud(), game);

describe('接线：watchdog 真的被启用了', () => {
  it('注册完之后 `stats().leaks` 不是空的 —— 修前这一条会红', () => {
    const hud = build();
    const leaks = hud.stats().leaks;
    expect(Object.keys(leaks).length, '一条都没监控上 —— watchdog 等于没接').toBe(PERF_GAUGES.length);
    for (const g of PERF_GAUGES) {
      expect(leaks[g.label], `${g.label} 没进泄漏账`).toBeTruthy();
    }
  });

  it('每一条的 growth 都从 0 起（基线取第一次读到的值，不是取 0）', () => {
    // 取 0 会让"开局就有 40 个敌人"直接顶穿容忍带 —— 基线取首读值才是"净增长"的意思
    const hud = build(fakeGame({ enemies: 40, loot: 12 }));
    const leaks = hud.stats().leaks;
    expect(leaks['存活敌人']).toEqual({ value: 40, growth: 0 });
    expect(leaks['掉落物']).toEqual({ value: 12, growth: 0 });
  });

  it('门禁自证：不装清单就什么都没有（证明上面那条不是白过）', () => {
    const bare = fakeHud();
    expect(bare.stats().leaks).toEqual({});
  });
});

describe('清单本身：读得到、有容忍带、名字不许悄悄改', () => {
  it('每条 read 都能在假 game 上读出有限数（清单读错字段这里就炸）', () => {
    const game = fakeGame({ enemies: 3, projectiles: 5, spells: 2, hazards: 1, damageNumbers: 7, feedback: 9, loot: 4, lootPool: 6, echoPool: 8 });
    for (const g of PERF_GAUGES) {
      const v = g.read(game);
      expect(Number.isFinite(v), `${g.label} 读出了 ${v}`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('每条都有正的容忍带（缺了会落到缺省 32，那不是为它定的数）', () => {
    for (const g of PERF_GAUGES) {
      expect(Number.isInteger(g.tolerance) && g.tolerance > 0, `${g.label} 的容忍带是 ${g.tolerance}`).toBe(true);
    }
  });

  it('label 唯一（重名会让后一条盖掉前一条的账）', () => {
    const labels = PERF_GAUGES.map((g) => g.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('原有六条的名字一个没改（F3 面板上的字是玩家/开发者认得的）', () => {
    const labels = PERF_GAUGES.map((g) => g.label);
    for (const old of ['存活敌人', '敌方弹体', '法术效果', '地面危险区', '飘字', '火花']) {
      expect(labels, `原有那条「${old}」不见了`).toContain(old);
    }
  });

  it('W-C1 池化过的三处都接上了（池化写坏 = 池子只进不出，那时才看得见）', () => {
    const labels = PERF_GAUGES.map((g) => g.label);
    expect(labels).toContain('掉落物');
    expect(labels).toContain('掉落池');
    expect(labels).toContain('残影池');
  });
});

describe('红灯真的会亮：喂增长超过容忍带，HUD 必须标出来', () => {
  it('增长超带 → 那一行带 `perf-bad`；带内 → 不带', () => {
    let loot = 0;
    const game = fakeGame();
    game.loot = { get drops() { return Array.from({ length: loot }); }, pooled: () => 0 };
    const hud = build(game);
    hud.stats();                       // 立基线（loot = 0）
    loot = PERF_GAUGES.find((g) => g.label === '掉落物').tolerance + 1;
    hud._render();
    expect(hud.el.innerHTML).toMatch(/perf-bad[^>]*>掉落物: \d+/);
    expect(hud.el.innerHTML).toMatch(/掉落物: \d+ <span class="perf-warn">\+\d+/);
  });

  it('回到基线以下就不红了（是"净增长"不是"绝对值大"）', () => {
    let loot = 0;
    const game = fakeGame();
    game.loot = { get drops() { return Array.from({ length: loot }); }, pooled: () => 0 };
    const hud = build(game);
    hud.stats();
    loot = 200;
    hud._render();
    expect(hud.el.innerHTML).toMatch(/perf-bad/);
    loot = 0;
    hud._render();
    const line = hud.el.innerHTML.split('\n').find((l) => l.includes('掉落物:'));
    expect(line, `掉落物那一行是：${line}`).not.toMatch(/perf-bad/);
  });
});

describe('接线不许分叉：`Game` 必须走这份清单', () => {
  it('`Game.js` 调 `registerPerfGauges`，且不再自己写 `.gauge(` 链', () => {
    const src = readFileSync(join(SRC, 'core/Game.js'), 'utf8');
    expect(src).toMatch(/registerPerfGauges\(new PerfHUD\(/);
    // 两处都能注册 = 迟早一处改了另一处没改，而 leaks 的键就是两份账
    expect(src).not.toMatch(/\.gauge\(/);
  });

  it('门禁自证：内联链式写法（修前的样子）确实不带 leak —— 这就是修前 leaks 恒空的原因', () => {
    const hud = fakeHud();
    hud.gauge('存活敌人', () => 3);          // 修前的写法：缺省 leak = false
    expect(hud.stats().leaks).toEqual({});
  });

  it('renderer.info 的读数口径是整帧（W-C3 切片4）：autoReset 关 + 帧界手动 reset', () => {
    // 真页面读数实锤：composer 的最后一趟（全屏输出单三角）把 calls 覆盖成 1，
    // PerfHUD 的 draw call 行从上线起恒为 1。修法是 autoReset = false + 每帧开头 reset。
    const src = readFileSync(join(SRC, 'core/Game.js'), 'utf8');
    expect(src).toMatch(/this\.renderer\.info\.autoReset\s*=\s*false/);
    // reset 必须紧贴在 composer.render() 之前（帧界在 render() 里，不是构造时清一次就完）
    expect(src).toMatch(/info\.reset\(\);\s*\n\s*this\.composer\.render\(\)/);
  });
});
