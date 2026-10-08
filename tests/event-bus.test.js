import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { installWindowShim } from './helpers/enemyHarness.js';
import { on, emit, offAll, listenerCount, UNGROUPED } from '../src/engine/EventBus.js';
import { GAME_EVENTS } from '../src/engine/events.js';
import { STAT_EVENTS } from '../src/content/objectives.js';

/**
 * 事件总线与监听器注销（B44 剩下的另一半）。
 *
 * 切片5 把"名字"收进了登记表，但**注销能力仍然是零**：`src/` 里 151 处游戏事件监听，
 * 对应 0 处游戏事件的 `removeEventListener`。本片给出 `on()/emit()/offAll(tag)`，
 * 并把最重的一个监听方（`ui/HUD.js`，20 处）整体迁过去当作样板 —— 它的 `dispose()`
 * 从前只退订观测量，注释写着"不在这里重演无一处注销"，那句话当时并不成立。
 *
 * 三件事被分别钉住：
 *  ① 总线自己的行为（未登记名抛错、payload:null 的抛错、按 tag 整体注销、退订函数、同 handler 去重）；
 *  ② **裸 `window.addEventListener('<游戏事件>')` 的逐文件台账**：只许收缩，
 *     新增一位点、或某个文件多了一处，都当场变红（存量 39 文件 129 处是一笔明账（原 40 文件 131 处，CombatCinematicSkip 于 2026-10-08 整文件迁完），不是白名单豁免）；
 *  ③ 用 `on()` 的文件必须同时用 `offAll()` —— 打了 tag 却不注销，比不打 tag 更糟，
 *     因为它让"有注销路径"变成一个假象。
 */

const SRC = join(process.cwd(), 'src');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** 从 `(` 处读到配对右括号，返回括号内原文 */
function innerOf(code, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < code.length; i += 1) {
    const c = code[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return code.slice(openIdx + 1, i);
    }
  }
  return null;
}

/** 顶层参数个数（字符串、数组、对象字面量里的逗号不算分隔） */
function argCount(inner) {
  let depth = 0;
  let quote = null;
  let n = inner.trim() === '' ? 0 : 1;
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (c === ',' && depth === 0) n += 1;
  }
  return n;
}

const readSrc = (rel) => readFileSync(join(SRC, rel), 'utf8');

/* ————— ② 的台账：存量裸监听逐文件计数 —————
 * 这份清单是**欠账表**，不是豁免名单：每迁走一处就要把数字改小、整文件迁完就删掉那一行。
 * 想加一处裸监听，就得先在这里给它记一笔 —— 而记这笔的动作本身就是显式的坏消息。 */
const BARE_WINDOW_LISTENERS = {
  'audio/AudioManager.js': 1,
  'cinematic/CinematicManager.js': 1,
  'cinematic/CombatCameraDirector.js': 3,
  // 'cinematic/CombatCinematicSkip.js': 2  ← 已迁完（2026-10-08）：两条监听走
  //   `on(…, 'combat-cinematic-skip')`，`dispose()` 里 `offAll` 一并清掉待办计时。
  //   这一行**删掉**而不是改成 0 —— 台账的口径是"整文件迁完就删行"。
  'cinematic/EndCreditsDirector.js': 1,
  'cinematic/RestSceneDirector.js': 3,
  // core/Game.js: 13  ← 已迁完（2026-10-08）：13 处游戏事件走 gameOn()（= on(name, handler, 'core/Game')），
  //   Game.dispose() 里 offAll(GAME_EVENT_TAG) 一次结清。文件里仍留 3 处 window.addEventListener
  //   （resize / keydown / keyup）—— 那是 DOM 事件，不在本台账的口径内。
  'effects/AmbientScenePass.js': 1,
  'effects/ExecutionEffects.js': 3,
  'effects/PopCultureTriadVisualPass.js': 1,
  'effects/RealmBleed.js': 1,
  'effects/UpsideDownVisualPass.js': 1,
  'effects/ZoneTransitionFX.js': 1,
  'game/AchievementSystem.js': 8,
  'game/AchievementSystemExtras.js': 6,
  'game/CampfireMemorySystem.js': 2,
  'game/CgGalleryAchievements.js': 1,
  'game/CgGallerySystem.js': 7,
  'game/CgGallerySystemExtras.js': 5,
  'game/CombatStyleTracker.js': 5,
  'game/CombatTutorialDirector.js': 3,
  'game/DeathHintDirector.js': 1,
  'game/DungeonRunTracker.js': 3,
  'game/ExplorationMap.js': 2,
  'game/LoreCodexSystem.js': 6,
  'game/PopCultureAchievementExtras.js': 1,
  'game/PopCultureCombatBarks.js': 1,
  'game/PopCultureEchoSystem.js': 2,
  'game/QuestSystem.js': 10,
  'game/SoulStreakSystem.js': 2,
  'game/StoryDirector.js': 3,
  'game/StoryJournal.js': 4,
  'ui/BossPhaseDirector.js': 3,
  'ui/CombatSessionStats.js': 5,
  'ui/CombatStyleOverlay.js': 1,
  'ui/ContextualTutorial.js': 6,
  'world/BossRematchDirector.js': 1,
  'world/DungeonManager.js': 3,
  'world/RestNpcAnimDirector.js': 5,
  'world/RestNpcManager.js': 3,
};

/**
 * 表驱动的裸监听：源文件里只有**一个** `window.addEventListener(name, …)` 调用点，
 * `name` 是变量，运行时按名字表逐条挂上「表长」那么多条。
 *
 * 为什么要在台账外单独记这一笔：下面的扫描器认的是**字面量事件名**，所以 W-B3 切片2
 * 把 `QuestSystem` 那十段抄本并成一个循环之后，逐字面量的扫描会把这个文件从 10 记成 0 ——
 * 于是「欠账 131 → 121」看起来像迁走了一批，而**注销路径一条也没多出来**（这文件依旧
 * 没有 dispose 时的 removeEventListener）。债没消失，只是从扫描器眼前消失了，
 * 所以这里按运行时条数把债原样记回来，条数从生产表 `STAT_EVENTS` 自己数，不手抄。
 */
const TABLE_DRIVEN_BARE = [
  // `names` 从生产表自己数（不手抄清单），`table` 是源锚点：那个文件必须被看见在遍历它
  { file: 'game/QuestSystem.js', table: 'STAT_EVENTS', names: Object.keys(STAT_EVENTS) },
];

const scan = () => {
  const bare = {};
  const busUsers = new Map(); // file -> { on: n, offAll: n, untagged: [] }
  for (const abs of walk(SRC)) {
    const rel = relative(SRC, abs).replace(/\\/g, '/');
    if (rel === 'engine/EventBus.js' || rel === 'engine/events.js') continue;
    const code = stripComments(readFileSync(abs, 'utf8'));
    for (const m of code.matchAll(/window\.addEventListener\(\s*'([a-z0-9-]+)'/g)) {
      if (m[1] in GAME_EVENTS) bare[rel] = (bare[rel] ?? 0) + 1;
    }
    for (const t of TABLE_DRIVEN_BARE) {
      if (t.file === rel) bare[rel] = (bare[rel] ?? 0) + t.names.length;
    }
    const onSites = [...code.matchAll(/(?:^|[^\w.])on\(\s*['"][a-z0-9-]+['"]/g)];
    const offAllSites = [...code.matchAll(/(?:^|[^\w.])offAll\(/g)];
    if (!onSites.length && !offAllSites.length) continue;
    const untagged = [];
    for (const m of onSites) {
      // m[0] 里已经含住了 `(`，位点要按它在这一段里的实际位置算
      const openIdx = m.index + m[0].indexOf('(');
      if (argCount(innerOf(code, openIdx) ?? '') < 3) untagged.push(rel);
    }
    busUsers.set(rel, { on: onSites.length, offAll: offAllSites.length, untagged });
  }
  return { bare, busUsers };
};

const { bare, busUsers } = scan();

/* ————— ① 的夹具：一个只有监听的假系统 ————— */
const FIXTURE_TAG = 'probe/fixture';

describe('EventBus 行为', () => {
  beforeAll(() => {
    installWindowShim();
  });

  /* 每条用例自己收账：`offAll` 的返回值就是"这次真撤掉了几条"，
   * 上一条用例残留的监听会让它凭空多一，断言会假红 —— 所以先清场。 */
  beforeEach(() => {
    offAll(FIXTURE_TAG);
  });

  it('on() 挂上去、emit() 打下来，回调拿到的是同一个 CustomEvent', () => {
    const seen = [];
    on('zone-changed', (e) => seen.push(e.detail.zoneId), FIXTURE_TAG);
    emit('zone-changed', { zone: {}, zoneId: 'hub', initial: true });
    expect(seen).toEqual(['hub']);
  });

  it('未登记的事件名：挂监听和派发都当场抛错（这就是那张登记表的运行期咽喉）', () => {
    expect(() => on('zone-change', () => {}, FIXTURE_TAG)).toThrow(/不在事件登记表里/);
    expect(() => emit('dungeon-room-clear')).toThrow(/不在事件登记表里/);
    expect(() => on(undefined, () => {}, FIXTURE_TAG)).toThrow(/不在事件登记表里/);
  });

  it('登记表标成纯信号的事件，带 detail 派发会抛错', () => {
    expect(GAME_EVENTS['combo-finisher'].payload).toBe(null);
    expect(() => emit('combo-finisher', { count: 3 })).toThrow(/纯信号/);
    expect(() => emit('combo-finisher')).not.toThrow();
  });

  it('offAll(tag) 一次撤掉该所有权下的全部监听，且幂等', () => {
    let hits = 0;
    on('enemy-defeated', () => { hits += 1; }, FIXTURE_TAG);
    on('boss-start', () => { hits += 1; }, FIXTURE_TAG);
    expect(listenerCount(FIXTURE_TAG)).toBe(2);
    emit('enemy-defeated');
    expect(hits).toBe(1);
    expect(offAll(FIXTURE_TAG)).toBe(2);
    expect(listenerCount(FIXTURE_TAG)).toBe(0);
    emit('enemy-defeated');
    expect(hits).toBe(1); // 注销之后真的不再被叫醒
    expect(offAll(FIXTURE_TAG)).toBe(0); // 第二次没有东西可撤
  });

  it('on() 返回的退订函数能单独摘掉一条，其余不受影响', () => {
    const fired = [];
    const offFirst = on('journal-updated', () => fired.push('a'), FIXTURE_TAG);
    on('journal-updated', () => fired.push('b'), FIXTURE_TAG);
    offFirst();
    emit('journal-updated');
    expect(fired).toEqual(['b']);
    expect(offFirst()).toBe(false); // 已经摘过的不会假装又摘了一次
    offAll(FIXTURE_TAG);
  });

  it('同一 tag 下重复注册同一个 handler 只算一条（与 DOM 自己的去重一致，账本不能虚报）', () => {
    const handler = () => {};
    const offA = on('soul-wisp-collected', handler, FIXTURE_TAG);
    on('soul-wisp-collected', handler, FIXTURE_TAG);
    expect(listenerCount(FIXTURE_TAG)).toBe(1);
    expect(offAll(FIXTURE_TAG)).toBe(1);
    expect(offA()).toBe(false);
  });

  it('参数校验：handler 必须是函数、tag 必须是非空字符串', () => {
    expect(() => on('zone-changed', null, FIXTURE_TAG)).toThrow(/必须是函数/);
    expect(() => on('zone-changed', () => {}, '')).toThrow(/非空字符串/);
    expect(() => on('zone-changed', () => {}, null)).toThrow(/非空字符串/);
  });

  it('没有 window（node 直跑、构建期预演）时 emit 返回 false 而不是抛错', () => {
    const saved = globalThis.window;
    delete globalThis.window;
    try {
      expect(emit('zone-changed', { zone: {}, zoneId: 'hub' })).toBe(false);
    } finally {
      globalThis.window = saved;
    }
  });

  afterAll(() => {
    offAll(FIXTURE_TAG);
    globalThis.window = undefined;
  });
});

describe('监听注销门禁（B44 剩余半区）', () => {
  it('裸 window 游戏事件监听逐文件台账：只许收缩，改动必须显式记一笔', () => {
    expect(bare).toEqual(BARE_WINDOW_LISTENERS);
  });

  it('表驱动那一笔不是白记的：文件真的在遍历那张表挂监听，条数=运行时监听数', () => {
    for (const t of TABLE_DRIVEN_BARE) {
      const code = stripComments(readSrc(t.file));
      // ① 源锚点：一个变量名的调用点，且它遍历的就是记账所依据的那张名字表
      const loopSites = [...code.matchAll(/window\.addEventListener\(\s*(?!['"])/g)];
      expect(loopSites.length, `${t.file} 没有变量名的 addEventListener 调用点：这一格该从 TABLE_DRIVEN_BARE 删掉`).toBe(1);
      expect(code.includes(`Object.keys(${t.table})`), `${t.file} 的循环不是在遍历 ${t.table}，那 names 那格数的就不是它挂的监听`).toBe(true);
      // ② 名字必须是登记过的游戏事件：表里混进一个未登记名，这里就会虚记一笔债
      for (const name of t.names) expect(name in GAME_EVENTS, `${t.table} 里的 ${name} 不在事件登记表`).toBe(true);
      // ③ 台账那一格 = 字面量调用点 + 表驱动条数（少一层等于把债记丢了）
      const literal = [...code.matchAll(/window\.addEventListener\(\s*'([a-z0-9-]+)'/g)]
        .filter((m) => m[1] in GAME_EVENTS).length;
      expect(bare[t.file], `${t.file}：台账应等于 字面量 ${literal} + 表驱动 ${t.names.length}`).toBe(literal + t.names.length);
    }
  });

  it('台账确实在覆盖当前源码树（不是扫了一份过期快照就绿灯）', () => {
    const total = Object.values(bare).reduce((a, b) => a + b, 0);
    // 131 → 129（2026-10-08）：`cinematic/CombatCinematicSkip.js` 整文件迁完、台账删行。
    // 这个数**故意是硬编码**：迁移是一笔一笔的欠账，自动跟随就等于"改多少都不算数"。
    // 129 → 116（2026-10-08）：core/Game.js 的 13 处整文件迁完。
    expect(total).toBe(116);
    // HUD 是切片6 迁掉的那一个：它必须从台账里消失，并且改用总线
    expect(bare['ui/HUD.js']).toBeUndefined();
    expect(busUsers.get('ui/HUD.js')).toMatchObject({ on: 20, offAll: 1 });
  });

  it('用 on() 的文件必须同时有 offAll()：打了 tag 不注销比不打更糟', () => {
    const stranded = [...busUsers]
      .filter(([, u]) => u.on > 0 && u.offAll === 0)
      .map(([file]) => file);
    expect(stranded).toEqual([]);
  });

  it('on() 一律带 tag：省略 tag 的监听落进 UNGROUPED，等于换个地方继续漏', () => {
    const untagged = [...busUsers.values()].flatMap((u) => u.untagged);
    expect(untagged).toEqual([]);
    expect(readSrc('ui/HUD.js')).toMatch(/offAll\(EVENT_TAG\)/);
  });

  it('HUD 的 dispose() 三本账都结：观测量退订、监听注销、调度任务撤销', () => {
    const hud = readSrc('ui/HUD.js');
    const m = /\n {2}dispose\(\) \{/.exec(hud);
    expect(m).not.toBeNull();
    const body = hud.slice(m.index, hud.indexOf('\n  }', m.index));
    expect(body).toMatch(/for \(const off of this\._offs/);
    expect(body).toMatch(/offAll\(EVENT_TAG\)/);
    expect(body).toMatch(/scheduler\.clear\(ZONE_BANNER_TAG\)/);
    expect(body).toMatch(/scheduler\.clear\(FINISHER_TAG\)/);
  });

  it('UNGROUPED 这个默认值存在的唯一理由是可统计，新代码不许依赖它', () => {
    expect(UNGROUPED).toBe('ungrouped');
    expect(listenerCount(UNGROUPED)).toBe(0);
    // HUD 的 20 处监听全部走同一个所有权标识，不是各写一个字符串
    expect(readSrc('ui/HUD.js')).toMatch(/const EVENT_TAG = 'ui\/HUD';/);
  });

  it('派发的第二条通道已经有人走：营火对话改走 emit()，不再是裸 CustomEvent', () => {
    const rd = readSrc('game/RestDialogue.js');
    expect(rd).toMatch(/emit\(type,/);
    expect(rd).not.toMatch(/new CustomEvent\(type/);
  });

  describe('逐系统迁移：整文件迁完的那种（台账里删行，不是改成 0）', () => {
    it('CombatCinematicSkip 的 dispose 真的解绑，不只是"写了 offAll"', async () => {
      const { CombatCinematicSkip } = await import('../src/cinematic/CombatCinematicSkip.js');
      const TAG = 'combat-cinematic-skip';
      const before = listenerCount(TAG);
      // 假 game：构造只碰 dialog / combatCamera / combatInputLock / player 这几处
      const fakeGame = { dialog: { toast() {} } };
      const skip = new CombatCinematicSkip(fakeGame);
      expect(listenerCount(TAG), '构造后应当多两条').toBe(before + 2);
      skip.dispose();
      expect(listenerCount(TAG), 'dispose 之后应当回到原点').toBe(before);
    });

    it('构造两次再 dispose 两次，账仍然是平的（不重复挂、不重复解）', async () => {
      const { CombatCinematicSkip } = await import('../src/cinematic/CombatCinematicSkip.js');
      const TAG = 'combat-cinematic-skip';
      const before = listenerCount(TAG);
      const a = new CombatCinematicSkip({ dialog: { toast() {} } });
      const b = new CombatCinematicSkip({ dialog: { toast() {} } });
      expect(listenerCount(TAG)).toBe(before + 4);
      a.dispose();
      b.dispose();
      expect(listenerCount(TAG)).toBe(before);
    });

    it('dispose 连那条待办计时一起清 —— 注销之后不许再弹提示', async () => {
      const { CombatCinematicSkip } = await import('../src/cinematic/CombatCinematicSkip.js');
      const { scheduler } = await import('../src/engine/Scheduler.js');
      // Scheduler 没有查询接口（没有 has/size），所以"计时清没清"只能用**推过时间看回调是否触发**
      // 来观测 —— 这比读一个内部字段更接近玩家看到的东西。
      const toasts = [];
      const fakeGame = { dialog: { toast: (t) => toasts.push(t) }, combatCamera: { active: true } };

      // 对照组：不 dispose，推过 0.4 秒应当弹一次。
      // 这里**直接调 `_maybeHint()`** 而不是 `emit` —— 把"事件送达"与"计时触发"分开量：
      // 前者由 EventBus 自己的用例管，这一条只管后者。合在一起量的话，事件那一段
      // 一旦不灵，这条会以"对照组没弹"红，看起来像计时坏了（第一版就是这么绕进去的）。
      const keep = new CombatCinematicSkip(fakeGame);
      keep._maybeHint();
      scheduler.update(1);
      expect(toasts.length, '对照组应当弹一次（否则这条用例什么都没量到）').toBe(1);
      keep.dispose();

      // 实验组：dispose 之后推过同样长的时间，不许再弹
      toasts.length = 0;
      const gone = new CombatCinematicSkip(fakeGame);
      emit('combat-execution');
      gone.dispose();
      scheduler.update(1);
      expect(toasts, '注销之后不该再弹提示').toEqual([]);
    });

    it('台账里已经没有这一行（整文件迁完就删行）', () => {
      const src = readFileSync(join(process.cwd(), 'tests', 'event-bus.test.js'), 'utf8');
      const table = src.slice(src.indexOf('const BARE_WINDOW_LISTENERS'), src.indexOf('};', src.indexOf('const BARE_WINDOW_LISTENERS')));
      // 注释里提到它是允许的（那是"迁到哪儿去了"的索引），但**不许再是一行计数**
      expect(table).not.toMatch(/^\s*'cinematic\/CombatCinematicSkip\.js'\s*:\s*\d+/m);
      // 反面证据：同一把尺子对还在表里的邻居量得出来
      expect(table).toMatch(/^\s*'cinematic\/CombatCameraDirector\.js'\s*:\s*\d+/m);
    });
  });
});
