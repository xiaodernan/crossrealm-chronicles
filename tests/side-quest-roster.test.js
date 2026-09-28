/**
 * 支线只有一份名单 —— W-B3 切片5（结掉 W-B3 尾巴③"SideQuestSystem 的兼容层仍在"）。
 *
 * 病不在"兼容层"这三个字，而在**一份内容两个答案**：
 * 基础那 7 条住在 `src/game/SideQuestRegistry.js`，致敬那 14 条住在 `src/content/sideQuests.js`，
 * 后者靠 `attachPopCultureSideQuests()` **改写 `SideQuestSystem.checkAll` 方法**挂上来。
 * 于是"支线一共几条"有两个真源：完成检测遍历 21 条，而 `getProgress().total` 与支线页签
 * 都只数基础那 7 条。后果是两处玩家看得见的假话（改前读到过，见 §9）：
 *  - HUD 的支线计数可以写成 `(12/7)`；
 *  - 14 条致敬支线**能完成、会弹提示、会写日志**，却永远不出现在名单里（玩家无从知道它们存在）。
 * 另外两族遍历时各包着一个 `catch (_) { /* ignore *\/ }`：判据抛错的那条支线**永远完成不了**，
 * 且没有任何声响 —— 与 B36/B62/B63 同族。
 *
 * 现在：两族都在内容层，`SIDE_QUESTS_ALL` 一处合并（撞 id 当场抛），系统只遍历这一份，
 * 分母与页签同源于它；注册表那条 `checkSideQuestRosters` 管"一族被搬空 / 两族撞 id / 少一个 check"。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIDE_QUESTS_BASE, SIDE_QUESTS_POP, SIDE_QUESTS_ALL } from '../src/content/sideQuests.js';
import { SideQuestSystem } from '../src/game/SideQuestSystem.js';
import { SideQuestJournalTab } from '../src/ui/SideQuestJournalTab.js';
import { checkSideQuestRosters, checkContent, CONTENT_TABLES } from '../src/content/registry.js';
import { installWindowShim } from './helpers/enemyHarness.js';

const ROOT = process.cwd();
const readSrc = (rel) => readFileSync(join(ROOT, 'src', rel), 'utf8');
/** 只核代码，不核史料：本文件的头注与函数注释里会**引用**那些被删掉的写法 */
const codeOnly = (text) => text.split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

/** 一条支线的判据想读什么都由用例给；`tally` 记下所有对外效应，好断言"完成"是真发生了事 */
function makeGame(overrides = {}) {
  const 记 = { toasts: [], souls: [], journal: [], events: [] };
  const game = {
    stats: { addSouls: (n) => 记.souls.push(n) },
    dialog: { toast: (t) => 记.toasts.push(t) },
    storyJournal: { add: (e) => 记.journal.push(e) },
    quests: { chapter: 3 },
    achievements: { stats: {} },
    ...overrides,
  };
  return { game, 记 };
}
const fakePanel = () => ({ innerHTML: '', querySelectorAll: () => [] });

afterEach(() => {
  delete globalThis.window;
  delete globalThis.CustomEvent;
});

describe('一份名单、一个分母', () => {
  it('控制组：两族都在，合并名单是它们之和且 id 唯一', () => {
    expect(SIDE_QUESTS_BASE.length, '基础族空了 —— 这条断言就只是"什么都比"').toBeGreaterThan(0);
    expect(SIDE_QUESTS_POP.length, '致敬族空了 —— 同上').toBeGreaterThan(0);
    expect(SIDE_QUESTS_ALL.length).toBe(SIDE_QUESTS_BASE.length + SIDE_QUESTS_POP.length);
    expect(new Set(SIDE_QUESTS_ALL.map((q) => q.id)).size).toBe(SIDE_QUESTS_ALL.length);
    // 致敬族那 14 条以前根本不在页签名单里：先钉"它确实在合并名单里"
    for (const q of SIDE_QUESTS_POP) {
      expect(SIDE_QUESTS_ALL.some((m) => m.id === q.id), `${q.id} 没进合并名单`).toBe(true);
    }
  });

  it('分母就是遍历的那一份（不是其中一族）', () => {
    installWindowShim();
    const { game } = makeGame();
    const sq = new SideQuestSystem(game);
    expect(sq.getProgress().total).toBe(SIDE_QUESTS_ALL.length);
    expect(sq.getProgress().total).toBeGreaterThan(SIDE_QUESTS_BASE.length);
  });

  it('致敬族那条也**出现在页签名单里**，且完成数与总数同源于合并名单', () => {
    installWindowShim();
    const { game } = makeGame();
    const sq = new SideQuestSystem(game);
    game.sideQuests = sq;
    const 面板 = fakePanel();
    new SideQuestJournalTab(game).render(面板);
    const 缺 = SIDE_QUESTS_ALL.filter((q) => !面板.innerHTML.includes(q.title)).map((q) => q.id);
    expect(缺, `这些支线在页签里看不见：${缺.join('、')}`).toEqual([]);
    expect(面板.innerHTML).toContain(`完成 0 / ${SIDE_QUESTS_ALL.length}`);
  });
});

describe('完成检测走 shipped 路径：致敬族与基础族同一条路', () => {
  it('致敬支线完成：加魂火、弹提示、写日志、派事件 —— 与基础族同一套事', () => {
    installWindowShim();
    const 目标 = SIDE_QUESTS_POP[0];
    const { game, 记 } = makeGame();
    const sq = new SideQuestSystem(game);
    const 事件 = [];
    globalThis.window.addEventListener('side-quest-complete', (e) => 事件.push(e.detail.id));
    // 只让这一条满足：把它的判据换成恒真，跑完再还原（其余 20 条仍走各自真判据）
    const 原 = 目标.check;
    Object.defineProperty(目标, 'check', { value: () => true, configurable: true, writable: true });
    try {
      sq.checkAll();
    } finally {
      Object.defineProperty(目标, 'check', { value: 原, configurable: true, writable: true });
    }
    expect(sq.completed.has(目标.id), '致敬族这条没被记为完成 —— 它以前根本不在遍历里').toBe(true);
    expect(记.souls).toEqual([目标.reward]);
    expect(记.toasts.join('')).toContain(目标.title);
    expect(记.journal.map((j) => j.id)).toContain(目标.id);
    expect(事件).toEqual([目标.id]);
  });

  it('全部判据同时成立时，done 能等于 total（改前 done 会超过 total：21 / 7）', () => {
    installWindowShim();
    const { game } = makeGame();
    const sq = new SideQuestSystem(game);
    const 改回来的 = [];
    for (const q of SIDE_QUESTS_ALL) {
      改回来的.push([q, Object.getOwnPropertyDescriptor(q, 'check')]);
      Object.defineProperty(q, 'check', { value: () => true, configurable: true, writable: true });
    }
    try {
      sq.checkAll();
    } finally {
      改回来的.forEach(([q, d]) => Object.defineProperty(q, 'check', { ...d, configurable: true }));
    }
    const prog = sq.getProgress();
    expect(prog.done).toBe(SIDE_QUESTS_ALL.length);
    expect(prog.done).toBeLessThanOrEqual(prog.total);
    expect(prog.total).toBe(SIDE_QUESTS_ALL.length);
  });

  it('读档后已完成集合与名单对得上：名单外那条不报错也不被算进 done', () => {
    installWindowShim();
    const { game } = makeGame();
    const sq = new SideQuestSystem(game);
    sq.fromJSON({ completed: ['side-wisp-12', 'side-早已删除'] });
    expect(sq.getProgress().done).toBe(2);   // 集合就是存档那两份，不假称"重新推导"
    sq.checkAll();                            // 只要不抛，且不会把名单外的当成本次要完成的事
    expect(sq.completed.has('side-早已删除')).toBe(true);
  });
});

describe('判据抛错不许再静默', () => {
  it('一条坏判据：喊一次（带 id）、其余支线照常完成、第二次不重复喊', () => {
    installWindowShim();
    const { game, 记 } = makeGame();
    const 坏 = SIDE_QUESTS_BASE[0];
    const 好 = SIDE_QUESTS_BASE[1];
    const 原坏 = 坏.check, 原好 = 好.check;
    Object.defineProperty(坏, 'check', { value: () => { throw new Error('桩：判据读了一个不存在的字段'); }, configurable: true, writable: true });
    Object.defineProperty(好, 'check', { value: () => true, configurable: true, writable: true });
    const 收 = [];
    const 原error = console.error;
    console.error = (...a) => { 收.push(a.join(' ')); };
    const sq = new SideQuestSystem(game);
    try {
      sq.checkAll();
      sq.checkAll();
    } finally {
      console.error = 原error;
      Object.defineProperty(坏, 'check', { value: 原坏, configurable: true, writable: true });
      Object.defineProperty(好, 'check', { value: 原好, configurable: true, writable: true });
    }
    expect(收.length, '判据抛错却一声不响 —— 那条支线就永远完成不了').toBe(1);
    expect(收[0]).toContain(坏.id);
    expect(sq.completed.has(好.id), '一条坏判据把这一帧的其余支线拖垮了').toBe(true);
    expect(记.souls).toEqual([好.reward]);
  });
});

describe('挂载那层 monkey-patch 删净了，注册表三条各配一次反向', () => {
  it('两个旧文件不在了，`Game.js` 里也不再改写 `checkAll`', () => {
    expect(existsSync(join(ROOT, 'src/game/SideQuestRegistry.js')), '基础名单还在老地方').toBe(false);
    expect(existsSync(join(ROOT, 'src/game/SideQuestPopCulture.js')), '改写方法的挂载层还在').toBe(false);
    expect(codeOnly(readSrc('core/Game.js'))).not.toMatch(/attachPopCultureSideQuests/);
    expect(codeOnly(readSrc('game/SideQuestSystem.js'))).not.toMatch(/catch \(_\) \{/);
  });

  it('真表零错（不是"什么都报"），三种各点名一次', () => {
    expect(checkSideQuestRosters(SIDE_QUESTS_BASE)).toEqual([]);
    expect(checkSideQuestRosters([]).join('\n')).toMatch(/一族支线空了/);
    // 撞名的桩件要拿**致敬族那一格**当基础族喂进来：与模块里真那份 POP 才构成交叉
    const 撞 = [{ ...SIDE_QUESTS_POP[0] }];
    expect(checkSideQuestRosters(撞).join('\n')).toMatch(/同时在 "sideQuestsBase" 与 "sideQuestsPop" 里/);
    const 缺判据 = SIDE_QUESTS_BASE.map((q, i) => (i === 0 ? { ...q, check: undefined } : q));
    expect(checkSideQuestRosters(缺判据).join('\n')).toMatch(/没有 check 函数/);
  });

  it('这条不变式挂在 shipped 的开机校验上（走 `checkContent`，不是只被本文件调）', () => {
    const planted = (kind, table) => checkContent(
      CONTENT_TABLES.map((t) => (t.kind === kind ? { ...t, table } : t)),
    );
    expect(planted('sideQuestsBase', SIDE_QUESTS_BASE)).toEqual([]);
    expect(planted('sideQuestsBase', []).join('\n')).toMatch(/一族支线空了/);
    // reward 从 `min: 0` 收到 `min: 1`：0 奖励的支线是能过的"完成"，玩家只会看到一条没奖励的任务
    expect(planted('sideQuestsBase', [{ ...SIDE_QUESTS_BASE[0], reward: 0 }]).join('\n'))
      .toMatch(/reward/);
  });
});
