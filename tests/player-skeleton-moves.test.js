/**
 * 招式骨骼片段（W-C6 切片8 / B111）—— 出厂 GLB 一条攻击 clip 都没有，四招的关键帧是本仓
 * 对着真骨架编出来的；这一篇钉住"编得对"与"接得上"两层。
 *
 * ## 病根
 *
 * `Soldier.glb` 只有 `Idle / Run / Walk / TPose`（下面「素材现状」那一组对着 GLB 字节数出来），于是
 * `playComboAttack` 的候选表只能落到 `'Walk'`/`'Run'` 再乘倍速 —— 玩家按左键看到的是
 * 一边挥空手一边原地踏步。补素材要 Mixamo + Blender，玩家侧等不到；而 49 根 `mixamorig:*`
 * 骨骼是现成的，缺的只有关键帧。`src/assets/SkeletonMotion.js` 就是补这一层。
 *
 * ## 这一篇为什么值这些判据（五条都是先踩到再写下来的）
 *
 * - **骨名口径必须由出货读取器决定**：`GLTFLoader` 贴给节点的名字是
 *   `PropertyBinding.sanitizeNodeName(原始名)`，那个函数把保留字符（含 `:`）**删掉**而不是
 *   换成下划线 —— `mixamorig:Spine1` 在浏览器里叫 `mixamorigSpine1`。表里先前写的是
 *   `'mixamorig_'`，四招的轨道一条都绑不上，而混音器对绑不上的轨道**不报错**：症状是
 *   "接上了但人不动"。只读探针当时仍一路绿灯，因为它自己实现了一版把 `:` 换成 `_` 的
 *   sanitize —— 夹具的口径不是素材的口径。「骨名口径」那条用 three 自己的函数对着 GLB
 *   原始名逐骨核对，并且反证"换成下划线那一版口径一根都命中不了"。
 * - **夹具也得站在出货读取器站的那套单位里**：`GLTFLoader` 会铺每个节点的静止
 *   `translation / rotation / scale`，Mixamo 的导出在根节点上带一组 `scale = 0.01`（厘米→米）
 *   与绕 X 的 −90°（Z-up→Y-up）。夹具先前漏了这一步，整条骨链放大 100 倍又躺倒
 *   （右手世界坐标从 `0.30, 0.97, 0.20` 变成 `30, −20, 97`），而"逐帧读数"那一组**照样自洽地绿**
 *   —— 站姿与招式用的是同一具假骨架，量到的比值全对。这种错只能由一条**外部**的账钉住：
 *   「夹具按米站立」拿 `content/tuning.js` 的受击分段（下盘顶 0.72 米、头顶 2.20 米）问
 *   "Head 骨在这个带里吗"。臂 A10/A11 各拆一根静止变换验证它真的会红。
 * - **峰值速度必须落在判定帧附近**：三档（蓄力 `h` / 命中 `s` / 随势 `f`）按**时间**关于命中
 *   对称，三次样条在 `h → f` 段的速度峰按构造落在中点 = `s`。先前按"分数对称"配槽时，短时长
 *   招式的 `0 → h`（起手到蓄力）只有两三帧、快过出招本身，量到的峰跑到命中前 7.6 帧、
 *   峰速 14–17 米/秒（「速度峰落在判定帧」那条把峰位与峰速两头都钉住）。
 * - **跨类交接必须硬切，同类交接必须淡**：GLB clip 用四元数驱动全部骨，骨骼片段用
 *   `.rotation[x]` 数字轨道驱动其中 11 根，而 `Object3D` 的 `quaternion` 与 `rotation` 互相
 *   同步 —— 淡入期内同一根骨每帧被两个写者各写一遍，权重斜坡根本不构成插值。硬切的跳变实测
 *   ≈ 3 厘米（`Idle` 整圈循环离它自己第 0 帧最远 0.034 米，`.tmp-20261013/probe-idle-deviation.mjs`），
 *   而片段首/末帧增量都是 0，接缝两边本来就是同一档姿势。「一式：挑到骨骼片段」与
 *   「二式接一式」两侧各钉一条：进招式时 `Idle` 不再 running（= 真的 `stop()` 了），
 *   一式接二式时上一条还 running（= 真的在淡）。
 * - **读数断言得先真的读到那一帧**：`act.play()` 只登记动作、不写值，所以"起手不跳"要先
 *   `mixer.update(0)` 把第 0 帧铺上去，否则首帧读数恒等于站姿、断言恒真（臂 A2 打首帧增量，
 *   当初就是这么不红）。同理采样表最后一档必须停在**时长本身**：按 `Math.round(duration/dt)`
 *   取整时 0.42 秒的招式在第 25 帧（0.4167 秒）就收了，"收招回站姿"量的是末帧之前那一档
 *   （臂 A12 打末帧增量）。两头都收在 2 毫米以内：残差是 `SKELETON_REST` 的 1 毫弧度量化
 *   （实测 4e-4 米），而写歪 0.05 弧度是 1.2 厘米。
 *
 * ## 变异自证（`.tmp-20261013/mutate-skeleton-arms.mjs`，2026-10-13 跑过：12 臂全红在该红的地方，
 * ## 基线 20 例全绿，跑完按内存里的字节还原并逐文件比对哈希）
 *
 * | 臂 | 改动 | 红了 |
 * | --- | --- | --- |
 * | A1 | `BONE_PREFIX` 改回 `'mixamorig_'` | 14 例（骨名口径 / 49 根骨在世 / 按米站立 / 编出来的 clip / 逐帧五条 / 基准姿态 / 接线四条）——轨道一条绑不上，整篇塌 |
 * | A2 | 一式 `RightArm.x` 首帧增量 0 → 0.05 | 每招每骨每通道 / 编出来的 clip / 起手与收招（3） |
 * | A12 | 同一通道末帧增量 0 → 0.05 | 同上 3 例（补上 A2 露馅的那半条腿） |
 * | A3 | 一式 `strikeAt` 0.16 → 0.17 | 「判定帧与 `MoveTable` 同源」 |
 * | A4 | 一式 `duration` 0.42 → 0.44 | 「判定帧与 `MoveTable` 同源」的第二条腿（状态锁） |
 * | A5 | 给 `attack3.Spine1` 加 `x` 通道 | 「不写 `Hips`，躯干不写 `x`」+「速度峰落在判定帧」（前倾叠成两倍 ⇒ 峰位也歪） |
 * | A6 | `_playOnce` 的跨类腿改成无条件 `fadeOut` | 「一式：挑到骨骼片段…Idle 被硬切」（`Idle` 还在 running） |
 * | A7 | 同类腿也改成 `stop()` | 「二式接一式（同类）」（上一条被硬停） |
 * | A8 | 去掉 `setEffectiveTimeScale` 的 `骨骼 ?` | 「一式：…倍速钉成 1.0」 |
 * | A9 | `SKELETON_REST.RightArm.z` 抄偏 0.02 | 「表里每根骨的每一轴与 Idle 第 0 帧一致」+「起手与收招」 |
 * | A10 | 夹具不铺节点静止旋转 | 「夹具按米站立」+ 逐帧两条 |
 * | A11 | 夹具不铺节点静止缩放 | 「夹具按米站立」+ 逐帧三条 + 「片段真的动出货场景里的模型」（5） |
 *
 * 另有一条不靠变异成立：`registerSkeletonClips` 与 `MOVES` 的账分开记（`cm.skeletal`），
 * 所以「load 后：四招在册」里 `catalog.attack1` 仍然挑不到素材 clip、`hasMixamoClips` 仍然 false。
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  BONE_PREFIX, SKELETON_MOTION, SKELETON_REST, boneName, buildSkeletonClip,
  isSkeletonClipName, listedBones, registerSkeletonClips, requiredBones, skeletonClipName,
} from '../src/assets/SkeletonMotion.js';
import { MOVES } from '../src/combat/MoveTable.js';
import { PARTS } from '../src/content/tuning.js';
import { CharacterModel } from '../src/player/CharacterModel.js';
import {
  PLAYER_GLB, buildRig, clipDuration, clipNames, fakeGltfFromGlb, readGlb,
  restEulerAt, sanitizeNodeName, seedPose, worldOf,
} from './helpers/glbRig.js';

const 招式名 = Object.keys(SKELETON_MOTION);
const dt = 1 / 60;
const { json, bin } = readGlb();
const 在世 = buildRig(json).在世;

/** 把轨道名还原成表里的标签：`mixamorigSpine1.rotation[y]` → `Spine1`。 */
const 骨标签 = (轨道名) => 轨道名.split('.')[0].slice(BONE_PREFIX.length);

describe('素材现状：GLB 里确实一条攻击都没有（B111 的病根）', () => {
  it('clip 名就是 `Idle / Run / Walk / TPose`，没有任何攻击或受击', () => {
    const 名 = clipNames(json).sort();
    expect(名, `素材 clip 名与记录不一致：${名.join(', ')}`).toEqual(['Idle', 'Run', 'TPose', 'Walk']);
    expect(名.filter((n) => /attack|slash|punch|combo|finisher|hit|block|parry|roll/i.test(n)), '素材若真有攻击就该用素材的').toEqual([]);
  });

  it('49 根 `mixamorig` 骨在世，四招要的骨一根不缺（缺一根 ⇒ 整招不接）', () => {
    const 骨 = [...在世].filter((n) => /^mixamorig/.test(n));
    expect(骨.length, `mixamorig 骨数漂了：${骨.length}`).toBeGreaterThanOrEqual(49);
    for (const 招 of 招式名) {
      expect(requiredBones(招).filter((b) => !在世.has(b)), `${招} 缺骨`).toEqual([]);
    }
  });

  it('骨名口径 = three 的 sanitizeNodeName（保留字符是删掉，不是换成下划线）', () => {
    const 真名 = new Set(json.nodes.filter((n) => n.name).map((n) => sanitizeNodeName(n.name)));
    const 全部 = [...new Set(招式名.flatMap(requiredBones))];
    expect(全部.every((b) => b.startsWith(BONE_PREFIX)), `表里的骨名都该带前缀 ${BONE_PREFIX}：${全部.join(', ')}`).toBe(true);
    for (const b of 全部) expect(真名.has(b), `${b} 在素材里不存在（前缀口径与 sanitizeNodeName 不一致）`).toBe(true);
    // 反证：探针夹具那一版（`:` → `_`）若能命中，说明这条腿根本没测到东西
    const 夹具口径 = (n) => String(n).replace(/[\s/[\]:.]/g, '_');
    const 用夹具口径能命中 = json.nodes.filter((n) => n.name).map((n) => 夹具口径(n.name)).some((n) => 全部.includes(n));
    expect(用夹具口径能命中, '夹具口径也能命中 ⇒ 两边根本没差别，这条腿是空的').toBe(false);
  });

  /**
   * 夹具的骨架得**站在游戏用的那一套单位里**。`GLTFLoader` 会把每个节点的静止
   * `translation / rotation / scale` 都铺上，而 Mixamo 的导出在根节点上带一组
   * `scale = 0.01`（厘米→米）与绕 X 的 −90°（Z-up→Y-up）换算 —— 夹具先前漏了这一步，
   * 于是整条骨链放大 100 倍又躺倒，右手世界坐标从 `0.30, 0.97, 0.20` 变成 `30, −20, 97`，
   * 而"逐帧读数"那一整组照样能自洽地跑（站姿与招式用同一具假骨架）。
   * 判据取游戏自己的身高账：`PARTS` 的受击分段是"相对脚底的米数"，头顶那一档 2.20 米、
   * 下盘顶 0.72 米。Head 骨在两者之间、且明显高于踝骨 ⇒ 骨架按米站立；
   * 漏 scale ⇒ 148 米，超出上限；漏 rotation ⇒ 骨链沿 z 摊开，低于下限。
   */
  it('夹具按米站立：身高落在 `PARTS` 的受击带里（静止换算漏一档就露馅）', () => {
    const rig = seedPose(json, bin, buildRig(json), 'Idle', 0);
    const 头 = worldOf(rig, boneName('Head'));
    const 踝 = worldOf(rig, boneName('LeftFoot'));
    expect(头.y, `Head 骨高 ${头.y.toFixed(2)} 米：超过受击盒头顶 ${PARTS.head.y1} 米 ⇒ 单位不是米`).toBeLessThanOrEqual(PARTS.head.y1);
    expect(头.y, `Head 骨高 ${头.y.toFixed(2)} 米：不到下盘顶 ${PARTS.torso.y0} 米 ⇒ 骨链没竖起来`).toBeGreaterThan(PARTS.torso.y0);
    expect(头.y - 踝.y, `踝到头顶 ${(头.y - 踝.y).toFixed(3)} 米：上半身不该短于下盘高`).toBeGreaterThan(PARTS.torso.y0);
  });
});

describe('招式表结构：写的是增量，而且不越视觉层的所有权', () => {
  it('每招每骨每通道：首帧位置 0 增量 0、末帧位置 1 增量 0（从站姿起手、回站姿收招）', () => {
    for (const [招, 条目] of Object.entries(SKELETON_MOTION)) {
      for (const [标签, 通道组] of Object.entries(条目.bones)) {
        expect(SKELETON_REST[标签], `${招}.${标签} 没有配基准姿态（增量无从加起）`).toBeTruthy();
        for (const [轴, 帧] of Object.entries(通道组)) {
          const 处 = `${招}.${标签}.${轴}`;
          expect(帧.length, `${处} 的帧数太少`).toBeGreaterThanOrEqual(3);
          expect(帧[0][0], `${处} 首帧位置不是 0`).toBe(0);
          expect(帧[0][1], `${处} 首帧增量不是 0（会从站姿跳一下起手）`).toBe(0);
          expect(帧.at(-1)[0], `${处} 末帧位置不是 1`).toBe(1);
          expect(帧.at(-1)[1], `${处} 末帧增量不是 0（收招回不到站姿）`).toBe(0);
        }
      }
    }
  });

  it('不写 `Hips`，躯干不写 `x` —— 整人的俯仰/滚转/偏头由 `CharacterModel.proc` 独占（B110 家规）', () => {
    for (const [招, 条目] of Object.entries(SKELETON_MOTION)) {
      expect(Object.keys(条目.bones), `${招} 写了 Hips：整人的前倾归 proc`).not.toContain('Hips');
      for (const 标签 of Object.keys(条目.bones).filter((t) => /^Spine/.test(t))) {
        expect(Object.keys(条目.bones[标签]), `${招}.${标签} 写了 x 通道：会和 proc.pitch 叠成两倍`).not.toContain('x');
      }
    }
  });

  it('判定帧与 `combat/MoveTable.js` 同源，时长与 `CharacterModel` 的状态锁同值', () => {
    for (const 步 of [1, 2, 3]) {
      expect(SKELETON_MOTION[`attack${步}`].strikeAt, `${步}式的判定帧该等于轻击的 at`).toBe(MOVES.light.at);
    }
    expect(SKELETON_MOTION.heavy.strikeAt).toBe(MOVES.heavy.at);
    // 时长那半边取**行为读数**：`actionLock` 是状态机真正锁住的时间，不是这里手抄的数
    const cm = new CharacterModel();
    for (const 步 of [1, 2, 3]) {
      cm.playComboAttack(步);
      expect(cm.actionLock, `playComboAttack(${步}) 的状态锁与招式时长脱钩`).toBeCloseTo(SKELETON_MOTION[`attack${步}`].duration, 6);
    }
    cm.playHeavyAttack();
    expect(cm.actionLock, 'playHeavyAttack 的状态锁与重击时长脱钩').toBeCloseTo(SKELETON_MOTION.heavy.duration, 6);
  });

  it('编出来的 clip：轨道名是本表口径、时刻严格递增、两端值就是基准姿态本身', () => {
    const 轴序 = { x: 0, y: 1, z: 2 };
    for (const 招 of 招式名) {
      const clip = buildSkeletonClip(招, 在世);
      expect(clip, `${招} 没编出 clip`).not.toBeNull();
      expect(clip.name).toBe(skeletonClipName(招));
      expect(clip.tracks.length, `${招} 轨道数与表的通道数脱钩`).toBe(
        Object.values(SKELETON_MOTION[招].bones).reduce((s, 组) => s + Object.keys(组).length, 0));
      for (const 轨 of clip.tracks) {
        const m = 轨.name.match(/^(\S+)\.rotation\[(x|y|z)\]$/);
        expect(m, `${轨.name} 不是本表口径的轨道名`).toBeTruthy();
        for (let i = 1; i < 轨.times.length; i++) {
          expect(轨.times[i], `${轨.name} 第 ${i} 帧不递增（三档配重了）`).toBeGreaterThan(轨.times[i - 1]);
        }
        expect(轨.times[0], `${轨.name} 不是从 0 起手`).toBe(0);
        expect(轨.times.at(-1), `${轨.name} 没收在时长上`).toBeCloseTo(SKELETON_MOTION[招].duration, 6);
        const 基 = SKELETON_REST[骨标签(轨.name)][轴序[m[2]]];
        expect(轨.values[0], `${轨.name} 首帧不是站姿`).toBeCloseTo(基, 6);
        expect(轨.values.at(-1), `${轨.name} 末帧不是站姿`).toBeCloseTo(基, 6);
      }
    }
  });

  it('诚实降级：缺骨 ⇒ null；没有混音器 ⇒ 接上 0 条；认不出的位置/招式说得出原因', () => {
    expect(buildSkeletonClip('attack1', new Set(['mixamorig随便一根']))).toBeNull();
    const 注册 = registerSkeletonClips(null, 在世);
    expect(注册.接上).toBe(0);
    expect(注册.片段名).toEqual({});
    expect(() => requiredBones('不存在的招')).toThrow(/没有这一招/);
    expect(() => buildSkeletonClip('attack1', new Set(requiredBones('attack1')))).not.toThrow();
    expect(isSkeletonClipName(skeletonClipName('attack1'))).toBe(true);
    expect(isSkeletonClipName('Idle')).toBe(false);
    expect(isSkeletonClipName(undefined)).toBe(false);
  });
});

/** 真骨架 + 真混音器，把 Idle 第 0 帧铺成站姿后逐帧量右手（与 `.tmp-20261013/probe-skeleton-moves.mjs` 同一算法）。 */
function 逐帧(招) {
  const 条目 = SKELETON_MOTION[招];
  const clip = buildSkeletonClip(招, 在世);
  const 站姿rig = seedPose(json, bin, buildRig(json), 'Idle', 0);
  const 站姿 = { rh: worldOf(站姿rig, boneName('RightHand')), lh: worldOf(站姿rig, boneName('LeftHand')) };
  const rig = seedPose(json, bin, buildRig(json), 'Idle', 0);
  const mixer = new THREE.AnimationMixer(rig.root);
  const act = mixer.clipAction(clip);
  act.setLoop(THREE.LoopOnce, 1);
  act.clampWhenFinished = true;
  act.reset();
  act.play();
  // 先把第 0 帧**铺上去**再读起手：`play()` 只登记动作，不写值 —— 少了这一步，
  // `序[0]` 量到的是"还没被混音器碰过"的站姿，"起手不跳"那条断言恒等于 0，
  // 把首帧增量从 0 改成 0.05 也不会红（变异臂 A2 当时就是这么露馅的）。
  //
  // 采样表最后一档落在**时长本身**上：先前按 `Math.round(duration / dt)` 取整，0.42 秒的招式
  // 在第 25 帧（0.4167 秒）就收了，"收招回站姿"量的是末帧之前那一档 —— 变异臂 A12（末帧增量
  // 写成 0.05）因此不红。引擎那边 `clampWhenFinished` 最后一定停在末帧，这里跟着它停。
  const 时刻 = [];
  for (let t = 0; t < 条目.duration - 1e-9; t += dt) 时刻.push(t);
  时刻.push(条目.duration);
  const 序 = [];
  let 累计 = 0;
  let 前手 = null;
  mixer.update(0);
  时刻.forEach((t, i) => {
    const 步 = i ? t - 时刻[i - 1] : 0;
    if (i) mixer.update(步);
    rig.root.updateMatrixWorld(true);
    const h = worldOf(rig, boneName('RightHand'));
    const l = worldOf(rig, boneName('LeftHand'));
    if (前手) 累计 += h.distanceTo(前手);
    序.push({
      t,
      程: 累计,
      手: h,
      步,
      // 骨架自身坐标系：+z 是脸朝的方向（探针同口径，不掺 `load()` 里那半圈素材朝向偏移）
      前: h.z - 站姿.rh.z,
      高: h.y - 站姿.rh.y,
      右: h.x - 站姿.rh.x,
      左手前: l.z - 站姿.lh.z,
    });
    前手 = h;
  });
  const 最近帧 = (t) => 序.reduce((a, b, i) => (Math.abs(b.t - t) < Math.abs(序[a].t - t) ? i : a), 0);
  const 速度 = 序.map((v, i) => (i ? v.手.distanceTo(序[i - 1].手) / v.步 : 0));
  const 横速 = 序.map((v, i) => (i ? (v.右 - 序[i - 1].右) / v.步 : 0));
  const iS = 最近帧(条目.strikeAt);
  const 峰 = 速度.reduce((a, b, i) => (b > 速度[a] ? i : a), 0);
  // 蓄力档的秒数与 `SkeletonMotion` 里 `关键槽` 同式（那函数没导出，这里按同一条公式取）
  const iH = 最近帧(条目.strikeAt - Math.min(0.09, 条目.strikeAt - 1 / 60));
  return { 序, 横速, iS, 峰秒: 序[峰].t, 峰速: 速度[峰], 命中: 序[iS], 蓄力: 序[iH], 末: 序.at(-1), 条目 };
}

describe('逐帧读数：四招都是"送出去的一刀"，不是原地踏步', () => {
  it('起手与收招都在站姿（首末帧偏移毫米级，不是"甩出去再跳回来"）', () => {
    for (const 招 of 招式名) {
      const r = 逐帧(招);
      // 两头都只该有量化残差：`SKELETON_REST` 把 Idle 第 0 帧抄到 1 毫弧度一档，实测四招
      // 首末帧各 4e-4 米。2 毫米离它差一个数量级，而把首帧或末帧增量写歪 0.05 弧度是 1.2 厘米
      // （变异臂 A2 / A12 各打一头）。
      const 偏 = (s) => Math.hypot(s.前, s.高, s.右);
      expect(偏(r.序[0]), `${招} 起手就跳了 ${偏(r.序[0]).toFixed(4)} 米`).toBeLessThan(0.002);
      expect(偏(r.末), `${招} 收招没回站姿（${偏(r.末).toFixed(4)} 米）`).toBeLessThan(0.002);
    }
  });

  it('速度峰落在判定帧 ±2 帧内，峰速在 4–16 米/秒，命中帧往前送出至少 15 厘米', () => {
    for (const 招 of 招式名) {
      const r = 逐帧(招);
      const 偏帧 = (r.峰秒 - r.条目.strikeAt) * 60;
      expect(Math.abs(偏帧), `${招} 峰值速度离命中帧 ${偏帧.toFixed(1)} 帧`).toBeLessThanOrEqual(2);
      expect(r.峰速, `${招} 峰速 ${r.峰速.toFixed(1)} 米/秒：太慢就是手在判定那一刻停住`).toBeGreaterThan(4);
      expect(r.峰速, `${招} 峰速 ${r.峰速.toFixed(1)} 米/秒：太快就是抽风`).toBeLessThan(16);
      expect(r.命中.前, `${招} 命中帧前送只有 ${r.命中.前.toFixed(3)} 米`).toBeGreaterThanOrEqual(0.15);
      expect(r.末.程, `${招} 整招手的行程 ${r.末.程.toFixed(2)} 米：没有挥出去`).toBeGreaterThan(1.2);
    }
  });

  it('一式与二式命中帧的横向速度反号（连段看得出"来回"的唯一凭据）', () => {
    const a = 逐帧('attack1');
    const b = 逐帧('attack2');
    expect(a.横速[a.iS], `一式命中帧横速 ${a.横速[a.iS].toFixed(2)} 应当往左`).toBeLessThan(-1);
    expect(b.横速[b.iS], `二式命中帧横速 ${b.横速[b.iS].toFixed(2)} 应当往右`).toBeGreaterThan(1);
  });

  it('三式与重击的蓄力帧手高于命中帧（从上往下劈），一式是平斩', () => {
    for (const 招 of ['attack3', 'heavy']) {
      const r = 逐帧(招);
      expect(r.蓄力.高 - r.命中.高, `${招} 蓄力帧没把手举到命中帧之上：不是劈砍`).toBeGreaterThan(0.05);
    }
    const 平 = 逐帧('attack1');
    expect(Math.abs(平.蓄力.高 - 平.命中.高), '一式是横斩，不该有明显高度差').toBeLessThan(0.2);
  });

  it('二式右手真的过了身：蓄力帧落在身体左侧，命中前又送出去', () => {
    const r = 逐帧('attack2');
    expect(r.蓄力.右, `二式蓄力帧的左右偏移 ${r.蓄力.右.toFixed(3)}：手没有过身到左侧`).toBeLessThan(-0.1);
    expect(Math.max(...r.序.map((s) => s.前)), '二式全程没往前送').toBeGreaterThan(0.15);
  });
});

describe('基准姿态：`SKELETON_REST` 就是素材 `Idle` 第 0 帧（逐骨逐轴对着 GLB 字节重算）', () => {
  it('表里每根骨的每一轴与 Idle 第 0 帧的局部欧拉一致（容差 1 毫弧度）', () => {
    const 标签表 = listedBones();
    expect(标签表.length, '表里一根骨都没有').toBeGreaterThan(0);
    for (const 标签 of 标签表) {
      const 实 = restEulerAt(json, bin, 'Idle', boneName(标签));
      expect(实, `Idle 第 0 帧里没有 ${boneName(标签)} 的旋转通道`).toBeTruthy();
      const 抄 = SKELETON_REST[标签];
      expect(抄, `SKELETON_REST 缺 ${标签}`).toBeTruthy();
      for (const i of [0, 1, 2]) {
        expect(Math.abs(实[i] - 抄[i]), `${标签} 第 ${i} 轴：素材是 ${实[i].toFixed(4)}，表里抄成 ${抄[i]}`).toBeLessThan(1e-3);
      }
    }
  });

  it('片段时长是各自独立的一招，不是把 `Idle` 的循环拿来按倍速播', () => {
    const 循环 = clipDuration(json, bin, 'Idle');
    expect(循环, '前置条件：素材的 Idle 是一段可循环的时间').toBeGreaterThan(1.5);
    const 已用 = new Set();
    for (const [招, 条目] of Object.entries(SKELETON_MOTION)) {
      expect(条目.duration, `${招} 的时长不该等于 Idle 循环`).not.toBeCloseTo(循环, 4);
      expect(条目.duration, `${招} 比 Idle 还长，一招打不完`).toBeLessThan(循环);
      expect(已用.has(条目.duration), `${招} 的时长与另一招重合：连段看不出长短区别`).toBe(false);
      已用.add(条目.duration);
    }
  });
});

/** ---------- 接线：走一遍真 `load()`，再逐帧出招 ---------- */
describe('接线：`load()` 注册骨骼片段，出招挑到的是片段而不是 Walk', () => {
  const 原LoadAsync = GLTFLoader.prototype.loadAsync;
  afterAll(() => { GLTFLoader.prototype.loadAsync = 原LoadAsync; });

  /**
   * 建一个"已经装上真骨架"的玩家：`load()` 走真路径，只把网络换成假 gltf。
   * 每份都是**新骨架** —— `load()` 会改它的 rotation / position / 父子关系，共用一份会让
   * 后一个测试读到前一个测试留下的姿态（站姿基线就成了旧值）。
   */
  const 装配 = async () => {
    const f = fakeGltfFromGlb(PLAYER_GLB);
    GLTFLoader.prototype.loadAsync = async () => f.gltf;
    const cm = new CharacterModel();
    const 原 = console.info;
    console.info = () => {};
    try {
      await cm.load();
    } finally {
      console.info = 原;
    }
    return { cm, rig: f.rig };
  };

  it('load 后：四招在册，素材账本没被涂脏，"没有 GLB 攻击 clip"这件事仍然诚实', async () => {
    const { cm } = await 装配();
    expect(cm.fallback, '不该退回胶囊').toBe(false);
    expect(Object.keys(cm.skeletal).sort()).toEqual(['attack1', 'attack2', 'attack3', 'heavy']);
    for (const 招 of 招式名) {
      expect(cm.actions[skeletonClipName(招)], `${招} 的片段没进 actions`).toBeTruthy();
      expect(cm.skeletal[招]).toBe(skeletonClipName(招));
    }
    // `catalog` 只说素材提供了什么：攻击四项仍然挑不到真 clip，才轮得到本仓的片段
    expect(cm.catalog.attack1 ?? null).toBe(null);
    expect(cm.catalog.idle).toBe('Idle');
    expect(cm.hasMixamoClips, '素材没有 hit/block/dodge，这里不许改成 true').toBe(false);
  });

  it('一式：挑到骨骼片段、倍速钉成 1.0、Idle 被硬切（不是淡出）', async () => {
    const { cm } = await 装配();
    const idle = cm.actions.Idle;
    expect(idle.isRunning(), '前置条件：出招前 Idle 在播').toBe(true);
    cm.playComboAttack(1);
    expect(cm.currentAction.getClip().name).toBe('__sk:attack1');
    // 表里的 `strikeAt` 是**秒**，1.12 倍会把视觉峰从判定帧上挪开一帧 ⇒ 骨骼片段不吃手感倍速
    expect(cm.currentAction.timeScale, '骨骼片段跟着手感倍速走 ⇒ 峰值速度偏离判定帧').toBe(1);
    cm.mixer.update(dt);
    expect(cm.currentAction.getEffectiveTimeScale()).toBe(1);
    // 跨类淡入淡出不构成插值（四元数轨道与 `.rotation[x]` 轨道同时写同一根骨）⇒ 必须 stop
    expect(idle.isRunning(), 'Idle 还在淡出 ⇒ 那 0.06 秒里两个写者抢同一根骨').toBe(false);
    expect(cm.currentAction.isRunning()).toBe(true);
  });

  it('二式接一式（同类）：仍走淡入淡出，上一条留在混音器里插值', async () => {
    const { cm } = await 装配();
    cm.playComboAttack(1);
    const 第一条 = cm.currentAction;
    cm.playComboAttack(2);
    expect(cm.currentAction).not.toBe(第一条);
    expect(cm.currentAction.getClip().name).toBe('__sk:attack2');
    expect(第一条.isRunning(), '同类切换被硬停了 ⇒ 连段没有插值').toBe(true);
    cm.mixer.update(0.1);
    expect(第一条.isRunning(), '淡出没在 0.06 秒里收干净').toBe(false);
  });

  it('片段真的动出货场景里的模型，走完收回站姿并把 Idle 交回去', async () => {
    const { cm } = await 装配();
    const 手 = cm.group.getObjectByName('mixamorigRightHand');
    expect(手, '骨架没进场景').toBeTruthy();
    const 读数 = () => { cm.group.updateMatrixWorld(true); return 手.getWorldPosition(new THREE.Vector3()); };
    // 让 Idle 先把骨架铺到站姿：浏览器里这是第一帧干的事，不铺就量到的是绑定姿势（T 型臂平举）
    cm.update(dt);
    cm.update(dt);
    const 站 = 读数();
    expect(Number.isFinite(站.x + 站.y + 站.z), '世界矩阵算出 NaN（包围盒那段被空盒打了）').toBe(true);
    cm.playComboAttack(1);
    let 最远 = 0;
    for (let i = 0; i < 10; i++) { cm.update(dt); 最远 = Math.max(最远, 读数().distanceTo(站)); }
    expect(最远, `一式播到判定帧，右手只动了 ${最远.toFixed(3)} 米`).toBeGreaterThan(0.15);
    for (let i = 0; i < 40; i++) cm.update(dt);
    expect(cm.currentAction.getClip().name, '出招结束没交回 Idle').toBe('Idle');
    expect(cm.actions['__sk:attack1'].isRunning(), '片段还在混音器里活着 ⇒ 收招后仍会抢那 11 根骨').toBe(false);
    expect(读数().distanceTo(站), `收招后右手离站姿 ${读数().distanceTo(站).toFixed(3)} 米`).toBeLessThan(0.06);
    expect(cm.actionLock).toBe(0);
  });
});
