/**
 * B122 —— 镜头链的非有限拒绝与重播种（B120 尾巴①）。
 *
 * 登记的账（OVERHAUL/MASTER_PLAN §1.4 B120 尾巴①）：室内高度算出 NaN 之后，玩家会一路坠到 −110 米，
 * 位置本身变成 NaN；B120 修好了"高度从哪来"，但**镜头链自己没有一道非有限拒绝**，于是坏值直接落笔。
 * 浏览器实测（W-C2 切片3 追加诊断）留的是同一个读数：把玩家救回有限地面之后，机位仍是
 * `["-0.1458","NaN","-185.1269"]`、四元数四分量全 NaN、主视锥"看见一切"（在锥 1235/1235）。
 * `.tmp-20261017-b122/probe-camera-nan.mjs` 用真 rig + 真相机 + 真 PlayerController 在 headless 里
 * 复现了这条：救回后再跑 600 帧，机位还是 `[#,NaN,#]` —— 因为阻尼槽的复位判据是
 * `currentCameraPos.lengthSq() === 0`，而这枚式子在 NaN 上算出 NaN，**永远不为真**。
 *
 * 所以这里钉三件事，缺一不可：
 *  1. **落笔口拒绝**（`CameraRig.setView`）：全仓库只有这一处能写相机变换（`§结构` 那组用例普查过），
 *     所以拒收必须长在这里；拒收 = 这一帧不落笔、不认领所有权、画面冻在最后一帧有效机位。
 *  2. **阻尼槽按有限性重播种**（`PlayerController._reseedIfUnusable` + `SpectatorCamera`）：
 *     只拒绝不重播种的话，槽里的 NaN 会永久让每一笔都被拒 —— 镜头冻死，同样是坏结局。
 *     两者合起来才是"坏的时候不动，好了立刻接上"。
 *  3. **另一道门也关上**（`requestFov`）：NaN 因 falsy 碰不到这道门（那是巧合），
 *     但 `Infinity` 是 truthy，旧写法照收，实测把投影矩阵 16 个元素写出 4 个 NaN。
 *
 * 口径沿用 B100 那一课的教训：**门禁只问生产里真实存在的形状**。这里的污染一律从
 * `position` / 目标位置注入（生产就是这条路），不去构造"手动 new 一枚 NaN 向量塞进 rig"以外的假形状，
 * 也不给不可达的分支装绿（相机变换除了 rig 没有第二个写者，所以不加"每帧重新吸附"那种 belt）。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CameraRig, DEFAULT_VIEW_OWNER, isFiniteVec3 } from '../src/engine/CameraRig.js';
import { PlayerController } from '../src/player/PlayerController.js';
import { SpectatorCamera } from '../src/player/SpectatorCamera.js';
import { CAMERA_FOV } from '../src/content/tuning.js';
import { installWindowShim, makeWorld } from './helpers/enemyHarness.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
/** 读源码一律先归一到 LF：仓库按 autocrlf 检出，`\r` 会让跨行判据静默匹配不到（B104 同族） */
const readSrc = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const fin3 = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const camFinite = (cam) => fin3(cam.position)
  && [cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w].every(Number.isFinite);

beforeAll(() => {
  installWindowShim();
  class FakeElement {
    constructor() { this.children = []; this.style = { setProperty() {}, opacity: '' }; this.classList = { add() {}, remove() {}, contains: () => false }; }
    appendChild(c) { this.children.push(c); return c; }
    setAttribute() {}
  }
  globalThis.document = { createElement: () => new FakeElement(), body: new FakeElement() };
  globalThis.requestAnimationFrame = () => 0;
});

/** 拒绝告警是这一片对用户可见的唯一输出：逐例接管，别把控制台刷满也别漏计 */
let warnSpy;
beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warnSpy.mockRestore(); });
const warned = () => warnSpy.mock.calls.map((c) => String(c[0]));

const mkRig = () => {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV.third, 1.6, 0.1, 100);
  return { camera, rig: new CameraRig(camera) };
};

describe('落笔口：CameraRig.setView 拒收非有限机位', () => {
  it('机位有一分量 NaN → 整笔不收，相机停在最后一次有效机位', () => {
    const { camera, rig } = mkRig();
    rig.setView(new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 5, 6), { owner: 'probe' });
    const good = camera.position.toArray();
    rig.setView(new THREE.Vector3(1, NaN, 3), new THREE.Vector3(4, 5, 6), { owner: 'probe' });
    expect(camera.position.toArray()).toEqual(good);
    expect(rig.rejections).toBe(1);
  });

  it('三种非有限写法同罪：NaN / ±Infinity / 缺分量（undefined）', () => {
    const { camera, rig } = mkRig();
    rig.setView(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 1, 0), { owner: 'probe' });
    const good = camera.position.toArray();
    for (const bad of [
      new THREE.Vector3(0, NaN, 0),
      new THREE.Vector3(0, Infinity, 0),
      new THREE.Vector3(0, -Infinity, 0),
      { x: 0, z: 3 },                    // 生产里真实存在的形状：区域中心当初就没有 y（B100/B120）
    ]) {
      rig.setView(bad, new THREE.Vector3(0, 1, 0), { owner: 'probe' });
      expect(camera.position.toArray(), `被拒的应该是 ${JSON.stringify(bad)}`).toEqual(good);
    }
    expect(rig.rejections).toBe(4);
  });

  it('注视点非有限同样不收：机位有限不够', () => {
    const { camera, rig } = mkRig();
    rig.setView(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 1, 0), { owner: 'probe' });
    const look = rig.lookPoint().toArray();
    rig.setView(new THREE.Vector3(9, 9, 9), new THREE.Vector3(0, NaN, 0), { owner: 'probe' });
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(rig.lookPoint().toArray()).toEqual(look);
  });

  it('被拒的那一位不能顺手接管所有权：NaN 帧不改 viewOwner', () => {
    const { rig } = mkRig();
    rig.setView(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 1, 0), { owner: 'player' });
    rig.setView(new THREE.Vector3(NaN, 0, 0), new THREE.Vector3(0, 1, 0), { owner: 'cinematic' });
    expect(rig.viewOwner).toBe('player');
    expect(rig.blending).toBe(false);
    expect(rig.lastRejection.owner).toBe('cinematic');
  });

  it('lastRejection 存的是快照：调用方复用临时向量不会改掉账本', () => {
    const { rig } = mkRig();
    const tmp = new THREE.Vector3(1, NaN, 3);
    rig.setView(tmp, new THREE.Vector3(0, 1, 0), { owner: 'player' });
    tmp.set(-999, -999, -999);          // 热路径上每一帧都会复用同一枚 temp
    expect(rig.lastRejection.position).toEqual([1, NaN, 3]);
  });

  it('连续被拒只告警一次，恢复时回报这一串的长度（风暴不该刷满控制台）', () => {
    const { rig } = mkRig();
    rig.setView(new THREE.Vector3(1, 1, 1), new THREE.Vector3(0, 1, 0), { owner: 'player' });
    for (let i = 0; i < 3; i++) rig.setView(new THREE.Vector3(0, NaN, 0), new THREE.Vector3(0, 1, 0), { owner: 'player' });
    rig.setView(new THREE.Vector3(2, 2, 2), new THREE.Vector3(0, 1, 0), { owner: 'player' });
    const lines = warned();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/拒绝非有限机位/);
    expect(lines[1]).toMatch(/恢复有限/);
    expect(lines[1]).toContain('3');    // 这一串的长度要说出来，不然"恢复了"没证据
    expect(rig.rejectionRun).toBe(0);
    expect(rig.rejections).toBe(3);     // 累计量不清零：它是"镜头为什么冻过"的会话探针
  });

  it('拒绝只挡落笔，不挡 FOV 账：同一帧的申领照常结算', () => {
    const { camera, rig } = mkRig();
    rig.setView(new THREE.Vector3(0, NaN, 0), new THREE.Vector3(0, 1, 0), { owner: 'player' });
    rig.requestFov('a', -11);
    rig.commitFov();
    expect(camera.fov).toBe(CAMERA_FOV.third - 11);
  });
});

describe('另一道门：requestFov 不收非有限增量', () => {
  it('Infinity 被拒：投影矩阵不许出现 NaN 分量', () => {
    const { camera, rig } = mkRig();
    rig.requestFov('override', Infinity);
    rig.commitFov();
    expect(rig.fovLayers).toBe(0);
    expect(camera.fov).toBe(CAMERA_FOV.third);
    expect(camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
  });

  it('NaN 同样不进账（旧写法靠的是 NaN 是 falsy 这一巧合，现在它是明文判据）', () => {
    const { rig } = mkRig();
    rig.requestFov('override', NaN);
    rig.commitFov();
    expect(rig.fovLayers).toBe(0);
    expect(Number.isFinite(rig.fov())).toBe(true);
  });

  it('正当申领不受影响：-11 仍生效、-0 与 0 仍被当"没申领"跳过', () => {
    const { camera, rig } = mkRig();
    rig.requestFov('override', -11);
    rig.commitFov();
    expect(camera.fov).toBe(CAMERA_FOV.third - 11);
    rig.commitFov();
    expect(rig.fovLayers).toBe(0);      // 按帧申领：这帧没人要，偏移自己消失
  });
});

describe('阻尼槽重播种：坏的时候冻住，好了立刻接上（B120 尾巴①的正身）', () => {
  const game = () => ({ paused: false, cinematicActive: false, autoPlayMode: false, combatCamera: null, restScene: null });
  const mk = (mode = 'third') => {
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV[mode], 1.6, 0.1, 100);
    const p = new PlayerController({ add() {}, remove() {} }, camera, makeWorld(), game());
    p.teleport(0, 0, 0); p.yaw = 0; p.pitch = 0; p.cameraMode = mode;
    return { p, camera };
  };
  const step = (p, dt = 1 / 60) => { p.updateCamera(dt); p.rig.commitFov(); p.rig.commitView(dt); };

  it('第三人称：污染期间相机每一帧都还是有限的（rig 把坏值挡在门外）', () => {
    const { p, camera } = mk('third');
    for (let i = 0; i < 5; i++) step(p);
    p.position.set(0, NaN, 0);          // B120 坠落链末端就是这个形状
    for (let i = 0; i < 30; i++) {
      step(p);
      expect(camFinite(camera), `第 ${i} 帧相机被 NaN 污染了`).toBe(true);
    }
    expect(p.rig.rejections).toBeGreaterThanOrEqual(1);
  });

  it('第三人称：玩家回到有限地面后，一帧之内机位重新有限（旧判据在这儿永远红）', () => {
    const { p, camera } = mk('third');
    for (let i = 0; i < 5; i++) step(p);
    p.position.set(0, NaN, 0);
    for (let i = 0; i < 10; i++) step(p);
    expect(fin3(p.currentCameraPos), '阻尼槽应已被污染（否则这条用例测不到东西）').toBe(false);
    p.teleport(0, 0, 0);                // 救回：生产里是传送 / 重生 / 营火
    step(p);
    expect(fin3(p.currentCameraPos)).toBe(true);
    expect(camFinite(camera)).toBe(true);
  });

  it('第一人称：同一条重播种路径（两条落笔处都得自己爬起来）', () => {
    const { p, camera } = mk('first');
    for (let i = 0; i < 5; i++) step(p);
    p.position.set(0, NaN, 0);
    for (let i = 0; i < 10; i++) step(p);
    expect(fin3(p.currentCameraPos)).toBe(false);
    p.teleport(0, 0, 0);
    step(p);
    expect(fin3(p.currentCameraPos)).toBe(true);
    expect(camFinite(camera)).toBe(true);
  });

  /** 视锥探针：平面全有限，且 5000 米外那只盒子必须被剔掉（"在锥 1235/1235"那一路的反证） */
  const cullingSane = (camera) => {
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const pv = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    expect(pv.elements.every(Number.isFinite), 'projectionView 里出现了非有限值').toBe(true);
    const f = new THREE.Frustum().setFromProjectionMatrix(pv);
    expect(
      f.planes.every((pl) => [pl.normal.x, pl.normal.y, pl.normal.z, pl.constant].every(Number.isFinite)),
      '视锥四平面不再是有限值，剔除判定与场景无关'
    ).toBe(true);
    const far = new THREE.Box3(new THREE.Vector3(5000, -1, 5000), new THREE.Vector3(5001, 1, 5001));
    expect(f.intersectsBox(far), '5000 米外的盒子被判为可见（剔除死了）').toBe(false);
  };

  it('视锥一直作数：污染期间和救回之后，剔除都还在剔（B94 那条"看见一切"）', () => {
    const { p, camera } = mk('third');
    for (let i = 0; i < 5; i++) step(p);
    cullingSane(camera);
    p.position.set(0, NaN, 0);
    for (let i = 0; i < 10; i++) { step(p); cullingSane(camera); }   // 冻住的画面也得继续剔
    p.teleport(0, 0, 0);
    for (let i = 0; i < 5; i++) { step(p); cullingSane(camera); }
  });

  it('观看模式：目标位带 NaN 时冻住，目标一回到有限值就接上', () => {
    const { camera, rig } = mkRig();
    const s = new SpectatorCamera(rig);
    s.update(1 / 60, new THREE.Vector3(0, 1, 0), 0, 1);
    const good = camera.position.toArray();
    expect(fin3(camera.position)).toBe(true);
    for (let i = 0; i < 20; i++) s.update(1 / 60, new THREE.Vector3(0, NaN, 0), 0, 1);
    expect(camera.position.toArray()).toEqual(good);   // 拒绝：画面冻在最后一帧好机位
    expect(fin3(s.smoothPos)).toBe(false);              // 阻尼槽确实被污染过
    for (let i = 0; i < 2; i++) s.update(1 / 60, new THREE.Vector3(20, 1, 20), 0, 1);
    expect(fin3(camera.position)).toBe(true);           // 一帧重播种 + 一笔落位
    expect(camera.position.toArray()).not.toEqual(good);
  });

  it(`没申领的写入落在 ${DEFAULT_VIEW_OWNER} 名下：拒绝账也要说得出是谁`, () => {
    const { rig } = mkRig();
    rig.setView(new THREE.Vector3(NaN, 0, 0), new THREE.Vector3(0, 1, 0));
    expect(rig.lastRejection.owner).toBe(DEFAULT_VIEW_OWNER);
  });
});

describe('结构：判据只有一份，写者只有一处', () => {
  const walk = (dir) => {
    const out = [];
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`;
      const abs = join(ROOT, rel);
      if (statSync(abs).isDirectory()) out.push(...walk(rel));
      else if (name.endsWith('.js')) out.push(rel);
    }
    return out;
  };
  const files = walk('src');

  it('普查真的走遍了 src（分母不足时"只有一处写"是空集给的假绿）', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('src/engine/CameraRig.js');
    expect(files).toContain('src/player/PlayerController.js');
  });

  it('全 src 只有 CameraRig 写相机变换（所以拒绝必须长在它身上）', () => {
    const write = /camera\.(position|quaternion|rotation)\.(set|copy|lerp|slerp)\(|camera\.lookAt\(/;
    /**
     * 注释里的"以前这里是这么写的"不是写者。这里唯一被剥掉的一行是
     * `src/core/PerformanceManager.js` 文档注释里引用的旧代码 `sun.shadow.camera.position.copy(playerPos)`
     * —— 下面 `rawHits` 那条断言把这处排除**说出来并钉住**，免得这个过滤器变成一个藏东西的地方。
     */
    const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|[*/]).*$/gm, '');
    const hits = files.filter((f) => write.test(codeOnly(readSrc(f))));
    expect(hits, '除 rig 之外还有谁在直接搬相机，落笔口的守卫就不成合同').toEqual(['src/engine/CameraRig.js']);
    // 反向见证：不排除注释的话命中的正是那个 PerformanceManager —— 排除的是一行注释，不是一个写者
    const rawHits = files.filter((f) => write.test(readSrc(f)));
    expect(rawHits).toEqual(['src/core/PerformanceManager.js', 'src/engine/CameraRig.js']);
  });

  it('判据 isFiniteVec3 全仓库只有一处定义（两份 Number.isFinite 迟早漂开）', () => {
    const def = /(?:export\s+)?(?:const|function)\s+isFiniteVec3\b/;
    const defs = files.filter((f) => def.test(readSrc(f)));
    expect(defs).toEqual(['src/engine/CameraRig.js']);
    expect(typeof isFiniteVec3).toBe('function');
    expect(isFiniteVec3(new THREE.Vector3(0, NaN, 0))).toBe(false);
    expect(isFiniteVec3({ x: 0, y: 0, z: 0 })).toBe(true);   // 只认三个分量，不认它是枚 Vector3
  });

  it('两处阻尼落笔处都走同一个重播种，旧的 lengthSq()===0 判据不许再单独出现', () => {
    const src = readSrc('src/player/PlayerController.js');
    expect(src.match(/this\._reseedIfUnusable\(/g) ?? []).toHaveLength(2);
    // 旧形状：判据只看"是不是零向量"，NaN 上永远为假 —— 允许它存在，但只能在重播种里面
    const bare = src.match(/currentCameraPos\.lengthSq\(\) === 0/g) ?? [];
    expect(bare.length, '复位判据只许长在 _reseedIfUnusable 里').toBe(1);
    const helper = src.slice(src.indexOf('_reseedIfUnusable('));
    expect(helper.slice(0, helper.indexOf('\n  }')).includes('currentCameraPos.lengthSq() === 0')).toBe(true);
  });

  it('重播种先问有限性再看零向量（顺序反了就是白问）', () => {
    const src = readSrc('src/player/PlayerController.js');
    const helper = src.slice(src.indexOf('_reseedIfUnusable('));
    const body = helper.slice(0, helper.indexOf('\n  }'));
    expect(body).toContain('isFiniteVec3(this.currentCameraPos)');
    expect(body).toContain('isFiniteVec3(this.currentLookTarget)');
    expect(body.indexOf('isFiniteVec3')).toBeLessThan(body.indexOf('lengthSq()'));
  });

  it('setView 的守卫在 _pos.copy 之前（写在后面就等于先污染再后悔）', () => {
    const src = readSrc('src/engine/CameraRig.js');
    const m = src.slice(src.indexOf('  setView('));
    expect(m.indexOf('isFiniteVec3(position)')).toBeGreaterThan(-1);
    expect(m.indexOf('isFiniteVec3(position)')).toBeLessThan(m.indexOf('this._pos.copy(position)'));
  });

  it('观看模式的重播种也问有限性（_initialized 一旦为真就再也不播种）', () => {
    const body = readSrc('src/player/SpectatorCamera.js');
    expect(body).toContain('isFiniteVec3(this.smoothPos)');
    expect(body).toContain('isFiniteVec3(this.smoothLook)');
  });
});
