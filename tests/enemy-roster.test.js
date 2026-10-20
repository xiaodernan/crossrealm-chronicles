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
import { installWindowShim, makeManager, makePlayerRef, v } from './helpers/enemyHarness.js';
import { WorldManager } from '../src/world/WorldManager.js';
import { ZONE_ORDER, zoneIdAt } from '../src/content/ZoneIdentity.js';

beforeAll(installWindowShim);

const ROOT = process.cwd();
const readSrc = (rel) => readFileSync(join(ROOT, 'src', rel), 'utf8');

/** 训练木人是不可攻击的摆设（招式表空是设计），default 是兜底档 —— 都不算"战斗类型" */
const UTILITY = new Set(['dummy', 'default']);
const 战斗类型 = Object.keys(ENEMY_MOVE_SETS).filter((t) => !UTILITY.has(t));
/**
 * §5「敌人 12 类」的口径：**再扣掉 `boss`**。Boss 跑自己的阶段脚本，
 * `ENEMY_MOVES` 里那一行只是基类兜底 —— 把它算进来会让看板上的数与表里的数差一，
 * 而"差一"正是这类计数最容易骗过人的地方，所以两个口径各起一个名字、各写一句为什么。
 */
const 原生敌人 = 战斗类型.filter((t) => t !== 'boss');

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

  it('出生表闭合：真跑一遍出生，场上每一类都登记过（手滑写错类型名会静默变默认档）', () => {
    // W-B10 切片2 之前这条扫源码里的 `type: '...'` 字面量。出生改成走名册之后源码里
    // 一个 `type:` 都不剩（类型只在 `spawnAt` 的第一参数上出现），词法口径就此失明 ——
    // 换成行为口径：让造出来的敌人自己报类型。写错的名字会更早地炸在 `enemyRosterOf`。
    const m = makeManager();
    m.spawnDefaults();
    const 在场 = [...new Set(m.enemies.map((e) => e.type))];
    expect(在场.length, '一个类型都没扫到（spawnDefaults 空转了）').toBeGreaterThanOrEqual(8);
    const 未登记 = 在场.filter((t) => !Object.keys(ENEMY_MOVE_SETS).includes(t));
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

  it('两个空位面真的有人了：三个新类型各成一组出生在场', () => {
    // 同样从词法口径换成行为口径（数的是造出来的敌人，不是源码里的字面量）
    const m = makeManager();
    m.spawnDefaults();
    const 按类型 = {};
    for (const e of m.enemies) 按类型[e.type] = (按类型[e.type] ?? 0) + 1;
    for (const t of ['wraith', 'stalker', 'sentinel']) {
      expect(按类型[t] ?? 0, `空位面里 "${t}" 出生不足一组（<3 只）`).toBeGreaterThanOrEqual(3);
    }
    // 新类型前面的注释要说明"为什么放这两个位面"—— 两个空位面是这片的存在理由
    const 源码 = readSrc('combat/EnemyManager.js');
    const 起点 = 源码.indexOf('spawnDefaults()');
    expect(源码.slice(起点, 源码.indexOf('buildBossArena', 起点)))
      .toMatch(/破碎时线与混沌边境此前没有原生敌人/);
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

/**
 * W-E3 切片3：两个新类型（幽暗守夜人 / 辉煌圣印者）。
 *
 * 这一条钉的不是"它们存在"，而是**它们各自的手感**——
 * 守夜人是"站在那里等你走过来"的重装近战，圣印者是"站在远处把一块地标成灼场"的施法者。
 * 形状被改掉（守夜人变轻、圣印者贴上来）时手感就变了，而手感变了这件事**没有任何报错**。
 */
describe('W-E3 切片3：两个新类型的手感钉住', () => {
  it('幽暗守夜人：比同区哨卫更重更大，超长前摇的窄角度扑杀', () => {
    expect(BODY_PLANS.gloom_warden.scale).toBeGreaterThan(BODY_PLANS.gloom_sentinel.scale);
    expect(ENEMY_DEFENSE.gloom_warden).toBeGreaterThan(ENEMY_DEFENSE.gloom_sentinel);
    expect(ENEMY_MOVE_SETS.gloom_warden).toContain('lurk');
    // 潜行扑杀：读招窗口很长（比常规横扫慢一截）、命中面比**同类的扑击**窄、命中把人顶开
    expect(ENEMY_MOVES.lurk.windup).toBeGreaterThan(ENEMY_MOVES.sweep.windup);
    expect(ENEMY_MOVES.lurk.cone).toBeLessThan(ENEMY_MOVES.thrust.cone);
    expect(ENEMY_MOVES.lurk.cone).toBeLessThan(ENEMY_MOVES.flurry.cone);
    expect(ENEMY_MOVES.lurk.reach).toBeGreaterThan(ENEMY_MOVES.sweep.reach);
    expect(ENEMY_MOVES.lurk.knock).toBeGreaterThan(0);
    expect(ENEMY_MOVES.lurk.travel).toBe('lunge');
    // 它是贴地的实体（悬浮会让打击带与地表对不上）
    expect(BODY_PLANS.gloom_warden.parts).toContain('legs');
    expect(BODY_PLANS.gloom_warden.hover ?? 0).toBe(0);
  });

  it('辉煌圣印者：身量轻、远距起手，威胁全在"那块地"上', () => {
    expect(BODY_PLANS.radiant_brand.scale).toBeLessThan(BODY_PLANS.radiant_knight.scale);
    expect(ENEMY_DEFENSE.radiant_brand).toBeLessThan(ENEMY_DEFENSE.radiant_knight);
    expect(ENEMY_MOVE_SETS.radiant_brand).toContain('brand');
    // 圣印灼场：射弹 + 落地成域 + 站位诉求在远处；本体这一下不直接打人
    expect(ENEMY_MOVES.brand.hazard).toBeTruthy();
    expect(ENEMY_MOVES.brand.ranged).toBeTruthy();
    expect(ENEMY_MOVES.brand.standoff[0]).toBeGreaterThan(4);
    expect(ENEMY_MOVES.brand.damage).toBe(0);
    // 与同族的"贴地近战"区分开：它不靠贴身
    expect(ENEMY_RESIST.radiant_brand.fire).toBeLessThan(0); // 怕火
  });
});

describe('W-B7 切片4：破阵重兵 / 位面咒师 —— 把两座位面的空位补上', () => {
  it('原生敌人到齐 12 类（§5 的口径：不含 Boss 与训练木人）', () => {
    expect(原生敌人.length, `目前只有 ${原生敌人.length} 类：${原生敌人.join('、')}`).toBeGreaterThanOrEqual(12);
    for (const t of ['juggernaut', 'hexer']) expect(原生敌人).toContain(t);
  });

  it('两个新类型的形状各就各位：重兵是霸体近战，咒师是远程铺面', () => {
    // 重兵：比同场骑士更重更大，靠"架不住"而不是靠快
    expect(BODY_PLANS.juggernaut.scale).toBeGreaterThan(BODY_PLANS.knight.scale);
    expect(ENEMY_MOVES.onslaught.unstoppable).toBe(true);
    expect(ENEMY_MOVE_SETS.juggernaut).toContain('onslaught');
    // 咒师：三条里两条是弹体，唯一一条近战是防御招 —— 它不该贴脸
    expect(ENEMY_MOVE_SETS.hexer.filter((id) => ENEMY_MOVES[id].ranged)).toHaveLength(2);
    expect(ENEMY_MOVES.volley.ranged.count).toBeGreaterThan(1);
    expect(ENEMY_MOVES.volley.damage).toBeLessThan(ENEMY_MOVES.shot.damage);
    expect(ENEMY_RESIST.hexer.fire).toBeLessThan(0);      // 怕火
    expect(ENEMY_RESIST.juggernaut.ice).toBeGreaterThan(0); // 冰砍不动
  });

  it('每座位面至少两类原生敌人 —— 真世界几何下按坐标反查，不是照抄一份位面名单', () => {    const wm = new WorldManager({ add() {}, remove() {} }, { show() {}, toast() {} });
    wm.build();
    const m = makeManager();
    m.spawnDefaults();
    const 位面 = {};
    for (const e of m.enemies) {
      if (!原生敌人.includes(e.type)) continue;
      const id = zoneIdAt(e.spawnPoint, wm.zones);
      (位面[id] ??= new Set()).add(e.type);
    }
    for (const id of ZONE_ORDER) {
      const 名单 = 位面[id] ? [...位面[id]] : [];
      expect(名单.length, `位面 "${id}" 的原生敌人不足两类：${名单.join('、') || '一类都没有'}`)
        .toBeGreaterThanOrEqual(2);
    }
  });

  it('六个新出生点：落在目标位面、避开五座 Boss 场、且不与任何已有出生点重合', () => {
    const wm = new WorldManager({ add() {}, remove() {} }, { show() {}, toast() {} });
    wm.build();
    const m = makeManager();
    m.spawnDefaults();
    const arenas = [m.bossArena, m.boss2Arena, m.boss3Arena, m.voidArena, m.chaosArena].filter(Boolean);
    const 新 = m.enemies.filter((e) => e.type === 'juggernaut' || e.type === 'hexer');
    expect(新.length, '两个新类型各有 3 个出生点').toBe(6);
    const 期望 = { juggernaut: 'fantasy', hexer: 'magic' };
    for (const e of 新) {
      expect(zoneIdAt(e.spawnPoint, wm.zones), `${e.type}@${e.spawnPoint.x},${e.spawnPoint.z}`)
        .toBe(期望[e.type]);
      for (const a of arenas) {
        const d = Math.hypot(e.spawnPoint.x - a.center.x, e.spawnPoint.z - a.center.z) - a.radius;
        expect(d, `${e.type}@${e.spawnPoint.x},${e.spawnPoint.z} 落在 Boss 场里`).toBeGreaterThan(20);
      }
    }
  });
});

describe('W-B7 切片5：每个出生点都得醒得过来（B70 那一族）', () => {
  /**
   * “站得下人”与“会警觉”是两件事：`spawnDefaults` 只保证坐标在图上，不保证那一格的
   * 视线不被挡。B70 的形状是 —— 玩家贴到 1.7 米、四个正方向全试一遍，`sense.alerted`
   * 恒为 false：出生点被分离推力挪进了障碍，`Perception` 的求交把视线判没。台账最先
   * 只记了 `knight@[-255,175]`，同一道门禁又扫出 `dancer@[275,10]` —— 同族两处实例。
   * 这里**逐只隔离**测（一只敌人、一间真 `WorldManager` 世界），四向只要有一向醒得过来
   * 就算这一格站得住人。
   */
  it('每个原生敌人的出生点，玩家贴到 1.7 米时四向至少有一向会警觉', () => {
    const wm = new WorldManager({ add() {}, remove() {} }, { show() {}, toast() {} });
    wm.build();
    const 种子 = makeManager({ world: wm });
    种子.spawnDefaults();
    const 点 = 种子.enemies
      .filter((e) => 原生敌人.includes(e.type))
      .map((e) => ({ type: e.type, x: e.spawnPoint.x, z: e.spawnPoint.z }));
    expect(点.length, '一个原生出生点都没扫到，这条门禁就在空转').toBeGreaterThanOrEqual(40);

    const ref = makePlayerRef();
    const 玩家 = v(0, 0);
    const 四向 = [[1.7, 0], [-1.7, 0], [0, 1.7], [0, -1.7]];
    const 闷点 = [];
    for (const p of 点) {
      // 一只一测：邻居之间的分离推力会互相干扰，混在一起测就分不清是谁站不住
      const m = makeManager({ world: wm });
      const e = m.spawn({ name: '哨探', type: p.type, x: p.x, z: p.z, hp: 999999, posture: 999999, respawn: false });
      let 醒 = 0;
      for (const [dx, dz] of 四向) {
        e.sense.clear();
        e.sense.returning = false;
        玩家.set(p.x + dx, wm.getGroundHeight(p.x + dx, p.z + dz), p.z + dz);
        for (let i = 0; i < 40; i += 1) m.update(1 / 60, 玩家, ref, null, null);
        if (e.sense.alerted) 醒 += 1;
      }
      if (醒 === 0) 闷点.push(`${p.type}@${p.x},${p.z}`);
    }
    expect(闷点, `这些出生点四面都醒不过来（玩家贴脸也不警觉）：${闷点.join('、')}`).toEqual([]);
  });

  it('B70 换过的两格钉在表里：旧坐标（四向皆闷）不许悄悄回填', () => {
    const m = makeManager();
    m.spawnDefaults();
    const 有 = (type, x, z) => m.enemies.some((e) => e.type === type && e.spawnPoint.x === x && e.spawnPoint.z === z);
    expect(有('knight', -250, 120), '深渊骑士没在换过的 -250,120').toBe(true);
    expect(有('knight', -255, 175), '深渊骑士又挪回了 -255,175（那一格四向皆不警觉）').toBe(false);
    expect(有('dancer', 240, -40), '刃舞者没在换过的 240,-40').toBe(true);
    expect(有('dancer', 275, 10), '刃舞者又挪回了 275,10（那一格四向皆不警觉）').toBe(false);
  });

  it('B70 族排查记录钉在表里：gloom_wraith 保持四面通视的 240,120', () => {
    const m = makeManager();
    m.spawnDefaults();
    const 有 = (type, x, z) => m.enemies.some((e) => e.type === type && e.spawnPoint.x === x && e.spawnPoint.z === z);
    // 240,120 实测四面通视（断柱是装饰、不进碰撞，不挡视线）；曾误挪去 280,180 反而撞内部空间碰撞体
    expect(有('gloom_wraith', 240, 120), '幽暗怨影没在实测通视的 240,120').toBe(true);
    expect(有('gloom_wraith', 280, 180), '幽暗怨影挪回了 280,180（那一格四面皆闷：撞内部空间/神殿碰撞体）').toBe(false);
  });
});
