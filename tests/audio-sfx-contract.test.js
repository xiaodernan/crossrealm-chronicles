/**
 * 音效名契约门禁（W-C7 切片2 / 修 B71）。
 *
 * ## 这一片要修的是什么
 *
 * `game-audio-sfx` 事件里 `sfx` 那一格装的是 **AudioManager 上的方法名**，
 * 而修前的接收端写的是 `if (fn && typeof this.audio[fn] === 'function') this.audio[fn]()`。
 * 于是把 `'doorOpen'` 打成 `'doorOpend'` 的症状是**那一下没声音**：不报错、不掉帧、
 * 没人知道，而这条契约只活在 `engine/events.js` 的一条 `desc` 注释里。
 * 与 B36 / B45 同族：**稳定身份靠人肉复制，而复制错了不报错**。
 *
 * ## 判据从哪来
 *
 * 改成 `AudioManager.playSfx(name)`：名字不在导出的名册 `SFX_NAMES` 里就**当场抛错**。
 * 这条判据不是新发明的口味，而是照仓里已有的判断抄的 ——
 * `engine/EventBus.js` 对未登记事件名就是抛，而不是静默不派。
 *
 * ## 用例分三层
 *
 * 1. **名册 ↔ 实现**（静态）：每一格真是本类的方法；名册不是方法名单的拷贝；
 *    `src/` 里每一处 `sfx: '<字面量>'` 都在名册里；名册每一格至少有一个调用方。
 *    后两条是双向的：加一格要么带一个真派发点，要么红。
 * 2. **咽喉的行为**：合法名字播得响（真音符走到 sfx 总线），非法名字抛错且
 *    一个音都不发、一个新待办都不排。
 * 3. **走真接线**：把 `src/core/Game.js` 里**那一条监听语句的函数体切出来**（不重写一遍）
 *    再当监听器跑 —— 接线被拆掉时第 3 层自己红，不留"单测绿而生产不再调用"的空档。
 *
 * 关于第 3 层的一处夹具差异，说清楚别瞒着：真浏览器里监听器抛出的异常会被报给
 * `window.onerror`，`dispatchEvent` 照常返回；这里直接调用切出来的函数体，异常就落回调用处。
 * 所以这条用例的口径是"**错名字当场产生一次异常**"，异常最终落在派发栈还是控制台由浏览器决定。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scheduler } from '../src/engine/Scheduler.js';
import { AudioManager, SFX_NAMES } from '../src/audio/AudioManager.js';
import { run, notesOn, freshArm, disarmAudio } from './helpers/fakeAudio.js';

const SRC = join(process.cwd(), 'src');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.js') ? [full] : [];
  });
}

/** 只剥注释、保留字符串 —— 静态扫描的目标正是字符串字面量 */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** 行尾归一：本仓 src 是 CRLF、tests 是 LF，不归一的"不存在"门禁会关于空集说话 */
const eol = (source) => source.replace(/\r\n/g, '\n');

const FILES = walk(SRC);
/** 参与扫描的源码（已剥注释、已归一 EOL），带相对路径 */
const CODE = FILES.map((file) => ({
  rel: relative(SRC, file).replace(/\\/g, '/'),
  source: stripComments(eol(readFileSync(file, 'utf8'))),
}));

const protoFns = Object.getOwnPropertyNames(AudioManager.prototype)
  .filter((k) => k !== 'constructor' && typeof AudioManager.prototype[k] === 'function');

/**
 * 从 `src/core/Game.js` 切出真监听体。切片器有可能扫空或读错形状，
 * 那会让第 3 层关于空集说话 —— 所以每一步都先钉住"切到了唯一一条、且切全了"。
 */
function shippedSfxListenerBody() {
  const lines = eol(readFileSync(join(SRC, 'core/Game.js'), 'utf8')).split('\n');
  const starts = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => /'game-audio-sfx'/.test(line) && /\(e\)\s*=>\s*\{/.test(line));
  expect(starts.length, `Game.js 里 game-audio-sfx 的监听切到了 ${starts.length} 条，应为恰好 1 条`).toBe(1);
  const start = starts[0].i;
  expect(lines[start].trimEnd().endsWith('=> {'), '监听体不是多行花括号写法，切片器要跟着形状改').toBe(true);
  const end = lines.findIndex((l, i) => i > start && /^\s*\}\);/.test(l));
  expect(end, '没找到这条监听的收尾 —— 切片器读不动这段代码').toBeGreaterThan(start);
  return lines.slice(start + 1, end).join('\n');
}

/* ------------------------------------------------------------------ *
 * 一、名册 ↔ 实现（静态）
 * ------------------------------------------------------------------ */

/**
 * 名册条目的三种"被点到的写法"。引号三种拼法（' " `）都要认，`audio?.hit()` 的可选链也要认 ——
 * 少认一种拼法，"越界名单"就会放过用那种拼法写错的 name，而"每一格都有调用方"
 * 会把真派发点当成僵尸条目。这条口径由臂6（派发点抄错）与臂11（hit 走可选链的直接调用）验过。
 */
const Q = "['\"`]";
const callPatterns = (name) => [
  new RegExp(`\\bsfx:\\s*${Q}${name}${Q}`),
  new RegExp(`playSfx\\(\\s*${Q}${name}${Q}`),
  new RegExp(`\\baudio\\w*\\??\\.${name}\\s*\\(`),
];
const DISPATCH_RE = /\bsfx:\s*(['"`])([A-Za-z_$][\w$]*)\1/g;

describe('SFX_NAMES 与 AudioManager 的关系（B71 的名单侧）', () => {
  it('名册每一格在本类上真有一个同名方法', () => {
    for (const name of SFX_NAMES) {
      expect(typeof AudioManager.prototype[name],
        `SFX_NAMES 里有 "${name}"，但 AudioManager.prototype 上没有这个方法`).toBe('function');
    }
  });

  it('名册是冻结的、无重复的一张表', () => {
    expect(Object.isFrozen(SFX_NAMES), 'SFX_NAMES 被解冻了：运行时能往远程派发面里塞名字').toBe(true);
    expect(new Set(SFX_NAMES).size, `名册有重复条目：${SFX_NAMES.join('、')}`).toBe(SFX_NAMES.length);
    expect(SFX_NAMES.length).toBeGreaterThan(0);
  });

  it('名册不是方法名单的拷贝：有一批能打但不许远程点的音效', () => {
    // 这一条是"这张表带的是新信息"的证据。若哪天名册 == 方法名单，
    // 它就退化成方法名单的第二次抄写，而重复抄写正是 B71 的病根。
    expect(protoFns).toContain('hit');
    expect(SFX_NAMES).not.toContain('hit');
    expect(SFX_NAMES.length, '本类里除了名册那几格就没有别的方法了？那张表已退化成拷贝')
      .toBeLessThan(protoFns.length);
  });

  it("src/ 里每一处 sfx: '<字面量>' 都必须在名册里", () => {
    const offenders = [];
    const seen = [];
    for (const { rel, source } of CODE) {
      for (const m of source.matchAll(DISPATCH_RE)) {
        seen.push(`${rel}→${m[2]}`);
        if (!SFX_NAMES.includes(m[2])) offenders.push(`${rel} 派发 '${m[2]}'`);
      }
    }
    // reach guard：扫描至少真读到过派发点，否则"零越界"是关于空集的结论
    expect(seen.length, `src/ 里一处 sfx 字面量都没扫到（共 ${FILES.length} 个文件）—— 扫描本身失效了`)
      .toBeGreaterThan(0);
    expect(offenders, `越界音效名：${offenders.join('；')}`).toEqual([]);
  });

  it('名册每一格至少有一个调用方（派发字面量、playSfx 实参或直接 audio.<name>()）', () => {
    const missing = [];
    for (const name of SFX_NAMES) {
      const patterns = callPatterns(name);
      const hits = CODE.filter(({ source }) => patterns.some((re) => re.test(source)));
      if (!hits.length) missing.push(`${name}（0 个调用方）`);
    }
    expect(missing, `名册里有僵尸条目：${missing.join('；')} —— 删掉它，或者给它一个真派发点`).toEqual([]);
  });

  it('Game.js 那条静默兜底不许回来（typeof 探测已换成咽喉调用）', () => {
    const body = stripComments(eol(readFileSync(join(SRC, 'core/Game.js'), 'utf8')));
    expect(body, 'Game.js 又用 typeof 探测音效方法名了：那正是"抄错就安静没声音"的写法')
      .not.toMatch(/typeof\s+this\.audio\[/);
    expect(body).toMatch(/this\.audio\.playSfx\(/);
  });
});

/* ------------------------------------------------------------------ *
 * 二、咽喉的行为
 * ------------------------------------------------------------------ */

describe('playSfx 的两种下场：出声，或者抛错', () => {
  it('名册每一格播得出声：sfx 总线上真有音符', () => {
    for (const name of SFX_NAMES) {
      const { audio, ctx } = freshArm();
      audio.playSfx(name);
      run(ctx, 0.5);
      expect(notesOn(ctx, 'sfx').length, `playSfx('${name}') 之后 sfx 总线一个音都没有`).toBeGreaterThan(0);
    }
  });

  it('琶音是分时排开的，步距来自调用参数：roomClear 比 levelUp 排得紧', () => {
    // 只要求"三条音的时刻互不相同，且按各自 _arpeggio 的 step 拉开相对距离"，不手抄帧数。
    // step 被忽略（三条挤在同一帧）时"互不相同"先红；step 抄成同一个值时跨度比较红。
    const spanOf = (name) => {
      const { audio, ctx } = freshArm();
      audio.playSfx(name);
      run(ctx, 0.5);
      const at = notesOn(ctx, 'sfx').map((n) => n.at).sort((a, b) => a - b);
      expect(at.length, `${name} 不该是 ${at.length} 条音`).toBe(3);
      expect(new Set(at).size, `${name} 的三条音挤在同一时刻：step 没起作用`).toBe(3);
      return at[2] - at[0];
    };
    const clear = spanOf('roomClear');
    const up = spanOf('levelUp');
    expect(up, `levelUp 的跨度 ${up.toFixed(3)}s 不比 roomClear 的 ${clear.toFixed(3)}s 大 —— 两条 step 没分开`)
      .toBeGreaterThan(clear);
  });

  it('未知名字：当场抛错，且一个音不发、一个新待办都不排', () => {
    const { audio, ctx } = freshArm();
    const before = scheduler.pending;
    expect(() => audio.playSfx('doorOpend')).toThrow(/SFX_NAMES/);
    run(ctx, 0.5);
    expect(ctx.notes, '名字不对也发出了声音：咽喉没拦住').toHaveLength(0);
    expect(scheduler.pending, `未知名字另外排了 ${scheduler.pending - before} 个待办：抛错前已经动了调度器`)
      .toBe(before);
  });

  it('缺那一格（undefined / 空串）同样算抄错', () => {
    const { audio, ctx } = freshArm();
    expect(() => audio.playSfx(undefined)).toThrow(/SFX_NAMES/);
    expect(() => audio.playSfx('')).toThrow(/SFX_NAMES/);
    expect(() => audio.playSfx('RoomClear')).toThrow(/SFX_NAMES/);
    run(ctx, 0.5);
    expect(ctx.notes).toHaveLength(0);
  });

  it('名册是白名单，不是属性入口：constructor / __proto__ 一律拒', () => {
    const { audio, ctx } = freshArm();
    for (const name of ['constructor', '__proto__', 'toString', 'playTone']) {
      expect(() => audio.playSfx(name), `"${name}" 不在名册里，却过了咽喉`).toThrow(/SFX_NAMES/);
    }
    run(ctx, 0.5);
    expect(ctx.notes).toHaveLength(0);
  });

  it('抛错的信息说得出该补哪两处', () => {
    const { audio } = freshArm();
    let message = null;
    try {
      audio.playSfx('nope');
    } catch (err) {
      message = err.message;
    }
    expect(message, '未知名字没抛错').toContain('nope');
    expect(message, '报错只骂了名字，没告诉开发者要去补 AudioManager 与那张表').toContain('AudioManager');
  });
});

/* ------------------------------------------------------------------ *
 * 三、走真接线
 * ------------------------------------------------------------------ */

describe('Game.js 那一条监听：从事件到声音（B71 的接线侧）', () => {
  it('切出来的监听体真的过咽喉', () => {
    const body = shippedSfxListenerBody();
    expect(stripComments(body), `切到的函数体没调用 playSfx，第 3 层就在测我重写的那份：\n${body}`)
      .toMatch(/this\.audio\.playSfx\(/);
  });

  it('合法名字经真监听体走到 sfx 总线', () => {
    const { audio, ctx } = freshArm();
    const onSfxEvent = new Function('e', shippedSfxListenerBody());
    onSfxEvent.call({ audio }, { detail: { sfx: 'roomClear' } });
    run(ctx, 0.5);
    expect(notesOn(ctx, 'sfx').length, '真派发一个合法音效名，sfx 总线却是空的').toBe(3);
  });

  it('抄错的名字经真监听体派发：抛错给开发者，而不是安静地没声音', () => {
    const { audio, ctx } = freshArm();
    const onSfxEvent = new Function('e', shippedSfxListenerBody());
    expect(() => onSfxEvent.call({ audio }, { detail: { sfx: 'doorOpend' } })).toThrow(/SFX_NAMES/);
    expect(() => onSfxEvent.call({ audio }, { detail: {} })).toThrow(/SFX_NAMES/);
    run(ctx, 0.5);
    expect(ctx.notes).toHaveLength(0);
  });
});

afterEach(() => {
  disarmAudio();
});
