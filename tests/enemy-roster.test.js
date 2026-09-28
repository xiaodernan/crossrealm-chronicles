/**
 * 敌人名册的四表一致与出生闭合 —— W-B7 切片1。
 *
 * 敌人类型是四张表的交集：`BODY_PLANS`（体型/分段）、`ENEMY_DEFENSE`（减伤）、
 * `ENEMY_RESIST`（抗性）、`ENEMY_MOVE_SETS`（招式 id 组合）。四张表分散在
 * `content/tuning.js` 里，漏一格不报错 —— `Enemy` 构造器每一格都有 `?? 默认` 兜底：
 * 没体型就套 soldier 的、没防御就是 0、没招式就落到 `default` 三板斧。兜底是
 * 给"spawn config 特例"用的，不是给"忘了登记"用的 —— 后者的症状是玩家看到
 * 一个默认形状的隐形档敌人，而门禁一声不吭。这里把"每类必须四表齐全且招式 ≥3"
 * 钉死；出生侧 `EnemyManager.spawnDefaults` 写的 `type:` 字面量必须都登记过。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BODY_PLANS, ENEMY_DEFENSE, ENEMY_RESIST, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { installWindowShim, makeManager } from './helpers/enemyHarness.js';

beforeAll(installWindowShim);

const ROOT = process.cwd();
const readSrc = (rel) => readFileSync(join(ROOT, 'src', rel), 'utf8');

/** 训练木人是不可攻击的摆设（招式表空是设计），default 是兜底档 —— 都不算"战斗类型" */
const UTILITY = new Set(['dummy', 'default']);
const 战斗类型 = Object.keys(ENEMY_MOVE_SETS).filter((t) => !UTILITY.has(t));

describe('敌人名册：四表齐全、招式闭合（W-B7 切片1）', () => {
  it('每个战斗类型在四张表里都有一格，且招式 ≥3 —— 漏登记不会再静默落到兜底档', () => {
    expect(战斗类型.length, '战斗类型一个都没有，这门禁就在空转').toBeGreaterThanOrEqual(7);
    for (const t of 战斗类型) {
      expect(BODY_PLANS[t], `类型 "${t}" 没有体型方案（会静默套 soldier 的）`).toBeTruthy();
      expect(ENEMY_DEFENSE, `类型 "${t}" 没有防御格（会静默变 0 减伤）`).toHaveProperty(t);
      expect(ENEMY_RESIST, `类型 "${t}" 没有抗性格（会静默变无抗性）`).toHaveProperty(t);
      expect(ENEMY_MOVE_SETS[t].length, `类型 "${t}" 的招式不足 3 个 —— §5 的"各 ≥3 招"是按类型数的`).toBeGreaterThanOrEqual(3);
    }
  });

  it('招式 id 全部闭合：MOVE_SETS 里每个 id 都在全局招式表里（未知名会展开成 undefined）', () => {
    const 野id = [];
    for (const [t, ids] of Object.entries(ENEMY_MOVE_SETS)) {
      for (const id of ids) {
        if (!ENEMY_MOVES[id]) 野id.push(`${t}→${id}`);
      }
    }
    expect(野id, `这些招式 id 不在 ENEMY_MOVES 里：${野id.join('、')}`).toEqual([]);
  });

  it('出生表闭合：spawnDefaults 写的每个 type: 都登记过（手滑写错类型名会静默变默认档）', () => {
    const 源码 = readSrc('combat/EnemyManager.js');
    const 起点 = 源码.indexOf('spawnDefaults()');
    const 段 = 源码.slice(起点, 源码.indexOf('buildBossArena', 起点));
    // 出生都是 for 循环：源码里每个类型字面量恰好一次，实例数在真浏览器读数里数
    const 写过的 = [...段.matchAll(/type: '([a-z]+)'/g)].map((m) => m[1]);
    expect(写过的.length, '没扫到任何 type: 字面量（切段切错了）').toBeGreaterThanOrEqual(8);
    const 未登记 = [...new Set(写过的)].filter((t) => !Object.keys(ENEMY_MOVE_SETS).includes(t));
    expect(未登记, `spawnDefaults 用了没登记的类型：${未登记.join('、')}`).toEqual([]);
  });
});

describe('W-B7 切片1：时线怨影 / 混沌掠行兽 / 边境哨炮', () => {
  it('三个新类型的数据形状各就各位', () => {
    // 怨影：悬浮体（不占 legs 分段），俯冲+突刺近战
    expect(BODY_PLANS.wraith.hover).toBeGreaterThan(0);
    expect(BODY_PLANS.wraith.parts).not.toContain('legs');
    expect(ENEMY_MOVE_SETS.wraith).toContain('dive');
    // 掠行兽：贴地快体，连爪贴脸
    expect(BODY_PLANS.stalker.hover ?? 0).toBe(0);
    expect(ENEMY_MOVE_SETS.stalker).toContain('flurry');
    // 哨炮：远程压制兼守势
    expect(ENEMY_MOVE_SETS.sentinel).toContain('shot');
    expect(ENEMY_MOVE_SETS.sentinel).toContain('guard');
  });

  it('两个空位面真的有人了：三个新类型都出现在出生表里（每类一个循环、坐标成组）', () => {
    const 段 = (() => {
      const 源码 = readSrc('combat/EnemyManager.js');
      const 起点 = 源码.indexOf('spawnDefaults()');
      return 源码.slice(起点, 源码.indexOf('buildBossArena', 起点));
    })();
    for (const t of ['wraith', 'stalker', 'sentinel']) {
      expect(段, `类型 "${t}" 没进 spawnDefaults`).toMatch(new RegExp(`type: '${t}'`));
    }
    // 新类型前面的注释要说明"为什么放这两个位面"—— 两个空位面是这片的存在理由
    expect(段).toMatch(/破碎时线与混沌边境此前没有原生敌人/);
  });
});

describe('W-B7 切片3：虚空爬兽 / 深渊骑士 / 刃舞者', () => {
  it('外形与减伤同序：看着越大的一档砍上去越硬，三类全是贴地的实体', () => {
    expect(BODY_PLANS.knight.scale).toBeGreaterThan(BODY_PLANS.crawler.scale);
    expect(BODY_PLANS.crawler.scale).toBeGreaterThan(BODY_PLANS.dancer.scale);
    expect(ENEMY_DEFENSE.knight).toBeGreaterThan(ENEMY_DEFENSE.crawler);
    expect(ENEMY_DEFENSE.crawler).toBeGreaterThan(ENEMY_DEFENSE.dancer);
    for (const t of ['crawler', 'knight', 'dancer']) {
      expect(BODY_PLANS[t].parts, `${t} 是贴地的实体，该占 legs 分段`).toContain('legs');
      expect(BODY_PLANS[t].hover ?? 0, `${t} 不该悬浮（悬浮会让打击带与地表对不上）`).toBe(0);
    }
    expect(ENEMY_MOVE_SETS.crawler).toContain('rift');
    expect(ENEMY_MOVE_SETS.knight).toContain('bash');
    expect(ENEMY_MOVE_SETS.dancer).toContain('whirl');
  });

  it('抗性格按表头的符号约定说话：重甲骑士双抗为正，爬兽与舞者各有"更吃"的那一系', () => {
    // 符号约定（`Resolution` 夹在 [-0.5, 0.9]）：正数减这一系的伤，负数更吃
    for (const v of Object.values(ENEMY_RESIST.knight)) expect(v, 'knight').toBeGreaterThan(0);
    expect(ENEMY_RESIST.crawler.ice).toBeLessThan(0);
    expect(ENEMY_RESIST.dancer.gravity).toBeLessThan(0);
    // 三条专属招的"贵"也要读得出来：裂隙与旋舞都比同位阶的常规招长冷却，盾击比横扫更费
    expect(ENEMY_MOVES.rift.cooldown).toBeGreaterThan(ENEMY_MOVES.thrust.cooldown);
    expect(ENEMY_MOVES.whirl.combo).toBeGreaterThan(1);
    expect(ENEMY_MOVES.bash.reach).toBeGreaterThan(0);
  });

  it('九只新敌真的出生在场上，且全场出生点两两不重合（叠在同一点会互相挤着抖）', () => {
    // 数的是真跑一遍 `spawnDefaults()` 之后的名册，不是源码里的字面量个数
    const m = makeManager();
    m.spawnDefaults();
    expect(m.enemies.length, '场上敌人比上次少了一整批：出生表被动过了').toBeGreaterThanOrEqual(40);
    const 按类型 = {};
    for (const e of m.enemies) 按类型[e.type] = (按类型[e.type] ?? 0) + 1;
    for (const t of ['crawler', 'knight', 'dancer']) {
      expect(按类型[t] ?? 0, `${t} 在场上的出生点不足 3 处`).toBeGreaterThanOrEqual(3);
    }
    const 点位 = new Set();
    const 重合 = [];
    for (const e of m.enemies) {
      const k = `${e.spawnPoint.x},${e.spawnPoint.z}`;
      if (点位.has(k)) 重合.push(`${e.type}@${k}`);
      点位.add(k);
    }
    expect(点位.size, '一个出生点都没扫到，这条就在空转').toBeGreaterThan(30);
    expect(重合, `这些敌人出生在同一点：${重合.join('、')}`).toEqual([]);
  });
});
