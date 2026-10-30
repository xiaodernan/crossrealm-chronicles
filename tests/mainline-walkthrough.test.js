/**
 * 主线「通关巡游」：一条可自动化的真机走查（W-E3 切片44）。
 *
 * ## 为什么要有这道门禁
 *
 * 切片40 / 41 / 42 之后，本轮 ADR 的尾巴反复写着同一句：「五座新副本 + 三条分岔路线
 * 真机走查仍欠」。真机走查要开浏览器、跑图、打 Boss —— 慢、且不可能每片都做。
 * 这道门禁把「走查」里**可以纸面化**的那一半钉死：
 *
 * - 从第 0 步走到通关，**每一步都用真实事件**（`combat-hit` / `enemy-defeated` /
 *   `discovery` / `npc-talk` / `dungeon-cleared` / `spell-cast` / `weapon-skill-unlocked` /
 *   `chest-opened` / `stats-changed` / `poi-interact` / `choice-made`）去喂，
 *   走的是跟玩家一模一样的那条链：事件 ⇒ `applyStatEvent` 记账 ⇒ `objectiveDone` 判据 ⇒ `advance()`。
 * - **两条分支路各走一遍**（第一遍全选第一个选项、第二遍全选第二个）：任何一条路
 *   若认领了不存在的 POI / 判据写错类型 / 汇合点跳丢，这一遍就会卡住或落错格子。
 * - 章节号随位置单调不降、最终 `completed === true`。
 *
 * 它**不**替代真机（手感、镜头、Boss 编排不在纸面里），但它把「内容表里有一行
 * 玩家永远做不完 / 做完却推不动」这一类事故压到 0 —— 而这一类事故在切片41 / 42
 * 插步之后最可能出现。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWindowShim } from './helpers/enemyHarness.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { MAINLINE } from '../src/content/objectives.js';
import { TRIAL_DUNGEON_IDS } from '../src/content/dungeons.js';

let win;
let qs;

function dispatch(name, detail) {
  win.dispatchEvent(new CustomEvent(name, { detail }));
}

/** 门控那几步要的前置事实：一次喂齐，之后所有 interact 步都能开。 */
function 喂齐门控前置() {
  for (const id of ['fantasy-ring', 'magic-castle', 'space-tesseract']) {
    dispatch('discovery', { id, title: '', text: '', category: 'frag' });
  }
  dispatch('enemy-defeated', { name: 'singularity-herald', type: 'boss', bossId: 'singularity-herald' });
  for (const id of TRIAL_DUNGEON_IDS) dispatch('dungeon-cleared', { id, name: '' });
  dispatch('enemy-defeated', { name: 'void-chronarch', type: 'boss', bossId: 'void-chronarch' });
  dispatch('discovery', { id: 'void-rift', title: '', text: '', category: 'frag' });
  dispatch('enemy-defeated', { name: 'chaos-overlord', type: 'boss', bossId: 'chaos-overlord' });
  for (let i = 0; i < 3; i += 1) dispatch('weapon-skill-unlocked', { id: 'skill-' + i });
}

/** 用真实事件把当前这一步做完（`choice` 由调用方先选好旗标）。 */
function 做完这一步(row, 装备) {
  switch (row.type) {
    case 'hits':
      for (let i = 0; i < row.target; i += 1) dispatch('combat-hit', { damage: 1, target: 'dummy' });
      break;
    case 'kills':
      for (let i = 0; i < row.target; i += 1) dispatch('enemy-defeated', { name: row.enemyType, type: row.enemyType });
      break;
    case 'dungeon':
      dispatch('dungeon-cleared', { id: row.dungeonId, name: '' });
      break;
    case 'discovery':
      dispatch('discovery', { id: row.targetId, title: '', text: '', category: 'frag' });
      break;
    case 'npc':
      dispatch('npc-talk', { id: row.targetId, line: '', chapter: row.chapter });
      break;
    case 'boss':
      dispatch('enemy-defeated', { name: row.bossId, type: 'boss', bossId: row.bossId });
      break;
    case 'chests':
      for (let i = 0; i < row.target; i += 1) dispatch('chest-opened', { id: 'chest-' + i });
      break;
    case 'gear': {
      装备[row.gearSlot] = { base: '巡游装备' };
      dispatch('stats-changed', { gear: { ...装备 } });
      break;
    }
    case 'level':
      dispatch('stats-changed', { level: row.target });
      break;
    case 'mind':
      dispatch('stats-changed', { mind: row.target });
      break;
    case 'spells':
      for (let i = 0; i < row.target; i += 1) dispatch('spell-cast', { id: 'bolt', name: '' });
      break;
    case 'charged':
      for (let i = 0; i < row.target; i += 1) dispatch('spell-cast', { id: 'bolt', name: '', charged: true });
      break;
    case 'skills-unlocked':
      for (let i = 0; i < row.target; i += 1) dispatch('weapon-skill-unlocked', { id: 'walk-skill-' + i });
      break;
    case 'dungeon-rerun': {
      const 已清 = [...qs.stats.dungeonsCleared][0];
      expect(已清, '再探那一步之前一座副本都没清 —— 这条腿的夹具不成立').toBeTruthy();
      dispatch('dungeon-cleared', { id: 已清, name: '' });
      break;
    }
    case 'interact':
      dispatch('poi-interact', { id: row.targetId });
      break;
    default:
      throw new Error('巡游没覆盖的步型：' + row.type);
  }
}

/** 走一遍；`选第几条` 决定三处抉择各选第几个选项（0 = 第一个）。 */
function 巡游一遍(选第几条) {
  const 走过 = [];
  const 装备 = {};
  let 上一章 = 0;
  喂齐门控前置();
  for (let 保险 = 0; 保险 < 200 && qs.current && !qs.completed; 保险 += 1) {
    const row = qs.current;
    走过.push(row.id);
    expect(qs.chapter, `步 "${row.id}" 上章节号倒退了`).toBeGreaterThanOrEqual(上一章);
    上一章 = qs.chapter;
    if (row.type === 'choice') {
      const c = row.choices[选第几条];
      expect(c, `步 "${row.id}" 没有第 ${选第几条 + 1} 个选项`).toBeTruthy();
      qs.recordChoice(c.flag);
    } else {
      做完这一步(row, 装备);
    }
    expect(qs.current?.id, `步 "${row.id}" 做完之后没有推进（判据或事件对不上）`).not.toBe(row.id);
  }
  expect(qs.completed, '巡游没走到通关 —— 有一步永远推不动').toBe(true);
  return { 走过, 到过: new Set(走过) };
}

beforeEach(() => {
  installWindowShim();
  win = globalThis.window;
  qs = new QuestSystem({ toast() {}, play() {} });
});

afterEach(() => {
  qs?.dispose?.();
  globalThis.window = undefined;
  globalThis.CustomEvent = undefined;
  win = undefined;
  qs = undefined;
});

describe('主线通关巡游（W-E3 切片44）', () => {
  it('第一遍（全选第一个选项）：72 行走到通关，跳过的是三条「没选的路」', () => {
    const { 走过, 到过 } = 巡游一遍(0);
    expect(走过.length, '走过的行数与表长 − 四条没选的路对不上').toBe(MAINLINE.length - 4);
    expect(到过.size, '有行被走了两次').toBe(走过.length);
    const 没到 = MAINLINE.filter((r) => !到过.has(r.id)).map((r) => r.id);
    expect(没到, '被跳过的不是四条「没选的路」').toEqual(['first-camp', 'second-stone', 'ascend-retrace', 'study-rite']);
  });

  it('第二遍（全选第二个选项）：同样走到通关，跳过的是另外三条路', () => {
    const { 走过, 到过 } = 巡游一遍(1);
    expect(走过.length).toBe(MAINLINE.length - 4);
    const 没到 = MAINLINE.filter((r) => !到过.has(r.id)).map((r) => r.id);
    expect(没到, '选了另一条之后，被跳过的不是对側那四条').toEqual(['first-arrow', 'second-ember', 'ascend-observe', 'seal-rite']);
  });

  it('两遍合起来，主线每一行都至少被真的走过一次（没有一行是纸面摆设）', () => {
    const 第一 = 巡游一遍(0);
    qs.dispose?.();
    qs = new QuestSystem({ toast() {}, play() {} });
    const 第二 = 巡游一遍(1);
    const 合并 = new Set([...第一.走过, ...第二.走过]);
    const 从没走过 = MAINLINE.filter((r) => !合并.has(r.id)).map((r) => r.id);
    expect(从没走过, '这些行在两遍巡游里都没被走到 —— 内容表里躺着一条死路').toEqual([]);
  });

  it('章节号跟着位置说话：巡游里每一章的第一次出现都落在表上标的那一章', () => {
    const { 走过 } = 巡游一遍(0);
    const 第一次出现 = new Map();
    for (const id of 走过) {
      const row = MAINLINE.find((r) => r.id === id);
      if (!第一次出现.has(row.chapter)) 第一次出现.set(row.chapter, row.id);
    }
    expect([...第一次出现.keys()].sort((a, b) => a - b), '巡游走过的章节不是 1..5').toEqual([1, 2, 3, 4, 5]);
  });
});
