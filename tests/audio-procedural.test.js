/**
 * 程序化音效测试（W-C7）：验证 AudioManager 里除 SFX_NAMES 远程名单之外的
 * 直接调用方法，都能把声音发到 sfx 总线上。这些方法不走 `sfx:play(id)` 远程
 * 接口，而是由游戏逻辑直接调用（如 `playerShoved`、`gearDrop` 等）。
 *
 * 这些方法不需要外部音频素材，全部由 Web Audio API 程序合成（振荡器、噪声、
 * 包络），是 W-C7 程序化替代方案的一部分：素材到位前先有声音，到位后
 * 只需把 `playTone` / `_playNoise` 调用点指向真素材。
 */
import { describe, it, expect } from 'vitest';
import { freshArm, notesOn, run } from './helpers/fakeAudio.js';

describe('W-C7 程序化音效：直接调用方法都能把声音发到 sfx 总线', () => {
  it('footstep(surface)：每种表面都有不同音色，都在 sfx 总线上', () => {
    for (const surface of ['stone', 'wood', 'grass', 'metal']) {
      const { audio, ctx } = freshArm();
      audio.footstep(surface);
      run(ctx, 0.2);
      const notes = notesOn(ctx, 'sfx');
      expect(notes.length, `footstep('${surface}') 应该产生至少 1 条音符`).toBeGreaterThan(0);
      // 脚步声应该有噪声 + 正弦音，至少 2 条音符
      expect(notes.length).toBeGreaterThanOrEqual(2);
      // 第一个音符应该是噪声 (kind === 'noise')
      expect(notes[0].kind, `${surface} 脚步声的第一条应该是噪声`).toBe('noise');
    }
  });

  it('spell_magic()：三和弦上行，三条正弦音都在 sfx 总线上', () => {
    const { audio, ctx } = freshArm();
    audio.spell_magic();
    run(ctx, 0.5);
    const notes = notesOn(ctx, 'sfx');
    expect(notes.length, `spell_magic 应该产生 3 条音符，实际 ${notes.length} 条`).toBe(3);
    // 三条音的频率应该是 440, 554, 659（A4, C#5, E5）
    const freqs = notes.map((n) => n.freq).sort((a, b) => a - b);
    expect(freqs[0]).toBeCloseTo(440, 0);
    expect(freqs[1]).toBeCloseTo(554, 0);
    expect(freqs[2]).toBeCloseTo(659, 0);
  });

  it('item_drop()：短促叮声，正弦 + 噪声', () => {
    const { audio, ctx } = freshArm();
    audio.item_drop();
    run(ctx, 0.2);
    const notes = notesOn(ctx, 'sfx');
    expect(notes.length, `item_drop 应该产生至少 2 条音符，实际 ${notes.length} 条`).toBeGreaterThanOrEqual(2);
    // 第一条应该是正弦 (880Hz)
    expect(notes[0].kind).toBe('osc');
    expect(notes[0].freq).toBeCloseTo(880, 0);
    // 最后一条应该是噪声
    const last = notes[notes.length - 1];
    expect(last.kind).toBe('noise');
  });

  it('chest_open()：三和弦上行，时错排开，三条音都在 sfx 总线上', () => {
    const { audio, ctx } = freshArm();
    audio.chest_open();
    run(ctx, 1.0);
    const notes = notesOn(ctx, 'sfx');
    expect(notes.length, `chest_open 应该产生 3 条音符，实际 ${notes.length} 条`).toBe(3);
    // 三条音时刻应该错开（0, ~0.08, ~0.16）
    const times = notes.map((n) => n.at).sort((a, b) => a - b);
    expect(times[1] - times[0]).toBeGreaterThan(0.05);
    expect(times[2] - times[1]).toBeGreaterThan(0.05);
  });

  it('lever_pull()：低沉机械声，方波 + 噪声', () => {
    const { audio, ctx } = freshArm();
    audio.lever_pull();
    run(ctx, 0.2);
    const notes = notesOn(ctx, 'sfx');
    expect(notes.length, `lever_pull 应该产生至少 2 条音符`).toBeGreaterThanOrEqual(2);
    // 应该有方波 (kind === 'osc') 和噪声 (kind === 'noise')
    const kinds = new Set(notes.map((n) => n.kind));
    expect(kinds.has('osc'), `lever_pull 应该有方波音符`).toBe(true);
    expect(kinds.has('noise'), `lever_pull 应该有噪声音符`).toBe(true);
  });

  it('gate_open()：三和弦上行，方波，时错排开', () => {
    const { audio, ctx } = freshArm();
    audio.gate_open();
    run(ctx, 1.2);
    const notes = notesOn(ctx, 'sfx');
    expect(notes.length, `gate_open 应该产生 3 条音符，实际 ${notes.length} 条`).toBe(3);
    // 应该都是方波
    for (const note of notes) {
      expect(note.kind).toBe('osc');
    }
    // 时刻错开
    const times = notes.map((n) => n.at).sort((a, b) => a - b);
    expect(times[1] - times[0]).toBeGreaterThan(0.1);
    expect(times[2] - times[1]).toBeGreaterThan(0.1);
  });

  it('trap_trigger()：尖锐噪声脉冲 + 低音锯齿波', () => {
    const { audio, ctx } = freshArm();
    audio.trap_trigger();
    run(ctx, 0.3);
    const notes = notesOn(ctx, 'sfx');
    expect(notes.length, `trap_trigger 应该产生至少 2 条音符`).toBeGreaterThanOrEqual(2);
    // 应该有噪声和锯齿波
    const kinds = new Set(notes.map((n) => n.kind));
    expect(kinds.has('noise'), `trap_trigger 应该有噪声音符`).toBe(true);
    expect(kinds.has('osc'), `trap_trigger 应该有方波/锯齿波音符`).toBe(true);
  });
});
