/**
 * 分层环境音（W-C7 切片4）—— 每座位面几层可叠加的环境声。
 *
 * ## 这一片防的是什么
 *
 * 改前的环境声只有**一条线**：`_startZoneDrone` 起两个振荡器铺一条底噪，`_startMelody` 按音阶
 * 走一条旋律。于是"霍格沃兹遗境"与"破碎时线"听起来只是底噪的音高不同 —— 玩家听不出那是
 * **两个地方**。§1.2 C1 记的"音频全部 Web Audio 合成"这一条里，能**不靠外部素材**补上的
 * 就是分层：环境声本来就不该是一个人的独奏。
 *
 * ## 四条判据各有一种死法
 *
 * 1. **每座区至少一层** —— 一座没有环境声的区听起来像加载失败（表里写空数组 ⇒ 静默没声）。
 * 2. **层配方必须在名单里、音量必须在 (0, 0.2] 内** —— 0 等于"这一层不存在"（那就别登记）；
 *    超过上限是"忘了乘 `ambient` 总线"（叠起来会盖住旋律）。
 * 3. **换区时旧的淡出、新的起** —— 只起不淡 ⇒ 两座区的声叠在一起，音量越走越高；
 *    只淡不起 ⇒ 走进新区之后是静音。
 * 4. **`dispose()` 之后不再排程** —— "滴水 / 铃"是**自排下一拍**的，忘了清 tag ⇒
 *    音频系统已经拆了，回调还在往空对象上打。
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  ZONE_AMBIENCE, AMBIENCE_KINDS, AMBIENCE_MAX_GAIN, ambienceOf, assertZoneAmbience,
} from '../src/content/zoneAmbience.js';
import { ZONE_IDS, ZONE_ORDER } from '../src/content/ZoneIdentity.js';
import { AudioManager } from '../src/audio/AudioManager.js';
import { scheduler } from '../src/engine/Scheduler.js';
import { freshArm, disarmAudio, runAt, notesOn } from './helpers/fakeAudio.js';

afterEach(() => {
  disarmAudio();
});

describe('① 表的形状', () => {
  it('加载期自检不抛（形状不对当场炸，不等到切过去才没声）', () => {
    expect(() => assertZoneAmbience()).not.toThrow();
  });

  it('每一座真实区域都有至少一层环境声', () => {
    for (const id of [ZONE_IDS.HUB, ...ZONE_ORDER]) {
      expect(ZONE_AMBIENCE[id]?.length, `区 "${id}" 没有环境声层`).toBeGreaterThan(0);
    }
  });

  it('每层的配方在名单里、音量在 (0, 上限] 内', () => {
    for (const [区, 层表] of Object.entries(ZONE_AMBIENCE)) {
      for (const [i, 层] of 层表.entries()) {
        expect(AMBIENCE_KINDS, `${区}[${i}] 的配方 "${层.kind}" 不在名单里`).toContain(层.kind);
        expect(层.音量, `${区}[${i}] 的音量必须是正数（0 等于这一层不存在）`).toBeGreaterThan(0);
        expect(层.音量, `${区}[${i}] 的音量超过上限（忘了乘 ambient 总线？）`).toBeLessThanOrEqual(AMBIENCE_MAX_GAIN);
      }
    }
  });

  it('反面控制：空层表 / 认不出的配方 / 越界音量 / 缺参数 ⇒ 当场抛', () => {
    expect(() => assertZoneAmbience({ x: [] })).toThrow(/非空数组/);
    // 认不出的配方：第一层要**参数齐**（否则先撞上"缺参数"那条，测的就不是配方名校验了）
    expect(() => assertZoneAmbience({
      x: [{ kind: 'wind', 音量: 0.1, 中心频率: 300 }, { kind: 'nope', 音量: 0.1 }],
    })).toThrow(/不在名单/);
    expect(() => assertZoneAmbience({ x: [{ kind: 'wind', 音量: 0, 中心频率: 300 }] })).toThrow(/音量/);
    expect(() => assertZoneAmbience({ x: [{ kind: 'wind', 音量: 9, 中心频率: 300 }] })).toThrow(/音量/);
    // 缺参数：不会报错、只会静默用兜底值 —— 所以要当场点名
    expect(() => assertZoneAmbience({ x: [{ kind: 'wind', 音量: 0.1 }] })).toThrow(/缺参数/);
    expect(() => assertZoneAmbience({ x: [{ kind: 'drip', 音量: 0.1, 间隔: 3 }] })).toThrow(/缺参数/);
  });

  it('认不出的区落"野外"那一档（不抛 —— 区 id 是运行时来的）', () => {
    expect(ambienceOf('no-such-zone')).toBe(ZONE_AMBIENCE.wild);
    expect(ambienceOf(undefined)).toBe(ZONE_AMBIENCE.wild);
  });
});

describe('② 换区：旧的淡出、新的起', () => {
  it('起层数 = 那座区的层表长度', () => {
    const { audio } = freshArm();
    audio.setMode('zone', ZONE_IDS.FANTASY);
    expect(audio._环境层.size, '起的层数与表里那座区的层数对不上').toBe(ZONE_AMBIENCE[ZONE_IDS.FANTASY].length);
    audio.dispose();
  });

  it('换区后旧层不在表里、新的层在（不是两层叠着）', () => {
    const { audio } = freshArm();
    audio.setMode('zone', ZONE_IDS.FANTASY);
    const 旧的 = [...audio._环境层.keys()];
    audio.setMode('zone', ZONE_IDS.MAGIC);
    for (const k of 旧的) {
      expect(audio._环境层.has(k), `旧层 "${k}" 还在 —— 换区只起不淡`).toBe(false);
    }
    expect(audio._环境层.size).toBe(ZONE_AMBIENCE[ZONE_IDS.MAGIC].length);
    audio.dispose();
  });

  it('旧层真的被断开（淡出走完 → 增益节点与总线脱钩）', () => {
    const { audio, ctx } = freshArm();
    audio.setMode('zone', ZONE_IDS.FANTASY);
    // 抓住旧层的增益节点（它接在 `ambient` 总线上）
    const 旧增益 = [...audio._环境层.values()].map((h) => h.gain);
    expect(旧增益.length).toBeGreaterThan(0);
    audio.setMode('zone', ZONE_IDS.MAGIC);
    // 淡出是一条 0.8 秒的 ramp，断开在 0.9 秒后 —— 推过那一秒才真的脱钩
    runAt(ctx, 1.2);
    for (const g of 旧增益) {
      expect(g._target, '旧层淡出后还连在 ambient 总线上 —— 两座区的声叠着').toBe(null);
    }
    audio.dispose();
  });

  it('环境声真的接在 `ambient` 总线上（不是 sfx / bgm）', () => {
    const { audio, ctx } = freshArm();
    audio.setMode('zone', ZONE_IDS.FANTASY);
    // 风声与低鸣都是常驻声源 —— 它们 start() 的那一下就记进了笔记
    const 环境音 = notesOn(ctx, 'ambient');
    expect(环境音.length, '没有任何声音进 ambient 总线').toBeGreaterThan(0);
    expect(notesOn(ctx, 'sfx').length, '环境声跑错总线了').toBe(0);
    audio.dispose();
  });
});

describe('③ 撤销：dispose() 之后不再排程', () => {
  it('`dispose()` 清掉环境层的排程（"滴水"自排下一拍，忘了清就永远排下去）', () => {
    const { audio, ctx } = freshArm();
    // abyss 有 `drip` 层 —— 它是自排下一拍的那种
    audio.setMode('zone', ZONE_IDS.ABYSS);
    runAt(ctx, 1.0);
    const 之前 = scheduler.pending;
    expect(之前, 'drip 层没有排下下一拍 —— 这一层根本不是自排的那种').toBeGreaterThan(0);

    audio.dispose();
    const 之后 = scheduler.pending;
    runAt(ctx, 6.0);
    expect(scheduler.pending, `dispose 之后还在排（${之后} → ${scheduler.pending}）`).toBe(之后);
  });

  it('换区也清掉旧层的排程（不然旧区的"滴水"会一直滴）', () => {
    const { audio, ctx } = freshArm();
    audio.setMode('zone', ZONE_IDS.ABYSS);      // abyss 有 `drip` 层（噪声脉冲，每隔几秒一声）
    audio.setMode('zone', ZONE_IDS.FANTASY);    // fantasy 只有 `wind`（一条常驻噪声）+ `chime`
    // 只看**换区之后**的音。换区前 abyss 的滴水已经响过一声（那是它该响的），
    // 换区时 fantasy 的风也起了一次（常驻声源，只在起的那一刻记一笔）。
    // 所以清完之后**不该再有新的噪声脉冲** —— 若旧区的"滴水"还在排程，
    // 6 秒里它会再滴 1~2 下（abyss 的滴水间隔 3.2 秒）。
    // 数 `scheduler.pending` 不精确 —— 那里头还有旋律链等与本片无关的排程。
    ctx.notes.length = 0;
    runAt(ctx, 6.0);
    const 噪声 = notesOn(ctx, 'ambient').filter((n) => n.kind === 'noise');
    expect(噪声.length, `旧区的"滴水"还在滴（换区后又响了 ${噪声.length} 下噪声脉冲）`).toBe(0);
    audio.dispose();
  });
});

describe('④ 反面控制：认不出的层配方当场抛', () => {
  it('`_起一层` 拿一个不在名单里的 kind ⇒ 抛（不是静默不响）', () => {
    const { audio } = freshArm();
    expect(() => audio._起一层({ kind: 'nope', 音量: 0.05 }, 0)).toThrow(/不在名单/);
    audio.dispose();
  });

  it('音频没解锁时起层返回 null（不抛 —— 那时候还没有 ctx）', () => {
    // `new AudioManager()` 自己要 `document`（挂解锁监听）—— 先把假环境装上
    globalThis.document = { addEventListener() {}, removeEventListener() {} };
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    const audio = new AudioManager();
    expect(audio._起一层({ kind: 'wind', 音量: 0.05 }, 0)).toBe(null);
    audio.dispose();
  });
});
