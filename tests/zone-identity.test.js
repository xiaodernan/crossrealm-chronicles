/**
 * 区域身份（修 B35 / B36 / B42）。
 *
 * 这一组用例的意义不是"函数返回值对不对"，而是**把文案与逻辑拆开**这件事钉住：
 * 第 20 例把区域的中文显示名换成一串乱码后重跑同一条路径，要求事件与雾色
 * 一模一样 —— 在修之前，这条用例的每一个分支都会静默退化成"枢纽"。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ZONE_IDS, ZONE_ORDER, ZONE_NAMES, HUB_ZONE, CORRIDOR_ZONE,
  zoneIdOf, zoneIdAt, findZoneById, resolveZone, zoneDescriptor, isRealZone,
} from '../src/content/ZoneIdentity.js';
import { WorldManager } from '../src/world/WorldManager.js';
import { barkKeyForZone, COMBAT_BARKS_POP } from '../src/game/PopCultureCombatBarks.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { MAINLINE } from '../src/content/objectives.js';
import { installWindowShim } from './helpers/enemyHarness.js';

const makeStubZone = (id, center, radius, extra = {}) => ({
  id,
  center,
  radius,
  info: { id, name: ZONE_NAMES[id], subtitle: 'stub', description: '' },
  fogColor: 0x112233,
  fogDensity: 0.01,
  updates: 0,
  update() { this.updates += 1; },
  distanceToCenter(x, z) { return Math.hypot(x - this.center.x, z - this.center.z); },
  ...extra,
});

describe('区域身份表', () => {
  it('每个真实区域都有显示名，且名字不等于 id（两者各管各的）', () => {
    for (const id of ZONE_ORDER) {
      expect(ZONE_NAMES[id], `缺少 ${id} 的显示名`).toBeTruthy();
      expect(ZONE_NAMES[id]).not.toBe(id);
    }
  });

  it('ZONE_NAMES 的键全部来自 ZONE_IDS（不留孤儿文案）', () => {
    const ids = new Set(Object.values(ZONE_IDS));
    for (const key of Object.keys(ZONE_NAMES)) expect(ids.has(key)).toBe(true);
  });

  it('枢纽与走廊不是"真实区域"，但同样有 id 与文案', () => {
    expect(isRealZone(ZONE_IDS.HUB)).toBe(false);
    expect(isRealZone(ZONE_IDS.FANTASY)).toBe(true);
    for (const z of [HUB_ZONE, CORRIDOR_ZONE]) {
      expect(z.info.id).toBe(z.id);
      expect(z.info.name).toBe(ZONE_NAMES[z.id]);
    }
  });

  it('枢纽与走廊是冻结的共享对象（谁都不能就地改它）', () => {
    expect(Object.isFrozen(HUB_ZONE)).toBe(true);
    expect(Object.isFrozen(CORRIDOR_ZONE)).toBe(true);
    expect(() => { HUB_ZONE.id = 'x'; }).toThrow();
  });
});

describe('zoneIdOf', () => {
  it('优先读对象自己的 id，其次 info.id', () => {
    expect(zoneIdOf({ id: ZONE_IDS.VOID })).toBe(ZONE_IDS.VOID);
    expect(zoneIdOf({ info: { id: ZONE_IDS.SPACE } })).toBe(ZONE_IDS.SPACE);
    expect(zoneIdOf({ id: ZONE_IDS.SPACE, info: { id: ZONE_IDS.VOID } })).toBe(ZONE_IDS.SPACE);
  });

  it('只对旧数据回退到中文名（存档兼容），并且两种魔法区名都认', () => {
    expect(zoneIdOf({ info: { name: '米勒荒原' } })).toBe(ZONE_IDS.SPACE);
    expect(zoneIdOf({ info: { name: '魔法遗境' } })).toBe(ZONE_IDS.MAGIC);
    expect(zoneIdOf({ info: { name: '霍格沃兹遗境' } })).toBe(ZONE_IDS.MAGIC);
  });

  it('认不出来时不静默：回退 UNKNOWN 并且喊一声', () => {
    const warn = console.warn;
    const calls = [];
    console.warn = (...a) => calls.push(a.join(' '));
    try {
      expect(zoneIdOf({ info: { name: '新开的第七区' } })).toBe(ZONE_IDS.UNKNOWN);
    } finally {
      console.warn = warn;
    }
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain('第七区');
  });

  it('空值回退 UNKNOWN 且不误报', () => {
    const warn = console.warn;
    let warned = 0;
    console.warn = () => { warned += 1; };
    try {
      expect(zoneIdOf(null)).toBe(ZONE_IDS.UNKNOWN);
      expect(zoneIdOf(undefined)).toBe(ZONE_IDS.UNKNOWN);
    } finally {
      console.warn = warn;
    }
    expect(warned).toBe(0);
  });
});

describe('zoneIdAt（几何归属）', () => {
  const zones = () => [
    makeStubZone(ZONE_IDS.FANTASY, { x: -200, z: 0 }, 165),
    makeStubZone(ZONE_IDS.MAGIC, { x: 0, z: -180 }, 150),
    // 与枢纽同心圆重叠的一区：验证"站在世界之锚上"不会被算成位面
    makeStubZone(ZONE_IDS.VOID, { x: 0, z: 55 }, 120),
  ];

  it('枢纽优先：区半径覆盖到锚点也算枢纽', () => {
    expect(zoneIdAt({ x: 0, z: 55 }, zones())).toBe(ZONE_IDS.HUB);
    expect(zoneIdAt({ x: 0, z: 100 }, zones())).toBe(ZONE_IDS.HUB);   // 离锚 45 < 50
  });

  it('重叠区取最近的中心', () => {
    const a = makeStubZone(ZONE_IDS.FANTASY, { x: -10, z: 200 }, 100);
    const b = makeStubZone(ZONE_IDS.MAGIC, { x: 10, z: 200 }, 100);
    expect(zoneIdAt({ x: 0, z: 200 }, [a, b])).toBe(ZONE_IDS.FANTASY);
    expect(zoneIdAt({ x: 6, z: 200 }, [a, b])).toBe(ZONE_IDS.MAGIC);
  });

  it('边界外是走廊，不是"某个区的邻居"', () => {
    expect(zoneIdAt({ x: 240, z: -290 }, zones())).toBe(ZONE_IDS.CORRIDOR);
  });

  it('没有区域实例时不炸（早期构建 / 副本外场景）', () => {
    expect(zoneIdAt({ x: 0, z: 0 }, [])).toBe(ZONE_IDS.CORRIDOR);
    expect(zoneIdAt({ x: 0, z: 0 }, null)).toBe(ZONE_IDS.CORRIDOR);
  });
});

describe('findZoneById / resolveZone', () => {
  const zones = () => [makeStubZone(ZONE_IDS.ABYSS, { x: 0, z: 0 }, 10)];

  it('按 id 取实例，info.id 也算；找不到给 null 而不是 undefined', () => {
    expect(findZoneById(zones(), ZONE_IDS.ABYSS)?.id).toBe(ZONE_IDS.ABYSS);
    expect(findZoneById([{ info: { id: 'magic' } }], ZONE_IDS.MAGIC)).toBeTruthy();
    expect(findZoneById(zones(), ZONE_IDS.VOID)).toBeNull();
  });

  it('枢纽与走廊由 resolveZone 落到静态描述，未知 id 才是 null', () => {
    expect(resolveZone(zones(), ZONE_IDS.HUB)).toBe(HUB_ZONE);
    expect(resolveZone(zones(), ZONE_IDS.CORRIDOR)).toBe(CORRIDOR_ZONE);
    expect(resolveZone(zones(), 'nope')).toBeNull();
    expect(zoneDescriptor(ZONE_IDS.HUB)).toBe(HUB_ZONE);
    expect(zoneDescriptor(ZONE_IDS.SPACE)).toBeNull();
  });
});

describe('WorldManager 的区域归属', () => {
  let events;
  let scene;
  let wm;

  beforeEach(() => {
    installWindowShim();
    events = [];
    window.addEventListener('zone-changed', (e) => events.push(e.detail));
    // 雾色要能被断言，否则"分区成功"这件事根本没留下证据
    scene = { fog: { color: { hex: 0, setHex(v) { this.hex = v; } }, density: 0 }, add() {}, remove() {} };
    wm = new WorldManager(scene, { show() {}, toast() {} });
    wm.hubCore = null;
    wm.zones = [
      makeStubZone(ZONE_IDS.FANTASY, { x: -200, z: 0 }, 165, { fogColor: 0x4a5a48, fogDensity: 0.02 }),
      makeStubZone(ZONE_IDS.MAGIC, { x: 0, z: -180 }, 150),
    ];
  });

  afterEach(() => { delete globalThis.window; });

  it('开局在枢纽：currentZone 是真描述对象，事件带 zoneId', () => {
    wm.applyHubAtmosphere(true);
    expect(wm.currentZone).toBe(HUB_ZONE);
    expect(wm.zoneId).toBe(ZONE_IDS.HUB);
    expect(events.at(-1)).toMatchObject({ zoneId: ZONE_IDS.HUB, initial: true });
    expect(events.at(-1).zone.id).toBe(ZONE_IDS.HUB);
  });

  it('从枢纽走进灰白森林：一次事件、雾色取该区自己的', () => {
    wm.applyHubAtmosphere(true);
    events.length = 0;
    wm.update(0.016, { x: -200, z: 0 });
    expect(events.length).toBe(1);
    expect(events[0].zoneId).toBe(ZONE_IDS.FANTASY);
    expect(scene.fog.color.hex).toBe(0x4a5a48);
    expect(scene.fog.density).toBeCloseTo(0.02 * 0.85);
  });

  it('走进两区之间：是走廊而不是 null（读方问得出"我在哪"）', () => {
    wm.applyHubAtmosphere(true);
    wm.update(0.016, { x: -200, z: 0 });
    wm.update(0.016, { x: 240, z: -290 });
    expect(wm.currentZone).toBe(CORRIDOR_ZONE);
    expect(wm.zoneId).toBe(ZONE_IDS.CORRIDOR);
    expect(events.at(-1).zoneId).toBe(ZONE_IDS.CORRIDOR);
  });

  it('同一区内连续帧不重复派发（幂等），但每帧仍要更新区域实例', () => {
    wm.update(0.016, { x: -200, z: 0 });
    const updatesBefore = wm.zones[0].updates;
    events.length = 0;
    for (let i = 0; i < 60; i++) wm.update(0.016, { x: -198, z: 3 });
    expect(events.length).toBe(0);
    // 幂等只是"不再派发"，区域实例每帧仍要转
    expect(wm.zones[0].updates - updatesBefore).toBe(60);
    // 不在任何区里的那一帧也不会漏更新（走廊也是世界的一部分）
    wm.update(0.016, { x: 240, z: -290 });
    expect(wm.zones[0].updates - updatesBefore).toBe(61);
  });

  it('把显示名换成乱码后，归属与事件完全不变（B36 的正面证据）', () => {
    wm.applyHubAtmosphere(true);
    wm.update(0.016, { x: -200, z: 0 });
    const baseline = events.map((e) => e.zoneId);

    const wm2 = new WorldManager(scene, { show() {}, toast() {} });
    wm2.hubCore = null;
    wm2.zones = wm.zones.map((z) => ({
      ...z, updates: 0, info: { id: z.id, name: '@@@####', subtitle: '@@@', description: '' },
    }));
    wm2.applyHubAtmosphere(true);
    wm2.update(0.016, { x: -200, z: 0 });
    expect(events.slice(baseline.length).map((e) => e.zoneId)).toEqual(baseline);
  });

  it('地图数据每项都带 id（世界地图面板与快速旅行按 id 认领）', () => {
    const data = wm.getZoneMapData();
    expect(data.map((d) => d.id)).toEqual([ZONE_IDS.HUB, ZONE_IDS.FANTASY, ZONE_IDS.MAGIC]);
    expect(data[0].radius).toBe(HUB_ZONE.mapRadius);
    expect(data[1].name).toBe(ZONE_NAMES[ZONE_IDS.FANTASY]);
  });
});

describe('战斗台词按 id 选池', () => {
  it('五个位面各走各的台词', () => {
    expect(barkKeyForZone(ZONE_IDS.MAGIC)).toBe('magic');
    expect(barkKeyForZone(ZONE_IDS.FANTASY)).toBe('fantasy');
    expect(barkKeyForZone(ZONE_IDS.VOID)).toBe('void');
    expect(barkKeyForZone(ZONE_IDS.ABYSS)).toBe('abyss');
  });

  it('米勒荒原的两套气质按传入的随机数分流（不自己掷骰，才能被测）', () => {
    expect(barkKeyForZone(ZONE_IDS.SPACE, 0.9)).toBe('space');
    expect(barkKeyForZone(ZONE_IDS.SPACE, 0.1)).toBe('space_scifi');
  });

  it('枢纽、走廊与没有区域时不说话', () => {
    expect(barkKeyForZone(ZONE_IDS.HUB)).toBeNull();
    expect(barkKeyForZone(ZONE_IDS.CORRIDOR)).toBeNull();
    expect(barkKeyForZone(undefined)).toBeNull();
  });

  it('表里选出来的每个 key 在台词库中真有内容（不留死分支）', () => {
    for (const id of [ZONE_IDS.MAGIC, ZONE_IDS.FANTASY, ZONE_IDS.VOID, ZONE_IDS.ABYSS, ZONE_IDS.SPACE]) {
      const key = barkKeyForZone(id, 0.9);
      const pool = COMBAT_BARKS_POP[key];
      expect(Array.isArray(pool), `${id} → ${key} 的台词池缺失`).toBe(true);
      for (const line of pool) expect(line.length, `${key} 里有一条空台词`).toBeGreaterThan(0);
    }
  });
});

/*
 * ── 击杀归类（B36 的另一半）──
 *
 * 修之前写的是 `if (name.includes('虚空')) elite++ else …`。于是灰白森林 Boss 召出的
 * 「虚空仆从」（type 其实是 soldier）全被记成 elite：精英任务白送，而「影之试炼」要
 * 的两名 soldier 永远数不满 —— 主线卡死在第二章前，玩家却看不出任何报错。
 *
 * 这组用例做过"把旧写法贴回去"的验证：贴回去后这里 2 例与内容边界门禁同时变红。
 */
describe('任务击杀归类看 type 不看显示名', () => {
  let qs;
  const kill = (detail) => window.dispatchEvent(new CustomEvent('enemy-defeated', { detail }));
  const questById = (id) => MAINLINE.find((q) => q.id === id);

  beforeEach(() => {
    installWindowShim();
    qs = new QuestSystem({ show() {}, toast() {} });
  });

  afterEach(() => { delete globalThis.window; });

  it('「虚空仆从」算士兵，「精英·虚空骑士」才算精英', () => {
    kill({ name: '虚空仆从', type: 'soldier' });
    kill({ name: '虚空仆从', type: 'soldier' });
    kill({ name: '精英·虚空骑士', type: 'elite' });
    expect(qs.stats.kills).toEqual({ soldier: 2, elite: 1 });
  });

  it('两名战士之死真的推进「影之试炼」，精英任务不会顺带白送', () => {
    const soldiers = questById('soldiers');
    const elite = questById('elite');
    kill({ name: '虚空仆从', type: 'soldier' });
    expect(qs.isQuestObjectiveDone(soldiers)).toBe(false);
    expect(qs.isQuestObjectiveDone(elite)).toBe(false);
    kill({ name: '虚空仆从', type: 'soldier' });
    expect(qs.isQuestObjectiveDone(soldiers)).toBe(true);
    expect(qs.isQuestObjectiveDone(elite)).toBe(false);
    kill({ name: '精英·虚空骑士', type: 'elite' });
    expect(qs.isQuestObjectiveDone(elite)).toBe(true);
  });

  it('Boss 不进击杀统计，走自己的 bossId 判定', () => {
    kill({ name: '影界守护者', type: 'boss', bossId: 'shadow-warden' });
    expect(qs.stats.kills).toEqual({});
    expect(qs.stats.bossDefeated).toBe(true);
  });

  it('敌人显示名换成乱码后，归类结果不变', () => {
    kill({ name: '@@@####', type: 'soldier' });
    kill({ name: '@@@####', type: 'soldier' });
    kill({ name: '@@@####', type: 'elite' });
    expect(qs.stats.kills).toEqual({ soldier: 2, elite: 1 });
  });
});
