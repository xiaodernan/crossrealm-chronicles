/** Web Audio — 区域 BGM + Boss 专属层 + 战斗节奏层 + 音效 */
import { scheduler } from '../engine/Scheduler.js';
import { isDungeonBossId } from '../content/bossRoster.js';

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
  }

  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.ambient = null;
    this.bgm = null;
    this.combatLayer = null;
    this.bleed = null;
    this.currentZone = 'hub';
    this.audioMode = 'zone';
    this.bossFightActive = false;
    this._bossProfile = 'boss';
    this._bossPhase = 1;
    this._savedMode = null;
    this.enabled = true;
    this._droneOsc = [];
    this._droneGain = null;
    this._melodyStep = 0;
    this._combatStep = 0;
    this._noiseBuffer = null;
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
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
        this.sfx = this.ctx.createGain();
        this.sfx.gain.value = 0.55;
        this.sfx.connect(this.master);
        this.ambient = this.ctx.createGain();
        this.ambient.gain.value = 0.12;
        this.ambient.connect(this.master);
        this.bgm = this.ctx.createGain();
        this.bgm.gain.value = 0.14;
        this.bgm.connect(this.master);
        this.combatLayer = this.ctx.createGain();
        this.combatLayer.gain.value = 0;
        this.combatLayer.connect(this.master);
        this.bleed = this.ctx.createGain();
        this.bleed.gain.value = 0;
        this.bleed.connect(this.master);
        this._noiseBuffer = this._createNoiseBuffer();
        this._startZoneDrone('hub');
        this._startMelody('hub');
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

  setMode(mode, zoneKey) {
    if (this.bossFightActive && mode !== 'boss' && !String(zoneKey).startsWith('boss')) return;
    this.audioMode = mode;
    const key = mode === 'zone' ? (zoneKey ?? this.currentZone) : (zoneKey ?? mode);
    this._bossProfile = key;
    this._startZoneDrone(key in ZONE_DRONES ? key : mode);
    this._startMelody(key in ZONE_DRONES ? key : mode);
    if (this.bgm) {
      this.bgm.gain.value = mode === 'boss' || String(key).startsWith('boss') ? 0.22 : mode === 'dungeon' ? 0.16 : 0.14;
    }
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
    if (this.bgm) this.bgm.gain.value = 0.22;
    this._startCombatLayer(1);
    this.bossRoarSting();
  }

  setBossPhase(phase) {
    if (!this.bossFightActive) return;
    this._bossPhase = phase;
    const intensity = 1 + (phase - 1) * 0.35;
    if (this.bgm) this.bgm.gain.value = 0.2 + phase * 0.04;
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
    sg.connect(this.bleed);
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

  setVolumes(master, sfx) {
    if (this.master) this.master.gain.value = master;
    if (this.sfx) this.sfx.gain.value = sfx;
  }

  spellCast() { this.playTone(520, 0.12, 'sine', 0.08); this.playTone(780, 0.08, 'triangle', 0.06); }
  weaponSwitch() { this.playTone(330, 0.1, 'sine', 0.1); }
}
