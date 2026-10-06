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
  /**
   * W-B7 切片1 新增的三类（破碎时线 / 混沌边境此前没有原生敌人）。
   * 怨影与哨卫是悬浮体（不占 `legs` 分段），掠行兽是贴地的快速体。
   */
  wraith:   { scale: 0.92, parts: ['head', 'torso'], radius: 0.42, hover: 0.7 },
  stalker:  { scale: 0.95, parts: ['head', 'torso', 'legs'], radius: 0.42 },
  sentinel: { scale: 1.05, parts: ['head', 'torso'], radius: 0.55, hover: 0.35 },
  /**
   * W-B7 切片3 新增的三类。爬兽贴地、骑士最重、舞者最轻 ——
   * 体型差要能在"被击退多远"上读出来（`mass` 取自 `scale`）。
   */
  crawler: { scale: 1.02, parts: ['head', 'torso', 'legs'], radius: 0.50 },
  knight:  { scale: 1.18, parts: ['head', 'torso', 'legs'], radius: 0.58 },
  dancer:  { scale: 0.94, parts: ['head', 'torso', 'legs'], radius: 0.42 },
  /**
   * W-B7 切片4 新增的两类。此前灰白森林（影之战士）与霍格沃兹遗境（魔法构装体）
   * 各只有一种原生敌人 —— 这两类补的是「每座位面至少两类」，不是补总数。
   */
  hexer:      { scale: 0.98, parts: ['head', 'torso', 'legs'], radius: 0.46 },
  juggernaut: { scale: 1.22, parts: ['head', 'torso', 'legs'], radius: 0.62 },
  /**
   * W-B9 切片1 新增：幽暗林地 —— 迷雾缠绕的古老森林
   * 怨影/哨卫是悬浮体，掠行兽是贴地快速体
   */
  gloom_wraith:   { scale: 0.90, parts: ['head', 'torso'], radius: 0.40, hover: 0.7 },
  gloom_stalker:  { scale: 0.93, parts: ['head', 'torso', 'legs'], radius: 0.40 },
  gloom_sentinel: { scale: 1.02, parts: ['head', 'torso'], radius: 0.52, hover: 0.35 },
  /**
   * W-B9 切片1 新增：辉煌圣域 — 金色沙海中的光辉神殿
   * 爬兽贴地、骑士最重、舞者最轻
   */
  radiant_crawler: { scale: 1.00, parts: ['head', 'torso', 'legs'], radius: 0.48 },
  radiant_knight:  { scale: 1.20, parts: ['head', 'torso', 'legs'], radius: 0.60 },
  radiant_dancer:  { scale: 0.92, parts: ['head', 'torso', 'legs'], radius: 0.40 },
};

/**
 * `snap`：打击带与最近的受击分段之间允许的最大空隙（米）。
 * 超出才判空挥 —— 保留"高度差太大打不着"的真实感，但不让手感变成"莫名其妙免疫"。
 * 体型方案可逐类覆盖（玩家自己那一档就收紧了，见 `BODY_PLANS.player`）。
 */
export const HURTBOX = { snap: 0.9 };

/** 防御减伤：1 - def/(def+K)，def=K 时 50%；cap 保证不会出现"免疫"手感 */
export const MITIGATION = { K: 60, cap: 0.75 };

/**
 * 元素抗性，按敌人类型给出；未列出的类型视为无抗性。
 * 符号约定见 `Resolution`（并被它夹在 [-0.5, 0.9]）：**正数减这一系的伤，负数更吃**。
 */
export const ENEMY_RESIST = {
  soldier: { fire: 0, ice: -0.15 },
  golem:   { fire: 0.25, ice: 0.35 },
  elite:   { fire: 0.1, gravity: 0.2 },
  drone:   { gravity: -0.25 },
  boss:    { fire: 0.15, ice: 0.15, gravity: 0.3 },
  dummy:   {},
  /** 时线怨影：半透明的影子，怕火（-0.15 = 更吃这一系），引力法术反倒打不实 */
  wraith:  { fire: -0.15, gravity: 0.2 },
  /** 混沌掠行兽：贴地快体，引力坍缩吃得最实，冰系反倒削得动 */
  stalker: { gravity: -0.2, ice: 0.1 },
  /** 边境哨炮：装甲构装，火与重力都啃不动多少 */
  sentinel: { fire: 0.25, gravity: 0.15 },
  /** 虚空爬兽：裂隙里爬出来的冷血东西，怕冰；硬壳挡得住一点引力伤害 */
  crawler: { ice: -0.25, gravity: 0.15 },
  /** 深渊骑士：重甲，火与冰都啃不动 */
  knight: { fire: 0.2, ice: 0.2 },
  /** 刃舞者：轻装快体，冰与引力都啃得动 —— 负数在这一张表里是"更吃这一系"（见上面 `ENEMY_RESIST` 的符号约定） */
  dancer: { gravity: -0.2, ice: -0.1 },
  /** 位面咒师：长袍术士，怕火；冰系打在他自己的护体咒上不痛不痒 */
  hexer: { fire: -0.2, ice: 0.2 },
  /** 破阵重兵：全身板甲，火与冰都不好使 —— 撬它靠的是架势与走位，不是属性 */
  juggernaut: { fire: 0.15, ice: 0.25 },
  /** W-B9 幽暗林地：幽暗怨影怕火（更吃），重力打不实 */
  gloom_wraith: { fire: -0.15, gravity: 0.2 },
  /** W-B9 幽暗林地：幽暗掠行兽贴地快体，引力吃得实，冰系削得动 */
  gloom_stalker: { gravity: -0.2, ice: 0.1 },
  /** W-B9 幽暗林地：幽暗哨卫装甲构装，火与重力都啃不动多少 */
  gloom_sentinel: { fire: 0.25, gravity: 0.15 },
  /** W-B9 辉煌圣域：辉煌爬兽裂隙爬出的冷血东西，怕冰；硬壳挡一点引力 */
  radiant_crawler: { ice: -0.25, gravity: 0.15 },
  /** W-B9 辉煌圣域：辉煌骑士重甲，火与冰都啃不动 */
  radiant_knight: { fire: 0.2, ice: 0.2 },
  /** W-B9 辉煌圣域：辉煌舞者轻装快体，冰与引力都啃得动 */
  radiant_dancer: { gravity: -0.2, ice: -0.1 },
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

/**
 * 面板内导航的自动重复（W-A7 切片18）—— 按住方向键会连着走格 / 连着推滑杆。
 *
 * 改前按住 ↓ 也只走一格：派发只认边沿（切片3 立的规矩，改的是"按住 Tab 把区域面板抖成筛子"）。
 * 那条规矩对**开关类**动作是对的，对"走一格"是错的 —— 没有哪个界面的方向键不连发。
 * 于是"哪些动作许连发"是一份名单（`hotkeys.js` 的 `UI_NAV_ACTIONS`，不另立第二份），
 * "多快"是这里的两个数，而唯一读它的人是 `ui/HotkeyRouter.poll(keys, dt)`。
 * 键盘与手柄共用这一个节奏：十字键只是把借来的那一格键按住不放，桥不自己数帧。
 *
 * - `delay`：按下到第一次连发的等待。0.42 秒够看清焦点跳去了哪一格，又短于会开始不耐烦的时长
 * - `interval`：之后每格的间隔，0.1 秒 = 每秒 10 格（长列表一按到位，也不快到跟不上眼睛）
 *
 * 两个数都按**秒**算、吃 `rawDt`：重复节奏是玩家手上的事，命中停顿与慢动作不该把手冻住
 * （与震屏、镜头同一条纪律，B39）。`TimeController.maxDelta` 把一帧夹在 0.05 秒，
 * 只要 `interval` 不比它小，一帧就最多推进一步 —— 掉帧不会攒出一串"补发"的移焦。
 */
export const NAV_REPEAT = { delay: 0.42, interval: 0.1 };

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
 * 手柄震动 —— "这一次打击多重"折算到两个马达（`engine/Rumble.js` 是唯一消费者）。
 *
 * 为什么另开一张表而不是复用 `SHAKE`：相机抖的是位移、马达抖的是幅度与时长，
 * 两者的量纲本来就不同；但**请求入口只有一个** —— 各系统照旧调 `addShake(intensity)`，
 * 同一条强度顺路喂给震动。若让每个调用点各写一份 `strongRumble` 数字，"这次算重击还是轻击"
 * 就又长成两处（B36 那一族：同一条算式抄两处），而这里想钉的正是"打击感只有一个决定"。
 *
 * - `bands`：从小到大第一档落点（`intensity <= at` 取那一档），`at: null` 是兜底最后一档
 *   —— 单调不许回头：轻的一下比响的那下还猛，就是玩家读不出发生了什么
 * - 档内三格就是浏览器 `playEffect('dual-rumble', …)` 的 `strongMagnitude / weakMagnitude / duration`
 *   （强马达掌根、弱马达扳机指；只有 dual-rumble 这一种形状是跨平台事实标准）
 */
export const RUMBLE = {
  bands: [
    { at: 0.05, strong: 0.15, weak: 0.08, ms: 55 },
    { at: 0.10, strong: 0.32, weak: 0.18, ms: 85 },
    { at: 0.18, strong: 0.55, weak: 0.35, ms: 120 },
    { at: null, strong: 0.85, weak: 0.62, ms: 170 },
  ],
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
  wraith: 4, stalker: 3, sentinel: 14,
  crawler: 8, knight: 22, dancer: 6,
  hexer: 8, juggernaut: 24,
  gloom_wraith: 4, gloom_stalker: 3, gloom_sentinel: 14,
  radiant_crawler: 8, radiant_knight: 22, radiant_dancer: 6,
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
 *   `ranged.count` > 1 时一次交出多枚（`spreadDeg` 是绕弹道轴摊开的半角），落点由
 *   `fanTargets` 纯几何算（无随机）：铺一个扇面，横移半步躲不掉，要真的走出那个角
 * - `unstoppable: true`：霸体 —— 这一招的**出手段**（windup/strike）不吃硬直、也不可弹反。
 *   架势照常累积（打满只是不落地），所以躲法只有一个：走出它的判定形状。
 *   走完 recover 之后第一下照常能按进硬直 —— 霸体护的是这一招，不是这条命
 * - `phase: true` + `blink`：相位招 —— `blink` 是它**够不够得着才起手**的距离（"能闪多远"），
 *   命中段把自己挪到目标背后 `reach` 之内再劈。两个数分开写：把 `blink` 当 `reach` 用，
 *   十米外起手的那一刀会隔着十米命中（一个数同时当"够得着"和"打得到"用，迟早分家）
 * - `standoff`：**站位诉求**（可选，`[近, 远]` 米）—— "这一招我想从多远用"。它不改"够不够得着"
 *   （那是 `range` / `reach` / `blink` 的事），改的是**要不要先走到甜点位再出手**：距离落在这个带里
 *   且这招够得着时，敌人当场起手，而不是先贴到你脸上。近战招不写这一格（它们的诉求已经写在 `reach` 里）；
 *   只有"身体是近战、手里却有一招远距形状"的敌人才需要它 —— 见 `rift`（B69）
 * - `telegraph`：预警分级。**只有颜色** —— 圈画多大由 `Enemy.teleRadius()` 从 `moveRange` / `aoe`
 *   现算（那个数同时就是"够不够得着"，两处各写一个半径迟早对不上，而对不上时错的是圈）。
 *   前摇 ≥ `AI.telegraphMarkWindup` 的招另外多一枚头顶旋转警示，那是"慢重招"的分级，同样不看本字段
 */
export const ENEMY_MOVES = {
  sweep: {
    name: '横扫', windup: 0.75, strike: 0.35, recover: 0.45, reach: 0.8, cone: 0.10,
    band: [0.05, 1.05],
    damage: 1.0, cooldown: 1.5, weight: 3,
    telegraph: { color: 0xff3322 },
  },
  thrust: {
    name: '突刺', windup: 0.42, strike: 0.24, recover: 0.34, reach: 1.3, cone: 0.45,
    band: [0.6, 1.7],
    damage: 0.8, cooldown: 1.2, weight: 3, travel: 'lunge', travelSpeed: 3.2,
    telegraph: { color: 0xffcc33 },
  },
  cleave: {
    name: '重劈', windup: 1.05, strike: 0.34, recover: 0.66, reach: 0.7, cone: -2,
    band: [1.1, 2.7],
    damage: 1.7, cooldown: 2.8, weight: 1,
    telegraph: { color: 0xaa22ff },
  },
  slam: {
    name: '崩地', windup: 1.15, strike: 0.30, recover: 0.80, cone: -2, aoe: 3.6,
    band: [0.0, 0.9],
    damage: 1.6, cooldown: 3.4, weight: 1,
    telegraph: { color: 0xff2200 },
  },
  flurry: {
    name: '三连刺', windup: 0.55, strike: 0.18, recover: 0.30, reach: 1.1, cone: 0.35,
    band: [0.55, 1.6],
    damage: 0.55, cooldown: 2.4, weight: 2, combo: 3, comboWindup: 0.3,
    travel: 'lunge', travelSpeed: 2.2,
    telegraph: { color: 0xff8844 },
  },
  shot: {
    name: '虚能弹', windup: 0.85, strike: 0.20, recover: 0.55, cone: -2,
    range: 13, minDist: 4.0,
    damage: 0.9, cooldown: 2.0, weight: 2, ranged: { speed: 14, color: 0x66ddff },
    telegraph: { color: 0x33ccff },
  },
  dive: {
    // reach 比横扫长一档：让无人机在"弹体中段"就能扑，而不必贴脸才打得着（见 holdRangeOf）
    // band 是负数起：无人机的网格原点就是它的"脚"（悬停 0.9 米），俯冲是往自己脚下扑
    name: '俯冲', windup: 0.38, strike: 0.22, recover: 0.28, reach: 3.3, cone: 0.20,
    band: [-0.6, 1.0],
    damage: 0.7, cooldown: 1.4, weight: 2, travel: 'lunge', travelSpeed: 4.2,
    telegraph: { color: 0xffdd55 },
  },
  guard: {
    // 防御招：前摇是"举盾"，命中段不打人而是持续格挡正面伤害（`GUARD`），收招才是被绕后的代价。
    // reach 必须落在本招集合里最长那招的落点之内（突刺 1.3），又不能短到敌人平时站的地方：
    // 写成 0 时它只在贴脸 2.2 米内可选，而士兵实测停在 2.9 米 —— 整条格挡链路从不触发。
    name: '格挡', windup: 0.5, strike: 1.5, recover: 0.55, reach: 0.9, cone: -2,
    damage: 0, cooldown: 6.5, weight: 1, guard: true,
    telegraph: { color: 0x66aaff },
  },
  summon: {
    // 召唤招：命中段不打人，而是交出仆从（名额与生命周期见 `SUMMON`）。
    // 前摇是全场最长的一档 —— 念咒必须看得见，也必须来得及被弹反/打断。
    name: '召唤', windup: 1.4, strike: 0.25, recover: 0.7, reach: 0.9, cone: -2,
    damage: 0, cooldown: 11, weight: 1, summon: { type: 'soldier', count: 2 },
    telegraph: { color: 0x66ff99 },
  },
  phase: {
    // 相位突袭（时线怨影，W-B7 切片2）：起手站在原地蓄势，命中段**直接落到玩家背后**再劈。
    // 为什么不是一个"更长的突刺"：这一招的威胁是**出刀在背后** —— 落点越过目标 `reach` 米，
    // 于是正面架好的那一套（朝向、格挡弧、站位距离）全部错位，这是表里其余九招都没有的性质。
    // `blink` 与 `reach` 各管一头（见文件头）：11 米内可起手，落地之后这一刀仍是近战那 1.2 米。
    // 反制是**落地之后**那 0.5 秒收招：落点取你此刻站的地方，所以躲法不是"提前跑开"，
    // 是"看见它闪到背后再翻滚"（0.7 秒前摇是给你读懂它的，不是给你跑到安全区的）。
    // **没有 `minDist`**（这条是实测出来的，不是省事）：`minDist` 是给"弹体糊脸"那种放风筝招
    // 用的，而这一招的伤害段是近战那一档（`landRange` = attackRange + reach）。写上一个最小
    // 距离的后果是怨影的甜点位（`holdRangeOf` 选的 3.0 米，正好等于那一格）与追击的收脚余量
    // （每帧 0.1 米，必然越过一点）把它挤到窗口外 —— 90 秒 42 次出手里它一次都没被选中。
    name: '相位突袭', windup: 0.7, strike: 0.3, recover: 0.5, reach: 1.2, cone: 0.35,
    band: [0.05, 1.05], phase: true, blink: 11,
    damage: 1.1, cooldown: 3.2, weight: 2,
    telegraph: { color: 0xaa55ff },
  },
  charge: {
    // 蓄力炮击（边境哨炮，W-B7 切片2）：全场最长的前摇换最重的一发。
    // 与 `shot` 的差别不是"同一发的加强版"：判定读的是**玩家看不看得出这一发不能硬吃** ——
    // 前摇 1.7 秒（全场最长）、弹速 24（虚能弹 14）、冷却 7.5 秒，够读完再翻滚。
    // 圈不在这条差别里：远程招的圈一律是 `attackRange`（`teleRadius`），两条一样大 ——
    // "更显眼"靠的是这 1.7 秒前摇（头顶警示亮满 1.1 秒）与那一发本身的弹速。
    name: '蓄力炮击', windup: 1.7, strike: 0.22, recover: 0.9, cone: -2,
    range: 16, minDist: 4.5,
    damage: 2.4, cooldown: 7.5, weight: 1, ranged: { speed: 24, color: 0xffbb33 },
    telegraph: { color: 0xff8800 },
  },
  howl: {
    // 嚎叫引援（混沌掠行兽，W-B7 切片2）：不是打人的招（`damage: 0`），命中段呼来两只同类。
    // 冷却取全场最长（15 秒）：把"一对二"变成"一对四"的招，频率必须低到玩家清得完场，
    // 否则掠行兽群自己就是一台永动的增援机（名额上限只挡"同时在场的总数"，挡不住"永远刷不完"）。
    name: '嚎叫引援', windup: 1.2, strike: 0.25, recover: 0.6, reach: 0.9, cone: -2,
    damage: 0, cooldown: 15, weight: 1, summon: { type: 'stalker', count: 2 },
    telegraph: { color: 0x99ff55 },
  },
  rift: {
    // 裂隙（虚空爬兽，W-B7 切片3）：命中段不打人，而是**把这块地许诺出去** ——
    // 在玩家脚下交出一个危险区（`hazards.spawn`），圈的生命周期与施法者**解耦**：
    // 打死它，圈照样落下。这正是 `aoe` 招做不到的事（圈长在敌人脚下、它一死整招消失），
    // 也是这一族与 `slam` 的分界线：`slam` 是"别站我旁边"，`rift` 是"别站你刚才那块地"。
    // `damage` 是**乘数**（`Enemy.damage × 它`），与世界其余招的写法一致，绝对伤害在落地那一帧算。
    // `range` 是"圈能丢多远"：丢得到才起手，不是刀有多长（`moveRange` 认这一格）。
    // `standoff`（B69）：`range: 7` 是"圈能丢多远"，但光有它决定不了敌人**会不会站远了用** ——
    // 站位由"同时可出的招最多"那条边界决定，两招近战（3.3 米）会把它顶到爬兽脸上，
    // 于是这一招的 7 米在实战路径上一次也没用上（实测起手 3.25 米、20 秒里连丢三次都在脸上）。
    // 4.5 米这一头是"圈半径 2.6 + 一步身位"：再近就该用近战了；另一头就是它自己的射程。
    name: '裂隙', windup: 1.05, strike: 0.28, recover: 0.7, cone: -2,
    damage: 0, cooldown: 8.5, weight: 2, range: 7, standoff: [4.5, 7],
    hazard: { radius: 2.6, telegraph: 1.1, damage: 0.6, duration: 4, tick: 0.8, color: 0x9ade55 },
    telegraph: { color: 0x9ade55 },
  },
  bash: {
    // 盾击（深渊骑士，W-B7 切片3）：近战那一刀之外多一步"把人推开"。
    // 推开走玩家的**外部冲量账**（`applyKnockback`），不写 `velocity` —— 与引力井同一条纪律：
    // 写速度会被玩家的状态机每帧改写回来，"被推开"就退化成"按住方向键"。`knock` 是初速（米/秒）。
    name: '盾击', windup: 0.62, strike: 0.26, recover: 0.5, reach: 0.9, cone: 0.2,
    band: [0.05, 1.15],
    damage: 1.1, cooldown: 3.6, weight: 2, knock: 7.5,
    telegraph: { color: 0x88aaff },
  },
  whirl: {
    // 旋舞（刃舞者，W-B7 切片3）：以自己为中心的**三段环形斩** —— `aoe` 与 `combo` 第一次合在一条招上。
    // 单段的 `aoe`（崩地）后撤一步就出去了；三段之间不给"退一步再退回来"的空档，
    // 想躲只能真的跑出这个圈。段与段之间不换人、不交名额（连段本来就是同一坑）。
    name: '旋舞', windup: 0.5, strike: 0.22, recover: 0.45, cone: -2, aoe: 2.8,
    band: [0.0, 1.0],
    damage: 0.5, cooldown: 4.2, weight: 2, combo: 3, comboWindup: 0.26,
    telegraph: { color: 0xff66cc },
  },
  volley: {
    // 扇形齐射（位面咒师，W-B7 切片4）：一次交出**多枚**弹体，绕弹道轴摊成一个扇面。
    // 与 `shot` 的分界不是"更疼"，是**覆盖面** —— 单发只要横移半步就出线，扇面要真的
    // 走出那个角。单发伤害压到 `shot` 的三分之二：三发全吃比一发便宜，"躲开一部分"
    // 才是这一招正确的读数。落点 `fanTargets` 纯几何、无随机，回归用例能逐点断言。
    name: '扇形齐射', windup: 1.0, strike: 0.24, recover: 0.7, cone: -2,
    range: 15, minDist: 4.5,
    damage: 0.6, cooldown: 5.5, weight: 2,
    ranged: { speed: 16, color: 0x9be7ff, count: 3, spreadDeg: 22 },
    telegraph: { color: 0x9be7ff },
  },
  onslaught: {
    // 破阵冲撞（破阵重兵，W-B7 切片4）：表里第一条**霸体**招 —— 出手段（windup/strike）
    // 不吃硬直、也不可弹反。为什么值得单立一条形状：其余每一招都能被"架势打满"打断，
    // 于是"破防 → 处决"是万能解；这一招把那个万能解按住一秒多，逼玩家改用走位。
    // 代价写在数据上：前摇 0.95 秒（头顶警示亮满）、命中段短（0.3）、收招长（0.85）——
    // 躲开之后那 0.85 秒就是它的窗口。霸体护的是这一招，不是这条命：走完 recover 的
    // 第一下照常按进硬直（架势在霸体期间照常累积，只是不落地）。
    name: '破阵冲撞', windup: 0.95, strike: 0.30, recover: 0.85, reach: 1.0, cone: -1,
    band: [0.05, 1.6],
    damage: 1.6, cooldown: 6.5, weight: 2, travel: 'lunge', travelSpeed: 5.5,
    unstoppable: true,
    telegraph: { color: 0xff5533 },
  },
  /** W-B9 切片1：辉煌圣域专属招式 */
  flare: {
    // 圣光爆（辉煌爬兽）：命中段在玩家脚下召唤一团圣光，延迟 1 秒后爆发光环伤害。
    // 与 `rift` 不同：圈在玩家身边**留存**且会随玩家移动（粘着），需主动冲出光环。
    // `hazard` 型：伤害由 GroundHazards 独立结算，爬兽死后光环仍存续到 duration 结束。
    name: '圣光爆', windup: 1.1, strike: 0.3, recover: 0.7, cone: -2,
    damage: 0, cooldown: 9, weight: 2, range: 8, standoff: [5, 8],
    hazard: { radius: 3.0, telegraph: 1.2, damage: 0.7, duration: 5, tick: 1.0, color: 0xffdd00, sticky: true },
    telegraph: { color: 0xffdd00 },
  },
  sanctify: {
    // 圣洁冲击（辉煌骑士）：盾击的光辉变体 —— 推开玩家的同时在原地留下一圈治愈光环。
    // `knock` 推开玩家（外部冲量），`healZone` 在骑士脚下生成治疗区（玩家进入回血，敌人不受益）。
    // 迫使玩家二选一：吃推开、或冒险进光环续血但被骑士贴脸压制。
    name: '圣洁冲击', windup: 0.65, strike: 0.28, recover: 0.55, reach: 1.0, cone: 0.25,
    band: [0.05, 1.2],
    damage: 1.0, cooldown: 4.0, weight: 2, knock: 8.0,
    healZone: { radius: 3.5, healPerTick: 8, tick: 1.0, duration: 6 },
    telegraph: { color: 0xffee88 },
  },
  gleam: {
    // 晨曦旋舞（辉煌舞者）：以自己为中心的**四段扇形光刃** —— `aoe` 与 `combo` 合体，且每段角度不同。
    // 单段 `aoe` 3.2 米扇形 120°；四段转向累计覆盖 360°，中间没有"退一步再回来"的安全窗口。
    // 想躲只能真的跑出整个光刃覆盖区。四段之间不换人、不交名额。
    name: '晨曦旋舞', windup: 0.48, strike: 0.2, recover: 0.42, cone: -2, aoe: 3.2, fanDeg: 120,
    band: [0.0, 1.1],
    damage: 0.45, cooldown: 4.5, weight: 2, combo: 4, comboWindup: 0.24,
    telegraph: { color: 0xffcc00 },
  },
  /** W-B9 切片1：幽暗林地专属招式 */
  haunt: {
    // 幽灵缠身（幽暗怨影）：相位突袭的迷雾变体 —— 闪到玩家身后留下一道"残影"，持续追踪玩家 3 秒。
    // `blink` 越过玩家落在背后，`trail` 在原地生成残影（不攻击、只干扰锁定、视线判定视为障碍）。
    // 玩家需在残影消失前解决它，或利用残影挡住其他敌人的视线。
    name: '幽灵缠身', windup: 0.75, strike: 0.35, recover: 0.55, reach: 1.2, cone: 0.35,
    band: [0.05, 1.05], phase: true, blink: 10,
    damage: 1.0, cooldown: 3.8, weight: 2,
    trail: { duration: 3, radius: 0.5, blocksSight: true, color: 0x4a4a6a },
    telegraph: { color: 0xaa66ff },
  },
  prowl: {
    // 潜行标记（幽暗掠行兽）：嚎叫引援的迷雾变体 —— 不召唤同类，而是给玩家打上"被标记"状态。
    // `mark` 状态下：玩家受到的伤害 +20%、被所有幽暗林地敌人优先锁定、隐身/潜行无效。
    // 持续 10 秒或击杀标记者后解除。迫使玩家主动猎杀标记者而非逃跑。
    name: '潜行标记', windup: 1.0, strike: 0.25, recover: 0.6, reach: 0.9, cone: -2,
    band: [0.0, 1.0],
    damage: 0, cooldown: 12, weight: 1,
    mark: { duration: 10, damageTakenMult: 1.2, priorityTarget: true, revealStealth: true, color: 0x4a4a7a },
    telegraph: { color: 0x99dd55 },
  },
  beacon: {
    // 信标照亮（幽暗哨卫）：蓄力炮击的迷雾变体 —— 发射一枚信标弹，落地后生成持续照明区。
    // 区域内：玩家隐身/潜行失效、所有幽暗林地敌人获得"视野共享"（无视遮挡直接锁定玩家）。
    // 信标持续 8 秒，可被玩家攻击摧毁（hp 30）。迫使玩家要么摧毁信标、要么冒险在光下战斗。
    name: '信标照亮', windup: 1.8, strike: 0.25, recover: 1.0, cone: -2,
    range: 18, minDist: 5,
    damage: 0, cooldown: 8, weight: 1,
    ranged: { speed: 12, color: 0x6a6a8a },
    beacon: { radius: 6, duration: 8, revealStealth: true, shareVision: true, hp: 30, color: 0x6a6a8a },
    telegraph: { color: 0x88aaff },
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
  /**
   * 处决演出开启景深（DoF）时的最大模糊量 —— W-C4 余量。
   * 焦点钉在被处决者（本帧注视点），模糊量随镜头包络呼吸（0 → 全开 → 0），
   * 所以它同时是"开多糊"与"淡入淡出的峰值"。0.65 比 BokehPass 默认的 1.0 收一档：
   * 演出是要看动作的，背景虚到认不出环境就过头了。
   */
  dofMaxblur: 0.65,
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
 * 非锁定态挥砍的瞄准磁吸 —— W-A5 切片3。
 *
 * 未锁定出手时，把这一刀的命中判定对"最接近准星、但刚好在挥砍锥外的那**一个**敌人"
 * 放行：在它落入 [本次锥角, 本次锥角 + `extraDeg`] 的宽容带、且在 `range` 内时补判命中。
 * 只补最对准心的一个目标，于是它是一次**纯宽容**（只会多打中、绝不会少打中），
 * 也不改变竖直 band、不污染背刺/格挡判定（那些仍按真实位置算）。
 *
 * 锁定态（`lockTarget`）与全向招（`cone <= -1`）不参与：前者已按真实目标结算、后者本就全周。
 *
 * 注：本作基础挥砍锥已很宽（`light.cone=0.12`≈半角 83°），所以 `extraDeg` 取小值即可 ——
 * 它补的是"贴在你侧前方、几乎垂直方向上的那一个"，不是把挥砍变成 360°。整包可经 `enabled`
 * 关闭，正式手感数值随 W-B1 数据化。
 */
export const AIM_ASSIST = { enabled: true, extraDeg: 10 };

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
/**
 * 场地红圈（B5 第一档）—— 施法者画完圈就可以离场，伤害照旧在原地落下。
 *
 * 与招式表里的 `slam`（崩地）不是一回事：那一招的危险圈长在敌人脚下，敌人被打断圈就跟着没了；
 * 红圈一旦画出口就独立存在，玩家要么在 `telegraph` 内走出去，要么被它逼开走位。
 * 后续场地机制（弹幕落点 / 引力井 / 时停域）都从这套生命周期长出来，所以数值先集中在这里。
 *
 * `radius` 同时是**伤害半径**与**预警圈最终长到的半径**：写成两个数迟早对不上，
 * 而圈说谎的代价是玩家没法用眼睛读招 —— 旧实现正是这么坏的（判定 4.5 米，圈却在前摇里
 * 一路从 4 米涨到 18 米）。
 */
export const GROUND_HAZARD = {
  bossSlam: { radius: 4.5, telegraph: 1.2, damage: 35, color: 0xff2200, recover: 2.5 },
  /**
   * 落点圈阵列（弹幕档）的**形状**：一次铺 `count` 枚，第 i 枚的前摇是
   * `telegraph + i * stagger`、离心 `spread * sqrt((i+0.5)/count)` —— 由内向外依次落地。
   * 数值口径：`spread` 5 / `radius` 3 时，原地不动会吃到内圈那两枚，起手就跑能在第一枚
   * 落下前脱出整片（一枚圈只值 20 点，站住连吃才是疼的地方）。
   *
   * **"谁在什么时候铺、多久一次、离多远才肯铺"不在这里** —— 那是 `content/arenaScripts.js`
   * 的脚本表（每个 Boss 不同：奥术师 7 秒 24 米、引力化身 9 秒 22 米）。分成两份的界线是
   * "改了它所有调用方都该跟着变"的留在这份（圈多大、掉多少血），逐 Boss 不同的走那张表。
   * `bossSlam.recover` 是例外：它是这一招收招动作本身的一部分（Boss 打完要站那儿多久），
   * 不是"多久愿意打一次"，所以留在形状档里。
   */
  barrage: {
    count: 5, radius: 3, damage: 20, color: 0xcc44ff,
    telegraph: 1.5, stagger: 0.35, spread: 5,
  },
  /**
   * 引力井（持续型危险区）：落地一击定音之后**还在地上待 `duration` 秒** ——
   * 每 `tick` 秒对圈内补一段 `damage`，同时按 `pull`（米/秒²）把人往圆心加速。
   * 数值口径：`damage 6 × (1 次落地 + 3/0.6=5 段) = 36`，与一次砸地同量级，
   * 差别在于这 36 点是摊在 3 秒里 —— 站着不动必死，但代价是"走出 5.5 米"，
   * 而不是"看准一瞬间躲开"。
   *
   * `pull` 买的是**"停下"**，不是"跑不动"：走玩家的**外部冲量账**（`applySustainedForce`），
   * 稳态速度 = `pull / PLAYER_KNOCK.decay` ≈ 0.73 米/秒（实测：站住一秒被拖约 0.66 米；
   * 按住背离方向仍能以约 14.3 米/秒退出，一秒少走 0.7 米）。
   * 切片4 之前它是直接加在 `playerRef.velocity` 上的，而状态机在有输入时整条改写水平速度，
   * 所以"按住方向键"每一帧都把拉力抹干净 —— 那口井只对撒手站着的人生效。
   */
  gravityWell: {
    radius: 5.5, telegraph: 1.4, damage: 6, color: 0x4488ff,
    tick: 0.6, duration: 3, pull: 8,
  },
  /**
   * 时停域（B5 第四档）：**不掉血，改时标**。`damage: 0` 是这一档的定义而不是"忘了填" ——
   * 它买的是"你在这块地上跑不动"，把这份迟缓兑成血的是砸地/弹幕/井那三档。
   * 躲法与井同一条（走出 6 米立刻还你速度），代价不同：井收血，这里收机动。
   *
   * `slow 0.3` 比时线执政官那记**无场**的时停（`timeSlow 0.35`）更狠一档：
   * 有场的惩罚必须比没场的更看得见，两条同时在身上时吃更强的那份（`applyTimeScale` 取最小值）。
   * 颜色与它本体的金色发光同族（`0xc9a962`），跟井的蓝、弹幕的紫分开。
   */
  chronoField: {
    radius: 6, telegraph: 1.1, damage: 0, color: 0xc9a962,
    tick: 0, duration: 3.6, slow: 0.3,
  },
  /** 起手时圈只画到最终半径的这个占比，随前摇线性涨满 */
  growFrom: 0.25,
  /** 落下后余像的淡出时长：纯表现，期间不再判伤害 */
  linger: 0.3,
  /** 圈贴地抬高量：与地形同高会被 Z-fighting 吞掉 */
  yOffset: 0.15,
  opacity: { warn: 0.5, pulse: 0.18, burst: 0.72 },
};

/**
 * 时标"绳子"的长度（秒）—— 凡是要往玩家身上挂减速的东西（时停域、时线执政官那记无场时停），
 * 都是**每帧续一次绳**，续不上就在这这么短的时间里自己到期。
 *
 * 为什么要有这么一条：旧写法是直接写 `playerRef.timeSlow = 1` 来还原，而写者往往只有
 * "自然到期"那一条还原路径（`VoidBoss` 的打断与死亡两条都漏了，玩家被永久留在 0.35）。
 * 续绳模型里最坏的失败是"多慢 0.12 秒"。0.12 ≈ 60Hz 下七帧：够跨过偶发掉帧，
 * 又不至于"走出圈还多慢一截"。**它不是任何一招的时长**，别拿它当冷却调。
 */
export const TIME_SCALE_LEASH = 0.12;

/**
 * 玩家侧的**外部冲量账**（被拽、被推）—— 与 `Enemy.knock` 同一套模型，但归玩家自己所有。
 *
 * 为什么要单独一本账：状态机在有输入时是**整条改写**水平速度的
 * （`PlayerController.moveHorizontal` 里 `velocity = dir * speed`），所以任何直接写进
 * `velocity` 的外力都会在下一帧被玩家的按键抹掉 —— 引力井的真实症状就是"按住方向键等于没有引力"。
 * 外力记在另一本账上：玩家的意图与外力的偏移各自衰减、相加之后再积分。
 *
 * - `decay`：偏移速度的指数衰减率（每秒）。取 `HIT.decay` 同档（11），这样"我把敌人推一下"
 *   与"场把我拽一下"在两边衰减得一样快。连续拉力（`pull` 是米/秒²）的稳态速度 = `pull / decay`：
 *   引力井的 `pull 8` 稳在约 0.73 米/秒，而玩家移速 15 —— 有感、但不夺走控制权。
 * - `maxSpeed`：这本账的封顶（米/秒）。多来源叠加（两口井 + 一记撞击）不许把玩家弹射出去。
 */
export const PLAYER_KNOCK = {
  decay: 11,
  maxSpeed: 14,
};

export const ENEMY_MOVE_SETS = {
  soldier: ['sweep', 'thrust', 'cleave', 'guard'],
  elite: ['sweep', 'flurry', 'cleave', 'guard', 'summon'],
  golem: ['cleave', 'slam', 'sweep'],
  drone: ['shot', 'dive', 'sweep'],
  dummy: [],
  boss: ['sweep', 'cleave', 'slam', 'shot'],
  default: ['sweep', 'thrust', 'cleave'],
  /** W-B7 切片1：怨影俯冲接突刺；掠行兽连爪贴脸；哨炮远程压制兼守势 */
  /** W-B7 切片2：每类配一条**只有它有**的招（相位突袭 / 嚎叫引援 / 蓄力炮击） */
  wraith: ['phase', 'dive', 'thrust', 'sweep'],
  stalker: ['flurry', 'howl', 'thrust', 'cleave'],
  sentinel: ['charge', 'shot', 'guard', 'cleave'],
  /** W-B7 切片3：三类各配一条**只有它有**的招（裂隙 / 盾击 / 旋舞） */
  crawler: ['rift', 'flurry', 'thrust'],
  knight: ['bash', 'sweep', 'guard', 'cleave'],
  dancer: ['whirl', 'flurry', 'thrust'],
  /** W-B7 切片4：此前各只有一类原生敌人的两座位面各补一类 */
  hexer: ['volley', 'shot', 'guard'],
  juggernaut: ['onslaught', 'slam', 'cleave', 'guard'],
  /** W-B9 切片1：幽暗林地三类敌人 */
  gloom_wraith: ['haunt', 'dive', 'thrust', 'sweep'],
  gloom_stalker: ['prowl', 'flurry', 'thrust', 'cleave'],
  gloom_sentinel: ['beacon', 'shot', 'guard', 'cleave'],
  /** W-B9 切片1：辉煌圣域三类敌人 */
  radiant_crawler: ['flare', 'flurry', 'thrust'],
  radiant_knight: ['sanctify', 'sweep', 'guard', 'cleave'],
  radiant_dancer: ['gleam', 'flurry', 'thrust'],
};

