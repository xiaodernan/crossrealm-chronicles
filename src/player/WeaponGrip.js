import * as THREE from 'three';

/**
 * 握持层 —— 把武器挂进**手的骨骼**，不再挂在躯干旁边的一个固定坐标上（W-C6 切片9，关 B112）。
 *
 * ## 病根（对着 `Soldier.glb` 字节量出来的）
 * 静态读数来自反向求解探针 `.tmp-20261014/probe-grip-solve2.mjs`，逐帧读数走出货路径
 * （真 `CharacterModel.load()` + 真 `cm.update(dt)`）：`.tmp-20261014/probe-visual-distance.mjs`
 * 与 `.tmp-20261014/probe-shipping-grip.mjs`。
 * 切片8 之后手臂真的挥了，剑却还住视觉层：切片7 把剑挂上 `__anim` 只解决了"跟着身体歪"，
 * 挂点仍是躯干坐标系里的 `(0.55, 1.0, 0)`。量 Idle 第 0 帧：
 * - 右手世界 `(-0.332, 1.072, -0.215)`，左手 `(0.328, 1.070, 0.215)`；
 *   肩线（左肩→右肩）水平化 `(-0.941, 0, -0.338)` ⇒ 角色的**右侧在世界 −x 那一侧**
 *   （骨架前向 `up × 肩线 = (-0.338, 0, 0.941)`，与本仓"本地 +Z 是正前"的朝向约定一致）。
 *   于是 `(0.55, 1.0, 0)` 那把剑悬在**左手**外 0.317 米，而招式表动的是右手
 *   （`SkeletonMotion` 里驱动的是 `RightArm` / `RightForeArm`）—— 右手挥空、左手边挂剑。
 *   同一帧量距：右手到剑心 **0.910 米**，左手到剑心只有 0.317 米 —— 玩家看到的"在左手边"是事实。
 * - attack1 全程（出货路径：真 `load()` + 真 `cm.update(dt)`，`.tmp-20261014/probe-visual-distance.mjs`）
 *   手在动、剑只跟着视觉层的 proc 走：剑心离右手在 **0.564 ~ 1.068 米**之间来回拉（静止 0.910 米），
 *   离左手却始终不超过 0.353 米 —— 那把剑整程都住在不干活的那只手旁边。
 *
 * ## 为什么必须反缩放
 * 素材根节点 `Character` 带 `scale = 0.01`（Mixamo 的厘米→米导出换算），本仓 `load()` 又把
 * `model.scale` 设成 1.1 ⇒ 手骨的世界缩放是 **0.0110**。直接 `手骨.add(剑)` 会把 0.9 米的剑身
 * 缩成 1 厘米。所以握持层的局部缩放 = `1 / 骨链缩放积`，层内因此回到**米制**：
 * `柄心` 那个 0.47 就是 0.47 米，与 `_buildWeapon` 的几何同一个口径。
 * 缩放积沿父链连乘而不是读 `matrixWorld`：挂载那一刻 `load()` 刚写完 `model.position.y`，
 * 世界矩阵是脏的，而局部缩放不依赖矩阵。素材里 `scale` 动画通道全是常量 1（208 条逐条量过），
 * `Character` 那个 0.01 没有通道 ⇒ 这一次算好的反缩放整局都成立。
 *
 * ## 编排数值
 * - `柄心 y = 0.47`：剑身长 0.9 米、几何中心在中点，所以中心外推 0.47 ⇒ 近端落在手腕外 0.02 米
 *   的掌心里，剑尖在手指方向 0.92 米处。
 * - `前抬 0.6`（绕手骨局部 X）：手骨局部 Y 是"往指节"的方向，静止时几乎垂直向下 ——
 *   不抬的话静止剑尖只离地 **0.217 米**（剑尖拖地）。抬 0.45 / 0.6 / 0.75 三档都量过，
 *   0.6 这一档静止剑尖离地 **0.532 米**，既不插地也不举成刺刀。
 * - 行程比（出货路径：真 `load()` + 真 `cm.update(dt)`，`.tmp-20261014/probe-shipping-grip.mjs`）：
 *   attack1 剑尖累计行程 8.27 米 / 右手 3.05 米 = **2.71 倍**，剑尖离起点峰值 **1.42 米**，
 *   命中帧剑尖水平离身 **1.04 米**，全程最低 **0.34 米**；heavy 是 **2.37 倍 / 1.47 米 / 最低 0.21 米**。
 *   同一招挂在视觉层的对照读数只有 **0.206 倍 / 0.319 米** —— 那把剑基本站在原地看手动。
 *   这几条都写在 `tests/player-weapon-hand-grip.test.js` 的 ③ 与 ⑤。
 */
export const WEAPON_GRIP_NAME = 'weaponGrip';

export const GRIP = Object.freeze({
  /** Mixamo 标签（`CharacterModel.boneOf` 负责加 `mixamorig` 前缀 —— 口径只有一处）。 */
  骨标签: 'RightHand',
  /** 剑身中心在握持层里的位置（米）；握持层已反缩放，所以这里就是世界米数。 */
  柄心: Object.freeze([0, 0.47, 0]),
  /** 绕手骨局部 X 抬起的弧度：把剑尖从"拖地"抬到"斜前方持握"。 */
  前抬: 0.6,
});

/** 骨链局部缩放的乘积（沿父链连乘，不读 `matrixWorld`）。 */
export function 骨链缩放(骨) {
  let n = 1;
  for (let o = 骨; o; o = o.parent) n *= o.scale.x;
  return n;
}

/**
 * 把武器挂进这只手。返回握持层，调用方只保留对武器本身的命名引用（`getObjectByName('weapon')`
 * 仍从 `player.mesh` 那侧找得到 —— 手骨在 `mesh` 的子树里）。
 */
export function attachToHand(手骨, 武器) {
  const 缩放 = 骨链缩放(手骨);
  if (!(缩放 > 0)) throw new Error(`WeaponGrip: 骨链缩放不是正数（${缩放}）—— 挂上去会缩成 0 或 NaN`);
  const grip = new THREE.Group();
  grip.name = WEAPON_GRIP_NAME;
  grip.scale.setScalar(1 / 缩放);
  grip.rotation.x = GRIP.前抬;
  武器.position.fromArray(GRIP.柄心);
  // 躯干挂点那档静止侧倾（`_buildWeapon` 的 `rotation.z = -0.3`）属于视觉层，不带到手里：
  // 握持层已经承载了朝向，剑自身局部旋转归零 ⇒ 只有一个写者。
  武器.rotation.set(0, 0, 0);
  // 挂点决定"谁写这把剑的姿势"：进了手的剑由骨骼动画驱动，`CombatController` 的程序摆动让位。
  武器.userData.handGrip = true;
  手骨.add(grip);
  grip.add(武器);
  return grip;
}
