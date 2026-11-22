import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { JOURNAL_CATEGORIES } from '../src/game/StoryJournal.js';
import { mergeJournalCategories } from '../src/ui/JournalTabRegistry.js';
import { UI_ACTIONS, UI_HOTKEY_LABELS } from '../src/content/hotkeys.js';
import { HELP_SECTIONS_EXTRA } from '../src/content/helpManual.js';

/**
 * 说明书覆盖率（W-Z512 · 2026-11-23）
 *
 * ## 为什么要有这一门
 * 说明书里那章「日志页签」把页签名**手抄**成了 14 行散文，而代码名册已经长到 28 格 ——
 * 于是玩家照说明书找「星轨占卜」「三日曜盘」「Canon Library」，页签条上根本没有这串字。
 * 这是本仓老熟人（B144/B148/B149 那一族：账上有陈述、没有尺子），只是这次长在**给玩家看的那一侧**：
 * 名字抄错的代价不是测试红，是玩家在游戏里找不到功能。
 *
 * 所以这里不核对"章节数 ≥ 多少"这种会悄悄过期的数字，而是把两件必须恒等的事钉住：
 * 1. 页签名册（代码现推，含顺序 = 页签条从左到右的 DOM 顺序）↔ 说明书那一章的 bullet 名单；
 * 2. 每一枚 UI 热键动作都在说明书里"点得出名"（`{动作}` 占位或它的显示名，二者其一）。
 * 两条都是双向的：新增页签/动作没写进说明书要点名，说明书写了个不存在的页签也要点名。
 *
 * ## 为什么章节名册要"解析源码"而不是 import
 * `SECTIONS` 住在 `src/ui/HelpManual.js`，那是带 DOM 的 UI 层（`document.getElementById` 在构造期就跑）。
 * 基础 7 章的字面量表在 `mergeHelpSections([...])` 的入参里，扩展章在 `content/helpManual.js`（可直接 import）。
 * 所以基础章按文本读 id/title/body —— 读出来一条都没有也算红（下面的锚点用例盯这一点）。
 *
 * ## bullet 的书写形状（这门自己的语法，改形状要连这里一起改）
 * 一行一格，`· <页签显示名> — <这一格看到什么>`；分隔符固定为 ` — `（前后各一个空格）。
 * 只取分隔符左边那一段和代码里的显示名**逐字**比对，右边怎么写都不管。
 */

const ROSTER_BODY_KEY = 'hm_body_journal_tabs';

const uiSrc = readFileSync('src/ui/HelpManual.js', 'utf8').replace(/\r\n/g, '\n');
const BASE_SECTIONS = [...uiSrc.matchAll(
  /\{\s*\n?\s*id: '([a-z0-9-]+)',\s*\n?\s*title: '(hm_title_[a-z0-9_]+)',\s*\n?\s*body: '(hm_body_[a-z0-9_]+)',/g,
)].map((m) => ({ id: m[1], title: m[2], body: m[3] }));

const SECTIONS = [...BASE_SECTIONS, ...HELP_SECTIONS_EXTRA];
const TABS = mergeJournalCategories(JOURNAL_CATEGORIES);
const TAB_KEYS = Object.keys(TABS);

const tables = [['zh', STRINGS_ZH], ['en', STRINGS_EN]];
const bullets = (text) =>
  text
    .split('\n')
    .filter((l) => /^\s*·\s/.test(l))
    .map((l) => l.trim().replace(/^·\s*/, '').split(' — ')[0].trim());
const tabLabels = (STR) => TAB_KEYS.map((k) => STR[TABS[k]]);

describe('说明书章节表：两语都有内容', () => {
  it('解析器读得到基础章（读空了这门就白钉，先钉自己）', () => {
    expect(BASE_SECTIONS.map((s) => s.id)).toContain('start');
    expect(BASE_SECTIONS.length).toBeGreaterThanOrEqual(7);
  });

  it('每一章的标题与正文在 zh/en 两张表里都非空，且正文不等于标题', () => {
    const bad = [];
    for (const s of SECTIONS) {
      for (const [lang, STR] of tables) {
        const title = STR[s.title];
        const body = STR[s.body];
        if (!title || !String(title).trim()) bad.push(`${s.id}.${lang}.title`);
        if (!body || !String(body).trim()) bad.push(`${s.id}.${lang}.body`);
        if (title && body && String(body).trim() === String(title).trim()) bad.push(`${s.id}.${lang}.body=标题`);
      }
    }
    expect(bad, `这些章节缺文案：\n${bad.join('\n')}`).toEqual([]);
  });

  it('章节 id 不重号（重号的那一章在导航里被后写的顶掉，玩家看不见第一条）', () => {
    const ids = SECTIONS.map((s) => s.id);
    expect(ids.filter((v, i) => ids.indexOf(v) !== i)).toEqual([]);
  });
});

describe('日志页签名册 ↔ 说明书那一章（逐字、逐序、双向）', () => {
  it.each(tables)('[%s] bullet 名单与代码名册逐格相等（含顺序 = 页签条从左到右）', (lang, STR) => {
    const want = tabLabels(STR);
    const got = bullets(STR[ROSTER_BODY_KEY]);
    const missing = want.filter((v) => !got.includes(v));
    const ghost = got.filter((v) => !want.includes(v));
    expect(
      got,
      `[${lang}] 说明书页签名单与代码名册不符\n缺（有页签没写）：${missing.join(' / ') || '无'}\n多（写了没这页签）：${ghost.join(' / ') || '无'}`,
    ).toEqual(want);
  });

  it('名册本身非空、显示名两语都有、且不重号（重号会让逐字比对失去意义）', () => {
    expect(TAB_KEYS.length).toBeGreaterThan(20);
    for (const [lang, STR] of tables) {
      const labels = tabLabels(STR);
      expect(labels.filter((v) => !v || !v.trim()), `${lang} 有页签没有显示名`).toEqual([]);
      expect(labels.filter((v, i) => labels.indexOf(v) !== i), `${lang} 页签显示名重号`).toEqual([]);
    }
  });

  // 说明书里那句"角标只在数得出来的格子出现"要有真源，不然它就是一句新的漂亮话。
  // `HUD.renderJournal()` 的角标链条对未声明的扩展页签会走 `getCounts()[k] ?? 0`，
  // 而 `getCounts()` 只认基础类别 —— 于是新加一格页签忘了声明，就永远显示一个假的 (0)。
  it('每一格页签的角标都有交代（不是日志类别的，必须在 HUD 里显式声明）', () => {
    const hud = readFileSync('src/ui/HUD.js', 'utf8').replace(/\r\n/g, '\n');
    const isJournalCategory = new Set(Object.keys(JOURNAL_CATEGORIES));
    const silent = TAB_KEYS.filter((k) => !isJournalCategory.has(k) && !hud.includes(`k === '${k}'`));
    expect(silent, `这些页签既不是日志类别、也没在 HUD 角标链条里出现，会永远挂着假的 (0)：${silent.join(' / ')}`).toEqual([]);
  });
});

describe('UI 热键动作都在说明书里点得出名', () => {
  // 记法两择其一：正文里的 `{动作}` 占位（改绑后自动跟着改口），或动作的显示名原文。
  it.each(tables)('[%s] 每一格动作都被写过（否则玩家只能靠猜）', (lang, STR) => {
    const all = SECTIONS
      .map((s) => `${STR[s.title] ?? ''}\n${STR[s.body] ?? ''}`)
      .join('\n');
    const uncovered = UI_ACTIONS.filter((action) => {
      const label = STR[UI_HOTKEY_LABELS[action]];
      return !all.includes(`{${action}}`) && !(label && all.includes(label));
    });
    expect(uncovered, `[${lang}] 说明书没提到的 UI 动作：${uncovered.join(', ')}`).toEqual([]);
  });
});
