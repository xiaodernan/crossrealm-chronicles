/**
 * Game 实例表面契约（修 B63）。
 *
 * 起因：`95c0533`（2026-09-23，W-A1）把 `CombatController` 从 `game.combat` 搬进
 * `game.player.combat`，`src/game/RestDialogue.js` 两处读数没跟着搬。字段读不到不报错，只给
 * `undefined`，于是真浏览器里六座营火点"休息 / 升级"全部当场抛
 * `TypeError: Cannot read properties of undefined (reading 'restHeal')` —— 不回血、不开升级面板、
 * 不发首访魂火，只有关窗那一步活了下来。测试没抓到，因为假 `game` 自己写了 `combat: {...}`：
 * 桩件供了一个生产永远不返回的字段。
 *
 * 所以这根杠扫**整仓**：任何 `x.game.<字段>` 读数，那个字段必须在 `Game` 的真实表面上。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { srcFiles, gameSurface, gameReads, readsFromSource } from './helpers/gameSurface.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
function gameSource(rel) {
  return readFileSync(path.join(SRC, rel), 'utf8');
}

/**
 * 已知的、这一片不修的幻影读数。键是**文件身份**（不是行号 —— 行号会随无关改动漂），
 * `premise` 是这条豁免成立的前提，每次运行都核一遍；前提塌了就红。
 */
const EXEMPT = new Map([
  ['player/DemoRunner.js', {
    fields: ['spectatorCamera'],
    why: '观战相机从来没挂上 Game；这条与营火无关',
    premise: 'demo',
  }],
]);

/** `rel` 之外还有谁 import 了这个模块（按 import 来源路径认，不按名字猜） */
function importersOf(rel, files) {
  const base = rel.split('/').pop().replace(/\.js$/, '');
  return files.filter((other) => other !== rel)
    .filter((other) => new RegExp(`from\\s+['"][^'"]*/${base}\\.js['"]`).test(gameSource(other)));
}

describe('Game 实例表面契约：x.game.<字段> 必须真挂得出来', () => {
  const surface = gameSurface();
  const files = srcFiles();

  it('控制组：表面真是从 `core/Game.js` 推出来的，不是空集也不是抄的', () => {
    // 分母不立住，"0 处幻影"就只等于"什么都没读"
    expect(files.length).toBeGreaterThan(150);
    expect(surface.size).toBeGreaterThan(100);
    for (const k of ['player', 'upgrade', 'dialog', 'stats', 'restPoints', 'overlayState', 'rebuildHotkeys']) {
      expect(surface.has(k), `推导漏了 Game 真有的「${k}」`).toBe(true);
    }
    // 反面：搬到 PlayerController 上那颗，Game 顶层再没有
    expect(surface.has('combat')).toBe(false);
  });

  it('整仓 `x.game.y` 读数扫得到（分母），且逐条落在 Game 的表面上', () => {
    let 总读数 = 0;
    const 越界 = [];
    for (const rel of files) {
      const reads = gameReads(rel);
      总读数 += reads.length;
      for (const r of reads.filter((x) => !surface.has(x.field))) {
        if (EXEMPT.get(rel)?.fields.includes(r.field)) continue;
        越界.push(`${rel}:${r.line} 读 \`game.${r.field}\` —— Game 表面没有这个名字`);
      }
    }
    expect(总读数).toBeGreaterThan(300);
    expect(越界, `这些读数拿到的是 undefined，而且不报错：\n${越界.join('\n')}`).toEqual([]);
  });

  it('豁免不白给：写清为什么、前提此刻成立、且豁免的字段确实还不在表面上', () => {
    for (const [rel, rule] of EXEMPT) {
      expect(rule.why.length, `${rel} 的豁免没写为什么`).toBeGreaterThan(0);
      for (const f of rule.fields) {
        // 已经挂上 Game 的话，这条豁免就该删掉，而不是继续白豁免
        expect(surface.has(f), `「${f}」已挂上 Game，${rel} 的豁免该删`).toBe(false);
      }
      if (rule.premise === 'demo') {
        const 接上者 = importersOf(rel, files);
        expect(接上者, `DemoRunner 已被 ${接上者.join(' / ')} 接上：` +
          `${rel} 的豁免作废，spectatorCamera 要么真挂上 Game，要么删掉那两处读数`).toEqual([]);
      }
    }
  });

  it('当前 `RestDialogue`：两处回血都写在 `player.combat` 上（先确认主体在这儿，再谈它的命运）', () => {
    const 写在真口上的 = gameReads('game/RestDialogue.js').filter((r) => r.field === 'player');
    expect(写在真口上的.map((r) => r.text), '两处 restHeal 少了一处').toEqual([
      expect.stringContaining('this.game.player.combat.restHeal()'),
      expect.stringContaining('this.game.player.combat.restHeal()'),
    ]);
  });

  it('反向控制：出事那一版喂进同一把尺子，必须点名 combat（夹具是字面的，不随源码演进）', () => {
    // 为什么不用"现读现改"：把 `.player.combat` 正则换成 `.combat` 依赖源码恰好长成那样 ——
    // MG 变异（只删回血那一句）就把它逼红了，量的却是别的事。夹具与 `RestDialogue` 无关才对。
    const 出事版 = [
      '  start(restPoint) {',
      '    if (!REST_DIALOGUES[restPoint.id]) {',
      '      this.game.combat.restHeal();',
      '      this.game.upgrade.show(restPoint.name);',
      '      return;',
      '    }',
      '    this.game.dialog.hide();',
      '  }',
      '  _pick() { this.game.combat.restHeal(); }',
    ].join('\n');
    const 读数 = readsFromSource(出事版);
    expect(读数.map((r) => r.field).sort(), '尺子连读数的总数都对不上').toEqual(
      ['combat', 'combat', 'dialog', 'upgrade']);
    const 幻影 = 读数.filter((r) => !surface.has(r.field));
    expect(幻影.map((r) => r.field), '两处 game.combat 一处都没抓到 —— 尺子断了').toEqual(['combat', 'combat']);
    expect(幻影.map((r) => r.line), '报错了行，红也没法定位').toEqual([3, 9]);
    // 合法读数不能被顺手误报
    expect(读数.filter((r) => !surface.has(r.field) && r.field !== 'combat')).toEqual([]);
    expect(surface.has('combat'), 'combat 若已挂上 Game，这条反向控制就是空的').toBe(false);
  });
});
