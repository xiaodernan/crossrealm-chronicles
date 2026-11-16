/**
 * W-Z291 · 余火回响落进 [J] 日志 —— 活着的人看完只剩 6 秒 toast，但日志里留下一款真条目。
 *
 * 钉死三件事：
 * ① 在线服务没开 → 零网络（fetch 零次）；
 * ② 在线服务开 + 返回一句话 → toast 落地、storyJournal 收到 category='boss' 的条目（id 唯一、text 净化）；
 * ③ 在线服务返回垃圾 → 两边都安静（toast 不打、journal 不留痕），零异常抛穿。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { OnlineServices } from '../src/online/OnlineServices.js';
import { BossVerseSystem, sanitizeVerse } from '../src/game/BossVerseSystem.js';
import { emit } from '../src/engine/EventBus.js';
import { setLanguage } from '../src/engine/i18n.js';

const BASE = 'http://127.0.0.1:1/';

const gameWith = (fetchImpl, toast, journalAdds) => {
  const online = new OnlineServices({ baseUrl: BASE, fetchImpl, enabled: true });
  return {
    onlineServices: online,
    quests: { chapter: 3, stats: { level: 12 } },
    stats: { bossDefeated: { archmagus: 1 } },
    dialog: { toast },
    storyJournal: {
      addSilent: vi.fn((entry) => { journalAdds.push(entry); }),
    },
  };
};

describe('余火回响落进 [J] 日志', () => {
  beforeEach(() => { setLanguage('zh'); });
  afterEach(() => { setLanguage('zh'); });

  it('enabled=false 时不发请求、不写日志', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ available: true, verse: '火还在' })));
    const toast = vi.fn(); const journalAdds = [];
    const game = gameWith(fetch, toast, journalAdds);
    game.onlineServices = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: false });
    const system = new BossVerseSystem(game);
    emit('boss-defeated', { bossId: 'archmagus' });
    await new Promise((r) => setImmediate(r));
    expect(fetch).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(journalAdds).toHaveLength(0);
    system.dispose();
  });

  it('enabled=true + 一句话 → toast 落地、日志收到 category=boss 的条目', async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ available: true, verse: '火还在——它只是换了个方向烧' })));
    const toast = vi.fn(); const journalAdds = [];
    const game = gameWith(fetch, toast, journalAdds);
    const system = new BossVerseSystem(game);
    emit('boss-defeated', { bossId: 'archmagus' });
    await new Promise((r) => setImmediate(r));
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetch.mock.calls[0][1]?.body ?? '{}');
    expect(body.bossId).toBe('archmagus');
    expect(body.lang).toBe('zh');
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toContain('火还在');
    expect(journalAdds).toHaveLength(1);
    expect(journalAdds[0].category).toBe('boss');
    expect(journalAdds[0].id.startsWith('boss-verse-archmagus-')).toBe(true);
    expect(journalAdds[0].text).toContain('火还在');
    expect(journalAdds[0].title).toContain('余火回响');
    expect(journalAdds[0].chapter).toBe(3);
    system.dispose();
  });

  it('enabled=true + 垃圾响应 → 两边都安静（零 toast、零日志、零抛）', async () => {
    const fetch = vi.fn(async () => new Response('not json', { status: 200 }));
    const toast = vi.fn(); const journalAdds = [];
    const game = gameWith(fetch, toast, journalAdds);
    const system = new BossVerseSystem(game);
    emit('boss-defeated', { bossId: 'archmagus' });
    await new Promise((r) => setImmediate(r));
    expect(toast).not.toHaveBeenCalled();
    expect(journalAdds).toHaveLength(0);
    system.dispose();
  });

  it('日志里那一句已净化（控制字符净化 + 72 字上限）', async () => {
    const noisy = '\u0000火还在——它只是换了个方向烧，然后风又卷起来，整个世界都只剩下了很长很长的一句话只是为了验证这边真的很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长';
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ available: true, verse: noisy })));
    const toast = vi.fn(); const journalAdds = [];
    const game = gameWith(fetch, toast, journalAdds);
    const system = new BossVerseSystem(game);
    emit('boss-defeated', { bossId: 'archmagus' });
    await new Promise((r) => setImmediate(r));
    expect(journalAdds).toHaveLength(1);
    expect(journalAdds[0].text.length).toBeLessThanOrEqual(72);
    expect([...journalAdds[0].text].some((ch) => ch.codePointAt(0) < 32)).toBe(false);
    expect(sanitizeVerse(noisy).length).toBe(72);
    system.dispose();
  });
});
