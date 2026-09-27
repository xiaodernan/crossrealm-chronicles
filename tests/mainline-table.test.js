import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { installWindowShim } from './helpers/enemyHarness.js';
import {
  BOSS_STAT_KEYS, MAINLINE, OBJECTIVES, chapterGateAfter, interactGateCondition,
} from '../src/content/objectives.js';
import { checkObjectiveTable, checkTable, CONTENT_TABLES } from '../src/content/registry.js';
import { MAP_BOSSES, QuestSystem } from '../src/game/QuestSystem.js';
import { BossApproachDirector } from '../src/world/BossApproachDirector.js';
import { BossRematchDirector } from '../src/world/BossRematchDirector.js';

/**
 * 主线只有一张表（W-B3 切片3 的门禁）。
 *
 * 切片3 收掉的不是"两张表内容不同"这种会报错的东西，而是**两份各自都对的抄本**：
 * `QuestSystem` 带着 32 行手抄任务定义、一张按 id 抄的路点表、四行"哪一步完成时翻章"，
 * 而 `content/objectives.js` 那张表把五只 Boss 都写成 `type:'boss'` + 各自的 `bossId`，
 * 并且给每一行标了 `chapter`。任何一处改动只落在其中一份时，全仓没有一条用例会红。
 * 所以这里钉的是"表说什么，序列做什么"这四件事的**位置**：
 *  ① 玩家序列是表的一个投影，且投影与旧抄本同序同行 —— 存档下标语义由冻结的 golden 钉住；
 *  ② 序列文件里不许再长出自己的表；
 *  ③ 章节由门控行**按位置**说话（`chapterGateAfter` 读紧跟其后的那一行），
 *     这个位置前提由注册表整表不变式双向盯着；
 *  ④ 从表里派生出来的那张 `MAP_BOSSES` 必须喂得动它的六个消费者 ——
 *     这里的行为用例实测到：手抄那份没有 `bossId` 这一格，于是 Boss 再战从来不会发生，
 *     首次靠近播报在整个游戏里只响一次（见下方用例的注释）。
 */

const SRC = join(process.cwd(), 'src');
/** 序列文件的源码文本。结构断言只看它，不看编译产物 */
const SEQ = readFileSync(join(SRC, 'game', 'QuestSystem.js'), 'utf8');
/** 去掉注释后的代码：文件头讲的是"这里以前有什么"，那些名字只该出现在注释里 */
const CODE = SEQ.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const walkSrc = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walkSrc(full) : (name.endsWith('.js') ? [full] : []);
});
const rel = (file) => file.slice(SRC.length + 1).replace(/\\/g, '/');

/**
 * 切片3 动手之前**在役**的那份手抄表的 id 与顺序（`git show d90fbcf:src/game/QuestSystem.js`）。
 *
 * 这是一份冻结的 golden，不从 `MAINLINE` 推：存档里的 `quests.questIndex` 就是这条序列的下标，
 * 老档读进来要落回同一步。用被检对象自己当基线等于什么都没钉住。
 */
const HEAD_ORDER = [
  'anchor', 'training', 'soldiers', 'fantasy-frag', 'boss', 'magic-frag', 'golem', 'space-frag',
  'finale', 'chests', 'talk-wanderer', 'boss2', 'elite', 'level', 'epilogue', 'learn-spell',
  'crypt', 'library', 'rift', 'boss3', 'mind', 'ascension', 'void-rift', 'charge-spell',
  'void-boss', 'void-tablet', 'true-end', 'chaos-core', 'skills', 'chaos-boss',
  'dungeon-rerun', 'infinity',
];

const gates = OBJECTIVES.filter((r) => r.type === 'chapter-gate');

beforeEach(() => { installWindowShim(); });
afterEach(() => {
  globalThis.window = undefined;
  globalThis.CustomEvent = undefined;
});

describe('① 玩家序列 = 表的投影，且与旧抄本同序同行', () => {
  it('MAINLINE 就是切片3 之前在役的那 32 步，同 id 同序（存档 questIndex 语义不变）', () => {
    expect(HEAD_ORDER).toHaveLength(32);
    expect(new Set(HEAD_ORDER).size, '老抄本里有重复 id').toBe(HEAD_ORDER.length);
    expect(MAINLINE.map((r) => r.id)).toEqual(HEAD_ORDER);
  });

  it('投影只去掉章节门控行：一格不多一格不少，且不重排', () => {
    expect(MAINLINE.every((r) => r.type !== 'chapter-gate')).toBe(true);
    expect(OBJECTIVES.length - MAINLINE.length).toBe(gates.length);
    // 全表里那些非门控行，按表序读出来必须与投影完全一致（投影不是另排一遍）
    expect(OBJECTIVES.filter((r) => r.type !== 'chapter-gate').map((r) => r.id))
      .toEqual(MAINLINE.map((r) => r.id));
    expect(gates.length).toBe(5);
  });

  it('门控行没漏进玩家序列，也没有玩家步被投影掉（每格都数得过来）', () => {
    const ids = new Set(MAINLINE.map((r) => r.id));
    for (const g of gates) expect(ids.has(g.id), `${g.id} 是门控行，不该出现在玩家序列里`).toBe(false);
    // 表里每一行都必须有归属：要么在序列里，要么是门控行
    for (const r of OBJECTIVES) {
      expect(ids.has(r.id) || r.type === 'chapter-gate', `${r.id} 既不在序列也不是门控行`).toBe(true);
    }
  });
});

describe('② 序列文件不再长出自己的表', () => {
  it('那张按 id 抄的路点表与四行"哪一步翻章"都不在这个文件里了', () => {
    // 只看代码：文件头那段历史说明里全是这些被删掉的名字，扫注释会得到一句假红
    expect(CODE).not.toMatch(/\bQUESTS\b\s*=/);
    expect(CODE).not.toMatch(/QUEST_WAYPOINTS/);
    // 旧抄本用行上的旗标表达门控，新表把它写成那一行自己的 `condition`
    expect(CODE).not.toMatch(/\brequire(AllFragments|Ascension|TrueEnd|Infinity)\b/);
    // 翻章不再认"刚完成的那一步叫什么"
    expect(CODE).not.toMatch(/finished\??\.id\s*===/);
    expect(CODE).toMatch(/chapterGateAfter\(/);
    expect(CODE).toMatch(/MAINLINE/);
  });

  it('全仓没有第二个消费者还在找那份手抄表（旧导出名彻底没了）', () => {
    const files = walkSrc(SRC);
    // 从 QuestSystem 的 import 具名清单里查 `QUESTS`：注释里提到这个词是历史说明，不算引用
    const importers = [];
    for (const f of files) {
      const code = readFileSync(f, 'utf8');
      for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*QuestSystem\.js['"]/g)) {
        if (m[1].split(',').map((s) => s.trim()).includes('QUESTS')) importers.push(rel(f));
      }
    }
    expect(importers, '还在从序列文件 import 那份手抄表').toEqual([]);
    // 序列文件自己不导出表；导出的是序列的消费者要用的那份地图标记
    expect(SEQ).not.toMatch(/^export const QUESTS\b/m);
    expect(SEQ).toMatch(/^export const MAP_BOSSES\b/m);
    // 六处消费者（HUD / 世界地图 / 罗盘 / 三个 director）今天确实还在按 `MAP_BOSSES` 取货
    const readers = files.filter((f) => /MAP_BOSSES/.test(readFileSync(f, 'utf8')) && !f.endsWith('QuestSystem.js'));
    expect(readers.length).toBeGreaterThanOrEqual(5);
  });
});

describe('③ 章节由门控行按位置说话（chapterGateAfter 与整表不变式）', () => {
  it('每一道门都紧跟在为它之外的那一步后面，且为那一行开门', () => {
    expect(gates.length).toBeGreaterThan(0);
    for (const g of gates) {
      const i = OBJECTIVES.indexOf(g);
      const prev = OBJECTIVES[i - 1];
      expect(prev, `${g.id} 前面没有行`).toBeTruthy();
      expect(prev.type).not.toBe('chapter-gate');
      expect(chapterGateAfter(prev.id), `${prev.id} 走完后跨不过 ${g.id}`).toBe(g);
      // 门控行后面不该再紧跟一道门（那第二道永远轮不到）
      expect(chapterGateAfter(g.id)).toBeNull();
    }
  });

  it('走完门前那一步就翻章，翻到门标的那一档（翻章不认这一步叫什么）', () => {
    expect(chapterGateAfter('no-such-objective')).toBeNull();
    const gate = gates[0];
    const before = OBJECTIVES[OBJECTIVES.indexOf(gate) - 1];
    expect(before.type).not.toBe('chapter-gate');
    const probe = new QuestSystem({ toast() {}, play() {} });
    probe.questIndex = MAINLINE.findIndex((r) => r.id === before.id);
    expect(probe.current.id).toBe(before.id);
    expect(probe.chapter).toBe(1);
    probe.advance();                        // 序列只把"完成的是哪一步"交给位置去问
    expect(probe.chapter).toBe(gate.chapter);
  });

  it('真表过整表不变式：一条都不报（accept 方向，且门确实有 5 道）', () => {
    expect(checkObjectiveTable(OBJECTIVES)).toEqual([]);
    expect(OBJECTIVES.filter((r) => r.type === 'chapter-gate' && r.announce)).toHaveLength(4);
  });

  it('不变式接在注册表的槽位上，不是只被这份用例调用的一个孤立函数', () => {
    const entry = CONTENT_TABLES.find((t) => t.kind === 'objectives');
    expect(entry, '注册表里没有 objectives 这一条（那下面那句走的就是没人走的代码）').toBeTruthy();
    const planted = structuredClone(OBJECTIVES);
    delete planted[OBJECTIVES.indexOf(gates[0])].autoComplete;
    // 走 shipped 入口 `checkTable`：它替不变式说话，才算这条规则在开机检查里活着
    expect(checkTable(entry)).toEqual([]);
    expect(checkTable({ ...entry, table: planted }).some((m) => m.includes('autoComplete')))
      .toBe(true);
  });

  /** 跑一份表的副本，返回不变式报的条数与第一条消息 */
  const runWith = (mutate) => {
    const table = structuredClone(OBJECTIVES);
    mutate(table);
    const issues = checkObjectiveTable(table);
    expect(issues.length, '这份变异没被整表不变式抓到').toBeGreaterThan(0);
    return issues;
  };
  const indexOf = (id) => OBJECTIVES.findIndex((r) => r.id === id);

  it('双向：在门前插一步 → 位置前提断了', () => {
    const g = gates[0];
    const issues = runWith((t) => t.splice(indexOf(g.id), 0, {
      id: 'plant-extra-step', type: 'hits', target: 1, chapter: g.chapter,
    }));
    expect(issues.some((m) => m.includes(`("${g.id}")`) && m.includes('branchTo')))
      .toBe(true);
  });

  it('双向：开门那一格删掉 announce → 喊话失踪', () => {
    const g = gates.find((r) => r.announce);
    const issues = runWith((t) => { delete t[indexOf(g.id)].announce; });
    expect(issues.some((m) => m.includes('announce') && m.includes(`("${g.id}")`))).toBe(true);
  });

  it('双向：不给玩家开新章的那道门写 announce → 多喊一句', () => {
    const g = gates.find((r) => !r.announce);
    expect(g, '表里没有"不翻章的门控行"，这条无从反证').toBeTruthy();
    const issues = runWith((t) => { t[indexOf(g.id)].announce = 'Chapter 9：瞎写的一章'; });
    expect(issues.some((m) => m.includes('没有开新章') && m.includes(`("${g.id}")`))).toBe(true);
  });

  it('双向：announce 喊的章号与 chapter 不一致 → 抓住', () => {
    const g = gates.find((r) => r.announce);
    const issues = runWith((t) => { t[indexOf(g.id)].announce = 'Chapter 9：不是这一章'; });
    expect(issues.some((m) => m.includes('喊的不是第'))).toBe(true);
  });

  it('双向：章节沿表回退 → 抓住', () => {
    const i = indexOf('boss2');            // 表中间的一格，改小它必然比前一行小
    const issues = runWith((t) => { t[i].chapter = 1; });
    expect(issues.some((m) => m.includes('比上一行') && m.includes('("boss2")'))).toBe(true);
  });

  it('双向：requires 用了一个更晚才产出的标志 → 抓住（那一步永远激活不了）', () => {
    const i = indexOf('training');
    const issues = runWith((t) => { t[i].requires = { boss2Defeated: true }; });
    expect(issues.some((m) => m.includes('requires.boss2Defeated') && m.includes('没有任何一步')))
      .toBe(true);
  });

  it('双向：requires 要的值与产出方写的值不同 → 抓住', () => {
    // 把 `hasFragmentFantasy` 的产出改成 false：读取方要 true，两者不再同一句话
    const i = indexOf('fantasy-frag');
    const issues = runWith((t) => { t[i].flags = { hasFragmentFantasy: false }; });
    expect(issues.some((m) => m.includes('requires.hasFragmentFantasy'))).toBe(true);
  });

  it('双向：玩家步借用门控行的字段 → 抓住', () => {
    const issues = runWith((t) => {
      t[indexOf('chests')].autoComplete = true;
      t[indexOf('level')].announce = 'Chapter 2：乱喊';
    });
    expect(issues.filter((m) => m.includes('只有 chapter-gate 那一族才有'))).toHaveLength(2);
  });

  it('双向：branchTo 指向不相邻的那一行 → 抓住', () => {
    const issues = runWith((t) => { t[indexOf('finale')].branchTo = 'ch2-complete'; });
    expect(issues.some((m) => m.includes('不是紧跟其后的那一行'))).toBe(true);
  });

  it('双向：门控行忘了 autoComplete → 主线在那一格断掉', () => {
    const g = gates[0];
    const issues = runWith((t) => { delete t[indexOf(g.id)].autoComplete; });
    expect(issues.some((m) => m.includes('autoComplete') && m.includes(`("${g.id}")`))).toBe(true);
  });
});

describe('④ 派生出来的 MAP_BOSSES 喂得动它的六个消费者', () => {
  it('每一只骷髅带的字段都是消费者要的那几个', () => {
    expect(MAP_BOSSES.length).toBe(Object.keys(BOSS_STAT_KEYS).length);
    for (const b of MAP_BOSSES) {
      for (const key of ['bossId', 'label', 'short', 'color']) {
        expect(typeof b[key], `${b.bossId ?? '?'} 的 ${key} 不是字符串（手抄那版就没有 bossId）`)
          .toBe('string');
        expect(b[key].length).toBeGreaterThan(0);
      }
      expect(BOSS_STAT_KEYS[b.bossId], `骷髅上的 ${b.bossId} 不在名册上`).toBeTruthy();
      expect(Number.isInteger(b.chapter)).toBe(true);
      expect(b.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  /** 只实现这两个 director 真正调用的接口，别的一律不给 */
  const host = (spawns) => ({
    keys: { KeyE: true },
    dialog: { open: false, toast: (t) => spawns.toasts.push(t) },
    dungeons: { active: false },
    // 生产方在这里真的调 `stats.toJSON()`（再战之后要把读数广播出去），stub 少一格就是假红
    stats: { addSouls() {}, toJSON: () => ({ souls: 20, level: 5 }) },
    storyJournal: { add: (e) => spawns.entries.push(e) },
    quests: { chapter: 1, stats: {} },
    enemyManager: spawns,
  });

  it('击败哪只 Boss，就能在它自己的信标处按 E 再战（五只各自成立）', () => {
    for (const b of MAP_BOSSES) {
      const spawns = { toasts: [], entries: [], enemies: [] };
      for (const name of ['spawnBoss', 'spawnMagicBoss', 'spawnSpaceBoss', 'spawnVoidBoss', 'spawnChaosBoss']) {
        spawns[name] = (opts) => { spawns.called = [name, opts]; };
      }
      const d = new BossRematchDirector(host(spawns));
      d.defeated.add(b.bossId);
      d.update(0.016, { x: b.x, z: b.z });
      expect(spawns.called, `${b.bossId} 在自己的信标处按 E 没有再战`).toBeTruthy();
      expect(spawns.called[1].bossId).toBe(b.bossId);
      expect(spawns.toasts.some((t) => t.includes('再战'))).toBe(true);
    }
  });

  it('没击败时不按 E 也不召唤；击败别人不算在自己头上', () => {
    const spawns = { toasts: [], entries: [], enemies: [] };
    const d = new BossRematchDirector(host(spawns));
    d.update(0.016, { x: MAP_BOSSES[0].x, z: MAP_BOSSES[0].z });
    expect(spawns.called).toBeUndefined();
    d.defeated.add(MAP_BOSSES[1].bossId);      // 只有第二只死了
    d.update(0.016, { x: MAP_BOSSES[0].x, z: MAP_BOSSES[0].z });
    expect(spawns.called).toBeUndefined();
  });

  it('五只 Boss 的信标各播报一次，不是一整个游戏只响一次', () => {
    const box = { toasts: [], entries: [] };
    const d = new BossApproachDirector(host(box));
    for (const b of MAP_BOSSES) d.update(99, { x: b.x, z: b.z });   // dt 顺带把 8 秒冷却走完
    expect(box.toasts).toHaveLength(MAP_BOSSES.length);
    expect(box.entries.map((e) => e.id)).toEqual(MAP_BOSSES.map((b) => `boss-beacon-${b.bossId}`));
    // 播报的是给玩家看的那段 Boss 介绍，不是地图上那两个字的简称
    for (const [i, e] of box.entries.entries()) {
      expect(e.text.length).toBeGreaterThan(MAP_BOSSES[i].label.length);
      expect(e.text).toContain(MAP_BOSSES[i].label.slice(0, 1));
    }
  });

  it('同一只 Boss 反复靠近只播报一次（seen 按 bossId 记账，不是按 undefined）', () => {
    const box = { toasts: [], entries: [] };
    const d = new BossApproachDirector(host(box));
    const b = MAP_BOSSES[0];
    d.update(99, { x: b.x, z: b.z });
    d.update(99, { x: b.x, z: b.z });
    d.update(99, { x: b.x, z: b.z });
    expect(box.toasts).toHaveLength(1);
    expect([...d.seen]).toEqual([b.bossId]);
  });
});

describe('门控条件只有一处表达', () => {
  it('序列与判据读的是同一格：`interactGateCondition` 认出的门，正是表上写了 condition 的那些行', () => {
    const byRow = MAINLINE.filter((r) => r.condition).map((r) => r.id);
    const byHelper = MAINLINE.filter((r) => interactGateCondition(r)).map((r) => r.id);
    expect(byHelper).toEqual(byRow);
    expect(byRow).toHaveLength(4);
    // 旗标写法不许回来：任何一行都不靠 requireXxx 表达门控
    for (const r of OBJECTIVES) {
      expect(Object.keys(r).filter((k) => /^require[A-Z]/.test(k)), `${r.id} 上还有旗标写法`)
        .toEqual([]);
    }
  });
});
