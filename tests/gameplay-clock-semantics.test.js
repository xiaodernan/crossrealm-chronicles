/**
 * 玩法侧墙钟的语义门禁（W-A1 切片8 —— 把 B118② 那七处逐处判完）。
 *
 * ## 这一片为什么和切片7 分开
 *
 * 切片7（`1c28fb5`）修的是**视觉相位**：那些东西挂墙钟只是"错了支钟"，改掉就完事。
 * 切片7 登记下来的另外七处不是这一类 —— 每一处都要先回答"它量的到底是真实时间还是世界时间"，
 * 答错了就是把一条对的行为改坏。所以那七处的处置由本片给出，判据全部来自探针实测
 * （`.tmp-20261015/probe-b118-2.mjs`），不是推理：
 *
 * 1. `combat/BossStateMachine.js` 的 `TIME_ELAPSED` —— 改世界时。探针 P1：定帧 1 秒 × 60 帧
 *    之后墙钟走了 1000 ms，而世界里只过了 80 ms；按墙钟判的"10 秒进二阶段"会在
 *    真实 10 秒（世界里 0.8 秒）就开，暂停菜单开一分钟更是当场把闸门推满。
 * 2. `game/DungeonRunTracker.js` 的「用时」—— 改世界时。探针 P2：进副本后真实 70 秒、
 *    其中 60 秒是暂停（`update` 一帧没喂），日志却写「Ch1 · 70s · 1 房」。这一行是
 *    玩家看得见的假账。
 * 3. `game/CombatStyleTracker.js` 的 `lastEvent` —— 删。探针 P3 数出来的：写两处、读零处。
 *    连招窗口真正的账是 `decayTimer`，它本来就由世界 dt 推进。留着那格不是"另一种时钟"，
 *    是"看起来像时钟而没人看的字段"。
 * 4. 过场那三处（`CombatCameraDirector` 及其两个读者）—— **留墙钟**。理由不是"玩家等得起"
 *    这种说法，而是配对：那一段演出每帧吃 `rawDt`（`Game.update` 里 `combatCamera.update(rawDt)`），
 *    锁本来就该和它同支钟；把锁单独改成世界 dt 才是让它和它守的东西分家。这条配对由下面的腿钉住。
 *
 * ## 每条腿各自的盲区（所以判据成排）
 *
 * - 三档读数看得见"吃了墙钟"，看不见"根本没被喂" —— 接线由结构腿管；
 * - 结构腿看得见那一行还在 `if (playing)` 里，看不见那行的参数被换成 `rawDt` —— 所以断言吃的是 `dt`；
 * - 死账普查看得见"存进字段却没人读"，看不见"存进局部变量"（那种读者在同一函数作用域里，
 *   跨文件数字典会误报）—— 这一条限度写在这里，不假装覆盖。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { emit } from '../src/engine/EventBus.js';
import { DungeonRunTracker } from '../src/game/DungeonRunTracker.js';
import { BossStateMachine, PhaseTransitionCondition } from '../src/combat/BossStateMachine.js';

const SRC = join(process.cwd(), 'src');
const 每帧毫秒 = 1000 / 60;

/* ---------------------------------------------------------------- 尺子 */

/**
 * 把 `performance.now` 换成一支"每帧被 harness 拨 16.667 ms"的假墙钟。
 *
 * 为什么非要换：三档里的 B 档（60 帧、dt=0）在单测里只花几毫秒真实时间。不喂一支会走的墙钟，
 * 「改回用墙钟起算」这种坏形状在 B 档根本读不出差别 —— 那条腿就成了永远绿的空腿。
 * 用 descriptor 存取：node 的 `now` 挂在 `Performance.prototype` 上，直接赋值会留下一层
 * own property 遮住它。
 */
let 假墙钟 = 0;
let 钟的原样 = null;
function 架钟() {
  const p = globalThis.performance;
  钟的原样 = Object.getOwnPropertyDescriptor(p, 'now') ?? { 在原型上: true };
  p.now = () => 假墙钟;
}
function 拆钟() {
  const p = globalThis.performance;
  if (钟的原样.在原型上) delete p.now;
  else Object.defineProperty(p, 'now', 钟的原样);
  钟的原样 = null;
}

/** 走 `帧数` 帧：墙钟每帧 +16.667 ms（屏幕一直在刷新），世界只推进 `每帧` 那么多。
 *  被驱动的口子认两种形状 —— 视觉/玩法系统对外是 `update(dt)`，Boss 状态机是 `tick(dt)`。 */
function 走帧(系统, 帧数, 每帧) {
  const 步 = 系统.update ?? 系统.tick;
  for (let i = 0; i < 帧数; i += 1) {
    假墙钟 += 每帧毫秒;
    步.call(系统, 每帧);
  }
}

/** 暂停：墙钟照走，`update` 一帧都不喂 —— 这正是 `Game.update` 里 `if (playing)` 的语义 */
function 暂停(秒) {
  const 帧 = Math.round(秒 * 60);
  for (let i = 0; i < 帧; i += 1) 假墙钟 += 每帧毫秒;
}

/* ---------------------------------------------------------------- 夹具 */

const 副本id = 'sunken-chapel';

function 建副本记录器() {
  const game = {
    quests: { chapter: 1 },
    dungeons: { dungeons: new Map([[副本id, { def: { name: '沉没小教堂' } }]]) },
  };
  return new DungeonRunTracker(game);
}

function 建状态机(秒 = 10) {
  const boss = { bossId: 't', name: '测试 Boss', hp: 100, maxHp: 100, onPhaseEnter() {}, onPhaseLeave() {} };
  const sm = new BossStateMachine(boss);
  sm.registerTransitionCondition(2, { type: PhaseTransitionCondition.TIME_ELAPSED, seconds: 秒 });
  return sm;
}

/** 只用来给代码扫描腿取源码；注释与字符串剥掉，免得把散文里的例子当成代码 */
function stripNonCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

function 码(相对路径) {
  return stripNonCode(readFileSync(join(process.cwd(), 相对路径), 'utf8'));
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** `标记` 之后第一个 `{` 到与之配对的 `}` —— 返回 [起, 止) 字符下标；找到多个就全给 */
function 块范围(源, 标记) {
  const 出 = [];
  let i = 源.indexOf(标记);
  while (i >= 0) {
    const 开 = 源.indexOf('{', i);
    if (开 < 0) break;
    let 深 = 0;
    let j = 开;
    for (; j < 源.length; j += 1) {
      if (源[j] === '{') 深 += 1;
      else if (源[j] === '}') {
        深 -= 1;
        if (深 === 0) break;
      }
    }
    出.push([开, j]);
    i = 源.indexOf(标记, j + 1);
  }
  return 出;
}

/** 某字段的全仓「使用」：出现次数减去纯写入的次数（写入 = 赋值左侧 / 对象字面量的键） */
function 读者数(字段, 排除写入 = true) {
  let 现 = 0;
  let 写 = 0;
  for (const file of walk(SRC)) {
    const 源 = stripNonCode(readFileSync(file, 'utf8'));
    for (const m of 源.matchAll(new RegExp(`(?<![\\w])${字段}(?![\\w$])`, 'g'))) {
      现 += 1;
      const 前 = 源.slice(Math.max(0, m.index - 40), m.index);
      if (排除写入 && (/\bthis\s*\.\s*$/.test(前) ? /\s*=(?!=)/.test(源.slice(m.index + 字段.length, m.index + 字段.length + 6)) : false)) 写 += 1;
      else if (排除写入 && /[{,]\s*$/.test(前) && /\s*:(?!:)/.test(源.slice(m.index + 字段.length, m.index + 字段.length + 6))) 写 += 1;
    }
  }
  return { 现, 写, 读: 现 - 写 };
}

/* ---------------------------------------------------------------- 三档：副本用时 */

describe('副本「用时」吃世界时（B118② 第 2 处）', () => {
  let 记录器 = null;

  beforeEach(() => {
    假墙钟 = 0;
    架钟();
    globalThis.window = new EventTarget();
    记录器 = 建副本记录器();
  });

  afterEach(() => {
    记录器.dispose();
    拆钟();
    globalThis.window = undefined;
  });

  /** 走 `帧数` 帧后把本次通关记下来，返回日志里那一格的秒数 */
  function 一次通关(帧数, 每帧) {
    emit('dungeon-enter', { id: 副本id, name: '沉没小教堂', rooms: 1, doors: 1, rerun: false });
    走帧(记录器, 帧数, 每帧);
    const 世界秒 = 记录器.activeRun.秒;
    emit('dungeon-cleared', { id: 副本id });
    return { 世界秒, 日志: 记录器.runs[0].elapsed };
  }

  it('A 档（60 帧 × dt=1/60）：世界一秒 ⇒ 用时记 1 秒', () => {
    const r = 一次通关(60, 1 / 60);
    expect(r.世界秒, '世界时没走账 = update(dt) 根本没推进台账').toBeGreaterThan(0.9);
    expect(r.日志).toBe(1);
  });

  it('B 档（60 帧 × dt=0，真实 1 秒）：世界没走 ⇒ 用时必须恰好 0', () => {
    const r = 一次通关(60, 0);
    expect(r.世界秒, '定帧期间还在走账 = 又回到了墙钟').toBe(0);
    expect(r.日志).toBe(0);
  });

  it('C 档（0.08 倍时标 × 60 帧）：只有 A 档的 2 %~30 %', () => {
    const a = 一次通关(60, 1 / 60).世界秒;
    const c = 一次通关(60, 0.08 / 60).世界秒;
    expect(c / a, '时标既不作用于用时、也没被按世界时折算').toBeGreaterThanOrEqual(0.02);
    expect(c / a).toBeLessThanOrEqual(0.3);
  });

  it('暂停 60 秒不计入用时：真实 61 秒的局记 1 秒（修前记 61）', () => {
    emit('dungeon-enter', { id: 副本id, name: '沉没小教堂', rooms: 1, doors: 1, rerun: false });
    走帧(记录器, 60, 1 / 60);
    暂停(60);
    emit('dungeon-cleared', { id: 副本id });
    expect(假墙钟 / 1000, '尺子本身要真的走过那 60 秒，否则这条腿什么都没量').toBeCloseTo(61, 6);
    expect(记录器.runs[0].elapsed, '日志那一行把开着菜单的时间也算进来了（探针 P2 的 70s 事故）').toBe(1);
  });

  it('反向对照：同一把尺子量"墙钟起算"的旧形状，B 档必须读出 ~1 秒', () => {
    /* 这一条不改生产码，它量的是**这套夹具本身有没有眼睛**：
     * 如果把墙钟的 stub 接断了，上面那三条 B 档腿会一起变成永真 —— 这条对照先红给我看。 */
    const 旧 = {
      start: 0,
      enter() { this.start = performance.now(); },
      update() {},
      用时() { return (performance.now() - this.start) / 1000; },
    };
    旧.enter();
    走帧(旧, 60, 0);
    expect(旧.用时(), '假墙钟没在走：B 档腿是空腿').toBeGreaterThan(0.9);
  });

  it('房间数与用时各记各的：rooms 仍由事件累加（改动没顺手动另一格）', () => {
    emit('dungeon-enter', { id: 副本id, name: '沉没小教堂', rooms: 1, doors: 1, rerun: false });
    emit('dungeon-room-enter', { roomId: 'r1' });
    emit('dungeon-room-enter', { roomId: 'r2' });
    走帧(记录器, 60, 1 / 60);
    emit('dungeon-cleared', { id: 副本id });
    expect(记录器.runs[0].rooms).toBe(2);
    expect(记录器.runs[0].elapsed).toBe(1);   // 世界一秒，与房间数互不干扰
  });

  it('存档里的 time 仍然是真实时刻：那是时间戳，不是时长', () => {
    const 起 = Date.now();
    emit('dungeon-enter', { id: 副本id, name: '沉没小教堂', rooms: 1, doors: 1, rerun: false });
    走帧(记录器, 60, 1 / 60);
    emit('dungeon-cleared', { id: 副本id });
    const 记 = 记录器.runs[0].time;
    expect(记, 'time 被改成世界时台账 = 存档里的"什么时候通的"不再可信').toBeGreaterThanOrEqual(起);
    expect(记 - 起).toBeLessThan(60_000);
  });
});

/* ---------------------------------------------------------------- 接线（结构腿） */

describe('副本用时的喂入口：只有一处，且吃世界 dt、在 playing 闸内', () => {
  const 游戏 = 码('src/core/Game.js');
  const 驱动 = [...游戏.matchAll(/this\.dungeonRuns\s*\?\.\s*update\(\s*([^)]*)\)/g)];

  it('Game.update 里确实喂了这一口（不然用时永远是 0，行为腿测不出来）', () => {
    expect(驱动.length, 'src/core/Game.js 里没有 this.dungeonRuns?.update(...) 这一行').toBe(1);
  });

  it('喂的是世界 dt 而不是 rawDt（真实时间的暂停会把用时重新拉长）', () => {
    const 参数 = 驱动[0]?.[1].trim();
    expect(参数, `dungeonRuns.update(${参数})：这一口吃的是 ${参数}，用时又要计入暂停了`).toBe('dt');
  });

  it('这一行落在 playing 的守卫块里（暂停/过场/开着面板都不该走账）', () => {
    const 位 = 游戏.indexOf('this.dungeonRuns?.update(');
    const 块 = 块范围(游戏, 'if (playing)');
    expect(块.length, '找不到 if (playing) 守卫块 —— 判据失效，别信这条腿').toBeGreaterThan(0);
    expect(块.some(([起, 止]) => 位 > 起 && 位 < 止),
      'dungeonRuns.update 被挪出了 playing 块：暂停期间重新开始走账').toBe(true);
  });

  it('全仓只有这一处驱动它（第二个时钟就是第二个真相）', () => {
    const 第二处 = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      const n = (stripNonCode(readFileSync(file, 'utf8')).match(/dungeonRuns\s*\?\.\s*update\s*\(/g) ?? []).length;
      if (n > 0) 第二处.push(`${rel}×${n}`);
    }
    expect(第二处, '驱动点不止一处').toEqual(['core/Game.js×1']);
  });
});

/* ---------------------------------------------------------------- Boss 阶段闸门 */

describe('Boss 的 TIME_ELAPSED 闸门吃世界时（B118② 第 1 处）', () => {
  beforeEach(() => {
    假墙钟 = 0;
    架钟();
    globalThis.window = { dispatchEvent: () => true };
  });
  afterEach(() => {
    拆钟();
    globalThis.window = undefined;
  });

  /* 三档的窗口都取"真实/世界 15 秒"，闸门设在 10 秒。首轮量测时窗口正好压在 10 秒，
   * 于是 B 档对"墙钟版"的判定取决于 `600 × (1000/60)` 落在 9999.999999999995 还是 …0002 ——
   * 那条腿的成败由浮点尾数决定，等于没有腿（臂「阶段闸门改回墙钟」当场量出来：B/C 全绿）。
   * 留出余量之后，墙钟版在 B/C 档必然越过 10 秒闸门 ⇒ 两条都红。 */

  it('A 档：世界 15 秒 ⇒ 10 秒的闸门开', () => {
    const sm = 建状态机(10);
    走帧(sm, 900, 1 / 60);
    expect(sm.phaseElapsed).toBeCloseTo(15, 6);
    expect(sm.checkTransition(2), '世界时都走满了还不判开 = 台账没被 tick 推进').toBe(true);
  });

  it('B 档：真实 15 秒、世界 0 秒 ⇒ 闸门不开（暂停不再替 Boss 读条）', () => {
    const sm = 建状态机(10);
    走帧(sm, 900, 0);
    expect(假墙钟 / 1000, '假墙钟没走：这条腿什么都没量').toBeGreaterThan(14);
    expect(sm.phaseElapsed, '定帧/暂停期间闸门继续走 = 又是墙钟').toBe(0);
    expect(sm.checkTransition(2)).toBe(false);
  });

  it('C 档：0.08 倍时标下真实 15 秒只算世界 1.2 秒', () => {
    const sm = 建状态机(10);
    走帧(sm, 900, 0.08 / 60);
    expect(sm.phaseElapsed).toBeCloseTo(1.2, 6);
    expect(sm.checkTransition(2), '慢动作里提前开门 = 定帧把阶段闸门推着走').toBe(false);
  });

  it('进新阶段清零：二阶段的时长不会从一阶段继承', () => {
    const sm = 建状态机(10);
    走帧(sm, 900, 1 / 60);
    sm.transitionTo(2);
    expect(sm.phaseElapsed, '不清零 = 三阶段闸门带着 15 秒余额当场成立').toBe(0);
  });

  it('驱动点唯一且吃世界 dt：Boss.update 里 this.sm.tick(dt)', () => {
    const boss = 码('src/combat/Boss.js');
    const 处 = [...boss.matchAll(/this\.sm\.tick\(\s*([^)]*)\)/g)];
    expect(处.length, 'Boss.js 里没有（或不止一处）this.sm.tick(...)').toBe(1);
    expect(处[0][1].trim(), '阶段台账吃错了钟').toBe('dt');
    /* 记账必须落在 update(dt, …) 这个方法体里：放到别处（比如墙钟回调）就又脱开了世界时 */
    const 方法 = 块范围(boss, 'update(dt');
    expect(方法.length, '找不到 Boss.update(dt 的方法体').toBeGreaterThan(0);
    const 位 = boss.indexOf('this.sm.tick(');
    expect(方法.some(([起, 止]) => 位 > 起 && 位 < 止), 'this.sm.tick(dt) 不在 Boss.update 里').toBe(true);
  });

  it('状态机自己不再读墙钟，台账由 dt 积分出来', () => {
    const 源 = 码('src/combat/BossStateMachine.js');
    expect(/performance\.now\s*\(/.test(源), 'BossStateMachine 又去读墙钟了（B118②）').toBe(false);
    expect(/this\.phaseElapsed\s*\+=\s*dt/.test(源), 'tick 不再积分 dt —— 那条腿只是看起来在走').toBe(true);
    const 切 = 块范围(源, 'transitionTo(phase)');
    expect(切.length, '找不到 transitionTo 的方法体').toBeGreaterThan(0);
    const [起, 止] = 切[0];
    expect(/this\.phaseElapsed\s*=\s*0/.test(源.slice(起, 止)), 'transitionTo 不清零台账').toBe(true);
  });
});

/* ---------------------------------------------------------------- 风格积分：删掉的是死账 */

describe('战斗风格积分不再养一格没人读的墙钟（B118② 第 3 处）', () => {
  const 源 = 码('src/game/CombatStyleTracker.js');

  it('lastEvent 整个不在了：它写两处、读零处（探针 P3）', () => {
    expect(/lastEvent/.test(源), 'CombatStyleTracker 里还有 lastEvent —— 那一格没有任何读者').toBe(false);
    expect(/performance\.now\s*\(/.test(源), '连招窗口重新吃上墙钟，而它真正由 decayTimer（世界 dt）驱动').toBe(false);
  });

  it('连招衰减仍然只有一条账：decayTimer 由 update(dt) 推进', () => {
    expect(/this\.decayTimer\s*-=\s*dt/.test(源), '衰减不再按世界时走').toBe(true);
  });
});

/* ---------------------------------------------------------------- 死账普查（覆盖全仓的新形状） */

describe('凡把墙钟存进字段/键的，那一格必须有读者（死账普查）', () => {
  /** 收集"存进字段"的形状：`this.X = performance.now() …` 与 `{ X: performance.now() }` */
  function 存储名册() {
    const 出 = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      const 源 = stripNonCode(readFileSync(file, 'utf8'));
      for (const m of 源.matchAll(/\bthis\s*\.\s*([\w$]+)\s*=\s*performance\.now\s*\(/g)) 出.push({ rel, 字段: m[1] });
      for (const m of 源.matchAll(/([{,]\s*)([\w$]+)\s*:\s*performance\.now\s*\(/g)) 出.push({ rel, 字段: m[2] });
    }
    return 出;
  }

  const 名册 = 存储名册();

  it('普查真的扫到了东西：今天至少有一处把墙钟存进字段（扫描本身没瞎）', () => {
    expect(名册.length, '一处都没扫到 —— 要么正则坏了，要么这一片该整条删掉').toBeGreaterThan(0);
    expect(名册.map((r) => r.字段), '过场锁输入的截止时间必须在这张表里').toContain('blocksInputUntil');
  });

  it('每一格都有读者：没有读者的墙钟字段就是 B118② 里 lastEvent 那种死账', () => {
    for (const { rel, 字段 } of 名册) {
      const { 现, 写, 读 } = 读者数(字段);
      expect(读, `${rel} 把 performance.now() 存进 ${字段}（共 ${现} 次出现、${写} 次写入），却没有任何读者`).toBeGreaterThan(0);
    }
  });
});

/* ---------------------------------------------------------------- 演出↔锁 同钟配对 */

describe('过场锁输入留墙钟的前提：它守的那段演出也走真实时（B118② 第 4 处）', () => {
  const 游戏 = 码('src/core/Game.js');
  const 导演 = 码('src/cinematic/CombatCameraDirector.js');

  it('两端现在都在真实时间上（这一行是"今天选了哪一档"的登记）', () => {
    expect(/this\.combatCamera\.update\(\s*rawDt\s*\)/.test(游戏), '过场演出不再每帧吃 rawDt —— 配对腿的前提变了').toBe(true);
    expect(/this\.blocksInputUntil\s*=\s*performance\.now\(\)/.test(导演), '锁的截止时间不再由墙钟起算 —— 配对腿的前提变了').toBe(true);
  });

  it('配对不许单边改：演出与锁必须同一支钟', () => {
    const 演出走真实时 = /this\.combatCamera\.update\(\s*rawDt\s*\)/.test(游戏);
    const 演出走世界时 = /this\.combatCamera\.update\(\s*dt\s*\)/.test(游戏);
    const 锁走墙钟 = /performance\.now\s*\(\s*\)\s*<\s*this\.blocksInputUntil/.test(导演);
    expect(演出走真实时 && 锁走墙钟 || 演出走世界时 && !锁走墙钟,
      `演出=${演出走真实时 ? 'rawDt' : 演出走世界时 ? 'dt' : '未知'} / 锁=${锁走墙钟 ? '墙钟' : '世界时'}：单边改钟会让锁住的毫秒数和它守的那段镜头不同速（B118② 判定：留墙钟的前提是配对）`).toBe(true);
  });

  it('锁的读数只有一处判据：三个读者都问同一个截止时间', () => {
    const 读者 = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      const n = (stripNonCode(readFileSync(file, 'utf8')).match(/blocksInputUntil/g) ?? []).length;
      if (n > 0) 读者.push(`${rel}×${n}`);
    }
    expect(读者.sort(), '截止时间被第四处另起一份 = 又有了第二个真相').toEqual([
      'cinematic/CombatCameraDirector.js×4',
      'cinematic/CombatCameraDirectorExtensions.js×2',
      'cinematic/CombatCinematicSkip.js×1',
    ]);
  });
});
