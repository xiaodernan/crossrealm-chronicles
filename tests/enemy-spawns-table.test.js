/**
 * 野外原生敌人的出生点表（W-B7 切片7）—— 从 `combat/EnemyManager.js` 搬进内容层。
 *
 * ## 这一片防的是什么
 *
 * ① **纯数据写在逻辑文件里** —— 坐标与类型是内容，混在行为代码里就没人知道它是内容，
 * 内容层也**够不着它**（于是"某一位面到底有没有敌人可杀"这件事查不到）。
 * ② **搬家本身搬错了** —— 出生点的**先后**决定 `spawnAt` 的调用序，而那决定敌人的列表序
 * （感知与分离都按它走）。搬的时候少搬一条、多抄一个坐标，**游戏不会报错**，
 * 只是"那一片的敌人少了一种"或"多了一个"。
 *
 * ## 四条判据各有一种死法
 *
 * 1. **冻结的名单**（类型与坐标逐条相等，含顺序）—— 搬错了当场红。
 * 2. **每一类的 type 都在敌人名册里** —— 写错一个字母 ⇒ 那一类静默地不出现。
 * 3. **坐标有限** —— NaN 的坐标是"什么都测不出来"的那种错。
 * 4. **七座真实位面每一位都有原生敌人** —— 区位是**按坐标反推**的（`zoneIdAt`），
 *    不是从表上抄的（抄一格区位就是第二份真相：坐标改了而区位没改，那一格就在说谎）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { ENEMY_SPAWNS } from '../src/content/enemySpawns.js';
import { ENEMY_ROSTER } from '../src/content/enemies.js';
import { zoneIdAt, ZONE_ORDER } from '../src/content/ZoneIdentity.js';
import { WorldManager } from '../src/world/WorldManager.js';

/**
 * 冻结的名单 —— 搬家之前的真值（由"真跑一遍 `spawnDefaults()` 记录调用"得到，不是手抄）。
 * 顺序也在这份里：出生点的先后决定 `spawnAt` 的调用序，而那决定敌人的列表序。
 */
const 冻结 = [
  ['dummy', 15, 45],
  ['soldier', -215, -20], ['soldier', -185, 35], ['soldier', -230, 15], ['soldier', -200, -45], ['soldier', -170, -30],
  ['golem', 10, -195], ['golem', -25, -210], ['golem', 30, -170], ['golem', -10, -230],
  ['drone', 220, 60], ['drone', 185, 110], ['drone', 240, 100], ['drone', 160, 70], ['drone', 210, 140],
  ['elite', -50, -60],
  ['wraith', 28, 212], ['wraith', -32, 242], ['wraith', 12, 268], ['wraith', -48, 205],
  ['stalker', -222, 212], ['stalker', -192, 248], ['stalker', -238, 252],
  ['sentinel', -172, 238], ['sentinel', -245, 280], ['sentinel', -160, 205],
  ['crawler', 70, 250], ['crawler', -85, 258], ['crawler', 40, 168],
  ['knight', -250, 120], ['knight', -145, 250], ['knight', -205, 145],
  ['dancer', 150, -20], ['dancer', 240, -40], ['dancer', 190, 200],
  ['juggernaut', -150, 55], ['juggernaut', -250, 60], ['juggernaut', -160, 90],
  ['hexer', 80, -135], ['hexer', -40, -140], ['hexer', 60, -215],
  ['gloom_wraith', 120, 80], ['gloom_wraith', 240, 120], ['gloom_wraith', 160, 200],
  ['gloom_stalker', 80, 140], ['gloom_stalker', 200, 60], ['gloom_stalker', 220, 80],
  ['gloom_sentinel', 220, 20], ['gloom_sentinel', 300, 80], ['gloom_sentinel', 140, 180],
  ['gloom_warden', 60, 0], ['gloom_warden', 60, 80], ['gloom_warden', 240, 240],
  ['radiant_crawler', -240, -200], ['radiant_crawler', -120, -100], ['radiant_crawler', -300, -180],
  ['radiant_knight', -80, -220], ['radiant_knight', -200, -80], ['radiant_knight', -240, -100],
  ['radiant_dancer', -160, -240], ['radiant_dancer', -220, -200], ['radiant_dancer', -100, -140],
  ['radiant_brand', -320, -120], ['radiant_brand', -300, -240], ['radiant_brand', -240, -280],
];

describe('① 搬家没搬错', () => {
  it('出生点表与冻结的名单逐条相等（含顺序）', () => {
    const 现在 = ENEMY_SPAWNS.map((s) => [s.type, s.x, s.z]);
    expect(现在.length, '出生点数与冻结名单对不上').toBe(冻结.length);
    for (let i = 0; i < 冻结.length; i++) {
      expect(现在[i], `第 ${i + 1} 条出生点与搬走之前不一样`).toEqual(冻结[i]);
    }
  });

  it('表里没有重复的（类型 + 坐标）', () => {
    const 键 = ENEMY_SPAWNS.map((s) => `${s.type}@${s.x},${s.z}`);
    expect(new Set(键).size, '有重复的出生点').toBe(键.length);
  });
});

describe('② 表的形状', () => {
  it('每一类的 type 都在敌人名册里（写错一个字母 ⇒ 那一类静默地不出现）', () => {
    for (const s of ENEMY_SPAWNS) {
      expect(Object.keys(ENEMY_ROSTER), `敌人类型 "${s.type}" 不在名册里`).toContain(s.type);
    }
  });

  it('坐标都是有限数（NaN 的坐标是"什么都测不出来"的那种错）', () => {
    for (const s of ENEMY_SPAWNS) {
      expect(Number.isFinite(s.x), `"${s.type}" 的 x 不是有限数`).toBe(true);
      expect(Number.isFinite(s.z), `"${s.type}" 的 z 不是有限数`).toBe(true);
    }
  });

  it('表不是空的（空表上那几条判据全都恒真）', () => {
    expect(ENEMY_SPAWNS.length, '出生点表是空的').toBeGreaterThan(30);
  });
});

describe('③ 七座真实位面每一位都有原生敌人', () => {
  it('按坐标反推区位：每一位都至少有一枚出生点', () => {
    // 区位**按坐标反推**（`zoneIdAt`），不是从表上抄的 —— 抄一格区位就是第二份真相。
    const handlers = new Map();
    globalThis.window = {
      addEventListener(type, fn) {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type).add(fn);
      },
      dispatchEvent(event) { handlers.get(event.type)?.forEach((fn) => fn(event)); return true; },
    };
    globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
    const world = new WorldManager(new THREE.Scene(), { show() {}, toast() {} });
    world.build();
    try {
      const 每区 = new Map();
      for (const s of ENEMY_SPAWNS) {
        const zone = zoneIdAt({ x: s.x, z: s.z }, world.zones);
        每区.set(zone, (每区.get(zone) ?? 0) + 1);
      }
      for (const zone of ZONE_ORDER) {
        expect(每区.get(zone) ?? 0, `位面 "${zone}" 一枚原生敌人都没有 —— 路过只有风景`).toBeGreaterThan(0);
      }
    } finally {
      delete globalThis.window;
      delete globalThis.CustomEvent;
    }
  });
});

describe('④ 判据与执行分家', () => {
  it('生产代码不再自己写出生坐标（坐标只有表里那一份）', () => {
    const src = readFileSync(join(ROOT, 'src/combat/EnemyManager.js'), 'utf8');
    const 体 = src.slice(src.indexOf('  spawnDefaults() {'), src.indexOf('\n    const bx ='));
    expect(体, 'spawnDefaults 的位置变了 —— 判据要跟着改').toContain('ENEMY_SPAWNS');
    // 出生点表里只有 type / x / z 三格；不许出现第四格（比如手抄的区位）
    for (const s of ENEMY_SPAWNS) {
      expect(Object.keys(s).sort(), `出生点行多了一格：${Object.keys(s).join(',')}`).toEqual(['type', 'x', 'z']);
    }
  });
});

const ROOT = process.cwd();
