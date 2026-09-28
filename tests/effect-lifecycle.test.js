/**
 * 特效的资源生命周期 —— W-C1 切片1（普查读数在前，改码在后）。
 *
 * 改码之前的只读普查（`.tmp-20260929/wc1-census.mjs`，改码前跑出来的原始数）：
 * - 破碎时线 60 秒（375 次生成）：挂进场景图的东西用过 **360 个不同几何体 + 360 个不同材质**，
 *   `dispose` 被调用 **0** 次 —— 每道残影新建一份胶囊与材质，到期只 `group.remove`，谁也不还。
 * - 混沌边境 60 秒（11 记闪雷）：新增 **11 个几何 + 11 个材质**，同样 0 次 dispose。
 *
 * 这正是 `src/combat/Boss.js:363` 那条注释记过的老毛病（"每次出手新建几何 + 材质，清除时只
 * remove 不 dispose"）在两个从没被测过的类上重演。本层的修法与 `GroundHazards` 同源：
 * **几何共用一份 + 网格池化复用**，雷则收成**一条常驻线与一份预分配的 7 点缓冲**。
 *
 * 光"数字变小"是不够的，所以配五条正向门槛，拦住"把功能删掉来减负"这种修法：
 * ① 30 秒与 60 秒见过的资源一样多（零增长，且那一场确实建过东西）；
 * ② 在场每一道残影有自己的材质（淡出是各道自己的）；
 * ③ 池化期间那份共用胶囊一次也不许 dispose（还回去不等于拆掉）；
 * ④ 在场 + 池里 = 这一场新建过的总数，场景里不留孤儿；
 * ⑤ 每一雷真的重写那 7 个点（不是一条画死的线）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { VoidEcho, MAX_ECHOES } from '../src/effects/VoidEcho.js';
import { ChaosLightning } from '../src/effects/ChaosLightning.js';
import { scheduler } from '../src/engine/Scheduler.js';

const SRC = join(process.cwd(), 'src');
const FRAME = 1 / 60;
const ORIGINAL_RANDOM = Math.random;

/** 开过的监视器：用例自己忘了 stop 也由 afterEach 统一收掉 */
const opened = [];

/**
 * 资源监视器：数"挂进场景图的东西用过哪些几何与材质"。
 *
 * ESM 命名空间是只读的，`THREE.CapsuleGeometry` 这类构造器没法猴补，所以换个口径：
 * 资源要生效必须先进场景图 —— 于是"这一场新建过几份"等价于"`add` 见过的不同 uuid 有几份"。
 * dispose 的计数补在原型上，任何实例被拆掉都跑不掉。
 */
function openWatch() {
  const seen = { geometries: new Set(), materials: new Set() };
  const disposes = { geometries: 0, materials: 0 };
  let spies = null;

  const start = () => {
    const origAdd = THREE.Object3D.prototype.add;
    const origGeoDispose = THREE.BufferGeometry.prototype.dispose;
    const origMatDispose = THREE.Material.prototype.dispose;
    spies = [
      vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (...children) {
        for (const c of children) {
          if (c.geometry) seen.geometries.add(c.geometry.uuid);
          const mats = c.material ? (Array.isArray(c.material) ? c.material : [c.material]) : [];
          for (const m of mats) seen.materials.add(m.uuid);
        }
        return origAdd.apply(this, children);
      }),
      vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(function (...a) {
        disposes.geometries++;
        return origGeoDispose.apply(this, a);
      }),
      vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(function (...a) {
        disposes.materials++;
        return origMatDispose.apply(this, a);
      }),
    ];
  };
  const stop = () => {
    for (const s of spies ?? []) s.mockRestore();
    spies = null;
  };
  start();
  opened.push(stop);
  return { seen, disposes, start, stop };
}

afterEach(() => {
  Math.random = ORIGINAL_RANDOM;
  while (opened.length) opened.pop()();
  scheduler.clearAll();
});

const constRandom = (v) => () => v;
const makeCamera = () => new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);

/** 切片数量：把源码按某个写法数一遍，命中 0 次给 0 而不是让 `match` 抛在断言之前 */
const countIn = (src, re) => (src.match(re) ?? []).length;

/** 在破碎时线里待 `seconds` 秒：玩家一直挪步，残影才有位置差 */
function hauntVoid(seconds, dt = FRAME) {
  const watch = openWatch();
  const fx = new VoidEcho(new THREE.Group());
  const player = new THREE.Vector3();
  const spawnSpy = vi.spyOn(fx, 'spawn');
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) {
    player.x += 0.05;
    fx.update(dt, player, 0.4, true);
  }
  const spawns = spawnSpy.mock.calls.length;
  spawnSpy.mockRestore();
  watch.stop();
  return { fx, seen: watch.seen, disposes: watch.disposes, spawns };
}

describe('破碎时线：残影池化（W-C1 切片1）', () => {
  it('60 秒时线只用得到一份胶囊：普查里那 360 个几何体归一', () => {
    const { seen, spawns } = hauntVoid(60);
    expect(spawns).toBeGreaterThan(100);
    expect(seen.geometries.size).toBe(1);
    expect(seen.materials.size).toBeLessThan(spawns / 4);
  });

  it('跑 30 秒与跑 60 秒见过同样多的资源：零增长，不是少增长', () => {
    const short = hauntVoid(30);
    const long = hauntVoid(60);
    expect(long.spawns).toBeGreaterThan(short.spawns * 1.5);
    expect(long.seen.geometries.size).toBe(short.seen.geometries.size);
    expect(long.seen.materials.size).toBe(short.seen.materials.size);
    // 上面两条若关于"空集"就都没意义：这一场确实建过东西，也不是只建了一格
    expect(short.seen.materials.size).toBeGreaterThan(1);
  });

  it('新建过的网格数不超过同时在场的那个数', () => {
    const { seen } = hauntVoid(60);
    expect(seen.materials.size).toBeLessThanOrEqual(MAX_ECHOES);
  });

  it('在场每一道残影有自己的材质与透明度：淡出不是全系统共用的一块布', () => {
    const { fx } = hauntVoid(2);
    expect(fx.echoes.length).toBeGreaterThan(2);
    const materials = fx.echoes.map((e) => e.mesh.material.uuid);
    expect(new Set(materials).size).toBe(materials.length);
    // 越老的越淡：透明度必须各道一条，共用材质就做不到这件事
    for (let i = 1; i < fx.echoes.length; i++) {
      expect(fx.echoes[i].mesh.material.opacity).toBeGreaterThan(fx.echoes[i - 1].mesh.material.opacity);
    }
    for (const e of fx.echoes) expect(e.mesh.geometry).toBe(fx.geometry);
  });

  it('池化期间一次 dispose 都不发生：还回去不等于拆掉', () => {
    const { disposes } = hauntVoid(60);
    expect(disposes.geometries).toBe(0);
    expect(disposes.materials).toBe(0);
  });

  it('对账：在场 + 池里 = 这一场新建过的总数，场景里不留孤儿', () => {
    const { fx, seen } = hauntVoid(60);
    expect(fx.echoes.length + fx.pooled()).toBe(seen.materials.size);
    expect(fx.group.children.length).toBe(fx.echoes.length);
  });

  it('挤满 12 格时挤掉最旧那道，且那一格立刻被下一道接手', () => {
    const watch = openWatch();
    const fx = new VoidEcho(new THREE.Group());
    const p = new THREE.Vector3(1, 0, 2);
    for (let i = 0; i < MAX_ECHOES; i++) fx.spawn(p.clone(), 0);
    expect(fx.echoes.length).toBe(MAX_ECHOES);
    const oldest = fx.echoes[0].mesh;
    fx.spawn(p.clone(), 0);
    watch.stop();
    expect(fx.echoes.length).toBe(MAX_ECHOES);
    expect(fx.group.children.length).toBe(MAX_ECHOES);
    expect(fx.echoes[0].mesh).not.toBe(oldest);
    expect(fx.echoes[fx.echoes.length - 1].mesh, '挤出去的那格当场被下一道接手').toBe(oldest);
    // 挤出去的那格没有变成一份新资源：总数仍是场面上限，池里也没有多备一格
    expect(watch.seen.materials.size).toBe(MAX_ECHOES);
    expect(fx.pooled()).toBe(0);
  });

  it('复用出来的那一格先归位透明度，不许带着上一道的尾巴', () => {
    const fx = new VoidEcho(new THREE.Group());
    const p = new THREE.Vector3();
    fx.spawn(p.clone(), 0);
    const first = fx.echoes[0].mesh;
    // 推时间让它老死：残影在 update 里到期即摘出
    for (let i = 0; i < 200 && fx.group.children.includes(first); i++) fx.update(0.02, p, 0, true);
    expect(fx.group.children).not.toContain(first);
    expect(first.material.opacity, '老死那一格的尾巴就是 0：这正是复用者要洗掉的东西').toBe(0);
    const idle = fx.pooled();
    expect(idle).toBeGreaterThan(0);
    for (let i = 0; i < idle; i++) {
      fx.spawn(p.clone(), 0);
      const newest = fx.echoes[fx.echoes.length - 1].mesh;
      expect(newest.material.opacity).toBe(fx.mat.opacity);
    }
  });

  it('离开破碎时线：在场的全收进池子，场景一个不留、资源一份不丢', () => {
    const watch = openWatch();
    const fx = new VoidEcho(new THREE.Group());
    const p = new THREE.Vector3();
    for (let i = 0; i < 180; i++) { p.x += 0.05; fx.update(FRAME, p, 0.3, true); }
    fx.setActive(false);
    watch.stop();
    expect(fx.echoes.length).toBe(0);
    expect(fx.group.children.length).toBe(0);
    expect(fx.pooled()).toBe(watch.seen.materials.size);
  });
});

/** 在混沌边境待 `seconds` 秒：主循环与收尾计时一起推进 */
function storm(seconds, dt = FRAME) {
  const watch = openWatch();
  const fx = new ChaosLightning(new THREE.Group(), makeCamera());
  const strikeSpy = vi.spyOn(fx, 'strike');
  const player = new THREE.Vector3();
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) {
    fx.update(dt, player, true);
    scheduler.update(dt);
  }
  const strikes = strikeSpy.mock.calls.length;
  strikeSpy.mockRestore();
  watch.stop();
  return { fx, seen: watch.seen, disposes: watch.disposes, strikes };
}

describe('混沌边境：一条雷线常驻（W-C1 切片1）', () => {
  it('60 秒闪雷只用得到一份几何与一份材质：普查里新增 11 + 11 的那一格归一', () => {
    Math.random = constRandom(0.5);
    const { seen, disposes, strikes, fx } = storm(60);
    expect(strikes).toBeGreaterThanOrEqual(8);
    expect(seen.geometries.size).toBe(1);
    expect(seen.materials.size).toBe(1);
    expect(disposes.geometries).toBe(0);
    // 资源常驻不等于雷还挂着：收尾那一步真的跑过
    expect(fx.bolt.visible).toBe(false);
    expect(fx.flash.intensity).toBe(0);
  });

  it('收雷是把那条线藏起来，不再从场景里摘走资源', () => {
    Math.random = constRandom(0.5);
    const fx = new ChaosLightning(new THREE.Group(), makeCamera());
    const line = fx.bolt;
    fx.strike(new THREE.Vector3(0, 0, 0));
    expect(line.visible).toBe(true);
    expect(fx.boltGroup.children.length).toBe(1);
    expect(fx.boltGroup.children[0]).toBe(line);
    fx.clearBolt();
    expect(line.visible).toBe(false);
    expect(fx.boltGroup.children.length).toBe(1);
  });

  it('收尾走主循环：0.1 秒还挂着、0.12 秒撤掉，dt=0（时停）一秒也不推进', () => {
    Math.random = constRandom(0.5);
    const fx = new ChaosLightning(new THREE.Group(), makeCamera());
    fx.strike(new THREE.Vector3(2, 0, 3));
    scheduler.update(0);
    expect(fx.bolt.visible, '时停期间不许偷偷放完').toBe(true);
    scheduler.update(0.1);
    expect(fx.bolt.visible).toBe(true);
    expect(fx.flash.intensity).toBe(2.8);
    scheduler.update(0.02);
    expect(fx.bolt.visible).toBe(false);
    expect(fx.flash.intensity).toBe(0);
  });

  it('每一雷真的重写那 7 个点：不是一条画死的线，也不再新建缓冲', () => {
    const fx = new ChaosLightning(new THREE.Group(), makeCamera());
    const pos = fx.boltGeo.attributes.position;
    expect(pos.count).toBe(7);
    expect(pos.array.length).toBe(21);
    Math.random = constRandom(0.5);
    fx.strike(new THREE.Vector3(0, 0, 0));
    const before = pos.version;
    const a = Array.from(pos.array);
    Math.random = constRandom(0.9);
    fx.strike(new THREE.Vector3(0, 0, 0));
    const b = Array.from(pos.array);
    // 逐点比，不只比整条：只重写天顶点而下面 6 段不重算，整条数组照样变（变异臂10 就是这样从这条断言背后溜过去的）
    for (let i = 0; i < 7; i++) {
      const p = (arr) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
      expect(p(b), `第 ${i} 个点没跟着这一雷重算`).not.toEqual(p(a));
    }
    expect(pos.version, 'needsUpdate 只有 setter：脏标记落在 version 上').toBeGreaterThan(before);
    expect(fx.bolt.geometry).toBe(fx.boltGeo);
  });

  it('形状照旧：天顶 28 米往下每段 4 米再抖 0~2 米（改的是分配方式，不是长相）', () => {
    Math.random = constRandom(0.5);
    const fx = new ChaosLightning(new THREE.Group(), makeCamera());
    fx.strike(new THREE.Vector3(4, 0, -6));
    const pos = fx.boltGeo.attributes.position;
    expect([pos.getX(0), pos.getY(0), pos.getZ(0)]).toEqual([4, 28, -6]);
    for (let i = 0; i < 6; i++) {
      expect(pos.getX(i + 1)).toBe(4);
      expect(pos.getZ(i + 1)).toBe(-6);
      expect(pos.getY(i + 1)).toBeCloseTo(28 - i * 4 - 1, 5);
    }
  });

  it('离开混沌边境：闪光与那条线都撤下，资源留在原地给下一场', () => {
    Math.random = constRandom(0.5);
    const fx = new ChaosLightning(new THREE.Group(), makeCamera());
    const p = new THREE.Vector3();
    fx.update(FRAME, p, true);
    fx.strike(p);
    expect(fx.bolt.visible).toBe(true);
    fx.update(FRAME, p, false);
    expect(fx.active).toBe(false);
    expect(fx.bolt.visible).toBe(false);
    expect(fx.flash.intensity).toBe(0);
    expect(fx.boltGroup.children.length).toBe(1);
  });

  it('包围球会停在第一次算出的位置上，所以这条线必须不做剔除', () => {
    const fx = new ChaosLightning(new THREE.Group(), makeCamera());
    expect(fx.bolt.frustumCulled).toBe(false);
  });
});

describe('两个系统都还在主循环的接线位置上', () => {
  // 泄漏门禁若关于一个没人调用的类，就只是在读我的用例自己
  it('core/Game.js 仍然每帧推进 VoidEcho 与 ChaosLightning', () => {
    const game = readFileSync(join(SRC, 'core', 'Game.js'), 'utf8');
    expect(game).toMatch(/this\.voidEcho\.update\(dt, /);
    expect(game).toMatch(/this\.chaosLightning\.update\(dt, /);
    expect(game).toMatch(/new VoidEcho\(this\.scene\)/);
    expect(game).toMatch(/new ChaosLightning\(this\.scene, this\.camera\)/);
  });

  it('写法层面的账：分配各只剩一处，摘出场景只发生在归还那一步', () => {
    const echo = readFileSync(join(SRC, 'effects', 'VoidEcho.js'), 'utf8');
    expect(countIn(echo, /new THREE\.CapsuleGeometry\(/g)).toBe(1);
    expect(countIn(echo, /this\.mat\.clone\(\)/g)).toBe(1);
    // 旧的"只 remove 不 dispose"只能出现在 _release 那一处
    expect(countIn(echo, /this\.group\.remove\(/g)).toBe(1);
    expect(countIn(echo, /_release\(/g)).toBe(4);
    const bolt = readFileSync(join(SRC, 'effects', 'ChaosLightning.js'), 'utf8');
    expect(countIn(bolt, /setFromPoints/g)).toBe(0);
    expect(countIn(bolt, /new THREE\.LineBasicMaterial/g)).toBe(1);
    expect(countIn(bolt, /new THREE\.BufferGeometry\(/g)).toBe(1);
    expect(countIn(bolt, /new THREE\.Line\(/g)).toBe(1);
    expect(countIn(bolt, /this\.boltGroup\.remove\(/g)).toBe(0);
  });
});
