/**
 * 音频的节拍挂在主循环的钟上（W-C7 切片1，修 B38 的音频半区）。
 *
 * 症状：`AudioManager` 的两条 BGM 节拍是 `setInterval`，三处装饰音是 `setTimeout`。
 * 它们量的是墙钟，于是：
 * 1. 后台标签页里浏览器把定时器节流到约 1Hz —— 音乐自己变成断续；
 * 2. 主循环停摆（`update()` 不再被调用）时节拍照跑，"世界停了声音还在数拍子"；
 * 3. 撤销靠记住 `clearInterval` 的那一个句柄，换区域 / 结束战斗各要记一处；
 * 4. 单测里根本没有能推进它的钟 —— 所以这几条节拍从来没被验证过。
 *
 * `tests/timing-boundary.test.js` 曾经给 `src/audio/**` 开过一条豁免，理由是
 * "暂停时由 AudioManager 自行挂起"。那句话是可验证为假的（本文件最后一例把它钉住）：
 * AudioManager 里没有任何 suspend/pause 路径。豁免已删，这里补正面证据。
 *
 * 边界说清楚：本文件测的是**节拍有没有跟着秒数走**，不是"暂停时该不该有音乐"。
 * 调度器用 rawDt 推进、且在 `canPlay` 那道门控之前，所以游戏内暂停菜单里 BGM 照常放 ——
 * 那是有意的（它和 UI 延时量的是同一个"玩家真实看着的秒数"）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scheduler } from '../src/engine/Scheduler.js';
import { MODE_TEMPO } from '../src/audio/AudioManager.js';
import {
  FRAME, armAudio, runAt, run, framesToFirst, notesOn, countOn, freshArm, disarmAudio,
} from './helpers/fakeAudio.js';

const SRC = join(process.cwd(), 'src');

/**
 * 链条的节拍：照 `Scheduler` 自己的算法把 remain 一帧一帧减到非正，得到第一拍的帧数，
 * 之后每那么多帧一响（Scheduler 把一拍的余量丢掉，不补回来）。
 * 期望值这样推导，不从 `MODE_TEMPO` 手抄数字 —— 抄回来的数测不出"代码里也抄了一份过期的"。
 * 注意别用 `ceil(间隔/帧长)` 代替：0.4 秒在 60Hz 下是整 24 帧，减法留下的浮点残渣会让它落在第 25 帧。
 */
function firstBeatFrame(periodSeconds, step) {
  let remain = periodSeconds;
  let frame = 0;
  while (frame < 100000) {
    remain -= step;
    frame += 1;
    if (remain <= 0) return frame;
  }
  throw new Error('firstBeatFrame() 未收敛');
}

const beatsIn = (periodSeconds, frames, step = FRAME) => Math.floor(frames / firstBeatFrame(periodSeconds, step));

let audio = null;
let ctx = null;

beforeEach(() => {
  audio = null;
  ctx = null;
  scheduler.clearAll();
  const armed = armAudio();
  audio = armed.audio;
  ctx = armed.ctx;
});

afterEach(() => {
  disarmAudio();
});

describe('BGM 节拍跟着主循环的秒数走（B38 音频半区）', () => {
  it('解锁之后旋律是一条待办，不是一条墙钟定时器', () => {
    // 正面门槛：豁免拆掉之后，"src 里没有 setTimeout"不能靠"把音频计时整个删掉"来满足
    expect(scheduler.pending).toBe(1);
    expect(countOn(ctx, 'bgm')).toBe(0); // 一拍都还没到
  });

  it('区域旋律的间隔来自 MODE_TEMPO：两秒里响的拍数按秒算', () => {
    const frames = run(ctx, 2);
    expect(countOn(ctx, 'bgm')).toBe(beatsIn(MODE_TEMPO.zone / 1000, frames));
  });

  it('帧率无关：30 / 60 / 144Hz 在两秒里听到同样多的拍', () => {
    // 写成"每 N 帧响一次"的实现会在其中一档红：这里要三档都落在同一个数上
    const heard = new Set();
    for (const step of [1 / 30, 1 / 60, 1 / 144]) {
      const fresh = freshArm();
      const frames = runAt(fresh.ctx, 2, step);
      expect(countOn(fresh.ctx, 'bgm')).toBe(beatsIn(MODE_TEMPO.zone / 1000, frames, step));
      heard.add(countOn(fresh.ctx, 'bgm'));
    }
    expect([...heard]).toEqual([beatsIn(MODE_TEMPO.zone / 1000, Math.round(2 * 60))]);
  });

  it('换区域只重排那一条链，不会攒出第二条', () => {
    audio.setMode('zone', 'magic');
    audio.setMode('dungeon', 'dungeon');
    expect(scheduler.pending).toBe(1); // 旋律链换人了，但仍然只有一条
    const frames = run(ctx, 2);
    expect(countOn(ctx, 'bgm')).toBe(beatsIn(MODE_TEMPO.dungeon / 1000, frames));
    expect(countOn(ctx, 'bgm')).toBeLessThan(beatsIn(MODE_TEMPO.zone / 1000, frames)); // 680ms 比 520ms 稀
  });

  it('boss 战武装战斗层，结束时按 tag 撤销干净', () => {
    const baseline = scheduler.pending;
    audio.startBossFight('shadow-warden');
    expect(scheduler.pending).toBe(baseline + 1); // 多出来的那条是战斗层
    const frames = run(ctx, 1.5);
    expect(countOn(ctx, 'combat')).toBeGreaterThan(0);
    expect(countOn(ctx, 'bgm')).toBe(beatsIn(MODE_TEMPO['boss-shadow'] / 1000, frames));
    audio.endBossFight();
    expect(scheduler.pending).toBe(baseline); // 战斗链不留待办
    ctx.notes.length = 0;
    run(ctx, 1.5);
    expect(countOn(ctx, 'combat')).toBe(0); // 也不留后续音符
  });

  it('战斗层的间隔是秒：三种帧率下第一记的到达时刻一致', () => {
    const times = [];
    for (const step of [1 / 30, 1 / 60, 1 / 144]) {
      const fresh = freshArm();
      fresh.audio.startBossFight('shadow-warden');
      const first = framesToFirst(fresh.ctx, 'combat', step);
      // 第一记没在 300 帧内出现就是 NaN：直接在这里红，别让它漂到下面的比较里
      expect(Number.isFinite(first)).toBe(true);
      times.push(first * step);
    }
    const [slow, mid, fast] = times;
    // 容差就是较粗那一档的一帧：量化误差最多这么大，间隔若按帧数写会差出好几倍
    expect(Math.abs(mid - slow)).toBeLessThan(1 / 30);
    expect(Math.abs(fast - mid)).toBeLessThan(1 / 60);
  });

  it('阶段越高战斗层越密，且是重排链条而不是加一条', () => {
    const probe = (phase) => {
      const fresh = freshArm();
      fresh.audio.startBossFight('chaos-overlord');
      if (phase > 1) fresh.audio.setBossPhase(phase);
      const first = framesToFirst(fresh.ctx, 'combat');
      return { first, pending: scheduler.pending };
    };
    const p1 = probe(1);
    const p3 = probe(3);
    expect(p1.pending).toBe(2);
    expect(p3.pending).toBe(2); // 旋律 + 战斗，换阶段没把战斗层翻倍
    expect(p3.first).toBeLessThan(p1.first); // 更密的间隔必须更早出声
  });

  it('主循环不再推进时一个音也不会多出来（setInterval 版本做不到这条）', () => {
    audio.startBossFight('archmagus');
    run(ctx, 1);
    expect(countOn(ctx, 'bgm')).toBeGreaterThan(0);
    ctx.notes.length = 0;
    // 这里一秒都不推进：链版本什么都不会发生，墙钟定时器版本会继续往 notes 里塞音
    expect(countOn(ctx, 'bgm')).toBe(0);
    expect(scheduler.pending).toBe(2);
  });
});

describe('一次性音效的偏移改成秒', () => {
  it('升级三音按 0.1 秒递进，第一音在下一帧就到', () => {
    audio.levelUp();
    const steps = [];
    run(ctx, 0.05);
    steps.push(countOn(ctx, 'sfx'));
    run(ctx, 0.1);
    steps.push(countOn(ctx, 'sfx'));
    run(ctx, 0.1);
    steps.push(countOn(ctx, 'sfx'));
    expect(steps).toEqual([1, 2, 3]);
  });

  it('吸收魂：先响 pickup 的两声，再按 0.06 秒递进三音', () => {
    // 三音落在第 1 / 4 / 8 帧，所以每段跑 3 帧（累计 3 / 6 / 9）都躲开帧边界上的歧义
    audio.wispAbsorb();
    run(ctx, 0.05);
    expect(notesOn(ctx, 'sfx').map((n) => n.freq)).toEqual([660, 990, 880]);
    run(ctx, 0.05);
    expect(notesOn(ctx, 'sfx').map((n) => n.freq)).toEqual([660, 990, 880, 1100]);
    run(ctx, 0.05);
    expect(notesOn(ctx, 'sfx').map((n) => n.freq)).toEqual([660, 990, 880, 1100, 1320]);
  });

  it('界域渗透：过 0.12 秒才把该区底噪接上，之前不动', () => {
    run(ctx, 0.55); // 先让 hub 的第一音响出来
    const hub = notesOn(ctx, 'bgm').map((n) => n.freq);
    expect(hub).toHaveLength(1);
    ctx.notes.length = 0;

    audio.playRealmBleed('void');
    expect(countOn(ctx, 'bleed')).toBe(1); // 扫频当场起音，不等钟

    run(ctx, 0.1); // 离 0.12 秒还差一点：回位那条还排在待办里
    expect(scheduler.pending).toBe(2); // 旋律链 + 还没到点的回位
    ctx.notes.length = 0;

    run(ctx, 0.65); // 过了点，也过了新链的第一拍
    expect(scheduler.pending).toBe(1); // 回位已经发生：旋律换了一条，不是加了一条
    const after = notesOn(ctx, 'bgm');
    expect(after).toHaveLength(1);
    expect(after[0].freq).toBeLessThan(hub[0]); // void 的根音比 hub 低： audible 地说明"真的换了区"
  });

  it('boss 战期间渗透音不许把 BGM 拽回区域层', () => {
    audio.startBossFight('archmagus');
    const before = notesOn(ctx, 'bgm');
    audio.playRealmBleed('void');
    run(ctx, 0.5); // 0.12 秒那道恢复分支必须被 bossFightActive 拦住
    expect(audio.bossFightActive).toBe(true);
    expect(audio.audioMode).toBe('boss');
    expect(scheduler.pending).toBe(2); // 没有为"回到区域"重排第三条
    expect(notesOn(ctx, 'bgm').length - before.length).toBe(1); // 响的仍是 boss 层那一拍
  });

  it('boss 战里即使渗透的是 boss 音阶也不改层（两道门限的分工各钉一条）', () => {
    // `setMode` 自己放行"zoneKey 以 boss 开头"的情形，所以这一格只能由回位回调上的
    // bossFightActive 拦下来。少了这一例，"回调那道判断"和"setMode 那道判断"就没人分得开。
    // 跑到 0.4 秒（24 帧）：旋律与战斗各已落过一拍并续过排，所以 pending 说的是"两条活链"。
    // 停在 0.3 秒不行：那一帧正踩在 300ms 那拍的浮点边界上（0.3 减 18 个 1/60 还剩一点残渣），
    // 于是"链断了"和"链还没响"在这一格里长得一模一样。
    audio.startBossFight('chaos-overlord');
    audio.playRealmBleed('boss-shadow');
    run(ctx, 0.4);
    expect(audio.audioMode).toBe('boss');
    expect(scheduler.pending).toBe(2);
  });

  it('副本 BGM 期间渗透音不重排区域层（回位只认 zone 态）', () => {
    audio.setMode('dungeon', 'dungeon');
    audio.playRealmBleed('void');
    run(ctx, 0.3); // 过了 0.12 秒那个点
    expect(audio.audioMode).toBe('dungeon');
    expect(scheduler.pending).toBe(1); // 还是 dungeon 那一条链，没被换成 zone 的
  });

  it('换区域只清旋律那一层，不该顺手撤销已经在飞的渗透回位', () => {
    // 底噪的第一条振荡器就是该区的根音：它现在是哪一区的，看这条频率就知道，不用抄表
    const droneBase = () => audio._droneOsc[0].frequency.value;
    audio.playRealmBleed('void');
    audio.setMode('zone', 'magic');
    run(ctx, 0.05); // 第 3 帧：0.12 秒的回位还没到点
    audio.setMode('zone', 'abyss');
    const before = droneBase();
    run(ctx, 0.06); // 第 7 帧
    expect(scheduler.pending).toBe(2); // 旋律链 + 那条还在等的回位
    run(ctx, 0.05); // 第 10 帧：过了点
    expect(scheduler.pending).toBe(1);
    expect(droneBase()).toBeLessThan(before); // 底噪已经换成 void 那一套，不是停在 abyss
  });
});

describe('豁免拆除的结构性证据', () => {
  /** 剥掉注释与字符串，只看代码 —— 与 `tests/timing-boundary.test.js` 同一口径 */
  const stripNonCode = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');

  it('音频问的是共享调度器，不是自己再立一个钟', () => {
    // 引用说明符本身是字符串，剥离非代码的那一步会把它抹成 ''，所以这一条读原文；
    // 反面断言（不许自己 new 一个 Scheduler、不许写 suspend/pause）读剥离后的代码，
    // 免得哪天只在注释里提一句就把这条判据满足掉。
    const raw = readFileSync(join(SRC, 'audio/AudioManager.js'), 'utf8');
    expect(raw).toMatch(/import \{ scheduler \} from '\.\.\/engine\/Scheduler\.js'/);
    const code = stripNonCode(raw);
    expect(code).toMatch(/scheduler\.after\(/);
    expect(code).not.toMatch(/new Scheduler\s*\(/);
    // 当年那条豁免的理由（"暂停时由 AudioManager 自行挂起"）至今仍是假的：
    // 不许有人把它当真写回来，也不许有人以为拆了豁免就等于补了挂起
    expect(code).not.toMatch(/\.suspend\s*\(/);
    expect(code).not.toMatch(/\.pause\s*\(/);
  });
});
