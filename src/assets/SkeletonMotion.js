import * as THREE from 'three';

/**
 * 骨骼招式表 —— 给**真骨架**写动作，而不是把跑步循环按倍速当挥砍（W-C6 切片8）。
 *
 * ## 为什么需要这一份
 *
 * 出厂素材 `public/assets/models/Soldier.glb` 只有四条 clip（`Idle / Run / Walk / TPose`），
 * 一条攻击都没有。于是 `CharacterModel.playComboAttack()` 的候选表
 * `[catalog.attack1, …ANIM_MANIFEST.attack1, catalog.walk, 'Walk']` 只能落到 `'Walk'`，
 * 再乘上 `speeds = [1.12, 1.05, 0.95]` —— 玩家按下左键看到的是一边挥空手一边原地踏步。
 * 补素材（Mixamo 下载 + Blender 转 GLB，见 `scripts/import-mixamo.ps1`）要外部资源与本机没有的
 * Blender，玩家侧等不到；而 GLB 自带 49 根 `mixamorig:*` 骨骼，**骨骼是现成的**，缺的只有
 * "每一招的关键帧"。
 *
 * ## 写的是**增量**，基准是 Idle 第一帧
 *
 * 表里每个数值都是"相对站姿转多少弧度"，构造 clip 时再加上 `SKELETON_REST`（Idle 第一帧的局部
 * 欧拉，由门禁逐骨逐轴对着 GLB 字节核对）。为什么用增量而不是绝对值：
 * - **起手与收招自动归位**：分数 0 与 1 的增量都是 0 ⇒ 招式从站姿起手、回到站姿，
 *   淡入淡出时看得见的那一下硬跳（绝对值写法会把手甩到别处再跳回来）在结构上不会发生。
 * - **末帧不是 T 型姿势**：一次性招式播完会 `clampWhenFinished` 停在末帧，绝对值写法只要
 *   有一根骨没写就退回绑定姿势（臂平举的 T 型），增量写法没写的骨保持站姿那一档。
 * - 读的人看得出这一招"送出去多少"，不用先心里减一遍站姿。
 *
 * ## 与 `ANIM_MOTION`（根节点运动表）的分工
 *
 * `AnimationLibrary.ANIM_MOTION` 那三条通道绑在**视觉层根节点**上，动的是"整个人"；这张表绑在
 * **骨骼**上，动的是"身体各段相对躯干"。切片5/6/7 立起来的所有权在这里的推论是：
 * **根节点的俯仰 / 滚转 / 偏头由 `CharacterModel.proc` 独占**（剑挂在这一层，跟着身体歪 —— B110），
 * 所以本表**不写 `Hips` / `Spine*` 的 `x` 通道**：写了就是同一件事两个写者，命中帧的前倾会叠成两倍。
 * 转体只走 `y`（yaw），它与 proc 的三通道不撞。
 *
 * ## 轨道种类决定交接方式
 *
 * 本表编出来的是**数字欧拉轨道**（`.rotation[x]`），而素材的 `Idle / Run / Walk` 是
 * `GLTFLoader` 给的**四元数轨道**（`.quaternion`），驱动同一批骨。两类不能淡入淡出地接：
 * `Object3D` 的 `quaternion` 与 `rotation` 互相同步，权重斜坡期间每根共有骨每帧被两个写者
 * 各写一遍、后写的全赢 —— 那不是插值，是抢笔。所以 `CharacterModel` 里
 * `_isSkeletal(action)` 是一处独占的判据：**跨类硬切（`stop()` + `fadeIn(0)`），同类才淡**，
 * 进招式与收回 `Idle` 两侧共用它。片段首/末帧增量为 0 让硬切在数值上是连续的（跳变实测 ≈ 3 厘米，
 * 来自 `Idle` 自己那一圈循环离第 0 帧的距离），这也是"增量写法"顺带买到的东西。
 * 在册的账分两本：`catalog.*` 只说素材自己提供了什么，`skeletal.*` 说本表接上了什么 ——
 * 素材接进来那天，前者跟着素材变，后者自动让位，不需要有人回来把谎圆上。
 *
 * ## 数值不是拍的
 *
 * 每根骨的每个轴都先用只读探针（`.tmp-20261013/probe-idle-axes.mjs`：把 Idle 第一帧铺到真骨架上，
 * 再单轴转 0.4 弧度量右手在世界里往哪走几米）量过方向，才按量出来的符号编排：
 * - `RightArm.x` 负 = 手往前送；`RightArm.y` 负 = 前送且手往身体内侧收；`RightArm.z` 正 = 手下落。
 * - `RightForeArm.x` 负 = 送肘出手；`RightShoulder.y` 负 = 肩把整条臂往前带。
 * - `Spine1.y` / `Spine2.y` **正** = 向右绕（右手因此往后收），**负** = 向左打开（右手前伸 ≈ 0.13 米 / 0.4 弧度）。
 * - `LeftArm` / `LeftForeArm` 与右侧镜像；`RightUpLeg.x` 正 = 大腿前迈，`RightLeg.x` 负 = 屈膝。
 *
 * ## 读数（`.tmp-20261013/probe-skeleton-moves.mjs`，把 Idle 第一帧铺成真站姿后逐帧量右手）
 *
 * | 招式 | 速度峰 vs 命中 | 峰速 | 命中帧前送 | 命中帧横向速度 | 蓄力帧手高 vs 命中帧 | 末帧回站姿 |
 * | --- | --- | --- | --- | --- | --- | --- |
 * | attack1 | +0.4 帧 | 9.4 米/秒 | 0.247 米 | −8.9 米/秒（右→左） | −0.02 / +0.12（平斩） | 0.010 米 |
 * | attack2 | −0.6 帧 | 6.0 米/秒 | 0.187 米 | +3.1 米/秒（左→右） | −0.02 / +0.14（上挑） | 0.000 米 |
 * | attack3 | −0.6 帧 | 11.5 米/秒 | 0.166 米 | −10.7 米/秒 | +0.14 / +0.07（砸下来） | 0.014 米 |
 * | heavy | −1.8 帧 | 11.8 米/秒 | 0.164 米 | −10.3 米/秒 | +0.17 / +0.07（举得最高） | 0.008 米 |
 *
 * 一式与二式的横向速度**反号**是连段看得出"来回"的唯一凭据（位置本身都在身侧 0.3 米内，看不出区别）；
 * 三式与重击的蓄力帧手高于命中帧，才是"从上往下劈"。这几条都写在 `tests/player-skeleton-moves.test.js` 里，
 * 用真 GLB 字节搭出来的骨架逐帧跑 —— 表的数值一改，读数不合规就红。
 */

/**
 * 骨名前缀 —— 口径不是猜的：`GLTFLoader` 给每个节点头上贴的是
 * `THREE.PropertyBinding.sanitizeNodeName(原始名)`，而那个函数是
 * `name.replace(/\s/g, '_').replace(_reservedRe, '')` —— **保留字符（含 `:`）是删掉，不是替换成下划线**。
 * 于是素材里的 `mixamorig:Spine1` 在浏览器里那根骨叫 `mixamorigSpine1`。
 * 改前这里写的是 `'mixamorig_'`，轨道名 `mixamorig_Spine1.rotation[y]` 在真场景里绑不到任何节点：
 * 混音器对绑不上的轨道**不报错**（`PropertyBinding` 找不到节点就整条作废），于是四招全部静默不动，
 * 而只读探针因为自己实现了一版"把 `:` 换成 `_`"的 sanitize 而一路绿灯（`.tmp-20261013` 的夹具
 * 与出货读取器不是同一份 ⇒ 量的是夹具，不是素材）。现在由 `tests/player-skeleton-moves.test.js`
 * 拿 three 自己的 `sanitizeNodeName` 对着 GLB 原始名逐骨核对这 11 根在不在。
 */
export const BONE_PREFIX = 'mixamorig';
export const boneName = (标签) => `${BONE_PREFIX}${标签}`;

/** 本表生成的 clip 在混音器里的名字前缀 —— 把它与 GLB 自带 clip 隔开，真素材接进来时不会互相顶掉。 */
const 片段前缀 = '__sk:';
export const skeletonClipName = (招式) => `${片段前缀}${招式}`;

/** 这个 clip 名是不是本表编出来的（`CharacterModel` 据此决定硬切还是淡入淡出，见那边 `_playOnce` 的注）。 */
export const isSkeletonClipName = (名) => typeof 名 === 'string' && 名.startsWith(片段前缀);

/**
 * 基准姿态：`Soldier.glb` 的 `Idle` 第一帧各骨的局部欧拉（XYZ 序，弧度）。
 * 抄自素材 ⇒ 必须与素材对齐，`tests/player-skeleton-moves.test.js` 逐骨逐轴把它对着 GLB 字节重算比对。
 */
export const SKELETON_REST = Object.freeze({
  Spine1: Object.freeze([0.207, 0.158, -0.054]),
  Spine2: Object.freeze([0.207, 0.158, -0.054]),
  RightShoulder: Object.freeze([0.025, 0.165, 1.742]),
  RightArm: Object.freeze([-0.424, -0.019, 1.048]),
  RightForeArm: Object.freeze([0.734, 0.086, 0.063]),
  LeftArm: Object.freeze([0.043, -0.249, 1.115]),
  LeftForeArm: Object.freeze([-0.837, 0.116, 0.024]),
  RightUpLeg: Object.freeze([3.066, 0.240, 0.270]),
  RightLeg: Object.freeze([0.561, 0.159, 0.008]),
  LeftUpLeg: Object.freeze([2.679, -0.106, -0.236]),
  LeftLeg: Object.freeze([0.591, 0.244, 0.003]),
});

/** 轴序号 ↔ 通道名（与 `THREE.Euler` 的 `x/y/z` 一一对应）。 */
const 轴序 = Object.freeze({ x: 0, y: 1, z: 2 });

/**
 * 三个关键帧槽（表里写的是槽名，构造时换成秒）：
 * - `h` ＝ **蓄力档**：命中前 0.09 秒（5.4 帧），手已经绕到起手那一侧。
 * - `s` ＝ **命中帧**：与 `combat/MoveTable.js` 的 `at` 同源（判定就发生在这一刻）。
 * - `f` ＝ **随势档**：命中后同样 0.09 秒，最伸展的那一帧落在判定附近 —— 真剑是"穿过目标"，
 *   把极值正好钉在命中帧反而让手在判定那一刻停住（速度谷底），砍击看着没有力量。
 *
 * **两档关于命中帧时间对称**是这片的关键：三次样条在 `h → f` 这一段的速度峰落在中点，
 * 中点按构造就是 `s`。早先按"分数对称"配槽（`h = σ − 0.22`），短时长招式的 `0 → h`（起手到蓄力）
 * 只有两三帧、快过出招本身，探针量到的速度峰因此跑到命中前 7.6 帧、手部峰速 14–17 米/秒；
 * 改成时间对称后四招的峰速全部落在命中 ±2 帧内，峰速回到 6–12 米/秒。
 * `s` 留给"压手"那一档用：`z+` 会把手往回带，走完太早会把命中帧的前送抵消掉（见 `heavy`）。
 *
 * 槽制还有个好处：调 `strikeAt`（改判定帧）或改 `duration` 时三档跟着走，动作形状不变。
 */
const 蓄力提前秒 = 0.09;
function 关键槽(条目) {
  const σ = 条目.strikeAt / 条目.duration;
  if (!(σ > 0 && σ < 1)) throw new Error(`SkeletonMotion: 判定帧不在时长内（strikeAt=${条目.strikeAt} duration=${条目.duration}）`);
  const 提前 = Math.min(蓄力提前秒, 条目.strikeAt - 1 / 60);
  if (提前 <= 0) throw new Error(`SkeletonMotion: 判定帧 ${条目.strikeAt} 太早，蓄力档没地方放`);
  return {
    h: (条目.strikeAt - 提前) / 条目.duration,
    s: σ,
    f: Math.min((条目.strikeAt + 提前) / 条目.duration, 0.96),
  };
}

/**
 * 招式表。`duration` 与 `CharacterModel` 里那一招的 `actionLock` 同值（门禁逐条对账），
 * `strikeAt` 是判定帧秒数（与 `combat/MoveTable.js` 的 `at` 同值，同样由门禁钉住），
 * `bones` 每骨若干通道，每通道是 `[位置, 增量弧度]`；位置是 0..1 的数或 `h`/`s`/`f` 三档之一。
 * **每骨每通道首尾增量必须都是 0**（从站姿起手、回站姿收招）—— 这条由门禁逐条扫。
 */
const 招式 = (duration, strikeAt, bones) => Object.freeze({ duration, strikeAt, bones });

export const SKELETON_MOTION = Object.freeze({
  /** 一式·横斩：右后收蓄（幅度小、圈数短），再向左侧水平扫出；命中点高度几乎不变。 */
  attack1: 招式(0.42, 0.16, {
    Spine1: { y: [[0, 0], ['h', 0.14], ['f', -0.56], [1, 0]] },
    Spine2: { y: [[0, 0], ['h', 0.10], ['f', -0.34], [1, 0]] },
    RightShoulder: { y: [[0, 0], ['h', 0.10], ['f', -0.42], [1, 0]] },
    RightArm: {
      x: [[0, 0], ['h', 0.10], ['f', -0.72], [1, 0]],
      y: [[0, 0], ['h', 0.14], ['f', -0.44], [1, 0]],
      z: [[0, 0], ['h', -0.08], ['s', 0.02], ['f', 0.08], [1, 0]],
    },
    RightForeArm: { x: [[0, 0], ['h', 0.16], ['f', -0.78], [1, 0]] },
    LeftArm: {
      x: [[0, 0], ['h', -0.12], ['f', 0.30], [1, 0]],
      z: [[0, 0], ['h', 0.08], ['f', -0.12], [1, 0]],
    },
    LeftForeArm: { x: [[0, 0], ['h', -0.10], ['f', 0.34], [1, 0]] },
    RightUpLeg: { x: [[0, 0], ['h', -0.05], ['f', 0.18], [1, 0]] },
    RightLeg: { x: [[0, 0], ['h', 0.04], ['f', -0.12], [1, 0]] },
    LeftUpLeg: { x: [[0, 0], ['h', 0.05], ['f', -0.16], [1, 0]] },
    LeftLeg: { x: [[0, 0], ['h', -0.03], ['f', 0.10], [1, 0]] },
  }),
  /** 二式·回斩：右手先过身到左后下方蓄住，命中时向右前上方扫回 —— 横向速度与一式反号。 */
  attack2: 招式(0.48, 0.16, {
    Spine1: { y: [[0, 0], ['h', -0.16], ['f', 0.10], [1, 0]] },
    Spine2: { y: [[0, 0], ['h', -0.10], ['f', 0.06], [1, 0]] },
    RightShoulder: {
      y: [[0, 0], ['h', 0.10], ['f', -0.34], [1, 0]],
      z: [[0, 0], ['h', 0.24], ['f', -0.46], [1, 0]],
    },
    RightArm: {
      x: [[0, 0], ['h', 0.16], ['f', -0.92], [1, 0]],
      y: [[0, 0], ['h', -0.20], ['f', 0.70], [1, 0]],
      z: [[0, 0], ['h', 0.20], ['s', -0.06], ['f', -0.34], [1, 0]],
    },
    RightForeArm: { x: [[0, 0], ['h', 0.30], ['f', -0.90], [1, 0]] },
    LeftArm: {
      x: [[0, 0], ['h', 0.16], ['f', -0.26], [1, 0]],
      z: [[0, 0], ['h', -0.10], ['f', 0.14], [1, 0]],
    },
    LeftForeArm: { x: [[0, 0], ['h', 0.12], ['f', -0.22], [1, 0]] },
    RightUpLeg: { x: [[0, 0], ['h', 0.08], ['f', -0.14], [1, 0]] },
    RightLeg: { x: [[0, 0], ['h', -0.06], ['f', 0.10], [1, 0]] },
    LeftUpLeg: { x: [[0, 0], ['h', -0.08], ['f', 0.18], [1, 0]] },
    LeftLeg: { x: [[0, 0], ['h', 0.06], ['f', -0.12], [1, 0]] },
  }),
  /** 三式·斜劈：抬到右上后方（`z` 负那一档）再砸向左前下方；压手走完在 `f`，前送由臂与躯干接上。 */
  attack3: 招式(0.54, 0.16, {
    Spine1: { y: [[0, 0], ['h', 0.16], ['f', -0.56], [1, 0]] },
    Spine2: { y: [[0, 0], ['h', 0.16], ['f', -0.32], [1, 0]] },
    RightShoulder: {
      y: [[0, 0], ['h', 0.10], ['f', -0.48], [1, 0]],
      z: [[0, 0], ['h', -0.34], ['f', 0.22], [1, 0]],
    },
    RightArm: {
      x: [[0, 0], ['h', 0.12], ['f', -1.06], [1, 0]],
      y: [[0, 0], ['h', 0.12], ['f', -0.40], [1, 0]],
      z: [[0, 0], ['h', -0.44], ['s', 0.24], ['f', 0.54], [1, 0]],
    },
    RightForeArm: {
      x: [[0, 0], ['h', 0.18], ['f', -1.02], [1, 0]],
      z: [[0, 0], ['h', 0.12], ['f', -0.10], [1, 0]],
    },
    LeftArm: {
      x: [[0, 0], ['h', -0.14], ['f', 0.30], [1, 0]],
      z: [[0, 0], ['h', 0.12], ['f', -0.18], [1, 0]],
    },
    LeftForeArm: { x: [[0, 0], ['h', -0.12], ['f', 0.34], [1, 0]] },
    RightUpLeg: { x: [[0, 0], ['h', -0.08], ['f', 0.26], [1, 0]] },
    RightLeg: { x: [[0, 0], ['h', 0.06], ['f', -0.20], [1, 0]] },
    LeftUpLeg: { x: [[0, 0], ['h', 0.08], ['f', -0.22], [1, 0]] },
    LeftLeg: { x: [[0, 0], ['h', -0.06], ['f', 0.18], [1, 0]] },
  }),
  /** 重击·双手过顶重劈：举得最高（`z` 负到底）、压得最低（膝），行程最长，判定帧也最晚。 */
  heavy: 招式(0.62, 0.28, {
    Spine1: { y: [[0, 0], ['h', 0.14], ['f', -0.56], [1, 0]] },
    Spine2: { y: [[0, 0], ['h', 0.14], ['f', -0.34], [1, 0]] },
    RightShoulder: {
      y: [[0, 0], ['h', 0.08], ['f', -0.46], [1, 0]],
      z: [[0, 0], ['h', -0.30], ['f', 0.24], [1, 0]],
    },
    RightArm: {
      x: [[0, 0], ['h', 0.12], ['f', -1.10], [1, 0]],
      y: [[0, 0], ['h', 0.10], ['f', -0.36], [1, 0]],
      // `z+`（压手）同时把手往回带：走完在 `f` 而不是 `s`，命中那一刻前送才不会被抵消掉。
      z: [[0, 0], ['h', -0.56], ['s', 0.24], ['f', 0.66], [1, 0]],
    },
    RightForeArm: {
      x: [[0, 0], ['h', 0.10], ['f', -1.06], [1, 0]],
      z: [[0, 0], ['h', 0.10], ['f', -0.14], [1, 0]],
    },
    // 左手跟上去握柄（双手举砍）：命中帧把左臂收到身侧前方
    LeftArm: {
      x: [[0, 0], ['h', -0.12], ['f', 0.30], [1, 0]],
      z: [[0, 0], ['h', -0.30], ['f', 0.30], [1, 0]],
    },
    LeftForeArm: { x: [[0, 0], ['h', -0.10], ['f', 0.36], [1, 0]] },
    RightUpLeg: { x: [[0, 0], ['h', -0.10], ['f', 0.30], [1, 0]] },
    RightLeg: { x: [[0, 0], ['h', 0.08], ['f', -0.24], [1, 0]] },
    LeftUpLeg: { x: [[0, 0], ['h', 0.08], ['f', -0.26], [1, 0]] },
    LeftLeg: { x: [[0, 0], ['h', -0.06], ['f', 0.22], [1, 0]] },
  }),
});

/** 一招要动的骨（缺任何一根就整招不接 —— 半套骨骼片段比没有更难看）。 */
export function requiredBones(招式名) {
  const 条目 = SKELETON_MOTION[招式名];
  if (!条目) throw new Error(`SkeletonMotion: 没有这一招 "${招式名}"，名单：${Object.keys(SKELETON_MOTION).join(', ')}`);
  return Object.keys(条目.bones).map(boneName);
}

/** 表里出现过的骨名（基准姿态覆盖性的检查用：每根都要在 `SKELETON_REST` 里有一档）。 */
export function listedBones() {
  const 集 = new Set();
  for (const 条目 of Object.values(SKELETON_MOTION)) {
    for (const 标签 of Object.keys(条目.bones)) 集.add(标签);
  }
  return [...集];
}

/**
 * 把一招编成 `THREE.AnimationClip`：增量 + `SKELETON_REST` ⇒ 绝对局部欧拉，每轴一条数字轨道。
 * @param {string} 招式名
 * @param {{has:(骨名:string)=>boolean}} 在世骨骼 只提供"这具骨架里有没有这根骨"
 * @returns {THREE.AnimationClip|null} 骨不齐 / 骨不在基准姿态表里 ⇒ `null`（调用方退回 proc 层，不谎报有动作）
 */
export function buildSkeletonClip(招式名, 在世骨骼) {
  const 条目 = SKELETON_MOTION[招式名];
  if (!条目) return null;
  const 缺骨 = requiredBones(招式名).filter((骨) => !在世骨骼.has(骨));
  if (缺骨.length) return null;
  const 缺基准 = Object.keys(条目.bones).filter((标签) => !SKELETON_REST[标签]);
  if (缺基准.length) {
    throw new Error(`SkeletonMotion: "${招式名}" 用了没配基准姿态的骨 ${缺基准.join(', ')} —— 增量无从加起`);
  }
  const 槽 = 关键槽(条目);
  const 轨道 = [];
  for (const [标签, 通道组] of Object.entries(条目.bones)) {
    for (const [轴, 帧] of Object.entries(通道组)) {
      const 基值 = SKELETON_REST[标签][轴序[轴]];
      const 次 = [];
      const 值 = [];
      for (const [位置, 增量] of 帧) {
        const 分数 = typeof 位置 === 'number' ? 位置 : 槽[位置];
        if (分数 === undefined) {
          throw new Error(`SkeletonMotion: "${招式名}.${标签}.${轴}" 用了不认识的位置 "${位置}"（可用 0..1 的数或 h/s/f）`);
        }
        次.push(分数 * 条目.duration);
        值.push(基值 + 增量);
      }
      轨道.push(new THREE.NumberKeyframeTrack(
        `${boneName(标签)}.rotation[${轴}]`, 次, 值, THREE.InterpolateSmooth,
      ));
    }
  }
  return new THREE.AnimationClip(skeletonClipName(招式名), 条目.duration, 轨道);
}

/**
 * 给混音器注册"这具骨架能播"的招式，并把 Action 一并交出去
 * （调用方要把它们放进自己的 `actions` 表里，按名字挑选时才会看得见）。
 * @returns {{片段名: Record<string,string>, 动作: Record<string,THREE.AnimationAction>, 轨道数: number, 接上: number}}
 *   招式 → clip 名 / Action；骨不齐的招式不进两个表（不谎报有动作）
 */
export function registerSkeletonClips(mixer, 在世骨骼集) {
  const 片段名 = {};
  const 动作 = {};
  let 轨道数 = 0;
  if (!mixer) return { 片段名, 动作, 轨道数, 接上: 0 };
  const 在世 = 在世骨骼集 instanceof Set ? 在世骨骼集 : new Set(在世骨骼集 || []);
  for (const 招式名 of Object.keys(SKELETON_MOTION)) {
    const clip = buildSkeletonClip(招式名, 在世);
    if (!clip) continue;
    动作[招式名] = mixer.clipAction(clip);
    片段名[招式名] = clip.name;
    轨道数 += clip.tracks.length;
  }
  return { 片段名, 动作, 轨道数, 接上: Object.keys(片段名).length };
}
