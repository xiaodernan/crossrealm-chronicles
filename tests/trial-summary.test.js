/**
 * 行动风闻 / 足迹榜（W-G3 切片1）
 *
 * W-X15 在服务端补上 `GET /api/telemetry/summary`（最近 windowSize 次行动的频次 Top-N），
 * 这一片把它画到试炼页下半屏 —— 让 `/api/telemetry` 这条路有了客户端的出口。
 *
 * ## 这一片要钉住的事
 *
 * 与试炼榜（W-G2 切片1）完全同一套纪律，所以用例也同一套结构：
 * - 只画自己那一格 `[data-trial-summary]`，异步回来绝不整页重渲染；
 * - 发号：连拉两轮只认最后一份；
 * - 服务端数据当不可信：type 只进 textContent / 样式表以外不拼 HTML；脏行（type 不是字符串、
 *   count 非有限数）在上屏前就被过滤；
 * - 离线 / 坏包 / 抛错 —— 都只落一句"取不到"，绝不停在"正在聆听…"；
 * - 键数 2848 → 2853（登记处 tests/helpers/i18nKeyCount.js）。
 */
import { describe, it, expect } from 'vitest';
import { TrialJournalTab } from '../src/ui/TrialJournalTab.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { 键数问题 } from './helpers/i18nKeyCount.js';
import { setLanguage } from '../src/engine/i18n.js';
import { makeMarkupDom, node } from './helpers/fakeMarkupDom.js';

/** 五枚新键：键 → [中文原值, 英文原值] */
const NEW_KEYS = {
  trial_summary_title: ['行动风闻', 'Recent echoes'],
  trial_summary_empty: ['这扇窗里还没有任何回响', 'No echoes in this window yet'],
  trial_summary_offline: ['取不到风闻 · 在线服务未开启，或网关连不上', 'Echoes unavailable · online service off or gateway unreachable'],
  trial_summary_note_fmt: ['最近 ${windowSize} 次行动的频次（内存窗口，不是全量历史）', 'Last ${windowSize} actions (in-memory window, not full history)'],
  trial_summary_loading: ['正在聆听…', 'Listening…'],
};

const flush = () => new Promise((r) => { setTimeout(r, 0); });

function trialState(over = {}) {
  return {
    state: 'idle',
    layer: 1,
    maxLayers: 5,
    layersCleared: 0,
    secondsLeft: 0,
    quota: 0,
    kills: 0,
    score: 0,
    lastReason: null,
    affixIds: [],
    active: { timeDelta: 0, quotaDelta: 0, burnDps: 0, fogMul: 1 },
    spawnScale: null,
    spawnScaleLive: false,
    spawnerLive: false,
    spawnedThisLayer: 0,
    aliveCount: 0,
    arena: null,
    best: { score: 0, layersCleared: 0 },
    ...over,
  };
}

/** 在线服务桩：两个接口都给，互相独立、都可控制何时回来 */
function onlineHarness({ enabled = true } = {}) {
  const calls = [];
  const pending = [];
  const pendingSummary = [];
  return {
    calls,
    pending,
    pendingSummary,
    enabled: () => enabled,
    fetchTrialLeaderboard(seasonId, limit) {
      calls.push({ fn: 'board', seasonId, limit });
      const d = {};
      d.promise = new Promise((resolve, reject) => { d.resolve = resolve; d.reject = reject; });
      pending.push(d);
      return d.promise;
    },
    fetchTelemetrySummary(topN) {
      calls.push({ fn: 'summary', topN });
      const d = {};
      d.promise = new Promise((resolve, reject) => { d.resolve = resolve; d.reject = reject; });
      pendingSummary.push(d);
      return d.promise;
    },
  };
}

function boot({ online = onlineHarness(), trial = trialState() } = {}) {
  const doc = makeMarkupDom();
  globalThis.document = doc;
  const panel = node('div', doc);
  doc.body.appendChild(panel);
  const game = {
    trial: { getState: () => trial, start: () => {}, abandon: () => {} },
    onlineServices: online,
    seasons: { getState: () => ({ id: 'ember', modifierIds: ['glass-cannon'] }) },
  };
  const tab = new TrialJournalTab(game);
  return { doc, panel, game, tab, online };
}

const rowsOf = (panel) => [...(panel.querySelector('.trial-summary-list')?.children ?? [])]
  .map((li) => [...li.children]);
const msgOf = (panel) => panel.querySelector('.trial-summary-msg')?.textContent ?? '';
const fillWidths = (panel) => [...(panel.querySelectorAll('.trial-summary-bar-fill') ?? [])]
  .map((el) => el.style.width);

/* ------------------------------------------------------------------ *
 * 文案腿
 * ------------------------------------------------------------------ */

describe('W-G3 文案腿：五枚新键两表对齐', () => {
  it('中英原值逐字钉死', () => {
    for (const [key, [zh, en]] of Object.entries(NEW_KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('note_fmt 中英占位符一致', () => {
    const 占位 = (s) => [...s.matchAll(/\$\{(\w+)(?:\|[^}]*)?\}/g)].map((m) => m[1]).sort();
    expect(占位(STRINGS_EN.trial_summary_note_fmt)).toEqual(占位(STRINGS_ZH.trial_summary_note_fmt));
    expect(占位(STRINGS_ZH.trial_summary_note_fmt)).toEqual(['windowSize']);
  });

  it('键数 2853：两表相等且等于登记值', () => {
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
    expect(键数问题(ZH_KEYS, EN_KEYS), '键数与登记值不符').toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 离线腿
 * ------------------------------------------------------------------ */

describe('W-G3 离线腿：零网络，一句取不到', () => {
  it('没有 onlineServices —— 只落取不到那一句，且没进"聆听中"', async () => {
    setLanguage('zh');
    const { panel, tab } = boot();
    tab.game.onlineServices = undefined;
    tab.render(panel);
    await flush();
    expect(msgOf(panel)).toBe('取不到风闻 · 在线服务未开启，或网关连不上');
    expect(tab._summary.state).toBe('off');
  });

  it('服务关着 —— 零请求（连方法都不被调）', async () => {
    setLanguage('zh');
    const online = onlineHarness({ enabled: false });
    const { panel, tab } = boot({ online });
    tab.render(panel);
    await flush();
    expect(online.calls.filter((c) => c.fn === 'summary')).toEqual([]);
    expect(msgOf(panel)).toBe('取不到风闻 · 在线服务未开启，或网关连不上');
  });
});

/* ------------------------------------------------------------------ *
 * 正常腿
 * ------------------------------------------------------------------ */

describe('W-G3 正常腿：聆听中 → 成列', () => {
  it('行按服务端顺序落：type / 条形宽度归一化 / 次数', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    expect(msgOf(panel)).toBe('正在聆听…');
    expect(online.calls.filter((c) => c.fn === 'summary')).toEqual([{ fn: 'summary', topN: 5 }]);

    online.pendingSummary[0].resolve({
      windowSize: 200,
      distinctTypes: 9,
      topN: 3,
      byType: [
        { type: 'boss_defeated', count: 42 },
        { type: 'dungeon_cleared', count: 21 },
        { type: 'pickup', count: 7 },
      ],
    });
    await flush();

    const rows = rowsOf(panel);
    expect(rows).toHaveLength(3);
    expect(rows[0][0].textContent).toBe('boss_defeated');
    expect(rows[1][0].textContent).toBe('dungeon_cleared');
    expect(rows[2][0].textContent).toBe('pickup');
    expect(rows.map((r) => r[2].textContent)).toEqual(['42', '21', '7']);

    // 条形宽度以最大值归一：42→100%，21→50%，7→17%
    const widths = fillWidths(panel);
    expect(widths[0]).toBe('100%');
    expect(widths[1]).toBe('50%');
    expect(widths[2]).toBe('17%');

    // 窗口说明写清楚"最近 windowSize 次"
    expect(panel.querySelector('.trial-summary-note')?.textContent).toContain('200');
    expect(tab._summary.state).toBe('ready');
  });

  it('空窗：byType 空数组 → 一句"还没有回响"，不进 ready', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pendingSummary[0].resolve({ windowSize: 0, distinctTypes: 0, topN: 0, byType: [] });
    await flush();
    expect(msgOf(panel)).toBe('这扇窗里还没有任何回响');
    expect(tab._summary.state).toBe('empty');
  });

  it('脏行上屏前被过滤：type 不是字符串 / count 非有限数 都会被丢', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pendingSummary[0].resolve({
      windowSize: 50,
      distinctTypes: 4,
      topN: 5,
      byType: [
        { type: 123, count: 10 },        // type 不是字符串 → 丢
        { type: 'ok_event', count: '7' }, // count 是字符串 → 丢
        { type: 'fine_event', count: 4 }, // 唯一干净的行
      ],
    });
    await flush();
    const rows = rowsOf(panel);
    expect(rows).toHaveLength(1);
    expect(rows[0][0].textContent).toBe('fine_event');
  });
});

/* ------------------------------------------------------------------ *
 * 坏包 / 发号尾
 * ------------------------------------------------------------------ */

describe('W-G3 坏包与发号：抛错也不停在聆听，乱序只认最后一份', () => {
  it('fetch 直接抛错 → 取不到那一句（绝不停在聆听中）', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pendingSummary[0].reject(new Error('boom'));
    await flush();
    expect(msgOf(panel)).toBe('取不到风闻 · 在线服务未开启，或网关连不上');
    expect(tab._summary.state).toBe('off');
  });

  it('连拉两轮：第一轮晚回来也不许盖掉第二轮的画面', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);   // 第一轮
    tab.render(panel);   // 第二轮（又打开了一次）
    expect(online.calls.filter((c) => c.fn === 'summary')).toHaveLength(2);

    // 第二轮（seq=2）先回来
    online.pendingSummary[1].resolve({
      windowSize: 111, distinctTypes: 1, topN: 1,
      byType: [{ type: 'second_round', count: 9 }],
    });
    await flush();
    // 第一轮（seq=1）后回来 —— 这一份已经过期，不许画
    online.pendingSummary[0].resolve({
      windowSize: 999, distinctTypes: 1, topN: 1,
      byType: [{ type: 'first_round', count: 99 }],
    });
    await flush();
    const rows = rowsOf(panel);
    expect(rows).toHaveLength(1);
    expect(rows[0][0].textContent).toBe('second_round');
  });

  it('那一格被切走了：答案回来只更新缓存，不抛、不写 DOM', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    // 模拟页签切走：面板里那一格没了
    panel.querySelector('[data-trial-summary]')?.remove?.();
    online.pendingSummary[0].resolve({
      windowSize: 10, distinctTypes: 1, topN: 1,
      byType: [{ type: 'x', count: 1 }],
    });
    await flush();   // 不抛异常就是过关
    expect(tab._summary.state).toBe('ready');
  });
});
