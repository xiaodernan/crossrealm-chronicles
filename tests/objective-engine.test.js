import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { installWindowShim } from './helpers/enemyHarness.js';
import { ObjectiveEngine, OBJECTIVE_STATUS } from '../src/game/ObjectiveEngine.js';
import { BOSS_STAT_KEYS, MAINLINE, OBJECTIVES, STAT_EVENTS, STAT_READINGS, emptyStats, interactGateCondition } from '../src/content/objectives.js';
import { emit, listenerCount } from '../src/engine/EventBus.js';

/**
 * 目标引擎的行为账（W-B3 切片2）。
 *
 * 切片2 之前这个类最要命的问题不是判据抄了第三遍，而是**它从来不计账**：
 * `collectStats()` 写的是 `return this._stats || {}`，而 `_stats` 只由 `setStatsSource()` 填，
 * 全仓零调用 —— 于是它的账本永远是空的一本，`CONDITIONS` 里那些条件永远为假。
 * 现在的形状：账本由引擎自己按 `STAT_EVENTS` 记（与 `QuestSystem` 同一份表），
 * 判据是 `objectiveDone` 那一份，名册是 `BOSS_STAT_KEYS` 那一份。
 *
 * 期望值一律**从表里推**（第一行是谁、注册了几条监听、读数格不落盘），不抄我脑子里的清单。
 */

const SRC = join(process.cwd(), 'src');
const TAG = 'game/ObjectiveEngine';
/** 用件事件的最小负载 —— 形状照 `engine/events.js` 登记表里写的那一份 */
const DETAIL = {
  'combat-hit': { damage: 10, target: 'dummy' },
  'spell-cast': { id: 'bolt', name: '奥术弹' },
  'dungeon-cleared': { id: 'ruin-crypt' },
  'weapon-skill-unlocked': { id: 'skill-a' },
  'chest-opened': { id: 'chest-1' },
  'npc-talk': { id: 'wanderer', line: '', chapter: 1 },
  discovery: { id: 'fantasy-ring', title: '', text: '', category: 'frag' },
  'poi-interact': { id: 'hub-anchor' },
  'stats-changed': { level: 7, mind: 3 },
};

let win;
let engine;

function makeEngine() {
  return new ObjectiveEngine({ toast() {}, play() {} });
}

beforeEach(() => {
  installWindowShim();
  win = globalThis.window;
  engine = makeEngine();
});

afterEach(() => {
  engine?.dispose();
  globalThis.window = undefined;
  globalThis.CustomEvent = undefined;
  engine = undefined;
  win = undefined;
});

function snapshot(s) {
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    out[k] = v instanceof Set ? [...v].sort() : (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
  }
  return out;
}

describe('开机即在手：引擎自带账本，构造函数不再交出一个空指针', () => {
  it('构造后第一格就是 ACTIVE，且指针说的就是它', () => {
    const first = OBJECTIVES[0];
    expect(engine.activeObjectiveId).toBe(first.id);
    const instance = engine.getCurrent();
    expect(instance.def).toBe(first);
    expect(instance.status).toBe(OBJECTIVE_STATUS.ACTIVE);
    expect(instance.visitCount).toBe(1);
  });

  it('账本是自己的一份 emptyStats（以前等外部喂，而全仓没人喂）', () => {
    expect(snapshot(engine.stats)).toEqual(snapshot(emptyStats()));
    // `CONDITIONS` 读的就是这一本：以前这里读到的是 `{}`
    expect(engine.getState().stats).toBe(engine.stats);
  });

  it(`监听条数 = 记账表那 ${Object.keys(STAT_EVENTS).length} 件事 + 章节变更一条`, () => {
    expect(listenerCount(TAG)).toBe(Object.keys(STAT_EVENTS).length + 1);
  });

  it('dispose 之后账本空了，事件再响也不再记账', () => {
    engine.dispose();
    expect(listenerCount(TAG)).toBe(0);
    emit('combat-hit', DETAIL['combat-hit']);
    expect(engine.stats.hits).toBe(0);
  });
});

describe('记账：表里每一件事都真的能改到引擎的账上', () => {
  it('逐条派发 STAT_EVENTS，账本至少动一格（零手写清单）', () => {
    for (const name of Object.keys(STAT_EVENTS)) {
      const before = snapshot(engine.stats);
      const detail = name === 'enemy-defeated' ? { name: '影之战士', type: 'soldier' } : DETAIL[name];
      emit(name, detail);
      const after = snapshot(engine.stats);
      const moved = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
      expect(moved, `事件「${name}」没改到任何一格`).not.toEqual([]);
    }
  });

  it('没登记在记账表里的事件名不改账也不抛（别人多派发一条消息不该让任务停摆）', () => {
    emit('flag-changed', { flag: 'whatever', value: true, old: false });
    expect(snapshot(engine.stats)).toEqual(snapshot(emptyStats()));
  });

  it('Boss 死亡按 bossId 落到名册那一格，普通击杀按 type 计数', () => {
    emit('enemy-defeated', { name: '影之战士', type: 'soldier' });
    emit('enemy-defeated', { name: '影界守护者', type: 'boss', bossId: 'shadow-warden' });
    expect(engine.stats.kills).toEqual({ soldier: 1 });
    expect(engine.stats.bossDefeated).toBe(true);
    expect(engine.stats.boss2Defeated).toBe(false);
  });
});

describe('推进：一章走完就停手，不去抢下一档的目标', () => {
  it('Chapter 1 按表里的顺序走完，第一只 Boss 倒下不翻章（章节由 chapter-gate 说话）', () => {
    const walked = [engine.getCurrent().def.id];
    const step = (name, detail) => {
      emit(name, detail);
      const cur = engine.getCurrent();
      // 一格可以因多个事件停留若干次，走位序列只记它换人的那些时刻
      if (cur && cur.def.id !== walked[walked.length - 1]) walked.push(cur.def.id);
    };
    step('poi-interact', { id: 'hub-anchor' });
    for (let i = 0; i < 8; i += 1) step('combat-hit', DETAIL['combat-hit']);
    for (let i = 0; i < 2; i += 1) step('enemy-defeated', { name: '影之战士', type: 'soldier' });
    step('discovery', DETAIL.discovery);
    step('enemy-defeated', { name: '影界守护者', type: 'boss', bossId: 'shadow-warden' });

    // 切片3 之后表里的 Chapter 1 是九格：`magic-frag` / `golem` / `space-frag` / `finale`
    // 那四格玩家本来就是在章节 1 里做的（在役 sequencer 直到门控行才翻章），老表把它们标成 2，
    // 于是引擎走完第五格就认为"这一章没目标了"—— 那正是两张表对不上时的形状。
    const ch1 = OBJECTIVES.filter((r) => r.chapter === 1).map((r) => r.id);
    expect(ch1.length).toBeGreaterThan(5);
    // 这一串事件只够驱动前五格；第六格（`magic-frag`）已被 boss1 解锁，指针就停在那儿等它的发现物
    expect(walked).toEqual(ch1.slice(0, 6));
    for (const id of ch1.slice(0, 5)) expect(engine.getObjective(id).status).toBe(OBJECTIVE_STATUS.DONE);
    expect(engine.getObjective(ch1[5]).status).toBe(OBJECTIVE_STATUS.ACTIVE);
    // 章节号要等门控行才动，进度读数也只数已经过掉的那五格
    expect(engine.chapter).toBe(1);
    expect(engine.getProgress()).toEqual({ done: 5, total: ch1.length, chapter: 1 });
  });

  it('数值步的读数对齐账本口径：多砍一刀不会留下 3/5 那样的显示', () => {
    const training = OBJECTIVES.find((r) => r.type === 'hits');
    for (let i = 0; i < 6; i += 1) emit('combat-hit', DETAIL['combat-hit']);
    emit('poi-interact', { id: 'hub-anchor' });      // 先让 training 到手（此时 hits=6 还没过）
    expect(engine.getCurrent().def.id).toBe(training.id);
    for (let i = 0; i < 6; i += 1) emit('combat-hit', DETAIL['combat-hit']);
    expect(engine.stats.hits).toBe(12);
    const instance = engine.getObjective(training.id);
    expect(instance.status).toBe(OBJECTIVE_STATUS.DONE);
    expect(instance.progress).toBe(training.target);
  });
});

describe('门控的「摸锚点」：条件齐时的那一下交互才推进它', () => {
  it('摸过锚点但碎片没齐 → 不完成；补齐三片后再摸 → 分支到章节门并推章节', () => {
    // 门控那一格由它自己的 `condition` 认出来，不靠"它分支到哪一节"的名字
    const gateRow = MAINLINE.find((r) => interactGateCondition(r) === 'checkAllFragments');
    const chapterGate = OBJECTIVES.find((r) => r.id === gateRow.branchTo);
    expect(chapterGate.type).toBe('chapter-gate');
    engine.activateObjective(gateRow.id);
    expect(engine.getCurrent().def.id).toBe(gateRow.id);

    emit('poi-interact', { id: gateRow.targetId });
    expect(engine.getObjective(gateRow.id).status).toBe(OBJECTIVE_STATUS.ACTIVE);
    // 补齐条件的整个过程都不该把它判过 —— 推进它的必须是条件齐后的那一下交互
    for (const id of ['fantasy-ring', 'magic-castle', 'space-tesseract']) {
      emit('discovery', { ...DETAIL.discovery, id });
      expect(engine.getObjective(gateRow.id).status).toBe(OBJECTIVE_STATUS.ACTIVE);
    }
    emit('poi-interact', { id: gateRow.targetId });

    expect(engine.getObjective(gateRow.id).status).toBe(OBJECTIVE_STATUS.BRANCHED);
    expect(engine.getObjective(chapterGate.id).status).toBe(OBJECTIVE_STATUS.DONE);
    expect(engine.chapter).toBe(chapterGate.chapter);
    // 章节门自己说它留下哪些标志（名字跟着行走，不在这里另抄一份）
    for (const [flag, value] of Object.entries(chapterGate.flags ?? {})) {
      expect(engine.flags[flag], `门控行没落下 ${flag}`).toBe(value);
    }
    // 章节门放行之后，指针该落在新章节的某一格上，而不是停在已完成的那格
    expect(engine.getCurrent().status).toBe(OBJECTIVE_STATUS.ACTIVE);
    expect(engine.getCurrent().def.chapter).toBe(engine.chapter);
    // 手上那一格还没结算就不许被后来者抢位：分支链走完时，指针应停在**表里第一格能激活的**，
    // 而抢位会让它跳过那一格去看后面的（变异 M11 删掉那条守卫就红在这里）
    const held = OBJECTIVES.find((r) => r.chapter === engine.chapter
      && !r.requires && !r.condition && r.type !== 'chapter-gate');
    expect(engine.getCurrent().def).toBe(held);
  });

  it('显示层不许比判据乐观：门控那一格摸过也只说该干什么', () => {
    const gated = OBJECTIVES.find((r) => r.condition && r.type === 'interact');
    const plain = OBJECTIVES.find((r) => r.type === 'interact' && !r.condition);
    emit('poi-interact', { id: gated.targetId });
    expect(engine.getObjective(gated.id).getProgressText(engine.getState()))
      .not.toContain('已完成触摸');
    expect(engine.getObjective(plain.id).getProgressText(engine.getState()))
      .toContain('已完成触摸');
  });
});

describe('名册在引擎里同样生效（切片2 实测到的那颗雷）', () => {
  it('新表把 boss2 写成 type:"boss" 也不会在第一只 Boss 倒地时完成', () => {
    const row = OBJECTIVES.find((r) => r.id === 'boss2');
    expect(row.type).toBe('boss');
    const other = Object.keys(BOSS_STAT_KEYS).find((id) => id !== row.bossId);
    engine.activateObjective(row.id);
    emit('enemy-defeated', { name: '影界守护者', type: 'boss', bossId: other });
    expect(engine.getObjective(row.id).status).toBe(OBJECTIVE_STATUS.ACTIVE);
    expect(engine.flags.boss2Defeated).toBeUndefined();
    emit('enemy-defeated', { name: '大奥术师', type: 'boss', bossId: row.bossId });
    expect(engine.getObjective(row.id).status).toBe(OBJECTIVE_STATUS.DONE);
    expect(engine.flags.boss2Defeated).toBe(true);
  });

  it('每只 Boss 的进度文本认自己的区域，打完才改口', () => {
    for (const row of OBJECTIVES.filter((r) => BOSS_STAT_KEYS[r.bossId])) {
      const instance = engine.getObjective(row.id);
      expect(instance.getProgressText(engine.getState())).toContain(row.waypoint.label);
      emit('enemy-defeated', { name: row.title, type: 'boss', bossId: row.bossId });
      expect(instance.getProgressText(engine.getState())).toBe('完成');
    }
  });
});

describe('进度推进的原语：不许倒回去', () => {
  it('负增量不抹掉已有读数；DONE 的非重访格不再结算，重访格可以', () => {
    const training = OBJECTIVES.find((r) => r.type === 'hits');
    const instance = engine.getObjective(training.id);
    instance.status = OBJECTIVE_STATUS.ACTIVE;
    instance.progress = 3;
    expect(instance.advance(-5)).toBe(false);
    expect(instance.progress).toBe(3);
    instance.status = OBJECTIVE_STATUS.DONE;
    expect(instance.advance(1)).toBe(false);

    const revisit = OBJECTIVES.find((r) => r.revisit);
    expect(revisit).toBeTruthy();
    const r2 = engine.getObjective(revisit.id);
    r2.status = OBJECTIVE_STATUS.DONE;
    r2.progress = r2.def.target ?? 1;
    expect(r2.advance(1)).toBe(true);
  });
});

describe('存档往返：账本跟着走，读档不重复结算', () => {
  /** 走一段真实事件，产出一份"玩了一会儿"的存档（过一遍 JSON：磁盘上就是这形状） */
  function playedSave() {
    emit('poi-interact', { id: 'hub-anchor' });
    for (let i = 0; i < 8; i += 1) emit('combat-hit', DETAIL['combat-hit']);
    emit('enemy-defeated', { name: '影之战士', type: 'soldier' });
    emit('dungeon-cleared', { id: 'ruin-crypt' });
    emit('stats-changed', { level: 9, mind: 4 });
    return JSON.parse(JSON.stringify(engine.toJSON()));
  }

  it('状态、进度、标志、章节、指针、账本逐项复原', () => {
    const saved = playedSave();
    engine.dispose();
    engine = makeEngine();
    engine.fromJSON(saved);
    const other = makeEngine();
    try {
      other.fromJSON(JSON.parse(JSON.stringify(saved)));
      for (const id of other.objectives.keys()) {
        expect(other.getObjective(id).status, id).toBe(engine.getObjective(id).status);
        expect(other.getObjective(id).progress, id).toBe(engine.getObjective(id).progress);
      }
      expect(other.chapter).toBe(engine.chapter);
      expect(other.activeObjectiveId).toBe(engine.activeObjectiveId);
      expect(other.flags).toEqual(engine.flags);
      expect(snapshot(other.stats)).toEqual(snapshot(engine.stats));
      expect(other.stats.dungeonsCleared).toBeInstanceOf(Set);
    } finally {
      other.dispose();
    }
  });

  it('读档不重复结算：一次 objective-complete 也不派发', () => {
    const saved = playedSave();
    let completes = 0;
    win.addEventListener('objective-complete', () => { completes += 1; });
    engine.dispose();
    engine = makeEngine();
    engine.fromJSON(saved);
    expect(completes).toBe(0);
    expect(engine.getObjective(OBJECTIVES[0].id).status).toBe(OBJECTIVE_STATUS.DONE);
  });

  it('读数格不落盘；磁盘上多出来的键进不来', () => {
    const saved = playedSave();
    for (const key of STAT_READINGS) expect(saved.stats).not.toHaveProperty(key);
    expect(saved.stats).toHaveProperty('hits');
    engine.dispose();
    engine = makeEngine();
    engine.fromJSON({ ...saved, stats: { ...saved.stats, level: 99, ghostsFromOldSave: 7 } });
    for (const key of STAT_READINGS) expect(engine.stats[key]).toEqual(emptyStats()[key]);
    expect(engine.stats).not.toHaveProperty('ghostsFromOldSave');
    // 生产方随后推一次就以它为准（读档链尾那条 stats-changed）
    emit('stats-changed', { level: 9, mind: 4 });
    expect(engine.stats.level).toBe(9);
  });

  it('一份空档（null / 半截）不炸，回到初始形状', () => {
    engine.fromJSON(null);
    engine.fromJSON({ stats: null, objectives: { 'no-such-row': { status: 'done' } } });
    expect(snapshot(engine.stats)).toEqual(snapshot(emptyStats()));
    expect(engine.getObjective('no-such-row')).toBeUndefined();
  });
});

describe('本类的现状：接线之前只有这条用例供着它', () => {
  it('src/ 里没有任何模块 import ObjectiveEngine（有了就删掉本用例并更新头注）', () => {
    const importers = [];
    const self = join(SRC, 'game', 'ObjectiveEngine.js');
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.js') && full !== self) {
          const code = readFileSync(full, 'utf8');
          if (/from\s+['"][^'"]*ObjectiveEngine(\.js)?['"]/.test(code)) importers.push(relative(SRC, full));
        }
      }
    };
    walk(SRC);
    expect(importers, `已有消费者：${importers.join(', ')}`).toEqual([]);
  });
});
