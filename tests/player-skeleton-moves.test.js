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
 * 所以「load 后：招式在册…」里 `catalog.attack1` 仍然挑不到素材 clip、`hasMixamoClips` 仍然 false。
 *
 * ## 切片10：这张表从"四招全是劈砍"变成"十招六种形状"，判据跟着分档
 *
 * 上面那套读数（峰速钉在判定帧、命中帧前送 ≥15 厘米、行程 >1.2 米）是**劈砍的形状要求**。
 * 把 `hit / block / parry / dodge / skill / riposte` 接进同一套判据会产生两类错：
 * - 正确的受击判不合格：挨一刀该把手往**身后**带（实测 −0.269 米），"前送 ≥0.15"直接红；
 * - 错误的抽搐判合格：把 `RightArm.x` 写成每帧抖一下，前送照样能凑到 0.15。
 * 所以形状写进数据（`kind`，`MOVE_KINDS` 六档），读数闸门**按档取**，并且双向钉：
 * 表里每招的档位都得有闸门，闸门里的每一档都得有招在用（新增一档没人量 ⇒ 先红）。
 * 地面值全部来自 `.tmp-20261014/probe-defense-moves.mjs`（真骨架 + `Idle` 第 0 帧站姿，与下面
 * `逐帧()` 同一算法），每档余量写在闸门表的注释里。
 *
 * 另外三笔是切片10 实测到的洞，登记在 B113：
 * - **候选表靠子串撞中**（B113①）：`pickAnim` 的忽略大小写/子串那两档能撞进 `__sk:` 键 ——
 *   `playSkill` / `playRiposte` 的候选里有 `heavy`，于是战技和弹反反击**每次都借走 `__sk:heavy`**，
 *   一声不响。修法是结构性的：模糊那两档只许撞素材名，骨骼片段的键是内部地址，必须**明写**。
 * - **时长撞车**：`hit` 与 `attack2` 都是 0.48 秒。原来"每招时长互不相同"那条把两者判成重合，
 *   但那个判据真正要防的是"连段看不出长短"与"两招共用一条 clip"。前者收口到连段四招，
 *   后者由一条更硬的账接管：**每一招的时长 = 它自己那条 play 方法的 `actionLock`**（逐招读行为）。
 * - **`playBlock` / `playParrySuccess` 各有一笔死账**（0.38 / 0.48 写进 `actionLock` 后立刻被
 *   `_playOnce` 覆盖）：删掉，状态锁只有一处真源。
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  BONE_PREFIX, MOVE_KINDS, SKELETON_MOTION, SKELETON_REST, boneName, buildSkeletonClip,
  defineSkeletonMove, isSkeletonClipName, listedBones, registerSkeletonClips, requiredBones, skeletonClipName,
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

/**
 * 招式 → `CharacterModel` 里那条 play 方法。表里每一招都得在这里有一行（漏一行就是
 * "片段编好了但没人调用它" —— 由下面那条"玩法表覆盖整张招式表"钉住）。
 */
const 玩法表 = Object.fromEntries([
  ...[1, 2, 3].map((步) => [`attack${步}`, (cm) => cm.playComboAttack(步)]),
  ['heavy', (cm) => cm.playHeavyAttack()],
  ['hit', (cm) => cm.playHit()],
  ['block', (cm) => cm.playBlock()],
  ['parry', (cm) => cm.playParrySuccess()],
  ['dodge', (cm) => cm.playDodge()],
  ['skill', (cm) => cm.playSkill()],
  ['riposte', (cm) => cm.playRiposte()],
]);

const ROOT = process.cwd();
/** 剥注释：说明文字里提到旧写法是常态，不是接线（与 chunk-graph / visual-root 同款口径） */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((ln) => { const i = ln.indexOf('//'); return i >= 0 ? ln.slice(0, i) : ln; }).join('\n');
const 净源 = stripComments(readFileSync(join(ROOT, 'src/player/CharacterModel.js'), 'utf8'));

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
    // 战技自己有一条判定；弹反反击走的是**重击**那条判定（`CombatController.tryRiposte` 里
    // `this._setStrike(MOVES.heavy, …)`）—— 抄错一档就是"动画到位的那一刻机制没生效"。
    expect(SKELETON_MOTION.skill.strikeAt, '战技的到位帧与 `MOVES.skill.at` 脱钩').toBe(MOVES.skill.at);
    expect(SKELETON_MOTION.riposte.strikeAt, '弹反反击的到位帧与该复用的重击判定脱钩').toBe(MOVES.heavy.at);
    // 时长那半边取**行为读数**：`actionLock` 是状态机真正锁住的时间，不是这里手抄的数
    const cm = new CharacterModel();
    for (const 步 of [1, 2, 3]) {
      cm.playComboAttack(步);
      expect(cm.actionLock, `playComboAttack(${步}) 的状态锁与招式时长脱钩`).toBeCloseTo(SKELETON_MOTION[`attack${步}`].duration, 6);
    }
    cm.playHeavyAttack();
    expect(cm.actionLock, 'playHeavyAttack 的状态锁与重击时长脱钩').toBeCloseTo(SKELETON_MOTION.heavy.duration, 6);
    // 切片10 新增的六招同样一条不落地对账：这一条同时是"每一招有自己的一档时长"的硬账
    // （旧那条"全表时长互不相同"要防的两件事里，"连段看不出长短"收在连段四招，
    // "两招共用一条 clip"由这里逐招读状态锁接管 —— `hit` 与 `attack2` 都是 0.48 秒是**手感**，
    // 不是共用：改它得动 `MOVES`，不该由动画表说了算）。
    for (const [招, 玩] of Object.entries(玩法表)) {
      const 人偶 = new CharacterModel();
      人偶.createFallback();
      玩(人偶);
      expect(人偶.actionLock, `${招}：play 方法的状态锁与片段时长 ${SKELETON_MOTION[招].duration} 脱钩`)
        .toBeCloseTo(SKELETON_MOTION[招].duration, 6);
    }
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
  const 站姿 = {
    rh: worldOf(站姿rig, boneName('RightHand')),
    lh: worldOf(站姿rig, boneName('LeftHand')),
    rf: worldOf(站姿rig, boneName('RightFoot')),
  };
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
    const ft = worldOf(rig, boneName('RightFoot'));
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
      // 右脚离站姿的高度：`mobility` 那一档唯一的"重心"代理（骨架没有 `Hips` 平移通道）
      脚: ft.y - 站姿.rf.y,
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
  const 峰_of = (取) => Math.max(...序.map(取));
  return {
    序, 横速, iS, 峰秒: 序[峰].t, 峰速: 速度[峰], 命中: 序[iS], 蓄力: 序[iH], 末: 序.at(-1), 条目,
    前峰: 峰_of((s) => s.前),
    手最峰: 峰_of((s) => s.高),
    脚峰: 峰_of((s) => s.脚),
    判定右: 序[iS].右,
  };
}

/**
 * 档位 → 读数闸门。**每档一组，取值互不相同甚至反号**（地面值见每条后面的实测括号）。
 * 单位：帧 / 米每秒 / 米。`[下限, 上限]`，`null` 那一侧不封。
 *
 * 为什么必须分档：`strike` 要的"判定帧往前送 ≥0.15"在 `recoil` 上恰好是**反的**
 * （挨一刀该往后收，实测 −0.269），拿一套判据量六种形状会把对的判成错的、把抽搐判成合格。
 */
const 读数闸门 = {
  strike: {
    峰离帧: [null, 2], 峰速: [4, 16], 手的行程: [1.2, 3.6], 判定帧往前送: [0.15, null], 右脚不离地: [null, 0.10],
  },
  thrust: {
    峰离帧: [null, 2], 峰速: [4, 16], 手的行程: [1.2, 3.6], 判定帧往前送: [0.18, null], 右脚不离地: [null, 0.10],
    蓄力帧在身后: [null, -0.15], 判定帧左手往回拉: [null, -0.05],
  },
  cast: {
    峰离帧: [null, 2], 峰速: [4, 16], 手的行程: [1.2, 3.6], 判定帧往前送: [0.15, null], 右脚不离地: [null, 0.10],
    蓄力帧在身后: [null, -0.10], 判定帧左手也送出: [0.10, null],
  },
  guard: {
    峰离帧: [null, 3], 峰速: [4, 16], 手的行程: [0.9, 2.0], 判定帧往前送: [0.15, null], 右脚不离地: [null, 0.10],
    判定帧手抬高: [0.10, null], 到位即定住: [null, 0.03],
  },
  recoil: {
    峰离帧: [null, 3], 峰速: [3, 16], 手的行程: [0.9, 2.0], 右脚不离地: [null, 0.10],
    判定帧往后收: [null, -0.15], 全程没往前送过: [null, 0.05],
  },
  mobility: {
    峰离帧: [null, 2], 峰速: [3, 12], 手的行程: [0.9, 2.2],
    判定帧手不抬高: [null, 0.0], 全程手不抬高: [null, 0.05], 右脚抬起来: [0.20, null],
  },
};

/** 一招的全部读数 → 闸门里那条腿的名字取数（腿名与数对不上就该红在"这条腿没数"上）。 */
function 取数(r) {
  return {
    峰离帧: (r.峰秒 - r.条目.strikeAt) * 60,
    峰速: r.峰速,
    手的行程: r.末.程,
    判定帧往前送: r.命中.前,
    判定帧往后收: r.命中.前,
    判定帧手抬高: r.命中.高,
    判定帧手不抬高: r.命中.高,
    全程手不抬高: r.手最峰,
    全程没往前送过: r.前峰,
    蓄力帧在身后: r.蓄力.前,
    判定帧左手往回拉: r.命中.左手前,
    判定帧左手也送出: r.命中.左手前,
    右脚不离地: r.脚峰,
    右脚抬起来: r.脚峰,
    // "到位即定住" = 判定帧的前送**就是**全程最前（防御不是穿过去的一刀，是停住的一挡）
    到位即定住: Math.abs(r.前峰 - r.命中.前),
  };
}

describe('逐帧读数：十招各按自己那一档量，不是全都拿劈砍的尺子量', () => {
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

  it('速度峰落在判定帧（按档取读数闸门：峰位/峰速/行程/前送方向…）', () => {
    for (const 招 of 招式名) {
      const 档 = SKELETON_MOTION[招].kind;
      const 表 = 读数闸门[档];
      expect(表, `${招} 的档位 "${档}" 在门禁里没有读数闸门 —— 新增一档要么配读数，要么并进已有档`).toBeTruthy();
      const r = 逐帧(招);
      const 数 = 取数(r);
      for (const [腿, 界] of Object.entries(表)) {
        const v = 数[腿];
        expect(v, `${招}〔${档}〕的闸门有一条 "${腿}" 门禁里没有这个读数（名字打错了？）`).toBeTypeOf('number');
        const 话 = `${招}〔${档}〕${腿} = ${v.toFixed(3)}，闸门 [${界[0] ?? '−∞'}, ${界[1] ?? '+∞'}] 之外`;
        if (界[0] !== null) expect(v, 话).toBeGreaterThanOrEqual(界[0]);
        if (界[1] !== null) expect(v, 话).toBeLessThanOrEqual(界[1]);
      }
    }
  });

  it('档位名单与闸门双向对齐：每一档有人量、每一个闸门有人用', () => {
    const 在册档 = new Set(招式名.map((招) => SKELETON_MOTION[招].kind));
    expect([...在册档].every((k) => MOVE_KINDS.includes(k)), `表里有档位不在名单：${[...在册档].filter((k) => !MOVE_KINDS.includes(k)).join(', ')}`).toBe(true);
    for (const 档 of MOVE_KINDS) {
      expect(读数闸门[档], `名单里有档位 ${档}，门禁却没给它配读数`).toBeTruthy();
      expect(招式名.filter((招) => SKELETON_MOTION[招].kind === 档).length, `档位 ${档} 有闸门却没有任何一招在用（空档 = 白配的判据）`).toBeGreaterThan(0);
    }
    expect(Object.keys(读数闸门).sort(), '闸门的档位与名单不是一一对应').toEqual([...MOVE_KINDS].sort());
    // 腿名也得双向：闸门里写了一条读数里没有的腿 ⇒ 上一条例会红，这里先钉住"每条腿都有读数"
    const 样例 = 取数(逐帧('attack1'));
    for (const 表 of Object.values(读数闸门)) {
      for (const 腿 of Object.keys(表)) expect(样例, `闸门用了读数表里没有的腿 "${腿}"`).toHaveProperty(腿);
    }
  });

  it('认不出的档位进不了表：`defineSkeletonMove` 是表的构造口，也是这道防线的入口', () => {
    // 只测"表里现在没有非法档位"不够 —— 那是常量真值。这里用**出货那个构造口**注入一个非法档，
    // 证明它真的会拒（`SKELETON_MOTION` 是冻结的，从外部改不进去，所以能改的只有这一道门）。
    expect(() => defineSkeletonMove(0.4, 0.1, {}, 'flail')).toThrow(/不在名单/);
    expect(() => defineSkeletonMove(0.4, 0.1, {}, undefined)).toThrow(/不在名单/);
    expect(defineSkeletonMove(0.4, 0.1, {}, 'strike').kind, '合法档位也被拒 ⇒ 上面两条红得没有意义').toBe('strike');
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

  it('两条 guard 的判定帧横向**反号**：格挡往中线收，弹反往外侧磕开', () => {
    const 挡 = 逐帧('block');
    const 反 = 逐帧('parry');
    expect(挡.判定右, `格挡判定帧横向 ${挡.判定右.toFixed(3)}：没有把剑横到身前`).toBeLessThanOrEqual(-0.20);
    expect(反.判定右, `弹反判定帧横向 ${反.判定右.toFixed(3)}：没有往外侧磕开（与格挡同侧 ⇒ 两档看不出区别）`).toBeGreaterThanOrEqual(0.05);
    // 弹反那一磕是"先收进来再往外送"：蓄力帧还在内侧，判定帧翻到外侧
    expect(反.蓄力.右, `弹反蓄力帧横向 ${反.蓄力.右.toFixed(3)}：起手没有先收进来`).toBeLessThanOrEqual(-0.02);
    expect(反.判定右 - 反.蓄力.右, '弹反那一趟横向行程太短，看不出是一次磕打').toBeGreaterThanOrEqual(0.10);
  });

  it('只有 `mobility` 那一档脚离地：翻滚的"重心"读数不跟别的档抢', () => {
    // 骨架没有 `Hips` 平移通道 ⇒ 重心只能由腿读。这条把"其他档都不许抬脚"与"翻滚必须抬脚"
    // 两头钉死（实测其他九招 ≤0.023 米，翻滚 0.293 米），也顺便钉住 `取数` 真的读到了那一帧。
    const 抬脚 = 招式名.map((招) => [招, SKELETON_MOTION[招].kind, 逐帧(招).脚峰]);
    const 机动 = 抬脚.filter(([, 档]) => 档 === 'mobility');
    const 其余 = 抬脚.filter(([, 档]) => 档 !== 'mobility');
    expect(机动.length, '前置条件：表里没有 mobility 那一档').toBeGreaterThan(0);
    expect(其余.length, '前置条件：除了翻滚就没有别的档了 ⇒ 这条判据量不到东西').toBeGreaterThan(1);
    for (const [招, , 峰] of 机动) expect(峰, `${招} 的脚最高 ${峰.toFixed(3)} 米：滚身没有收腿`).toBeGreaterThanOrEqual(0.20);
    for (const [招, , 峰] of 其余) expect(峰, `${招} 的脚最高 ${峰.toFixed(3)} 米：这一档不该抬脚（抬脚是 mobility 的读数）`).toBeLessThanOrEqual(0.10);
  });

  it('`cast` 与 `thrust` 的判定帧左手反号：双手齐出 vs 后手收腰', () => {
    const 施 = 逐帧('skill');
    const 刺 = 逐帧('riposte');
    expect(施.命中.左手前, `战技判定帧左手 ${施.命中.左手前.toFixed(3)}：不是双手往前推`).toBeGreaterThanOrEqual(0.10);
    expect(刺.命中.左手前, `弹反反击判定帧左手 ${刺.命中.左手前.toFixed(3)}：后手没有收在腰侧`).toBeLessThanOrEqual(-0.05);
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
    for (const [招, 条目] of Object.entries(SKELETON_MOTION)) {
      expect(条目.duration, `${招} 的时长不该等于 Idle 循环`).not.toBeCloseTo(循环, 4);
      expect(条目.duration, `${招} 比 Idle 还长，一招打不完`).toBeLessThan(循环);
    }
    // "互不相同"这条**只属于连段**：连段四招靠时长长短读出一刀比一刀重。
    // 全表互不相同是过头的判据 —— 受击 0.48 与二式 0.48 撞车是**手感**上的巧合（两处都取自
    // `MOVES`，谁也不该为了动画表的唯一性去动战斗表），而"两招共用一条片段"这件事由上面
    // 那条逐招对 `actionLock` 的账接管，不由时长唯一性代劳。
    const 连段 = ['attack1', 'attack2', 'attack3', 'heavy'];
    const 已用 = new Map();
    for (const 招 of 连段) {
      const 值 = SKELETON_MOTION[招].duration;
      expect(已用.has(值), `${招} 的时长与 ${已用.get(值)} 重合：连段看不出长短区别`).toBe(false);
      已用.set(值, 招);
    }
  });

  it('整张招式表都有人调用：玩法表覆盖每一招，且 play 方法候选表里明写了 `skeletal.*`', () => {
    // 双向：表里多一招而玩法表没登记 ⇒ 片段编好了没人播（切片10 的病根之一）；
    //      玩法表多一行 ⇒ 对着一招不存在的名字调账。
    expect(Object.keys(玩法表).sort(), '玩法表与招式表不是同一批招').toEqual([...招式名].sort());
    for (const 招 of 招式名) {
      // 候选表**明写** `this.skeletal.招`，不是靠 `pickAnim` 的子串档撞进去（B113①②：
      // 撞中的结果是战技/弹反反击借走 `__sk:heavy` —— 形状错了还一路绿灯）。
      // 剥注释再数：说明文字里出现旧写法是常态。
      const 出处 = 净源.match(new RegExp(`this\\.skeletal\\.${招}\\b`, 'g')) || [];
      expect(出处.length, `CharacterModel 的候选表里没有明写 this.skeletal.${招}`).toBeGreaterThanOrEqual(1);
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

  it('load 后：十招在册，素材账本没被涂脏，"没有 GLB 攻击 clip"这件事仍然诚实', async () => {
    const { cm } = await 装配();
    expect(cm.fallback, '不该退回胶囊').toBe(false);
    expect(Object.keys(cm.skeletal).sort(), '注册器接出来的招式与招式表不是同一批').toEqual([...招式名].sort());
    expect(招式名.length, '前置条件：表里少于十招就是这一档白钉').toBeGreaterThanOrEqual(10);
    for (const 招 of 招式名) {
      expect(cm.actions[skeletonClipName(招)], `${招} 的片段没进 actions`).toBeTruthy();
      expect(cm.skeletal[招]).toBe(skeletonClipName(招));
    }
    // `catalog` 只说素材提供了什么：攻击四项仍然挑不到真 clip，才轮得到本仓的片段
    expect(cm.catalog.attack1 ?? null).toBe(null);
    expect(cm.catalog.idle).toBe('Idle');
    expect(cm.hasMixamoClips, '素材没有 hit/block/dodge，这里不许改成 true').toBe(false);
  });

  /**
   * 每一招各跑一遍真 `load()`：候选表挑中的必须是**自己那条**片段。
   * 切片10 的病根（B113①）正是这里 —— `playSkill` 的候选里有 `heavy`，`pickAnim` 的子串档
   * 撞上 `__sk:heavy`，于是战技播的是重击那一档的骨，而且上面那条"在册"照样全绿。
   * 所以除了"挑中自己"，还钉一条"没有借到隔壁"：六招各自的片段名互不相同。
   */
  const 接线表 = [
    ['hit', (cm) => cm.playHit()],
    ['block', (cm) => cm.playBlock()],
    ['parry', (cm) => cm.playParrySuccess()],
    ['dodge', (cm) => cm.playDodge()],
    ['skill', (cm) => cm.playSkill()],
    ['riposte', (cm) => cm.playRiposte()],
  ];
  for (const [招, 玩] of 接线表) {
    it(`${招}：真 load 后播的是 __sk:${招}，状态锁等于片段时长，收招交回 Idle`, async () => {
      const { cm } = await 装配();
      const idle = cm.actions.Idle;
      expect(idle.isRunning(), '前置条件：出招前 Idle 在播').toBe(true);
      玩(cm);
      expect(cm.currentAction.getClip().name, `${招} 没播自己那条骨骼片段（借了隔壁 ⇒ 形状与机制脱钩）`)
        .toBe(skeletonClipName(招));
      expect(cm.actionLock, `${招} 的状态锁与片段时长脱钩`).toBeCloseTo(SKELETON_MOTION[招].duration, 6);
      expect(cm.currentAction.getEffectiveTimeScale(), '骨骼片段跟着手感倍速走 ⇒ 峰值速度偏离到位帧').toBe(1);
      expect(idle.isRunning(), `${招} 跨类切换没硬切 ⇒ Idle 的四元数轨道仍在抢那 11 根骨`).toBe(false);
      // 真骨架这一档不许再叠胶囊的趔趄：`_startProcCombat` 是**没有 clip 时**的兜底写者，
      // 片段已经在动那 11 根骨，同一次前倾由两个写者各写一遍就成了"骨架动画 + 每帧再加一份 proc"。
      expect(cm._procCombat.t, `${招} 在真骨架上又起了胶囊趔趄 ⇒ 片段与 proc 抢同一次前倾`).toBe(0);
      // 走完这一招：`update` 把 Idle 交回去，片段停止活着
      const 帧 = Math.ceil(SKELETON_MOTION[招].duration / dt) + 2;
      for (let i = 0; i < 帧; i++) cm.update(dt);
      expect(cm.currentAction.getClip().name, `${招} 收招没交回 Idle`).toBe('Idle');
      expect(cm.actions[skeletonClipName(招)].isRunning(), `${招} 的片段收招后还在混音器里活着`).toBe(false);
      expect(cm.actionLock, `${招} 收招后状态锁没归零`).toBe(0);
    });
  }

  it('六招各播各的：同一份候选表里不许两招共用一条片段', async () => {
    const { cm } = await 装配();
    const 播过的 = 接线表.map(([, 玩]) => { 玩(cm); return cm.currentAction.getClip().name; });
    expect(new Set(播过的).size, `六招只播出 ${new Set(播过的).size} 种形状：${播过的.join(' / ')}`).toBe(接线表.length);
  });

  it('模糊那两档撞不进 `__sk:`：骨骼片段的键是内部地址，必须明写（B113①）', () => {
    // 只有 `actions`、没有真骨架的一份玩家：这里量的是 `pickAnim` 的挑选口径，不是混音器。
    const cm = new CharacterModel();
    cm.actions = { [skeletonClipName('heavy')]: { getClip: () => ({ name: skeletonClipName('heavy') }) } };
    // 改前实测：`'Heavy'` / `'heavy attack'` 都撞上 `__sk:heavy`（子串档），战技与弹反反击
    // 就这样一声不响地借走重击那一档的骨。
    expect(cm.pickAnim(['Heavy']), `忽略大小写/子串那两档撞进了骨骼片段键：${cm.pickAnim(['Heavy'])}`).toBe(null);
    expect(cm.pickAnim(['heavy attack'])).toBe(null);
    expect(cm.pickAnim(['Block', 'Parry', 'Skill', 'Roll'])).toBe(null);
    // 明写的那一档必须仍然挑得到（否则修过头，`skeletal.*` 成了死账）
    expect(cm.pickAnim([skeletonClipName('heavy')])).toBe(skeletonClipName('heavy'));
    // 素材名那一侧的余地还在：子串档仍然给素材名用（与 character-anim-catalog 那条同源，双向）
    const 素材 = new CharacterModel();
    素材.actions = { 'Run To Rolling': {} };
    expect(素材.pickAnim(['Roll']), '子串档被一并拆掉 ⇒ 素材名的余地没了').toBe('Run To Rolling');
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
