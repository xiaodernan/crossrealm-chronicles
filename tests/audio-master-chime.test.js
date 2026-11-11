/**
 * 大成就金铃（W-V9）——SFX_NAMES 远程请求面的 masterChime 一格。
 *
 * 验四条：
 *   1. masterChime 在 SFX_NAMES 里（远程名册收编 master 铃，不越界派发）；
 *   2. AudioManager.masterChime 存在且能把声音发到 sfx 总线（上行五音 + 低钟）；
 *   3. playSfx('masterChime') 不抛（咽喉名单侧自证）；
 *   4. 远程名册不含普通成就/兔子相关条目之外的名字 — 名册冻结且无重复（由 contract 另行钉死；这里只做冒烟）。
 */
import { describe, it, expect } from 'vitest';
import { freshArm, notesOn, run } from './helpers/fakeAudio.js';
import { SFX_NAMES } from '../src/audio/AudioManager.js';

describe('W-V9 masterChime · 远程名册 + 声音落地', () => {
  it('SFX_NAMES 含 masterChime，且 AudioManager.prototype.masterChime 是函数', async () => {
    const { AudioManager } = await import('../src/audio/AudioManager.js');
    expect(SFX_NAMES).toContain('masterChime');
    expect(typeof AudioManager.prototype.masterChime).toBe('function');
  });

  it('masterChime 把 6 条音符发到 sfx 总线（上行五音 + 低钟）', () => {
    const { audio, ctx } = freshArm();
    audio.masterChime();
    run(ctx, 1.5);
    const notes = notesOn(ctx, 'sfx');
    expect(notes.length, `masterChime 应产生 ≥6 条音符，实际 ${notes.length} 条`).toBeGreaterThanOrEqual(6);
  });

  it("playSfx('masterChime') 不抛（咽喉名单侧自证）", () => {
    const { audio } = freshArm();
    expect(() => audio.playSfx('masterChime')).not.toThrow();
  });
});
