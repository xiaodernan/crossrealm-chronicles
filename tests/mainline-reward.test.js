/**
 * 主线的**完成奖励**（W-E3 切片20）。
 *
 * ## 这一片补的是什么
 *
 * 主线那 56 步的 `reward`（完成奖励魂火）**从来没有读者** ——
 * `QuestSystem.advance()` 只发了一条"任务完成"的提示，没发魂火
 * ⇒ **玩家做完整条主线拿不到一魂火**（而支线那 45 条一直有：`SideQuestSystem.complete`）。
 *
 * 顺带量到同一处的**第二个**毛病：那条提示里传的 `title` 是**未展开的文案键**
 * ⇒ 玩家看到的是 `任务完成：obj_anchor_title`。
 *
 * ## 这一片要钉住的
 *
 * ① **每一步的 `reward` 都 > 0**（没有一步白给）；
 * ② **完成一步 ⇒ 魂火真的多了那一格**（跑真的 `QuestSystem`，不是查表）；
 * ③ **提示里那个 title 是展开后的文案**（不是键）；
 * ④ **抉择那一步的两条路给一样多** —— 若一条路给得多又没有别的代价，
 *    它就**严格更优** ⇒ 玩家永远选那条 ⇒ 抉择就不成其为抉择；
 * ⑤ **"选了哪条"只有一份算式**（`objectiveChosen`）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWindowShim } from './helpers/enemyHarness.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import {
  MAINLINE, OBJECTIVES, objectiveChosen, objectiveReward, objectiveDone, emptyStats,
  applyStatEvent, applyObjectiveFlags,
} from '../src/content/objectives.js';
import { t } from '../src/engine/i18n.js';

let win;
let toasts;
let qs;
let souls;

beforeEach(() => {
  installWindowShim();
  win = globalThis.window;
  toasts = [];
  souls = 0;
  const dialog = { toast: (text) => toasts.push(text), play() {} };
  qs = new QuestSystem(dialog);
  // 任务系统只拿 `dialog` 构造（游戏那侧在 `core/Game.js` 装配）⇒ 这里补一个最小的 stats
  qs.game = {
    stats: {
      addSouls: (n) => { souls += n; },
      onQuestCompleted: () => {},
      questsCompleted: {},
    },
  };
});

afterEach(() => {
  globalThis.window = undefined;
  globalThis.CustomEvent = undefined;
  win = undefined;
  qs = undefined;
});

describe('① 每一步的 `reward` 都 > 0', () => {
  it('主线 56 步没有一步是白给的', () => {
    const 白给的 = MAINLINE.filter((r) => !(r.reward > 0)).map((r) => r.id);
    expect(白给的, '这些步骤的 reward 不是正数 ⇒ 做完了什么也没拿到').toEqual([]);
  });

  it('奖励总和记在那儿（升到 21 级要 11050 ⇒ 主线那一份约 11%，温和）', () => {
    const 总和 = MAINLINE.reduce((a, r) => a + (r.reward ?? 0), 0);
    expect(总和).toBeGreaterThan(500);
    expect(总和).toBeLessThan(3000);
  });
});

describe('② 完成一步 ⇒ 魂火真的多了那一格', () => {
  it('完成主线第一步 ⇒ 魂火多了它自己那一格', () => {
    const 第一步 = MAINLINE[0];
    expect(第一步.id).toBe('anchor');
    const 之前 = souls;
    win.dispatchEvent(new CustomEvent('poi-interact', { detail: { id: 第一步.targetId } }));
    expect(qs.current?.id, '第一步没被推进').not.toBe(第一步.id);
    expect(souls, '完成一步却没发魂火').toBe(之前 + 第一步.reward);
  });

  it('奖励的数额就是表里那一格（不是别的数）', () => {
    const 第一步 = MAINLINE[0];
    const 之前 = souls;
    win.dispatchEvent(new CustomEvent('poi-interact', { detail: { id: 第一步.targetId } }));
    expect(souls - 之前).toBe(第一步.reward);
  });

  it('没完成就不发（账不是凭空多出来的）', () => {
    const 之前 = souls;
    win.dispatchEvent(new CustomEvent('combat-hit', { detail: { damage: 1, target: 'dummy' } }));
    expect(souls, '没完成任何一步却发了魂火').toBe(之前);
  });
});

describe('③ 提示里那个 title 是展开后的文案（不是键）', () => {
  it('提示里出现的是标题的文案，不是它的键', () => {
    const 第一步 = MAINLINE[0];
    win.dispatchEvent(new CustomEvent('poi-interact', { detail: { id: 第一步.targetId } }));
    const 提示 = toasts.join('\n');
    expect(提示, '提示里没有那一步的标题').toContain(t(第一步.title));
    expect(提示, '提示里漏出了未展开的键').not.toContain(第一步.title);
  });

  it('提示里带着奖励的数额', () => {
    const 第一步 = MAINLINE[0];
    win.dispatchEvent(new CustomEvent('poi-interact', { detail: { id: 第一步.targetId } }));
    expect(toasts.join('\n')).toContain(String(第一步.reward));
  });
});

describe('④ 抉择那一步的两条路给一样多（不造"支配选择"）', () => {
  const 抉择步 = MAINLINE.filter((r) => r.type === 'choice');

  it('主线上的抉择步都有两条路', () => {
    expect(抉择步.length).toBeGreaterThan(0);
    for (const row of 抉择步) expect(row.choices.length).toBeGreaterThanOrEqual(2);
  });

  it('两条路的回报一样（一条严格更优 ⇒ 抉择就不成其为抉择）', () => {
    for (const row of 抉择步) {
      const 回报们 = row.choices.map((c) => c.reward ?? row.reward);
      expect(new Set(回报们).size, `步 "${row.id}" 的两条路回报不同`).toBe(1);
    }
  });

  it('选了哪条都拿到同一格回报（`objectiveReward` 那一处算式）', () => {
    const row = 抉择步[0];
    const 基准 = objectiveReward(row, emptyStats());
    for (const c of row.choices) {
      const stats = emptyStats();
      applyStatEvent(stats, 'choice-made', { flag: c.flag });
      expect(objectiveReward(row, stats), `选了 "${c.id}" 之后回报变了`).toBe(基准);
    }
  });
});

describe('⑤ "选了哪条"只有一份算式', () => {
  it('`objectiveChosen` 认得出玩家选的那条', () => {
    const row = MAINLINE.find((r) => r.type === 'choice');
    const stats = emptyStats();
    expect(objectiveChosen(row, stats), '还没选却认得出哪条').toBeNull();
    applyStatEvent(stats, 'choice-made', { flag: row.choices[1].flag });
    expect(objectiveChosen(row, stats)?.id).toBe(row.choices[1].id);
  });

  it('非抉择步没有"选中的那条"（那一族不适用）', () => {
    expect(objectiveChosen(MAINLINE[0], emptyStats())).toBeNull();
  });

  it('判据与"选了哪条"是同源（选中 ⇒ 这一步算完成）', () => {
    const row = MAINLINE.find((r) => r.type === 'choice');
    const stats = emptyStats();
    // W-E3 切片24：抉择步的 `requires` 先点亮，这条要量的才只剩"选没选"
    for (const r of OBJECTIVES) applyObjectiveFlags(stats, r);
    expect(objectiveDone(row, stats)).toBe(false);
    applyStatEvent(stats, 'choice-made', { flag: row.choices[0].flag });
    expect(objectiveDone(row, stats)).toBe(true);
  });
});
