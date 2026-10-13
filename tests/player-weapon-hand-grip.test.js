/**
 * 剑跟手走（W-C6 切片9 / B112）—— 手臂真的挥了（切片8），剑却还住在视觉层，这一篇钉"挂进那只挥的手"。
 *
 * ## 病根（对着 `Soldier.glb` 字节量出来的，不是看图说话）
 *
 * 切片8 的骨骼片段驱动的是 **右手**（`SkeletonMotion` 里编的是 `RightArm` / `RightForeArm`），而第三人称
 * 剑挂在视觉层 `(0.55, 1.0, 0)`。Idle 第 0 帧实测（`.tmp-20261014/probe-shipping-grip.mjs`，走真
 * `CharacterModel.load()` + `cm.update(dt)` 的出货路径）：
 *
 * | 读数 | 挂视觉层（改前） | 挂右手骨（改后） |
 * | --- | --- | --- |
 * | 柄端 ↔ 右腕 | **0.926 米** | 0.020 米 |
 * | 剑心 ↔ 右手 | 0.910 米 | **0.470 米** |
 * | 剑心 ↔ 左手 | **0.317 米** | 0.855 米 |
 * | attack1 逐帧：剑尖行程 ÷ 右手行程 | **0.206**（剑尖峰值位移 0.319 米） | 2.71（峰值位移 1.42 米） |
 *
 * 改前那把剑离**打人的那只手 0.910 米、离不干活的手只有 0.317 米** —— 玩家看到的是"左手边挂剑、右手挥空"。
 * 这也更正了 B110 的"+0.55 那一侧"读数：那次只验了世界 x 没被 π 镜像，从没问过 +x 是不是人体的右手边。
 * 肩线（左肩→右肩的水平化 = `(-0.941, 0, -0.338)`）与 `up × 肩线` 证明**角色的右侧在世界 −x**，
 * 所以 `x = +0.55` 恰好是左手边。
 *
 * ## 反缩放为什么是永久的而不是碰巧
 *
 * Mixamo 导出在根节点 `"Character"` 上带 `scale = 0.01`（厘米→米），`load()` 又乘 `1.1`，骨链局部缩放的
 * 乘积因此是 **0.0110** ⇒ 直接挂上手的剑会被缩成 1 厘米（实测世界剑长 0.00990 米）。`attachToHand` 挂一层
 * 握持层反缩放回米制。这条能长期成立的前提也钉住了：素材的 208 条骨缩放轨道**全是常数 1.0**（下面
 * 「跑完 25 帧仍然如此」那条逐帧复核），所以反一次就整局有效。
 *
 * ## 判据的取法（坏法各不同，每条都配了反向对照或对抗输入）
 *
 * - **哪只手**由 `GRIP.骨标签` 决定 ⇒ 用"剑心离右手 < 离左手"这条**与手无关的对称尺**判；臂 A4 把标签
 *   换成 `LeftHand`，同一把尺立刻点名。
 * - **跟手走**不靠看片段，靠行程比：剑尖逐帧累计路径 ÷ 右手逐帧累计路径 ≥ 2（实测 2.71 / 2.37）。
 *   反向对照把同一把尺压在改前的挂法上 —— 比值 0.206、峰值位移 0.319 ⇒ 尺子判得动，不是恒真。
 *   更直接的一条：不播任何片段、只把右手骨转 0.6 弧度，剑尖必须跟着走 > 0.3 米；挂在视觉层那把的位移
 *   **恰好为 0**（它与骨架之间没有任何父子关系可言）。
 * - **单写者**（B110/B111 那条所有权线的延长）：`CombatController._updateWeaponAnim` 的判据取挂载那一刻
 *   留下的记号（`userData.handGrip`），不取"此刻在播什么"。`if (handGrip || !rest)` 这个或的两项各有唯一
 *   见证：剑挂进手骨**且**带一份过期的 `swingRest`（对抗输入，证明是记号在赢而不是缺静止档）⇒ 一字不写；
 *   真的两样都没有 ⇒ 作废这次摆动。
 * - **取骨口只有一个**：`CharacterModel.boneOf()` 是唯一认骨的门，前缀走 `SkeletonMotion.boneName`，
 *   与骨骼片段同一套名字 ⇒ 结构上不会出现"表动 A 骨、剑挂 B 骨"。全 `src` 的记号写点由普查钉住。
 * - **半路失败的账必须清**：`load()` 的 catch 可能在 `bones` 已填之后才抛，留着那份账会让 `boneOf`
 *   认出一根不在场景图里的骨 ⇒ 剑挂进空气、玩家看不见武器。所以那条走"先真 load 再退胶囊"的路径。
 *
 * ## 变异自证（`.tmp-20261014/mutate-grip-arms.mjs`，2026-10-14 跑过：基线 23 例全绿，13 臂全红在该红的地方，
 * ## 跑完按内存里的原始字节还原并逐文件比对（`cmp` 四份全同）
 *
 * | 臂 | 改动 | 红了 |
 * | --- | --- | --- |
 * | A1 | 握持层不反缩放（`setScalar(1)`） | 8 例（世界剑长 / 柄端抵腕 / 静止离地 / attack1 / heavy / 转骨 / 接线行程 / 接线命中帧）—— 剑缩回 1 厘米，整篇塌 |
 * | A2 | `柄心` 0.47 → 0（剑心压在手腕上） | 6 例（柄端 / 静止离地 / attack1 / heavy / 转骨 / 接线行程） |
 * | A3 | `前抬` 0.6 → 0 | 1 例（静止剑尖离地 0.532 → 0.217） |
 * | A4 | `骨标签` 换成 `LeftHand`（挂错手，B112 的原始病） | 5 例（柄端+剑心那条 / 静止离地 / attack1 / heavy / 接线行程） |
 * | A5 | 挂载不留 `handGrip` 记号 | 4 例（记号本身 / 战斗侧不写 / 普查写点 / 接线那把） |
 * | A6 | 删掉 `_updateWeaponAnim` 的守卫（双写者回来） | 2 例（手骨里的剑被写 / 无静止档那条被硬写） |
 * | A7 | `load()` 不填 `bones` 账 | 15 例（①②③④⑤ 全塌，认不出骨 ⇒ 一切退回视觉层） |
 * | A8 | `boneOf` 认不出时返回 `undefined` | 2 例（null 判据 / 退胶囊那条） |
 * | A9 | 挂点永远走视觉层（改前行为） | 2 例（接线层级 / 接线行程比 0.206 < 2） |
 * | A10 | `createFallback` 不清 `bones` | 1 例（半路失败留下的账） |
 * | A11 | 零缩放链不抛 | 1 例（`toThrow(/骨链缩放/)`） |
 * | A12 | `boneOf` 里手抄 `'mixamorig'` 前缀（行为等价） | 1 例（前缀普查腿 —— 这条靠词法门，正因为行为看不出来） |
 * | A13 | 退路不记 `swingRest` | 2 例（普查写点 / 退胶囊那条程序摆动） |
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fakeGltfFromGlb, PLAYER_GLB, worldOf } from './helpers/glbRig.js';
import { CharacterModel, PLAYER_VISUAL_ROOT_NAME } from '../src/player/CharacterModel.js';
import { PlayerController } from '../src/player/PlayerController.js';
import { WeaponSystem } from '../src/combat/WeaponSystem.js';
import { CombatController } from '../src/combat/CombatController.js';
import { TimeController } from '../src/engine/Time.js';
import { attachToHand, 骨链缩放, GRIP, WEAPON_GRIP_NAME } from '../src/player/WeaponGrip.js';
import { boneName } from '../src/assets/SkeletonMotion.js';

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((ln) => { const i = ln.indexOf('//'); return i >= 0 ? ln.slice(0, i) : ln; }).join('\n');
const 读源 = (相对) => stripComments(readFileSync(join(process.cwd(), 相对), 'utf8'));

/** `src` 下所有 .js（注释剥掉），普查用 —— 记号只有一个写者这类判据不能只查我顺手改过的三个文件 */
function 全部源() {
  const out = [];
  const walk = (目录, 相对) => {
    for (const 名 of readdirSync(目录, { withFileTypes: true })) {
      const 路 = join(目录, 名.name);
      const 相 = `${相对}/${名.name}`;
      if (名.isDirectory()) walk(路, 相);
      else if (名.name.endsWith('.js')) out.push([相, stripComments(readFileSync(路, 'utf8'))]);
    }
  };
  walk(join(process.cwd(), 'src'), 'src');
  return out;
}

const 原LoadAsync = GLTFLoader.prototype.loadAsync;
afterAll(() => { GLTFLoader.prototype.loadAsync = 原LoadAsync; });

/** 走真 `load()`，只把网络换成假 gltf；每份都是新骨架（`load()` 会改 rotation / position / 父子关系）。 */
async function 装配(gltf) {
  GLTFLoader.prototype.loadAsync = async () => gltf;
  const cm = new CharacterModel();
  const 原 = console.info; const 原错 = console.error;
  console.info = () => {}; console.error = () => {};
  try {
    await cm.load();
  } finally {
    console.info = 原; console.error = 原错;
  }
  cm.mixer.update(0);
  cm.group.updateMatrixWorld(true);
  return cm;
}

/** 一把与 `_buildWeapon` 同尺寸的"剑"，局部变换也照抄（位置 (0.55, 1.0, 0)、`rotation.z = -0.3`） */
const 剑身长 = 0.9;
const mk剑 = () => {
  const 剑 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 剑身长, 0.12));
  剑.name = 'weapon';
  剑.position.set(0.55, 1.0, 0);
  剑.rotation.z = -0.3;
  return 剑;
};
const 尖 = (剑) => 剑.localToWorld(new THREE.Vector3(0, 剑身长 / 2, 0));
const 柄 = (剑) => 剑.localToWorld(new THREE.Vector3(0, -剑身长 / 2, 0));
const 心 = (剑) => 剑.getWorldPosition(new THREE.Vector3());
/** 几何自己的 y 跨度（不认 `parameters`，构造函数换了也读得到） */
const 局部长 = (几何) => {
  const p = 几何.attributes.position;
  let 上 = -Infinity, 下 = Infinity;
  for (let i = 0; i < p.count; i++) { 上 = Math.max(上, p.getY(i)); 下 = Math.min(下, p.getY(i)); }
  if (下 === Infinity) throw new Error('局部长：几何没有 position 属性');
  return 上 - 下;
};
const 程 = (序) => 序.reduce((a, v, i) => (i ? a + v.distanceTo(序[i - 1]) : 0), 0);

/** 逐帧跑一招：起招与推进都走出货口 `cm.update(dt)`；`挂法` 决定剑住在哪一层 */
async function 跑一招(起招, 帧数, 挂法 = '手') {
  const f = fakeGltfFromGlb(PLAYER_GLB);
  const cm = await 装配(f.gltf);
  const 剑 = mk剑();
  if (挂法 === '手') attachToHand(cm.boneOf(GRIP.骨标签), 剑);
  else cm.modelRoot.add(剑);
  const 手序 = []; const 尖序 = [];
  const 采 = () => {
    cm.group.updateMatrixWorld(true);
    手序.push(worldOf(f.rig, boneName(GRIP.骨标签)));
    尖序.push(尖(剑));
  };
  采();                                        // 第 0 帧 = 站姿
  起招(cm);
  for (let i = 0; i < 帧数; i++) { cm.update(1 / 60); 采(); }
  const 起点 = 尖序[0];
  return {
    cm, 剑, rig: f.rig, 尖序, 手序,
    手行程: 程(手序), 尖行程: 程(尖序),
    比: 程(尖序) / 程(手序),
    峰位移: Math.max(...尖序.map((v) => v.distanceTo(起点))),
    尖最低: Math.min(...尖序.map((v) => v.y)),
  };
}

/** 只喂消费方读得到的那些量：`mesh` 是真 `THREE.Group`，`getObjectByName('weapon')` 就是它的查找路径 */
const 战斗 = (mesh) => {
  const noop = () => {};
  const player = { scene: new THREE.Group(), mesh };
  const combat = new CombatController(
    player,
    { enemies: [], getAliveEnemies: () => [], setLockTarget: noop },
    { toast: noop }, null,
    { swingLight: noop, swingHeavy: noop, hit: noop, heavyHit: noop, dodge: noop, parry: noop, blockClink: noop },
    null,
  );
  combat.setTimeController(new TimeController());
  return combat;
};

/** ---------- ① 取骨口 ---------- */
describe('① `boneOf`：唯一的认骨门，前缀与骨骼片段同一套', () => {
  it('真 load 之后按标签拿到骨架里那一根（不是副本）', async () => {
    const f = fakeGltfFromGlb(PLAYER_GLB);
    const cm = await 装配(f.gltf);
    const 骨 = cm.boneOf(GRIP.骨标签);
    expect(骨, 'boneOf 没命中 —— 前缀口径又和 GLTFLoader 的 sanitize 分家了？').toBeTruthy();
    expect(骨.isBone).toBe(true);
    expect(骨.name, '标签→节点名不走 boneName，两处口径迟早分家').toBe(boneName(GRIP.骨标签));
    expect(骨, '拿到的是副本：挂上去就是挂进空气').toBe(f.rig.byName[boneName(GRIP.骨标签)]);
  });

  it('账本恰是骨架里在世骨骼的名单（多一根少一根都算歪）', async () => {
    const f = fakeGltfFromGlb(PLAYER_GLB);
    const cm = await 装配(f.gltf);
    const 在世 = [];
    f.rig.root.traverse((o) => { if (o.isBone) 在世.push(o.name); });
    expect(在世.length, '夹具里没有骨骼？那这一篇量的就不是素材').toBeGreaterThan(40);
    expect(Object.keys(cm.bones).sort()).toEqual(在世.sort());
    for (const 名 of 在世) expect(cm.bones[名], `${名} 的账指向别处`).toBe(f.rig.byName[名]);
  });

  it('认不出的标签返回 null（不是 undefined）—— 调用方据此退回视觉层', async () => {
    const cm = await 装配(fakeGltfFromGlb(PLAYER_GLB).gltf);
    expect(cm.boneOf('Nose')).toBe(null);
    expect(cm.boneOf('RightHandxyz')).toBe(null);
  });

  it('骨链缩放 = 0.0110（素材根 0.01 × load 的 1.1），而且**招式跑完还是它**', async () => {
    const cm = await 装配(fakeGltfFromGlb(PLAYER_GLB).gltf);
    const 手 = cm.boneOf(GRIP.骨标签);
    // 反缩放只反一次就整局成立，前提是那 208 条骨缩放轨道全是常数 1.0 —— 逐帧跑一式复核
    expect(骨链缩放(手), '骨链缩放不是 0.01×1.1 ⇒ 反缩放的倒数就错了').toBeCloseTo(0.011, 8);
    cm.playComboAttack(1);
    for (let i = 0; i < 25; i++) {
      cm.update(1 / 60);
      expect(骨链缩放(手), '素材带了缩放动画 ⇒ 一次性反缩放每帧都错').toBeCloseTo(0.011, 8);
    }
  });

  it('退胶囊时把账清干净：半路失败的 `bones` 不许留下还认得出的骨', async () => {
    const cm = await 装配(fakeGltfFromGlb(PLAYER_GLB).gltf);
    expect(cm.boneOf(GRIP.骨标签), '前置条件：这一份真的装上过骨架').toBeTruthy();
    cm.createFallback();
    expect(cm.fallback).toBe(true);
    expect(cm.boneOf(GRIP.骨标签), '骨架已经不在了，账还在 ⇒ 剑挂进空气，玩家看不见武器').toBe(null);
    expect(Object.keys(cm.bones).length, '`bones` 没清').toBe(0);
  });

  it('结构腿：认骨只有 `boneOf` 一道门，前缀只有 `boneName` 一个真源', () => {
    expect(读源('src/player/CharacterModel.js').includes('bones[boneName(标签)]'), 'boneOf 自己拼前缀 ⇒ 与片段的名字分家').toBe(true);
    expect(读源('src/player/PlayerController.js').includes('boneOf(GRIP.骨标签)'), '挂点绕过那道门自己查表').toBe(true);
    // 反向对照：'mixamorig' 字面量只许出现在 SkeletonMotion（切片8 的教训：两处前缀口径会分家）
    const 抄前缀 = 全部源().filter(([, 净]) => 净.includes('mixamorig')).map(([路]) => 路);
    expect(抄前缀, '又有人手抄了一份骨名前缀').toEqual(['src/assets/SkeletonMotion.js']);
  });
});

/** ---------- ② 挂上手（静止读数） ---------- */
describe('② 挂上手：反缩放、柄抵手腕、挂的是打人的那只手', () => {
  it('握持层是手骨的孩子、剑是握持层的孩子；记号写在剑上', async () => {
    const cm = await 装配(fakeGltfFromGlb(PLAYER_GLB).gltf);
    const 手 = cm.boneOf(GRIP.骨标签);
    const 剑 = mk剑();
    const grip = attachToHand(手, 剑);
    expect(grip.name).toBe(WEAPON_GRIP_NAME);
    expect(grip.parent, '握持层没进手骨').toBe(手);
    expect(剑.parent, '剑没进握持层 ⇒ 它还住在视觉层').toBe(grip);
    expect(剑.userData.handGrip, '挂载没留下记号 ⇒ 战斗侧认不出该不该写这把剑').toBe(true);
    expect(剑.userData.swingRest, '挂进手的剑不该带视觉层的静止档').toBeUndefined();
    expect(剑.position.toArray()).toEqual(GRIP.柄心);
    expect([剑.rotation.x, 剑.rotation.y, 剑.rotation.z], '旧挂点的 -0.3 侧倾被带进手里（叠在握持层的抬角上）').toEqual([0, 0, 0]);
  });

  it('世界剑长 = 局部剑长（反缩放把整条 0.011 链抵消掉了）', async () => {
    const cm = await 装配(fakeGltfFromGlb(PLAYER_GLB).gltf);
    const 剑 = mk剑();
    const grip = attachToHand(cm.boneOf(GRIP.骨标签), 剑);
    cm.group.updateMatrixWorld(true);
    const 世界长 = 尖(剑).distanceTo(柄(剑));
    expect(世界长, '缩成 1 厘米（反缩放失手）或放大 100 倍').toBeCloseTo(局部长(剑.geometry), 6);
    expect(世界长).toBeGreaterThan(0.5);
    expect(世界长).toBeLessThan(2.2);
    expect(grip.scale.x, '握持层不是骨链乘积的倒数').toBeCloseTo(1 / 骨链缩放(cm.boneOf(GRIP.骨标签)), 9);
    // 反向对照：同一把尺压在"不反缩放"上必须量出 0.0099 量级，否则上面那条是空的
    const 坏 = mk剑(); const g2 = attachToHand(cm.boneOf(GRIP.骨标签), 坏); g2.scale.setScalar(1);
    cm.group.updateMatrixWorld(true);
    expect(尖(坏).distanceTo(柄(坏)), '不反缩放也过得了上面的尺？').toBeLessThan(0.02);
  });

  it('柄端抵在手腕上，剑心离右手正好是柄心偏移，且离右手比离左手近（臂 A4 靠这条点名换错手）', async () => {
    const f = fakeGltfFromGlb(PLAYER_GLB);
    const cm = await 装配(f.gltf);
    const 剑 = mk剑();
    attachToHand(cm.boneOf(GRIP.骨标签), 剑);
    cm.group.updateMatrixWorld(true);
    const 右手 = worldOf(f.rig, boneName(GRIP.骨标签));
    const 左手 = worldOf(f.rig, 'mixamorigLeftHand');
    expect(柄(剑).distanceTo(右手), '柄端没抵住手腕（越远越像"拎着一把飘着的剑"）').toBeLessThanOrEqual(0.05);
    expect(心(剑).distanceTo(右手), '剑心离手的距离对不上柄心偏移 ⇒ 握持层的缩放与局部偏移不互证').toBeCloseTo(GRIP.柄心[1], 6);
    expect(心(剑).distanceTo(右手), '剑心比离左手还远 —— 挂回左手边了（B112 的原始症状）').toBeLessThan(心(剑).distanceTo(左手));
    // 反向对照：改前那种挂法在同一把尺下是"离右手 0.910、离左手 0.317"
    const g = fakeGltfFromGlb(PLAYER_GLB);
    const cm2 = await 装配(g.gltf);
    const 旧 = mk剑(); cm2.modelRoot.add(旧); cm2.group.updateMatrixWorld(true);
    expect(柄(旧).distanceTo(worldOf(g.rig, boneName(GRIP.骨标签))), '判据对"挂视觉层"视而不见').toBeGreaterThan(0.5);
    expect(心(旧).distanceTo(worldOf(g.rig, boneName(GRIP.骨标签))), '挂视觉层也被判成挂在右手上 ⇒ 这条尺是空的')
      .toBeGreaterThan(心(旧).distanceTo(worldOf(g.rig, 'mixamorigLeftHand')));
  });

  it('前抬把静止剑尖抬到 0.53 米（腰上）；不抬只有 0.217 米，剑尖快插进地里', async () => {
    const cm = await 装配(fakeGltfFromGlb(PLAYER_GLB).gltf);
    const 剑 = mk剑();
    attachToHand(cm.boneOf(GRIP.骨标签), 剑);
    cm.group.updateMatrixWorld(true);
    expect(尖(剑).y, '静止剑尖低到 0.45 以下：要么握持层没抬，要么素材换了站姿').toBeGreaterThanOrEqual(0.45);
    const 平 = mk剑(); const g3 = attachToHand(cm.boneOf(GRIP.骨标签), 平); g3.rotation.x = 0;
    cm.group.updateMatrixWorld(true);
    expect(尖(平).y, '判据对"不抬"视而不见（0.217 与 0.532 差 0.315 米）').toBeLessThan(0.3);
  });

  it('骨链缩放不是正数 ⇒ 当场抛，而且不许留下挂了一半的握持层', () => {
    const 手 = new THREE.Bone();
    手.scale.setScalar(0);
    expect(() => attachToHand(手, mk剑()), '零缩放链算出 Infinity 的倒数，静默挂出一把看不见的剑').toThrow(/骨链缩放/);
    expect(手.children.length, '抛之前已经 add 过了 ⇒ 场景图里多个空握持层').toBe(0);
  });
});

/** ---------- ③ 跟手走（行程比与直接转骨） ---------- */
describe('③ 跟手走：剑尖行程是手的 2 倍以上，改前的挂法被判成不跟手', () => {
  it('attack1（25 帧 ≈ 0.42 秒，真 `cm.update`）：尖/手行程比 2.71、峰值位移 1.42 米', async () => {
    const r = await 跑一招((c) => c.playComboAttack(1), 25, '手');
    expect(r.比, '剑没跟着手走满这条杠杆（比值掉下 2 = 手在动、剑基本在原地）').toBeGreaterThanOrEqual(2);
    expect(r.峰位移, '峰值位移太小：比值是比例，位移才看得见"这一刀甩出去一米四"').toBeGreaterThanOrEqual(1.0);
    expect(r.尖最低, '剑尖穿到脚底以下了（缩放或握持姿态歪）').toBeGreaterThanOrEqual(0.05);
  });

  it('heavy（过顶劈）同样跟手：比 2.37、峰值位移 1.47 米', async () => {
    const r = await 跑一招((c) => c.playHeavyAttack(), 36, '手');
    expect(r.比).toBeGreaterThanOrEqual(2);
    expect(r.峰位移).toBeGreaterThanOrEqual(1.0);
    expect(r.尖最低).toBeGreaterThanOrEqual(0.05);
  });

  it('反向对照：挂视觉层跑同一招，比值 0.206、峰值位移 0.319 米（尺子判得动）', async () => {
    const r = await 跑一招((c) => c.playComboAttack(1), 25, '视觉层');
    expect(r.手行程, '对照那份骨架得手也在动，否则比的是两堆常数').toBeGreaterThan(1);
    expect(r.比, '挂视觉层也被判成跟手 ⇒ 这条尺是空的').toBeLessThan(0.5);
    expect(r.峰位移).toBeLessThan(0.5);
  });

  it('不播片段、只把右手骨转 0.6 弧度：剑尖跟着走 > 0.3 米；挂视觉层那把**位移恰好为 0**', async () => {
    const f = fakeGltfFromGlb(PLAYER_GLB);
    const cm = await 装配(f.gltf);
    const 剑 = mk剑();
    attachToHand(cm.boneOf(GRIP.骨标签), 剑);
    cm.group.updateMatrixWorld(true);
    const 前 = 尖(剑).clone();
    cm.boneOf(GRIP.骨标签).rotation.z += 0.6;
    cm.group.updateMatrixWorld(true);
    expect(尖(剑).distanceTo(前), '转骨不带动剑 ⇒ 父子关系根本没建立').toBeGreaterThan(0.3);

    const g = fakeGltfFromGlb(PLAYER_GLB);
    const cm2 = await 装配(g.gltf);
    const 旧 = mk剑(); cm2.modelRoot.add(旧); cm2.group.updateMatrixWorld(true);
    const 前2 = 尖(旧).clone();
    cm2.boneOf(GRIP.骨标签).rotation.z += 0.6;
    cm2.group.updateMatrixWorld(true);
    expect(尖(旧).distanceTo(前2), '挂视觉层的剑也跟着动了 ⇒ 上面那条量的不是父子关系').toBeLessThan(1e-6);
  });
});

/** ---------- ④ 单写者：武器姿势的归属 ---------- */
describe('④ 挥砍姿势只有一个写者：判据取挂载记号，不取"此刻在播什么"', () => {
  it('挂进手的剑：`_updateWeaponAnim` 一个字都不写（连过期的 `swingRest` 也不许它动笔）', async () => {
    const cm = await 装配(fakeGltfFromGlb(PLAYER_GLB).gltf);
    const 剑 = mk剑();
    attachToHand(cm.boneOf(GRIP.骨标签), 剑);
    // 对抗输入：两样记号都在。握持记号必须赢 —— 骨骼动画带着手甩剑，这里插一笔就是第二个写者
    剑.userData.swingRest = { x: 0.5, z: -0.3 };
    const combat = 战斗(cm.group);
    combat.animateWeapon(0.3, true);
    const 转 = [剑.rotation.x, 剑.rotation.z];
    combat._updateWeaponAnim(1 / 60);
    expect([剑.rotation.x, 剑.rotation.z], '程序摆动写进了手骨里的剑 ⇒ 两个写者抢同一把剑').toEqual(转);
    expect(combat._weaponAnim, '认不出握持记号 ⇒ 整次挥砍都在抢笔').toBe(null);
    expect(剑.userData.swingRest, '对抗输入没生效（是测试自己写歪了）').toEqual({ x: 0.5, z: -0.3 });
  });

  it('挂视觉层的剑：静止姿态读挂载时记下的 `swingRest`，不在战斗侧硬写', () => {
    const 场景 = new THREE.Group();
    const 剑 = mk剑();
    剑.userData.swingRest = { x: 0.2, z: -0.3 };
    场景.add(剑);
    const combat = 战斗(场景);
    combat.animateWeapon(0.4, true);
    combat._updateWeaponAnim(0.2);            // t/dur = 0.5 ⇒ sin(π·0.5) = 1，峰值那一帧
    expect(剑.rotation.z, '静止档没被当作基准（就是那个 -0.3 硬写的症状）').toBeCloseTo(-0.3 - 1.8, 6);
    expect(剑.rotation.x).toBeCloseTo(0.2 + 0.8, 6);
    combat._updateWeaponAnim(0.2);            // 收招回到静止档
    expect([剑.rotation.z, 剑.rotation.x]).toEqual([-0.3, 0.2]);
    expect(combat._weaponAnim).toBe(null);

    // 反向对照：静止档不同 ⇒ 落点必须不同，否则上面量的是硬写的常数而不是 `swingRest`
    const 另一把 = mk剑();
    另一把.userData.swingRest = { x: -0.4, z: 0.9 };
    const 场景2 = new THREE.Group(); 场景2.add(另一把);
    const c2 = 战斗(场景2);
    c2.animateWeapon(0.4, true);
    c2._updateWeaponAnim(0.2);
    expect(另一把.rotation.z).toBeCloseTo(0.9 - 1.8, 6);
    expect(另一把.rotation.x).toBeCloseTo(-0.4 + 0.8, 6);
  });

  it('既没进手也没记静止档 ⇒ 谁都不写，直接作废这次摆动', () => {
    const 场景 = new THREE.Group();
    const 剑 = mk剑();
    场景.add(剑);
    const combat = 战斗(场景);
    combat.animateWeapon(0.3, false);
    const 转 = [剑.rotation.x, 剑.rotation.z];
    combat._updateWeaponAnim(1 / 60);
    expect([剑.rotation.x, 剑.rotation.z], '没有静止档却照旧写 ⇒ 写的是它自己那套常数').toEqual(转);
    expect(combat._weaponAnim).toBe(null);
  });

  it('普查腿：握持记号只有 WeaponGrip 写、静止档只有挂载方写，战斗侧不再有姿态常数', () => {
    const 源 = 全部源();
    const 含 = (式) => 源.filter(([, 净]) => 式.test(净)).map(([路]) => 路).sort();
    expect(含(/userData\.handGrip\s*=/), '`handGrip` 的写点不止 WeaponGrip 一处').toEqual(['src/player/WeaponGrip.js']);
    expect(含(/userData\.swingRest\s*=/), '`swingRest` 的写点不止挂载方一处').toEqual(['src/player/PlayerController.js']);
    // `getObjectByName?.('weapon')` 的可选调用也要算进消费方（CombatController 用的正是那个写法）
    expect(含(/getObjectByName\s*(?:\?\.)?\(\s*['"]weapon['"]/).sort(), '武器消费方名单漂了').toEqual([
      'src/combat/CombatController.js', 'src/combat/WeaponSystem.js',
    ]);
    const 战斗侧 = 读源('src/combat/CombatController.js');
    expect(/rotation\.z = -?[\d.]/.test(战斗侧), '战斗侧又开始硬写武器姿态了（静止值该由挂载方给）').toBe(false);
  });
});

/** ---------- ⑤ 接线：真 `PlayerController` 走一遍 ---------- */
describe('⑤ 接线：真 `_loadModel` 把剑挂进手骨，素材不在才退视觉层', () => {
  const mk玩家 = async () => {
    const 原 = console.info; const 原错 = console.error;
    console.info = () => {}; console.error = () => {};
    try {
      const p = new PlayerController(
        new THREE.Group(),
        new THREE.PerspectiveCamera(62, 1, 0.1, 100),
        { getGroundHeight: () => 0, collision: null, bounds: null },
        { paused: false, cinematicActive: false, autoPlayMode: false, dialog: { toast() {} }, combatCamera: null, restScene: null },
      );
      await p.modelReady;
      return p;
    } finally {
      console.info = 原; console.error = 原错;
    }
  };

  it('GLB 在场：`getObjectByName("weapon")` 拿到的那把，父亲是握持层、爷爷是右手骨', async () => {
    const f = fakeGltfFromGlb(PLAYER_GLB);
    GLTFLoader.prototype.loadAsync = async () => f.gltf;
    const p = await mk玩家();
    const 剑 = p.mesh.getObjectByName('weapon');
    expect(剑, '剑不在 mesh 子树里 ⇒ WeaponSystem 的可见性开关会找不到它').toBeTruthy();
    expect(剑.parent.name, '剑没进握持层').toBe(WEAPON_GRIP_NAME);
    expect(剑.parent.parent, '握持层的父亲不是那根骨').toBe(p.characterModel.boneOf(GRIP.骨标签));
    expect(剑.userData.handGrip).toBe(true);
    // 换武器仍然按得到那把剑（新的层级没打断递归查找）
    const ws = new WeaponSystem(p, { toast: () => {} }, null);
    ws.current = 'staff';
    ws.applyVisual();
    expect(剑.visible, '切到法杖后剑还亮着 ⇒ 那次 `getObjectByName` 够不着手骨里的剑').toBe(false);
    // 第一人称那把仍在相机下（身体前倾不该走着手腕去拧相机），也没被握持层带进手骨
    expect(p.fpWeaponGroup.parent).toBe(p.camera);
    expect(p.fpWeaponGroup.children.length).toBe(1);
    expect(p.fpWeaponGroup.children[0].parent).toBe(p.fpWeaponGroup);
  });

  it('素材不在（三个候选地址全失败）：退视觉层挂点、静止档交给程序摆动', async () => {
    GLTFLoader.prototype.loadAsync = async () => { throw new Error('404'); };
    const p = await mk玩家();
    const 剑 = p.mesh.getObjectByName('weapon');
    expect(p.characterModel.fallback, '前置条件：这一份该退胶囊').toBe(true);
    expect(剑.parent.name, '退路没挂回视觉层').toBe(PLAYER_VISUAL_ROOT_NAME);
    expect(剑.userData.handGrip, '胶囊人偶没有手，不该留下握持记号').toBeUndefined();
    expect(剑.userData.swingRest, '没把静止档交给战斗侧 ⇒ 程序摆动会写回一个它自己编的姿态').toEqual({ x: 0, z: -0.3 });
    const 前 = 剑.rotation.z;
    const combat = 战斗(p.mesh);
    combat.animateWeapon(0.3, false);
    for (let i = 0; i < 5; i++) combat._updateWeaponAnim(1 / 60);
    expect(剑.rotation.z, '退路那条程序摆动被切片9 一起切掉了').not.toBe(前);
  });

  it('接线那把剑真的跟着手甩：真 `_loadModel` 挂上之后跑一式，尖/手行程比仍然 ≥ 2', async () => {
    const f = fakeGltfFromGlb(PLAYER_GLB);
    GLTFLoader.prototype.loadAsync = async () => f.gltf;
    const p = await mk玩家();
    const 剑 = p.mesh.getObjectByName('weapon');
    const cm = p.characterModel;
    const 手序 = []; const 尖序 = [];
    const 采 = () => {
      cm.group.updateMatrixWorld(true);
      手序.push(worldOf(f.rig, boneName(GRIP.骨标签)));
      尖序.push(剑.localToWorld(new THREE.Vector3(0, 剑身长 / 2, 0)));
    };
    采();
    cm.playComboAttack(1);
    for (let i = 0; i < 25; i++) { cm.update(1 / 60); 采(); }
    const 起点 = 尖序[0];
    expect(程(尖序) / 程(手序), '接线选的不是手 ⇒ 玩家按左键看到的还是"手动剑不动"（B112 的原始症状）').toBeGreaterThanOrEqual(2);
    expect(Math.max(...尖序.map((v) => v.distanceTo(起点))), '接线那把的峰值位移掉下 1 米').toBeGreaterThanOrEqual(1);
  });

  it('接线之后命中帧剑尖仍然甩在身体外 0.6 米以上（不是缩回原点）', async () => {
    const r = await 跑一招((c) => c.playComboAttack(1), 10, '手');   // 第 10 帧 ≈ 一式的命中帧
    expect(r.cm.boneOf(GRIP.骨标签), '前置条件：这一份挂的是真手').toBeTruthy();
    const 尖位 = r.尖序[r.尖序.length - 1];
    const 身体 = r.cm.group.position;
    expect(尖位.distanceTo(new THREE.Vector3(身体.x, 尖位.y, 身体.z)), '命中帧剑尖贴回身体 ⇒ 挂点/抬角歪了').toBeGreaterThan(0.6);
  });
});
