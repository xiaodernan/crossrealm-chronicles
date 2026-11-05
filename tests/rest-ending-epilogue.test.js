/**
 * 营火终局余波门禁（W-E3 切片51）—— 通关之后，火边要多出两格只属于那条结局的话。
 *
 * 改前：主线与片尾字幕都按终局抉择分了岔，但枢纽营火那棵树对结局一无所知。
 * 玩家通关后回到火边，看守仍然只会聊 Boss 再战、支线与回声 —— 最后一章像没发生过。
 *
 * 这一片给营火选择加了 `requiresDecision`：只认主线抉择步已有的旗标，
 * 判据读 `quests.stats.decisions`（不另存一份状态）。三档行为必须分开：
 * 留灯档只看到留灯那一格，熄灯档只看到熄灯那一格，没通关的老档两格都不出现。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RestDialogue } from '../src/game/RestDialogue.js';
import { REST_DIALOGUES } from '../src/content/restDialogues.js';
import { checkRestDialogueTree } from '../src/content/registry.js';
import { OBJECTIVES } from '../src/content/objectives.js';
import { setLanguage } from '../src/engine/i18n.js';

const 留灯标签 = '那盏留在石阶上的灯';
const 熄灯标签 = '被你熄掉的锚点';

function 开火(decisions, chapter = 5) {
  const calls = [];
  const journal = [];
  const game = {
    quests: { chapter, stats: { decisions } },
    dialog: {
      showChoices: (title, text, choices, meta) => calls.push({ title, text, choices, meta }),
      toast: vi.fn(),
    },
    storyJournal: { add: (e) => journal.push(e) },
    audio: { restDialogueOpen: vi.fn() },
  };
  const rd = new RestDialogue(game);
  rd.activeRest = { id: 'hub', name: '世界之锚休息点' };
  rd._showNode(REST_DIALOGUES.hub, 'start');
  return { rd, calls, journal };
}

beforeEach(() => setLanguage('zh'));

describe('营火终局余波（W-E3 切片51）', () => {
  it('留灯档：只多出留灯那一格，点进去读留灯余波并写营火日志', () => {
    const { calls, journal } = 开火(new Set(['choice_final_keep']));
    const labels = calls[0].choices.map((c) => c.label);
    expect(labels).toContain(留灯标签);
    expect(labels).not.toContain(熄灯标签);

    const pick = calls[0].choices.find((c) => c.label === 留灯标签);
    pick.onPick();
    expect(calls[1].text).toContain('石阶上');
    expect(calls[1].text).toContain('火苗很小');
    expect(journal).toHaveLength(1);
    expect(journal[0].id).toBe('rest-hub-ending-keep');
    expect(journal[0].title).toBe('余波·留灯');
  });

  it('熄灯档：只多出熄灯那一格，点进去读熄灯余波并写营火日志', () => {
    const { calls, journal } = 开火(new Set(['choice_final_quiet']));
    const labels = calls[0].choices.map((c) => c.label);
    expect(labels).toContain(熄灯标签);
    expect(labels).not.toContain(留灯标签);

    const pick = calls[0].choices.find((c) => c.label === 熄灯标签);
    pick.onPick();
    expect(calls[1].text).toContain('锚座底下现在很安静');
    expect(calls[1].text).toContain('不是所有东西都得一直烧着');
    expect(journal).toHaveLength(1);
    expect(journal[0].id).toBe('rest-hub-ending-quiet');
    expect(journal[0].title).toBe('余波·熄灯');
  });

  it('没有终局抉择的老档：两格都不出现，选项数与切片50 前一致（12 格）', () => {
    const { calls } = 开火(new Set());
    const labels = calls[0].choices.map((c) => c.label);
    expect(labels).not.toContain(留灯标签);
    expect(labels).not.toContain(熄灯标签);
    expect(calls[0].choices).toHaveLength(12);
  });

  it('第一道章节门与第二道抉择门同时生效：第 1 章只列得到本章能问的，抉择那格照进', () => {
    // 真机读数（2026-11-05，headless Chrome，页面内真调 restDialogue.start(hub)）：
    // 第 1 章无抉择 **10 格**、留灯档 **11 格**、熄灯档 **11 格**、两句都做过 **12 格**；
    // 切片51 的 12 格是**第 5 章**口径（两格章节门在低章被挡掉），两个数都对，别混读。
    const 一章 = 开火(new Set(), 1);
    const 一章标签 = 一章.calls[0].choices.map((c) => c.label);
    expect(一章.calls[0].choices).toHaveLength(10);
    expect(一章标签).not.toContain(留灯标签);
    expect(一章标签).not.toContain(熄灯标签);

    const 一章留灯 = 开火(new Set(['choice_final_keep']), 1);
    expect(一章留灯.calls[0].choices).toHaveLength(11);
    expect(一章留灯.calls[0].choices.map((c) => c.label)).toContain(留灯标签);

    // 两道门各管各的：第 1 章挡掉两格、抉择加回一格，互不抵消（10 → 11 是 +1）
    const 五章 = 开火(new Set());
    expect(五章.calls[0].choices.length - 一章.calls[0].choices.length).toBe(2);
  });

  it('真表通过结构校验，且 requiresDecision 都是主线抉择旗标', () => {
    expect(checkRestDialogueTree(REST_DIALOGUES)).toEqual([]);
    const 旗标 = new Set(OBJECTIVES.flatMap((row) => (row.choices ?? []).map((c) => c.flag)).filter(Boolean));
    const 用到 = REST_DIALOGUES.hub.nodes.start.choices.filter((c) => c.requiresDecision);
    expect(用到.map((c) => c.requiresDecision).sort()).toEqual(['choice_final_keep', 'choice_final_quiet']);
    for (const c of 用到) expect(旗标.has(c.requiresDecision), c.requiresDecision + ' 不是主线旗标').toBe(true);
  });

  it('反向控制：写一个不存在的 requiresDecision 必须开机点名', () => {
    const 假 = structuredClone(REST_DIALOGUES);
    假.hub.nodes.start.choices.push({ label: 'rest_dlg_label_back', next: 'start', requiresDecision: 'choice_final_nope' });
    expect(checkRestDialogueTree(假)).toEqual([
      expect.stringContaining('requiresDecision "choice_final_nope" 不是任何主线抉择的旗标'),
    ]);
  });
});
