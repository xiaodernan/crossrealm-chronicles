/**
 * 走位抖动的尺子（#33）—— 门禁与探针共用这一把。
 *
 * 为什么搬进 `tests/helpers/`：尺子原先只活在 `.tmp-20261031-s25/s11-metric.mjs` 里，
 * 而那条目录随时会被另一条线清掉（未跟踪文件），门禁引用的判据不能住在一个会被删的地方。
 * 同一条仓库纪律：判据抄两份，两份就会分叉，而分叉的两个数字看起来都像是"实测"。
 */
import * as THREE from 'three';
import { createEntityAdapter, STATE_TO_ACTION } from '../../src/animation/AnimationEntityAdapter.js';

/** 连续段：把 "pursue pursue pursue orbit orbit" 折成 [{态, 长}] */
export function 分段(序列) {
  const 出 = [];
  for (const 态 of 序列) {
    const 尾 = 出[出.length - 1];
    if (尾 && 尾.态 === 态) 尾.长 += 1; else 出.push({ 态, 长: 1 });
  }
  return 出;
}

/**
 * 一条链 = 连续若干段都只有 pursue / orbit 两种走位态。
 * 链里换 1 次是正常交接（贴进去就出手，那一帧 'run' 立刻被 windup 的淡化盖掉）；
 * **换 ≥2 次**才是同一条回路来回 —— 玩家看到的抖是这个签名，不是换档总数。
 * `idle` 与承诺态（windup/strike/recover/stagger）都断开链：第三套动作插在中间说明它已被切开。
 */
export function 抖动度(序列) {
  const 段 = 分段(序列);
  const 换 = 段.filter((s, i) => i > 0 && ((s.态 === 'pursue') !== (段[i - 1].态 === 'pursue'))
    && (s.态 === 'pursue' || s.态 === 'orbit') && (段[i - 1].态 === 'pursue' || 段[i - 1].态 === 'orbit'));
  const 段长 = 段.map((s) => s.长);
  const 走位 = new Set(['pursue', 'orbit']);
  let 链 = []; const 链们 = [];
  for (const s of 段) {
    if (!走位.has(s.态)) { if (链.length > 1) 链们.push(链); 链 = []; continue; }
    链.push(s);
  }
  if (链.length > 1) 链们.push(链);
  let 同窗连换 = 0; let 同窗最短 = Infinity;
  for (const 串 of 链们) {
    const 连 = 串.length - 1;
    if (连 < 2) continue;                        // 单次交接不记账
    同窗连换 = Math.max(同窗连换, 连);
    for (const s of 串) 同窗最短 = Math.min(同窗最短, s.长);
  }
  return {
    段数: 段.length,
    pursueOrbit往返: 换.length,
    同窗连换,
    同窗最短: 同窗最短 === Infinity ? 0 : 同窗最短,
    最短段: 段长.length ? Math.min(...段长) : 0,
    中位段: 段长.length ? [...段长].sort((a, b) => a - b)[Math.floor(段长.length / 2)] : 0,
    形态: 段.slice(0, 14).map((s) => `${s.态}:${s.长}`).join(' '),
  };
}

/**
 * 走位一档至少要占多少帧才"不会被打进交叉淡入里"：从**真适配器配置**算出来。
 *
 * 玩家看的不是状态名，是步态。`STATE_TO_ACTION` 把 `pursue → run`、`orbit → walk`，
 * 而 `AnimationController` 用 `Math.max(fadeIn, fadeOut)` 交叉淡入（`registerStates` 里
 * `fadeIn: 0.1`、循环动作 `fadeOut: 0.15`）⇒ 短于一次淡化的换档，画面里连一档都没成形，
 * 只是同一姿势在原地抽搐。所以"每一档 ≥ 这个帧数"才是"玩家看得见在走位"的下界。
 *
 * 这里数的是配置本身，不抄 0.15/9 这两个数：改淡化时长，地板跟着动。
 * @param {number} dt 一帧多少秒
 */
export function 走位地板帧(dt) {
  const mesh = new THREE.Object3D();
  const adapter = createEntityAdapter({ mesh, combatState: 'idle', sprinting: false });
  adapter.registerStates();
  const 步态 = ['pursue', 'orbit'].map((态) => STATE_TO_ACTION[态]);
  let 最久 = 0;
  for (const 动作 of 步态) {
    const cfg = adapter.library.getConfig(动作);
    最久 = Math.max(最久, cfg.fadeIn, cfg.fadeOut);
  }
  adapter.dispose();
  return Math.ceil(最久 / dt);
}
