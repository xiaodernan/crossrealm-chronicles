/**
 * 传说碑（W-G4 切片1）—— 世界 Boss 最速通关碑
 *
 * 服务端早有 `/api/leaderboard`（用时升序）与 `OnlineServices.fetchLeaderboard`，
 * 可是客户端一直没有读它的地方 —— 玩家交上去的成绩躺在一个自己看不见的榜里，
 * 这不是榜，是黑洞。这一片在试炼榜同一条纪律下补上这一格。
 *
 * 用例的七腿（与 W-G2/W-G3 同一架构）：
 * - 文案腿：七枚新键中英逐字钉死 + 占位符对齐 + 键数 2860；
 * - 离线腿：没开在线 / 关着 —— 一句"取不到"，零网络，不进"叩石"；
 * - 正常腿：成行、名册解析（成行、未登记 id 与副本 Boss 都安静出图）；
 * - 空与坏：空榜一句话，抛错一句话（不许停在"叩石"）；
 * - 发号腿：连拉两轮，乱序回来只认最后一份；
 * - 注入腿：runner/bossId 里写标签只显示成文字；
 * - 切走腿：面板关了之后答案回来 —— 不抛、不写 DOM。
 */
import { describe, it, expect } from 'vitest';
import { LegendsJournalTab } from '../src/ui/LegendsJournalTab.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { 键数问题 } from './helpers/i18nKeyCount.js';
import { setLanguage } from '../src/engine/i18n.js';
import { makeMarkupDom, node } from './helpers/fakeMarkupDom.js';

/** 七枚新键：键 → [中文原值, 英文原值] */
const NEW_KEYS = {
  journal_tab_legends: ['传说碑', 'Legends'],
  legends_intro: ['诸神陨落之名与最速 —— 成绩在 Boss 倒下时自动镌刻，只读不改', 'The fallen keep their names at their fastest — inscribed when a boss falls; read-only'],
  legends_loading: ['正在叩石……', 'Reading the steles…'],
  legends_empty: ['碑上还没有刻着名字', 'No names on the stele yet'],
  legends_offline: ['取不到碑铭 · 在线服务未开启，或网关连不上', 'Steles unavailable · online service off or gateway unreachable'],
  legends_row_fmt: ['#${rank} ${runner} · ${boss} · ${clock} · 第${chapter}章', '#${rank} ${runner} · ${boss} · ${clock} · Ch.${chapter}'],
  legends_note: ['顺序：用时升序。通关时自动提交，这里是只读快照', 'Order: fastest first. Runs are submitted when a boss falls; this is a read-only stele'],
};

const flush = () => new Promise((r) => { setTimeout(r, 0); });

/** 在线服务桩：榜单一个口，请求不自动完成，由用例决定何时、什么结果回来 */
function onlineHarness({ enabled = true } = {}) {
  const calls = [];
  const pending = [];
  return {
    calls,
    pending,
    enabled: () => enabled,
    fetchLeaderboard(limit) {
      calls.push({ limit });
      const d = {};
      d.promise = new Promise((resolve, reject) => { d.resolve = resolve; d.reject = reject; });
      pending.push(d);
      return d.promise;
    },
  };
}

function boot({ online = onlineHarness() } = {}) {
  const doc = makeMarkupDom();
  globalThis.document = doc;
  const panel = node('div', doc);
  doc.body.appendChild(panel);
  const game = { onlineServices: online };
  const tab = new LegendsJournalTab(game);
  return { doc, panel, game, tab, online };
}

const rowsOf = (panel) => [...(panel.querySelector('.trial-board-list')?.children ?? [])]
  .map((li) => li.textContent);
const msgOf = (panel) => panel.querySelector('.trial-board-msg')?.textContent ?? '';

/* ------------------------------------------------------------------ *
 * 文案腿
 * ------------------------------------------------------------------ */

describe('W-G4 文案腿：七枚新键两表对齐', () => {
  it('中英原值逐字钉死', () => {
    for (const [key, [zh, en]] of Object.entries(NEW_KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('row_fmt 中英占位符一致', () => {
    const 占位 = (s) => [...s.matchAll(/\$\{(\w+)(?:\|[^}]*)?\}/g)].map((m) => m[1]).sort();
    expect(占位(STRINGS_EN.legends_row_fmt)).toEqual(占位(STRINGS_ZH.legends_row_fmt));
    expect(占位(STRINGS_ZH.legends_row_fmt)).toEqual(['boss', 'chapter', 'clock', 'rank', 'runner']);
  });

  it('键数 2860：两表相等且等于登记值', () => {
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
    expect(键数问题(ZH_KEYS, EN_KEYS), '键数与登记值不符').toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 离线腿
 * ------------------------------------------------------------------ */

describe('W-G4 离线腿：没开在线 → 一句取不到，零网络', () => {
  it('没有 onlineServices —— 落取不到那一句，且没进叩石', async () => {
    setLanguage('zh');
    const { panel, tab } = boot();
    tab.game.onlineServices = undefined;
    tab.render(panel);
    await flush();
    expect(msgOf(panel)).toBe('取不到碑铭 · 在线服务未开启，或网关连不上');
    expect(tab._board.state).toBe('off');
  });

  it('服务关着 —— 零请求', async () => {
    setLanguage('zh');
    const online = onlineHarness({ enabled: false });
    const { panel, tab } = boot({ online });
    tab.render(panel);
    await flush();
    expect(online.calls).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 正常腿
 * ------------------------------------------------------------------ */

describe('W-G4 正常腿：叩石 → 成行，名册解析逐行安静', () => {
  it('成行：名次/名册/时钟/章节 逐字对', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    expect(msgOf(panel)).toBe('正在叩石……');

    online.pending[0].resolve({
      items: [
        { runner: '阿岚', bossId: 'shadow-warden', clearTimeMs: 72_000, chapter: 1, submittedAt: '2026-11-11T00:00:00Z' },
        { runner: 'Bramble', bossId: 'chaos-overlord', clearTimeMs: 3_599_000, chapter: 5, submittedAt: '2026-11-11T00:01:00Z' },
        { runner: '无名', bossId: 'dungeon-ancient-archives', clearTimeMs: 1_000, chapter: 3, submittedAt: '2026-11-11T00:02:00Z' },
      ],
      count: 3,
      maxLimit: 10,
    });
    await flush();
    const rows = rowsOf(panel);
    expect(rows[0]).toBe(`#1 阿岚 · ${STRINGS_ZH.boss_name_shadow} · 1:12 · 第1章`);
    expect(rows[1]).toBe(`#2 Bramble · ${STRINGS_ZH.boss_name_chaos} · 59:59 · 第5章`);
    // 副本 Boss → 守钥长那一格（bossNameKeyOf 的 dungeon- 分支）
    expect(rows[2]).toBe(`#3 无名 · ${STRINGS_ZH.boss_name_dungeon_warden} · 0:01 · 第3章`);
    expect(tab._board.state).toBe('ready');
  });

  it('未登记的 bossId —— 走 boss_name_unknown，不泄原始字符串进页面', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pending[0].resolve({
      items: [{ runner: 'X', bossId: 'evil-corpus-99', clearTimeMs: 5_000, chapter: 1, submittedAt: 't' }],
      count: 1,
      maxLimit: 10,
    });
    await flush();
    expect(rowsOf(panel)[0]).toContain(STRINGS_ZH.boss_name_unknown);
    expect(rowsOf(panel)[0]).not.toContain('evil-corpus-99');
  });

  it('超过一小时的用时：时辰位出现且补零', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pending[0].resolve({
      items: [{ runner: 'X', bossId: 'void-chronarch', clearTimeMs: 3_600_000 + 61_000, chapter: 4, submittedAt: 't' }],
      count: 1,
      maxLimit: 10,
    });
    await flush();
    expect(rowsOf(panel)[0]).toContain('1:01:01');
  });

  it('空榜 → 一句话，不进 ready', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pending[0].resolve({ items: [], count: 0, maxLimit: 10 });
    await flush();
    expect(msgOf(panel)).toBe('碑上还没有刻着名字');
    expect(tab._board.state).toBe('empty');
  });

  it('服务端数据当不可信：runner 里写标签只显示成文字', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pending[0].resolve({
      items: [{ runner: '<img src=x onerror="alert(1)">', bossId: 'archmagus', clearTimeMs: 1000, chapter: 2, submittedAt: 't' }],
      count: 1,
      maxLimit: 10,
    });
    await flush();
    expect(panel.querySelectorAll('img') ?? []).toHaveLength(0);
    expect(rowsOf(panel)[0]).toContain('<img src=x onerror="alert(1)">');
  });
});

/* ------------------------------------------------------------------ *
 * 坏包与发号
 * ------------------------------------------------------------------ */

describe('W-G4 坏包与发号：抛错也不停在叩石，乱序只认最后一份', () => {
  it('fetch 直接抛错 → 取不到那一句', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pending[0].reject(new Error('boom'));
    await flush();
    expect(msgOf(panel)).toBe('取不到碑铭 · 在线服务未开启，或网关连不上');
    expect(tab._board.state).toBe('off');
  });

  it('连拉两轮：第二轮先回来也不许被第一轮盖掉', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    tab.render(panel);
    expect(online.calls).toHaveLength(2);

    online.pending[1].resolve({
      items: [{ runner: 'second', bossId: 'chaos-overlord', clearTimeMs: 1, chapter: 5, submittedAt: 't' }],
      count: 1,
      maxLimit: 10,
    });
    await flush();
    online.pending[0].resolve({
      items: [{ runner: 'first', bossId: 'shadow-warden', clearTimeMs: 2, chapter: 1, submittedAt: 't' }],
      count: 1,
      maxLimit: 10,
    });
    await flush();
    const rows = rowsOf(panel);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('second');
  });

  it('那一格被切走了：答案回来只更新缓存，不抛、不写 DOM', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    panel.querySelector('[data-legends-board]')?.remove?.();
    online.pending[0].resolve({
      items: [{ runner: 'x', bossId: 'shadow-warden', clearTimeMs: 1000, chapter: 1, submittedAt: 't' }],
      count: 1,
      maxLimit: 10,
    });
    await flush();
    expect(tab._board.state).toBe('ready');
  });
});
