/** Web Audio — 区域 BGM + Boss 专属层 + 战斗节奏层 + 音效 */
import { scheduler } from '../engine/Scheduler.js';
import { isDungeonBossId } from '../content/bossRoster.js';
import { cueOf } from '../content/captions.js';
import { ambienceOf, AMBIENCE_KINDS } from '../content/zoneAmbience.js';
import { VOLUME_DEFAULTS, normalizeVolume } from './AudioVolumes.js';

import { on, offAll } from '../engine/EventBus.js';

const AUDIO_AUDIOMANAGER = 'audio/AudioManager';
const audioOn = (name, handler) => on(name, handler, AUDIO_AUDIOMANAGER);
/**
 * 节拍链的分组标签（撤销口径按层分，一条链只被自己那一层清）。
 * `audio/oneshot` 装的是"一次性的几声"：琶音、界域渗透后的模式回位，它们不该互相撤销。
 */
const TAG_MELODY = 'audio/melody';
const TAG_COMBAT = 'audio/combat';
const TAG_ONESHOT = 'audio/oneshot';
/** 环境层的前缀：每一层**自己的** tag（`audio/amb-<序号>`），撤销时一层一层清 */
const TAG_AMBIENCE = 'audio/amb';

const ZONE_DRONES = {
  hub: { base: 55, harm: 82, type: 'sine', scale: [0, 2, 4, 7, 9] },
  fantasy: { base: 48, harm: 72, type: 'triangle', scale: [0, 3, 5, 7, 10] },
  magic: { base: 62, harm: 93, type: 'sine', scale: [0, 2, 5, 8, 11] },
  space: { base: 42, harm: 63, type: 'sawtooth', scale: [0, 4, 7, 11, 14] },
  void: { base: 38, harm: 57, type: 'triangle', scale: [0, 1, 6, 8, 10] },
  abyss: { base: 52, harm: 78, type: 'square', scale: [0, 3, 6, 9, 12] },
  dungeon: { base: 45, harm: 68, type: 'triangle', scale: [0, 2, 5, 7, 10] },
  boss: { base: 40, harm: 60, type: 'sawtooth', scale: [0, 3, 6, 9, 12, 15] },
  wild: { base: 50, harm: 75, type: 'sine', scale: [0, 2, 4, 7, 9] },
  'boss-shadow': { base: 46, harm: 69, type: 'sawtooth', scale: [0, 3, 5, 8, 10] },
  'boss-archmagus': { base: 58, harm: 87, type: 'sine', scale: [0, 2, 5, 8, 11, 14] },
  'boss-singularity': { base: 38, harm: 57, type: 'square', scale: [0, 4, 7, 11, 14] },
  'boss-void': { base: 42, harm: 63, type: 'triangle', scale: [0, 1, 5, 8, 10, 12] },
  'boss-chaos': { base: 36, harm: 54, type: 'sawtooth', scale: [0, 3, 6, 9, 12, 15, 18] },
  'boss-dungeon': { base: 44, harm: 66, type: 'triangle', scale: [0, 2, 4, 7, 9, 11] },
};

const BOSS_BGM_MAP = {
  'shadow-warden': 'boss-shadow',
  archmagus: 'boss-archmagus',
  'singularity-herald': 'boss-singularity',
  'void-chronarch': 'boss-void',
  'chaos-overlord': 'boss-chaos',
  default: 'boss',
};

/** 每层 BGM 的旋律间隔（毫秒）：读它的是 `_startMelody`，单位换算在那里做一次。 */
export const MODE_TEMPO = { zone: 520, dungeon: 680, boss: 380, 'boss-shadow': 360, 'boss-archmagus': 400, 'boss-singularity': 320, 'boss-void': 350, 'boss-chaos': 300, 'boss-dungeon': 420 };

/**
 * BGM 子总线的**混音比**名册（W-C7 切片5）：mode 换档时玩家音乐档之外的内部比例。
 * 出数 = 切片5 前各处写的绝对字面量 ÷ 当时基础档 0.14（zone:1、dungeon:0.16/0.14、boss:0.22/0.14），
 * 写成分式是为了让出处可见 —— 0.16/0.22 是旧字面量，不是拍脑袋的新数。浮点上与旧值可能差
 * 一个 ulp：默认档零听觉变更，测试用 `toBeCloseTo` 对账。玩家档 × 比例在 `_applyBgmGain` 相乘。
 */
const BGM_TRIM = Object.freeze({ zone: 1, dungeon: 0.16 / 0.14, boss: 0.22 / 0.14 });

/**
 * 允许"用名字远程请求"的音效 —— `game-audio-sfx` 事件里 `sfx` 那一格唯一的合法取值。
 *
 * 这张表加的是"哪些音可以被远程点"这一格信息，不是方法名单的拷贝。名单与实现的关系
 * 由 `tests/audio-sfx-contract.test.js` 双向钉住：这里每一格必须真是本类的方法、
 * `src/` 里每一处 `sfx: '<字面量>'` 必须在这里、这里每一格必须至少有一个调用方。
 * 也就是说：加一格要么带一个真派发点，要么红。
 */
export const SFX_NAMES = Object.freeze(['doorOpen', 'roomClear', 'levelUp', 'bossPhase', 'loreDiscover']);

export class AudioManager {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第七处） */
  dispose() {
    offAll(AUDIO_AUDIOMANAGER);
    // 环境层（W-C7 切片4）：每一层有自己的排程 tag，逐层清干净 ——
    // 留着的话"滴答"会一直排下去，而 `AudioManager` 已经不在了（回调打空对象）。
    // 淡出的收尾（断开）走**另一个** tag（`层tag-fade`），它也要清 ——
    // 否则音频系统拆了之后还有一条"断开节点"的回调排着。
    for (const [, 句柄] of this._环境层) {
      scheduler.clear(句柄.tag);
      scheduler.clear(句柄.淡出tag);
    }
    this._环境层.clear();
  }

  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.ambient = null;
    this.bgm = null;
    this.combatLayer = null;
    this.currentZone = 'hub';
    this.audioMode = 'zone';
    this.bossFightActive = false;
    this._bossProfile = 'boss';
    this._bossPhase = 1;
    this._savedMode = null;
    this.enabled = true;
    /**
     * 玩家音量的**当前档**（B103）：它是"想要的音量"，与"节点存不存在"无关。
     * 节点在第一次手势解锁时才存在，所以这一份必须先活过解锁 —— 出厂值从
     * `audio/AudioVolumes.js` 取，不在这里写字面量。
     */
    this.volumes = { ...VOLUME_DEFAULTS };
    /**
     * BGM 的当前混音比（W-C7 切片5）：mode / boss 阶段要的**相对响度**，与玩家音量分开记。
     * 真正写进节点的增益只有 `_applyBgmGain()` 一个出口 = `volumes.music × _bgmTrim`。
     */
    this._bgmTrim = BGM_TRIM.zone;
    this._droneOsc = [];
    this._droneGain = null;
    this._melodyStep = 0;
    this._combatStep = 0;
    this._noiseBuffer = null;
    /**
     * 当前在响的环境层（W-C7 切片4）：键 = `amb-<序号>-<配方>`，值 = `{ 键, tag, 淡出, gain }`。
     * 换区时旧的几层淡出、新的几层淡入；`dispose()` 一次结清。
     */
    this._环境层 = new Map();
    // 字幕线索（W-D6 切片8）：听 game-cue，按名册的 sound 那一格播声音。
    // 挂在构造器而不是 _initOnGesture() 的解锁回调里（realm-bleed 挂在那）：
    // 线索是「游戏世界发生了一件事」，它与喇叭解没解锁无关 —— 解锁前到的线索照样要记下，
    // 而解锁前 playTone 自己会安静返回（this.ctx 还是 null），两边都不会炸。
    audioOn('game-cue', (e) => this._playCue(e.detail));
    this._initOnGesture();
  }

  /**
   * 自排下一拍的节拍链：每一拍到期时奏音并排下一拍。
   *
   * 为什么不用 `setInterval`（B38，也是 `tests/timing-boundary.test.js` 拆掉 audio 豁免的理由）：
   * 定时器挂的是墙钟，主循环停摆时它照跑 —— 后台标签页里浏览器把定时器节流到约 1 次/秒，
   * 于是 BGM 变成断续的"咚……咚……"；换区域 / 结束战斗要靠记着 `clearInterval` 那一个句柄，
   * 而单测里根本没有能推进它的钟。走 `scheduler` 之后，"没人推进钟"与"节拍停下"是同一件事，
   * 撤销也从"记得住那个 id"变成"按层清一个 tag"。
   *
   * 唯一的出口是 `_stopMelody()` / `_stopCombatLayer()` 各自清自己那个 tag：
   * 战斗层只由 boss 的两条入口武装（`startBossFight`、`setBossPhase`），`endBossFight` 撤销它。
   *
   * 代价说清楚：推进用的是 rawDt 且在 `canPlay` 那道暂停门控**之前**，所以打开暂停菜单时
   * 音乐照常放 —— 这是有意的，它和 UI 延时量的是同一个"玩家真实看着的秒数"；
   * 而 hitstop 与慢动作改的是世界的时标，不该把音乐一起抻长。
   * 每一拍至多晚一帧，且不会累积成"越放越慢"，因为这一段节拍没有对时参照物。
   */
  _scheduleBeat(tag, seconds, playBeat) {
    scheduler.after(Math.max(0.001, seconds), () => {
      playBeat();
      this._scheduleBeat(tag, seconds, playBeat);
    }, tag);
  }

  _initOnGesture() {
    const unlock = () => {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        /** 落的是 `this.volumes` 那份档，不是这里的字面量（B103：改前写死 0.35/0.55，
         *  于是开机那次 `applyToGame` 之后玩家存的音量全被这一次覆盖） */
        this.master.gain.value = this.volumes.master;
        this.master.connect(this.ctx.destination);
        this.sfx = this.ctx.createGain();
        this.sfx.gain.value = this.volumes.sfx;
        this.sfx.connect(this.master);
        this.ambient = this.ctx.createGain();
        // 环境层档落的是名册那份档（W-C7 切片5）：改前是字面量 0.12，玩家的环境音量档进不来
        this.ambient.gain.value = this.volumes.ambient;
        this.ambient.connect(this.master);
        this.bgm = this.ctx.createGain();
        // 音乐档 × 混音比走唯一写笔（W-C7 切片5）：改前是字面量 0.14，玩家的音乐档进不来
        this._applyBgmGain();
        this.bgm.connect(this.master);
        this.combatLayer = this.ctx.createGain();
        this.combatLayer.gain.value = 0;
        this.combatLayer.connect(this.master);
        this._noiseBuffer = this._createNoiseBuffer();
        this._startZoneDrone('hub');
        this._startMelody('hub');
        // 分层环境音（W-C7 切片4）：解锁那一刻按当前所在区起层（此前没有 ctx，起不了）。
        // 用 `this.currentZone` 而不是写死 'hub' —— 解锁可能发生在玩家已经在某座区里之后。
        this._换环境层(this.currentZone);
        audioOn('realm-bleed', (e) => this.playRealmBleed(e.detail?.key ?? 'wild'));
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
  }

  _createNoiseBuffer() {
    if (!this.ctx) return null;
    const len = this.ctx.sampleRate * 0.15;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return buf;
  }

  _stopDrone() {
    for (const o of this._droneOsc) {
      try { o.stop(); } catch { /* ok */ }
      o.disconnect();
    }
    this._droneOsc = [];
    this._droneGain?.disconnect();
    this._droneGain = null;
  }

  _stopMelody() {
    scheduler.clear(TAG_MELODY);
    this._melodyStep = 0;
  }

  _stopCombatLayer() {
    scheduler.clear(TAG_COMBAT);
    this._combatStep = 0;
    if (this.combatLayer) this.combatLayer.gain.value = 0;
  }

  _startCombatLayer(intensity = 1) {
    if (!this.ctx || !this.enabled) return;
    this._stopCombatLayer();
    this.combatLayer.gain.value = 0.06 * intensity;
    const interval = Math.max(180, 420 - intensity * 80) / 1000;
    this._scheduleBeat(TAG_COMBAT, interval, () => {
      this._combatStep++;
      const low = 55 + (this._bossPhase - 1) * 12;
      this._playCombatHit(low, 0.07 * intensity);
      if (this._combatStep % 4 === 0) this._playCombatHit(low * 1.5, 0.04 * intensity);
    });
  }

  _playCombatHit(freq, vol) {
    const t = this.ctx.currentTime;
    this._playNoise(0.04, vol * 0.5, 200);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g);
    g.connect(this.combatLayer);
    o.start(t);
    o.stop(t + 0.09);
  }

  _startZoneDrone(zoneKey) {
    if (!this.ctx || !this.enabled) return;
    this._stopDrone();
    const spec = ZONE_DRONES[zoneKey] ?? ZONE_DRONES.wild;
    this._droneGain = this.ctx.createGain();
    this._droneGain.gain.value = zoneKey.startsWith('boss') ? 0.062 : 0.038;
    this._droneGain.connect(this.ambient);
    for (const freq of [spec.base, spec.harm]) {
      const o = this.ctx.createOscillator();
      o.type = spec.type;
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = freq === spec.base ? 0.55 : 0.28;
      o.connect(g);
      g.connect(this._droneGain);
      o.start();
      this._droneOsc.push(o);
    }
  }

  _startMelody(zoneKey) {
    if (!this.ctx || !this.enabled) return;
    this._stopMelody();
    const spec = ZONE_DRONES[zoneKey] ?? ZONE_DRONES.wild;
    const tempo = (MODE_TEMPO[zoneKey] ?? MODE_TEMPO[this.audioMode] ?? MODE_TEMPO.zone) / 1000;
    const root = spec.base * 2;
    this._scheduleBeat(TAG_MELODY, tempo, () => {
      const scale = spec.scale ?? [0, 2, 4, 7, 9];
      const deg = scale[this._melodyStep % scale.length];
      const freq = root * (2 ** (deg / 12));
      const vol = this.bossFightActive ? 0.1 + this._bossPhase * 0.02 : 0.06;
      this._playMelodyNote(freq, vol);
      this._melodyStep++;
    });
  }

  _playMelodyNote(freq, vol) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g);
    g.connect(this.bgm);
    o.start(t);
    o.stop(t + 0.6);
  }

  /**
   * BGM 子总线增益的唯一写笔（W-C7 切片5）：玩家音乐档 × 当前混音比。
   * 改前 `bgm.gain.value` 在解锁 / setMode / startBossFight / setBossPhase 四处各写各的
   * 字面量，玩家的音乐档一格都落不进去。四处收成这一个出口后，换档只改 `_bgmTrim`
   * （相对响度），玩家档与混音比在落笔那一刻才相乘 —— 拧小音乐档，boss 战照旧"更响"。
   */
  _applyBgmGain() {
    if (this.bgm) this.bgm.gain.value = this.volumes.music * this._bgmTrim;
  }

  setMode(mode, zoneKey) {
    if (this.bossFightActive && mode !== 'boss' && !String(zoneKey).startsWith('boss')) return;
    this.audioMode = mode;
    const key = mode === 'zone' ? (zoneKey ?? this.currentZone) : (zoneKey ?? mode);
    this._bossProfile = key;
    this._startZoneDrone(key in ZONE_DRONES ? key : mode);
    this._startMelody(key in ZONE_DRONES ? key : mode);
    // 分层环境音（W-C7 切片4）：旧的几层淡出、新的几层淡入。
    // 走 `setMode` 而不是 `setZone` —— 因为切区、进副本、开 Boss 战都汇到这一处，
    // 少一个入口就少一次"环境声没跟着换"的机会。
    this._换环境层(key);
    if (this.bgm) {
      this._bgmTrim = mode === 'boss' || String(key).startsWith('boss') ? BGM_TRIM.boss : mode === 'dungeon' ? BGM_TRIM.dungeon : BGM_TRIM.zone;
      this._applyBgmGain();
    }
  }

  /* ===== 分层环境音（W-C7 切片4） ===== */

  /**
   * 换区：旧的几层淡出，新的几层淡入。
   *
   * 淡入淡出走**音频自己的时间**（`AudioContext.currentTime` 上的 ramp），不走 `scheduler` ——
   * 声音的淡出是"物理上音量渐变"，与游戏帧率无关；而 `scheduler` 走的是 rawDt（会被掉帧拉长）。
   * 两者混用会让"切区那一秒"在低帧率机器上淡不掉。
   */
  _换环境层(zoneKey) {
    this._停环境层();
    if (!this.ctx || !this.enabled) return;
    const 层表 = ambienceOf(zoneKey);
    for (const [i, 层] of 层表.entries()) {
      const 句柄 = this._起一层(层, i);
      if (句柄) this._环境层.set(句柄.键, 句柄);
    }
  }

  /**
   * 停掉当前所有环境层（淡出 → 断开 → 清掉它的排程）。
   *
   * 淡出期间旧层仍挂在 `ambient` 总线上（所以是"交叉淡出"而不是"断掉再起"）——
   * 直接断会有一声"咔"（Web Audio 的节点被强行断开时的爆音）。
   */
  _停环境层() {
    if (!this._环境层.size) return;
    const t = this.ctx?.currentTime ?? 0;
    for (const [, 句柄] of this._环境层) {
      句柄.淡出?.(t);
      scheduler.clear(句柄.tag);
    }
    this._环境层.clear();
  }

  /**
   * 起一层环境声。返回 `{ 键, tag, 淡出 }`；音频没解锁（`ctx` 还没建）时返回 null。
   *
   * 四种配方各一条合成链，**链的末端都接这一层自己的 Gain** —— 淡入淡出动的是那一格，
   * 于是"这一层单独淡出"与"整层一起淡出"是同一件事。
   */
  _起一层(层, 序号) {
    if (!this.ctx || !this.enabled) return null;
    if (!AMBIENCE_KINDS.includes(层.kind)) {
      throw new Error(`环境音层配方 "${层.kind}" 不在名单里（可用：${AMBIENCE_KINDS.join(' / ')}）`);
    }
    const ctx = this.ctx;
    const g = ctx.createGain();
    const 淡入秒 = 1.2;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(层.音量, ctx.currentTime + 淡入秒);
    g.connect(this.ambient);

    const 键 = `amb-${序号}-${层.kind}`;
    const tag = `${TAG_AMBIENCE}-${序号}`;
    /**
     * 淡出的收尾（断开）走**另一个** tag —— 它不能挂在层自己的 tag 上：
     * `_停环境层` 换区时会 `clear(层.tag)`，而那个 clear 恰好会把"淡出走完之后断开"
     * 那个任务一起清掉 ⇒ 旧层永远连在 `ambient` 总线上，两座区的声叠着，
     * 而且音量越走越高。两条 tag 分开是这条的**唯一**修法。
     */
    const 淡出tag = `${tag}-fade`;
    const 停机件 = [];   // 断开时要停的节点
    const 淡出 = (t) => {
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + 0.8);
        // 淡出结束后断开 —— 但**不停**振荡器：停了会在那一瞬间有一次幅度跳变（爆音）。
        // 振荡器自己停在那儿（`stop` 不接 = 一直响），但它的输出已经断了，CPU 上还占着 ——
        // 所以在淡出结束时把它停掉，那一刻它已经不接任何输出。
        for (const n of 停机件) {
          try { if (typeof n.stop === 'function') n.stop(t + 0.85); } catch { /* 已停 */ }
          try { n.disconnect(); } catch { /* 已断 */ }
        }
        scheduler.after(0.9, () => { try { g.disconnect(); } catch { /* 已断 */ } }, 淡出tag);
      } catch { /* 音频节点已被拆 */ }
    };

    if (层.kind === 'wind') {
      // 噪声 → 带通滤波，中心频率被一条慢 LFO 扫（风声会"呼吸"）
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 层.中心频率 ?? 400;
      filt.Q.value = 0.8;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.06;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 层.扫频 ?? 200;
      lfo.connect(lfoGain);
      lfoGain.connect(filt.frequency);
      src.connect(filt);
      filt.connect(g);
      src.start();
      lfo.start();
      停机件.push(src, lfo);
    } else if (层.kind === 'rumble') {
      // 低频振荡器 + 慢速颤音（空间在"响"）
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 层.频率 ?? 45;
      const trem = ctx.createOscillator();
      trem.frequency.value = 0.11;
      const tremGain = ctx.createGain();
      tremGain.gain.value = (层.音量 ?? 0.05) * 0.5;
      trem.connect(tremGain);
      tremGain.connect(g.gain);
      osc.connect(g);
      osc.start();
      trem.start();
      停机件.push(osc, trem);
    } else if (层.kind === 'drip') {
      // 每隔若干秒一声短促的滤波噪声脉冲（洞穴 / 雨）
      const 打一次 = () => {
        const t = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = this._noiseBuffer;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.value = 层.音高 ?? 200;
        filt.Q.value = 6;
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.9, t);
        bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        src.connect(filt);
        filt.connect(bg);
        bg.connect(g);
        src.start(t);
        src.stop(t + 0.18);
      };
      打一次();
      this._排程重复(层.间隔 ?? 4, 打一次, tag);
    } else if (层.kind === 'chime') {
      // 每隔若干秒一串正弦泛音（神殿 / 冰晶）
      const 响一次 = () => {
        const t = ctx.currentTime;
        const 泛音 = [1, 2.01, 2.98];
        泛音.forEach((倍, i) => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = (层.音高 ?? 660) * 倍;
          const bg = ctx.createGain();
          const 起 = t + i * 0.012;
          bg.gain.setValueAtTime(0.0001, 起);
          bg.gain.linearRampToValueAtTime(0.5 / (i + 1), 起 + 0.01);
          bg.gain.exponentialRampToValueAtTime(0.0001, 起 + 1.1 - i * 0.2);
          o.connect(bg);
          bg.connect(g);
          o.start(起);
          o.stop(起 + 1.2);
        });
      };
      响一次();
      this._排程重复(层.间隔 ?? 6, 响一次, tag);
    }

    return { 键, tag, 淡出tag, 淡出, gain: g };
  }

  /**
   * 自排下一拍（与 `_scheduleBeat` 同一形状，但**不**再自我重排 —— 由调用方决定要不要继续）。
   *
   * 环境层的"滴水 / 铃"是**一次性**的间隔声：打一次之后隔一段时间再打一次。
   * 撤销靠 `scheduler.clear(tag)`（每层一个 tag）。
   */
  _排程重复(间隔秒, 打一次, tag) {
    const 一步 = () => {
      scheduler.after(间隔秒, () => {
        打一次();
        一步();
      }, tag);
    };
    一步();
  }

  startBossFight(bossId) {
    this._savedMode = { mode: this.audioMode, zone: this.currentZone };
    this.bossFightActive = true;
    this._bossPhase = 1;
    let profile = BOSS_BGM_MAP[bossId] ?? BOSS_BGM_MAP.default;
    if (isDungeonBossId(bossId)) profile = 'boss-dungeon';
    this.audioMode = 'boss';
    this._bossProfile = profile;
    this._startZoneDrone(profile);
    this._startMelody(profile);
    this._bgmTrim = BGM_TRIM.boss;
    this._applyBgmGain();
    this._startCombatLayer(1);
    this.bossRoarSting();
  }

  setBossPhase(phase) {
    if (!this.bossFightActive) return;
    this._bossPhase = phase;
    const intensity = 1 + (phase - 1) * 0.35;
    // 阶段档保旧字面量的账：0.2 + 0.04p 是切片5 前的绝对增益，除回 boss 档基准 0.22
    // 折成相对混音比 —— 玩家的音乐档在 _applyBgmGain 里再乘回来，浮点差一个 ulp 以内
    this._bgmTrim = BGM_TRIM.boss * ((0.2 + phase * 0.04) / 0.22);
    this._applyBgmGain();
    if (this.combatLayer) this.combatLayer.gain.value = 0.06 * intensity;
    this._startCombatLayer(intensity);
    if (this._droneGain) this._droneGain.gain.value = 0.055 + phase * 0.012;
  }

  endBossFight() {
    this.bossFightActive = false;
    this._stopCombatLayer();
    const saved = this._savedMode ?? { mode: 'zone', zone: this.currentZone };
    this.setMode(saved.mode, saved.zone);
    this._savedMode = null;
  }

  bossRoarSting() {
    this.playTone(55, 0.8, 'sawtooth', 0.18);
    this.playTone(110, 0.6, 'square', 0.1);
  }

  playRealmBleed(zoneKey) {
    if (!this.ctx || !this.enabled) return;
    const spec = ZONE_DRONES[zoneKey] ?? ZONE_DRONES.wild;
    const t = this.ctx.currentTime;
    const sweep = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(spec.base * 0.6, t);
    sweep.frequency.exponentialRampToValueAtTime(spec.harm * 2.2, t + 0.35);
    sg.gain.setValueAtTime(0.001, t);
    sg.gain.linearRampToValueAtTime(0.14, t + 0.06);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    sweep.connect(sg);
    // 接 sfx 总线（B139，切片5 发现即修）：改前接的是 bleed 总线，而那条 gain 恒 0 ——
    // 扫频的账全做、一个原子都到不了 master，等于这声效果被静音了；只挂它在解锁回调里，
    // 连"总线还在只是没声"都算不上。
    sg.connect(this.sfx);
    sweep.start(t);
    sweep.stop(t + 0.95);
    // 余音罩住这一层之后，把该区的底噪与旋律接上（0.12 秒是给扫频留的位置）
    scheduler.after(0.12, () => {
      if (this.audioMode === 'zone' && !this.bossFightActive) this.setMode('zone', zoneKey);
    }, TAG_ONESHOT);
  }

  playTone(freq, dur, type = 'sine', vol = 0.15, dest = null) {
    if (!this.ctx || !this.enabled) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g);
    g.connect(dest ?? this.sfx);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  _playNoise(dur = 0.08, vol = 0.08, filterFreq = 800) {
    if (!this.ctx || !this._noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfx);
    src.start();
    src.stop(this.ctx.currentTime + dur);
  }

  /**
   * 上行三音（房间清空 / 升级 / 吸收魂）：一次排好每一音的到期时刻。
   * 全部挂 `audio/oneshot` —— 一次性音效之间不该互相撤销，只有整体清场时一起走。
   */
  _arpeggio(freqs, step, dur, vol) {
    freqs.forEach((f, i) => {
      scheduler.after(i * step, () => this.playTone(f, dur, 'sine', vol), TAG_ONESHOT);
    });
  }

  /**
   * 按名字播一个音效 —— `game-audio-sfx` 的唯一咽喉（B71）。
   *
   * 修前 Game.js 里写的是 `if (fn && typeof this.audio[fn] === 'function') this.audio[fn]()`：
   * 名字抄错一个字母的症状是**那一下没声音**，不报错、不掉帧、没人知道，
   * 而这条契约只活在 `engine/events.js` 的一条 `desc` 注释里。这里把它升级成当场炸 ——
   * 与 `engine/EventBus.js` 对未登记事件名同一条判据：静默失踪是最贵的一种失败。
   */
  playSfx(name) {
    if (!SFX_NAMES.includes(name)) {
      throw new Error(`未知的音效名 "${name}"：SFX_NAMES 里没有这一格（现有 ${SFX_NAMES.length} 条）。新增音效要同时补 AudioManager 上的方法与这张表。`);
    }
    this[name]();
  }

  /**
   * 字幕线索 → 声音（W-D6 切片8）。
   *
   * 与上面那个 playSfx 是**两条并列的咽喉**，管的面不同：playSfx 管「用名字远程点一个音」，
   * 这里管「世界上发生了一件有声响的事」。调用点只 emitCue(...)，具体调本类哪个方法，
   * 由 content/captions.js 里 CUE_CATALOG 的 sound 那一格说了算 —— 那一格是全仓唯一真源，
   * 所以「这个线索发什么声音」不存在第二份抄写。
   *
   * 两道校验都不静默：
   * ① 表外线索 id 由 cueOf() 当场抛（B71 口径：抄错名字的症状必须是启动就炸）；
   * ② 名册点得出名字、本类上却没有那个方法，同样当场抛 —— 那是名册与实现之间漂了，
   *    跳过它就等于把 B71 刚关上的门又打开一半（症状还是「那一下没声音」）。
   */
  _playCue(detail) {
    const id = detail?.cue;
    const cue = cueOf(id);
    if (!cue.sound) return;
    const fn = this[cue.sound];
    if (typeof fn !== 'function') {
      throw new Error(`字幕线索 "${id}" 的 sound 指向 "${cue.sound}"，但 AudioManager 上没有这个方法`);
    }
    // 只有个别音效要参数（gearDrop 按稀有度序定音高），那一格从 cue.soundArg 点名去 data 里取
    if (cue.soundArg) fn.call(this, detail?.data?.[cue.soundArg]);
    else fn.call(this);
  }

  swingLight() { this._playNoise(0.06, 0.07, 1200); this.playTone(180, 0.04, 'sine', 0.04); }
  swingHeavy() { this._playNoise(0.1, 0.12, 600); this.playTone(90, 0.08, 'sawtooth', 0.08); }
  hit() { this.playTone(120 + Math.random() * 40, 0.08, 'square', 0.14); this.playTone(60, 0.12, 'sine', 0.1); this._playNoise(0.05, 0.06, 400); }
  heavyHit() { this.playTone(80, 0.15, 'sawtooth', 0.2); this.playTone(40, 0.2, 'sine', 0.12); this._playNoise(0.08, 0.1, 300); }
  parry() { this.playTone(880, 0.06, 'sine', 0.22); this.playTone(1320, 0.12, 'sine', 0.14); this.playTone(660, 0.2, 'triangle', 0.08); }
  blockClink() { this.playTone(420, 0.05, 'square', 0.1); this.playTone(280, 0.08, 'triangle', 0.06); }
  dodge() { this._playNoise(0.05, 0.05, 900); this.playTone(200, 0.05, 'sine', 0.07); }
  playerHurt() { this.playTone(140, 0.12, 'sawtooth', 0.12); this.playTone(70, 0.18, 'sine', 0.08); }
  doorOpen() { this.playTone(330, 0.12, 'sine', 0.1); this.playTone(440, 0.15, 'sine', 0.08); }
  roomClear() { this._arpeggio([523, 659, 784], 0.09, 0.18, 0.1); }
  levelUp() { this._arpeggio([523, 659, 784], 0.1, 0.2, 0.15); }
  bossRoar() { this.bossRoarSting(); }
  bossPhase() { this.playTone(70, 0.4, 'sawtooth', 0.15); this.playTone(140, 0.3, 'square', 0.1); }
  pickup() { this.playTone(660, 0.1, 'sine', 0.1); this.playTone(990, 0.15, 'sine', 0.08); }

  /**
   * 场地危险区落地前的那一声（W-A6 切片9，M6）。
   *
   * 为什么单独一个方法而不是塞进 `SFX_NAMES`：与 `gearDrop` / `pickup` 同一条口径 ——
   * 这是**直接调用**的游戏音效，不走 `game-audio-sfx` 的远程请求面。圈本身看得见
   * （边缘环 M5），这一声是给"视线在地图别处"的玩家的提前量，不是唯一信息通道，
   * 所以也**不进字幕线索名册**（`content/captions.js`：字幕条是稀缺注意力资源）。
   *
   * 两声短上行方波（740 → 988Hz，各约 0.08 秒）：与 `doorOpen` 的正弦分开一个音色，
   * 混在战斗里也辨得出"这是地面要落了"，不是门开了。
   */
  hazardWarn() { this.playTone(740, 0.07, 'square', 0.1); this.playTone(988, 0.09, 'square', 0.08); }

  /**
   * 被顶开的那一声（W-A6 切片11，M6）—— 与 `hazardWarn` 同一条口径：**直接调用**的游戏音效，
   * 不进 `SFX_NAMES`（那张表只管 `game-audio-sfx` 的远程请求面），也不进字幕线索名册
   * （字幕条是稀缺注意力资源，位移提示走震屏 + 声音两条感性通道就够）。
   *
   * 为什么不只是 `playerHurt`：疼的那一声按**血量**走（`CombatController` 的 takeDamage 顶它），
   * 一记位移大、掉血少的推挤在旧账里是安静的。这一声归外力通道：`applyKnockback` 记账过
   * 震屏同一道门槛（`PLAYER_KNOCK.cue.shakeFloor`）才响 —— 晃与响是同一记位移的两个出口，
   * 判据只此一份，不另抄一档。
   *
   * 音色与 `heavyHit`（出手侧的重击）分家：噪声为主 + 一记短促的低方波，
   * 混在战斗里辨得出「我被推了一下」，不是对面挨了重击。
   */
  playerShoved() { this._playNoise(0.09, 0.13, 240); this.playTone(85, 0.12, 'square', 0.09); }

  /**
   * 被拽住的那一声（W-A6 切片11）：下坠扫频 = 「吸进去」的读法，与被拽收FOV的负 delta 同一口径。
   * 只在拽住的**起沿**响一次（`PlayerController._stepKnock` 的迟滞沿触发），不逐帧响 ——
   * 持续状态有 FOV 在说，声音只负责告诉你「从现在起你被拽住了」。
   * 进门门槛就是 fovFloor（与收FOV同一个「明显被拽」的定义），出门门槛在 `cue.dragExit`。
   */
  dragGrip() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + 0.35);
  }

  /** 挣脱 / 放开的那一声（W-A6 切片11）：两短上行，与 grip 的下坠读法相对 —— 拽力没了 */
  dragRelease() { this.playTone(240, 0.07, 'triangle', 0.05); this.playTone(360, 0.1, 'triangle', 0.04); }

  /**
   * 装备落地的一声（W-B5 切片7）：档位越高音越亮。与 `pickup` / `hit` 一样是**直接调用**的
   * 游戏音效 —— 不进 `SFX_NAMES`（那张表只管 `game-audio-sfx` 的远程请求面）。
   * `rank` 是稀有度序（0 起）。认不出的取值收进 0~3 而不是抛：声音不是账，
   * 它不该有本事挡住一次掉落 —— 与 `setVolumes` 对越界值同一条口径。
   */
  gearDrop(rank = 0) {
    const r = Number.isFinite(rank) ? Math.max(0, Math.min(3, Math.floor(rank))) : 0;
    const base = 500 + r * 80;
    this.playTone(base, 0.08, 'sine', 0.05 + r * 0.015);
    this.playTone(base * 1.5, 0.16, 'triangle', 0.04 + r * 0.015);
  }
  loreDiscover() { this.playTone(440, 0.15, 'sine', 0.08); this.playTone(554, 0.2, 'triangle', 0.06); }
  restDialogueOpen() { this.playTone(392, 0.2, 'sine', 0.06); this.playTone(523, 0.25, 'triangle', 0.05); }
  executionSting() { this.playTone(55, 0.35, 'sawtooth', 0.14); this.playTone(110, 0.25, 'square', 0.1); this._playNoise(0.06, 0.08, 280); }
  wispChase() { this.playTone(520 + Math.random() * 30, 0.04, 'sine', 0.03); }
  wispAbsorb() { this.pickup(); this._arpeggio([880, 1100, 1320], 0.06, 0.12, 0.09); }
  death() { this.playTone(150, 0.4, 'sawtooth', 0.12); }
  voidGravityFlip() { this.playTone(95, 0.3, 'triangle', 0.12); this.playTone(190, 0.2, 'sine', 0.08); }

  setZone(zone) {
    if (zone === this.currentZone && this.audioMode === 'zone' && !this.bossFightActive) return;
    this.currentZone = zone;
    if (this.audioMode === 'zone' && !this.bossFightActive) this.setMode('zone', zone);
  }

  setVolumes(master, sfx, music, ambient) {
    /**
     * 先记账再落笔（B103 的修法）。改前这两行是 `if (this.master) …` 就完了：开机那次
     * `SettingsManager.applyToGame`（`core/Game.js:382`）跑在**任何用户手势之前**，那时
     * ctx 还没建、节点还不存在，于是玩家存的音量被 `if` 安静吞掉，第一次点击解锁时
     * `_initOnGesture` 又把自己的字面量写上去 —— 实测（`.tmp-20261010/wc7s3-probe2.mjs`）
     * 存 0.9/0.2 的档，解锁后实得 0.35/0.55，整条音量路径今天只有"去面板再拖一次滑杆"
     * 那一条能生效。存进 `this.volumes` 之后，解锁那一刻落的就是这份档。
     *
     * 切片5 起四条总线各有一档。老调用点只传前两参：music / ambient 走 `normalizeVolume`
     * 的 undefined 分支回落名册出厂 —— 不炸、也不替玩家猜一个数。
     */
    this.volumes = {
      master: normalizeVolume(master, VOLUME_DEFAULTS.master),
      sfx: normalizeVolume(sfx, VOLUME_DEFAULTS.sfx),
      music: normalizeVolume(music, VOLUME_DEFAULTS.music),
      ambient: normalizeVolume(ambient, VOLUME_DEFAULTS.ambient),
    };
    if (this.master) this.master.gain.value = this.volumes.master;
    if (this.sfx) this.sfx.gain.value = this.volumes.sfx;
    if (this.ambient) this.ambient.gain.value = this.volumes.ambient;
    this._applyBgmGain();
  }

  spellCast() { this.playTone(520, 0.12, 'sine', 0.08); this.playTone(780, 0.08, 'triangle', 0.06); }
  weaponSwitch() { this.playTone(330, 0.1, 'sine', 0.1); }
}
