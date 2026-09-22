/**
 * M2 第九切片：处决镜头。
 *
 * 计划里这条原本写的是"没有专属机位"，读码后并不成立 —— `CombatCameraDirector` 早就有
 * finisher/riposte/execution/bossKill 四套 preset 与绕轨机位。真正的缺口是三处，
 * 这个文件一处一处钉住：
 *   ① 取景不看被处决者的身体（注视点写成 +1.25 米定值，1.87 米的无人机与 3.85 米的 Boss 构图相同）；
 *   ② 第一人称整段不读演出镜头（处决时只剩黑边与慢动作，画面仍朝着鼠标）；
 *   ③ 每帧的覆盖量查询新建五个对象（其中三个 `THREE.Vector3`）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { CombatCameraDirector } from '../src/cinematic/CombatCameraDirector.js';
import { attachCombatCameraSkip } from '../src/cinematic/CombatCameraDirectorExtensions.js';
import { PlayerController } from '../src/player/PlayerController.js';
import { CombatController } from '../src/combat/CombatController.js';
import { EnemyManager } from '../src/combat/EnemyManager.js';
import { TimeController } from '../src/engine/Time.js';
import { MOVES } from '../src/combat/MoveTable.js';
import { CAMERA_FOV, EXECUTION_CAMERA } from '../src/content/tuning.js';
import { installWindowShim, makeWorld, makeScene, spawn } from './helpers/enemyHarness.js';

/** 导演构造期往 DOM 挂四个覆盖层，`play()` 用一次 rAF 翻透明度：node 侧给最小替身 */
function installDomShim() {
  class FakeElement {
    constructor() {
      this.children = [];
      this.style = { setProperty() {}, opacity: '' };
      this.classList = { add() {}, remove() {}, contains: () => false };
    }
    appendChild(c) { this.children.push(c); return c; }
    setAttribute() {}
  }
  globalThis.document = { createElement: () => new FakeElement(), body: new FakeElement() };
  globalThis.requestAnimationFrame = () => 0;
}

beforeAll(() => {
  installWindowShim();
  installDomShim();
});

const mkPlayerStub = (over = {}) => ({
  scene: new THREE.Group(),
  mesh: { getObjectByName: () => null },
  characterModel: null,
  applyDash() {},
  getRightXZ: () => new THREE.Vector3(1, 0, 0),
  position: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  combat: { lockTarget: null },
  getCombatForwardXZ: () => new THREE.Vector3(0, 0, 1),
  timeSlow: 1,
  cameraMode: 'third',
  ...over,
});

const mkGame = (player) => {
  const game = {
    player,
    cinematicActive: false,
    cinematics: null,
    restScene: null,
    combatInputLock: { lock() {}, release() {} },
    audio: { heavyHit() {}, executionSting() {} },
    executionFx: { burst() {} },
  };
  const d = new CombatCameraDirector(game);
  attachCombatCameraSkip(d, game);
  game.combatCamera = d;
  return { d, game, player };
};

/** 演进到 `seconds`，读出那一帧的构图（返回的是常驻对象，故当场取数） */
const shotAt = (d, seconds, dt = 1 / 60) => {
  let ov = d.getCameraOverrides();
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    d.update(dt);
    ov = d.getCameraOverrides();
  }
  return {
    blend: ov.orbit.blend, gaze: ov.gaze, lockOrbit: ov.lockOrbit,
    radius: d._orbitRadius, fovAdd: ov.fovAdd, chestY: d._lookY,
    rawLookY: ov.orbit.lookAt?.y ?? null,
    camPos: ov.orbit.position?.clone() ?? null,
    lookY: d._lookY,
  };
};

/** 以"身高 = 基准档"起手，得到 preset 的原始构图，其余档与它比折算 */
const baseShot = (over = {}) => {
  const { d } = mkGame(mkPlayerStub());
  d.play('execution', { position: { x: 0, y: 0, z: 4 }, stature: EXECUTION_CAMERA.ref, base: 0, ...over });
  return shotAt(d, 0.3);
};

describe('处决取景按被处决者的身体算', () => {
  it('注视点是胸口：身高越高看得越高，而不是恒定 +1.25 米', () => {
    const s = baseShot({ stature: 2.2 });
    const b = baseShot({ stature: 3.85 });
    expect(s.lookY).toBeCloseTo(2.2 * EXECUTION_CAMERA.lookRatio, 2);
    expect(b.lookY).toBeCloseTo(3.85 * EXECUTION_CAMERA.lookRatio, 2);
    expect(b.lookY).toBeGreaterThan(s.lookY * 1.5);
  });

  it('大个子拉得开、小个子收得近，且折算有上下限', () => {
    const ref = baseShot();
    const boss = baseShot({ stature: 3.85 });
    const ant = baseShot({ stature: 0.2 });
    const titan = baseShot({ stature: 40 });
    expect(boss.radius).toBeGreaterThan(ref.radius);
    expect(ant.radius).toBeLessThan(ref.radius);
    // 泰坦不会把镜头送到对岸：折到上限就停
    expect(titan.radius / ref.radius)
      .toBeCloseTo(1 + (EXECUTION_CAMERA.maxScale - 1) * EXECUTION_CAMERA.radiusFollow, 3);
    expect(ant.radius / ref.radius)
      .toBeCloseTo(1 + (EXECUTION_CAMERA.minScale - 1) * EXECUTION_CAMERA.radiusFollow, 3);
  });

  it('悬浮单位看的是它的机体：网格原点离地越高，注视点跟着上去', () => {
    const hovered = baseShot({ stature: 1.87, base: 0.9 });
    const grounded = baseShot({ stature: 1.87, base: 0 });
    expect(hovered.lookY - grounded.lookY).toBeCloseTo(0.9, 2);
  });

  it('基准档等于 preset 原样（折算不是无端放大）', () => {
    const ref = baseShot();
    const same = baseShot({ stature: EXECUTION_CAMERA.ref });
    expect(same.radius).toBeCloseTo(ref.radius, 6);
    expect(ref.fovAdd).toBeLessThan(0);              // 演出仍然压 FOV，取景改动没碰时间轴
  });

  it('事件没带身高时退回旧构图而不是 NaN 或贴脸', () => {
    const { d } = mkGame(mkPlayerStub());
    d.play('execution', { position: { x: 0, y: 0, z: 4 } });
    const s = shotAt(d, 0.3);
    expect(s.lookY).toBeCloseTo(EXECUTION_CAMERA.fallbackStature * EXECUTION_CAMERA.lookRatio, 2);
    expect(Number.isFinite(s.camPos.x)).toBe(true);
    expect(s.radius).toBeCloseTo(baseShot().radius, 6);
  });

  it('没有事件也没有锁定目标时，机位取玩家正前方且完全可用', () => {
    const { d } = mkGame(mkPlayerStub());
    d.play('finisher');
    const s = shotAt(d, 0.3);
    expect(s.camPos).not.toBeNull();
    expect(Number.isFinite(s.lookY)).toBe(true);
    expect(s.lockOrbit).toBe(true);
  });

  it('取景仍然带着玩家：注视点向玩家胸口回拉一档，不把镜头彻底交给目标', () => {
    const { d } = mkGame(mkPlayerStub());
    d.play('execution', { position: { x: 0, y: 0, z: 4 }, stature: 3.85, base: 0 });
    const s = shotAt(d, 0.3);
    expect(s.rawLookY).toBeLessThan(s.chestY);         // 被拉回玩家这一边
    expect(s.rawLookY).toBeGreaterThan(1.2);           // 但不会回到玩家的胸口以下
  });

  it('连击终结/弹反没有事件负载：当场问锁定目标本人要那两个只读量', () => {
    const lock = {
      alive: true,
      position: new THREE.Vector3(0, 0, 5),
      statureHeight: () => 3.0,
      hurtBaseY: () => 0.5,
    };
    const { d } = mkGame(mkPlayerStub({ combat: { lockTarget: lock } }));
    d.play('riposte');
    const s = shotAt(d, 0.3);
    expect(s.lookY).toBeCloseTo(0.5 + 3.0 * EXECUTION_CAMERA.lookRatio, 2);
  });

  it('敌人公开自己的取景身高：Boss 一档明显大于士兵一档', () => {
    const mgr = new EnemyManager(makeScene(), makeWorld(), null);
    const soldier = spawn(mgr, { type: 'soldier' });
    const boss = spawn(mgr, { type: 'boss' });
    expect(boss.statureHeight()).toBeGreaterThan(soldier.statureHeight() * 1.5);
    // 取景给的是"离网格原点多高"，悬浮单位另算：与 hurtBaseY 不重复计一次高度
    const drone = spawn(mgr, { type: 'drone' });
    expect(drone.statureHeight()).toBeCloseTo(2.20 * 0.85, 6);
  });
});

describe('第一人称也吃到这台机位', () => {
  const mkReal = () => {
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV.first, 1, 0.1, 100);
    const game = {
      paused: false, cinematicActive: false, autoPlayMode: false,
      dialog: { toast() {} }, combatCamera: null, restScene: null,
      combatInputLock: { lock() {}, release() {} },
      audio: { heavyHit() {}, executionSting() {} },
      executionFx: { burst() {} }, cinematics: null,
    };
    const p = new PlayerController(makeScene(), camera, makeWorld(), game);
    game.player = p;
    p.teleport(0, 0, 0);
    p.toggleCameraMode();                            // 走真实切换：基准 FOV 跟着视角改
    p.yaw = 0;                                       // 正前方是 +Z
    p.pitch = 0;
    const d = new CombatCameraDirector(game);
    attachCombatCameraSkip(d, game);
    game.combatCamera = d;
    return { p, camera, game, d };
  };

  const dirOf = (cam) => cam.getWorldDirection(new THREE.Vector3());
  /** 数投影矩阵被重算了几次：一帧一笔是 rig 的承诺 */
  const countProjectionWrites = (cam) => {
    if (!cam.__patched) {
      cam.__patched = true;
      cam.__writes = 0;
      const orig = cam.updateProjectionMatrix.bind(cam);
      cam.updateProjectionMatrix = () => { cam.__writes++; return orig(); };
    }
    return cam.__writes;
  };
  const behind = { x: 0, y: 1.2, z: -4 };            // 被处决者在玩家正后方

  it('不接管时玩家看着自己朝的方向', () => {
    const { p, camera } = mkReal();
    for (let i = 0; i < 30; i++) p.updateCamera(1 / 60);
    expect(dirOf(camera).z).toBeGreaterThan(0.99);
  });

  it('处决目标在身后时视线被拉过去：眼睛不搬，搬的是"看哪里"', () => {
    const { p, camera, d } = mkReal();
    d.play('execution', { position: behind, stature: 2.2, base: 0 });
    for (let i = 0; i < 40; i++) {
      d.update(1 / 60);
      p.updateCamera(1 / 60);
      p.rig.commitFov();
    }
    expect(dirOf(camera).z).toBeLessThan(-0.5);
  });

  it('FOV 压缩对两种镜头模式都成立，且一帧只落一笔', () => {
    const { p, camera, d } = mkReal();
    d.play('execution', { position: behind, stature: 2.2, base: 0 });
    d.update(1 / 60);
    p.updateCamera(1 / 60);
    const writes = countProjectionWrites(camera);
    p.rig.commitFov();                               // 主循环收尾那一次
    expect(camera.fov).toBeLessThan(CAMERA_FOV.first);
    expect(p.rig.fovLayers).toBe(1);                 // 导演与玩家相机共用同一层，不叠成两倍
    p.toggleCameraMode();                            // 切回第三人称：基准换档，同一层继续申领
    d.update(1 / 60);
    p.updateCamera(1 / 60);
    p.rig.commitFov();
    expect(camera.fov).toBeLessThan(CAMERA_FOV.third);
    expect(countProjectionWrites(camera)).toBeLessThanOrEqual(writes + 2);
  });

  it('演出结束后视线与 FOV 都交还给玩家', () => {
    const { p, camera, d } = mkReal();
    d.play('execution', { position: behind, stature: 2.2, base: 0 });
    for (let i = 0; i < 120; i++) { d.update(1 / 60); p.updateCamera(1 / 60); p.rig.commitFov(); }
    expect(d.active).toBe(false);
    for (let i = 0; i < 90; i++) { p.updateCamera(1 / 60); p.rig.commitFov(); }
    expect(camera.fov).toBe(CAMERA_FOV.first);
    expect(p.rig.fovLayers).toBe(0);
    expect(dirOf(camera).z).toBeGreaterThan(0.99);
  });

  it('Esc 跳过走的是同一条释放路径，不留残余机位', () => {
    const { p, camera, d } = mkReal();
    d.play('execution', { position: behind, stature: 2.2, base: 0 });
    d.update(1 / 60);
    p.updateCamera(1 / 60);
    p.rig.commitFov();
    expect(camera.fov).toBeLessThan(CAMERA_FOV.first);
    d.skip();                                        // 跳过是一条退出路径：偏移当场收回
    expect(camera.fov).toBe(CAMERA_FOV.first);
    for (let i = 0; i < 90; i++) { p.updateCamera(1 / 60); p.rig.commitFov(); }
    expect(camera.fov).toBe(CAMERA_FOV.first);
    expect(p.rig.fovLayers).toBe(0);
    expect(dirOf(camera).z).toBeGreaterThan(0.99);
  });

  it('导演只出覆盖量，不自己搬相机：PlayerController 仍是唯一的机位写入者', () => {
    const { p, camera, d } = mkReal();
    p.updateCamera(1 / 60);                          // 先落一笔，拿到"玩家的机位"
    p.rig.commitFov();
    const at = camera.position.clone();
    d.play('execution', { position: behind, stature: 2.2, base: 0 });
    d.update(1 / 60);
    p.rig.commitFov();                               // 演进的这一帧里没有玩家写入
    expect(camera.position.distanceTo(at)).toBe(0);
  });
});

describe('覆盖量协议不做每帧分配', () => {
  it('连续查询拿到的是同一份对象与同一对取景点，但数值仍在推进', () => {
    const { d } = mkGame(mkPlayerStub());
    d.play('execution', { position: { x: 0, y: 0, z: 4 }, stature: 2.2, base: 0 });
    const first = d.getCameraOverrides();
    const pos = first.orbit.position;
    const look = first.orbit.lookAt;
    const start = { x: pos.x, z: pos.z };
    for (let i = 0; i < 30; i++) {
      d.update(1 / 60);
      const ov = d.getCameraOverrides();
      expect(ov).toBe(first);
      expect(ov.orbit.position).toBe(pos);
      expect(ov.orbit.lookAt).toBe(look);
    }
    expect(Math.hypot(pos.x - start.x, pos.z - start.z)).toBeGreaterThan(0.05);
  });

  it('未接管时严格为空，读取方的 ?. 短路仍然成立', () => {
    const { d } = mkGame(mkPlayerStub());
    const ov = d.getCameraOverrides();
    expect(ov.lockOrbit).toBe(false);
    expect(ov.gaze).toBe(0);
    expect(ov.pull).toBe(0);
    expect(ov.fovAdd).toBe(0);
    expect(ov.focus).toBeNull();
    expect(ov.orbit.position).toBeNull();
    expect(ov.orbit.lookAt).toBeNull();
  });

  it('gaze 与 lockOrbit 同一条门槛：不会第三人称已绕轨而第一人称还看着别处', () => {
    const { d } = mkGame(mkPlayerStub());
    d.play('execution', { position: { x: 0, y: 0, z: 4 }, stature: 2.2, base: 0 });
    let mismatch = 0;
    for (let i = 0; i < 60; i++) {
      d.update(1 / 60);
      const ov = d.getCameraOverrides();
      if (ov.lockOrbit !== (ov.gaze > 0)) mismatch++;
    }
    expect(mismatch).toBe(0);
  });

  it('借视线的额度不超过混合量本身（第一人称不该被整段锁死）', () => {
    const { d } = mkGame(mkPlayerStub());
    d.play('execution', { position: { x: 0, y: 0, z: 4 }, stature: 2.2, base: 0 });
    let maxGaze = 0;
    for (let i = 0; i < 60; i++) {
      d.update(1 / 60);
      const ov = d.getCameraOverrides();
      maxGaze = Math.max(maxGaze, ov.gaze);
      expect(ov.gaze).toBeLessThanOrEqual(ov.orbit.blend + 1e-9);
    }
    expect(maxGaze).toBeGreaterThan(0);
    expect(maxGaze).toBeLessThan(1);
  });
});

describe('击杀把身高交给事件', () => {
  const mkCombat = (player, enemies) => {
    const noop = () => {};
    const combat = new CombatController(player, { enemies, getAliveEnemies: () => enemies.filter((e) => e.alive) },
      { toast: noop }, null, {
        swingLight: noop, swingHeavy: noop, hit: noop, heavyHit: noop, dodge: noop,
        parry: noop, blockClink: noop, spellCast: noop, playerHurt: noop,
      }, null);
    combat.setTimeController(new TimeController());
    combat.rng = () => 0.99;
    return combat;
  };

  /** 真实敌人 + 真实 CombatController：一记轻击打死它，事件负载由生产方自己交出 */
  const killOne = (type) => {
    const mgr = new EnemyManager(makeScene(), makeWorld(), null);
    const e = spawn(mgr, { type, x: 0, z: 2.4, hp: 1, posture: 900, damage: 10, speed: 0 });
    const player = mkPlayerStub();
    const combat = mkCombat(player, [e]);
    const seen = [];
    window.addEventListener('combat-execution', (ev) => seen.push(ev.detail));
    combat.tryLightAttack();
    for (let t = 0; t < MOVES.light.duration + 0.02; t += 1 / 120) combat.update(1 / 120, {});
    return { detail: seen[0] ?? null, enemy: e };
  };

  it('事件带出受击盒顶与网格原点高度，Boss 一档明显大于士兵一档', () => {
    const sol = killOne('soldier');
    const boss = killOne('boss');
    expect(sol.detail, '轻击致死没有派发 combat-execution').toBeTruthy();
    expect(sol.detail.stature).toBeCloseTo(2.2, 6);   // 士兵受击盒顶：head.y1 × scale 1.0
    expect(boss.detail.stature).toBeGreaterThan(sol.detail.stature * 1.5);
    expect(sol.detail.boss).toBe(false);
    expect(boss.detail.boss).toBe(true);
    expect(sol.detail.position.z).toBeCloseTo(2.4, 1);
  });

  it('取景吃的是事件里的身高：同一段处决，Boss 的注视点确实比士兵高', () => {
    const { d } = mkGame(mkPlayerStub());
    const sol = killOne('soldier');
    d.play('execution', sol.detail);
    const soldierLook = shotAt(d, 0.3).lookY;
    const boss = killOne('boss');
    d.play('execution', boss.detail);
    const bossLook = shotAt(d, 0.3).lookY;
    expect(bossLook).toBeGreaterThan(soldierLook * 1.5);
  });
});
