/**
 * 敌人名册 = 身份的唯一真源 —— W-B10 切片2。
 *
 * ## 这一片要修的是什么
 *
 * 普查（`.tmp-20260930/wb10s1-census.mjs`，读数存 `wb10s1-census.out`）量到同一个 `type`
 * 的身份被抄了两遍，两遍还不一样：
 *
 * - 区域出生（`EnemyManager.spawnDefaults`）：`soldier` 是「影之战士 hp 160 / posture 58 / damage 15」；
 * - 副本出生（`DungeonManager._spawnRoomEnemies`）：同一类是「遗城战士 hp 摇 120..219 / posture 70 / damage 16」。
 *
 * 更要紧的是副本那侧的名字是一条只点两个名的三元式 —— `golem`「构装守卫」、`drone`「裂隙无人机」，
 * **其余全部兜底成「遗城战士」**。名册里 12 类原生敌人有 9 类一旦进副本就顶着别人的名字。
 * 症状不是报错：同一只构造体在图书馆 230 血、在迷宫里 120 血且换了名；`posture/damage` 与类型无关，
 * 于是最快的无人机和最重的构造体砍上去一个手感。
 *
 * ## 用例分四层
 *
 * 1. **数据忠实**：名册逐格 = 切片2 动手之前在役的那份手抄出生表（`git show ab0e119:src/combat/EnemyManager.js`）。
 *    这是冻结的 golden，不从 `ENEMY_ROSTER` 自己推 —— 用被检对象当基线等于什么都没钉住。
 * 2. **跨表对齐**：名册的键与 `ENEMY_MOVE_SETS` / `BODY_PLANS` 同一批（少一格 = 只能靠手抄名字出生）。
 * 3. **行为**：真跑一遍区域出生、真走一遍副本房间出生，场上每只敌人的名字与数值都得名册说了算；
 *    认不出的类型当场抛，不再静默落到某个默认名（与 B71 的 `sfx:play(id)` 同一口径）。
 * 4. **单一真源**：两个出生嘴里不再出现手抄身份字段，迷宫也不再自带 `hp`；注册表挂上 kind
 *    并双向验（合法过、违法红）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BODY_PLANS, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS, enemyRosterOf } from '../src/content/enemies.js';
import { CONTENT_TABLES, checkContent, checkEnemyRoster } from '../src/content/registry.js';
import { makeManager, installWindowShim } from './helpers/enemyHarness.js';
import { DungeonManager } from '../src/world/DungeonManager.js';
import { generateMaze } from '../src/world/MazeLayout.js';
// 切片3b 之后 generateMaze 的第 4 个参数必填：这一支测的是"出怪点的 type 全在名册里"，
// 所以递一张真表里的一格就够了（用哪一座不影响这一条的判据）
import { dungeonEncounterOf } from '../src/content/dungeonEncounters.js';

beforeAll(installWindowShim);

const ROOT = process.cwd();
/** 源文件是 CRLF：不剥 `\r` 的话跨行正则的 `.` 会带着 `\r` 咬不合，"没扫到"就会伪装成"没有" */
const readSrc = (rel) => readFileSync(join(ROOT, 'src', rel), 'utf8').replace(/\r\n/g, '\n');
/** 剥注释保代码：本文件的缺席门禁扫的是"调用点手抄了哪些字段"，注释里恰好抄着那些旧数值做对照 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * 切片2 动手之前**在役**的区域出生表，逐格抄自 `git show ab0e119:src/combat/EnemyManager.js`
 * 的 `spawnDefaults()`（核查脚本 `.tmp-20260930/wb10s2-golden.mjs`：13 类逐格相等）。
 *
 * 只钉身份不钉坐标 —— 坐标留在调用点（那是关卡数据，归 W-B11）。
 */
const OLD_BIRTH = {
  dummy: { name: '训练木人', hp: 99999, posture: 99999, canAttack: false, respawn: false, color: 0x6a5040 },
  soldier: { name: '影之战士', hp: 160, posture: 58, damage: 15, color: 0x3a3038 },
  golem: { name: '魔法构装体', hp: 230, posture: 82, damage: 17, speed: 3.8, color: 0x4a3868 },
  drone: { name: '轨道无人机', hp: 120, posture: 48, damage: 11, speed: 7.5, aggroRange: 24, color: 0x3a5068 },
  elite: { name: '精英·虚空骑士', hp: 350, posture: 90, damage: 22, speed: 5.5, aggroRange: 25, color: 0x224466, respawnTime: 15 },
  wraith: { name: '时线怨影', hp: 110, posture: 44, damage: 13, speed: 6.2, aggroRange: 22, color: 0x5566aa },
  stalker: { name: '混沌掠行兽', hp: 140, posture: 62, damage: 14, speed: 6.8, color: 0x6a3038 },
  sentinel: { name: '边境哨炮', hp: 180, posture: 70, damage: 16, speed: 3.2, aggroRange: 26, color: 0x3a4a68 },
  crawler: { name: '虚空爬兽', hp: 150, posture: 58, damage: 15, speed: 5.6, aggroRange: 20, color: 0x5a7a3a },
  knight: { name: '深渊骑士', hp: 260, posture: 88, damage: 20, speed: 4.0, aggroRange: 22, color: 0x2a3550 },
  dancer: { name: '刃舞者', hp: 135, posture: 52, damage: 13, speed: 6.4, aggroRange: 22, color: 0x7a2a5a },
  juggernaut: { name: '破阵重兵', hp: 300, posture: 96, damage: 22, speed: 3.6, aggroRange: 22, color: 0x4b4a55 },
  hexer: { name: '位面咒师', hp: 130, posture: 50, damage: 15, speed: 4.6, aggroRange: 24, color: 0x6a5a9a },
  /** W-B9 切片1 新增：幽暗林地 */
  gloom_wraith: { name: '幽暗怨影', hp: 120, posture: 48, damage: 14, speed: 5.8, aggroRange: 24, color: 0x4a4a6a },
  gloom_stalker: { name: '幽暗掠行兽', hp: 150, posture: 66, damage: 16, speed: 7.0, aggroRange: 28, color: 0x4a4a7a },
  gloom_sentinel: { name: '幽暗哨卫', hp: 190, posture: 76, damage: 18, speed: 3.5, aggroRange: 30, color: 0x3a3a5a },
  /** W-B9 切片1 新增：辉煌圣域 */
  radiant_crawler: { name: '辉煌爬兽', hp: 160, posture: 62, damage: 17, speed: 6.0, aggroRange: 24, color: 0xffd700 },
  radiant_knight: { name: '辉煌骑士', hp: 270, posture: 92, damage: 22, speed: 4.2, aggroRange: 24, color: 0xffcc00 },
  radiant_dancer: { name: '辉煌舞者', hp: 145, posture: 56, damage: 14, speed: 6.8, aggroRange: 24, color: 0xffaa00 },
};

/** 出生时没写的那几格会落到 `Enemy` 构造器的默认值 —— 用例要按同一套默认说话，不许自己造数 */
const 构造默认 = { damage: 12, speed: 5, aggroRange: 18 };

/** 名册里除 `dummy`（不可攻击的摆设）之外都算战斗类型；`boss`/`default` 不归名册管 */
const 战斗类型 = Object.keys(ENEMY_MOVE_SETS).filter((t) => t !== 'boss' && t !== 'default');

describe('① 数据忠实：名册 = 切片2 之前那份手抄出生表，逐格', () => {
  it('两边的类型清单一模一样（多一格 = 那个名字永不出现；少一格 = 那一类没了身份）', () => {
    expect(ENEMY_ROSTER_IDS.slice().sort()).toEqual(Object.keys(OLD_BIRTH).sort());
  });

  it('每一格的每一个字段都等于旧抄本（手改数值会让玩家手里的老账对不上）', () => {
    for (const [type, 旧] of Object.entries(OLD_BIRTH)) {
      const 新 = ENEMY_ROSTER[type];
      expect(新, `${type} 在名册里没有格`).toBeTruthy();
      const 旧键 = Object.keys(旧).sort();
      expect(Object.keys(新).sort(), `${type} 的字段集与旧抄本不同`).toEqual(旧键);
      for (const k of 旧键) expect(新[k], `${type}.${k}`).toBe(旧[k]);
    }
  });

  it('名字两两不重复（同一屏幕里两类敌人叫同一个名字是普查里那 9 类的病根）', () => {
    const 名字 = ENEMY_ROSTER_IDS.map((t) => ENEMY_ROSTER[t].name);
    expect(new Set(名字).size, `重名：${名字.filter((n, i) => 名字.indexOf(n) !== i).join('、')}`).toBe(名字.length);
  });
});

describe('② 跨表对齐：名册的键就是那四张调参表的键', () => {
  it('每一类都有招式、有体型 —— 缺格的症状是静默落到 default 三板斧或 soldier 的形状', () => {
    for (const id of ENEMY_ROSTER_IDS) {
      expect(ENEMY_MOVE_SETS[id], `名册里的 "${id}" 没有招式表`).toBeTruthy();
      expect(BODY_PLANS[id], `名册里的 "${id}" 没有体型方案`).toBeTruthy();
    }
  });

  it('反过来：招式表里的每一类战斗敌人都在名册里（否则它只能靠调用点手抄名字出生）', () => {
    const 没身份 = 战斗类型.filter((t) => !ENEMY_ROSTER[t]);
    expect(没身份, `这些类型有招式没身份：${没身份.join('、')}`).toEqual([]);
    expect(战斗类型.length, '战斗类型一个都没扫到，这条在空转').toBeGreaterThanOrEqual(12);
  });

  it('`ENEMY_ROSTER_IDS` 是从表推导的名册键，不是第二份手抄清单', () => {
    expect(ENEMY_ROSTER_IDS).toEqual(Object.keys(ENEMY_ROSTER));
  });

  it('只有训练木人可以不写 damage（不可攻击却带伤害数字 = 那个数永远不会打出来）', () => {
    const 没伤害 = ENEMY_ROSTER_IDS.filter((t) => ENEMY_ROSTER[t].damage === undefined);
    expect(没伤害, `这些战斗类型没写 damage，会静默落到构造默认的 ${构造默认.damage}`).toEqual(['dummy']);
  });
});

describe('③ 行为：出生后的敌人身份确实来自名册', () => {
  // 这一层的基线是**活的名册**，所以它钉的是"出生确实读名册"这根线（把 `spawnAt` 里的
  // 名册申领删掉它就红），不是数值 —— 数值由 ① 那份冻结 golden 钉。两层合起来才说完：
  // 「场上的敌人 = 名册那一格」且「名册那一格 = 切片2 之前在役的手抄值」。
  it('区域出生（spawnDefaults）：每只敌人的名字与数值逐格等于名册那一格', () => {
    const m = makeManager();
    m.spawnDefaults();
    // Boss 也在这一段出生，但它走 `content/bossRoster.js` 那一名册（有阶段脚本与台词），不归本表管
    const 原生 = m.enemies.filter((e) => !e.isBoss);
    expect(原生.length, '一只都没生下来，这条就在空转').toBeGreaterThanOrEqual(40);
    // Boss 们确实也不占名册的格子（占了就越过 `ROSTER_NOT_IDENTITY` 那道不变式，开机就红）
    const 出生Boss = m.enemies.filter((e) => e.isBoss);
    expect(出生Boss.length, '这一段没扫到 Boss，跳过它的那条筛选就在空转').toBeGreaterThanOrEqual(5);
    for (const e of 出生Boss) expect(ENEMY_ROSTER[e.type], `${e.name} 是 Boss，不该在敌人名册里有格`).toBeUndefined();
    const 对不上 = [];
    for (const e of 原生) {
      const row = ENEMY_ROSTER[e.type];
      expect(row, `场上有只 "${e.type}" 不在名册里 —— 它的名字是手抄的`).toBeTruthy();
      const 查 = (k, got) => { if (row[k] !== undefined && row[k] !== got) 对不上.push(`${e.type}.${k}: 名册 ${row[k]} ≠ 场上 ${got}`); };
      查('name', e.name);
      查('hp', e.maxHp);
      查('posture', e.maxPosture);
      查('damage', e.damage);
      查('speed', e.speed);
      查('aggroRange', e.aggroRange);
      查('canAttack', e.canAttack);
      查('respawn', e.respawn);
      查('respawnTime', e.respawnTime);
      // 名册没写的格子应当落到构造器默认，而不是出生点手抄
      const 场上 = { damage: e.damage, speed: e.speed, aggroRange: e.aggroRange };
      for (const [k, d] of Object.entries(构造默认)) {
        if (row[k] === undefined && 场上[k] !== d) {
          对不上.push(`${e.type}.${k}: 名册没写，场上也不是构造默认 ${d}（实际 ${场上[k]}）`);
        }
      }
    }
    expect(对不上, `这些敌人的身份不是名册给的：\n  ${对不上.join('\n  ')}`).toEqual([]);
  });

  it('副本房间出生（_spawnRoomEnemies）：同一类在迷宫里与在野外是同一只，且房间不刷新', () => {
    const m = makeManager();
    const 自 = { enemyManager: m };
    const dungeon = { def: { id: 'ruin', name: '遗城', origin: { x: 100, z: -50 } }, enemies: [], roomEnemies: new Map() };
    const room = { id: 'r1', x: 9, z: 7, isBossArena: false, enemySpawns: [
      { x: 2, z: 3, type: 'golem' },
      { x: -4, z: 5, type: 'drone' },
      { x: 1, z: -2, type: 'crawler' },
    ] };
    DungeonManager.prototype._spawnRoomEnemies.call(自, dungeon, room);
    expect(m.enemies.length, '房间里一只都没生下来').toBe(3);
    for (const e of m.enemies) {
      const row = ENEMY_ROSTER[e.type];
      expect(e.name, `${e.type} 的名字不是名册给的`).toBe(row.name);
      expect(e.maxHp, `${e.type} 的血量不是名册给的`).toBe(row.hp);
      expect(e.maxPosture, `${e.type} 的韧性不是名册给的`).toBe(row.posture);
      expect(e.damage, `${e.type} 的伤害不是名册给的`).toBe(row.damage);
      // 旧抄本在这里对所有类型统一写 posture 70 / damage 16 —— 那正是"无人机和构装体一个手感"的病根
      expect([70, 16], `${e.type} 又拿回了旧抄本那套与类型无关的数值`).not.toContain(e.maxPosture);
      expect(e.respawn, '房间里的敌人不该在玩家回头时刷新').toBe(false);
      const spawn = room.enemySpawns.find((s) => s.type === e.type);
      expect([e.spawnPoint.x, e.spawnPoint.z], `${e.type} 的出生坐标没加上副本原点`)
        .toEqual([dungeon.def.origin.x + spawn.x, dungeon.def.origin.z + spawn.z]);
    }
    expect(dungeon.roomEnemies.get('r1')).toHaveLength(3);
    expect(dungeon.enemies).toHaveLength(3);
  });

  it('认不出的类型当场抛，而不是落到某个默认名', () => {
    const m = makeManager();
    expect(() => m.spawnAt('solider', 0, 0), '手滑写错类型名应当炸在名册口上').toThrow(/敌人名册里没有/);
    expect(() => enemyRosterOf('遗城战士')).toThrow(/可用/);
    // 副本那条嘴同样不许兜底：房间表里冒出没登记的类型，出生就得红，而不是顶着一张错名字
    const m2 = makeManager();
    const dungeon = { def: { id: 'ruin', name: '遗城', origin: { x: 0, z: 0 } }, enemies: [], roomEnemies: new Map() };
    const room = { id: 'r9', isBossArena: false, enemySpawns: [{ x: 1, z: 1, type: 'wraith ' }] };
    expect(() => DungeonManager.prototype._spawnRoomEnemies.call({ enemyManager: m2 }, dungeon, room))
      .toThrow(/敌人名册里没有/);
  });

  it('训练木人照旧不可攻击（名册把 canAttack 也收了，构造默认是 true）', () => {
    const m = makeManager();
    const e = m.spawnAt('dummy', 3, 3);
    expect(e.canAttack).toBe(false);
    expect(e.respawn).toBe(false);
    expect(e.name).toBe('训练木人');
  });
});

describe('④ 单一真源：两个出生嘴里不再有手抄身份', () => {
  const 身份字段 = ['name', 'hp', 'posture', 'damage', 'speed', 'aggroRange', 'color'];
  const 抄回 = (段, 名) => 身份字段.filter((k) => new RegExp(`\\b${k}\\s*:`).test(段)).map((k) => `${名}.${k}`);

  it('区域出生只剩 `spawnAt(类型, x, z)`：一个身份字段都不写', () => {
    const 源码 = readSrc('combat/EnemyManager.js');
    const 起点 = 源码.indexOf('spawnDefaults()');
    const 段 = stripComments(源码.slice(起点, 源码.indexOf('buildBossArena', 起点)));
    expect(段.length, '没切到 spawnDefaults 那一段').toBeGreaterThan(120);
    expect(抄回(段, 'spawnDefaults'), '出生点又手抄了身份字段').toEqual([]);
    // 反面证据：这一段确实在出生（不是被切空了才"没有"）
    expect(段.match(/this\.spawnAt\(/g).length, '出生嘴里没有 spawnAt 调用').toBeGreaterThanOrEqual(13);
  });

  it('副本房间出生只剩 `spawnAt(类型, x, z, { respawn })`：那串三元式没了', () => {
    const 源码 = readSrc('world/DungeonManager.js');
    const 起点 = 源码.indexOf('} else if (!room.isBossArena) {');
    const 段 = stripComments(源码.slice(起点, 源码.indexOf('dungeon.roomEnemies.set(', 起点)));
    expect(段.length, '没切到副本房间出生那一段').toBeGreaterThan(80);
    expect(抄回(段, '_spawnRoomEnemies'), '副本出生点又手抄了身份字段').toEqual([]);
    expect(段, '旧抄本那串「遗城战士」兜底三元式回来了').not.toMatch(/遗城战士/);
    expect(段).toMatch(/this\.enemyManager\.spawnAt\(/);
  });

  it('迷宫生成器不再自带 hp：房间里的每一只都是名册里的类，血由名册说', () => {
    const 源码 = stripComments(readSrc('world/MazeLayout.js'));
    const 起点 = 源码.indexOf('room.enemySpawns.push({');
    expect(起点, '没扫到迷宫的出生口').toBeGreaterThan(0);
    expect(源码.slice(起点, 源码.indexOf('});', 起点)), '迷宫又写了 hp（血该由名册说）').not.toMatch(/\bhp\s*:/);
    // 行为侧：真生成几局，房间出怪点的 type 全在名册里，且没有一格自带 hp
    let 扫到 = 0;
    const 野类 = [];
    const 带了hp = [];
    for (const seed of [1, 7, 12345, 999983]) {
      for (const r of generateMaze(5, 5, seed, dungeonEncounterOf('five-dim-rift')).rooms) {
        for (const e of r.enemySpawns ?? []) {
          扫到++;
          if (!ENEMY_ROSTER[e.type]) 野类.push(`${e.type}@${seed}`);
          if ('hp' in e) 带了hp.push(`${e.type}@${seed}`);
        }
      }
    }
    expect(扫到, '四局迷宫一个出怪点都没扫到（生成器空转）').toBeGreaterThanOrEqual(20);
    expect(野类, `这些出怪点的类型不在名册里：${野类.join('、')}`).toEqual([]);
    expect(带了hp, `这些出怪点还自带 hp：${带了hp.join('、')}`).toEqual([]);
  });
});

describe('⑤ 注册表接线：kind 挂上了，且双向都验', () => {
  const entry = CONTENT_TABLES.find((t) => t.kind === 'enemyRoster');

  it('enemyRoster 在 CONTENT_TABLES 里，且检的就是 `ENEMY_ROSTER` 这一个对象（不是副本）', () => {
    expect(entry, '名册没进注册表 —— 开机断链那一格又空了').toBeTruthy();
    expect(entry.shape).toBe('index');
    expect(entry.table).toBe(ENEMY_ROSTER);
    expect(entry.invariant).toBe(checkEnemyRoster);
  });

  it('真表零错误（`assertContent()` 在加载期已经断过一次，这里是可读的复证）', () => {
    expect(checkContent()).toEqual([]);
    expect(checkEnemyRoster(ENEMY_ROSTER)).toEqual([]);
  });

  it('五张改坏的表各红各的那一条；改回来的合法表零错', () => {
    const 坏 = {
      缺身份: (r) => { const { soldier, ...rest } = r; void soldier; return rest; },
      重名: (r) => ({ ...r, stalker: { ...r.stalker, name: r.soldier.name } }),
      摆设带伤害: (r) => ({ ...r, dummy: { ...r.dummy, damage: 5 } }),
      有名字没招式: (r) => ({ ...r, ghost: { name: '无名幽灵', hp: 10, posture: 10, damage: 1, color: 1 } }),
      血量写零: (r) => ({ ...r, knight: { ...r.knight, hp: 0 } }),
    };
    const 咬得住 = {
      缺身份: /缺 "soldier"/,
      重名: /重了/,
      摆设带伤害: /永远不会打出来/,
      有名字没招式: /招式表里没有这一类/,
      血量写零: /hp/,
    };
    for (const [name, mutate] of Object.entries(坏)) {
      const tables = CONTENT_TABLES.map((t) => (t.kind === 'enemyRoster' ? { ...t, table: mutate(ENEMY_ROSTER) } : t));
      const errs = checkContent(tables).join('\n');
      expect(errs, `「${name}」这张坏表没被咬住（引擎在空转）`).toMatch(咬得住[name]);
    }
    // 合法侧的同形改动：只动名字不动结构，必须零错 —— 否则上面五条红的不是内容而是校验器
    const 合法 = CONTENT_TABLES.map((t) => (t.kind === 'enemyRoster'
      ? { ...t, table: { ...ENEMY_ROSTER, stalker: { ...ENEMY_ROSTER.stalker, name: '混沌掠行者' } } }
      : t));
    expect(checkContent(合法), '改了个不重的名字也报错 = 校验器在乱咬').toEqual([]);
  });

  it('不变式直调也说同一套话（注册表接线不是唯一入口）', () => {
    expect(checkEnemyRoster({ soldier: { name: '影之战士', hp: 1, posture: 1 } }).join('\n')).toMatch(/缺 "golem"/);
  });
});
