/**
 * 玩家侧战斗反馈的两笔账（W-C6 切片6）。
 *
 * ## 这片门禁钉住的是实测到的两个洞
 *
 * 先读数再动手（探针在本仓 `.tmp-20261012/`，都是 node 直跑，不碰渲染器）：
 * - **受击不是趔趄，是抽搐**（登记为 B108）：`_applyProcCombat` 的 `hit` 分支写的是
 *   `proc.roll = (Math.random() - 0.5) * 0.25 * i` —— 每帧重摇一次。实测
 *   `probe-player-hit.mjs`：20 局受击 × 26 帧里 `proc.roll` **逐帧翻号 248 次**，
 *   总变分 2.278 而单调衰减应当 ≈ 2×峰值 = 0.21（**11 倍的多余运动**）。
 *   关键是这条路径**在役**：`probe-glb-names.mjs` 读 `public/assets/models/Soldier.glb`
 *   的 clip 名 = `[Idle, Run, TPose, Walk]`，`hit / block / dodge` 一个都没有
 *   ⇒ `hasMixamoClips === false` ⇒ 每一次受击走的都是 proc 分支。
 *   玩家看得见的事：挨一下打，身体每帧左右各抖一下，半秒才停。
 * - **没有 GLB 的玩家一动不动**（登记为 B109）：`createFallback()` 把 `modelRoot` 设成
 *   `group` 自己，而 `update()` 里的守卫 `modelRoot !== this.group`（怕动画写脏 `PlayerController`
 *   每帧 lerp 的逻辑朝向，`PlayerController.js:124` 的 `mesh` 就指向这个 `group`）于是**整段
 *   写入被跳过**。实测 `probe-player-hit.mjs` [b] 段：5 招 × 30 帧，落点最大变化 `0.00e+0`，
 *   同期 proc 自己算到了 0.70 弧度。守卫是半个修：它防住了 B107 的玩家版，代价是把反馈全吞了。
 *
 * ## 修法就是切片5 那一条：所有权分家，不是打补丁
 *
 * `createFallback()` 把部件住进一个视觉层根节点（名字与 `animation` 侧的 `ANIM_ROOT_NAME`
 * 同一约定，由下面第 2 例钉住相等），`update()` 里的静默跳过改成无条件写到视觉层 ——
 * "动画能不能碰逻辑朝向"这个问题在结构上不再存在，而不是靠一个把反馈一起吃掉的 `if`。
 * 受击则把趔趄方向在 `_startProcCombat` 那一刻**冻一份**，与 GLB clip 路径本来就是一次性
 * 赋值（`playHit` 的 `_playOnce`）对齐。
 *
 * ## 判据为什么长成这样
 *
 * 逐招"落点与 proc 三通道逐帧相等"是**接线**判据（写没写到对的地方），逐招"偏离不为零"是
 * **反馈存在**判据（前一条对全 0 也成立），逻辑朝向哨兵是**不越界**判据（切片5 的同款陷阱：
 * 只删守卫不分家 ⇒ 那句 `rotation.y = yawOff`（B110 之前是 `Math.PI + yawOff`）落在逻辑朝向上，
 * 改前实测 `1.5708 → 3.2616`）。三条各钉一层，少一条就有一类漂移能溜过去。
 * 采样一律把 `Math.random` 钉成定值：趔趄方向现在是一次抽签定的，不钉住的那条"不为零"腿
 * 就是靠运气绿（抽到 0.5 附近偏离不到 0.05）；只有受击那一例改用一份**会翻号**的序列，
 * 因为"每帧重摇"这个坏味道只在随机值跨 0.5 时才露出来。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { CharacterModel, PLAYER_VISUAL_ROOT_NAME } from '../src/player/CharacterModel.js';
import { ANIM_ROOT_NAME } from '../src/animation/AnimationEntityAdapter.js';

const ROOT = process.cwd();
const 源路径 = join(ROOT, 'src/player/CharacterModel.js');
const 源文本 = readFileSync(源路径, 'utf8');
/** 剥注释：说明文字里提到旧写法是常态，不是接线（与 chunk-graph / visual-root 同款口径） */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((ln) => { const i = ln.indexOf('//'); return i >= 0 ? ln.slice(0, i) : ln; }).join('\n');
const 净源 = stripComments(源文本);

/** 起手函数：`playComboAttack(step)` 带参数，其余都是零参 */
const 招式表 = [
  ['轻击一式', (cm) => cm.playComboAttack(1)],
  ['轻击二式', (cm) => cm.playComboAttack(2)],
  ['轻击三式', (cm) => cm.playComboAttack(3)],
  ['重击', (cm) => cm.playHeavyAttack()],
  ['翻滚', (cm) => cm.playDodge()],
  ['受击', (cm) => cm.playHit()],
  ['格挡', (cm) => cm.playBlock()],
  ['弹反反击', (cm) => cm.playRiposte()],
  ['弹反成功', (cm) => cm.playParrySuccess()],
  ['战技', (cm) => cm.playSkill()],
];

/** 真 fallback 玩家：不碰 `load()`，因为 node 里 GLTFLoader 那条链需要网络与 DOM 响应 */
const 人偶 = () => { const cm = new CharacterModel(); cm.createFallback(); return cm; };

/** 逐帧采样：落点三通道 + proc 三通道 + 逻辑 group 的欧拉角 */
const 默认随机 = [0.87];
function 推进(cm, 起招, 帧数 = 30, dt = 1 / 60, 随机 = 默认随机) {
  // 受击的趔趄方向现在是一次抽签定的（`_startProcCombat` 里那份 `rollOffset`）—— 不钉住它，
  // "反馈大到看得出来"那一腿就成了靠运气绿的用例（抽到 0.5 附近就不到 0.05）。
  const 原 = Math.random;
  let 指针 = 0;
  Math.random = () => 随机[指针++ % 随机.length];
  const 序 = { 落点: [], proc: [], group: [] };
  try {
    起招(cm);
    for (let i = 0; i < 帧数; i++) {
      cm.update(dt);
      const m = cm.modelRoot;
      序.落点.push([m.rotation.x, m.rotation.y, m.rotation.z]);
      // B110：视觉层只承载 proc 三份值，**不含** GLB 素材那半圈 π（π 归 GLB 分支自己的节点）
      序.proc.push([cm.proc.pitch, cm.proc.yawOff, cm.proc.roll]);
      序.group.push([cm.group.rotation.x, cm.group.rotation.y, cm.group.rotation.z]);
    }
  } finally {
    Math.random = 原;
  }
  return 序;
}
const 绝对峰 = (列, 轴) => Math.max(...列.map((三) => Math.abs(三[轴])));

describe('玩家战斗反馈：视觉层分家与一次定死的趔趄（W-C6 切片6）', () => {
  it('fallback 把部件住进视觉层根节点，而不是挂在逻辑节点 `group` 上', () => {
    const cm = 人偶();
    expect(cm.modelRoot, 'modelRoot 还没建起来').toBeTruthy();
    expect(cm.modelRoot).not.toBe(cm.group);
    expect(cm.modelRoot.name).toBe(PLAYER_VISUAL_ROOT_NAME);
    // 搬进去而不是复制：`group` 的直接子节点只剩这一层（武器此后另挂 group，与本层同辈）
    expect(cm.group.children.map((o) => o.name)).toEqual([PLAYER_VISUAL_ROOT_NAME]);
    // 世界变换不变：视觉层局部变换是单位阵，torso/head 的局部 y 就是它们原来的高度
    expect(cm.modelRoot.children.map((o) => o.type).sort()).toEqual(['Mesh', 'Mesh']);
    const torso = cm.modelRoot.children.find((o) => o.geometry?.type === 'CapsuleGeometry');
    expect(torso, '找不到躯干：部件没被搬进视觉层').toBeTruthy();
    const 世界 = new THREE.Vector3();
    torso.getWorldPosition(世界);
    expect(世界.y).toBeCloseTo(1.1, 9);
    expect(cm.fallback).toBe(true);
    expect(cm.loaded).toBe(true);
  });

  it('一条约定一份名字：玩家侧的视觉根与动画侧的 `ANIM_ROOT_NAME` 同名', () => {
    // 不是抄同样的数算同源：这一条钉的是**等式**，任何一侧改名都会在这里断
    expect(PLAYER_VISUAL_ROOT_NAME).toBe(ANIM_ROOT_NAME);
    expect(PLAYER_VISUAL_ROOT_NAME.length, '空名字等于没有约定').toBeGreaterThan(0);
  });

  it('真接缝：`load()` 的离线路径落到同一个视觉层（stub 必须真的被调用过）', async () => {
    const 原 = globalThis.fetch;
    let 次数 = 0;
    globalThis.fetch = () => { 次数++; return Promise.reject(new TypeError('offline')); };
    try {
      const cm = new CharacterModel();
      await cm.load();
      expect(次数, 'fetch 一次都没被走到 —— 这条用例测的不是 load 的接缝').toBeGreaterThan(0);
      expect(cm.loaded).toBe(true);
      expect(cm.fallback, '三条候选全失败时该落到 fallback').toBe(true);
      expect(cm.modelRoot).not.toBe(cm.group);
      expect(cm.modelRoot.name).toBe(PLAYER_VISUAL_ROOT_NAME);
    } finally {
      globalThis.fetch = 原;
    }
  });

  for (const [名, 起招] of 招式表) {
    it(`${名}：落点逐帧等于 proc 的三份值（接线判据）`, () => {
      const cm = 人偶();
      const 序 = 推进(cm, 起招);
      序.落点.forEach((落, i) => {
        const 算 = 序.proc[i];
        expect(落[0], `${名} 第 ${i} 帧 pitch 没写到视觉层`).toBe(算[0]);
        expect(落[1], `${名} 第 ${i} 帧 yaw 没写到视觉层`).toBe(算[1]);
        expect(落[2], `${名} 第 ${i} 帧 roll 没写到视觉层`).toBe(算[2]);
      });
    });

    it(`${名}：反馈大到看得出来（不为零判据；逐帧相等对全 0 也成立）`, () => {
      const cm = 人偶();
      const 序 = 推进(cm, 起招);
      const 偏离 = Math.max(
        绝对峰(序.落点, 0),                        // 前倾 / 后仰
        Math.max(...序.落点.map((三) => Math.abs(三[2]))), // 侧倾
        Math.max(...序.落点.map((三) => Math.abs(三[1]))), // 偏头（B110：视觉层不含 π）
      );
      // 0.05 弧度（≈ 2.9°）是"一眼看不出就不算反馈"的下限，不是从某次读数反推的数
      expect(偏离, `${名}：视觉层几乎没动 —— 反馈又被谁吞了？`).toBeGreaterThan(0.05);
    });
  }

  it('逻辑朝向哨兵：十招打下来 `group.rotation` 一字不动（B107 的玩家版不许回来）', () => {
    for (const [名, 起招] of 招式表) {
      const cm = 人偶();
      cm.group.rotation.set(0.11, 1.5708, 0.07);   // PlayerController 每帧 lerp 的那一份
      const 哨兵 = [0.11, 1.5708, 0.07];
      const 序 = 推进(cm, 起招);
      序.group.forEach((三, i) => 三.forEach((值, 轴) => {
        expect(值, `${名} 第 ${i} 帧动画写了逻辑节点的第 ${轴} 轴`).toBe(哨兵[轴]);
      }));
    }
  });

  it('受击的趔趄方向一次定死：整段不翻号、总量不增；同一把尺对改前的每帧重摇必须点名', () => {
    // 这一例要的是**会翻号**的一份序列（默认那一份是定值，测不出"每帧重摇"）
    const 序列 = [0.91, 0.06, 0.73, 0.22, 0.55, 0.48, 0.99, 0.01, 0.62, 0.37,
      0.85, 0.14, 0.5, 0.77, 0.31, 0.68, 0.09, 0.94, 0.41, 0.58];
    const cm = 人偶();
    const 序 = 推进(cm, (c) => c.playHit(), 26, 1 / 60, 序列).落点.map((三) => 三[2]);
    const 翻号 = (列) =>列.reduce((计, 值, i) => (i && 值 * 列[i - 1] < 0 ? 计 + 1 : 计), 0);
    expect(翻号(序), `受击里侧倾翻了 ${翻号(序)} 次号：一记趔趄变成左右抽搐`).toBe(0);
    const 单调 = 序.every((值, i) => !i || Math.abs(值) <= Math.abs(序[i - 1]) + 1e-12);
    expect(单调, '侧倾在整段里不该变大 —— 定死之后只剩衰减').toBe(true);
    let 变分 = 0;
    for (let i = 1; i < 序.length; i++) 变分 += Math.abs(序[i] - 序[i - 1]);
    expect(变分, '单调序列的总变分 = 首末之差').toBeLessThanOrEqual(Math.abs(序[0]) + 1e-12);
    expect(Math.abs(序[0]), '反馈本身不该是 0').toBeGreaterThan(0.01);

    // 反向对照：把**改前那个每帧重摇的式子**按同一份随机序列算出来，判据必须说它抽搐
    const 原 = Math.random;
    let 指针 = 0;
    Math.random = () => 序列[指针++ % 序列.length];
    let 改前;
    try {
      改前 = Array.from({ length: 26 }, () => (Math.random() - 0.5) * 0.25 * 1);
    } finally {
      Math.random = 原;
    }
    expect(翻号(改前), '判据对"每帧重摇"视而不见 = 这条门禁是空的').toBeGreaterThan(0);
  });

  it('结构腿：`update()` 里不许再有"落点是逻辑节点就整段跳过"的形状，而写入三行必须在', () => {
    // 静默吞反馈的那个形状（B109 的机制本体）
    expect(净源.includes('this.modelRoot !== this.group'),
      '守卫回来了：它一回来，fallback 的战斗反馈就又整段消失').toBe(false);
    // 空转对照：删掉守卫的正确修法是把落点搬家，不是顺手删掉写入 —— 所以写入三行必须在
    for (const 式 of [
      'this.modelRoot.rotation.x = this.proc.pitch;',
      'this.modelRoot.rotation.z = this.proc.roll;',
      'this.modelRoot.rotation.y = this.proc.yawOff;',   // B110：不再带 GLB 素材那半圈 π
    ]) {
      expect(净源.includes(式), `写入落点的式子不见了：${式}`).toBe(true);
    }
    // 判据自证：同一把尺喂给人造的"带守卫"源码，必须点名
    expect(stripComments('if (this.modelRoot && this.modelRoot !== this.group) { x = 1; }')
      .includes('this.modelRoot !== this.group'), '判据本身失灵').toBe(true);
  });

  it('`load()` 的顺序见证：model 先装进视觉层、再把它当落点；π 留在 model 自己那节点上（B110）', () => {
    // B110 之后 GLB 分支的落点是 `__anim` 视觉层（不是 model 自己），model 被装进它
    const 装 = 净源.indexOf('视觉.add(model)');
    const 指 = 净源.lastIndexOf('this.modelRoot = 视觉;');   // load 那一处（fallback 那一处更早）
    expect(装, 'GLB 分支没把 model 装进视觉层？').toBeGreaterThanOrEqual(0);
    expect(指, 'GLB 分支没把落点设成视觉层？').toBeGreaterThanOrEqual(0);
    expect(装 < 指, '落点在 model 装进视觉层之前就被指定了：写入落在一个还没进场景图的节点上').toBe(true);
    // GLB 素材的朝向偏移 π 留在 model 自己那节点上（视觉层不含 π —— 否则剑会被镜像，B110）
    expect(净源.includes('model.rotation.y = Math.PI;'), 'π 不在 model 上了：合成朝向会少半圈').toBe(true);
    expect(净源.includes('Math.PI + this.proc.yawOff'), '视觉层又把 π 加回来了：剑会被镜像到另一侧').toBe(false);
    // 反向对照：先指后装的那种源码，同一把尺必须判 false
    const 坏 = 'const m = 1;\n this.modelRoot = 视觉;\n 视觉.add(model)';
    expect(stripComments(坏).indexOf('视觉.add(model)') < stripComments(坏).lastIndexOf('this.modelRoot = 视觉;')).toBe(false);
  });

  it('重复 `createFallback()` 只套一层视觉根（重试加载不许把部件埋进两层组）', () => {
    const cm = 人偶();
    const 第一层 = cm.modelRoot;
    cm.createFallback();
    expect(cm.group.children.length, '又套了一层视觉根').toBe(1);
    expect(cm.modelRoot).toBe(第一层);
  });
});
