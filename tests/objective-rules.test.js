import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOSS_STAT_KEYS, BOSS_TYPES, CONDITIONS, GATE_CONDITIONS, INTERACT_GATES,
  OBJECTIVES, STAT_READINGS,
  applyStatEvent, conditionHolds, emptyStats, hasInteractGate, interactGateCondition,
  objectiveDone, statsFromJSON, statsToJSON,
} from '../src/content/objectives.js';
import { QUESTS } from '../src/game/QuestSystem.js';
import { SaveValidator } from '../src/game/SaveValidator.js';

/**
 * 门禁：任务的三本账（判据 / 记账 / Boss 名册）各只有 `content/objectives.js` 一份（W-B3 切片2）。
 *
 * 为什么钉这一层：切片2 动手之前，同一句「这一步完成了没有」在三处各写一遍
 * （`QuestSystem.isQuestObjectiveDone`、`QuestSystem.checkProgress`、`ObjectiveEngine.progressObjective`），
 * 记账表两遍，名册（哪只 Boss 死了算哪一格）五段 if。实测漂移已经发生：
 * 引擎那份把新表的 `boss2` 行当 `type: 'boss'` 读，于是**影界守护者一倒地，大奥术师就被判完成**。
 * 这类问题的共同形状是"改一份而另两份不动时不报错"，所以这里的断言全部**从两张表的行反推**，
 * 不把我脑子里那份清单抄成字面量。
 */

const SRC = join(process.cwd(), 'src');
/** 取一个导出函数的源码文本（从声明到顶格的 `}`），断言从它自己的正文推，不从我手写的清单推 */
function functionText(name) {
  const code = readFileSync(join(SRC, 'content/objectives.js'), 'utf8');
  const start = code.indexOf(`export function ${name}(`);
  if (start < 0) throw new Error(`找不到 ${name}`);
  const end = code.slice(start).search(/^\}/m);
  return code.slice(start, start + end + 1);
}

/** 账本快照（深拷贝：Set 转有序数组，`kills` 那格必须复制，否则 before/after 是同一个对象） */
function snapshot(s) {
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (v instanceof Set) out[k] = [...v].sort();
    else if (v && typeof v === 'object') out[k] = JSON.parse(JSON.stringify(v));
    else out[k] = v;
  }
  return out;
}

/** 把两张表的行都过一遍判据，返回「账本一格满足全部条件」时每一步的读数 */
const SATISFIED = () => {
  const s = emptyStats();
  s.hits = 9999;
  for (const row of [...QUESTS, ...OBJECTIVES]) {
    if (row.enemyType) s.kills[row.enemyType] = 9999;
    if (row.targetId) s.discoveries.add(row.targetId);
    if (row.dungeonId) s.dungeonsCleared.add(row.dungeonId);
  }
  s.npcTalked.add('wanderer');
  s.npcTalked.add('astronaut-echo');
  for (const row of [...QUESTS, ...OBJECTIVES]) if (row.type === 'npc') s.npcTalked.add(row.targetId);
  s.chestsOpened = 9999;
  s.spellCasts = 9999;
  s.chargedCasts = 9999;
  s.skillsUnlocked = 99;
  s.dungeonRerun = true;
  s.level = 99;
  s.mind = 99;
  for (const key of Object.values(BOSS_STAT_KEYS)) s[key] = true;
  return s;
};

describe('账本形状：emptyStats 与判据/记账双向对齐', () => {
  it('判据从账本读到的每一个具名格子都在 emptyStats 里存在（少一格就是读到 undefined）', () => {
    const reads = [...functionText('objectiveDone').matchAll(/stats\.([A-Za-z_]\w*)/g)].map((m) => m[1]);
    expect(reads.length).toBeGreaterThan(8);
    const keys = Object.keys(emptyStats());
    const missing = [...new Set(reads)].filter((k) => !keys.includes(k));
    expect(missing).toEqual([]);
  });

  it('每一条事件都真的往账上写了一格：跑完一遍后没有一格纹丝不动', () => {
    const s = emptyStats();
    const before = snapshot(s);
    const kills = [{ type: 'soldier' }];
    for (const bossId of Object.keys(BOSS_STAT_KEYS)) kills.push({ type: 'boss', bossId });
    const details = {
      'combat-hit': [{}],
      'enemy-defeated': kills,
      'spell-cast': [{}, { charged: true }],
      'dungeon-cleared': [{ id: 'ruin-crypt' }, { id: 'ruin-crypt' }],
      'weapon-skill-unlocked': [{}],
      'chest-opened': [{}],
      'npc-talk': [{ id: 'wanderer' }],
      'discovery': [{ id: 'hub-anchor' }],
      'poi-interact': [{ id: 'fantasy-ring' }],
      'stats-changed': [{ level: 7, mind: 3 }],
    };
    for (const [name, list] of Object.entries(details)) {
      for (const detail of list) applyStatEvent(s, name, detail);
    }
    const after = snapshot(s);
    const moved = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
    // 反方向也要问：账本里不许有一格谁也不写（那判据读到的永远是初始值）
    expect(moved.sort()).toEqual(Object.keys(emptyStats()).sort());
  });

  it('STAT_EVENTS 的名字全在事件登记表里，且未知事件名不改账、不抛', () => {
    const s = emptyStats();
    expect(applyStatEvent(s, 'not-a-game-event', {})).toBe(false);
    expect(snapshot(s)).toEqual(snapshot(emptyStats()));
    expect(applyStatEvent(s, 'combat-hit', undefined)).toBe(true);
    expect(s.hits).toBe(1);
  });

  it('读数格不落盘、也不从磁盘取（磁盘那份是过期值）', () => {
    const s = emptyStats();
    applyStatEvent(s, 'stats-changed', { level: 9, mind: 4 });
    applyStatEvent(s, 'weapon-skill-unlocked', {});
    const raw = statsToJSON(s);
    for (const key of STAT_READINGS) expect(raw).not.toHaveProperty(key);
    const back = statsFromJSON({ ...raw, level: 9, mind: 4, skillsUnlocked: 99 });
    for (const key of STAT_READINGS) expect(back[key]).toEqual(emptyStats()[key]);
    // 生产方随后推一次就以它为准（读档链上 applyData 末尾那条 stats-changed）
    applyStatEvent(back, 'stats-changed', { level: 9, mind: 4 });
    expect([back.level, back.mind]).toEqual([9, 4]);
  });

  it('磁盘上多出来的键进不来，缺的格子回到初始值，Set 复原成 Set', () => {
    const back = statsFromJSON({
      discoveries: ['hub-anchor'], npcTalked: ['wanderer'],
      kills: { soldier: 3 }, dungeonRerun: true, ghostsFromOldSave: 1,
    });
    expect(back.discoveries).toBeInstanceOf(Set);
    expect([...back.discoveries]).toEqual(['hub-anchor']);
    expect(back.kills).toEqual({ soldier: 3 });
    expect(back.chestsOpened).toBe(0);
    expect(back).not.toHaveProperty('ghostsFromOldSave');
    expect(statsFromJSON(null)).toEqual(emptyStats());
    expect(statsFromJSON('nonsense')).toEqual(emptyStats());
  });

  it('存档侧的形状与校验器说的那十四格一模一样（不靠版本号，靠校验器本人）', () => {
    const issues = [];
    SaveValidator.validateQuestStats(statsToJSON(emptyStats()), issues);
    expect(issues).toEqual([]);
    // 反证：派生值一旦落盘，校验器就该拒绝（v5 的那条规矩今天仍然成立）
    const dirty = { ...statsToJSON(emptyStats()), skillsUnlocked: 4 };
    const issues2 = [];
    SaveValidator.validateQuestStats(dirty, issues2);
    expect(issues2).toEqual(['quests.stats.skillsUnlocked 已在 v5 移除（派生值）']);
  });
});

describe('Boss 名册：哪只死了算哪一格只有一份', () => {
  it('名册的五格都在账本里，且都是布尔初始值', () => {
    const keys = Object.values(BOSS_STAT_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    const s = emptyStats();
    for (const key of keys) expect(s[key]).toBe(false);
  });

  it('两张表里每一行 Boss 都在名册上，名册上每一只都有行来认领', () => {
    const roster = Object.keys(BOSS_STAT_KEYS);
    const inRoster = (row) => BOSS_TYPES.has(row.type);
    for (const rows of [QUESTS, OBJECTIVES]) {
      const bossIds = rows.filter(inRoster).map((r) => r.bossId);
      expect(new Set(bossIds).size).toBe(bossIds.length);
      for (const id of bossIds) expect(roster).toContain(id);
      // 名册里的每一只都必须在两张表里各有一只行认领（主线五只 Boss 各一张表都要走到）
      for (const id of roster) expect(bossIds).toContain(id);
    }
  });

  it('新表把 boss2 写成 type:"boss" 也不再读错格子（切片2 实测到的那个雷）', () => {
    const s = emptyStats();
    applyStatEvent(s, 'enemy-defeated', { type: 'boss', bossId: 'shadow-warden' });
    const row = OBJECTIVES.find((r) => r.id === 'boss2');
    expect(row.type).toBe('boss');
    expect(objectiveDone(row, s)).toBe(false);
    applyStatEvent(s, 'enemy-defeated', { type: 'boss', bossId: 'archmagus' });
    expect(objectiveDone(row, s)).toBe(true);
  });

  it('名册外的 bossId 不许点亮任何一格（宁可卡住也不张冠李戴）', () => {
    const s = emptyStats();
    applyStatEvent(s, 'enemy-defeated', { type: 'boss', bossId: 'nobody-home' });
    for (const key of Object.values(BOSS_STAT_KEYS)) expect(s[key]).toBe(false);
    expect(objectiveDone({ type: 'boss', bossId: 'nobody-home' }, s)).toBe(false);
  });

  it('击杀归类看 type 不看显示名（B36：虚空仆从是 soldier 不是 elite）', () => {
    const s = emptyStats();
    applyStatEvent(s, 'enemy-defeated', { type: 'soldier', name: '虚空仆从' });
    expect(s.kills).toEqual({ soldier: 1 });
    expect(s.kills.elite).toBeUndefined();
  });
});

describe('判据：一张表一份算式', () => {
  it('两张表的每一行都被判据认得（账本满足时必然报"完成"）', () => {
    const s = SATISFIED();
    const unrecognized = [];
    for (const [table, rows] of [['QUESTS', QUESTS], ['OBJECTIVES', OBJECTIVES]]) {
      for (const row of rows) {
        if (hasInteractGate(row)) continue;   // 门控格按设计不因账本满足就算完成
        if (!objectiveDone(row, s)) unrecognized.push(`${table}:${row.id}(${row.type})`);
      }
    }
    expect(unrecognized).toEqual([]);
  });

  it('数值步用 >= 而不是 ===（多砍一刀不许把已完成那步判回未完成）', () => {
    const s = emptyStats();
    s.hits = 9;
    expect(objectiveDone({ type: 'hits', target: 8 }, s)).toBe(true);
    s.spellCasts = 4;
    expect(objectiveDone({ type: 'spells', target: 8 }, s)).toBe(false);
  });

  it('门控的"摸锚点"不因摸了一下就算完成 —— 两种写法都拦（在役表的 requireX 与新表的 condition）', () => {
    const s = SATISFIED();
    const legacy = QUESTS.filter((r) => INTERACT_GATES.some((k) => r[k]));
    const modern = OBJECTIVES.filter((r) => r.type === 'interact' && r.condition);
    expect(legacy.length).toBe(4);
    expect(modern.length).toBeGreaterThanOrEqual(4);
    for (const row of [...legacy, ...modern]) {
      expect(s.discoveries.has(row.targetId)).toBe(true);
      expect(objectiveDone(row, s)).toBe(false);
    }
  });

  it('不门控的 interact 与 discovery 只看摸没摸过', () => {
    const s = emptyStats();
    const row = QUESTS[0];
    expect(objectiveDone(row, s)).toBe(false);
    applyStatEvent(s, 'poi-interact', { id: row.targetId });
    expect(objectiveDone(row, s)).toBe(true);
  });

  it('level / mind 读的是账本里那两格读数，不是磁盘或属性名', () => {
    const s = emptyStats();
    applyStatEvent(s, 'stats-changed', { level: 4 });
    expect(objectiveDone({ type: 'level', target: 5 }, s)).toBe(false);
    applyStatEvent(s, 'stats-changed', { level: 5 });
    expect(objectiveDone({ type: 'level', target: 5 }, s)).toBe(true);
    const m = emptyStats();
    expect(objectiveDone({ type: 'mind', target: 2 }, m)).toBe(false);
    applyStatEvent(m, 'stats-changed', { mind: 2 });
    expect(objectiveDone({ type: 'mind', target: 2 }, m)).toBe(true);
    // 一条不带读数的 stats-changed 不许把已有读数抹掉
    applyStatEvent(m, 'stats-changed', {});
    expect(m.mind).toBe(2);
  });

  it('未知类型一律判未完成（新增一族却忘了写算式时，卡住比白送好）', () => {
    expect(objectiveDone({ type: 'who-knows' }, SATISFIED())).toBe(false);
    expect(objectiveDone(null, SATISFIED())).toBe(false);
  });

  it('chapter-gate 由 autoComplete 说话，不靠账本', () => {
    const s = emptyStats();
    expect(objectiveDone({ type: 'chapter-gate' }, s)).toBe(false);
    expect(objectiveDone({ type: 'chapter-gate', autoComplete: true }, s)).toBe(true);
  });
});

describe('门控条件：四种写法指向同一份算式', () => {
  it('每一条 INTERACT_GATES 都登记了条件函数名，而且那个函数真的存在', () => {
    const missing = INTERACT_GATES.filter((k) => !(k in GATE_CONDITIONS));
    expect(missing).toEqual([]);
    const dangling = INTERACT_GATES
      .map((k) => GATE_CONDITIONS[k])
      .filter((fn) => !CONDITIONS[fn]);
    expect(dangling).toEqual([]);
  });

  it('在役表的四个门控旗标各自映射到新表里那一格的 condition 名', () => {
    for (const flag of INTERACT_GATES) {
      const legacy = QUESTS.find((r) => r[flag]);
      expect(legacy).toBeTruthy();
      expect(interactGateCondition(legacy)).toBe(GATE_CONDITIONS[flag]);
      const modern = OBJECTIVES.find((r) => r.type === 'interact' && r.condition === GATE_CONDITIONS[flag]);
      expect(modern, `新表里要有一行用同一个条件函数：${flag}`).toBeTruthy();
    }
  });

  it('没挂门控的行返回 null，未知条件名一律为假', () => {
    expect(interactGateCondition(QUESTS[0])).toBeNull();
    expect(interactGateCondition({ type: 'hits', target: 3 })).toBeNull();
    expect(conditionHolds('no-such-condition', SATISFIED())).toBe(false);
  });

  it('「三界试炼」少一只 Boss 不算齐（切片2 实测：表里那份当年漏算第三只 Boss）', () => {
    const s = emptyStats();
    for (const id of ['ruin-crypt', 'forbidden-library', 'five-dim-rift']) {
      applyStatEvent(s, 'dungeon-cleared', { id });
    }
    expect(conditionHolds('checkAllDungeons', s)).toBe(false);
    applyStatEvent(s, 'enemy-defeated', { type: 'boss', bossId: 'singularity-herald' });
    expect(conditionHolds('checkAllDungeons', s)).toBe(true);
  });

  it('真结局要四枚碎片 + 时线 Boss；无尽要混沌 Boss + 三个战技', () => {
    const s = emptyStats();
    applyStatEvent(s, 'enemy-defeated', { type: 'boss', bossId: 'void-chronarch' });
    expect(conditionHolds('checkTrueEnd', s)).toBe(false);
    for (const id of ['fantasy-ring', 'magic-castle', 'space-tesseract', 'void-rift']) {
      applyStatEvent(s, 'discovery', { id });
    }
    expect(conditionHolds('checkTrueEnd', s)).toBe(true);

    const t = emptyStats();
    applyStatEvent(t, 'enemy-defeated', { type: 'boss', bossId: 'chaos-overlord' });
    expect(conditionHolds('checkInfinity', t)).toBe(false);
    applyStatEvent(t, 'weapon-skill-unlocked', {});
    applyStatEvent(t, 'weapon-skill-unlocked', {});
    expect(conditionHolds('checkInfinity', t)).toBe(false);
    applyStatEvent(t, 'weapon-skill-unlocked', {});
    expect(conditionHolds('checkInfinity', t)).toBe(true);
  });
});
