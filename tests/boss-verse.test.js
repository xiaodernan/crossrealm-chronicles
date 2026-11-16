/**
 * W-Z289 · 余火回响 —— 击杀现场的真数据收敛 + 回句净化 + 离线零网络。
 *
 * 三条必须钉死的线：
 * ① 请求体只带真数据（bossId / name / chapter / kills / level / lang），没有编死词也没有破格字段；
 * ② sanitizeVerse 出一行可以直接进 textContent 的话（控制字符净化、空白合并、截断 72 字）；
 * ③ 离线（onlineServices 未启用 / askBossVerse 缺失）→ 直接返回不发请求（见 _onBossDefeated）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { setLanguage, t } from '../src/engine/i18n.js';
import { bossNameKeyOf } from '../src/content/bossRoster.js';
import {
  bossVersePayload,
  sanitizeVerse,
} from '../src/game/BossVerseSystem.js';

const mkGame = (over = {}) => ({
  quests: { chapter: 3, stats: { level: 14 } },
  stats: { bossDefeated: { 'archmagus': 2 } },
  ...over,
});

describe('余火回响 · 请求体只带真数据', () => {
  beforeEach(() => { setLanguage('zh'); });
  afterEach(() => { setLanguage('zh'); });

  it('bossId/name/chapter/kills/level/lang 齐，bossNameKeyOf 解析的名字不是裸 id', () => {
    const p = bossVersePayload(mkGame(), 'archmagus');
    expect(p.bossId).toBe('archmagus');
    expect(p.name).toBeTruthy();
    expect(p.name).not.toBe('archmagus'); // 走的是 bossNameKeyOf → t() 解析后的中文 | 英文原名
    expect(p.chapter).toBe('3');
    expect(p.kills).toBe('2');
    expect(p.level).toBe('14');
    expect(p.lang).toBe('zh');
    expect(bossNameKeyOf('archmagus')).toBeTruthy();
  });

  it('kills 至少 1（没踩过账本也按 1 记，不撒谎说 0 次）', () => {
    const p = bossVersePayload(mkGame({ stats: { bossDefeated: {} } }), 'archmagus');
    expect(p.kills).toBe('1');
  });

  it('game 缺零件也不炸，一切有默认', () => {
    const p = bossVersePayload({}, 'archmagus');
    expect(p.bossId).toBe('archmagus');
    expect(p.chapter).toBe('1');
    expect(p.level).toBe('1');
    expect(p.kills).toBe('1');
  });

  it('bossId 是未知的 boss 时 name 回退为系统默认名（不至于显示裸 id），不抛异常', () => {
    const p = bossVersePayload({}, '???unregistered-boss');
    expect(p.name).toBe(String(t(bossNameKeyOf('???unregistered-boss'))));
    expect(p.name).not.toBe('???unregistered-boss');
  });

  it('en 模式下 lang=en', () => {
    setLanguage('en');
    const p = bossVersePayload(mkGame(), 'archmagus');
    expect(p.lang).toBe('en');
  });

  it('bossId 超长被截断（@Size 是服务端第二道），超长名字也被截断', () => {
    const p = bossVersePayload(mkGame(), 'x'.repeat(999));
    expect(p.bossId.length).toBeLessThanOrEqual(64);
    expect(p.name.length).toBeLessThanOrEqual(80);
  });
});

describe('余火回响 · sanitizeVerse 出一行可以落字幕的话', () => {
  it('控制字符净化、空白合并成一行', () => {
    expect(sanitizeVerse('火还在\u0000——它\u001b只是\n换了个方向烧')).toBe('火还在——它只是换了个方向烧');
    expect(sanitizeVerse('  火 还 在  ')).toBe('火 还 在');
  });

  it('超长截断至 72 字', () => {
    expect(sanitizeVerse('风'.repeat(500)).length).toBe(72);
  });

  it('空串 / 非字符串 → 空串（调用方据此静默）', () => {
    expect(sanitizeVerse('')).toBe('');
    expect(sanitizeVerse(null)).toBe('');
    expect(sanitizeVerse(undefined)).toBe('');
    expect(sanitizeVerse(0)).toBe('0'); // 数字保留（调用方说什么就是什么），控制字符一律净化
    expect(sanitizeVerse('   ')).toBe('');
  });
});
