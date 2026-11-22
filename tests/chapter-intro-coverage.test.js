/**
 * 章节开场覆盖门禁 —— 防「新玩家落地不知道去哪」。
 *
 * 病灶（实测，改前）：`CHAPTER_INTROS` 只有 2–5。`chapter-changed` 只在章节**变化**时
 * 由 QuestSystem 派发，而开局即第 1 章（没有"从 0 到 1"的变化）——于是第 1 章永远收不到
 * 事件，新玩家落地既没有章节开场、也没有「先做什么」的指引，只有操作教学。
 *
 * 修法两层：① 补 `CHAPTER_INTROS[1]`；② `Game` 启动后补派一次
 * `chapter-changed { chapter, prev:0, initial:true }`。
 * `initial` 让 StoryDirector 跳过残章请求（开局不是跨章，不该烧一次上游调用）。
 *
 * 钉住：覆盖 1..5、键双语非空、initial 弹介绍且不请求残章、非 initial 仍走残章。
 */
import { describe, it, expect, vi } from 'vitest';
import { CHAPTER_INTROS } from '../src/game/LoreFragments.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

const CHAPTERS = [1, 2, 3, 4, 5];

describe('CHAPTER_INTROS 覆盖全部章节', () => {
  it('第 1–5 章都有开场（第 1 章此前缺失）', () => {
    const missing = CHAPTERS.filter((c) => !CHAPTER_INTROS[c]);
    expect(missing, `缺章节开场：${missing.join(', ')}`).toEqual([]);
  });

  it('每个开场的 title/text 都是双表里真实存在的非空文案键', () => {
    for (const c of CHAPTERS) {
      const intro = CHAPTER_INTROS[c];
      for (const field of ['title', 'text']) {
        const key = intro[field];
        expect(typeof key, `ch${c}.${field} 必须是文案键`).toBe('string');
        expect(String(STRINGS_ZH[key] ?? '').trim(), `ch${c}.${field} 中文键缺失`).not.toBe('');
        expect(String(STRINGS_EN[key] ?? '').trim(), `ch${c}.${field} 英文键缺失`).not.toBe('');
      }
    }
  });
});

describe('行为：开局补派 initial 只弹介绍、不请求残章', () => {
  const makeGame = () => ({
    dialog: { toast: vi.fn(), show: vi.fn() },
    storyJournal: { addSilent: vi.fn(), has: () => false },
    quests: { chapter: 1 },
    onlineServices: { enabled: () => true, askChapterCoda: vi.fn().mockResolvedValue({ ok: true, data: { line: '残章' } }) },
  });

  it('initial:true → 弹第 1 章开场，且 askChapterCoda 零调用', async () => {
    const { StoryDirector } = await import('../src/game/StoryDirector.js');
    const { scheduler } = await import('../src/engine/Scheduler.js');
    const { emit } = await import('../src/engine/EventBus.js');
    const game = makeGame();
    const dir = new StoryDirector(game);
    emit('chapter-changed', { chapter: 1, prev: 0, initial: true });
    scheduler.update(2); // 推进过 after(1.2)
    expect(game.dialog.show).toHaveBeenCalledTimes(1);
    expect(game.onlineServices.askChapterCoda).not.toHaveBeenCalled();
    dir.dispose();
  });

  it('非 initial（真跨章）→ 仍请求残章（回归，不误伤）', async () => {
    const { StoryDirector } = await import('../src/game/StoryDirector.js');
    const { emit } = await import('../src/engine/EventBus.js');
    const game = makeGame();
    game.quests.chapter = 3;
    const dir = new StoryDirector(game);
    emit('chapter-changed', { chapter: 3, prev: 2 });
    await Promise.resolve();
    expect(game.onlineServices.askChapterCoda).toHaveBeenCalledTimes(1);
    expect(game.onlineServices.askChapterCoda.mock.calls[0][0]).toMatchObject({ chapter: 3, prev: 2 });
    dir.dispose();
  });
});
