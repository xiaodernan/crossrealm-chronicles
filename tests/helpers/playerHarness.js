import * as THREE from 'three';
import { PlayerController } from '../../src/player/PlayerController.js';
import { shake } from '../../src/engine/Shake.js';
import { createPlayerFSM } from '../../src/player/PlayerFSM.js';

/**
 * 只跑 locomotion 所需的最小宿主：拿真实 PlayerController 原型，手工补齐 update()
 * 用到的字段，镜头与交互挂成空函数。这样测的是生产位移代码，而不是测试桩。
 */
export const makePlayer = ({ stamina = 100, moveScale = 1, busy = false, lock = null } = {}) => {
  const p = Object.create(PlayerController.prototype);
  Object.assign(p, {
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(),
    yaw: Math.PI,
    pitch: 0.38,
    targetYaw: Math.PI,
    targetPitch: 0.38,
    mesh: new THREE.Object3D(),
    /** 受击记录：`combat.takeDamage` 替身把每一笔写在这里，用例数得清 */
    hits: [],
    moveSpeed: 15,
    sprintMultiplier: 1.85,
    jumpForce: 10,
    grounded: true,
    timeSlow: 1,
    walkCycle: 0,
    interactCooldown: 0,
    shake,
    colliderRadius: 0.45,
    stepUp: 0.65,
    coyoteTime: 0.1,
    jumpBufferTime: 0.12,
    _jumpBuffer: 0,
    _jumpWasDown: false,
    _coyoteTimer: 0,
    _dashVelocity: new THREE.Vector3(),
    _dashRemaining: 0,
    // readMoveDir 的复用槽（M4 切片2）：构造器里才建，原型宿主须手工补齐同款字段
    _moveTmpDir: new THREE.Vector3(),
    _moveTmpFwd: new THREE.Vector3(),
    _moveTmpRight: new THREE.Vector3(),
    game: {
      cinematicActive: false,
      paused: false,
      autoPlayMode: false,
      spells: { speedMult: 1 },
      dungeons: null,
      dialog: { toast() {} },
    },
    world: { getGroundHeight: () => 0, collision: null, bounds: null },
    combat: {
      update() {},
      stamina,
      isBusy: () => busy,
      canSpend: (n) => stamina >= n,
      getMoveScale: () => moveScale,
      getLockTarget: () => lock,
      // 受击方契约里危险区只用这两条：无敌帧挡段数，挡不住被拖走
      isInvulnerable: () => false,
      takeDamage: (n) => p.hits.push(n),
    },
  });
  p.characterModel = {
    footOffset: 0,
    mixer: null,
    setMovementState() {},
    update() {},
  };
  p.fsm = createPlayerFSM(p);
  p.updateCamera = () => {};
  p.handleInteractions = () => {};
  return p;
};

/** 固定步长推进主循环 */
export const runFrames = (p, seconds, dt, keys = {}) => {
  const start = p.position.clone();
  for (let t = 0; t < seconds - 1e-9; t += dt) p.update(dt, keys);
  return p.position.clone().sub(start);
};
