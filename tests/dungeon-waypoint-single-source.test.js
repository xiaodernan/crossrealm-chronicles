/**
 * 副本步的入口只有一份说法（W-E3 切片25 · 缺陷账 B143）。
 *
 * ## 这一片要修的是什么
 *
 * 主线那九行 `type: 'dungeon'` 各带一格 `waypoint: { x, z, label }`：
 *
 * - **坐标**逐格等于 `content/dungeons.js` 里那座副本的 `entrance`（同一件事的第二份写法）；
 * - **名字**却另开一套词汇 —— 副本表用 `dungeon_*_name`，行上的抄本用 `wp_label_*`（"…入口"）。
 *   两套键名说的是同一个门口，玩家看到的从来只有名册那一套：`QuestSystem.dungeonWaypoint()`
 *   从 W-B10 切片3a 起就是现问 `dungeonDefOf(id)`，行上那一份**没有任何一条在役路径读得到**。
 *
 * 零读者的抄本不是无害的：表里挪一次入口，行上那一份不会跟着动，也没有任何一处会红；
 * 而它留着的第 3 处读者只差一次表改动就会诞生 —— `QuestSystem.getQuestWaypoint()` 的副本分支
 * 原先带着 `&& !dungeonsCleared.has(...)`，"已经清了但这一行还没走完"（切片24 起 `requires`
 * 有运行时读者，完成与资格是两件事）会一路漏到函数最末那行，去读行上抄的那一份。
 * 今天主线这些副本步都没写 `requires`，所以那条路走不到 —— 抄本是**潜伏的**第二口径，不是正在犯的错。
 * （切片25 动手时主线是九处副本步；切片30 加了第十处 `sunless-oratory`，那一行从写下起就没有抄本。）
 *
 * 于是这一片三件事一起做：堵上那条漏路（副本分支不问清没清）、删掉九格抄本、
 * 让注册表当场拦住"再往副本行上抄一份入口"。随抄本成孤儿的 7 枚 `wp_label_*` 文案键从中英两表除名。
 *
 * ## 用例分三组
 *
 * 1. **行上没有抄本**：十行逐行没有 `waypoint`（先钉"抄本当年 == 名册 entrance"，
 *    证明删掉的是一份副本而不是第二个事实）；注册表拦得住塞回来的那一格，且不冤枉别的行。
 * 2. **指路只问名册**：未清 / 已清但资格未齐两种状态下的路点都等于 `entrance` + `name`。
 * 3. **孤儿键随抄本除名**：7 枚键全仓零出现、两表都不在场、两表逐键对齐。
 * 4. **指一座副本的路点**（W-E3 切片37）：`chests` / `dungeon-rerun` 两行的 waypoint
 *    是 `{ dungeonId, label }` —— 坐标现问名册，行上只留一句提示语；全表不许再有
 *    第二行把坐标抄成某座副本的 entrance，混写与两缺由注册表当场点名。
 *    （切片25 把"chests 那格 waypoint 的归属"留成了待判项，这一组就是它的判决。）
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { MAINLINE, OBJECTIVES } from '../src/content/objectives.js';
import { DUNGEON_DEFS, dungeonDefOf } from '../src/content/dungeons.js';
import { checkObjectiveTable } from '../src/content/registry.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { 键数问题 } from './helpers/i18nKeyCount.js';
import { installWindowShim } from './helpers/enemyHarness.js';
import { t } from '../src/engine/i18n.js';

beforeAll(installWindowShim);

/**
 * 动手之前那九格抄本，逐格从 `git diff` 抠出来钉在这里。
 * 留着不是为了恢复它们，是为了说清删掉的是什么：**它们与名册的 entrance 一格都不差**。
 */
const 抄本当年 = {
  'hub-catacombs': { x: 28, z: 72, label: 'wp_label_hub_catacombs' },
  'forest-shrine': { x: -230, z: -15, label: 'wp_label_forest_shrine' },
  crypt: { x: -190, z: 25, label: 'wp_label_ruin_crypt_entrance' },
  library: { x: -35, z: -200, label: 'wp_label_forbidden_library' },
  rift: { x: 175, z: 95, label: 'wp_label_five_dim_rift' },
  'void-casket': { x: -30, z: 165, label: 'wp_label_void_broken_casket' },
  'abyss-maw': { x: -140, z: 175, label: 'wp_label_abyss_deep_maw' },
  'gloom-mist-crypt': { x: 200, z: 170, label: 'wp_label_gloom_mist_crypt' },
  'radiant-dawn-hall': { x: -180, z: -95, label: 'wp_label_radiant_dawn_hall' },
};

/** 随抄本成孤儿的 7 枚文案键（另外两枚 `wp_label_forbidden_library` / `wp_label_five_dim_rift`
 *  是副本表自己的 `name` 格，活着） */
const 除名的键 = Object.values(抄本当年).map((c) => c.label)
  .filter((k) => !DUNGEON_DEFS.some((d) => d.name === k));

const 副本步 = MAINLINE.filter((r) => r.type === 'dungeon');
const 造 = () => new QuestSystem({ toast() {}, play() {} });

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (!p.endsWith('.map')) out.push(p);
  }
  return out;
}
const FILES = [...walk(join(process.cwd(), 'src')), ...walk(join(process.cwd(), 'scripts')), join(process.cwd(), 'index.html')]
  .filter((f) => /\.(js|mjs|html)$/.test(f));

describe('① 主线副本行不再抄入口', () => {
  it('钉子：副本步就是那九行 + 切片30 新插的无灯祷堂，一行不多一行不少（防整族消失把下面几条变成空转）', () => {
    expect(副本步.map((r) => r.id)).toEqual([...Object.keys(抄本当年), 'sunless-oratory']);
  });

  it('结构腿：十行逐行没有 waypoint —— 认领只靠 dungeonId', () => {
    for (const row of 副本步) {
      expect(row.waypoint, `主线步 "${row.id}" 又抄了一份入口`).toBeUndefined();
      expect(row.dungeonId, `主线步 "${row.id}" 连 dungeonId 都没有，那它靠什么指路`).toBeTruthy();
    }
  });

  it('历史契约：删掉的九格与名册的 entrance 一格不差（删的是副本，不是另一个事实）', () => {
    for (const [行名, 抄的] of Object.entries(抄本当年)) {
      const def = dungeonDefOf(MAINLINE.find((r) => r.id === 行名).dungeonId);
      expect([抄的.x, 抄的.z], `${行名} 那格抄的坐标与 entrance 对不上，那删掉的就不只是一份抄本`)
        .toEqual([def.entrance.x, def.entrance.z]);
    }
  });

  it('反面证据：别的行照样带 waypoint（这条门只管副本步）', () => {
    const 带路点的非副本行 = MAINLINE.filter((r) => r.type !== 'dungeon' && r.waypoint);
    expect(带路点的非副本行.length, '主线里所有 waypoint 都不见了 —— 结构腿那条恒绿').toBeGreaterThan(20);
  });

  it('注册表腿：往副本行塞回一格 waypoint，必须点名那一行', () => {
    // 判据用**整张 OBJECTIVES**（注册表拿到的就是这张表；MAINLINE 是它去掉门控行的投影，
    // 拿投影去喂 `checkObjectiveTable` 会因 branchTo 指向门控行而冒出六条无关的错）
    const 坏表 = OBJECTIVES.map((r) => (r.type === 'dungeon'
      ? { ...r, waypoint: { x: 1, z: 2, label: 'wp_label_anchor' } }
      : r));
    const 报错 = checkObjectiveTable(坏表);
    const 点名 = 报错.filter((e) => e.includes('不许写 waypoint'));
    expect(点名.length, `十行都该被点名，实际 ${点名.length} 条：${点名.join(' | ') || '(零)'}`).toBe(10);
    expect(点名[0], '话里没说入口该由谁说话').toContain('content/dungeons.js');
    for (const row of 副本步) {
      expect(点名.some((e) => e.includes(`("${row.id}")`)), `没点名 "${row.id}" 那一行`).toBe(true);
    }
  });

  it('注册表腿反向控制：非副本行写 waypoint 不许被这一条冤枉', () => {
    const 只改非副本 = OBJECTIVES.map((r) => ({ ...r }));
    const 目标 = 只改非副本.findIndex((r) => r.type !== 'dungeon' && r.waypoint);
    expect(目标, '表里找不到一行本来就带 waypoint 的非副本行 —— 这条反向控制是空转').toBeGreaterThan(-1);
    只改非副本[目标].waypoint = { x: 1, z: 2, label: 'wp_label_anchor' };
    expect(
      checkObjectiveTable(只改非副本).filter((e) => e.includes('不许写 waypoint')),
      '规则写宽了：它管的不是副本步',
    ).toEqual([]);
  });

  it('在役表零错：新规则没把今天的表带红', () => {
    expect(checkObjectiveTable(OBJECTIVES), checkObjectiveTable(OBJECTIVES).join('\n')).toEqual([]);
  });
});

describe('② 指路只问副本名册', () => {
  it('未清：逐座指向自己那格 entrance，名字是副本表那一格', () => {
    for (const row of 副本步) {
      const probe = 造();
      probe.questIndex = MAINLINE.indexOf(row);
      const wp = probe.getQuestWaypoint();
      const def = dungeonDefOf(row.dungeonId);
      expect([wp.x, wp.z, wp.label], `${row.id} 指错了地方或叫错了名字`)
        .toEqual([def.entrance.x, def.entrance.z, def.name]);
      expect(t(wp.label), `${row.id} 的名字展开后与副本表不同`).toBe(t(def.name));
    }
  });

  it('那条漏路：已清但这一行还没走完 —— 仍指名册的入口，不掉进行上的抄本', () => {
    // 主线今天没有一行副本步写 requires（所以这条漏路在役走不到，见文件头）。
    // 这里用探针行把它造出来：`current` 是 getter，用 defineProperty 在实例上盖掉它。
    // id 用**真在役的那一行** `crypt`，这样改前的代码会去 `rowWaypoint('crypt')` 取行上抄的那一份
    // —— 抄本删了 ⇒ 取到 null ⇒ 这条路今天必须靠名册走。
    const 行 = {
      id: 'crypt',
      type: 'dungeon',
      dungeonId: 'ruin-crypt',
      requires: { 旗标永远没点亮: true },
    };
    const probe = 造();
    Object.defineProperty(probe, 'current', { get: () => 行, configurable: true });
    probe.stats.dungeonsCleared.add('ruin-crypt');
    expect(probe.isQuestObjectiveDone(行), '探针行本该"清了但还没走完"').toBe(false);
    const wp = probe.getQuestWaypoint();
    const def = dungeonDefOf('ruin-crypt');
    expect(wp, '这一行没有路点了 —— 副本步清完就什么都不指？抄本删掉后漏路会静默变成没箭头').toBeTruthy();
    expect([wp.x, wp.z, wp.label], `漏路又走进行上抄本（${JSON.stringify(wp)}）`)
      .toEqual([def.entrance.x, def.entrance.z, def.name]);
  });

  it('九行认领的副本互不重复，且都在名册里（两座副本共用一个门口 = 一座进不去）', () => {
    const 认领 = 副本步.map((r) => r.dungeonId);
    expect(new Set(认领).size, `重复认领：${认领.join(',')}`).toBe(认领.length);
    for (const id of 认领) expect(DUNGEON_DEFS.some((d) => d.id === id), `名册里没有 "${id}"`).toBe(true);
  });
});

describe('③ 孤儿键随抄本一起除名', () => {
  it('钉子：除名的是那 7 枚，一枚不多一枚不少', () => {
    expect(除名的键.sort()).toEqual([
      'wp_label_abyss_deep_maw',
      'wp_label_forest_shrine',
      'wp_label_gloom_mist_crypt',
      'wp_label_hub_catacombs',
      'wp_label_radiant_dawn_hall',
      'wp_label_ruin_crypt_entrance',
      'wp_label_void_broken_casket',
    ]);
  });

  it('绝迹腿：7 枚键全仓零出现（同一把尺子量在役的键，量得到）', () => {
    const 文本 = FILES.map((f) => readFileSync(f, 'utf8'));
    for (const 键 of 除名的键) {
      const 命中 = 文本.filter((s) => s.includes(键)).length;
      expect(命中, `"${键}" 还剩 ${命中} 处读者/定义 —— 抄本没删干净`).toBe(0);
    }
    // 尺子本身不许恒 0：仍在役的 `wp_label_anchor` 在同一批文件里量得到
    expect(文本.filter((s) => s.includes('wp_label_anchor')).length, '扫描范围空转').toBeGreaterThan(2);
  });

  it('两表腿：7 枚键两张表都不在场，且两表逐键对齐、都是 2436', () => {
    const 中键 = Object.keys(STRINGS_ZH);
    const 英键 = Object.keys(STRINGS_EN);
    for (const 键 of 除名的键) {
      expect(键 in STRINGS_ZH, `中文表里还留着 "${键}"（孤儿键没删干净）`).toBe(false);
      expect(键 in STRINGS_EN, `英文表里还留着 "${键}"（只删了一张表）`).toBe(false);
    }
    expect(键数问题(中键, 英键), '键数与登记值不符').toEqual([]);
    expect(中键.filter((k) => !英键.includes(k)), '只在中文表里的键').toEqual([]);
    expect(英键.filter((k) => !中键.includes(k)), '只在英文表里的键').toEqual([]);
  });

  it('在役的那两枚没被误删：副本表的 name 格两表都在场', () => {
    for (const 键 of ['wp_label_forbidden_library', 'wp_label_five_dim_rift']) {
      expect(typeof STRINGS_ZH[键], `中文表里没有 ${键}`).toBe('string');
      expect(typeof STRINGS_EN[键], `英文表里没有 ${键}`).toBe('string');
    }
  });
});

describe('④ 指一座副本的路点（W-E3 切片37 · 切片25 留下的那一格归属判完了）', () => {
  /** 坐标逐格等于某座副本 entrance 的行 —— 除了"指副本"那一型，这一族**不许**存在 */
  const 抄入口的行 = (rows) => rows.filter((r) => r.waypoint && !r.waypoint.dungeonId
    && DUNGEON_DEFS.some((d) => d.entrance.x === r.waypoint.x && d.entrance.z === r.waypoint.z));
  const 指副本的行 = MAINLINE.filter((r) => r.waypoint?.dungeonId);

  it('钉子：今天就是指副本的两行（chests / dungeon-rerun）—— 一行不多一行不少', () => {
    expect(指副本的行.map((r) => r.id)).toEqual(['chests', 'dungeon-rerun']);
    for (const row of 指副本的行) {
      expect(row.waypoint.dungeonId, `${row.id} 指的副本不在名册里`).toBe('ruin-crypt');
      expect(row.waypoint.label, `${row.id} 只剩一句提示语都不留了 —— 箭头会没有字`).toBeTruthy();
      expect(row.waypoint.x, `${row.id} 又长回了坐标`).toBeUndefined();
    }
  });

  it('全表腿：除了这两行，再没有谁把路点坐标抄成某座副本的入口', () => {
    const 命中 = 抄入口的行(MAINLINE);
    expect(命中.map((r) => [r.id, r.waypoint]), '这些行又抄了一份副本入口 —— 名册挪门时它们不会跟着动')
      .toEqual([]);
  });

  it('反向控制：把两行之一改回坐标形态，上面那条腿必须点名（防它恒绿）', () => {
    const 假 = MAINLINE.map((r) => (r.id === 'chests'
      ? { ...r, waypoint: { x: -190, z: 25, label: 'wp_label_chests_dungeon' } }
      : r));
    const 命中 = 抄入口的行(假);
    expect(命中.map((r) => r.id)).toEqual(['chests']);
  });

  it('行为腿：这两行指到的是名册的 entrance，展开的仍是自己那句提示语（不是第二份门名）', () => {
    const def = dungeonDefOf('ruin-crypt');
    for (const row of 指副本的行) {
      const probe = 造();
      probe.questIndex = MAINLINE.indexOf(row);
      const wp = probe.getQuestWaypoint();
      expect(wp, `${row.id} 没有路点了`).toBeTruthy();
      expect([wp.x, wp.z], `${row.id} 指错了地方`).toEqual([def.entrance.x, def.entrance.z]);
      expect(t(wp.label), `${row.id} 的标签展开后与副本名一样 —— 那就是第二份门名了`).not.toBe(t(def.name));
    }
  });

  it('每个 dungeonId 都在名册里（控制组：换成一个不存在的 id，同一条判据必须点名）', () => {
    const 坏 = 指副本的行.map((r) => ({ ...r, waypoint: { ...r.waypoint, dungeonId: 'no-such-dungeon' } }));
    const 缺 = 坏.filter((r) => !DUNGEON_DEFS.some((d) => d.id === r.waypoint.dungeonId));
    expect(缺.length, '判据恒 0 —— 它根本没在核 id').toBe(坏.length);
    expect(指副本的行.filter((r) => !DUNGEON_DEFS.some((d) => d.id === r.waypoint.dungeonId)), '在役表里有指向不存在副本的路点')
      .toEqual([]);
  });

  it('注册表腿：两种形态混写 / 两样都缺，都当场点名', () => {
    const 混写 = OBJECTIVES.map((r) => (r.id === 'chests'
      ? { ...r, waypoint: { x: -190, z: 25, dungeonId: 'ruin-crypt', label: 'wp_label_chests_dungeon' } }
      : r));
    const 混写报错 = checkObjectiveTable(混写).filter((e) => e.includes('同时写了 dungeonId 与坐标'));
    expect(混写报错.length, '混写没人管 ⇒ 行上又长出一份坐标').toBe(1);
    expect(混写报错[0]).toContain('("chests")');

    const 缺格 = OBJECTIVES.map((r) => (r.id === 'chests'
      ? { ...r, waypoint: { label: 'wp_label_chests_dungeon' } }
      : r));
    const 缺格报错 = checkObjectiveTable(缺格).filter((e) => e.includes('既没有坐标也没有 dungeonId'));
    expect(缺格报错.length, '两样都缺没人管 ⇒ 那一行静默没有箭头').toBe(1);
  });
});