/**
 * 战斗调参表 —— 所有"打了多少"的数字集中在此（M2：统一结算）。
 * 分工：`MoveTable` 管**时序与判定形状**（出手帧、判定半径、垂直打击带），
 * 本文件管**数值与体型**（部位倍率、防御、暴击、元素抗性、架势、处决基线）。
 * 两侧都不读对方内部字段，由 `combat/Resolution.js` 在命中那一帧合流。
 */

/** 部位：y0/y1 是相对目标脚底（网格原点）的高度，mult=伤害倍率，posture=架势倍率 */
export const PARTS = {
  head:  { mult: 1.6, posture: 1.35, y0: 1.62, y1: 2.20, label: '弱点' },
  torso: { mult: 1.0, posture: 1.00, y0: 0.72, y1: 1.62, label: '' },
  legs:  { mult: 0.8, posture: 0.90, y0: 0.00, y1: 0.72, label: '' },
};

/**
 * 体型方案：`scale` 把 PARTS 的高度整体放大（大个子头更高），
 * `parts` 决定有哪些部位（无人机没有下盘），`hover` 是网格原点离地的高度。
 * 悬浮与地形高差不写在分段里 —— 受击盒以目标网格原点为基准，由 `hurtBaseY()` 提供世界高度。
 *
 * `hover` 必须和近战打击带一起看：无人机的可见机体在局部 0.3~2.1，
 * 悬停到 2.5 米时整具机体抬到玩家轻击带（0.8~2.2）之上，近战只能靠 snap 勉强擦到。
 * 这里收到 0.9，让轻/重/战技/弹体四条判定带都有实际重叠而不是擦边。
 */
export const BODY_PLANS = {
  soldier: { scale: 1.00, parts: ['head', 'torso', 'legs'], radius: 0.45 },
  elite:   { scale: 1.12, parts: ['head', 'torso', 'legs'], radius: 0.55 },
  golem:   { scale: 1.25, parts: ['head', 'torso', 'legs'], radius: 0.80 },
  dummy:   { scale: 1.10, parts: ['head', 'torso', 'legs'], radius: 0.50 },
  drone:   { scale: 0.85, parts: ['head', 'torso'], radius: 0.50, hover: 0.9 },
  boss:    { scale: 1.75, parts: ['head', 'torso', 'legs'], radius: 1.10 },
  /**
   * 玩家自己也是"有部位的目标"：敌人那一刀该不该落到血条上，过去只看平面距离，
   * 于是跳起来、站在高台上都照样被横扫扫中 —— 闪避技能没有任何竖直维度可言。
   *
   * `snap` 比敌人一档收紧（见 `HURTBOX`）：0.9 米的容差是给"悬浮单位别打成免疫"用的，
   * 套在玩家身上会让"跳起来躲横扫"永远擦到边，等于白做。
   */
  player:  { scale: 1.00, parts: ['head', 'torso', 'legs'], radius: 0.45, snap: 0.35 },
};

/**
 * `snap`：打击带与最近的受击分段之间允许的最大空隙（米）。
 * 超出才判空挥 —— 保留"高度差太大打不着"的真实感，但不让手感变成"莫名其妙免疫"。
 * 体型方案可逐类覆盖（玩家自己那一档就收紧了，见 `BODY_PLANS.player`）。
 */
export const HURTBOX = { snap: 0.9 };

/** 防御减伤：1 - def/(def+K)，def=K 时 50%；cap 保证不会出现"免疫"手感 */
export const MITIGATION = { K: 60, cap: 0.75 };

/** 元素抗性（0~0.9），按敌人类型给出；未列出的类型视为无抗性 */
export const ENEMY_RESIST = {
  soldier: { fire: 0, ice: -0.15 },
  golem:   { fire: 0.25, ice: 0.35 },
  elite:   { fire: 0.1, gravity: 0.2 },
  drone:   { gravity: -0.25 },
  boss:    { fire: 0.15, ice: 0.15, gravity: 0.3 },
  dummy:   {},
};

export const CRIT = {
  player: { chance: 0.10, mult: 1.5 },
  enemy: { chance: 0.05, mult: 1.4 },
};

/** 破防（硬直）期间架势累加倍率：鼓励把敌人打进硬直后再连打 */
export const POSTURE = { staggerBonus: 1.5 };

/** 背刺：dot 为「目标朝向 · 目标指向攻击者」的阈值，越负越严格 */
export const BACKSTAB = { dot: -0.55, mult: 1.6, posture: 1.2 };

/** 玩家招式的数值基线（不含武器/属性倍率，倍率仍在出手瞬间乘好） */
export const PLAYER_MOVES = {
  light:    { damage: 22, posture: 14, stamina: 10 },
  heavy:    { damage: 48, posture: 32, stamina: 26 },
  skill:    { damage: 55, posture: 40, stamina: 32 },
  finisher: { damage: 70, posture: 50, stamina: 0 },
  riposte:  { damage: 95, posture: 32, skillScaleMult: 1 },
  roll:     { stamina: 14, cooldown: 0.75 },
  parry:    { stamina: 8 },
};

/** 连击增伤：第 N 段倍率 = 1 + min(N, maxSteps) * step */
export const COMBO = { step: 0.09, maxSteps: 6, skillStep: 0.05 };

/**
 * 输入缓冲（W-A4）—— 动作游戏"按键不丢"的核心。
 *
 * 修前的手感问题：攻击只在本招**完全走完**（`stateTimer > duration`）之后才接受下一次输入，
 * 于是连段之间有一段纯等待；玩家在恢复段里按下的第二刀要么被吞掉、要么以
 * `mouseDown` 布尔锁存的形式**无限期挂着**（在 0.58 秒的重击起手时按下的左键，
 * 会在 0.58 秒后才兑现，且期间再按也分辨不出来）。
 *
 * 现在：按键先记进缓冲，当前招式一旦开放取消窗口就**当帧**兑现。
 * - `seconds`：缓冲存活时长。取 0.18 秒 ≈ 10 帧，覆盖"手比眼快"的常见提前量，
 *   又不至于让上一秒的按键在下一秒突然生效。
 * - 缓冲只记**最近一次**按下：连点两下不会排队成两次攻击（排队会让"我明明只按了一下"
 *   变成多打一刀，比丢一次输入更糟）。
 */
export const INPUT = { buffer: 0.18 };

/** 体力回复（点/秒），仅在非出手状态下生效 */
export const STAMINA_REGEN = 26;

/**
 * 震屏 —— 全局唯一的相机抖动调参（`engine/Shake.js` 是唯一实现者）。
 *
 * 旧实现是"请求那一帧写一次随机偏移，然后每帧 `×0.78`"：衰减按帧不按秒，
 * 144 Hz 下几乎看不见抖、30 Hz 下抖成一团；而且随机数每帧自取，无法复现。
 * 现在改成 trauma 累积 + 按秒衰减 + 由相位确定的多正弦噪声。
 *
 * - `ref`：归一化基准 —— 全游戏最强的一次请求（蓄力法术 0.35）折算为 trauma 1.0
 * - `decay`：trauma 每秒线性衰减；0.35 强度约抖 0.36 秒，轻击约 0.03 秒
 * - `freq`：每秒振荡次数（Hz），与帧率无关
 * - `meters`：分相机视角的峰值位移（第一人称相机就是玩家的眼睛，同样位移会更晕）
 * - `vertical/depth`：竖直与前后方向的位移占比（横向最敏感，其余两轴压低）
 * - `lookWeight`：注视点跟随位移的比例 —— 全跟就成了整台相机平移，看不出"晃"
 */
export const SHAKE = {
  ref: 0.35,
  decay: 2.8,
  freq: 23,
  meters: { third: 0.075, first: 0.042 },
  vertical: 0.3,
  depth: 0.18,
  lookWeight: { third: 0.15, first: 0.35 },
};

/**
 * 击退与命中火花 —— 玩家打出去的一下到底把目标推开多远。
 *
 * 旧行为是"只有动画和掉血，目标钉在原地"：重击与轻击在位移上毫无区别，
 * 一群敌人贴脸时打不动也挤不开，手感只剩数字变化。
 * 击退以"外部冲量速度"进入 `Enemy._advance()`，与 AI 的位移意图分开积分、按秒衰减。
 *
 * - `speed`：基础冲量速度（米/秒），招式可用 `knock` 逐招覆盖
 * - `staggerScale`：硬直中的目标吃到的倍率（打进硬直后才推得动大家伙）
 * - `heavyScale`：重击段倍率
 * - `rootedScale`：目标正处于前摇/命中段时吃到的倍率 —— 不完全吃掉，否则重击打在起手敌人身上毫无位移反馈
 * - `massDivisor`：按体型 scale 折算的质量衰减项，越大的敌人越推不动
 * - `decay`：冲量速度的指数衰减率（每秒），与帧率无关
 * - `sparkPerHit`：一次命中溅出的火花数（池容量见 `sparkPool`，超出复用不留存）
 */
export const HIT = {
  speed: 3.2,
  staggerScale: 1.7,
  heavyScale: 1.6,
  critScale: 1.25,
  rootedScale: 0.3,
  massDivisor: 1.15,
  decay: 11,
  sparkPool: 110,
  sparkPerHit: 7,
  ringPool: 14,
  /** 飘字对象池容量：超过则复用最旧的一条（不新建 DOM 节点） */
  numberPool: 26,
};

export const ENEMY_DEFENSE = {
  dummy: 0, soldier: 6, drone: 3, golem: 26, elite: 18, boss: 32,
};

/** 玩家自身防御由装备/属性提供，M2 阶段基线为 0（先用闪避与弹反防御） */
export const PLAYER_DEFENSE = 0;

/**
 * 敌人 AI —— 感知、围攻名额、分离与招式时序。
 * 每类敌人的差异由 spawn config 提供（`aggroRange/attackRange/speed`），
 * 这里只放"所有敌人共用"的行为常量；单个敌人可用 `config.ai` 覆盖任意一项。
 */
export const AI = {
  /** 视野高度：遮挡求交在这个高度上进行（太低会被草皮绊住，太高翻得过矮墙） */
  eyeHeight: 1.5,
  /** 丢失视野后仍继续追击的时间（秒）—— 没有它，绕一根柱子就能脱战 */
  memory: 2.5,
  /** 归位：离出生点超过 aggroRange × leashScale 时彻底放弃并走回去 */
  leashScale: 1.7,
  returnSpeed: 0.85,
  returnArrive: 1.2,

  /** 分离：期望间距 = 双方半径和 + pad；推力是速度单位（米/秒）
   *  5.5 时两只同向蹭行的敌人仍能压到 0.5 m（半径和 0.9）互相穿模；
   *  扫参 5.5/7/8/10 → 最小间距 0.50/0.67/0.72/0.78，7 已够用且峰值速度未升高 */
  separationPad: 0.35,
  separationForce: 7,
  /** 玩家身体的分离半径（不读玩家内部字段，写在此处与 colliderRadius 对齐） */
  playerRadius: 0.45,

  /** 围攻名额：同时处于出手段的敌人数量 —— 一拥而上会把闪避变成不可能 */
  attackSlots: 2,
  /** 名额持有超时强制回收（秒）：死亡、传送、状态异常都不该留下永久占位者 */
  slotTimeout: 4,
  /** 没轮到进攻时与目标的期望保持距离（敌人自己的 `holdRange` 倍率）和绕行角速度 */
  orbitKeep: 1.5,
  orbitTurn: 0.7,
  /** 收招后撤的速度倍率（招式可用 `backoff` 逐招覆盖）：打完不退就没有被反击的窗口 */
  recoverBackoff: 0.5,

  /** 弹反窗口起点 = 本招前摇 × 此比例。按前摇比例而非定值，短前摇的快招才可弹 */
  parryRatio: 0.55,
  /** 预警期间的转向速率（远低于追击时的 8）：慢到横移能溜出锥形，快到站着不动不会打空 */
  aimFollowRate: 3,
  /** 前摇达到这个时长（秒）才在头顶加旋转警示：快招只有地面圈，玩家靠标记数量分辨威胁等级 */
  telegraphMarkWindup: 0.6,
  /** 架势打满后的硬直时长（秒），也是弹反成功后 `forceStagger` 的默认值 */
  stagger: 2.2,
};

/**
 * 敌人招式表 —— 每一招自带完整时序与判定形状（M2 第六切片）。
 *
 * 语义与玩家侧 `combat/MoveTable.js` 对齐，都是"数据描述一招，状态机只读表"：
 * - `windup/strike/recover`：预警 → 命中段 → 后撤（秒），命中在 windup 结束那一帧结算一次
 * - `reach`：在敌人 `attackRange` 之外的额外容差（米），预警结束时玩家略微走开仍该被打到
 * - `cone`：前向点积阈值（`dot(敌人朝向, 指向玩家)` ≥ 此值才命中），-2 为全向
 * - `damage`：相对该敌人基础伤害的倍率
 * - `combo`/`comboWindup`：连段段数与后续段的压缩前摇（首段完整预警）
 * - `travel: 'lunge'` + `travelSpeed`：命中段沿自己朝向前冲，让"突进"真的能追上新位置
 * - `backoff`：后撤段的速度倍率（打完那一招往后退多远）
 * - `aoe`：落地时对以自身为圆心该半径内的玩家生效，不看朝向（躲出圈外才算躲开）
 * - `band`：垂直打击带，相对**出手者网格原点（脚底；悬浮单位就是它的高度）**的高度区间。
 *   与玩家的受击分段没有重叠即为打空 —— 跳起来躲横扫、站高台躲崩地全靠这一项，
 *   所以低段招（横扫/崩地/三连刺/俯冲）能被跳掉、高段招（重劈）不能。远程招没有它：弹体尚无竖直判定
 * - `guard: true`：防御招，命中段不打人而是持续减免来自正面弧内的伤害（见 `GUARD`）
 * - `summon: { type, count }`：召唤招，命中段不伤人而是交出仆从（名额与生命周期见 `SUMMON`）；
 *   与防御招一样不是"打人的招"，所以不参与站位打分，也没有 `band`
 * - `ranged`：命中段改为一枚弹体（不要求贴身），`range` 是它自己的射程，`minDist` 之下不许用它免得糊脸
 * - `telegraph`：预警分级 —— 前摇越长颜色越偏紫、圈越大，玩家一眼能读出该躲还是该弹
 */
export const ENEMY_MOVES = {
  sweep: {
    name: '横扫', windup: 0.75, strike: 0.35, recover: 0.45, reach: 0.8, cone: 0.10,
    band: [0.05, 1.05],
    damage: 1.0, cooldown: 1.5, weight: 3,
    telegraph: { color: 0xff3322, ring: 1.0 },
  },
  thrust: {
    name: '突刺', windup: 0.42, strike: 0.24, recover: 0.34, reach: 1.3, cone: 0.45,
    band: [0.6, 1.7],
    damage: 0.8, cooldown: 1.2, weight: 3, travel: 'lunge', travelSpeed: 3.2,
    telegraph: { color: 0xffcc33, ring: 0.7 },
  },
  cleave: {
    name: '重劈', windup: 1.05, strike: 0.34, recover: 0.66, reach: 0.7, cone: -2,
    band: [1.1, 2.7],
    damage: 1.7, cooldown: 2.8, weight: 1,
    telegraph: { color: 0xaa22ff, ring: 1.35 },
  },
  slam: {
    name: '崩地', windup: 1.15, strike: 0.30, recover: 0.80, cone: -2, aoe: 3.6,
    band: [0.0, 0.9],
    damage: 1.6, cooldown: 3.4, weight: 1,
    telegraph: { color: 0xff2200, ring: 1.6 },
  },
  flurry: {
    name: '三连刺', windup: 0.55, strike: 0.18, recover: 0.30, reach: 1.1, cone: 0.35,
    band: [0.55, 1.6],
    damage: 0.55, cooldown: 2.4, weight: 2, combo: 3, comboWindup: 0.3,
    travel: 'lunge', travelSpeed: 2.2,
    telegraph: { color: 0xff8844, ring: 0.75 },
  },
  shot: {
    name: '虚能弹', windup: 0.85, strike: 0.20, recover: 0.55, cone: -2,
    range: 13, minDist: 4.0,
    damage: 0.9, cooldown: 2.0, weight: 2, ranged: { speed: 14, color: 0x66ddff },
    telegraph: { color: 0x33ccff, ring: 0.9 },
  },
  dive: {
    // reach 比横扫长一档：让无人机在"弹体中段"就能扑，而不必贴脸才打得着（见 holdRangeOf）
    // band 是负数起：无人机的网格原点就是它的"脚"（悬停 0.9 米），俯冲是往自己脚下扑
    name: '俯冲', windup: 0.38, strike: 0.22, recover: 0.28, reach: 3.3, cone: 0.20,
    band: [-0.6, 1.0],
    damage: 0.7, cooldown: 1.4, weight: 2, travel: 'lunge', travelSpeed: 4.2,
    telegraph: { color: 0xffdd55, ring: 0.65 },
  },
  guard: {
    // 防御招：前摇是"举盾"，命中段不打人而是持续格挡正面伤害（`GUARD`），收招才是被绕后的代价。
    // reach 必须落在本招集合里最长那招的落点之内（突刺 1.3），又不能短到敌人平时站的地方：
    // 写成 0 时它只在贴脸 2.2 米内可选，而士兵实测停在 2.9 米 —— 整条格挡链路从不触发。
    name: '格挡', windup: 0.5, strike: 1.5, recover: 0.55, reach: 0.9, cone: -2,
    damage: 0, cooldown: 6.5, weight: 1, guard: true,
    telegraph: { color: 0x66aaff, ring: 0.9 },
  },
  summon: {
    // 召唤招：命中段不打人，而是交出仆从（名额与生命周期见 `SUMMON`）。
    // 前摇是全场最长的一档 —— 念咒必须看得见，也必须来得及被弹反/打断。
    name: '召唤', windup: 1.4, strike: 0.25, recover: 0.7, reach: 0.9, cone: -2,
    damage: 0, cooldown: 11, weight: 1, summon: { type: 'soldier', count: 2 },
    telegraph: { color: 0x66ff99, ring: 1.15 },
  },
};

/**
 * 敌人「召唤」的名额、强度与生命周期 —— 三道闸缺一不可：
 * 没有 `perOwner`，一只召唤者可以站着无限铺场；没有 `total`，四只召唤者就能把帧预算花光；
 * 没有 `life`，放出来又没被杀掉的仆从会永远占着场与围攻名额。
 * 召唤者死亡时它的仆从直接消散（不必逐个追杀），这条可读规则与生命周期都由 `EnemyManager` 执行。
 *
 * - `ringRadius`：仆从落在召唤者周围多远的环上（按黄金角散开，不与召唤者重叠）
 * - `perOwner/total`：同时存活的仆从数上限（单只与全场）
 * - `life`：秒。到点自行消散并释放资源
 * - `hp/posture/damage/speed`：仆从是消耗品，数值另给一套，不从召唤者继承
 * - `name`：飘字、镜头与任务统计都会读到这个名字，玩家据此分清"这是刷出来的"
 */
export const SUMMON = {
  ringRadius: 3.2,
  perOwner: 2,
  total: 8,
  life: 26,
  hp: 55,
  posture: 30,
  damage: 9,
  speed: 5.2,
  name: '虚空仆从',
};

/**
 * 敌人「格挡」的减免 —— 出手方向落在防御弧内才算挡住。
 *
 * `arc` 与 `BACKSTAB.dot` 同一套约定：比较的是「敌人朝向」与「敌人指向出手者」。
 * 减免后仍照原样累加架势（只是打折），所以连续猛攻会把盾打沉、破防后就是全额窗口；
 * 绕到背后（`isBehind`）与侧面超出弧面的攻击完全无视格挡。
 */
export const GUARD = { mult: 0.3, posture: 0.55, arc: 0.1, spark: 0xa8d8ff };

/**
 * 处决 / 终结技的**取景折算** —— 机位按被处决者的身体算，不按"人类身高"算。
 *
 * 运镜本身（时长/缩放/黑边/绕轨角度）是 `cinematic/CombatCameraDirector.js` 的 preset 表；
 * 这里只放"体型如何改变构图"这一组数，因为它要和 `BODY_PLANS` 对齐着调。
 * 旧实现把注视点写成 `目标 y + 1.25 米`、轨道半径与高度写成定值：1.87 米的无人机与
 * 3.85 米的 Boss 拿到一模一样的构图 —— 打 Boss 时镜头埋进它肚子里，打小个子时又拉太远，
 * 玩家看不清"到底是谁死了"。
 *
 * - `ref`：身高等于这一档时按 preset 原样取景 —— 取的就是标准士兵的受击盒顶（`PARTS.head.y1`），
 *   于是数量最多的人形单位构图与修 B31 前基本一致，只有 Boss 与悬浮小体型会被拉开
 * - `minScale/maxScale`：折算上下限（小个子不贴脸、Boss 不飞到对岸）
 * - `lookRatio`：注视点落在身体的哪个高度比例（0.62 约在胸口，处决动画最常拍的部位）
 * - `centerBias`：环绕中心与注视高度取"玩家 ↔ 目标"连线的哪一段（>0.5 偏向被处决者）
 * - `radiusFollow/heightFollow`：半径与高度跟随体型放大的比例（1 = 完全线性，越小越保守）
 */
export const EXECUTION_CAMERA = {
  ref: 2.2,
  minScale: 0.8,
  maxScale: 1.8,
  lookRatio: 0.62,
  centerBias: 0.55,
  radiusFollow: 0.6,
  heightFollow: 0.45,
  /** 问不到身高时（旧式派发、没有锁定目标）退回这一档：等于 preset 原样，不是 NaN 也不是贴脸 */
  fallbackStature: 2.2,
};

/**
 * 两种镜头模式的基准 FOV —— 全仓库只有这一处定义。
 * 演出系统（`CombatCameraDirector`）与玩家相机（`PlayerController`）都在写 `camera.fov`，
 * 数字写两遍必然漂移（第一人称的处决镜头此前就是只改了一半）。M3 把相机收进唯一所有者后，
 * 这两个数应随之下沉到 `CameraRig`。
 */
export const CAMERA_FOV = { first: 78, third: 62 };

/**
 * 镜头所有权交接的补间时长（秒）—— W-A5 切片1。
 *
 * 只在**所有者变更**那一帧生效（玩家 ↔ 过场 ↔ 观看），稳定持有期间不补间（调用方自己已阻尼）。
 * `enter` 略快、`exit` 略慢：进过场是"被拽去看一段演出"，干脆一点；退出是"把镜头还给玩家、
 * 玩家要立刻重新掌握瞄准"，慢一点能看清落点而不是甩一下。两个都远大于 hitstop 的 0.1~0.2 秒，
 * 所以用的是 rawDt（见 `CameraRig.commitView`），不被时停拉长。
 */
export const CAMERA_BLEND = { enter: 0.45, exit: 0.5 };

/**
 * 锁定（lock-on）时的第三人称镜头参数 —— W-A5 切片2。
 *
 * `yawRate`：镜头绕到"背对目标那一侧"的追踪速率（1/秒，按秒算 → 帧率无关）。锁定瞬间
 * 战斗系统会把 `player.targetYaw` 直接写成"指向目标的方向"；若像过去那样 `yaw = targetYaw`
 * 硬赋值，锁定一个身后的敌人 = 画面一帧甩 180°，玩家当场失去方向感。这里改成指数逼近，
 * 让镜头"转过去"而不是"跳过去"。命中朝向另走 `getCombatForwardXZ()`（读目标位置，与镜头
 * yaw 无关），所以阻尼只影响观感、不削准头 —— 这是这条改动成立的关键前提。
 * `distance / distanceBlend`：锁定时把力臂收到这一档（魂系越肩贴近），`0~1` 是在
 * `cameraDistance` 与该目标值之间的插值权重。
 */
export const LOCK_ON_CAMERA = { yawRate: 14, distance: 5.4, distanceBlend: 0.4 };

/**
 * 第三人称遮挡求交的参数 —— 镜头该在什么时候"贴不住"玩家背后。
 *
 * `steps`：从支点向期望机位均分几段做前向探测。前向（而不是二分）是因为地形的
 * 阻挡**不单调** —— 越过一个小丘后面可能又是空地，二分会把它算成"整段都被挡"。
 * `wallMargin`：命中实体后再往回收的余量（米）。不留余量就会贴着墙面抖，
 * 摄像机近裁剪面还会啃进几何体里。
 * `groundLift` / `blockClearance`：机位离地下限与"这一段算不算被地形吃掉"的净高。
 * `minPull`：最远只能收到支点此距离的这一比例处，保证镜头永远不钻到玩家身体里。
 */
export const CAMERA_OCCLUSION = {
  /** 地形那一趟的格数（旧实现就是这一条在做的事，保持原分辨率以免手感漂移） */
  terrainSteps: 6,
  /** 实体那一趟的格数 */
  steps: 8,
  wallMargin: 0.26,
  groundLift: 1.35,
  blockClearance: 1.25,
  /** 实体的"变胖"余量（米）：镜头停在墙面前方这么远，不让近裁剪面啃进几何体 */
  pointPad: 0.22,
  /** 找到"第一格被挡"之后再夹几刀定位接触点（march 的一格是 0.65 米级，太粗） */
  refine: 4,
  /** 力臂下限：这一条只管"别钻进玩家身体"，不管墙 —— 取 0.3 时（=1.56 米）比很多障碍物的
   * 接触点还远，等于把镜头停在它里面（浏览器实读：柱子近表面在 1.5 米处，0.3 档把镜头放在 1.56 米）。 */
  minPull: 0.12,
  /** 收进来 / 伸出去的平滑速率（1/秒）。前者快后者慢：贴墙要让位，离墙不许弹跳 */
  retractRate: 34,
  extendRate: 16,
};

/**
 * 每类敌人的招式（≥3 招，训练木桩除外）。
 * `default` 给未知 type 兜底；spawn config 的 `moves` 可给 id 列表或内联招式对象。
 * Boss 家族目前仍跑自己的招式脚本，这一行只是 `Enemy` 基类的兜底数据。
 * 只有持盾的两类（士兵/精英）会格挡：构装体靠装甲、无人机没有手、Boss 有自己的脚本。
 */
export const ENEMY_MOVE_SETS = {
  soldier: ['sweep', 'thrust', 'cleave', 'guard'],
  elite: ['sweep', 'flurry', 'cleave', 'guard', 'summon'],
  golem: ['cleave', 'slam', 'sweep'],
  drone: ['shot', 'dive', 'sweep'],
  dummy: [],
  boss: ['sweep', 'cleave', 'slam', 'shot'],
  default: ['sweep', 'thrust', 'cleave'],
};

