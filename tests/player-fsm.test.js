import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolvePlayerState, SPRINT_STAMINA_MIN } from '../src/player/PlayerFSM.js';
import { MOVES } from '../src/combat/MoveTable.js';
import { makePlayer, runFrames } from './helpers/playerHarness.js';

describe('玩家状态机的优先级判定', () => {
  const ctx = (over = {}) => ({ moving: false, moveDir: new THREE.Vector3(), sprintHeld: false, ...over });

  it('翻滚冲量未结算完时压倒一切', () => {
    const p = makePlayer({ busy: true });
    p._dashRemaining = 0.1;
    expect(resolvePlayerState(p, ctx({ moving: true }))).toBe('roll');
  });

  it('出手期间不进入冲刺/行走', () => {
    const p = makePlayer({ busy: true });
    expect(resolvePlayerState(p, ctx({ moving: true }))).toBe('attack');
  });

  it('离地即 airborne，但土狼窗内仍放行起跳', () => {
    const p = makePlayer();
    p.grounded = false;
    expect(resolvePlayerState(p, ctx({ moving: true }))).toBe('airborne');
    p.fsm.change('airborne');
    expect(p.fsm.allows('allowJump')).toBe(true);
  });

  it('体力不足时退回 walk 而不是 sprint', () => {
    const low = makePlayer({ stamina: SPRINT_STAMINA_MIN - 1 });
    const high = makePlayer({ stamina: SPRINT_STAMINA_MIN });
    const moving = ctx({ moving: true, sprintHeld: true });
    expect(resolvePlayerState(low, moving)).toBe('walk');
    expect(resolvePlayerState(high, moving)).toBe('sprint');
  });

  it('无输入但锁定目标时进入 lock', () => {
    const p = makePlayer({ lock: { position: new THREE.Vector3(0, 0, 10) } });
    expect(resolvePlayerState(p, ctx())).toBe('lock');
  });

  it('翻滚与出手期间封锁跳跃和交互', () => {
    const p = makePlayer();
    p._dashRemaining = MOVES.roll.duration;
    p.fsm.change('roll');
    expect(p.fsm.allows('allowJump')).toBe(false);
    expect(p.fsm.allows('allowInteract')).toBe(false);
    p.fsm.change('attack');
    expect(p.fsm.allows('allowJump')).toBe(false);
    expect(p.fsm.allows('allowInteract')).toBe(false);
    p.fsm.change('walk');
    expect(p.fsm.allows('allowJump')).toBe(true);
    expect(p.fsm.allows('allowInteract')).toBe(true);
  });
});

describe('翻滚位移按时间积分', () => {
  it('总位移 = 速度 × 时长，与帧率无关', () => {
    const expected = MOVES.roll.speed * MOVES.roll.duration;
    const distances = [1 / 144, 1 / 60, 1 / 30].map((dt) => {
      const p = makePlayer();
      p.applyDash(p.yaw, MOVES.roll.speed, MOVES.roll.duration);
      const moved = runFrames(p, MOVES.roll.duration + 0.05, dt);
      return Math.hypot(moved.x, moved.z);
    });
    for (const d of distances) expect(d).toBeCloseTo(expected, 6);
  });

  it('沿镜头前方而不是后退', () => {
    const p = makePlayer();
    p.applyDash(Math.PI, MOVES.roll.speed, MOVES.roll.duration);
    const moved = runFrames(p, MOVES.roll.duration, 1 / 60);
    expect(moved.z).toBeLessThan(0);
    expect(Math.abs(moved.x)).toBeLessThan(1e-6);
  });

  it('翻滚途中按 W 不会改写冲量', () => {
    const p = makePlayer();
    p.applyDash(p.yaw, MOVES.roll.speed, MOVES.roll.duration);
    for (let i = 0; i < 6; i++) p.update(1 / 60, { KeyW: true });
    expect(p.fsm.current).toBe('roll');
    expect(Math.hypot(p.velocity.x, p.velocity.z)).toBeCloseTo(MOVES.roll.speed, 6);
  });

  it('结算完把冲量收干净，不留幽灵滑行', () => {
    const p = makePlayer();
    p.applyDash(p.yaw, MOVES.roll.speed, MOVES.roll.duration);
    runFrames(p, MOVES.roll.duration + 0.02, 1 / 60);
    expect(p._dashRemaining).toBe(0);
    expect(p.velocity.x).toBe(0);
    expect(p.velocity.z).toBe(0);
  });
});

describe('locomotion 手感参数', () => {
  const steadySpeed = (p, dt, keys) => {
    runFrames(p, 0.5, dt, keys);
    return Math.hypot(p.velocity.x, p.velocity.z);
  };

  it('冲刺速度是步行速度的倍率', () => {
    const p = makePlayer();
    expect(steadySpeed(p, 1 / 60, { KeyW: true })).toBeCloseTo(p.moveSpeed, 6);
    const q = makePlayer();
    expect(steadySpeed(q, 1 / 60, { KeyW: true, ShiftLeft: true })).toBeCloseTo(
      q.moveSpeed * q.sprintMultiplier,
      6
    );
  });

  it('出手期间按帧表的 moveScale 降速', () => {
    const p = makePlayer({ busy: true, moveScale: MOVES.light.moveScale });
    expect(steadySpeed(p, 1 / 60, { KeyW: true })).toBeCloseTo(
      p.moveSpeed * MOVES.light.moveScale,
      6
    );
  });

  it('法术与时停的速度倍率仍然生效', () => {
    const p = makePlayer();
    p.game.spells.speedMult = 1.2;
    p.timeSlow = 0.5;
    expect(steadySpeed(p, 1 / 60, { KeyW: true })).toBeCloseTo(p.moveSpeed * 1.2 * 0.5, 6);
  });

  it('锁定目标且无输入时转向目标', () => {
    const p = makePlayer({ lock: { position: new THREE.Vector3(10, 0, 0) } });
    runFrames(p, 0.5, 1 / 60);
    expect(p.fsm.current).toBe('lock');
    expect(p.mesh.rotation.y).toBeCloseTo(Math.PI / 2, 1);
  });

  it('停止输入后水平速度衰减到零', () => {
    const p = makePlayer();
    runFrames(p, 0.3, 1 / 60, { KeyW: true });
    runFrames(p, 0.6, 1 / 60);
    expect(p.velocity.x).toBe(0);
    expect(p.velocity.z).toBe(0);
  });
});
