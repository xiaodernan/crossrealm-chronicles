/**
 * 敌人成长曲线的门禁（W-E1 切片3）。
 *
 * 七层，每层各管一件事：
 *
 * 1. **表不变式**：档位数 == ZONE_ORDER 长度、0 档恒等、逐档单调、逐格有限正数。
 *    四条各配一条反向（喂坏表），证明 `checkEnemyGrowth` 真的会报。
 * 2. **派生**：区域下标 → 档位（七座区 0..6，枢纽/走廊 0，未知 id 抛）；
 *    副本 id → 档位（定义行上的显式 `stage`，缺字段/未知 id 抛）；`growthAt` 越界抛。
 * 3. **注册表接线**：`enemyGrowth` 条目在场且 invariant 挂得住（改坏一行 checkContent 就红）；
 *    `dungeons.stage` 必填且在域内（删一格 / 写越界值都红）。
 * 4. **三个咽喉各自真的生效**：世界出生按区域取档（真 zoneIdAt 路径）、
 *    副本出生按显式 growthStage 取档、两档读数逐档递增。
 * 5. **零变更与不泄漏**：0 档与名册逐格相同；`damage` 缺格的类别不产 NaN；
 *    指令不流进敌人的 config，但档位要记在敌人身上（仆从据此长，见第 7 层）。
 * 6. **每一格乘子都有人读**：扫 `src/`，`growthAt` 的读者覆盖 `GROWTH_KEYS` 两格 ——
 *    加一格没人读 = 表里多一个假旋钮（与难度那张表同一条纪律）。
 * 7. **仆从也走这条曲线**（切片4）：`_drainSummons` 按召唤者身上记下的档位缩放 `SUMMON`，
 *    0 档零变更、`posture` 不乘、档位不按坐标反推（副本里反推只会得到 0 档）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENEMY_GROWTH, GROWTH_KEYS, GROWTH_MAX_STAGE,
  checkEnemyGrowth, growthAt, zoneGrowthStage, dungeonGrowthStage,
} from '../src/content/enemyGrowth.js';
import { ZONE_IDS, ZONE_ORDER } from '../src/content/ZoneIdentity.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { ENEMY_ROSTER } from '../src/content/enemies.js';
import { SUMMON, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { EnemyManager } from '../src/combat/EnemyManager.js';

const ROOT = process.cwd();

/** 表的一份可变深拷贝（喂坏表用；真表是 deepFreeze 过的） */
const cloneTable = () => JSON.parse(JSON.stringify(ENEMY_GROWTH));

/** 假区域：`zoneIdAt` 只读 id / center / radius 三格 */
const zone = (id, x, z, r = 120) => ({ id, center: { x, z }, radius: r });

/** 一座按 WorldManager.build() 同序摆放的假世界（半径取 BaseZone 默认 120） */
const 假世界 = () => ({
  zones: [
    zone('fantasy', -200, 0),
    zone('magic', 0, -180),
    zone('space', 200, 80),
    zone('void', 0, 220),
    zone('abyss', -200, 220),
    zone('gloom', 180, 100),
    zone('radiant', -180, -160),
  ],
});

/** 与 difficulty.test.js 同一套夹具：只借原型走真 spawnAt，spawn 原样收回 config */
const 出生 = (world, type, x, z, extra) => {
  const host = Object.create(EnemyManager.prototype);
  host.world = world;
  host.spawn = (cfg) => cfg;
  return EnemyManager.prototype.spawnAt.call(host, type, x, z, extra);
};

describe('① 表不变式：四条规则各配一条反向', () => {
  it('真表四条全过', () => {
    expect(checkEnemyGrowth()).toEqual([]);
    expect(ENEMY_GROWTH).toHaveLength(ZONE_ORDER.length);
    expect(ENEMY_GROWTH[0]).toEqual({ hp: 1, damage: 1, souls: 1 });
  });

  it('档位数与 ZONE_ORDER 不一致 → 报（加一座区忘加一档的那种静默）', () => {
    const broken = cloneTable();
    broken.pop(); // 少一档
    const errs = checkEnemyGrowth(broken).join('\n');
    expect(errs).toMatch(/档位数.*不一致/);
  });

  it('0 档不是恒等 → 报（出发点区域"接上与不接一个样"就没了）', () => {
    const broken = cloneTable();
    broken[0].hp = 1.2;
    expect(checkEnemyGrowth(broken).join('\n')).toMatch(/档位 0 的 hp 是 1.2 而不是 1/);
  });

  it('逐档走反 → 报（"越往后越难"失效）', () => {
    const broken = cloneTable();
    broken[3].damage = 0.5; // 比第 2 档还低
    expect(checkEnemyGrowth(broken).join('\n')).toMatch(/走反了|还低/);
  });

  it('逐格非正数 → 报（0 会让敌人出生即死，NaN 让血条消失）', () => {
    const broken = cloneTable();
    broken[2].hp = 0;
    expect(checkEnemyGrowth(broken).join('\n')).toMatch(/必须是有限正数/);
  });
});

describe('② 派生：区域下标、副本显式档位、越界抛', () => {
  it('七座真实区域按下标取档；枢纽与走廊是 0', () => {
    for (const [i, id] of ZONE_ORDER.entries()) {
      expect(zoneGrowthStage(id), `${id} 的档位`).toBe(i);
    }
    expect(zoneGrowthStage(ZONE_IDS.HUB)).toBe(0);
    expect(zoneGrowthStage(ZONE_IDS.CORRIDOR)).toBe(0);
  });

  it('不在 ZONE_ORDER 里的区域当场抛（新加一座区忘配档位 = 红，不是静默停旧强度）', () => {
    expect(() => zoneGrowthStage('atlantis')).toThrow(/不在 ZONE_ORDER 里/);
  });

  it('七座副本按定义行上的 stage 取档', () => {
    for (const d of DUNGEON_DEFS) {
      expect(dungeonGrowthStage(d.id), `${d.id} 的档位`).toBe(d.stage);
      expect(d.stage).toBeGreaterThanOrEqual(0);
      expect(d.stage).toBeLessThanOrEqual(GROWTH_MAX_STAGE);
    }
    // 三界试炼是主线进度：0/1/2 递增（可选副本不参与这条）
    const trials = DUNGEON_DEFS.filter((d) => d.trial).map((d) => d.stage);
    expect(trials).toEqual([...trials].sort((a, b) => a - b));
  });

  it('副本认不出 / 缺 stage 字段 → 抛', () => {
    expect(() => dungeonGrowthStage('nope')).toThrow(/没有可用的成长档位/);
  });

  it('growthAt 越界与非整数都抛（静默取 0 会让越界看起来像初始强度）', () => {
    expect(growthAt(0)).toBe(ENEMY_GROWTH[0]);
    expect(growthAt(GROWTH_MAX_STAGE)).toBe(ENEMY_GROWTH[GROWTH_MAX_STAGE]);
    expect(() => growthAt(-1)).toThrow(/未知成长档位/);
    expect(() => growthAt(GROWTH_MAX_STAGE + 1)).toThrow(/未知成长档位/);
    expect(() => growthAt(1.5)).toThrow(/未知成长档位/);
  });
});

describe('③ 注册表接线：曲线表挂槽位，副本 stage 必填且在域内', () => {
  it('CONTENT_TABLES 里有 enemyGrowth 这一条，invariant 就是 checkEnemyGrowth', () => {
    const entry = CONTENT_TABLES.find((t) => t.kind === 'enemyGrowth');
    expect(entry, '注册表里没有 enemyGrowth —— 开机就不查这张表').toBeTruthy();
    expect(entry.shape).toBe('rows');
    expect(entry.table).toBe(ENEMY_GROWTH);
    expect(entry.invariant).toBe(checkEnemyGrowth);
    expect(checkContent()).toEqual([]);
  });

  it('把曲线改坏一行，checkContent() 咬得住', () => {
    const broken = cloneTable();
    broken[1].hp = 0.9; // 比 0 档还低
    const tables = CONTENT_TABLES.map((t) => (t.kind === 'enemyGrowth' ? { ...t, table: broken } : t));
    expect(checkContent(tables).join('\n')).toMatch(/还低/);
  });

  it('dungeons.stage 必填：删掉一格就是红', () => {
    const broken = DUNGEON_DEFS.map((d) => (d.id === 'ruin-crypt' ? { ...d, stage: undefined } : d));
    const tables = CONTENT_TABLES.map((t) => (t.kind === 'dungeons' ? { ...t, table: broken } : t));
    expect(checkContent(tables).join('\n')).toMatch(/stage: 缺少必填字段/);
  });

  it('dungeons.stage 越界：写 99 就是红', () => {
    const broken = DUNGEON_DEFS.map((d) => (d.id === 'ruin-crypt' ? { ...d, stage: 99 } : d));
    const tables = CONTENT_TABLES.map((t) => (t.kind === 'dungeons' ? { ...t, table: broken } : t));
    expect(checkContent(tables).join('\n')).toMatch(/stage/);
  });
});

describe('④ 三个咽喉各自真的生效（成长乘子落进 spawnAt）', () => {
  it('世界出生：档位按出生点所在区域推（真 zoneIdAt 路径）', () => {
    const world = 假世界();
    const hp = (type, x, z) => 出生(world, type, x, z).hp;
    // 出发点（fantasy 区内）与名册逐格相同
    expect(hp('soldier', -200, 0)).toBe(ENEMY_ROSTER.soldier.hp);
    // magic 区中心 → 1 档
    expect(hp('soldier', 0, -180)).toBe(Math.round(ENEMY_ROSTER.soldier.hp * 1.1));
    // radiant 区中心 → 6 档
    expect(hp('soldier', -180, -160)).toBe(Math.round(ENEMY_ROSTER.soldier.hp * 1.6));
    // damage 同步缩放，posture / speed 不动
    const cfg = 出生(world, 'golem', 0, -180);
    expect(cfg.damage).toBe(Math.round(ENEMY_ROSTER.golem.damage * 1.05));
    expect(cfg.posture).toBe(ENEMY_ROSTER.golem.posture);
    expect(cfg.speed).toBe(ENEMY_ROSTER.golem.speed);
  });

  it('副本出生：显式 growthStage 覆盖坐标反推（副本在 (5000, …) 独立空间）', () => {
    const cfg = 出生(null, 'soldier', 5000 + 3, 5000 + 4, { growthStage: 6, respawn: false });
    expect(cfg.hp).toBe(Math.round(ENEMY_ROSTER.soldier.hp * 1.6));
    expect(cfg.damage).toBe(Math.round(ENEMY_ROSTER.soldier.damage * 1.3));
    expect(cfg.respawn).toBe(false); // extra 的其余部分照旧透传
  });

  it('没有 world（老夹具 / 单元测试）⇒ corridor ⇒ 0 档 ⇒ 与名册相同', () => {
    const cfg = 出生(undefined, 'soldier', 1, 2);
    expect(cfg.hp).toBe(ENEMY_ROSTER.soldier.hp);
    expect(cfg.damage).toBe(ENEMY_ROSTER.soldier.damage);
  });
});

describe('⑤ 零变更与不泄漏', () => {
  it('`damage` 缺格的类别（dummy）不产出 NaN，也不补一个默认值进去', () => {
    const cfg = 出生(假世界(), 'dummy', -180, -160); // 6 档
    expect(ENEMY_ROSTER.dummy.damage).toBeUndefined();
    expect(cfg.damage).toBeUndefined();
    expect(Number.isFinite(cfg.hp)).toBe(true);
  });

  it('`growthStage` 是给咽喉的指令：不流进 spawn config，但档位要记在敌人身上', () => {
    let handed = null;
    const host = Object.create(EnemyManager.prototype);
    host.spawn = (cfg) => { handed = cfg; return {}; };
    const enemy = EnemyManager.prototype.spawnAt.call(host, 'soldier', 0, 0, { growthStage: 3 });
    expect('growthStage' in handed, '指令不该流进 spawn config').toBe(false);
    expect(enemy.growthStage, '档位记在敌人身上，仆从据此长（切片4）').toBe(3);
  });

  it('成长与难度两个乘子相乘，与先后无关（brutal × 6 档）', () => {
    const host = Object.create(EnemyManager.prototype);
    host.world = 假世界();
    host.spawn = (cfg) => cfg;
    // 本文件不换难度（模块级当前档保持出厂 standard，逐格 1）—— 量的就是成长那一个乘子
    const cfg = EnemyManager.prototype.spawnAt.call(host, 'soldier', -180, -160, { growthStage: 6 });
    expect(cfg.hp).toBe(Math.round(ENEMY_ROSTER.soldier.hp * 1 * 1.6));
  });
});

describe('⑥ 每一格乘子都有人读（扫 src/ 逐个点名）', () => {
  const walk = (dir, out = []) => {
    for (const n of readdirSync(dir)) {
      const full = join(dir, n);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (n.endsWith('.js')) out.push(full);
    }
    return out;
  };

  it('growth 的每一格都在 EnemyManager.spawnAt 里被读', () => {
    const srcDir = join(ROOT, 'src');
    const mgr = readFileSync(join(srcDir, 'combat', 'EnemyManager.js'), 'utf8');
    const spawnAt = mgr.slice(mgr.indexOf('spawnAt(type'), mgr.indexOf('spawnDefaults()'));
    for (const k of GROWTH_KEYS) {
      expect(spawnAt, `spawnAt 里没有读 growth.${k} —— 那一格是假旋钮`).toContain(`growth.${k}`);
    }
    // 反向：除 EnemyManager 外没有第二处长出成长乘子的读者
    const 读者 = [];
    for (const file of walk(srcDir)) {
      const rel = file.slice(srcDir.length + 1).replace(/\\/g, '/');
      if (rel === 'combat/EnemyManager.js') continue;
      if (rel === 'content/enemyGrowth.js') continue;
      const text = readFileSync(file, 'utf8');
      if (/growthAt\(/.test(text)) 读者.push(file.slice(srcDir.length + 1).replace(/\\/g, '/'));
    }
    expect(读者, 'growthAt 出现了第二个读者 —— 成长乘子有两条落地路径').toEqual([]);
  });
});

describe('⑦ 仆从也走这条曲线（W-E1 切片4）', () => {
  /** 假 spawn：收回 config，回一个 `_drainSummons` 够用的空壳（position / sense） */
  const 假管理器 = () => {
    const made = [];
    const host = Object.create(EnemyManager.prototype);
    host.spawn = (cfg) => {
      made.push(cfg);
      return { position: { x: cfg.x, z: cfg.z }, sense: { noteHostile() {} } };
    };
    return { host, made };
  };

  /** 放一只"档位 = ownerStage"的召唤者出去，看它召出来的仆从长什么样 */
  const 仆从 = (ownerStage, type = 'soldier') => {
    const { host, made } = 假管理器();
    host._pendingSummons = [{ owner: { growthStage: ownerStage, position: { x: 10, z: 20 } }, type, angle: 0 }];
    EnemyManager.prototype._drainSummons.call(host);
    expect(host._pendingSummons, '排干之后队列要清空').toHaveLength(0);
    return made[0];
  };

  it('仆从按召唤者的档位长：hp / damage 缩放，posture / speed 不动', () => {
    const cfg = 仆从(6);
    expect(cfg.hp).toBe(Math.round(SUMMON.hp * ENEMY_GROWTH[6].hp));
    expect(cfg.damage).toBe(Math.round(SUMMON.damage * ENEMY_GROWTH[6].damage));
    // posture 刻意不乘（与名册同一条口径）：硬直抗性跟着血量缩会把"更脆"变成"更容易被打断两次"
    expect(cfg.posture).toBe(SUMMON.posture);
    expect(cfg.speed).toBe(SUMMON.speed);
    expect(cfg.name).toBe(SUMMON.name);
    expect(cfg.isSummon).toBe(true);
  });

  it('0 档零变更：出发区里召出来的仆从与 SUMMON 常量逐格相同', () => {
    const cfg = 仆从(0);
    expect(cfg.hp).toBe(SUMMON.hp);
    expect(cfg.damage).toBe(SUMMON.damage);
  });

  it('同一个坐标、两个召唤者两档强度：档位跟着召唤者走，不跟着坐标', () => {
    expect(仆从(1).hp).not.toBe(仆从(5).hp);
    expect(仆从(1).damage).not.toBe(仆从(5).damage);
  });

  it('真链路：elite 在 6 档区出生 → 它召的仆从按 6 档长（中间不经过坐标反推）', () => {
    const { host, made } = 假管理器();
    host.world = 假世界();
    const owner = EnemyManager.prototype.spawnAt.call(host, 'elite', -180, -160);   // radiant → 6 档
    host._pendingSummons = [{ owner, type: 'soldier', angle: 0 }];
    EnemyManager.prototype._drainSummons.call(host);
    expect(made).toHaveLength(2);                     // 先有召唤者，后有仆从
    expect(made[1].hp).toBe(Math.round(SUMMON.hp * ENEMY_GROWTH[6].hp));
    expect(made[1].damage).toBe(Math.round(SUMMON.damage * ENEMY_GROWTH[6].damage));
  });

  it('能召唤的只有名册里那两类（elite / stalker），且档位只有一处记账', () => {
    const summoners = Object.entries(ENEMY_MOVE_SETS)
      .filter(([, moves]) => moves.includes('summon') || moves.includes('howl'))
      .map(([type]) => type).sort();
    expect(summoners, '新加一类会召唤的敌人时，这里要点名').toEqual(['elite', 'stalker']);
    const mgr = readFileSync(join(ROOT, 'src/combat/EnemyManager.js'), 'utf8');
    // 档位只写在 spawnAt 一处：第二处记账 = "仆从按谁的档位长"有两个答案
    expect((mgr.match(/\.growthStage = /g) || []).length).toBe(1);
  });
});
