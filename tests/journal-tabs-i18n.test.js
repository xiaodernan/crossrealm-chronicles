/**
 * 四个日志子页签双表化（W-D2 切片30）。
 *
 * ## 为什么要有这道门禁
 *
 * 切片27 迁了三个页签的**标题**，正文与状态行仍是裸中文：营火记忆的统计/空态/返回钮、
 * 流派技能的解锁态/前置条件/叙事技条件/统计行、CG 画廊的统计/空态/锁定区/提示/返回钮、
 * 地下城纪事的整块（标题走 keyText 中文模板、统计、房数、两条提示）。更糟的是三处
 * **该过 t() 却裸用键**的真 bug：CG 卡片 sub 直接渲染 `e.speaker`（键名）、锁定卡片
 * 与页签筛选裸渲染 `CG_ZONE_LABELS`（键名）、流派技能卡裸渲染 `s.name`/`s.desc`（键名）——
 * 英文玩家在这些位置看到的是 `cg_zone_hub` 这类键名，比中文更糟。
 *
 * 修法：23 个新键（`journal_*` / `weapon_skill_*` / `cg_*`）+ 3 个复用键
 * （`cg_zone_all` / `achievement_unlocked_label` / `fast_travel_locked`，各值都已占满
 * 「同文案最多两键」上限）；`grant.boss` 经 `bossNameKeyOf()` 转键（顺手修掉裸 Boss ID）；
 * keyText 中文模板统一改 `keyText(t(键))`。
 *
 * 腿：
 * 1. 钉文案腿：23 个新键 + 3 个复用键的中英原值逐字钉死。
 * 2. 静态腿：四个文件去注释后引号内无裸中文。
 * 3. 行为腿：四个页签中英两语真渲染一遍，逐块对文案，英文下零中文。
 * 4. 键数腿：双表对齐且键数只增不减（2243 → 2269）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CgJournalTab } from '../src/ui/CgJournalTab.js';
import { CampfireMemoryJournalTab } from '../src/ui/CampfireMemoryJournalTab.js';
import { DungeonJournalTab } from '../src/ui/DungeonJournalTab.js';
import { WeaponSkillJournalTab } from '../src/ui/WeaponSkillJournalTab.js';
import { setLanguage } from '../src/engine/i18n.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { makeMarkupDom } from './helpers/fakeMarkupDom.js';

const 读 = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const 含汉 = /[\u4e00-\u9fff]/;

const FILES = [
  'src/ui/CampfireMemoryJournalTab.js',
  'src/ui/WeaponSkillJournalTab.js',
  'src/ui/CgJournalTab.js',
  'src/ui/DungeonJournalTab.js',
];

/** 23 个新键 + 3 个复用键：键 → [中文原值, 英文原值] */
const KEYS = {
  journal_stat_count_fmt: ['${n} 次', '${n|time|times}'],
  journal_campfire_empty: ['尚未在任何营火休息', 'No campfire rests yet'],
  journal_campfire_stats_fmt: ['共休息 ${total} 次 · ${zones} 处营火 · 对话节点 ${nodes} 条', '${total} rests · ${zones} campfires · ${nodes} dialogue nodes'],
  journal_campfire_nodes_empty: ['选择营火对话后会在此记录', 'Campfire dialogue records will show up here'],
  journal_campfire_back: ['← 返回营火日志', '← Back to campfire log'],
  weapon_skill_cost_fmt: ['${cost} 点', '${cost} pts'],
  weapon_skill_need_prereq: [' · 需前置', ' · prereq needed'],
  weapon_skill_need_boss_fmt: ['需击败 ${boss}', 'Defeat ${boss}'],
  weapon_skill_need_chapter_fmt: ['需 Chapter ${chapter}', 'Requires Chapter ${chapter}'],
  weapon_skill_tag_narrative: ['叙事', 'Narrative'],
  weapon_skill_narrative_title: ['叙事技能 (击败 Boss / 推进章节自动解锁)', 'Narrative Skills (defeat Bosses / advance chapters to unlock)'],
  weapon_skill_stats_fmt: ['可用技能点 ${points} · 已解锁 ${unlocked} · 营火升级面板可加点', 'Skill points ${points} · Unlocked ${unlocked} · spend them at the campfire upgrade panel'],
  cg_view_count_fmt: ['观看 ${n} 次', 'Viewed ${n|time|times}'],
  cg_stats_fmt: ['已解锁 ${unlocked} / ${total}（${percent}%）· 收藏 ${favorites}', 'Unlocked ${unlocked} / ${total} (${percent}%) · Favorites ${favorites}'],
  cg_empty_zone: ['此区域暂无已解锁 CG — 去营火对话或击败 Boss', 'No unlocked CGs in this area — try campfire dialogues or defeating a Boss'],
  cg_hint: ['营火分支对话解锁插画 · Boss 击破解锁战斗 CG · 连击/处决解锁战斗记忆', 'Campfire dialogue branches unlock illustrations · Boss defeats unlock combat CGs · combos and executions unlock combat memories'],
  journal_cg_back: ['← 返回日志', '← Back to journal'],
  journal_dungeon_empty: ['尚未清空任何地下城', 'No dungeons cleared yet'],
  journal_dungeon_run_meta_fmt: ['Ch${chapter} · ${elapsed}s · ${rooms} 房', 'Ch${chapter} · ${elapsed}s · ${rooms} rooms'],
  journal_tab_dungeon_runs: ['地下城纪事 · {journal} 关闭', 'Dungeon Records · {journal} to close'],
  journal_dungeon_stats_fmt: ['总清空 ${clears} 次 · ${dungeons} 座迷宫有记录', '${clears} total clears · records for ${dungeons} mazes'],
  journal_dungeon_empty_hint: ['进入紫色传送环按 {interact} 开始探索', 'Enter the purple portal and press {interact} to start exploring'],
  journal_dungeon_hint: ['Ch5 后部分迷宫可重复挑战 · 小地图在迷宫内显示房间进度', 'Some mazes can be re-challenged after Ch5 · the minimap shows room progress inside'],
  journal_campfire_rests_title: ['休息次数', 'Rest Counts'],
  journal_dungeon_summary_title: ['累计', 'Totals'],
  journal_dungeon_recent_title: ['最近通关', 'Recent Clears'],
  cg_zone_all: ['全部', 'All'],
  achievement_unlocked_label: ['已解锁', 'Unlocked'],
  fast_travel_locked: ['未解锁', 'Locked'],
};

/** 日志抽屉的四格页签 + 各格需要的最小 game 桩（形状承 journal-tab-return 的 mount） */
function mount() {
  const doc = makeMarkupDom();
  globalThis.document = doc;
  const host = doc.createElement('div');
  host.id = 'journal-panel';
  doc.hosts['journal-panel'] = host;
  doc.activeElement = null;

  const game = {
    quests: { chapter: 1, current: null, getProgressText: () => '' },
    cgGallery: {
      getStats: () => ({ unlocked: 2, total: 10, percent: 20, favorites: 1 }),
      getEntries: () => [],
      getLockedPreview: () => [{ id: 'bonus:boss-shadow', zone: 'hub' }],
      favorites: new Set(),
      viewCounts: {},
      recordView() {},
    },
    campfireMemory: {
      getStats: () => ({ total: 3, zones: 2, nodeCount: 5 }),
      getMemories: () => [],
      restCount: { 'rest-hub': 3 },
    },
    weaponSkills: { unlocked: new Set(['s-blade']), skillPoints: 4 },
    dungeonRuns: {
      getStats: () => ({ totalClears: 4, dungeons: 2, runs: 1 }),
      runs: [{ chapter: 1, elapsed: 65, rooms: 6, name: 'ruin-crypt' }],
      clears: { 'dungeon-ruin-crypt': 2 },
      _name: (id) => id,
    },
    restPoints: { nameOf: (id) => id, ids: () => ['rest-hub'] },
    dialogCg: { render: () => 'data:,', renderScene: () => 'data:,' },
  };
  const tabs = {
    cg: new CgJournalTab(game),
    memory: new CampfireMemoryJournalTab(game),
    dungeons: new DungeonJournalTab(game),
    skills: new WeaponSkillJournalTab(game),
  };
  return { doc, host, game, tabs };
}

describe('日志子页签双表化（W-D2 切片30）', () => {
  beforeAll(() => { setLanguage('zh'); });
  afterAll(() => { setLanguage('zh'); delete globalThis.document; });

  it('钉文案腿：23 个新键 + 3 个复用键的中英原值逐字钉死', () => {
    expect(Object.keys(KEYS)).toHaveLength(29);
    for (const [key, [zh, en]] of Object.entries(KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
    // 反向控制：过滤器必须能点名没登记的键
    expect(['journal_stat_count_fmt', 'no_such_key_xyz'].filter((k) => !(k in STRINGS_ZH))).toEqual(['no_such_key_xyz']);
  });

  it('静态腿：四个页签文件去注释后引号内无裸中文', () => {
    for (const f of FILES) {
      const src = 读(f).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
      expect(src, `${f} 里去掉注释还有中文（含模板字符串里的裸文案）`).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it('行为腿·营火记忆：统计/次数/空态/返回钮中英两语逐字对', () => {
    for (const [lang, want] of [
      ['zh', ['全部', '3 次', '共休息 3 次 · 2 处营火 · 对话节点 5 条', '← 返回营火日志', '选择营火对话后会在此记录', '休息次数']],
      ['en', ['All', '3 times', '3 rests · 2 campfires · 5 dialogue nodes', '← Back to campfire log', 'Campfire dialogue records will show up here', 'Rest Counts']],
    ]) {
      setLanguage(lang);
      const { host, tabs } = mount();
      tabs.memory.render(host);
      for (const w of want) expect(host.innerHTML, `${lang}: 营火记忆页缺 ${w}`).toContain(w);
      if (lang === 'en') expect(host.innerHTML, '英文营火记忆页夹中文').not.toMatch(含汉);
    }
    // 空数据臂：哪儿都没休息过
    setLanguage('zh');
    const { host, game, tabs } = mount();
    game.campfireMemory.restCount = {};
    tabs.memory.render(host);
    expect(host.innerHTML).toContain('尚未在任何营火休息');
    setLanguage('zh');
  });

  it('行为腿·流派技能：花费/前置/Boss 名/章节条件/统计行中英两语逐字对', () => {
    for (const [lang, want] of [
      ['zh', ['已解锁', '2 点 · 需前置', '1 点', '需击败 影界守护者', '需 Chapter 5', '叙事', '叙事技能 (击败 Boss / 推进章节自动解锁)', '锋刃精通 I', '可用技能点 4 · 已解锁 1 · 营火升级面板可加点']],
      ['en', ['Unlocked', '2 pts · prereq needed', '1 pts', 'Defeat Shadow Warden', 'Requires Chapter 5', 'Narrative', 'Narrative Skills (defeat Bosses / advance chapters to unlock)', 'Blade Mastery I', 'Skill points 4 · Unlocked 1 · spend them at the campfire upgrade panel']],
    ]) {
      setLanguage(lang);
      const { host, tabs } = mount();
      tabs.skills.render(host);
      for (const w of want) expect(host.innerHTML, `${lang}: 流派技能页缺 ${w}`).toContain(w);
      if (lang === 'en') expect(host.innerHTML, '英文流派技能页夹中文').not.toMatch(含汉);
    }
    setLanguage('zh');
  });

  it('行为腿·CG 画廊：统计/空态/锁定区/提示/返回钮/灯箱中英两语逐字对', () => {
    for (const [lang, want] of [
      ['zh', ['已解锁 2 / 10（20%）· 收藏 1', '此区域暂无已解锁 CG — 去营火对话或击败 Boss', '未解锁', '枢纽', '营火分支对话解锁插画 · Boss 击破解锁战斗 CG · 连击/处决解锁战斗记忆', '← 返回日志']],
      ['en', ['Unlocked 2 / 10 (20%) · Favorites 1', 'No unlocked CGs in this area — try campfire dialogues or defeating a Boss', 'Locked', 'Hub', 'Campfire dialogue branches unlock illustrations · Boss defeats unlock combat CGs · combos and executions unlock combat memories', '← Back to journal']],
    ]) {
      setLanguage(lang);
      const { doc, host, tabs } = mount();
      tabs.cg.render(host);
      for (const w of want) expect(host.innerHTML, `${lang}: CG 画廊页缺 ${w}`).toContain(w);
      if (lang === 'en') expect(host.innerHTML, '英文 CG 画廊页夹中文').not.toMatch(含汉);
      // 灯箱 meta：说话人 / 区域名 / 观看次数都走 t()
      tabs.cg.showLightbox({ id: 'x1', caption: 'cg_caption_fantasy_start', speaker: 'cg_speaker_campfire', zone: 'hub', scene: 'fantasy_start' });
      const meta = doc.body.querySelector('.cg-lightbox-meta').textContent;
      const expectMeta = lang === 'zh' ? '营火 · 枢纽 · 观看 1 次' : 'Campfire · Hub · Viewed 1 time';
      expect(meta, `${lang}: 灯箱 meta 不对`).toBe(expectMeta);
    }
    setLanguage('zh');
  });

  it('行为腿·地下城纪事：标题/统计/房数/脚注中英两语逐字对', () => {
    for (const [lang, want] of [
      ['zh', ['地下城纪事', '总清空 4 次 · 2 座迷宫有记录', '2 次', 'Ch1 · 65s · 6 房', 'Ch5 后部分迷宫可重复挑战 · 小地图在迷宫内显示房间进度', '累计', '最近通关']],
      ['en', ['Dungeon Records', '4 total clears · records for 2 mazes', '2 times', 'Ch1 · 65s · 6 rooms', 'Some mazes can be re-challenged after Ch5 · the minimap shows room progress inside', 'Totals', 'Recent Clears']],
    ]) {
      setLanguage(lang);
      const { host, tabs } = mount();
      tabs.dungeons.render(host);
      for (const w of want) expect(host.innerHTML, `${lang}: 地下城纪事页缺 ${w}`).toContain(w);
      expect(host.innerHTML, `${lang}: keyText 占位没展开`).not.toMatch(/\{/);
      if (lang === 'en') expect(host.innerHTML, '英文地下城纪事页夹中文').not.toMatch(含汉);
    }
    setLanguage('zh');
  });


  it('行为腿·地下城纪事空态：一次没通关时给「进传送环」的提示', () => {
    for (const [lang, hint] of [['zh', '进入紫色传送环按'], ['en', 'Enter the purple portal']]) {
      setLanguage(lang);
      const { host, game, tabs } = mount();
      game.dungeonRuns.runs = [];
      tabs.dungeons.render(host);
      const rest = lang === 'zh' ? '开始探索' : 'to start exploring';
      expect(host.innerHTML, `${lang}: 空态提示没出来`).toContain(hint);
      expect(host.innerHTML, `${lang}: 空态提示没说完`).toContain(rest);
      expect(host.innerHTML, `${lang}: keyText 占位没展开`).not.toMatch(/\{/);
    }
    setLanguage('zh');
  });
  it('键数腿：双表对齐且键数只增不减（2243 → 2266）', () => {
    const zhKeys = Object.keys(STRINGS_ZH);
    const enKeys = Object.keys(STRINGS_EN);
    expect(zhKeys.length).toBe(enKeys.length);
    expect(zhKeys.length).toBeGreaterThanOrEqual(2269);
  });
});
