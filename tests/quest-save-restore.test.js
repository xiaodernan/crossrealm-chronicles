/**
 * 读档落点与"那片死掉的引擎"—— W-B3 切片4。
 *
 * 两件事是一条账的两头：
 * ① `src/game/ObjectiveEngine.js`（522 行）在 `src/` 里**零 import**，唯一读者是
 *    `tests/objective-engine.test.js` 那 19 例 —— 用例供着一条没有消费者的活路，
 *    而它声明要提供的三件事（前置激活、章节、失败）今天分别由
 *    注册表的整表不变式 / 表上每行的 `chapter` / （无人使用的）空壳 `FAIL_CONDITIONS` 承担。
 *    本片删引擎 + 它独占的 7 条事件登记 + 那个空壳，并把"读档以谁为准"这一问落到实处：
 * ② `SaveSystem` 以前把盘上的 `quests.index` 直接写进 `questIndex`，章节要么信盘上那份、
 *    要么用 `index > 8 ? 2 : 1` 猜。`index: 999` 的后果不是报错，是 `current` 变 `null` ——
 *    HUD 少一行任务、指路箭头失踪，游戏照跑。
 *
 * 所以这一片要钉的是：**盘上的数只能在表允许的范围里被采纳，其余由表说话。**
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as OBJECTIVES_MODULE from '../src/content/objectives.js';
import { MAINLINE, chapterAt, OBJECTIVES } from '../src/content/objectives.js';
import { GAME_EVENTS } from '../src/engine/events.js';
import { checkObjectiveTable } from '../src/content/registry.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { SaveSystem } from '../src/game/SaveSystem.js';
import { installWindowShim } from './helpers/enemyHarness.js';

const ROOT = process.cwd();
const readSrc = (rel) => readFileSync(join(ROOT, 'src', rel), 'utf8').replace(/\r\n/g, '\n');
/** 判据的口径与门禁一致：剥掉行注释与块注释行，史料提及不算数 */
const stripComments = (text) => text.split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const savedWarn = console.warn;
const makeHostGame = () => ({
  dialog: { toasts: [], toast(t) { this.toasts.push(t); } },
  player: { combat: {}, teleport() {} },
  stats: { fromJSON() {}, pushToConsumers() {}, toJSON: () => ({}) },
  quests: new QuestSystem({ toast() {} }),
  spells: {},
  settings: { data: {}, applyToGame() {} },
  weaponSkills: { unlocked: new Set(), fromJSON() {} },
});

function newQuests() {
  installWindowShim();
  return new QuestSystem({ toast() {}, play() {} });
}
afterEach(() => {
  console.warn = savedWarn;
  delete globalThis.window;
  delete globalThis.CustomEvent;
});

/** 装一份读档现场的探针：把 console.warn 收下来，好在断言里点名 */
function restore(quests, saved) {
  const got = [];
  console.warn = (...args) => { got.push(args.join(' ')); };
  try {
    const out = quests.restoreFromSave(saved);
    return { out, got };
  } finally {
    console.warn = savedWarn;
  }
}

describe('① 那片死代码真的删净了（不是只把 import 摘掉）', () => {
  it('引擎文件与那份供它命的用例都不在了', () => {
    expect(existsSync(join(ROOT, 'src/game/ObjectiveEngine.js')), '引擎还在').toBe(false);
    expect(existsSync(join(ROOT, 'tests/objective-engine.test.js')), '那份供它命的用例还在').toBe(false);
  });

  it('全仓（跳过注释）没有一处代码引用 `ObjectiveEngine`', () => {
    const files = ['game/QuestSystem.js', 'game/SaveSystem.js', 'core/Game.js',
      'content/objectives.js', 'content/registry.js', 'engine/events.js', 'ui/HUD.js'];
    const 引用 = files.filter((f) => /ObjectiveEngine/.test(stripComments(readSrc(f))));
    expect(引用, `这些文件还在代码里引用已删除的引擎：${引用.join('、')}`).toEqual([]);
    // 反向见证：史料确实还在（非注释判据不是"扫不到东西"）
    expect(readSrc('content/objectives.js')).toMatch(/ObjectiveEngine/);
  });

  it('引擎独占的 7 条事件登记一起撤掉（留着就是指向不存在生产者的死条目）', () => {
    const 该没了 = ['flag-changed', 'objective-complete', 'objective-fail', 'objective-reset',
      'objective-restart', 'objective-available', 'objective-activate'];
    for (const name of 该没了) expect(GAME_EVENTS, `登记表里还留着 ${name}`).not.toHaveProperty(name);
    // 控制组：登记表本身还在用，别把这条读成"整张表被删了"
    expect(Object.keys(GAME_EVENTS).length).toBeGreaterThan(30);
  });

  it('空壳 `FAIL_CONDITIONS` 不再从数据层导出（要做失败先立"哪一行的什么条件"）', () => {
    expect(readSrc('content/objectives.js')).not.toMatch(/export const FAIL_CONDITIONS/);
    expect(OBJECTIVES_MODULE, '数据层还在导出那个空壳').not.toHaveProperty('FAIL_CONDITIONS');
  });
});

describe('② 读档以表为准：落点、章节、以及坏档要留下理由', () => {
  it('合法往返：存下来的 index / chapter 读回来一字不动（不引入回归）', () => {
    const q = newQuests();
    const probe = newQuests();
    probe.questIndex = 12;
    probe.chapter = chapterAt(12);
    const { out, got } = restore(q, { index: probe.questIndex, chapter: probe.chapter, completed: false });
    expect(out).toEqual({ index: 12, chapter: chapterAt(12), 采纳的: { index: true, chapter: true } });
    expect(got, '合法的档不该喊话').toEqual([]);
    expect(q.current.id).toBe(MAINLINE[12].id);
  });

  it('越界与非整数：夹回表里，并当场说清"为什么不是原地"', () => {
    for (const 坏 of [999, -3, 1.5, '7', null, undefined, NaN, {}, 31.0]) {
      const q = newQuests();
      const { out, got } = restore(q, { index: 坏, chapter: chapterAt(0) });
      expect(Number.isInteger(out.index) && out.index >= 0 && out.index < MAINLINE.length,
        `index=${JSON.stringify(坏)} 落到了 ${out.index}，仍在表外`).toBe(true);
      expect(q.current, `index=${JSON.stringify(坏)} 之后没有当前任务 —— 那正是以前那个静默 null`).toBeTruthy();
      if (!Number.isInteger(坏) || 坏 < 0 || 坏 >= MAINLINE.length) {
        expect(got.length, `坏值 ${JSON.stringify(坏)} 被悄悄采纳了，没人喊`)
          .toBeGreaterThan(0);
        expect(got.join(' ')).toMatch(/不能落在这条|已按第/);
      }
    }
    expect(MAINLINE.length, '主线长度是这些落点的上界，它得有几十格').toBeGreaterThan(20);
  });

  it('章节由位置说话：盘上那份不一致时以表为准，并留一条能读懂的话', () => {
    const 最后一格 = MAINLINE.length - 1;
    const q = newQuests();
    const { out, got } = restore(q, { index: 最后一格, chapter: 1 });
    expect(out.chapter, '走到主线最后一步还写着第 1 章 —— 那就是那句 `index > 8 ? 2 : 1` 的病')
      .toBe(chapterAt(最后一格));
    expect(out.chapter).toBeGreaterThan(1);
    expect(got.join(' ')).toMatch(/以表为准/);
    expect(q.chapter).toBe(out.chapter);
  });

  it('那句抄本没了：`SaveSystem` 里不再出现 `> 8` 的章节猜测', () => {
    const 存档层 = stripComments(readSrc('game/SaveSystem.js'));
    expect(存档层).not.toMatch(/quests\.chapter\s*=/);
    expect(存档层).not.toMatch(/index\s*>\s*8/);
    expect(存档层).toMatch(/restoreFromSave\(/);
    // 反向：整份文件里"quests"该出现的次数不为 0（判据不是空文件）
    expect(存档层.includes('quests')).toBe(true);
  });

  it('走**shipped 入口**也一样：`SaveSystem.ingest` 喂一份越界档，落点仍被夹回表内', () => {
    // 这一条存在的理由：上面那几条直接调 `quests.restoreFromSave`，于是"生产代码没去调它"
    // 这种错（探针 P7：把 `SaveSystem` 改回 `questIndex = data.quests.index`）在它们面前全绿。
    // 只有从 `SaveSystem` 这一侧打进来，才证明这条校验真的在路上。
    const 底 = JSON.parse(readFileSync(join(ROOT, 'tests', 'save_v5_fixture.json'), 'utf8'));
    底.quests.index = 999;
    底.quests.chapter = 1;
    installWindowShim();                       // 真 QuestSystem 要注册监听（与 save-migrations 同一口径）
    const target = makeHostGame();
    const 收话 = [];
    const 原warn = console.warn;
    console.warn = (...a) => { 收话.push(a.join(' ')); };
    let r = null;
    try {
      r = SaveSystem.ingest(target, JSON.stringify(底), { sourceKey: 'crossrealm_save_v6' });
    } finally {
      console.warn = 原warn;
    }
    expect(r.ok, `这份档没被应用：${r && r.error && r.error.message}`).toBe(true);
    expect(target.quests.questIndex, '越界档把指针留在了表外').toBe(MAINLINE.length - 1);
    expect(target.quests.current, '没有当前任务 —— 玩家进了一个没有主线可走的世界').toBeTruthy();
    expect(target.quests.chapter).toBe(chapterAt(MAINLINE.length - 1));
    expect(收话.join(' ; ')).toMatch(/不能落在这条/);
  });

  it('play 与 load 用同一把尺：一路走完 32 步，每一步的 chapter 都等于位置算出来的那一个', () => {
    const q = newQuests();
    const 走过 = [];
    while (q.current && !q.completed) {
      走过.push({ i: q.questIndex, 系统章: q.chapter, 位置章: chapterAt(q.questIndex) });
      q.advance();
    }
    expect(走过.length, '一步都没走 —— 这条断言不能算通过').toBe(MAINLINE.length);
    const 不一致 = 走过.filter((s) => s.系统章 !== s.位置章);
    expect(不一致, `这些步上系统自报的章节与表上位置不符：\n${JSON.stringify(不一致)}`).toEqual([]);
    expect(new Set(走过.map((s) => s.系统章)).size, '整条主线只出现过一章 —— 门控没生效').toBeGreaterThan(1);
  });

  it('表上每行的 `chapter` 与门控行开的那一章对得上（这条等价是上面两条的前提）', () => {
    const 门 = OBJECTIVES.filter((r) => r.type === 'chapter-gate');
    expect(门.length).toBeGreaterThan(0);
    const 错位 = [];
    for (const g of 门) {
      const i = MAINLINE.findIndex((r) => r.branchTo === g.id);
      if (i < 0) continue;                       // 最后一道门不开新章，它没有 branchTo 来源
      const 下一步 = MAINLINE[i + 1];
      if (下一步 && 下一步.chapter !== g.chapter) {
        错位.push(`${g.id} 开第 ${g.chapter} 章，而紧随其后的 "${下一步.id}" 自标第 ${下一步.chapter} 章`);
      }
    }
    expect(错位, 错位.join('\n')).toEqual([]);
  });
});

describe('③ `requires` 今天的地位：被全表序保证，被 MAINLINE 漏掉', () => {
  /** 走到第 i 格（含）之前，表上已经设成 true 的那些标志 */
  const producedBefore = (rows, i) => {
    const set = new Set();
    for (let k = 0; k < i; k += 1) {
      for (const [flag, value] of Object.entries(rows[k].flags ?? {})) if (value === true) set.add(flag);
    }
    return set;
  };

  it('按**整张表**的顺序走：每一格的 `requires` 在它出现之前都已被某一行设过', () => {
    const 检查过的 = [];
    const 破约 = [];
    OBJECTIVES.forEach((row, i) => {
      const 已有 = producedBefore(OBJECTIVES, i);
      for (const [flag, want] of Object.entries(row.requires ?? {})) {
        检查过的.push(`${row.id}.${flag}`);
        if (want !== true || !已有.has(flag)) {
          破约.push(`${row.id} 要 ${flag}=${JSON.stringify(want)}，可它之前没有任何一行把它设成 true`);
        }
      }
    });
    expect(检查过的.length, '一行 requires 都没检查到 —— 这条断言是空的').toBeGreaterThan(0);
    expect(破约.join('; '), 破约.join('; ')).toBe('');
  });

  it('但按**在役序列**（`MAINLINE` 滤掉门控行）走就不成立：那些前置是门控行设的', () => {
    const 接线障碍 = [];
    MAINLINE.forEach((row, i) => {
      const 主线里已有 = producedBefore(MAINLINE, i);
      for (const [flag, want] of Object.entries(row.requires ?? {})) {
        if (want === true && !主线里已有.has(flag)) {
          const 谁设的 = OBJECTIVES.filter((r) => r.flags?.[flag] === true).map((r) => `${r.id}${r.type === 'chapter-gate' ? '（门控行）' : ''}`);
          接线障碍.push(`${row.id} 要 ${flag} —— 设它的是 ${谁设的.join(' / ') || '没人'}`);
        }
      }
    });
    // 这条断言的意义是"记录当前结论并要求它被复核"：今天确有若干格的前置只存在于门控行里，
    // 所以把 `requires` 直接接到在役链上会让那些格永远走不到（B62 那一族：静默不可达）。
    // 将来若有人把这些 flag 也设到某个主线行上，这一条会红 —— 那时才是接线的时机。
    expect(接线障碍.length, '这条"接线障碍"名单空了 —— 说明表改了，接不接 `requires` 要重新决定').toBeGreaterThan(0);
    for (const 一条 of 接线障碍) expect(一条).toMatch(/设它的是 (?!没人)/);
  });

  it('注册表那条不变式真的咬得住：把生产者挪到消费者后面要点名', () => {
    expect(checkObjectiveTable(OBJECTIVES)).toEqual([]);       // accept 方向
    const 表 = structuredClone(OBJECTIVES);
    const 消费者 = 表.findIndex((r) => Object.keys(r.requires ?? {}).length);
    const 需要的flag = Object.keys(表[消费者].requires)[0];
    const 生产者 = 表.findIndex((r) => r.flags?.[需要的flag] === true);
    expect(生产者 >= 0 && 生产者 < 消费者, '这份桩件不成立，下面的断言没意义').toBe(true);
    表.splice(生产者, 1);                                       // 把生产者从它前面摘掉
    const issues = checkObjectiveTable(表);
    expect(issues.some((m) => m.includes(需要的flag) && m.includes('没有任何一行'
      .replace('一行', '一步的 flags 设过它'))), `移走 "${需要的flag}" 的生产者，不变式没意见？`).toBe(true);
  });
});
