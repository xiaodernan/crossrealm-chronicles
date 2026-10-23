/**
 * 「抉择」步（W-E3 切片18）—— 主线第一次**让玩家选一条路**的那一类段落。
 *
 * ## 这一片要钉住的
 *
 * ① **步型与判据**：步型在名单里 / 主线上的抉择步每条路都带一个 flag /
 *    没选不算完成 / 选了**别的**那条不算；
 * ② **那一格是**账**（不是读数）**：抉择是**已经发生的事** ⇒ 必须落盘
 *    ⇒ 存档里**有**它 ⇒ 读档后玩家做过的抉择还在（不会"退回去"）；
 * ③ **生产者是一条事件**：那一格的写入必须走 `STAT_EVENTS` 里那一条
 *    ⇒ 判据闭包门禁扫得到（"账本里有这一格却没人写"会当场红）；
 * ④ **判据在全仓只有一份**：扫 `src/`（**非注释**代码）找第二处算抉择的地方；
 * ⑤ **UI 与判据接得上**：面板上那两个按钮派的正是那条事件。
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  OBJECTIVE_TYPES, MAINLINE, OBJECTIVES, emptyStats, objectiveDone, applyStatEvent,
  applyObjectiveFlags, statsToJSON, statsFromJSON, STAT_READINGS, STAT_EVENTS,
} from '../src/content/objectives.js';

const 抉择步 = MAINLINE.filter((r) => r.type === 'choice');

describe('① 步型与判据', () => {
  it('`choice` 在步型名单里', () => {
    expect(OBJECTIVE_TYPES).toContain('choice');
  });

  it('主线上的「抉择」步都带路，且每条路都有 flag', () => {
    expect(抉择步.length, '主线一步「抉择」都没有').toBeGreaterThan(0);
    for (const row of 抉择步) {
      expect(row.choices?.length, `步 "${row.id}" 没有给出可选的路`).toBeGreaterThanOrEqual(2);
      for (const c of row.choices) {
        expect(typeof c.flag, `步 "${row.id}" 的路 "${c.id}" 没有 flag`).toBe('string');
        expect(c.flag, `步 "${row.id}" 的路 "${c.id}" 的 flag 是空串`).not.toBe('');
        expect(typeof c.label, `步 "${row.id}" 的路 "${c.id}" 没有文案键`).toBe('string');
      }
    }
  });

  it('没选 ⇒ 不算完成；选了那一格 ⇒ 算完成', () => {
    const row = 抉择步[0];
    const stats = emptyStats();
    // W-E3 切片24：抉择步也有 `requires`（时线 Boss + 碑文）⇒ 先把资格点亮，
    // 这条用例要量的才只剩"选没选"这一件事
    for (const r of OBJECTIVES) applyObjectiveFlags(stats, r);
    expect(objectiveDone(row, stats), '还没选就算完成了').toBe(false);
    applyStatEvent(stats, 'choice-made', { flag: row.choices[0].flag });
    expect(objectiveDone(row, stats), '选了却没算完成').toBe(true);
  });

  it('选的是**别的**那条 ⇒ 这一格不算完成', () => {
    const row = 抉择步[0];
    const 别的旗 = `not-a-real-flag-${row.id}`;
    const stats = emptyStats();
    applyStatEvent(stats, 'choice-made', { flag: 别的旗 });
    expect(objectiveDone(row, stats), '选了不在这组里的 flag 却算完成了').toBe(false);
  });
});

describe('② 那一格是**账**（不是读数）', () => {
  it('`decisions` 不在读数名单里（抉择是历史事实，不是当前状态）', () => {
    expect(STAT_READINGS).not.toContain('decisions');
  });

  it('存档里**有**这一格 ⇒ 读档后玩家做过的抉择还在', () => {
    const stats = emptyStats();
    applyStatEvent(stats, 'choice-made', { flag: 'choice_void_sealed' });
    const 落盘 = statsToJSON(stats);
    expect(落盘.decisions, '抉择没落盘 ⇒ 读档后会"退回去"').toEqual(['choice_void_sealed']);
    const 读回 = statsFromJSON(落盘);
    expect(读回.decisions.has('choice_void_sealed'), '读档后抉择没了').toBe(true);
  });
});

describe('③ 生产者是一条事件（闭包门禁要扫得到）', () => {
  it('`choice-made` 在 STAT_EVENTS 里，且它写的正是那一格', () => {
    expect(Object.keys(STAT_EVENTS)).toContain('choice-made');
    const stats = emptyStats();
    applyStatEvent(stats, 'choice-made', { flag: 'x' });
    expect(stats.decisions.has('x')).toBe(true);
  });

  it('没有 flag 的那条事件不改账（不是"空事件也算写过"）', () => {
    const stats = emptyStats();
    applyStatEvent(stats, 'choice-made', {});
    expect(stats.decisions.size, '没带 flag 却记下了抉择').toBe(0);
  });
});

describe('④ 这一族的判据在**全仓只有一份**', () => {
  it('`objectiveDone` 之外没有第二处问"这个 flag 记下了没有"', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
    const 命中 = [];
    for (const f of walk(join(process.cwd(), 'src'))) {
      if (!f.endsWith('.js')) continue;
      // `content/objectives.js` 是**这一格的主人**（声明 + 记账 + 判都在它一处）⇒ 不扫它
      const 相对 = f.slice(process.cwd().length + 1).replace(/\\/g, '/');
      if (相对 === 'src/content/objectives.js') continue;
      // 只看**非注释**代码（注释里提到这一格不算"自己算了一遍"）
      const 代码 = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(/\r?\n/)
        .map((l) => l.replace(/\/\/.*$/, ''))
        .join('\n');
      for (const l of 代码.split('\n')) {
        // **问句**才是判据：`decisions.has(...)` / `decisions?.has(...)`
        // （存档层与事件登记表只是**提到**那一格 —— 那是另一件事，不是判据）
        if (/decisions\??\.has\s*\(/.test(l)) 命中.push(`${相对}: ${l.trim().slice(0, 90)}`);
      }
    }
    expect(命中, '抉择的判据在别处被自己算了一遍 ⇒ 判据就有两份').toEqual([]);
  });
});

describe('⑤ UI 与判据接得上', () => {
  it('面板上那两个按钮 → 记录抉择那条路 → 派发 `choice-made`（界面与判据之间只有一条路）', async () => {
    const { readFileSync } = await import('node:fs');
    const 面板 = readFileSync(join(process.cwd(), 'src/ui/QuestAssistant.js'), 'utf8');
    expect(面板, '面板没有调用记录抉择那条路').toContain('recordChoice');
    expect(面板, '面板没有按当前这一步的路建按钮').toContain('q.choices');
    const 任务系统 = readFileSync(join(process.cwd(), 'src/game/QuestSystem.js'), 'utf8');
    expect(任务系统, '记录抉择那条路没有派发 `choice-made`').toContain('choice-made');
  });
});
