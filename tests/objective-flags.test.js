/**
 * 主线旗标账本（W-E3 切片24）。
 *
 * 这一片之前，`content/objectives.js` 表上那两列字是**装饰**：
 *   - 13 行的 `requires`（"这一步要求哪些旗标"）—— 运行时没有任何读者；
 *   - 每行的 `flags`（"这一步完成就点亮哪几格"）—— 没有任何写入者。
 * 主线严格线性 ⇒ 这两格的缺失没有造成卡关，但表上那张"资格图"与运行时说的不是一回事。
 * 本文件钉住接上之后的三件事：
 *   ① 写入：`advance()` 每走完一步（含跨过的章节门）就把那一行的 `flags` 写进账本；
 *   ② 读取：`objectiveDone` 把 `requires` 并进门 —— 资格没齐，完成不算完成；
 *   ③ 不卡关：按表序走到**任何**一步时，它的 `requires` 必然已经成立
 *      （逐行重放 + 行为版走查 + 分支落点各证一遍）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWindowShim } from './helpers/enemyHarness.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { SaveSystem } from '../src/game/SaveSystem.js';
import {
  MAINLINE, OBJECTIVES, emptyStats, applyObjectiveFlags, objectiveRequiresMet,
  objectiveDone,
} from '../src/content/objectives.js';

describe('flags 的写入：applyObjectiveFlags', () => {
  it('照行的声明逐格写 —— true / false 都写（false 也是一种置位）', () => {
    const s = emptyStats();
    applyObjectiveFlags(s, { id: 'x', flags: { a: true, b: false } });
    expect(s.objectiveFlags).toEqual({ a: true, b: false });
    // 没有 flags 的行 / 空行不动账本
    applyObjectiveFlags(s, { id: 'y' });
    applyObjectiveFlags(s, null);
    expect(s.objectiveFlags).toEqual({ a: true, b: false });
  });

  it('同名旗标后写覆盖（两份不同值由注册表静态挡住，这里只钉运行时语义）', () => {
    const s = emptyStats();
    applyObjectiveFlags(s, { id: 'x', flags: { a: true } });
    applyObjectiveFlags(s, { id: 'y', flags: { a: false } });
    expect(s.objectiveFlags.a).toBe(false);
  });
});

describe('requires 的读取：objectiveRequiresMet', () => {
  it('没有 requires 的行恒真（含空对象）', () => {
    expect(objectiveRequiresMet({ id: 'x' }, emptyStats())).toBe(true);
    expect(objectiveRequiresMet({ id: 'x', requires: {} }, emptyStats())).toBe(true);
    expect(objectiveRequiresMet(null, emptyStats())).toBe(true);
  });

  it('每一格都要正好等于它要的值', () => {
    const s = emptyStats();
    s.objectiveFlags = { a: true, b: false };
    expect(objectiveRequiresMet({ requires: { a: true } }, s)).toBe(true);
    expect(objectiveRequiresMet({ requires: { b: false } }, s)).toBe(true);
    expect(objectiveRequiresMet({ requires: { a: false } }, s)).toBe(false);
    expect(objectiveRequiresMet({ requires: { b: true } }, s)).toBe(false);
    expect(objectiveRequiresMet({ requires: { c: true } }, s)).toBe(false);
  });

  it('没点亮过的旗标一律算不满足 —— 连 want:false 也不放过（账本没有"默认 false"）', () => {
    expect(objectiveRequiresMet({ requires: { c: false } }, emptyStats())).toBe(false);
    expect(objectiveRequiresMet({ requires: { c: false } }, { objectiveFlags: {} })).toBe(false);
  });

  it('判据把 requires 并进门：前置没齐，计数器爆了也不算完成', () => {
    const row = { id: 'x', type: 'hits', target: 8, requires: { a: true } };
    const s = emptyStats();
    s.hits = 999;
    expect(objectiveDone(row, s), '资格没齐却判了完成').toBe(false);
    applyObjectiveFlags(s, { id: 'w', flags: { a: true } });
    expect(objectiveDone(row, s)).toBe(true);
  });
});

describe('防卡关走查：按表序走到任一步时，它的 requires 必然已成立', () => {
  it('逐行重放：第 k 行被激活时，requires 的每一格都已点亮', () => {
    for (let k = 0; k < MAINLINE.length; k += 1) {
      const s = emptyStats();
      const 停在 = MAINLINE[k].id;
      for (const row of OBJECTIVES) {
        if (row.id === 停在) break;
        applyObjectiveFlags(s, row);
      }
      expect(objectiveRequiresMet(MAINLINE[k], s),
        `第 ${k} 步 "${停在}" 的 requires 不成立 —— 接上 requires 会把玩家卡在这一步`).toBe(true);
    }
  });

  it('每一个被 requires 引用的旗标，都确有一步在点亮它（没有悬空引用）', () => {
    const 点亮过 = new Set();
    for (const row of OBJECTIVES) {
      for (const flag of Object.keys(row.flags ?? {})) 点亮过.add(flag);
    }
    for (const row of MAINLINE) {
      for (const flag of Object.keys(row.requires ?? {})) {
        expect(点亮过.has(flag), `"${row.id}" 的 requires.${flag} 没有任何一步点亮过`).toBe(true);
      }
    }
  });

  it('每一处 branchTo / branch 的落点，其 requires 也成立（分支跳转不会落进没资格的一行）', () => {
    for (const row of OBJECTIVES) {
      const 目标 = new Set([row.branchTo, ...Object.values(row.branch ?? {})].filter(Boolean));
      if (目标.size === 0) continue;
      const s = emptyStats();
      for (const r of OBJECTIVES) {
        applyObjectiveFlags(s, r);
        if (r.id === row.id) break;
      }
      for (const id of 目标) {
        const 目标行 = OBJECTIVES.find((r) => r.id === id);
        expect(目标行, `"${row.id}" 的分支目标 "${id}" 不在表里`).toBeTruthy();
        expect(objectiveRequiresMet(目标行, s), `跳到 "${id}" 时它的 requires 不成立`).toBe(true);
      }
    }
  });
});

describe('QuestSystem 行为腿', () => {
  let dialog;
  let qs;

  beforeEach(() => {
    installWindowShim();
    dialog = { toast: () => {}, play() {} };
    qs = new QuestSystem(dialog);
  });

  afterEach(() => {
    globalThis.window = undefined;
    globalThis.CustomEvent = undefined;
    qs = undefined;
  });

  it('advance() 把走完那一步的 flags 写进账本（第一段没有 flags ⇒ 空格不动）', () => {
    qs.questIndex = 0; // anchor：没有 flags
    qs.advance();
    expect(qs.stats.objectiveFlags).toEqual({});
    qs.questIndex = MAINLINE.findIndex((r) => r.id === 'fantasy-frag');
    qs.advance();
    expect(qs.stats.objectiveFlags.hasFragmentFantasy).toBe(true);
  });

  it('跨过章节门时，门控行的 flags 一并写上（门不在 MAINLINE 里，不随 questIndex 推进）', () => {
    const 门 = OBJECTIVES.find((r) => r.type === 'chapter-gate' && r.flags);
    const 门前行 = OBJECTIVES[OBJECTIVES.indexOf(门) - 1];
    qs.questIndex = MAINLINE.findIndex((r) => r.id === 门前行.id);
    qs.advance();
    for (const [flag, value] of Object.entries(门.flags)) {
      expect(qs.stats.objectiveFlags[flag], `门 "${门.id}" 的 ${flag} 没写上`).toBe(value);
    }
  });

  it('整条主线走完（62 次 advance）：flags 与整表重放逐格相同，末旗标也亮着', () => {
    for (let i = 0; i < MAINLINE.length; i += 1) qs.advance();
    expect(qs.completed).toBe(true);
    const s = emptyStats();
    for (const row of OBJECTIVES) applyObjectiveFlags(s, row);
    expect(qs.stats.objectiveFlags).toEqual(s.objectiveFlags);
    expect(qs.stats.objectiveFlags.gameCompleted).toBe(true);
  });

  it('整条主线每一步被激活时 requires 都成立（行为版防卡关）', () => {
    for (let i = 0; i < MAINLINE.length; i += 1) {
      expect(objectiveRequiresMet(MAINLINE[i], qs.stats),
        `第 ${i} 步 "${MAINLINE[i].id}" 推进到这儿时资格没齐`).toBe(true);
      qs.advance();
    }
  });

  it('requires 没齐时 syncProgress 不跳步（资格拦在"完成"之前）', () => {
    // `magic-frag` 是"发现悬浮城堡"那一步：targetId 是 magic-castle，requires 是 boss1Defeated
    const k = MAINLINE.findIndex((r) => r.id === 'magic-frag');
    expect(k, '主线表里没有 magic-frag 这一步').toBeGreaterThan(-1);
    qs.questIndex = k;
    // 计数器先满足（发现过那座城堡），但账本被清空 ⇒ requires.boss1Defeated 不成立
    qs.stats.discoveries.add('magic-castle');
    qs.stats.objectiveFlags = {};
    expect(qs.syncProgress(), '资格没齐却被跳过了').toBe(0);
    expect(qs.questIndex).toBe(k);
    // 资格补上之后，同一次同步立刻跳步
    qs.stats.objectiveFlags.boss1Defeated = true;
    expect(qs.syncProgress()).toBeGreaterThan(0);
    expect(qs.questIndex).toBeGreaterThan(k);
  });

  it('旗标随存档落盘再读回（toData → applyData 一个来回）', () => {
    const 落点 = MAINLINE.findIndex((r) => r.id === 'fantasy-frag');
    expect(落点, '主线表里没有 fantasy-frag 这一步').toBeGreaterThan(-1);
    qs.questIndex = 落点;
    qs.advance();
    const host = () => ({
      dialog: { toasts: [], toast() {} },
      player: {
        position: { x: 1, y: 2, z: 3 }, yaw: 0.5, pitch: 0.2,
        combat: { hp: 100, stamina: 50 }, teleport() {},
      },
      stats: { data: { bag: [] }, toJSON: () => ({ bag: [] }), fromJSON() {}, pushToConsumers() {} },
      quests: qs,
      spells: { mana: 100 },
      settings: { data: {}, applyToGame() {} },
      weaponSkills: { unlocked: new Set(), toJSON: () => ({ unlocked: [] }), fromJSON() {} },
      restPointEnhancer: {
        discovered: new Set(),
        toJSON() { return { discovered: [] }; },
        fromJSON(d) { this.discovered = new Set(d?.discovered ?? []); },
      },
    });
    const data = JSON.parse(JSON.stringify(SaveSystem.toData(host())));
    expect(data.quests.stats.objectiveFlags).toEqual({ hasFragmentFantasy: true });
    const 回来 = new QuestSystem(dialog);
    const target = host();
    target.quests = 回来;
    expect(SaveSystem.applyData(target, data)).toBe(true);
    expect(回来.stats.objectiveFlags).toEqual({ hasFragmentFantasy: true });
    // 落点也回来了（advance 过一格），且 require 链没被这次往返破坏
    expect(回来.questIndex).toBe(落点 + 1);
    expect(objectiveRequiresMet(MAINLINE[落点 + 1], 回来.stats)).toBe(true);
  });
});
