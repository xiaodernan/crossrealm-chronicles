/**
 * 赛季（W-F2 切片1）的门禁。
 *
 * ## 这一片最该钉的不是界面，是"两份实现给出同一个答案"
 *
 * 赛季轮转有两份实现：Java 的 `SeasonCatalog`（服务端）与 `content/seasons.js`（客户端）。
 * 它们必须逐日一致，否则会出现"面板说还剩 1 天、服务端说刚换季"这种没人能复现的怪事。
 * 这里用**与服务端 `SeasonCatalogTest` 同一组边界**（第 0/13/14/27/28/42/56 天与 -1 天）
 * 逐条断言；id 名单也逐字冻结 —— 服务端改名而客户端没跟上时，这条会红。
 *
 * ## 其余三组
 *
 * - 轮转算式的边界（负数、周期可配、第几天+剩余天数闭合）；
 * - `SeasonSystem` 的"信谁"：默认本地、在线只做确认、未知 id 忽略、失败不回退成空；
 * - 接线与文案：页签 / 子面板 / 装配 / 双表登记（这个仓库里"加了系统却打不开"发生过不止一次）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  SEASON_CYCLE_DAYS, SEASON_MODIFIERS, SEASONS,
  dayInCycleAt, daysRemainingAt, epochDayOf, modifierOf, seasonAt, seasonOf,
} from '../src/content/seasons.js';
import { SeasonSystem } from '../src/game/SeasonSystem.js';
import { OnlineServices } from '../src/online/OnlineServices.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

/** 与服务端名册逐字对齐的冻结名单（改名/加季都要同时改两边） */
const 服务端赛季id = ['ember', 'tide', 'gloom', 'radiant'];
const 服务端词缀id = [
  'burning-ground', 'elite-surge', 'drowned-echo', 'heavy-fog',
  'gloom-veil', 'swift-shades', 'radiant-decree', 'armored-choir',
];

/** 宿主：只带一份可注入的 online 客户端，别的都不需要 */
const 宿主 = (online) => ({ onlineServices: online });

const 固定时刻 = (epochDay) => () => epochDay * 86400000;

describe('内容层：名册与服务端逐字对齐', () => {
  it('四套赛季，id 与顺序照抄服务端', () => {
    expect(SEASONS.map((s) => s.id)).toEqual(服务端赛季id);
    expect(SEASONS).toHaveLength(4);
  });

  it('八条词缀，id 与顺序照抄服务端', () => {
    expect(SEASON_MODIFIERS.map((m) => m.id)).toEqual(服务端词缀id);
  });

  it('每一季的两条词缀都在词缀表里（服务端加了新词缀而客户端没跟上时这里会红）', () => {
    for (const season of SEASONS) {
      expect(season.modifierIds.length, `${season.id} 的词缀数量不是 2`).toBe(2);
      for (const id of season.modifierIds) {
        expect(modifierOf(id), `${season.id} 引用了未登记的词缀 ${id}`).not.toBe(null);
      }
    }
  });

  it('默认周期是 14 天（与服务端 cycle-days 默认值同一个数）', () => {
    expect(SEASON_CYCLE_DAYS).toBe(14);
  });

  it('魂火加成在 0..100，且四套不全是 0（否则这一列是摆设）', () => {
    for (const s of SEASONS) expect(s.soulsBonusPct).toBeGreaterThanOrEqual(0);
    expect(SEASONS.some((s) => s.soulsBonusPct > 0)).toBe(true);
  });
});

describe('轮转算式：与服务端同一组边界', () => {
  it('第 0/13/14/27/28/42/56 天各自落在哪一季（与 SeasonCatalogTest 同表）', () => {
    expect(seasonAt(0).id).toBe('ember');
    expect(seasonAt(13).id).toBe('ember');
    expect(seasonAt(14).id).toBe('tide');
    expect(seasonAt(27).id).toBe('tide');
    expect(seasonAt(28).id).toBe('gloom');
    expect(seasonAt(42).id).toBe('radiant');
    expect(seasonAt(56).id).toBe('ember');
  });

  it('纪元之前（-1 天）也不越界：落在最后一季的最后一天', () => {
    expect(seasonAt(-1).id).toBe('radiant');
    expect(dayInCycleAt(-1)).toBe(13);
    expect(daysRemainingAt(-1)).toBe(1);
  });

  it('第几天 + 剩余天数 = 周期长度（连走 60 天）', () => {
    for (let day = 0; day < 60; day++) {
      expect(dayInCycleAt(day) + daysRemainingAt(day), `day=${day}`).toBe(SEASON_CYCLE_DAYS);
      expect(dayInCycleAt(day)).toBeGreaterThanOrEqual(0);
      expect(daysRemainingAt(day)).toBeGreaterThanOrEqual(1);
    }
  });

  it('周期可配：7 天一轮时第七天换季', () => {
    expect(seasonAt(6, 7).id).toBe('ember');
    expect(seasonAt(7, 7).id).toBe('tide');
    expect(seasonAt(14, 7).id).toBe('gloom');
    expect(seasonAt(21, 7).id).toBe('radiant');
    expect(seasonAt(28, 7).id).toBe('ember');
  });

  it('脏参数当场抛（静默返回 undefined 会让界面显示空白赛季）', () => {
    expect(() => seasonAt(Number.NaN)).toThrow(/epochDay/);
    expect(() => seasonAt(0, 0)).toThrow(/cycleDays/);
    expect(() => seasonAt(0, -7)).toThrow(/cycleDays/);
    expect(() => seasonAt(0, 3.5)).toThrow(/cycleDays/);
  });

  it('epochDayOf 用 UTC 日界（与服务端 LocalDate.now(UTC) 对齐）', () => {
    expect(epochDayOf(0)).toBe(0);
    expect(epochDayOf(86399999)).toBe(0);
    expect(epochDayOf(86400000)).toBe(1);
    expect(epochDayOf(-1)).toBe(-1);
  });
});

describe('SeasonSystem：默认信本地，在线只做确认', () => {
  it('离线时也有赛季：第 0 天是灰烬，读数是本地算的', () => {
    const sys = new SeasonSystem(宿主(null), { now: 固定时刻(0) });
    const state = sys.getState();
    expect(state.id).toBe('ember');
    expect(state.source).toBe('local');
    expect(state.daysRemaining).toBe(14);
    expect(state.soulsBonusPct).toBe(25);
  });

  it('换一天就换季（本地轮转真的在走）', () => {
    expect(new SeasonSystem(宿主(null), { now: 固定时刻(14) }).getState().id).toBe('tide');
    expect(new SeasonSystem(宿主(null), { now: 固定时刻(28) }).getState().id).toBe('gloom');
  });

  it('词缀只保留客户端认识的那些，未知 id 静默丢弃', () => {
    const sys = new SeasonSystem(宿主(null), { now: 固定时刻(0) });
    expect(sys.modifiers().map((m) => m.id)).toEqual(['burning-ground', 'elite-surge']);
  });

  it('在线确认成功：采用服务端的 override 与倒计时，来源标 online', async () => {
    const online = {
      enabled: () => true,
      fetchActiveSeason: async () => ({
        id: 'gloom', name: '薄暮回响', tagline: '', modifierIds: ['gloom-veil', 'swift-shades'],
        soulsBonusPct: 35, dayInCycle: 11, daysRemaining: 3,
      }),
    };
    const sys = new SeasonSystem(宿主(online), { now: 固定时刻(0) });
    const state = await sys.refreshFromOnline();
    expect(state.source).toBe('online');
    expect(state.id).toBe('gloom');
    expect(state.daysRemaining).toBe(3);
    expect(state.soulsBonusPct).toBe(35);
  });

  it('服务端给了客户端不认识的赛季：忽略它，继续用本地（老客户端连新服务端）', async () => {
    const online = {
      enabled: () => true,
      fetchActiveSeason: async () => ({ id: 'monsoon', daysRemaining: 9 }),
    };
    const sys = new SeasonSystem(宿主(online), { now: 固定时刻(0) });
    const state = await sys.refreshFromOnline();
    expect(state.source).toBe('local');
    expect(state.id).toBe('ember');
  });

  it('在线关闭时一次请求都不发', async () => {
    let calls = 0;
    const online = { enabled: () => false, fetchActiveSeason: async () => { calls += 1; return null; } };
    const sys = new SeasonSystem(宿主(online), { now: 固定时刻(0) });
    await sys.refreshFromOnline();
    expect(calls).toBe(0);
    expect(sys.getState().source).toBe('local');
  });

  it('在线拉取抛异常时不炸、不回退成空（客户端层面已吞错，这里再兜一层）', async () => {
    const online = { enabled: () => true, fetchActiveSeason: async () => { throw new Error('boom'); } };
    const sys = new SeasonSystem(宿主(online), { now: 固定时刻(0) });
    const state = await sys.refreshFromOnline();
    expect(state.source).toBe('local');
    expect(state.id).toBe('ember');
  });

  it('useLocal 把来源退回本地（玩家关掉在线服务时）', async () => {
    const online = { enabled: () => true, fetchActiveSeason: async () => ({ id: 'tide', dayInCycle: 0, daysRemaining: 14 }) };
    const sys = new SeasonSystem(宿主(online), { now: 固定时刻(0) });
    await sys.refreshFromOnline();
    expect(sys.getState().source).toBe('online');
    expect(sys.useLocal().source).toBe('local');
  });

  it('dispose 之后不再持有宿主与网络客户端', () => {
    const sys = new SeasonSystem(宿主(null), { now: 固定时刻(0) });
    sys.dispose();
    expect(sys.game).toBe(null);
    expect(sys.online).toBe(null);
  });
});

describe('OnlineServices.fetchActiveSeason：未启用零请求，失败返回 null', () => {
  it('默认关闭 ⇒ null，fetch 一次都不调', async () => {
    let calls = 0;
    const svc = new OnlineServices({ enabled: false, baseUrl: 'http://x', fetchImpl: async () => { calls += 1; return { ok: true, json: async () => ({}) }; } });
    expect(await svc.fetchActiveSeason()).toBe(null);
    expect(calls).toBe(0);
  });

  it('200 ⇒ 原样交回 JSON', async () => {
    const payload = { id: 'tide', modifierIds: ['heavy-fog'] };
    const svc = new OnlineServices({ enabled: true, baseUrl: 'http://x', fetchImpl: async () => ({ ok: true, json: async () => payload }) });
    expect(await svc.fetchActiveSeason()).toEqual(payload);
  });

  it('非 2xx / 抛异常 ⇒ null（吞掉，不打断游戏）', async () => {
    const bad = new OnlineServices({ enabled: true, baseUrl: 'http://x', fetchImpl: async () => ({ ok: false, status: 503 }) });
    expect(await bad.fetchActiveSeason()).toBe(null);
    const broken = new OnlineServices({ enabled: true, baseUrl: 'http://x', fetchImpl: async () => { throw new Error('offline'); } });
    expect(await broken.fetchActiveSeason()).toBe(null);
  });
});

describe('接线与文案', () => {
  it('日志注册表有 season，且键已登记', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'ui', 'JournalTabRegistry.js'), 'utf8');
    expect(src).toMatch(/season:\s*'journal_tab_season'/);
    expect(STRINGS_ZH.journal_tab_season).toBe('赛季');
    expect(STRINGS_EN.journal_tab_season).toBe('Season');
  });

  it('HUD 有子面板，Game 装配了系统并进了 teardown 登记表', () => {
    const hud = readFileSync(join(process.cwd(), 'src', 'ui', 'HUD.js'), 'utf8');
    expect(hud).toMatch(/season:\s*\(game, panel\)\s*=>\s*game\.seasonTab\.render\(panel\)/);
    const game = readFileSync(join(process.cwd(), 'src', 'core', 'Game.js'), 'utf8');
    expect(game).toMatch(/_adopt\('game\/SeasonSystem', new SeasonSystem\(this\)\)/);
    expect(game).toMatch(/new SeasonJournalTab\(this\)/);
  });

  it('双表登记齐全：名册、词缀与页签里出现的每个 t() 键', () => {
    const keys = new Set([
      ...SEASONS.map((s) => s.name),
      ...SEASONS.map((s) => s.tagline),
      ...SEASON_MODIFIERS.flatMap((m) => [m.label, m.desc]),
      'journal_tab_season', 'season_days_left_fmt', 'season_bonus_fmt',
      'season_source_online', 'season_source_local', 'season_modifiers_label', 'season_unavailable',
    ]);
    const ui = readFileSync(join(process.cwd(), 'src', 'ui', 'SeasonJournalTab.js'), 'utf8');
    for (const m of ui.matchAll(/\bt\('([a-z0-9_]+)'/g)) keys.add(m[1]);
    expect([...keys].filter((k) => !(k in STRINGS_ZH)), '中文表缺键').toEqual([]);
    expect([...keys].filter((k) => !(k in STRINGS_EN)), '英文表缺键').toEqual([]);
  });

  it('UI 里没有裸中文（注释除外）', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'ui', 'SeasonJournalTab.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const 裸中文 = src.match(/['"`][^'"`]*[\u4e00-\u9fa5][^'"`]*['"`]/g) ?? [];
    expect(裸中文, `裸中文：${裸中文.join(' | ')}`).toEqual([]);
  });

  it('seasonOf 未知返回 null（不抛）', () => {
    expect(seasonOf('nope')).toBe(null);
    expect(modifierOf('nope')).toBe(null);
  });
});
