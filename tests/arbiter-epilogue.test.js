/**
 * W-Z288 · 烬灯回信 —— LLM 分支签名路由 + 不可信 JSON 宽容解析 + 静默回退。
 *
 * 两条必须钉死的线：
 * ① choice 只有 keep/quiet/unwritten 三类、出自 stats.decisions（与 endingDialogKey 同钮同源）；
 * ② 模型回的 JSON 只有走 textContent 那条路子能活，注入痕迹一律活不出来（<script> / 超长 / 控制字符）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { setLanguage } from '../src/engine/i18n.js';
import {
  arbiterChoiceOf,
  arbiterStatsSummary,
  buildArbiterPayload,
  parseArbiterAnswer,
  ARBITER_TEXT_LIMITS,
} from '../src/cinematic/arbiterEpilogue.js';

const mkStats = (decisions) => ({
  hits: 1200,
  kills: { boss: 5, gloom_snuffer: 30 },
  discoveries: new Set(['a', 'b', 'c']),
  dungeonsCleared: new Set(['d1', 'd2']),
  decisions,
  level: 22,
});

describe('烬灯回信 · 抉择路由（与 endingDialogKey 同钮同源取法）', () => {
  it('keep → keep / quiet → quiet / 无抉择 → unwritten', () => {
    expect(arbiterChoiceOf(mkStats(new Set(['choice_final_keep'])))).toBe('keep');
    expect(arbiterChoiceOf(mkStats(new Set(['choice_final_quiet'])))).toBe('quiet');
    expect(arbiterChoiceOf(mkStats(new Set()))).toBe('unwritten');
    expect(arbiterChoiceOf(mkStats(undefined))).toBe('unwritten');
    expect(arbiterChoiceOf(undefined)).toBe('unwritten');
    expect(arbiterChoiceOf({})).toBe('unwritten');
  });
});

describe('烬灯回信 · 账本摘要永远不超 server 的 500 字上限', () => {
  it('包含 echoes/dungeons/discoveries/decisions/level/killsTotal', () => {
    const s = arbiterStatsSummary(mkStats(new Set(['choice_final_keep'])), { echoes: 110, killsTotal: 35 });
    const obj = JSON.parse(s);
    expect(obj.echoes).toBe(110);
    expect(obj.dungeons).toBe(2);
    expect(obj.discoveries).toBe(3);
    expect(obj.level).toBe(22);
    expect(obj.killsTotal).toBe(35);
    expect(s.length).toBeLessThanOrEqual(ARBITER_TEXT_LIMITS.statsMax);
  });

  it('超长时退到精简账本而不是截断出非法 JSON', () => {
    const huge = mkStats(new Set(['choice_final_keep']));
    huge.discoveries = new Set(Array.from({ length: 99999 }, (_, i) => `very-long-discovery-id-${i}-padding-padding`));
    const s = arbiterStatsSummary(huge, { echoes: 110, killsTotal: 35 });
    expect(s.length).toBeLessThanOrEqual(ARBITER_TEXT_LIMITS.statsMax);
    expect(() => JSON.parse(s)).not.toThrow();
  });
});

describe('烬灯回信 · buildArbiterPayload（真 game 形状）', () => {
  beforeEach(() => { setLanguage('zh'); });
  afterEach(() => { setLanguage('zh'); });

  it('choice/lang/stats 三件齐，且 stats ≤ 500 字符', () => {
    const game = {
      quests: { stats: mkStats(new Set(['choice_final_keep'])) },
      popCulture: { unlocked: new Set(['e1', 'e2']) },
    };
    const p = buildArbiterPayload(game);
    expect(p.choice).toBe('keep');
    expect(p.lang).toBe('zh');
    expect(typeof p.stats).toBe('string');
    expect(p.stats.length).toBeLessThanOrEqual(ARBITER_TEXT_LIMITS.statsMax);
    expect(() => JSON.parse(p.stats)).not.toThrow();
  });

  it('game 缺零件也不炸：quests 没 stats 时回 unwritten/zh/合法 stats', () => {
    const p = buildArbiterPayload({});
    expect(p.choice).toBe('unwritten');
    expect(p.lang).toBe('zh');
    expect(() => JSON.parse(p.stats)).not.toThrow();
  });

  it('en 模式下 lang=en', () => {
    setLanguage('en');
    const p = buildArbiterPayload({});
    expect(p.lang).toBe('en');
  });
});

describe('烬灯回信 · 宽容解析（模型是收信人，不是少数民主的正则工）', () => {
  it('纯 JSON 直接解析', () => {
    const r = parseArbiterAnswer('{"title":"灯还亮着","epilogue":"走完的人，门还开着。","omen":"下一盏灯等你叫它的名字"}');
    expect(r?.title).toBe('灯还亮着');
    expect(r?.epilogue).toContain('门还开着');
    expect(r?.omen).toContain('下一盏灯');
  });

  it('带代码围栏 / 前后客套话也能抓出第一个 {...}', () => {
    const raw = '好的，下面是您的短信：\n```json\n{"title":"收灯了","epilogue":"尾巴落了，灯还在。","omen":"下一回见"}\n```\n也没什么别的。';
    expect(parseArbiterAnswer(raw)?.title).toBe('收灯了');
  });

  it('title/epilogue 缺一就是 null（不假装有回信）', () => {
    expect(parseArbiterAnswer('{"epilogue":"只有正文"}')).toBeNull();
    expect(parseArbiterAnswer('{"title":"只有题名"}')).toBeNull();
    expect(parseArbiterAnswer('{}')).toBeNull();
  });

  it('超长字段被截断而不丢整条', () => {
    const long = '风'.repeat(1000);
    const r = parseArbiterAnswer(`{"title":"${long}","epilogue":"${long}","omen":"${long}"}`);
    expect(r.title.length).toBe(ARBITER_TEXT_LIMITS.titleLen);
    expect(r.epilogue.length).toBe(ARBITER_TEXT_LIMITS.epilogueLen);
    expect(r.omen.length).toBe(ARBITER_TEXT_LIMITS.omenLen);
  });

  it('控制字符 / 非字符串输入都不炸', () => {
    expect(parseArbiterAnswer('{"title":"a\u0000b\u001fc","epilogue":"还是那个灯"}')?.title).toBe('abc');
    expect(parseArbiterAnswer(null)).toBeNull();
    expect(parseArbiterAnswer(undefined)).toBeNull();
    expect(parseArbiterAnswer(42)).toBeNull();
    expect(parseArbiterAnswer('nothing-here')).toBeNull();
  });
});
