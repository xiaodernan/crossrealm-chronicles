/**
 * 游戏事件登记表 —— 规范第 4 条要求的「既定事件」唯一真源（修 B44）。
 *
 * 为什么要这张表：`window.dispatchEvent(new CustomEvent('...'))` 与
 * `window.addEventListener('...')` 两侧各抄一遍事件名，抄错一个字符不会报错，
 * 只是**下游永远不再被叫醒**。本切片动手前抓到的两个活病例都在这张表里：
 * - `CgGallerySystem` 监听 `dungeon-room-clear`，`DungeonManager` 派发的是
 *   `dungeon-room-cleared` —— 差一个 `d`，「副本清房」这张 CG 从此不可能解锁。
 * - `VoidBoss` 在时停结束时派发 `time-stop-end`，全仓无人监听 —— HUD 把区副标题
 *   写成「⏳ 时停中」后就没有回去的路径。
 * 这两条都不是风格问题，是内容静默消失。
 *
 * 这张表**不接管派发**（那是切片6 的 `on()/emit()/offAll()`）。它现在的职责是：
 * 被 `tests/event-registry.test.js` 双向对齐 ——
 *  ① 代码里出现的每个自定义事件名都必须在这里；
 *  ② 这里的每个名字都必须在代码里真的被生产或被消费，不许留死条目；
 *  ③ `payload: null` ⇔ 没有任何派发位点带 `detail`；
 *  ④ 标了 `hook` 的 ⇔ 仓库内没有监听者（并写明"为什么没人听也不影响表现"）。
 * 任何一条偏离都会变红，所以这张表不会烂成一份过时的注释。
 *
 * 字段口径：
 * - `desc` 只写**代码里看不出来的东西**（意图、为什么这么分、给谁用）。
 *   生产者/消费者清单由门禁从代码算，写在这里必然漂移，所以不写。
 * - `payload` 是 `detail` 的顶层形状；`null` 表示这条事件只是个信号。
 *   列出的键是**所有派发位点的并集**，单个位点不一定全都带（`combat-hit` 四处里
 *   只有一处带负载），也可能有派发方至今没给的键（`rest-npc-greet` 的 `gesture`）。
 *   所以消费侧一律按可选读：`e.detail?.x ?? 默认值`。键级别的精确校验要等切片6
 *   把派发收进 `emit()` —— 那时有一个真正的运行时咽喉，不必靠静态猜。
 */

/** 事件名 → 契约。冻结：改它 = 改代码，必须显式。 */
export const GAME_EVENTS = Object.freeze({
  /* ———— 世界与区域 ———— */
  'zone-changed': {
    desc: '当前区域切换。zoneId 是稳定身份、zone 是区域对象；initial 只在世界构建后第一次进入时出现，用来跳过开场横幅',
    payload: '{ zone, zoneId, initial }',
  },
  'textures-ready': {
    desc: '世界贴图就位，场景增强与树贴图要在这之后才 apply',
    payload: '{ texLib }',
  },
  'realm-bleed': {
    desc: '进入新区域 tint 真的变了才脉冲一次；HUD 拿它顶掉区副标题，音频拿它铺环境音',
    payload: '{ zone, key }',
  },
  'discovery': {
    desc: '探索点首次被触发。id 必须等于 POI 的稳定 id（B45 的契约），HUD/图鉴/成就/任务都挂这条',
    payload: '{ id, title, text, category }',
  },
  'poi-interact': {
    desc: '玩家与兴趣点交互（不论是否首次）。任务系统的 interact 目标按 id 认领',
    payload: '{ id }',
  },
  'npc-talk': {
    desc: '与 NPC 交谈，任务系统据此推进 talk 目标。任务助手面板只补 id（它是"直接达成"那条路径），线出的对话文本走 NPCManager',
    payload: '{ id, line, chapter }',
  },
  'choice-made': {
    desc: '玩家做了一次抉择（W-E3 切片18）。任务系统据此把那个 flag 记进账本（quests.stats.decisions），并按当前这一步的判据推进主线',
    payload: '{ flag }',
  },
  'chest-opened': {
    desc: '宝箱开启，只带箱子 id；掉落由 CollectibleManager 自己给',
    payload: '{ id }',
  },
  'soul-wisp-collected': {
    desc: '位面残响吸收。魂火与提示由派发方自己完成',
    payload: '{ id, souls }',
    hook: '派发方（SoulWispManager）已就地加魂火、播音效、弹提示，并紧跟着派发一条 discovery —— 这条是给外部统计/将来遥测的出口，仓库内无监听点',
  },
  'pop-culture-echo': {
    desc: '致敬地物触发了它自己的回声演出，由 PopCultureEchoSystem 汇总成日志',
    payload: '{ trigger }',
  },
  'pop-culture-unlocked': {
    desc: '致敬条目解锁（含次元回声）',
    payload: '（整体转发致敬条目对象：id / title / desc / franchise）',
  },
  'dungeon-enter': {
    desc: '进入副本实例；rerun 为真表示这是一座已通关副本的再探（resetDungeon 会把 spawned 归零，所以确实是一张新随机布局）',
    payload: '{ id, name, rooms, doors, rerun }',
  },
  'dungeon-cleared': {
    desc: '整座副本清空。UI 侧的"任务助手"也会派发它，见 §9 的诚实记录',
    payload: '{ id }',
  },
  'dungeon-room-enter': {
    desc: '进入副本房间（清房计数、镜头与教程的输入）',
    payload: '{ roomId }',
  },
  'dungeon-room-cleared': {
    desc: '副本房间清空。CG 图鉴与叙事导演都认这一条 —— 曾经的 CG 死链（`dungeon-room-clear`）就错在这里少一个 d',
    payload: '{ roomId, dungeonId }',
  },
  'dungeon-supply': {
    desc: '副本内补给点回复玩家（restore 的入参原样转发）',
    payload: '{ hp, stamina }',
  },
  'dungeon-run-logged': {
    desc: '一次副本行程落档。行程记录已由派发方存进 runs',
    payload: '（整体转发行程记录对象）',
    hook: '派发方（DungeonRunTracker）已经把记录写进 this.runs 并由面板直接读取；这条是给外部统计的出口，仓库内无监听点',
  },
  'map-marker-changed': {
    desc: '世界地图标记增删。标记数组由派发方自己维护',
    payload: null,
    hook: '世界地图面板每帧按当前标记数组重绘（Game.update 里的 worldMapPanel.draw()），不需要事件驱动；这条是给需要"变更时刻"的外部消费者留的出口',
  },
  'boss-beacon-seen': {
    desc: '玩家望见 Boss 信标，图鉴补一条目',
    payload: '{ bossId }',
    hook: '派发方（BossApproachDirector）已就地写入日志并给出演出；这条给将来的"信标追踪"UI 预留，仓库内无监听点',
  },

  /* ———— 战斗 ———— */
  'combat-hit': {
    desc: '一次命中结算发生。多数派发位点只是"有这回事"的信号，只有带伤害数字的那次带负载 —— 消费者（任务系统）不读 detail',
    payload: '{ damage, target }',
  },
  'combat-execution': {
    desc: '处决触发。position/stature/base 供镜头按体型取景，boss 决定是 bossKill 演出',
    payload: '{ position, boss, bossId, name, stature, base }',
  },
  'combat-riposte': {
    desc: '反击成功，纯信号；特效取当前锁定目标',
    payload: null,
  },
  'combo-finisher': {
    desc: '连击终结，纯信号；特效/横幅/教程各自取当前上下文',
    payload: null,
  },
  'parry-success': {
    desc: '弹反成功，纯信号（成就、风格计数、统计与教程共用）',
    payload: null,
  },
  'enemy-defeated': {
    desc: '敌人倒下。type 是敌人类型符号（boss/soldier/…），任务与成就按它判定 —— 别再拿显示名猜。zone 是它**出生在**哪一座位面（W-B12 切片7：出生点那一次反推的结果，任务账里"该位面的清剿数"按它记）',
    payload: '{ name, type, bossId, zone }',
  },
  'boss-start': {
    desc: 'Boss 战开始（野外与副本都走这条），镜头、HUD、教程、音频各自进场',
    payload: '{ bossId, name, position }',
  },
  'boss-health': {
    desc: 'Boss 血量/阶段变化，只喂 HUD 血条',
    payload: '{ hp, maxHp, phase, name }',
  },
  'boss-phase': {
    desc: 'Boss 进入新阶段：横幅由 BossPhaseDirector 弹，音频切阶段',
    payload: '{ phase, name, bossId }',
  },
  'boss-defeated': {
    desc: 'Boss 被击败。bossId 是稳定身份，CG/图鉴/成就/重战导演都按它认领',
    payload: '{ bossId }',
  },
  'boss-rematch-started': {
    desc: '营火重战 Boss 开场（成就与 CG 的"重战"来源标记）',
    payload: '{ bossId }',
  },
  'time-stop-start': {
    desc: '时线执政官展开时停。HUD 把区副标题顶成时停提示',
    payload: null,
  },
  'time-stop-end': {
    desc: '时停结束（自然到期或被蓄力法术打断）。必须有人把区副标题还回去 —— 修 B44 之前它没有监听者，"⏳ 时停中"会一直挂在 HUD 上',
    payload: null,
  },
  'spell-cast': {
    desc: '法术释放；charged 表示这是一次蓄力施法。nameKey 是法术显示名的文案键（W-D2 切片35），消费者要显示名就 t() 展开（改前载荷带裸中文 name，英文侧拿到即露馅）',
    payload: '{ id, nameKey, charged }',
  },
  'spell-toast': {
    desc: '法术层要向玩家说一句话（化身、打断等）。派发到 Toast 的唯一入口，避免施法系统直接持有 UI',
    payload: '{ message }',
  },
  'transform-start': {
    desc: '化身计时器开始。化身条已由 Observable 驱动（B41），这条是外发出口',
    payload: '{ duration }',
    hook: 'HUD 的化身条改读 spells.vitals（B41 的变化驱动），不再靠事件轮询；这条留给需要"变身时刻"的外部消费者，仓库内无监听点',
  },
  'transform-end': {
    desc: '化身结束，纯信号（同上）',
    payload: null,
    hook: '同上：化身表现走 spells.vitals，事件是给外部消费者留的出口，仓库内无监听点',
  },
  'weapon-changed': {
    desc: '切换武器。weapon 是武器 id 符号，nameKey 是显示名的文案键（W-D2 切片35）—— HUD 侧 t() 现展开，换语言时由 HUD.refreshLabels 重算（改前载荷带裸中文 name）',
    payload: '{ weapon, nameKey }',
  },
  'player-damaged': {
    desc: '玩家受击后的血量快照，喂 HUD 的血条与受击反馈',
    payload: '{ hp, maxHp }',
  },
  'player-healed': {
    desc: '玩家回复后的血量快照',
    payload: '{ hp, maxHp }',
  },
  'player-respawn': {
    desc: '复活完成（死亡提示导演、魂火连击、副本与统计都要重置自己）。负载是个空对象：谁要状态谁自己读玩家',
    payload: '{}',
  },
  'player-death-count': {
    desc: '死亡计数递增，日志已补',
    payload: '{ count }',
    hook: '派发方（DeathHintDirector）自己写了死亡日志并弹提示；这条给统计出口，仓库内无监听点',
  },
  'soul-streak': {
    desc: '连杀魂火奖励结算',
    payload: '{ streak, bonus }',
    hook: '派发方自己加魂火并弹「连杀 ×N」提示；这条给统计/将来的连杀 HUD 预留，仓库内无监听点',
  },
  'combat-style-changed': {
    desc: '战斗风格档位切换（狂暴/优雅/审慎…），覆盖层与成就都认这条',
    payload: '{ rank, score, chain, label, color }',
  },
  'combat-camera-skipped': {
    desc: '战斗演出镜头被跳过：FOV 覆盖当场收回、输入锁释放',
    payload: null,
    hook: '跳过本身就是一次退出路径，派发方已完成收回动作；这条给需要统计跳过率的外部消费者，仓库内无监听点',
  },
  'combat-cinematic-skipped': {
    desc: '整套战斗演出被跳过，带累计次数',
    payload: '{ count }',
    hook: '派发方已释放输入锁、恢复时缓并弹「演出已跳过」；这条给"跳过率"统计出口，仓库内无监听点',
  },

  /* ———— 进度与叙事 ———— */
  'chapter-changed': {
    desc: '主线章节推进。prev 用于判断方向，武器技能树靠它做叙事解锁',
    payload: '{ chapter, prev }',
  },
  'quest-updated': {
    desc: '任务进度刷新（HUD、日志、副本与快速旅行解锁都挂这条）',
    payload: '{ chapter, current, completed, total, index }',
  },
  'side-quest-complete': {
    desc: '支线完成，整体转发支线对象',
    payload: '（整体转发支线对象：id/title/desc…）',
    hook: '派发方自己已写日志与提示；这条给成就/统计出口，仓库内无监听点',
  },
  'journal-entry': {
    desc: '日志新增一条（图鉴、成就、HUD 与教程各取所需）',
    payload: '（整体转发日志条目：id/title/category…）',
  },
  'journal-updated': {
    desc: '日志集合发生批量变化，纯信号让 HUD 重算计数',
    payload: null,
  },
  'stats-changed': {
    desc: '玩家成长数值变化（魂火/心智/等级等）。派发点分散在存档恢复、营火加点、Boss 重战与副本奖励',
    payload: '（整体转发 PlayerStats 快照：souls/mind/level…）',
  },
  'skill-points-changed': {
    desc: '武器技能点数变化，HUD 技能点显示与任务系统共用',
    payload: '{ points }',
  },
  'weapon-skill-unlocked': {
    desc: '武器技能解锁，整体转发技能定义',
    payload: '（整体转发技能定义对象）',
  },
  'achievement-unlocked': {
    desc: '成就解锁，整体转发成就定义',
    payload: '（整体转发成就对象：id/title/desc）',
    hook: '派发方（AchievementSystem.unlock）自己弹「🏆 成就」提示；这条给通知层/统计出口，仓库内无监听点',
  },
  'codex-unlocked': {
    desc: '图鉴条目解锁，整体转发条目定义',
    payload: '（整体转发图鉴条目对象）',
  },
  'cg-unlocked': {
    desc: 'CG 解锁。id 形如 bonus:dungeon-clear，图鉴页与成就补发提示',
    payload: '{ id, source, caption }',
  },
  'game-completed': {
    desc: '第五章通关：通关对白与字幕导演都挂这条',
    payload: null,
  },
  'cinematic-end': {
    desc: '一段过场演出结束（黑边收起、cinematicActive 置否都在派发方做完之后）',
    payload: null,
    hook: '派发方（CinematicManager.end）自己完成了退出演出的全部动作，输入门控走 game.cinematicActive 这个标志位；这条给需要"演出结束"时刻的外部消费者预留，仓库内无监听点',
  },
  'campfire-memory-updated': {
    desc: '营火记忆统计刷新（休息次数、节点记忆等）',
    payload: '（整体转发 CampfireMemorySystem.getStats()）',
  },

  /* ———— 营火与对话 ———— */
  'rest-dialogue-open': {
    desc: '营火对话开场。派生名族成员之一，见 REST_DIALOGUE_EVENTS',
    payload: '{ restId, nodeId, speaker, speakerId, mood, accent, linePreview }',
  },
  'rest-dialogue-node': {
    desc: '营火对话推进到一个节点：NPC 演出、记忆采集与 CG 都靠它',
    payload: '{ restId, nodeId, speaker, speakerId, mood, accent, linePreview }',
  },
  'rest-dialogue-close': {
    desc: '营火对话收束（正常结束与遮罩被关两条路径都走这里）',
    payload: '{ restId }',
  },
  'dialog-choice-picked': {
    desc: '玩家在对话里选了一项，action 是选项动作符号',
    payload: '{ restId, action }',
  },
  'dialog-overlay-hidden': {
    desc: '对话遮罩被隐藏（纯信号），休息场景导演据此退出演出',
    payload: null,
  },
  'rest-npc-greet': {
    desc: '玩家走近营火 NPC 的招呼，导演会把它转成一次手势。gesture 这个键消费方会读，但至今没有派发方带它 —— 每次都落到默认的 greet',
    payload: '{ restId, gesture }',
  },
  'rest-npc-gesture': {
    desc: '营火 NPC 做了一个手势（姿态已由派发方设好）',
    payload: '{ restId, gesture }',
    hook: '派发方（RestNpcAnimDirector）自己就设置了姿态；这条给"台词配合手势"预留，仓库内无监听点',
  },

  /* ———— 系统与界面 ———— */
  'settings-changed': {
    desc: '设置落盘后广播一份快照',
    payload: '（整体转发设置对象展开）',
    hook: '各系统在自己的面板动作里直接读 SettingsManager 生效，不需要事件驱动；这条给外部消费者预留，仓库内无监听点',
  },
  'game-saved': {
    desc: '存档写入成功，纯信号',
    payload: null,
    hook: '提示与失败上报由 SaveSystem 自己完成；这条给外部（云存档/统计）出口，仓库内无监听点',
  },
  'game-audio-mode': {
    desc: '请求切换 BGM 模式（mode=zone 时由 Game 补上当前区域 id）',
    payload: '{ mode }',
  },
  'game-audio-sfx': {
    desc: '请求播一个音效：sfx 必须是 AudioManager 导出的 SFX_NAMES 里那一格，名字不对由 playSfx 当场抛错（B71 之前是查不到就静默不播）。新增音效名要同时补 AudioManager 上的方法与那张表',
    payload: '{ sfx }',
  },
  'game-cue': {
    desc: '一条字幕线索发生了（W-D6 切片8）。cue 是 content/captions.js 里 CUE_CATALOG 的线索 id，data 是这条线索带的数（字幕插值与音效参数都从它取，缺省空表）。派发咽喉是 engine/cues.js 的 emitCue，表外 id 当场抛',
    payload: '{ cue, data }',
  },
  'camera-mode-changed': {
    desc: '第一/第三人称切换',
    payload: '{ mode }',
  },
  'photo-mode-changed': {
    desc: '拍照模式开关（成就要"拍过照"，图鉴要"看过风景"）',
    payload: '{ active }',
  },
  'error-captured': {
    desc: '捕获到一条运行时错误（未捕获异常或未处理的 Promise 拒绝）。由 engine/errorReporter.js 派发：账本上限 50 种、同指纹去重只累加 count、超出上限丢最旧的并记 dropped。**派发它不等于吞掉错误** —— 处理器不返回 true、也不调 preventDefault',
    payload: '{ kind, message, count }',
    hook: '派发方（errorReporter）已把记录写进自己的账本并由 `getErrors()` / `toReport()` 直接读取；这条是给外部统计与**将来的上报端点**留的出口（`setSink` 是同一件事的另一种接法），仓库内无监听点',
  },
});

// Object.freeze 只冻一层：条目本身也要冻，否则"改登记"还能从 payload 溜过去
for (const spec of Object.values(GAME_EVENTS)) Object.freeze(spec);

/**
 * 派生事件名族：营火对话的三个阶段。
 *
 * 原来这里写的是 `` `rest-dialogue-${phase}` `` —— 一个扫描工具看不见的名字，
 * 门禁无法回答"这个事件登记过吗"，拼错 phase 也只是静默派发一条没人听的事件。
 * 换成显式映射后，键集合与注册表由测试逐条对齐，未知 phase 在派发当场抛错。
 */
export const REST_DIALOGUE_EVENTS = Object.freeze({
  open: 'rest-dialogue-open',
  node: 'rest-dialogue-node',
});
