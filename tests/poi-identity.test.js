/**
 * POI 的稳定身份 —— 修 B45。
 *
 * 修之前 `BaseZone.addPOI` 在没给 id 时回退成 `` `${this.id}-${label}` ``，
 * 等于**把显示名嵌进了稳定身份**：改一句调查文案，这个 POI 的 id 就变，
 * 所有按 id 认领它的下游（`poi-interact` 事件、markers 的 `userData.poiId`、
 * 以后进存档的发现进度）静默断链 —— 运行期不报错，只是"点了没反应"。
 *
 * 这里跑的是**真世界**：`WorldManager.build()` + 四层致敬增强器全部跑完，
 * 再对最终的 `pointsOfInterest` 做全量断言。逐个调用点手写 id 是最容易漏一半的活，
 * 所以门禁必须覆盖"整张表"，而不是只看某一区。
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BaseZone } from '../src/world/zones/BaseZone.js';
import { WorldManager } from '../src/world/WorldManager.js';
import { attachPopCultureZones } from '../src/world/PopCultureZoneEnhancer.js';

const makeScene = () => ({ add() {}, remove() {} });
const makeDialog = () => ({ show() {}, toast() {} });

/** 只测 addPOI 的契约，不建任何几何 */
class BareZone extends BaseZone {
  constructor(id = 'probe') {
    super(makeScene(), { x: 0, z: 0 }, { info: { id } });
  }
}

describe('addPOI 的 id 契约', () => {
  let zone;
  beforeEach(() => { zone = new BareZone(); });

  it('缺 id 当场抛错，不再拿显示名兜底', () => {
    expect(() => zone.addPOI({ x: 1, z: 1 }, '调查某物', () => {})).toThrow(/缺少 id/);
    expect(zone.pois).toHaveLength(0);
  });

  it('id 必须是小写 kebab-case（带中文、大写或下划线都不许）', () => {
    for (const bad of ['fantasy-调查至尊石环', 'Fantasy-Ring', 'fantasy_ring', '空间核心']) {
      expect(() => zone.addPOI({ x: 1, z: 1 }, 'L', () => {}, { id: bad }), `id=${bad}`).toThrow(/kebab-case/);
    }
    expect(zone.pois).toHaveLength(0);
  });

  it('同区重复 id 抛错', () => {
    zone.addPOI({ x: 1, z: 1 }, '第一处', () => {}, { id: 'probe-site' });
    expect(() => zone.addPOI({ x: 2, z: 2 }, '第二处', () => {}, { id: 'probe-site' })).toThrow(/重复/);
  });

  it('改显示名不改变 id（正面证据：把 label 换成乱码后 id 一模一样）', () => {
    const before = zone.addPOI({ x: 1, z: 1 }, '调查至尊石环', () => {}, { id: 'probe-ring' });
    const after = zone.addPOI({ x: 1, z: 1 }, '〓▒▓ 谁来都读不懂的名字', () => {}, { id: 'probe-ring-2' });
    expect([before.id, after.id]).toEqual(['probe-ring', 'probe-ring-2']);
    expect(after.label).toBe('〓▒▓ 谁来都读不懂的名字');
  });

  /**
   * 旧回退的现场复刻：`` `${zoneId}-${label}` `` 生成的 id 里就带着中文显示名。
   * 这条不测 addPOI（它现在根本不放行这种 id），测的是最后一道自检 ——
   * 万一有别处绕过 `addPOI` 直接往表里塞，构建期也要炸出来。
   */
  it('把显示名拼进 id 的写法会被最终自检拦住', () => {
    const world = new WorldManager(makeScene(), makeDialog());
    world.pointsOfInterest.push({ id: 'fantasy-调查至尊石环', label: '调查至尊石环', position: { x: 0, y: 0, z: 0 } });
    expect(() => world.assertPoiIdentity()).toThrow(/kebab-case/);
  });

  it('没有 id 的裸对象混进登记表也会被拦住', () => {
    const world = new WorldManager(makeScene(), makeDialog());
    world.pointsOfInterest.push({ label: '忘了给 id', position: { x: 0, y: 0, z: 0 } });
    expect(() => world.assertPoiIdentity()).toThrow(/没有 id/);
  });
});

describe('真世界的 POI 登记表', () => {
  let game, world;

  beforeEach(() => {
    const handlers = new Map();
    globalThis.window = {
      addEventListener(type, fn) {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type).add(fn);
      },
      dispatchEvent(event) {
        handlers.get(event.type)?.forEach((fn) => fn(event));
        return true;
      },
    };
    globalThis.CustomEvent = class {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    };
    world = new WorldManager(makeScene(), makeDialog());
    world.build();
    game = { world, dialog: makeDialog(), scene: makeScene() };
    attachPopCultureZones(game);
  });

  afterEach(() => {
    delete globalThis.window;
    delete globalThis.CustomEvent;
  });

  it('每个 POI 都有 kebab-case id，且全表唯一', () => {
    const ids = world.pointsOfInterest.map((p) => p.id);
    expect(ids.length).toBeGreaterThanOrEqual(50);
    expect(ids.filter((i) => !/^[a-z0-9][a-z0-9-]*$/.test(i ?? ''))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个位面都建出了 POI，其 id 合法且不含显示名', () => {
    for (const zone of world.zones) {
      const pois = zone.getPointsOfInterest();
      expect(pois.length, `${zone.id} 一个 POI 都没有`).toBeGreaterThan(0);
      for (const p of pois) {
        expect(p.id).toMatch(/^[a-z0-9-]+$/);
        expect(p.id.includes(p.label)).toBe(false);
      }
    }
  });

  /**
   * 已知的"同一地物第二块碑"：致敬层在至尊石环旁边又登记了一个交互点，
   * 它派发的是**地物本体**的发现 id。那是内容重复（W-B2 要消掉的 Wave 叠加），
   * 不是身份错乱。新增别名必须写进这张表 —— 逼后来人表态，而不是让门禁闭眼。
   */
  const DISCOVERY_ALIASES = { 'fantasy-ring-echo': 'fantasy-ring' };

  it('调查型 POI 的 id 与它派发的 discovery id 是同一个（别名须显式登记）', () => {
    const mismatched = [];
    for (const poi of world.pointsOfInterest) {
      if (typeof poi.onInteract !== 'function') continue;
      const fired = [];
      window.addEventListener('discovery', (e) => fired.push(e.detail.id));
      poi.onInteract();
      for (const id of fired) {
        if (id === poi.id) continue;
        if (DISCOVERY_ALIASES[poi.id] === id) continue;
        mismatched.push(`${poi.id} → discovery:${id}`);
      }
    }
    // 允许"一处物件登记多次发现"吗？不允许：那正是两份真源的样子
    expect(mismatched).toEqual([]);
  });

  it('别名表本身不失效（表里的 POI 真在登记那个发现）', () => {
    for (const [poiId, discoveryId] of Object.entries(DISCOVERY_ALIASES)) {
      const poi = world.pointsOfInterest.find((p) => p.id === poiId);
      expect(poi, `别名表指向的 ${poiId} 已不存在，这条豁免该删`).toBeTruthy();
      const fired = [];
      window.addEventListener('discovery', (e) => fired.push(e.detail.id));
      poi.onInteract();
      expect(fired).toEqual([discoveryId]);
    }
  });

  it('显示名全部换成乱码后，登记表与交互结果一模一样（身份与文案解耦）', () => {
    const idsBefore = world.pointsOfInterest.map((p) => p.id).join('|');
    for (const p of world.pointsOfInterest) p.label = '▓▒░';
    expect(world.pointsOfInterest.map((p) => p.id).join('|')).toBe(idsBefore);
    expect(world.assertPoiIdentity()).toBe(world.pointsOfInterest.length);

    const ring = world.pointsOfInterest.find((p) => p.id === 'fantasy-ring');
    const fired = [];
    window.addEventListener('discovery', (e) => fired.push(e.detail.id));
    ring.onInteract();
    expect(fired).toEqual(['fantasy-ring']);
  });

  it('枢纽锚点与海报墙都在表里（不走 addPOI 的那两处也要有 id）', () => {
    const ids = new Set(world.pointsOfInterest.map((p) => p.id));
    expect(ids.has('hub-anchor')).toBe(true);
    expect(ids.has('hub-poster-wall')).toBe(true);
  });

  it('主线任务的每个 targetId 都能在世界里找到对应的认领方', () => {
    // 任务的 interact / discovery 目标必须真有人在表里指出来，
    // 否则"完成条件"永远凑不齐，而玩家只看得到"任务卡住"。
    const discovered = new Set();
    for (const poi of world.pointsOfInterest) {
      if (typeof poi.onInteract !== 'function') continue;
      window.addEventListener('discovery', (e) => discovered.add(e.detail.id));
      poi.onInteract();
    }
    for (const id of ['fantasy-ring', 'magic-castle', 'space-tesseract', 'void-rift', 'void-tablet', 'chaos-core']) {
      expect(discovered.has(id), `${id} 没有任何 POI 会登记它`).toBe(true);
    }
    expect(world.hubPOIs.map((p) => p.id)).toContain('hub-anchor');
  });

  it('跨区重复 id 会被自检抓住（致敬层绕过 addPOI 直接 push 也照样）', () => {
    for (const p of world.pointsOfInterest) {
      expect(Number.isFinite(p.position.x + p.position.z)).toBe(true);
    }
    world.pointsOfInterest.push({ id: 'fantasy-ring', label: '伪造', position: { x: 0, z: 0 } });
    expect(() => world.assertPoiIdentity()).toThrow(/重复/);
  });
});

describe('那格死字段不许回来（W-A2 尾巴③ 的更正）', () => {
  /**
   * POI 上那个 `discovered` 以前是"写了没人读"的状态：三处构造点各写一份 `discovered: false`，
   * `PlayerController` 摸一下写成 true，然后全仓没有任何一处读它 —— 也不进存档。
   * 尾巴上记的是"它不进存档，加字段要走一次迁移"；这片一查，真正的前提是先有人读它。
   * 现在四处一起删。这一条钉它不许只写回一半（例如恢复了构造点、判据仍然无人读）。
   */
  const 只数代码 = (文本) => 文本.split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join(' ');
  const 读源码 = (rel) => 只数代码(readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8'));
  const 构造点 = ['world/WorldManager.js', 'world/zones/BaseZone.js', 'world/PopCultureZoneEnhancer.js',
    'player/PlayerController.js'];

  it('四个写它的地方都不再写', () => {
    const 还在写 = 构造点.filter((rel) => /\bdiscovered:/.test(读源码(rel)) || /\.discovered\s*=/.test(读源码(rel)));
    expect(还在写, `这些文件又往 POI 上写 discovered 了：${还在写.join('、')}`).toEqual([]);
  });

  it('判据不是空转：同一条扫法喂一段人造源码必须命中', () => {
    const 人造 = 只数代码('    // discovered: 注释里提一句不算数\n    return { id, label, discovered: false, type };');
    expect(人造).toMatch(/\bdiscovered:/);
    expect(人造).not.toMatch(/注释里提一句/);
  });
});
