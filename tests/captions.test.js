/**
 * 字幕（音频线索的视觉化）门禁 —— W-D6 切片8。
 *
 * ## 这一片要钉什么
 * 本仓音频全是合成音、没有一句语音，所以"字幕"不是给台词配文字，而是给**只靠声音传递的
 * 信息**配一个视觉出口。对听障与重放玩家，那些声音等于不存在。
 *
 * 普查结论（写进 `content/captions.js` 的文件头）：`roomClear` / `levelUp` / `bossPhase` /
 * `loreDiscover` / `wispAbsorb` / `voidGravityFlip` / `doorOpen` 旁边**已经有** toast /
 * banner / 对话框在说同一件事；真正"只有声音"的只有 `gearDrop` / `pickup` / `execution` 三格。
 * 所以这门禁同时也钉住"没有把已经有字的线索再配一遍字幕" —— 那会把字幕条变成噪音。
 *
 * ## 七层（坏法各不同）
 * ① **名册自洽**：kind 有档、文案键双语都在、sound 是 AudioManager 上真有的方法、
 *    soundArg 点名的那一格调用点真的给。名册与实现之间不许漂。
 * ② **咽喉**：合法 id 真派发 `game-cue`、负载形状对；表外 id 当场抛（B71 口径）。
 * ③ **音频侧**：AudioManager 听 `game-cue` 真的出声，且 `soundArg` 那一格真的传进去了
 *    （gearDrop 的档位抬频就是证据）。
 * ④ **字幕条**：文字走 `t(key, data)` 插值、同线索重复只续期不叠行、同屏最多三条、
 *    到期退场。
 * ⑤ **开关**：出厂关；关掉时整条静默但**不影响声音**（事件照旧派发）。
 * ⑥ **接线**：DEFAULTS / applyToGame / Game.js 每帧 update / 壳页那一格与两条文案键。
 * ⑦ **反面证据**：派发点只有三处、全在预期文件里；没有第二个人直接摸那三个音效方法。
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  CUE_CATALOG, CUE_IDS, CUE_KINDS, cueSoundOf, cueTextKeyOf, cueTtlOf,
} from '../src/content/captions.js';
import { emitCue } from '../src/engine/cues.js';
import { on, offAll } from '../src/engine/EventBus.js';
import { AudioManager, SFX_NAMES } from '../src/audio/AudioManager.js';
import { Captions } from '../src/ui/Captions.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { installWindowShim } from './helpers/enemyHarness.js';
import { freshArm, run, notesOn, disarmAudio } from './helpers/fakeAudio.js';
import { t, setLanguage } from '../src/engine/i18n.js';

const SRC = join(process.cwd(), 'src');
const TAG = 'test/captions';

beforeAll(() => { setLanguage('zh'); });
afterEach(() => {
  offAll(TAG);
  offAll('ui/Captions');
  disarmAudio();
  delete globalThis.document;
  setLanguage('zh');
});

/** 收这一场所有 game-cue（装 shim 后再挂，事件才落得进来） */
const 收线索 = () => {
  // 已经有 window（freshArm 刚挂过 AudioManager 的监听）就不要再装一次 shim：
  // 换了 window，先前挂上去的监听就全掉了 —— 那就成了测试道具把生产接线剪了。
  if (!globalThis.window) installWindowShim();
  const 收到 = [];
  on('game-cue', (e) => 收到.push(e.detail), TAG);
  return 收到;
};

/* ------------------------------------------------------------------ *
 * ① 名册自洽
 * ------------------------------------------------------------------ */

describe('① 名册：三格线索，每一格都说得清自己的档、字与声音', () => {
  it('普查结论落在表里：gearDrop / pickup / execution 三格，一格不多', () => {
    // 这一条同时是"没有把已经有字的线索再配一遍字幕"的护栏 —— 见文件头。
    // 要加格子就得先在这里改，改的时候就会看见上面那段普查。
    expect([...CUE_IDS]).toEqual(['gearDrop', 'pickup', 'execution']);
  });

  it('名册是冻结的，条目也冻结（就地改一格不算"显式加一格"）', () => {
    expect(Object.isFrozen(CUE_CATALOG)).toBe(true);
    for (const id of CUE_IDS) expect(Object.isFrozen(CUE_CATALOG[id]), `${id} 那一格没冻`).toBe(true);
    expect(Object.isFrozen(CUE_KINDS)).toBe(true);
  });

  it('每一格的 kind 都在 CUE_KINDS 里，ttl 是正数', () => {
    for (const id of CUE_IDS) {
      const kind = CUE_CATALOG[id].kind;
      expect(CUE_KINDS[kind], `${id} 的 kind "${kind}" 没有档`).toBeTruthy();
      expect(cueTtlOf(id), `${id} 的 ttl 不是正数`).toBeGreaterThan(0);
    }
  });

  it('critical 比 info 停得久：分档不是为了好看，是"错过就亏了"要多留一会儿', () => {
    expect(cueTtlOf('execution')).toBeGreaterThan(cueTtlOf('pickup'));
  });

  it('每一格的文案键在中文表与英文表里都有（切语言时字幕不许变成 [MISSING:]）', () => {
    for (const id of CUE_IDS) {
      const key = cueTextKeyOf(id);
      expect(STRINGS_ZH[key], `中文表缺 ${key}`).toBeTruthy();
      expect(STRINGS_EN[key], `英文表缺 ${key}`).toBeTruthy();
    }
  });

  it('每一格的 sound 都是 AudioManager 上真有的方法', () => {
    for (const id of CUE_IDS) {
      const name = cueSoundOf(id);
      expect(typeof AudioManager.prototype[name],
        `线索 "${id}" 的 sound 指向 "${name}"，但 AudioManager 上没有这个方法`).toBe('function');
    }
  });

  it('这三个音效都不在 SFX_NAMES 里：那张表只管 game-audio-sfx 的远程请求面', () => {
    for (const id of CUE_IDS) expect(SFX_NAMES, `${id} 混进了远程派发面`).not.toContain(cueSoundOf(id));
  });

  it('soundArg 点名的那一格，派发点真的给（gearDrop 要档位序定音高）', () => {
    const arg = CUE_CATALOG.gearDrop.soundArg;
    expect(arg, 'gearDrop 该声明它要哪一格参数').toBe('rank');
    const loot = readFileSync(join(SRC, 'game', 'LootSystem.js'), 'utf8');
    expect(loot, `LootSystem 没在 data 里给 ${arg}`).toMatch(new RegExp(`emitCue\\(\\s*'gearDrop'[^)]*\\b${arg}\\s*:`));
  });
});

/* ------------------------------------------------------------------ *
 * ② 咽喉
 * ------------------------------------------------------------------ */

describe('② emitCue：合法 id 真派发，表外 id 当场抛', () => {
  it('派发 game-cue，负载是 { cue, data }', () => {
    const 收到 = 收线索();
    const out = emitCue('pickup');
    expect(out).toEqual({ cue: 'pickup', data: {} });
    expect(收到).toHaveLength(1);
    expect(收到[0]).toEqual({ cue: 'pickup', data: {} });
  });

  it('data 原样递过去（字幕插值与音效参数都从它取）', () => {
    const 收到 = 收线索();
    emitCue('gearDrop', { rank: 2, rarity: '稀有' });
    expect(收到[0].data).toEqual({ rank: 2, rarity: '稀有' });
  });

  it('表外 id 当场抛，且一条都不派（B71 口径：抄错名字的症状是启动就炸）', () => {
    const 收到 = 收线索();
    for (const bad of ['gearDorp', 'Pickup', '', 'roomClear', undefined, null]) {
      expect(() => emitCue(bad), `"${String(bad)} 居然过了咽喉"`).toThrow(/CUE_CATALOG/);
    }
    expect(收到, '抛错之前已经派发出去了').toHaveLength(0);
  });

  it('报错信息说得出该补哪两处', () => {
    let msg = '';
    try { emitCue('nope'); } catch (e) { msg = e.message; }
    expect(msg).toContain('nope');
    expect(msg).toContain('content/captions.js');
  });
});

/* ------------------------------------------------------------------ *
 * ③ 音频侧接线
 * ------------------------------------------------------------------ */

describe('③ AudioManager 听 game-cue：线索真的发出声音，参数真的传进去了', () => {
  it('每一条线索都在 sfx 总线上留下音符', () => {
    for (const id of CUE_IDS) {
      const { ctx } = freshArm();
      emitCue(id, { rank: 2 });
      run(ctx, 0.5);
      expect(notesOn(ctx, 'sfx').length, `emitCue('${id}') 之后 sfx 总线是空的`).toBeGreaterThan(0);
    }
  });

  it('soundArg 那一格真的进了音效：gearDrop 的档位抬频随线索负载走', () => {
    const 采 = (rank) => {
      const { ctx } = freshArm();
      emitCue('gearDrop', { rank });
      run(ctx, 0.3);
      return notesOn(ctx, 'sfx').map((n) => n.freq).sort((a, b) => a - b);
    };
    const 低 = 采(0);
    expect(低, 'gearDrop 该是两声').toHaveLength(2);
    expect(采(3)[0], '档位序没传进音效：高频那一条没抬起来').toBeGreaterThan(低[0]);
  });

  it('名册点得出、这个壳上没有的方法：当场抛，不是安静跳过', () => {
    // 那一格意味着名册与实现之间漂了。静默跳过就等于把 B71 刚关上的门又打开一半
    // （症状还是「那一下没声音」）。借一个空壳当 this：名册说得出名字，壳上没有那个方法。
    expect(() => AudioManager.prototype._playCue.call({}, { cue: 'pickup' })).toThrow(/AudioManager/);
  });

  it('cueOf 表外 id 由 AudioManager 那一侧也抛（它永远在听，与字幕开关无关）', () => {
    const { audio } = freshArm();
    expect(() => audio._playCue({ cue: 'roomClear' })).toThrow(/CUE_CATALOG/);
  });
});

/* ------------------------------------------------------------------ *
 * ④ 字幕条
 * ------------------------------------------------------------------ */

/** 一个够用的假 DOM：只实现 Captions 真的用到的那几样 */
const 假DOM = () => {
  const mk = (tag) => ({
    tagName: tag, className: '', textContent: '', children: [], _attrs: {}, parentNode: null,
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    remove() {
      const p = this.parentNode;
      if (!p) return;
      const i = p.children.indexOf(this);
      if (i >= 0) p.children.splice(i, 1);
      this.parentNode = null;
    },
  });
  const body = mk('body');
  const document = { createElement: mk, body, getElementById: () => null };
  return { document, body };
};

const 假字幕 = (captions = true) => {
  const { document, body } = 假DOM();
  globalThis.document = document;
  const game = { settings: { get: (k) => (k === 'captions' ? captions : undefined) } };
  const c = new Captions(game);
  return { captions: c, el: c.el, body };
};

describe('④ 字幕条：给了就画，到期就收', () => {
  it('容器带 role=status 与 aria-live=polite（状态播报，不打断读屏）', () => {
    const { el } = 假字幕();
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.id).toBe('captions');
  });

  it('文字走 t(key, data)：gearDrop 把稀有度插进去，切英文跟着变', () => {
    const { captions, el } = 假字幕();
    captions.show('gearDrop', { rank: 2, rarity: '稀有' });
    expect(el.children).toHaveLength(1);
    expect(el.children[0].textContent).toBe('掉落：稀有');
    setLanguage('en');
    expect(t('caption_gear_drop', { rarity: 'Rare' })).toBe('Drop: Rare');
    captions.show('pickup');
    expect(el.children[1].textContent).toBe('Picked up');
  });

  it('档位落在 class 上：critical 与 info 不是同一副样子', () => {
    const { captions, el } = 假字幕();
    captions.show('pickup');
    captions.show('execution');
    expect(el.children[0].className).toBe('caption caption-info');
    expect(el.children[1].className).toBe('caption caption-critical');
  });

  it('同一条线索重复到达只续期、不叠行（一帧内连收好几件掉落时字幕不许抖）', () => {
    const { captions, el } = 假字幕();
    captions.show('pickup');
    captions.show('pickup');
    captions.show('pickup');
    expect(el.children, '同一条线索叠了三行').toHaveLength(1);
    expect(captions.lines[0].ttl).toBe(cueTtlOf('pickup'));
  });

  it('同屏最多三条：第四条进场时丢最旧的那一条', () => {
    const { captions, el } = 假字幕();
    captions.show('gearDrop', { rank: 0, rarity: '凡品' });
    captions.show('pickup');
    captions.show('execution');
    expect(captions.lines).toHaveLength(3);
    // 名册今天只有三条线索，"第四条"只能这样造 —— 造的是一条真 DOM 行，
    // 走的还是 show() 里那条 while 循环，不是直接调私有方法。
    const 老 = document.createElement('div');
    el.appendChild(老);
    captions.lines.unshift({ id: 'synthetic', el: 老, ttl: 99 });
    captions.show('pickup');
    expect(captions.lines.map((l) => l.id)).toEqual(['gearDrop', 'execution', 'pickup']);
    expect(el.children.includes(老), '最旧的那一条没有退场').toBe(false);
  });

  it('到期退场：update(dt) 把过了 ttl 的行摘掉', () => {
    const { captions, el } = 假字幕();
    captions.show('pickup');                       // ttl = CUE_KINDS.info.ttl
    captions.update(cueTtlOf('pickup') - 0.1);
    expect(el.children, '还没到期就退了').toHaveLength(1);
    captions.update(0.2);
    expect(el.children, '到期了还在').toHaveLength(0);
  });

  it('关掉时 show() 是 no-op：一条都不画，也不校验线索名', () => {
    const { captions, el } = 假字幕(false);
    expect(captions.show('不存在的线索')).toBeNull();
    expect(el.children).toHaveLength(0);
  });

  it('表外线索 id 在开着字幕时当场抛（与 AudioManager 同一道校验）', () => {
    const { captions } = 假字幕();
    expect(() => captions.show('roomClear')).toThrow(/CUE_CATALOG/);
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ 开关
 * ------------------------------------------------------------------ */

describe('⑤ 开关：出厂关，关掉不拖累声音', () => {
  it('DEFAULTS 里是 false：机制片不夹带视觉变更', () => {
    expect(new SettingsManager().defaults.captions,
      'DEFAULTS 里没有 captions 一格 —— 读档永远拿不到它').toBe(false);
    expect(new SettingsManager().get('captions')).toBe(false);
  });

  it('构造时按 settings 决定开不开', () => {
    expect(假字幕(false).captions.enabled).toBe(false);
    expect(假字幕(true).captions.enabled).toBe(true);
  });

  it('setEnabled(false) 清场；setEnabled(true) 之后又能画', () => {
    const { captions, el } = 假字幕(true);
    captions.show('pickup');
    expect(captions.setEnabled(false)).toBe(false);
    expect(el.children, '关开关没有清场').toHaveLength(0);
    captions.show('pickup');
    expect(el.children, '关着还能画').toHaveLength(0);
    captions.setEnabled(true);
    captions.show('pickup');
    expect(el.children).toHaveLength(1);
  });

  it('只认 true：存储里一个 "1" / 1 都当关（与 vibration 同口径）', () => {
    const { document } = 假DOM();
    globalThis.document = document;
    for (const v of ['1', 1, 'true', {}]) {
      const c = new Captions({ settings: { get: () => v } });
      expect(c.enabled, `${JSON.stringify(v)} 被当成开了`).toBe(false);
    }
    const c = new Captions({ settings: { get: () => true } });
    expect(c.enabled).toBe(true);
  });

  it('关掉字幕不影响声音：事件照旧派发、AudioManager 照旧播', () => {
    // 顺序要紧：先 freshArm（它换 window 并挂上 AudioManager 的监听），再收线索 ——
    // 反过来的话测试监听挂在被替换掉的那个 window 上，一条都收不到。
    const { ctx } = freshArm();
    const 收到 = 收线索();
    假字幕(false);
    emitCue('execution');
    expect(收到, '字幕关着的时候线索不派了').toHaveLength(1);
    expect(notesOn(ctx, 'sfx').length, '字幕关着的时候声音也不响了').toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * ⑥ 接线
 * ------------------------------------------------------------------ */

describe('⑥ 接线：applyToGame 推进去、主循环每帧收', () => {
  it('applyToGame 把 captions 推给字幕条（写入口只有这一处）', () => {
    const mgr = new SettingsManager();
    mgr.data = { ...mgr.data, captions: true };
    const  Calls = [];
    const game = { captions: { setEnabled: (v) => Calls.push(v) } };
    mgr.applyToGame(game);
    expect(Calls, 'applyToGame 没有推 captions').toEqual([true]);
  });

  it('applyToGame 推的是"真的勾上才算开"，脏值不当开', () => {
    const mgr = new SettingsManager();
    mgr.data = { ...mgr.data, captions: '1' };
    const Calls = [];
    mgr.applyToGame({ captions: { setEnabled: (v) => Calls.push(v) } });
    expect(Calls).toEqual([false]);
  });

  it('Game.js 每帧推进字幕条（到期退场靠主循环 dt，不另起定时器 —— B38）', () => {
    const game = readFileSync(join(SRC, 'core', 'Game.js'), 'utf8');
    expect(game).toMatch(/this\.captions\?\.update\(dt\)/);
    expect(game).toMatch(/this\.captions = this\._adopt\('ui\/Captions', new Captions\(this\)\)/);
  });

  it('字幕条建在 settings 之后、applyToGame 之前', () => {
    const game = readFileSync(join(SRC, 'core', 'Game.js'), 'utf8');
    const 建 = game.indexOf('this.captions = this._adopt');
    expect(建, 'Game.js 里没有建字幕条').toBeGreaterThan(-1);
    expect(game.indexOf('this.settings = new SettingsManager()'), '字幕条建在 settings 之前了')
      .toBeLessThan(建);
    expect(game.indexOf('this.settings.applyToGame(this)'), '字幕条建在 applyToGame 之后了')
      .toBeGreaterThan(建);
  });

  it('壳页有那一格，两条文案键都在', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('id="set-captions"');
    expect(html).toContain('data-i18n="settings_captions"');
    expect(STRINGS_ZH.settings_captions).toBeTruthy();
    expect(STRINGS_EN.settings_captions).toBeTruthy();
  });

  it('面板：change 走 set + applyToGame；回显问的是同一个取值口', () => {
    const panel = readFileSync(join(SRC, 'ui', 'SettingsPanel.js'), 'utf8');
    expect(panel).toMatch(/getElementById\('set-captions'\)/);
    expect(panel).toMatch(/s\.set\('captions', cap\.checked === true\)/);
    expect(panel).toMatch(/this\.game\.settings\.get\('captions'\) === true/);
  });

  it('样式：字幕条不抢指针事件（纯输出，不进走焦清单）', () => {
    const css = readFileSync(join(SRC, 'style.css'), 'utf8');
    expect(css).toMatch(/#captions\s*\{[^}]*pointer-events:\s*none/s);
  });
});

/* ------------------------------------------------------------------ *
 * ⑦ 反面证据
 * ------------------------------------------------------------------ */

describe('⑦ 反面证据：派发点只有三处，且没有第二个人直接摸那三个音效', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const CODE = walk(SRC).filter((f) => f.endsWith('.js'));
  const rel = (f) => relative(SRC, f).replaceAll('\\', '/');
  /** 只数代码行：文件头与注释里提到一个名字不算调用点 */
  const hits = (re) => CODE.flatMap((f) => readFileSync(f, 'utf8')
    .split(/\r?\n/).flatMap((line, i) => (re.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)
      ? [`${rel(f)}:${i + 1}`] : [])));

  it('扫描集覆盖当前源码树（空目录会让下面几条假绿）', () => {
    expect(CODE.length).toBeGreaterThan(50);
    for (const probe of ['engine/cues.js', 'content/captions.js', 'ui/Captions.js']) {
      expect(CODE.map(rel)).toContain(probe);
    }
  });

  it('emitCue 的派发点只发那三格线索，全在预期的文件里', () => {
    const 派发 = hits(/emitCue\(\s*'/);
    expect([...new Set(派发.map((h) => h.split(':')[0]))].sort())
      .toEqual(['cinematic/CombatCameraDirector.js', 'game/LootSystem.js', 'player/PlayerController.js']);
    // 掉落层一格发两条（gearDrop + pickup），所以站点是 4 个、线索是 3 条。
    // 只数代码行：名册文件头里那句示例 `emitCue('x')` 不算调用点。
    const 线索 = [...new Set(CODE.flatMap((f) => readFileSync(f, 'utf8').split(/\r?\n/)
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .flatMap((line) => [...line.matchAll(/emitCue\(\s*'([^']+)'/g)].map((m) => m[1]))))].sort();
    expect(线索, '派发的线索不是名册里那三格').toEqual(['execution', 'gearDrop', 'pickup']);
  });

  it('那三个音效没有第二个直接调用点（全都改听 game-cue 了）', () => {
    // gearDrop 的调用点在 AudioManager 自己与 LootSystem 的注释里；pickup 同理。
    // 这条把"又有谁直接摸 audio.pickup()"当场抓出来。
    for (const name of ['pickup', 'gearDrop', 'executionSting']) {
      const 直接 = hits(new RegExp(`audio\\w*\\??\\.${name}\\s*\\(`));
      expect(直接, `${name} 还有直接调用点：${直接.join(' / ')}`).toEqual([]);
    }
  });

  it('game-cue 登记在事件表里，且真的有人听', () => {
    const events = readFileSync(join(SRC, 'engine', 'events.js'), 'utf8');
    expect(events).toMatch(/'game-cue':\s*\{/);
    expect(hits(/game-cue/).length, 'game-cue 在 src/ 里没有任何引用').toBeGreaterThan(0);
  });
});
