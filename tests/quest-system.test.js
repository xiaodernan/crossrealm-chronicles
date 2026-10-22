import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installWindowShim } from './helpers/enemyHarness.js';
import { MAP_BOSSES, QuestSystem } from '../src/game/QuestSystem.js';
import { SaveSystem } from '../src/game/SaveSystem.js';
import {
  MAINLINE, OBJECTIVES, STAT_EVENTS, BOSS_STAT_KEYS, STAT_READINGS,
  emptyStats, interactGateCondition, statsToJSON,
} from '../src/content/objectives.js';

/**
 * 在役主线任务系统的行为账（W-B3 切片2 立，切片3 换表）。
 *
 * `QuestSystem` 是今天真正在跑的那一套（`core/Game.js` 装配它）。切片3 把它自己那份 32 行手抄表
 * 删了，序列改读 `content/objectives.js` 的非门控投影 `MAINLINE`，所以这里测的三件事不变：
 *  ① 十件事件仍然各记各的账并推动当前步（`setupListeners` 从九段 if 变成一个循环）；
 *  ② 门控的「摸锚点」仍然要条件齐时的那一下交互（条件名就写在那一行自己的 `condition` 上）；
 *  ③ Boss 的显示与路点按 `bossId` 认领 —— 五段硬编码 if 换成名册一次查表，
 *     而 `MAP_BOSSES` 与名册的位置对应由坐标反证（顺序错了就红，不靠肉眼）。
 */

const SELF = join(process.cwd(), 'src', 'game', 'QuestSystem.js');
/** 一只事件的最小负载，形状照 `engine/events.js` 登记表 */
const D = {
  hit: { damage: 10, target: 'dummy' },
  kill: (type) => ({ name: '影之战士', type }),
  bossKill: (bossId) => ({ name: bossId, type: 'boss', bossId }),
  discover: (id) => ({ id, title: '', text: '', category: 'frag' }),
  interact: (id) => ({ id }),
  /** 清空一座副本（W-E3 切片13 起主线里有了副本步 ⇒ 用例要能走完那一步） */
  dungeon: (id) => ({ id, name: '副本' }),
  /** 与一位 NPC 说过话（W-E3 切片15 起主线里有了对话步） */
  npcTalk: (id) => ({ id, line: '', chapter: 1 }),
};

let win;
let toasts;
let dialog;
let qs;

function dispatch(name, detail) {
  win.dispatchEvent(new CustomEvent(name, { detail }));
}

beforeEach(() => {
  installWindowShim();
  win = globalThis.window;
  toasts = [];
  dialog = { toast: (t) => toasts.push(t), play() {} };
  qs = new QuestSystem(dialog);
});

afterEach(() => {
  globalThis.window = undefined;
  globalThis.CustomEvent = undefined;
  win = undefined;
  qs = undefined;
});

function snapshot(s) {
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    out[k] = v instanceof Set ? [...v].sort() : (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
  }
  return JSON.stringify(out);
}

describe('监听：十件事各记各的账，并推动当前这一步', () => {
  it('STAT_EVENTS 里的每一件事都改到账上（循环取代九段 if 之后仍是一条不落）', () => {
    for (const name of Object.keys(STAT_EVENTS)) {
      const before = snapshot(qs.stats);
      const detail = name === 'enemy-defeated' ? D.kill('soldier')
        : name === 'dungeon-cleared' ? { id: 'ruin-crypt' }
          : name === 'npc-talk' ? { id: 'wanderer', line: '', chapter: 1 }
            : name === 'discovery' ? D.discover('fantasy-ring')
              : name === 'poi-interact' ? D.interact('chaos-core')
                : name === 'spell-cast' ? { id: 'bolt', name: '奥术弹' }
                  : name === 'chest-opened' ? { id: 'c1' }
                    : name === 'stats-changed' ? { souls: 100, level: 7, mind: 3, gear: { charm: { base: 'ash-charm' } } } : D.hit;
      dispatch(name, detail);
      expect(snapshot(qs.stats), `事件「${name}」没改到任何一格`).not.toBe(before);
    }
  });

  it('Chapter 1 八步走完就接上第二档（在役表是线性的，章节号只跟着四格门控翻）', () => {
    const titles = [qs.current.title];
    const step = (name, detail) => {
      dispatch(name, detail);
      if (qs.current && qs.current.title !== titles[titles.length - 1]) titles.push(qs.current.title);
    };
    step('poi-interact', D.interact('hub-anchor'));
    for (let i = 0; i < 8; i += 1) step('combat-hit', D.hit);
    // W-E3 切片13：第 1 章里多了一步「枢纽之下的墓穴」（副本步）⇒ 走完它才轮到影之战士
    step('dungeon-cleared', D.dungeon('hub-catacombs'));
    for (let i = 0; i < 2; i += 1) step('enemy-defeated', D.kill('soldier'));
    step('discovery', D.discover('fantasy-ring'));
    // W-E3 切片14：第 1 章多了一步「废墟里的回声」（发现步）⇒ 走完它才轮到影之战士
    step('discovery', D.discover('fantasy-ruins'));
    // W-E3 切片15：第 1 章多了一步「暗夜斥候」（对话步）⇒ 走完它才轮到影之战士
    step('npc-talk', D.npcTalk('elf-scout'));
    step('enemy-defeated', D.bossKill('shadow-warden'));
    // 前八格各推进一步，第九次读数落在下一档的第一步上
    expect(titles).toEqual(MAINLINE.slice(0, 9).map((q) => q.title));
    expect(qs.questIndex).toBe(8);
    expect(qs.chapter).toBe(1);
    expect(toasts.filter((t) => t.startsWith('任务完成：'))).toHaveLength(8);
  });

  it('账本里没有的那一下交互不改任务也不抛（载荷少一个 id 是常态）', () => {
    const index = qs.questIndex;
    expect(() => dispatch('poi-interact', {})).not.toThrow();
    expect(qs.questIndex).toBe(index);
  });
});

describe('门控的「摸锚点」：条件齐时那一下交互才推进', () => {
  it('碎片没齐时摸锚点不动；补齐后摸一下才翻章节并广播', () => {
    const gated = MAINLINE.findIndex((q) => interactGateCondition(q) === 'checkAllFragments');
    qs.questIndex = gated;
    const changed = [];
    win.addEventListener('chapter-changed', (e) => changed.push(e.detail));

    dispatch('poi-interact', D.interact('hub-anchor'));
    expect(qs.questIndex).toBe(gated);
    for (const id of ['fantasy-ring', 'magic-castle', 'space-tesseract']) {
      dispatch('discovery', D.discover(id));
      expect(qs.questIndex, `补齐 ${id} 之后不该就这一步算过`).toBe(gated);
    }
    dispatch('poi-interact', D.interact('hub-anchor'));
    expect(qs.questIndex).toBe(gated + 1);
    expect(qs.chapter).toBe(2);
    expect(changed).toEqual([{ chapter: 2, prev: 1 }]);
    expect(toasts).toContain('Chapter 2：无尽位面 已开启');
  });

  it('四个门控步同一个脾气：条件没齐时摸一百下也不算过', () => {
    const gatedRows = MAINLINE.filter((q) => interactGateCondition(q));
    expect(gatedRows.length).toBe(4);
    for (const row of gatedRows) {
      const probe = new QuestSystem(dialog);
      probe.questIndex = MAINLINE.indexOf(row);
      // 门控判据一律拒绝（哪怕锚点已经摸过），推进它的必须是条件齐时的那一下交互
      expect(probe.isQuestObjectiveDone(row)).toBe(false);
      probe.stats.discoveries.add(row.targetId);
      expect(probe.isQuestObjectiveDone(row)).toBe(false);
    }
  });
});

describe('Boss：名册一次查表，位置对应由坐标反证', () => {
  it('MAP_BOSSES 由表里的 Boss 行推出来，顺序与名册同序（对不上号就是地图骷髅指错了 Boss）', () => {
    const roster = Object.keys(BOSS_STAT_KEYS);
    expect(roster).toHaveLength(5);
    expect(MAP_BOSSES).toHaveLength(roster.length);
    // 切片3 之后这张表是 `MAINLINE.filter(名册认识)` 的投影：它自己不再有名次，名次来自表
    expect(MAP_BOSSES.map((b) => b.bossId)).toEqual(roster);
    for (const row of OBJECTIVES.filter((r) => BOSS_STAT_KEYS[r.bossId])) {
      const i = roster.indexOf(row.bossId);
      expect(i, `名册里没有 ${row.bossId}`).toBeGreaterThan(-1);
      // 地图上的骷髅与目标自己的路点必须是同一处 —— 抄错了坐标这条当场红
      expect([MAP_BOSSES[i].x, MAP_BOSSES[i].z], `${row.bossId} 的地图坐标与目标路点对不上`)
        .toEqual([row.waypoint.x, row.waypoint.z]);
      expect(MAP_BOSSES[i].chapter, `${row.bossId} 的地图章节号`).toBe(row.chapter);
    }
  });

  it('当前步是哪只 Boss，进度文本与路点就指向它（打完才改口）', () => {
    const roster = Object.keys(BOSS_STAT_KEYS);
    for (const row of MAINLINE.filter((q) => BOSS_STAT_KEYS[q.bossId])) {
      const probe = new QuestSystem(dialog);
      probe.questIndex = MAINLINE.indexOf(row);
      const other = roster.find((id) => id !== row.bossId);
      probe.stats[BOSS_STAT_KEYS[other]] = true;      // 别的 Boss 死了
      expect(probe.getProgressText()).toContain('Boss 红圈');
      const wp = probe.getQuestWaypoint();
      expect([wp.x, wp.z]).toEqual([MAP_BOSSES[roster.indexOf(row.bossId)].x, MAP_BOSSES[roster.indexOf(row.bossId)].z]);
      expect(wp.label).toContain('Boss 区');
      probe.stats[BOSS_STAT_KEYS[row.bossId]] = true; // 它自己死了才算过
      expect(probe.getProgressText()).toBe('完成');
    }
  });

  it('显示层不许留着第二份名册抄本（Boss 话术只按 bossId 认领）', () => {
    const code = readFileSync(SELF, 'utf8');
    // 只看类体：`case 'boss2'` / `q.type === 'boss3'` 那类按类型名读计数器的五段 if 不该回来
    // （表行自己的 id 就叫 `boss3`，所以这条必须在 `case`/`type` 的上下文里查）
    const body = code.split('export class QuestSystem')[1];
    expect(body).toBeTruthy();
    expect(body).not.toMatch(/(case|type\s*===|type\s*!==)\s*'(boss2|boss3|voidboss|chaosboss)'/);
    expect(body).toContain('BOSS_STAT_KEYS[');
    // 切片3 收掉的那份手抄任务表不许回来：这里不再有带 `title` / `desc` 的行字面量
    expect(code).not.toMatch(/^\s*\{[^}\n]*\btitle:/m);
  });
});

describe('显示与同步：读数只说该干的事', () => {
  it('摸过锚点的非门控步说"已完成触摸"，门控步不许这么说', () => {
    // `completed` 只是让"这一步已过却没跳转"这一种显示状态可见（同步按钮那条路径）
    qs.completed = true;
    dispatch('poi-interact', D.interact('hub-anchor'));
    expect(qs.questIndex).toBe(0);
    expect(qs.getProgressText()).toContain('已完成触摸');
    qs.questIndex = MAINLINE.findIndex((q) => interactGateCondition(q) === 'checkAllDungeons');
    expect(qs.getProgressText()).not.toContain('已完成触摸');
  });

  it('syncProgress 把已经过掉的步骤一次跳完（读档 / 手动同步用的就是它）', () => {
    qs.stats.discoveries.add('hub-anchor');
    qs.stats.hits = 8;
    qs.stats.kills.soldier = 2;
    // W-E3 切片13：第 1 章多了一步副本步（「枢纽之下的墓穴」）⇒ 账本里没有它
    // ⇒ 同步就**停在**那一步上（不是把没做的步子当做了 ⇒ 那才是真的丢内容）
    expect(qs.syncProgress()).toBe(2);
    expect(qs.questIndex).toBe(2);
    expect(qs.current.id).toBe('hub-catacombs');
  });

  it('通关之后不再推进（completed 是闸门，不是显示位）', () => {
    qs.completed = true;
    const index = qs.questIndex;
    dispatch('combat-hit', D.hit);
    dispatch('poi-interact', D.interact('hub-anchor'));
    expect(qs.questIndex).toBe(index);
  });

  it('账本 mutation 不留在这里：记一笔账的代码只许在 content 那一层', () => {
    const code = readFileSync(SELF, 'utf8');
    for (const pattern of [/\.hits\s*\+=/, /kills\[[^\]]+\]\s*\+=/, /discoveries\.add\(/, /npcTalked\.add\(/, /dungeonsCleared\.add\(/]) {
      expect(code, `QuestSystem 里又出现了自己记账的一段：${pattern}`).not.toMatch(pattern);
    }
  });
});

describe('判据只有一份：在役表也一样', () => {
  it('每一格 Boss 步只认自己那只 Boss 的死讯', () => {
    const roster = Object.keys(BOSS_STAT_KEYS);
    for (const row of MAINLINE.filter((q) => BOSS_STAT_KEYS[q.bossId])) {
      for (const only of roster) {
        const probe = new QuestSystem(dialog);
        probe.stats[BOSS_STAT_KEYS[only]] = true;
        expect(probe.isQuestObjectiveDone(row), `只有「${only}」死了，${row.id} 不该算过`)
          .toBe(only === row.bossId);
      }
    }
  });
});

describe('存档层只递账本，不抄账本', () => {
  /** `toData` / `applyData` 用到的最小宿主：只实现它们真正调用的接口 */
  const host = (system) => ({
    dialog: { toasts: [], toast(t) { this.toasts.push(t); } },
    player: {
      position: { x: 1, y: 2, z: 3 },
      yaw: 0.5,
      pitch: 0.2,
      combat: { hp: 60, stamina: 40 },
      teleport(x, y, z, opts) { this.landed = { x, y, z, ...opts }; },
    },
    stats: { toJSON: () => ({ bag: [], souls: 10 }), fromJSON() {}, pushToConsumers() {} },
    spells: { mana: 50 },
    dungeons: { cleared: new Set() },
    weapons: { current: 'sword', applyVisual() {} },
    weaponSkills: { unlocked: new Set(['a', 'b']), toJSON: () => ({}), fromJSON() {} },
    settings: { data: {}, applyToGame() {} },
    fastTravel: { unlocked: false },
    // v7 起 `restPointEnhancer` 是必填格（存档 v7 / 修 B66；判据见 save-field-parity 那一片），
    // 所以宿主得带上生产里那一份形状；不带上它，读档会被 validator 拒 —— 那正是想要的严格
    restPointEnhancer: {
      discovered: new Set(),
      toJSON: () => ({ discovered: [] }),
      fromJSON(d) { this.discovered = new Set(d?.discovered ?? []); },
    },
    quests: system,
  });

  it('落盘的那一格由 content 的形状推出来，读档再按同一个形状取回', () => {
    dispatch('poi-interact', D.interact('hub-anchor'));
    for (let i = 0; i < 8; i += 1) dispatch('combat-hit', D.hit);
    dispatch('enemy-defeated', D.kill('soldier'));
    dispatch('dungeon-cleared', { id: 'ruin-crypt' });

    const data = SaveSystem.toData(host(qs));
    // 键集合由 `emptyStats()` 推：手抄那十四行时，抄漏的那格只是"回到初始值"，不报错
    expect(Object.keys(data.quests.stats).sort())
      .toEqual(Object.keys(statsToJSON(emptyStats())).sort());
    for (const key of STAT_READINGS) expect(data.quests.stats).not.toHaveProperty(key);

    const target = host(new QuestSystem(dialog));
    expect(SaveSystem.applyData(target, JSON.parse(JSON.stringify(data)))).toBe(true);
    const back = target.quests.stats;
    expect(back.discoveries).toBeInstanceOf(Set);
    expect([...back.discoveries].sort()).toEqual([...qs.stats.discoveries].sort());
    expect(back.hits).toBe(qs.stats.hits);
    expect(back.kills).toEqual(qs.stats.kills);
    expect([...back.dungeonsCleared]).toEqual(['ruin-crypt']);
    // 战技数是派生值：读档后以生产方（weaponSkills.unlocked）为准，不取磁盘那份
    expect(back.skillsUnlocked).toBe(2);
    expect(back.level).toBe(emptyStats().level);
  });

  it('存档层不再逐格抄账本（那十四行硬抄本就是本切片收掉的东西）', () => {
    const code = readFileSync(join(process.cwd(), 'src', 'game', 'SaveSystem.js'), 'utf8');
    for (const key of ['discoveries', 'npcTalked', 'dungeonsCleared', 'bossDefeated', 'kills', 'chestsOpened']) {
      // 前一个字符不能是标识符的一部分（`weaponSkills:` 里就藏着一个 `kills:`）
      expect(code, `存档层又手抄了一格账：${key}`).not.toMatch(new RegExp(`(?<![\\w$])${key}\\s*:`));
    }
    expect(code).toMatch(/statsToJSON\(/);
    expect(code).toMatch(/statsFromJSON\(/);
  });
});
