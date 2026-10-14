/**
 * 玩家的剑随身体倾（W-C6 切片7，关 B110）。
 *
 * ## 一处两个症状（方向相反）
 * ① **剑不跟着身体歪**：剑挂在逻辑节点（`PlayerController.js` 的 `this.mesh` = `characterModel.group`）
 *    上，而切片6 之后会歪的是它下面那一层视觉层（`__anim`）。实测（探针 `.tmp-20261012/probe-sword-rides.mjs`）：
 *    受击 30 帧里躯干前倾峰值 0.3467 弧度（19.9°），同一时刻挂 `group` 的剑倾角峰值 `0.0000`。
 * ② **把剑改挂视觉层又踩 π**：视觉层里那句 `rotation.y = Math.PI + yawOff` 的 π 是 GLB 素材的朝向偏移，
 *    对**对称**的 fallback 人偶不可见，却把**非对称**的剑镜像到身体另一侧并甩出去一截 —— 同一探针
 *    量到剑的世界 x 从 `+0.5500` 翻成 `−0.6419`。
 *
 * ## 修法
 * π 归 GLB 分支自己的节点（`load()` 里 `model.rotation.y = Math.PI`），视觉层只承载 proc 三份值
 * （`rotation = (pitch, yawOff, roll)`，**不含** π）；剑改挂视觉层，第一人称那把留在相机下。
 * 合成朝向仍是 `π + yawOff`（画面逐帧不变），而剑随身体前倾 / 侧倾一起歪、世界 x 仍在 +0.55 那一侧。
 *
 * ## 判据
 * 行为腿（fallback，可跑）：剑随身体倾（世界四元数偏离单位阵 > 0.05）+ 世界 x 全程不镜像（> 0.3）。
 * 反向对照：把 π 加回视觉层（改前写法），同一把尺必须把剑的世界 x 判到负侧 —— 否则判据是空的。
 * 结构腿：`PlayerController` 把第三人称剑挂视觉层（不是 `this.mesh`）；`CharacterModel` 两条构造路径
 * 都落到 `__anim`、π 留在 model 自己那节点上。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { CharacterModel, PLAYER_VISUAL_ROOT_NAME } from '../src/player/CharacterModel.js';

const ROOT = process.cwd();
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((ln) => { const i = ln.indexOf('//'); return i >= 0 ? ln.slice(0, i) : ln; }).join('\n');

const 人偶 = () => { const cm = new CharacterModel(); cm.createFallback(); return cm; };

/** 挂一把"剑"（就是 `_buildWeapon` 那份局部变换：位置 (0.55, 1.0, 0)）到视觉层 */
function 挂剑(cm) {
  const 剑 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.12));
  剑.position.set(0.55, 1.0, 0);
  cm.modelRoot.add(剑);
  return 剑;
}

/** 起招 → 逐帧推进，采样剑的世界位置 x 与相对单位阵的倾角峰值 */
function 挥招(cm, 剑, 起招, 帧数 = 30, dt = 1 / 60, 随机 = [0.9]) {
  const 原 = Math.random;
  let 指针 = 0;
  Math.random = () => 随机[指针++ % 随机.length];
  const 世界 = new THREE.Vector3();
  const 四 = new THREE.Quaternion();
  let 最大角 = 0; let 最小x = Infinity; let 最大x = -Infinity;
  try {
    起招(cm);
    for (let i = 0; i < 帧数; i++) {
      cm.update(dt);
      cm.group.updateMatrixWorld(true);
      剑.getWorldPosition(世界);
      剑.getWorldQuaternion(四);
      最大角 = Math.max(最大角, 2 * Math.acos(Math.min(1, Math.abs(四.w))));
      最小x = Math.min(最小x, 世界.x);
      最大x = Math.max(最大x, 世界.x);
    }
  } finally {
    Math.random = 原;
  }
  return { 最大角, 最小x, 最大x };
}

describe('玩家的剑随身体倾（W-C6 切片7 / B110）', () => {
  it('剑挂视觉层后随身体歪，且世界 x 全程不镜像（仍在 +0.55 一侧）', () => {
    const cm = 人偶();
    const 剑 = 挂剑(cm);
    expect(cm.modelRoot.name, '剑没挂到 __anim 视觉层').toBe(PLAYER_VISUAL_ROOT_NAME);
    const { 最大角, 最小x, 最大x } = 挥招(cm, 剑, (c) => c.playHit());
    expect(最大角, '剑没跟着身体歪 —— 又挂回逻辑节点了？').toBeGreaterThan(0.05);
    expect(最小x, '剑被镜像到身体负侧了（π 又加回视觉层）').toBeGreaterThan(0.3);
    expect(最大x, '剑被甩出去了：世界 x 越过了 0.9').toBeLessThan(0.9);
  });

  it('反向对照：把 π 加回视觉层，剑的世界 x 必须翻到负侧（判据不许是空的）', () => {
    const cm = 人偶();
    const 剑 = 挂剑(cm);
    cm.modelRoot.rotation.y = Math.PI;   // 改前那句 `Math.PI + yawOff` 的近似（yawOff≈0）
    cm.group.updateMatrixWorld(true);
    const 世界 = new THREE.Vector3();
    剑.getWorldPosition(世界);
    expect(世界.x, '判据对"π 加回视觉层"视而不见 = 这条门禁是空的').toBeLessThan(0);
  });

  it('视觉层只写 proc 的 yawOff，不含 GLB 素材那半圈 π', () => {
    const cm = 人偶();
    cm.proc.yawOff = 0.2;
    cm.update(0);   // dt=0：不衰减，只看写入
    expect(cm.modelRoot.rotation.y).toBeCloseTo(0.2, 9);
    expect(Math.abs(cm.modelRoot.rotation.y - Math.PI), '视觉层里还有 π').toBeGreaterThan(0.5);
  });

  it('结构腿：`PlayerController` 把第三人称剑挂视觉层，不是逻辑节点 `this.mesh`', () => {
    const 净 = stripComments(readFileSync(join(ROOT, 'src/player/PlayerController.js'), 'utf8'));
    expect(净.includes('this.mesh.add(sword)'), '剑又挂回逻辑节点 mesh 了').toBe(false);
    expect(/modelRoot[\s\S]{0,40}\.add\(sword\)/.test(净), '第三人称剑没挂到视觉层').toBe(true);
    // 第一人称那把仍留在相机下（身体前倾不该走着手腕去拧相机）
    expect(净.includes('this.fpWeaponGroup.add(fpSword)'), '第一人称剑的挂点被动了').toBe(true);
  });

  it('结构腿：两条构造路径都落到 `__anim`，π 留在 GLB 的 model 自己那节点上', () => {
    const 净 = stripComments(readFileSync(join(ROOT, 'src/player/CharacterModel.js'), 'utf8'));
    expect(净.includes('视觉.add(model)'), 'GLB 分支没把 model 装进视觉层').toBe(true);
    expect(净.includes('model.rotation.y = Math.PI;'), 'GLB 素材的 π 不在 model 上了').toBe(true);
    expect(净.includes('Math.PI + this.proc.yawOff'), '视觉层又把 π 加回来了：剑会被镜像').toBe(false);
    const 落点次数 = (净.match(/this\.modelRoot = 视觉;/g) || []).length;
    expect(落点次数, 'fallback 与 GLB 两条路径都要落到 __anim 视觉层').toBeGreaterThanOrEqual(2);
    // 两条路径用的是同一个组名常量，不是各写一个字面量
    const 名字次数 = (净.match(/PLAYER_VISUAL_ROOT_NAME/g) || []).length;
    expect(名字次数).toBeGreaterThanOrEqual(2);
    // 反向对照：把视觉层落点退回 model，同一把尺必须点名
    const 坏 = 'this.group.add(model);\n this.modelRoot = model;';
    expect(坏.includes('视觉.add(model)')).toBe(false);
  });

  it('结构腿：相机进场景图 —— 否则挂在相机下的第一人称武器不渲染', () => {
    const 净 = stripComments(readFileSync(join(ROOT, 'src/core/Game.js'), 'utf8'));
    expect(净.includes('this.scene.add(this.camera)'),
      '相机没进场景图：第一人称武器（挂在相机下）根本不会被渲染').toBe(true);
    // 机制见证：three 只遍历 `scene` 子树 —— 挂在相机下的东西，要相机在场景里才可达
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    const 挂件 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    cam.add(挂件);
    expect(scene.getObjectById(挂件.id), '相机没进场景时挂件本不该在场景图里').toBeUndefined();
    scene.add(cam);
    expect(scene.getObjectById(挂件.id), '相机进场景后挂件必须可达，否则它不渲染').toBe(挂件);
  });
});
