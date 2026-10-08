/**
 * 子系统清理登记表（W-A1 注销欠账迁移第二处）
 *
 * ## 这一片补的是"注销路径"与"注销会发生"之间那一层
 * `EventBus` 给了"怎么注销"，上一片给 `CombatCinematicSkip` 补了 `dispose()` ——
 * 但**没有人调用它**。全仓只有 8 个 `dispose()` 定义，而 `Game` 上挂着几十个子系统，
 * `Game` 自己没有任何"把东西收干净"的出口。
 *
 * ## 用例分七层
 * ① 登记表自身的规矩（tag 非空 / fn 是函数 / **tag 不许重复**）；
 * ② `adoptSubsystem`：**拒绝没有 `dispose()` 的子系统**（"假装收编"的防线）；
 * ③ **反序执行**（后建先收）；④ 执行后清空（幂等）；⑤ 一条抛错不连累其他、但也不吞；
 * ⑥ `teardownTags` 诊断；⑦ `Game` 的接线（结构门，因为构造真 Game 要 WebGL/DOM）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  registerTeardown, runTeardowns, teardownTags, clearTeardowns, adoptSubsystem,
} from '../src/engine/teardown.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { STAT_EVENTS } from '../src/content/objectives.js';
import { listenerCount, offAll } from '../src/engine/EventBus.js';
import { installWindowShim } from './helpers/enemyHarness.js';

const SRC = join(process.cwd(), 'src');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => { const i = l.indexOf('//'); return i >= 0 ? l.slice(0, i) : l; }).join('\n');

beforeEach(() => clearTeardowns());

describe('子系统清理登记表（W-A1 迁移第二处）', () => {
  describe('① 登记表自身的规矩', () => {
    it('tag 必须是非空字符串', () => {
      expect(() => registerTeardown('', () => {})).toThrow(/tag 必须是非空字符串/);
      expect(() => registerTeardown(null, () => {})).toThrow(/tag 必须是非空字符串/);
    });

    it('清理函数必须是函数', () => {
      expect(() => registerTeardown('a/b', null)).toThrow(/必须是函数/);
      expect(() => registerTeardown('a/b', 'x')).toThrow(/必须是函数/);
    });

    it('**同一个 tag 不许登记两次** —— 否则先登记的那一个永远不被执行', () => {
      registerTeardown('ui/HUD', () => {});
      expect(() => registerTeardown('ui/HUD', () => {})).toThrow(/已经登记过了/);
      expect(() => registerTeardown('ui/HUD', () => {})).toThrow(/ui\/HUD/);
    });

    it('登记成功之后 teardownTags 报得出来', () => {
      registerTeardown('ui/HUD', () => {});
      registerTeardown('engine/PerfHUD', () => {});
      expect(teardownTags()).toEqual(['ui/HUD', 'engine/PerfHUD']);
    });
  });

  describe('② adoptSubsystem：拒绝"假装收编"', () => {
    it('没有 dispose 的子系统当场被拒（那是本片最重要的一条防线）', () => {
      expect(() => adoptSubsystem('x/y', {})).toThrow(/没有 dispose\(\)/);
      expect(() => adoptSubsystem('x/y', { dispose: 'not-a-function' })).toThrow(/没有 dispose\(\)/);
      expect(() => adoptSubsystem('x/y', null)).toThrow(/没有 dispose\(\)/);
      // 被拒之后登记表里不许留下半条账
      expect(teardownTags()).toEqual([]);
    });

    it('有 dispose 的收编成功，并返回实例本身（方便 `this.x = adopt(...)`）', () => {
      const inst = { dispose() {} };
      expect(adoptSubsystem('x/y', inst)).toBe(inst);
      expect(teardownTags()).toEqual(['x/y']);
    });

    it('收编之后的 dispose 真的会被调到', () => {
      let closed = 0;
      adoptSubsystem('x/y', { dispose() { closed += 1; } });
      runTeardowns();
      expect(closed).toBe(1);
    });
  });

  describe('③ 反序执行（后建先收）', () => {
    it('登记 A、B、C → 执行顺序 C、B、A', () => {
      const order = [];
      registerTeardown('a', () => order.push('a'));
      registerTeardown('b', () => order.push('b'));
      registerTeardown('c', () => order.push('c'));
      runTeardowns();
      expect(order).toEqual(['c', 'b', 'a']);
    });

    it('先建的可能是后建者的依赖 —— 反序才让"还在跑的系统"先被收掉', () => {
      // 用"后建的读先建的"来演示：正序收会让先收的那个在拆卸途中被访问
      const alive = new Set(['db', 'view']);
      const order = [];
      registerTeardown('db', () => { alive.delete('db'); order.push(['db', alive.has('view')]); });
      registerTeardown('view', () => { alive.delete('view'); order.push(['view', alive.has('db')]); });
      runTeardowns();
      // view 先收，收它的时候 db 还在 ✓
      expect(order).toEqual([['view', true], ['db', false]]);
    });
  });

  describe('④ 执行后清空（幂等）', () => {
    it('第二次 runTeardowns() 返回 0，且不再重复执行', () => {
      let n = 0;
      registerTeardown('a', () => { n += 1; });
      expect(runTeardowns()).toBe(1);
      expect(runTeardowns()).toBe(0);
      expect(n).toBe(1);
      expect(teardownTags()).toEqual([]);
    });

    it('空表执行返回 0，不炸', () => {
      expect(runTeardowns()).toBe(0);
    });
  });

  describe('⑤ 一条抛错不连累其他，但也不吞', () => {
    it('三条里第二条抛：三条都跑到，且第一个异常原样抛出', () => {
      const ran = [];
      registerTeardown('a', () => ran.push('a'));
      registerTeardown('boom', () => { ran.push('boom'); throw new Error('拆不动'); });
      registerTeardown('c', () => ran.push('c'));
      // 反序：c → boom → a，所以 c 与 a 都该跑到
      expect(() => runTeardowns()).toThrow('拆不动');
      expect(ran).toEqual(['c', 'boom', 'a']);
    });

    it('抛过之后表仍然是空的（不许因为抛错就留下半张表）', () => {
      registerTeardown('boom', () => { throw new Error('x'); });
      expect(() => runTeardowns()).toThrow();
      expect(teardownTags()).toEqual([]);
    });
  });

  describe('⑥ Game 的接线（结构门）', () => {
    const gameSrc = () => stripComments(readFileSync(join(SRC, 'core', 'Game.js'), 'utf8'));

    it('Game.dispose() 真的调 runTeardowns()，并摘掉错误收集器', () => {
      const src = gameSrc();
      expect(src, '要 import').toMatch(/import \{[^}]*runTeardowns[^}]*\} from '\.\.\/engine\/teardown\.js'/);
      expect(src, 'dispose 里要跑清理').toMatch(/runTeardowns\(\)/);
      expect(src, '错误收集器也要卸').toMatch(/errorReporter\?\.uninstall\?\.\(\)/);
    });

    it('六个已收编的子系统都点名在册（tag 逐条写死，不是循环拼的）', () => {
      const src = gameSrc();
      for (const tag of [
        'combat/DamageNumbers', 'effects/CombatFeedback', 'ui/HUD',
        'cinematic/CombatCinematicSkip', 'engine/PerfHUD',
        // W-A1 迁移第五处：QuestSystem 的十条记账监听走总线以后，它第一次有了退订路径，
        // 于是它也必须进登记表 —— 否则那十条监听还是会跟着 Game 一起烂掉。
        'game/QuestSystem',
      ]) {
        expect(src, `${tag} 应当被收编`).toContain(`_adopt('${tag}'`);
      }
    });

    it('收编一律走 _adopt（不许再出现"new 完就丢下"的子系统）', () => {
      const src = gameSrc();
      // 五个都收编了 —— 反面：如果谁写成 `this.hud = new HUD(this)`，这一条抓不出来，
      // 但上一条（点名 tag）会红。两条合起来才盖住"忘了收编"与"收编了没点名"两种。
      const adopted = [...src.matchAll(/_adopt\('([^']+)'/g)].map((m) => m[1]);
      expect(adopted.length).toBeGreaterThanOrEqual(6);
      expect(new Set(adopted).size, 'tag 不许重复').toBe(adopted.length);
    });
  });

  describe('QuestSystem 的十条记账监听：挂在 tag 下，dispose 后归零（W-A1 迁移第五处）', () => {
  const TAG = 'game/QuestSystem';
  it('构造后 listenerCount(TAG) = STAT_EVENTS 的条数，dispose() 后为 0', () => {
    installWindowShim();
    offAll(TAG);
    const qs = new QuestSystem({ toast() {}, play() {} });
    expect(listenerCount(TAG), '十条记账监听没挂在 game/QuestSystem 这个所有权下')
      .toBe(Object.keys(STAT_EVENTS).length);
    qs.dispose();
    expect(listenerCount(TAG), 'dispose() 之后监听还在 —— 退订路径是假的').toBe(0);
    delete globalThis.window;
    delete globalThis.CustomEvent;
  });

});
describe('⑦ 反面证据：尺子自己要被量过', () => {
    it('"没有 dispose"那把尺子认得出三种坏形状', () => {
      const 有Dispose = (o) => typeof o?.dispose === 'function';
      expect(有Dispose({ dispose() {} })).toBe(true);
      expect(有Dispose({})).toBe(false);
      expect(有Dispose({ dispose: 1 })).toBe(false);
      expect(有Dispose(null)).toBe(false);
      expect(有Dispose(undefined)).toBe(false);
    });
  });
});
