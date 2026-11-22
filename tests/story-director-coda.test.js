/**
 * StoryDirector 残章（chapter-coda）的 token 节约门禁。
 *
 * 用户明确要求「珍惜 token，该用就用但要省着用」。残章是**每章一次性**的内容：
 * 已经写进日志（并随存档持久化）之后，重启/再次切章不该重新请求同一章。
 * 但 `maybeAskCoda` 原本不检查日志是否已有该条——`addSilent` 内部的 id 去重
 * 只能挡住「重复写入」，请求早已发出、token 早已花掉。
 *
 * 不变量：
 *  ① 日志里已有 `chapter-coda-<ch>` → 不请求（零 token）；
 *  ② 没有 → 请求一次，成功后写进日志（带该 id）；
 *  ③ 同一章第二次调用 → 不请求（第一次已写入，has 为真）；
 *  ④ 不同章各自请求一次；
 *  ⑤ 在线关闭 / 没有该方法 / 上游失败 → 不抛、不写日志。
 *
 * 变异判据：去掉 has 检查 → ①③ 变红。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StoryDirector } from '../src/game/StoryDirector.js';
import { StoryJournal } from '../src/game/StoryJournal.js';

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

const makeGame = ({ line = '一句残章', enabled = true } = {}) => {
  const game = {
    onlineServices: {
      enabled: () => enabled,
      askChapterCoda: vi.fn().mockResolvedValue({ ok: true, data: { line } }),
    },
    quests: { chapter: 2 },
    dialog: { show: vi.fn(), toast: vi.fn() },
  };
  game.storyJournal = new StoryJournal(game);
  return game;
};

describe('StoryDirector.maybeAskCoda —— 残章只花一次 token', () => {
  let dir;
  beforeEach(() => { dir = new StoryDirector({}); });

  it('日志已有该章残章：零请求（重启后不重复烧 token）', async () => {
    const game = makeGame();
    dir.game = game;
    game.storyJournal.add({ id: 'chapter-coda-2', category: 'lore', title: 't', text: '已有残章' });
    dir.maybeAskCoda(2, 1);
    await flush();
    expect(game.onlineServices.askChapterCoda).not.toHaveBeenCalled();
  });

  it('日志没有：请求一次，成功后写入带 id 的日志条目', async () => {
    const game = makeGame();
    dir.game = game;
    dir.maybeAskCoda(2, 1);
    await flush();
    expect(game.onlineServices.askChapterCoda).toHaveBeenCalledTimes(1);
    expect(game.onlineServices.askChapterCoda.mock.calls[0][0]).toMatchObject({ chapter: 2, prev: 1 });
    expect(game.storyJournal.has('chapter-coda-2')).toBe(true);
  });

  it('同一章第二次调用：不重复请求（第一次已落盘）', async () => {
    const game = makeGame();
    dir.game = game;
    dir.maybeAskCoda(2, 1);
    await flush();
    dir.maybeAskCoda(2, 1);
    await flush();
    expect(game.onlineServices.askChapterCoda).toHaveBeenCalledTimes(1);
  });

  it('不同章各请求一次', async () => {
    const game = makeGame();
    dir.game = game;
    dir.maybeAskCoda(2, 1);
    await flush();
    dir.maybeAskCoda(3, 2);
    await flush();
    expect(game.onlineServices.askChapterCoda).toHaveBeenCalledTimes(2);
    expect(game.storyJournal.has('chapter-coda-3')).toBe(true);
  });

  it('在线关闭 / 上游失败：不抛、不写日志', async () => {
    const off = makeGame({ enabled: false });
    dir.game = off;
    expect(() => dir.maybeAskCoda(2, 1)).not.toThrow();
    await flush();
    expect(off.onlineServices.askChapterCoda).not.toHaveBeenCalled();

    const bad = makeGame();
    bad.onlineServices.askChapterCoda.mockRejectedValue(new Error('boom'));
    dir.game = bad;
    expect(() => dir.maybeAskCoda(4, 3)).not.toThrow();
    await flush();
    expect(bad.storyJournal.has('chapter-coda-4')).toBe(false);
  });
});
