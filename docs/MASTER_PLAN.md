# 跨界纪元 · 增强与内容总计划

> 版本：**v2.0**（2026-09-22 制定）
> 适用范围：`src/` 下的 Three.js 网页版游戏（唯一开发目标）
> **本文是长期开发的唯一执行权威。**
> `docs/OVERHAUL_PLAN.md` 自本版起降级为「**工程重构详录**」——保留其逐切片的诊断证据与验收记录（B1–B34 缺陷台账、M0–M3 切片明细），不再作为排期依据。
> `docs/COMBAT_DESIGN.md` 保留为战斗设计参考；`docs/ENGINE_ROADMAP.md` 已作废（只做 Three.js 网页版）。

---

## 0. 执行协议（每个会话开工必读）

这一节是给"未来的自己"看的。本项目战线长，任何一次会话都必须从同一套流程进入，否则必然出现"做一会断一会"。

### 0.1 开工三步

1. 读本文（尤其 §1 现状快照、§8 进度看板）+ `git log --oneline -10`。
2. 跑门禁基线：`npm run lint && npm run test && npm run build`，确认起点是绿的。
3. 从 §8 里挑**当前批次**（`status: 进行中` 优先，其次取依赖已满足的最高优先级项），不要临时开新线。

### 0.2 交付节奏

- **一个工作包 = 一个批次 = 若干切片**。切片必须"能跑、能构建、能回滚"。
- 每个切片收尾动作固定：**改代码 → 补测试 → 三门禁通过 → 提交 → 回填 §8 与 §9**。
- 切片中途发现新缺陷：**当场记入 §1.4 台账**（给编号），能顺手修就修，不能就登记，不许口头带过。
- 切片结束时必须留下**实测数据**（单测断言 + 浏览器内注入帧的读数）。只写"应该没问题"的结论视为未完成。

### 0.3 完成定义（DoD）

一个工作包只有在下列全部满足时才能标 ✅：

- [ ] 验收标准逐条可复现（有测试或实测读数）
- [ ] `npm run lint` 0 error（warning 不新增）
- [ ] `npm run test` 全绿
- [ ] `npm run build` 通过，且**未新增**跨块循环依赖
- [ ] §8 进度表已回填（状态 / 日期 / 提交号）
- [ ] §9 变更记录已追加一条 ADR（为什么这么做、放弃了什么、留了什么尾巴）
- [ ] **回填与代码同批**：`docs(plan)` 提交必须紧跟在切片提交之后、且在同一会话内完成。W-A1 是反面样本 —— 代码 `95c0533` 落地后看板仍写着"⬜ 未开始"，中间任何一次冷启动读到 §8 都会得到错误结论（该次欠账在 `4f1adc6` 之后的回填里补掉，并顺带抓出注释与接线的两处不符）
- [ ] 记录只写**真实做过并验证过**的事。归因未经复查不许落文档；发现自己写错了，就地更正并保留更正记录（B43/B44 与"过期快照"那次误判都按这条处理）

### 0.4 提交规范

`<type>(<scope>): <中文摘要>`，一个切片一个提交。`docs(plan): 回填 <工作包> 现状与验收` 单独一条。

---

## 1. 现状快照（2026-09-22 实测）

### 1.1 工程健康度

| 指标 | 实测值 | 判读 |
|------|--------|------|
| 源码规模 | `src/` 181 个 JS 文件 / **23,883 行** | 中等规模，单人可维护 |
| `Game` 构造函数子系统 | **104 个** `new` | 装配层过重，目标 ≤ 40（M7 收口） |
| 全局事件 | **157 处** `window.addEventListener` / **139 处** `dispatchEvent(new CustomEvent)` | 无类型、无注销、无命名空间 |
| `setTimeout` | **28 处**（音频/UI 过渡属合理，游戏逻辑属违规） | 见 W-A1 |
| 中文区域名匹配 | **57 处**，跨 **15 个文件** | 改显示名即静默丢内容，见 W-A2 |
| 测试 | **266 例 / 20 文件**，全绿 | 单测覆盖已可支撑重构 |
| Lint | 0 error / 12 warning | 干净 |
| 构建 | 11.2s 通过；`chunk-ui ↔ chunk-world` **循环依赖告警**；`vendor-three` 631KB | 分块需在 W-B1 一并修 |
| 存档 | v5，带显式迁移链 `SaveMigrations` | 新增字段须走 v6 迁移 |

**复测（2026-09-23，W-A2 切片1/2/3 与 W-A1 计时主体 + 切片4 + 切片5 + 切片6 落地后；口径与上表一致 —— `find src -name "*.js"`）**

| 指标 | 基线 | 现值 | 说明 |
|------|------|------|------|
| 源码规模 | 181 文件 / 23,883 行 | 186 文件 / **25,001 行**（+403：`engine/events.js` 357 行 + 四个既有文件的 46 行） | +5 个模块：W-A1 的 `engine/Scheduler.js`、`engine/Observable.js`、`engine/events.js`，W-A2 的 `world/ZoneIdentity.js`、`content/franchises.js`；切片3 的 +42 行全在既有文件里（id 校验与自检），切片4 的 +31 行同理（条目表与门禁注释），都未新增模块 |
| 游戏逻辑 `setTimeout` | 28 处 | **0 处**。`src/` 内实际调用只剩 `AudioManager` 的 4 处 `setTimeout` + 2 处 `setInterval` | 那 6 处属音序器，归 B38 / W-C7；见 §9 的 W-A1 条目 |
| 特效自建 rAF 循环 | 4 条（`ExecutionEffects` 3 + `WeatherSystem` 1），且步长写死 `0.016` | **0 条**。`src/` 内 `requestAnimationFrame` 调用点只剩白名单 4 处：主循环 1 + CSS 过渡的"下一次绘制" 3，每处带 `rAF-EXCEPTION` 标记 | 修 B43；名单与实际命中在 `tests/timing-boundary.test.js` 里**双向对齐**（新增未登记的红，登记了却不再用的也红） |
| 中文显示名逻辑判定 | 57 处 / 15 文件 | **0 处** | 修 B35、B36；由 `tests/content-boundary.test.js` 的静态门禁兜住（新站点直接变红，**不留存量白名单**） |
| 区域 id 字面量比较 | — | **0 处**（`zoneId === 'space'` 这类写法在 `src/` 内已无匹配） | 切片2 把效果层与天气层换成 `ZONE_IDS` 符号；`WeatherSystem` 的 `ZONE_PRESETS` 键也改成 `[ZONE_IDS.X]` |
| 全局事件 | 157 监听 / 139 派发 | `window.addEventListener` 位点 **136**（其中 **131** 处仍是登记游戏事件的裸监听 = 欠账，5 处是 DOM 事件）、派发位点仍 137（136 处写死字面名 + 1 处从登记表取，后者已改走 `emit()`）；**注销这一侧从"根本没有能力"变成"有能力且已用在最重的监听方"** —— `engine/EventBus.js` 的 `offAll(tag)` 是游戏事件的第一条真实注销路径，HUD 的 20 处监听经它一次结清（`removeEventListener` 全仓 3 处 DOM + 总线内部 2 处，都是这个新咽喉的服务方） | 修 B44 注销半区。每帧数值事件走 `Observable`（B41）、名字走登记表（切片5）、**注销走总线**（本片）；剩下 131 处裸监听是明账，`tests/event-bus.test.js` 有一张**只许收缩**的逐文件台账（新增一处裸监听、或某文件多一处，当场变红），逐系统迁移归后续（W-B 段），不在本切片偷做 |
| 事件名登记 | 0 条登记，名字全靠手抄 | `src/engine/events.js` **71 条**：每条带用途、负载形状，16 条无监听者的逐个写明理由。对账：字面派发名 69 ∪ 监听名 55 = **71**，与登记数正好相等 —— 即 **0 个**未登记名字、**0 个**死条目；多出的 2 个是营火对话的派生名（监听方写死名字、派发方按阶段查表）。模板字符串拼事件名的位点 **0 处** | 修 B44 命名半区；由 `tests/event-registry.test.js` 12 例静态扫描钉住（切片6 起扫描器同时认 `emit()` / `on()` 新写法，迁移不会让门禁瞎掉），8 个变异全部变红（见 §1.4 B44 行与 §9 本条 ADR） |
| 事件总线与注销 | 监听器挂上后只能刷新页面才能下来 | `src/engine/EventBus.js`（`on(name,handler,tag)` / `emit(name,detail)` / `offAll(tag)`）：`name` 必须是登记表里的名字否则启动即抛错（抄错名从"下游静默失踪"升级成"当场炸"）；`tag` 是所有权标识，系统 `dispose()` 里 `offAll(tag)` 一次结清该实例全部监听。样板已落在 `ui/HUD.js`（20 处监听 → 一个 `EVENT_TAG`，`dispose()` 现结清观测量退订 + 监听注销 + 未到期的调度任务三本账）与 `game/RestDialogue.js`（派发改走 `emit()`）| 修 B44 注销半区；`tests/event-bus.test.js` 15 例：总线自身行为（未登记名抛错 / `payload:null` 带 detail 抛错 / 按 tag 整体注销且幂等 / 退订函数 / 同 handler 去重 / 无 window 返回 false）+ 三条门禁（裸监听逐文件台账只许收缩、用 `on()` 必配 `offAll()`、`on()` 一律带 tag）|
| POI 稳定 id | 14 处位面 POI 走 `` `${zoneId}-${label}` `` 回退 | **58 / 58 条登记表记录带合法 kebab-case id，全表唯一**（真世界 `WorldManager.build()` + 四层致敬增强器跑完后的实测口径） | 修 B45；`tests/poi-identity.test.js` 在 node 里构建真世界做全量断言，浏览器端复核同得 58 条、0 非法、0 重复 |
| 测试 | 266 例 / 20 文件 | **409 例 / 30 文件**，全绿 | 新增 10 个文件：`timing-boundary` `engine-scheduler` `engine-observable` `zone-identity` `franchise-identity` `fast-travel` `poi-identity` `effect-timing` `event-registry` `event-bus`（本片 +15 例）。注：本批 `npx vitest run` 偶发 1~3 条 `ProgressEvent is not defined` 的**未处理 rejection**（three.js 纹理加载器在 fetch 分块时构造 `ProgressEvent`，node 无此全局）—— 经复查在**未含本片改动的 HEAD** 上同样复现（3 次跑 1/1/0 条），属既有测试的定时性抖动，非本切片引入，测试全绿不受影响（✅ 已由 M4 夹具 `937290d` 收口：`tests/setup.js` 补最小 `ProgressEvent`，连跑 6 次 0 复现） |
| Lint | 0 error / 12 warning | 0 error / 10 warning | 现存的 10 条全是 `no-unused-vars`（死代码与未用导入），文件集合与上批一致。两条差值没有逐条追认 —— 基线只记了总数。切片5 与切片6 新增的三个文件（登记表 + 两个门禁 / 总线）不给告警清单添条目 |
| 构建 | 11.2s 通过 + 1 条跨块环告警 | 通过，告警集合未增（仍是 `chunk-ui ↔ chunk-world`） | 本批四次计时 3.48s / 2.15s / 3.57s / 7.98s（上两批同口径 6.96s / 2.95s）—— 波动来自机器负载，只记观测值不解读；分块仍归 W-B1 |


### 1.2 玩家能感知的短板（这是"难玩"的真正来源）

按玩家时间线分层，**越靠上的优先级越高**。

**A. 前 10 分钟**

| # | 短板 | 证据 |
|---|------|------|
| A1 | 战斗只有"轻击/重击/翻滚/弹反"四个动作，**没有取消关系与输入缓冲**，连段之间是硬直等待 | `MoveTable` 有 `at/duration` 但没有 `cancelInto`；`CombatController` 无输入队列 |
| A2 | 世界空间 UI（敌人血条、锁定标记）是**不面向相机的平面**，侧看即变成一条线 | `Enemy.updateHpBar()`（`Enemy.js:68-81` 区段） |
| A3 | 敌人只有 **5 类**（训练木人 / 影之战士 / 魔法构装体 / 轨道无人机 / 精英虚空骑士），同类敌人换个颜色就是新敌人 | `EnemyManager.spawnDefaults()` |
| A4 | 镜头只有单层覆盖，**没有混合栈**：进出过场是一帧硬切，锁定无阻尼、无越肩 | ✅ W-A5 切片1（`5575801`）消"进出过场一帧硬切"（所有权交接补间）；切片2（`e162c20`）消"锁定无阻尼"（锁定重定位按秒指数逼近）；切片3（`0433777`）补"非锁定瞄准磁吸"（挥砍对最对准星的侧前目标做纯宽容补判，`AIM_ASSIST` 可调）。A4 全消 |

**B. 前 1 小时**

| # | 短板 | 证据 |
|---|------|------|
| B1 | **没有装备系统**。掉落只有一个八面体给"位面之魂"，无装备/词缀/稀有度 | `LootSystem.js` 全文无 `rarity`/`affix`/`equip` |
| B2 | 技能树只有 **8 个节点**（剑系 4 + 杖系 4） | `WeaponSkillTree.js` |
| B3 | 支线只有 **7 条**；主线 32 步是硬编码线性数组，**零分支** | `SideQuestRegistry.js` / `QuestSystem.js` |
| B4 | 地下城是 4×6 随机迷宫，房间只差配色，没有房间模板与遭遇表 | `ProceduralDungeonGenerator.js` |
| B5 | Boss 有 6 个类，但**没有场地机制**（红圈/弹幕/引力/时停），阶段只是数值与速度变化 | ✅ W-A6 切片1（`2043968`）落地"红圈"底座：`combat/GroundHazards.js` 危险区生命周期（前摇画圈→落地结算一次→余像淡出，圈与施法者解耦、按峰值池化），三个会砸地的 Boss 共用同一份实现（原先各自手抄，且预警圈涨到判定半径的四倍 = 说谎）。切片2（`3474fb0`）落地"弹幕"这一档：`BarragePattern.barrageLayout` 纯几何铺落点（黄金角 + 面积均匀 + 由内向外错时），大奥术师二阶段近身铺场，落点夹回竞技场内，站住连吃、外跑脱身。切片3（`9daa748`）把"什么时候铺场"收进 `content/arenaScripts.js` 脚本表：按 `bossId` 声明 `phase` + 三种闸门（近战位抢刀 / 按秒期望 / 冷却加距离），加载期整表校验，`Boss` 只留一条通用驱动；四份手抄闸门（守护者 0.35、引力化身 `dt*0.08`、混沌领主 `dt*0.06`、大奥术师弹幕整段）删除，引力化身与混沌领主第三阶段各得一次弹幕。切片4（`ccff4f2`）把危险区扩出**第四种生命周期：域**（前摇 → 落地 → 持续段 → 淡出），`spawn()` 从此有时长、每 tick 结算一次、可对玩家施加向心拉力；引力化身的"每 3.5 秒凭空拽一下速度"换成第三阶段在玩家脚下开一口看得见边界的引力井（半径 5.5 米、3 秒、每 0.6 秒 6 点、拉力 8），主人倒地时井跟着塌。切片5（`e039202`）落 B5 最后一档"时停域"：`spawn()` 多收 `slow`，危险区的结算器从此是三选一（**伤害 / 拉力 / 时标**），时停域 `damage: 0` 只收机动；玩家侧新增**按来源记账、每帧续绳（`TIME_SCALE_LEASH 0.12` 秒）的时标账本**（`applyTimeScale/releaseTimeScale/updateTimeScales`），多来源取最狠的一份、断供自动还账，`timeSlow` 降格成算出来的缓存。顺带修掉真正的软锁：时线执政官那记无场时停从前只有"自然到期"一条还原路径，**被打断**与**死在时停里**两条都会把玩家永久留在 0.35 倍速（无提示、只能重开关卡），现在它走同一本账、不再直接写 `timeSlow`。四档原型至此全部落地，**B5 关闭**；仍在前面的不是本条缺陷而是新工作：逐 Boss 遭遇编排（现在只有三只有场地脚本，其余走 `default` —— W-B8 与 B4 的副本遭遇表）、把圈接进阶段演出（`BossPhaseDirector.js`）、圈/井/场的表现层可读性（M5/M6） |
| B6 | 区域只有 5 个，区域之间是空白地形走廊 | `WorldManager.build()` |

**C. 通关与长线**

| # | 短板 | 证据 |
|---|------|------|
| C1 | 视听：真实美术资产 **1 个 GLB（Soldier 占位）+ 8 张贴图**；音频 **全部 Web Audio 合成，0 个音频素材**，无配音 | `public/` |
| C2 | 渲染：只有 UnrealBloomPass；**0 个 InstancedMesh**；一张 4096² 阴影图覆盖全场 | `Game.js` |
| C3 | 通关时长约 1 小时量级，目标 3–5 小时 | 内容量推算 |

### 1.3 已经具备的能力（**不要重做**）

这些在 M1–M3 已落地并有测试钉住，是项目的真实资产：

- **碰撞世界**：`engine/Collision.js`（空间哈希 + 圆柱/盒 + `supportAt` 站立顶面 + `unpenetrate`），5 区 + 枢纽 313 个障碍，单帧 < 0.3ms。
- **时间源**：`engine/Time.js`（dt 上限 / `timeScale` / 固定步长），hitstop 走全局缩放。
- **状态机**：`engine/StateMachine.js` 同时承载 `PlayerFSM` 与 `EnemyFSM`，位移意图与积分分离。
- **战斗判定**：`MoveTable`（时序/形状/打击带）+ `Hurtbox`（分部位竖直分段）+ `Resolution`（部位→背刺→防御→抗性→暴击→破防→格挡 单条纯函数管线）。
- **敌人 AI**：`ai/Perception.js`（视距/遮挡/记忆/归位）+ `ai/Separation.js` + `ai/Squad.js`（租约式围攻名额 ≤2）+ `combat/EnemyMoves.js`（9 种招式原型 × 5 类敌人，前摇分级）。
- **反馈层**：`engine/Shake.js`（trauma 模型、按秒衰减、帧率无关）+ 定容火花/环/飘字池 + 逐敌击退。
- **相机**：`engine/CameraRig.js` 为唯一写入者，FOV 按帧申领；第三人称遮挡对实体求交（收回快/伸出慢）。
- **存档**：v5 + 显式迁移链 + 坏档隔离。
- **性能观测**：`engine/PerfHUD.js`（F3，判据是"相对历史最低点的净增长"）。

### 1.4 缺陷台账

**已修复**：B1–B34 全部关闭（明细见 `OVERHAUL_PLAN.md` §1.4 与 §9 变更记录）；B35、B36、B39、B41、B42、B43、B44、B45 于 W-A1 / W-A2 两个工作包内依次关闭（下表；B36 的最后一类站点在 W-A2 切片2，提交 `b4a8416`；B45 在切片3，提交 `16edb9e`；B43 在 W-A1 切片4，提交 `def9f8d`）。**B44 两半都已关闭**：命名半区在切片5（`bf93a4c`，名字收进登记表 + 静态门禁），注销半区在切片6（`engine/EventBus.js` 的 `on()/emit()/offAll(tag)` —— 游戏事件从此有了真实注销路径，最重的监听方 HUD 已整体迁移并结清）。**剩下的不是缺陷而是迁移欠账**：131 处裸监听仍无退订，由 `tests/event-bus.test.js` 的逐文件台账**只许收缩**地钉住，逐系统迁移归 W-B（下表末行）。

**待修**：

| 编号 | 位置 | 症状 | 归属 |
|------|------|------|------|
| B37 | `vite.config.js` manualChunks | `chunk-ui → chunk-world → chunk-ui` 循环依赖告警（既成事实，未造成运行时问题，但阻断后续分块优化） | W-B1 |
| B38 | `AudioManager` 4 处 `setTimeout` + 2 处 `setInterval` | 音序与音乐计时挂墙钟：暂停/后台标签页里音乐照走，`timeScale` 也不影响它 | W-C7 |
| B40 | `PerformanceManager.shouldUpdateEnemy` | 远处敌人"冻结"但仍可见（B14 未闭环） | W-C2 |
| B46 | `Game.hotkeyBlocked`（原 `keydown` 分支的第二条守卫，W-A7 切片3 挪进表时原样保留） | **暂停菜单开着时 Escape 关不掉**：守卫在"pauseMenu / settingsPanel / fastTravelPanel / helpManual 任一开着"时挡掉**全部**热键（连 Escape 一起），而 `PauseMenu` 自己没有任何监听器 —— 只能点"继续"。根因不是少写一个分支：`runEscape` 的级联里没有 `settings` / `fastTravel` 层，"面板开着时 Escape 该关谁"这件事**没有定义**，所以补哪一个都只是碰巧 | W-D1 `OverlayStack`（其验收原文就是"模态栈、焦点管理、Esc/手柄返回一致"）。切片3 现场复现（5191 dev 口）：`pauseMenu.open` 为真时派发真实 `keydown Escape`，菜单仍然开着；手柄 Start 同一条路，开得了也关不掉 |
| 监听迁移欠账（B44 后续，非缺陷） | `src/` 40 文件 | **注销能力已落地**（`engine/EventBus.js`），但存量 131 处 `window.addEventListener('<游戏事件>')` 仍是裸监听、没有退订路径；HUD（20 处）已迁成样板。今天只是潜伏账（`new Game()` 全仓仅一次，换区/读档原地改状态），但"新游戏+ 真重建子系统"或"每次进副本 new 一个 director"会立刻暴露成同一事件被 N 份监听各响应一次 | W-B（逐系统迁到 `on()/offAll(tag)`）；台账由 `tests/event-bus.test.js` 的**只许收缩**门禁兜住，新增裸监听当场变红 |

**本批关闭**：

| 编号 | 位置 | 症状 | 修法与证据 |
|------|------|------|-----------|
| B35 | `WorldManager.applyHubAtmosphere()` | 枢纽塞的是临时伪造对象 `{ info: { name: '交汇枢纽' } }`，枢纽内按 `zone.id / radius / colliders` 取用一律拿到 `undefined` | 改为冻结的共享描述 `HUB_ZONE`（走廊同 `CORRIDOR_ZONE`，此前是 `null`）。`tests/zone-identity.test.js` 钉住"二者都冻结、写它会抛错" |
| B36 | 57 处 / 15 文件 | 区域与母题身份靠中文显示名 `includes()` / `===` 匹配，改一行文案整段静默失效 | 新增 `world/ZoneIdentity.js`（`ZONE_IDS` + `zoneIdAt/resolveZone/zoneDescriptor`）与 `content/franchises.js`（`FRANCHISE` + `franchiseLabel`）；判定改走 `id / type / targetId / franchise`；`tests/content-boundary.test.js` 做**硬零**静态门禁（扫描集自证覆盖当前源码树，无白名单）。切片2 收掉最后一类：快速旅行按显示名认目的地、面板"在此"按名字比、营火名与区名各抄一份 —— 现在 `addRestPoint` 缺 id / 重 id **在构建期抛错**，`tests/fast-travel.test.js` 17 例里有 5 例是"把旧写法贴回去就变红"的变异验证（贴回 `d.name === id` 与 `id = id ?? name` 后实测 5 红、2 红） |
| B39 | `ui/` 6 处 | 面板动画/提示用 `setTimeout` 挂墙钟，hitstop 期间提示照常跳 | 全仓游戏逻辑 `setTimeout` 归零，改走 `engine/Scheduler.js` 的 `after/wait/clear(tag)`（21 处调用点、11 个文件）。`src/ui/` 现在 `setTimeout` 为 **0**；`Dialog.js` / `ExecutionSkipBurst.js` / `CombatCameraDirector.js` 各留一次 rAF —— 那是为 CSS 过渡制造"下一次绘制"，属规范第 2 条明示的例外，代码里写明理由 |
| B41 | `CombatController.update()`、`SpellSystem.emitMana()` | 每帧派发一条 `'stamina-changed'` / 法力事件（60fps 下每秒 60 条相同内容的 CustomEvent），HUD、教程、辅助系统在同一帧被反复唤醒 | 新增 `engine/Observable.js`：值真的变化才广播一次，`quantize` 让"精力按 0.5 一档、血量按 1 一档"的去重有意义；`HUD` 走 `subscribe()` 拿退订函数存进 `_offs`。`emits / writes` 两个计数器就是"到底通知了几次"的可断言证据（`tests/engine-observable.test.js` 15 例） |
| B42 | `ui/ContextualTutorial.js` 的 `zone-changed` 监听 | 两条区域提示**完全不看进的是哪个区**，只按章节门控：第四章后随便踏进任何一个位面，都会弹出"破碎时线：重力与视野在此不稳定" | 加 `zoneId === ZONE_IDS.VOID / ABYSS` 门槛，标题取 `ZONE_NAMES[id]`（显示名只有一份）。代价如实记录：见 §9「玩家必须真的重新进入该区才看得到」 |
| B43 | `effects/ExecutionEffects.js`（3 条循环）、`world/WeatherSystem.js`（雨滴涟漪） | 四处特效**自己 `requestAnimationFrame` 递归**，并把每帧时长写死成 `0.016` —— 寿命于是按**帧数**而不是按秒走：144Hz 下一片血雾碎片约 0.15 秒就没了（设计值 0.35~0.6 秒），30Hz 下拖到 0.7 秒；更要紧的是暂停与 hitstop 期间它们照常跑完，而那 0.3 秒正是"这一刀很重"的读数窗口。§2.3 的"帧率无关性"对这几条一律不成立 | 三条循环与涟漪改由主循环 `update(dt)` 推进（dt 已被 `timeScale` 与 hitstop 缩过），条目到期就地 `geometry/material.dispose()`；旧"每帧 0.12 弧度""每帧 ×1.08"这类常数换算成按秒的角速度 / 按秒的放大率，60fps 下数值与修前一致。门禁分两层：`tests/effect-timing.test.js` 10 例断言**同一寿命**（144Hz 与 30Hz 之差 < 一帧）、`dt=0` 时一秒不推进、网格与 dispose 一一对应、以及主循环确实调用；`tests/timing-boundary.test.js` 把 rAF 白名单钉成 4 处（主循环 + 三处 CSS 绘制间隔），每处必须带 `rAF-EXCEPTION` 标记，且名单与实际命中**双向对齐**。变异验证：把 `onTick(dt)` 换成 `onTick(0.016)` → 3 例变红；在名单外的文件里新增一处 rAF → 白名单门禁报出文件名 |
| B45 | `world/zones/BaseZone.js`（`addPOI`） | POI 未显式给 id 时回退成 `` `${this.id}-${label}` ``，**把显示名嵌进了稳定身份**：改一句调查文案，该 POI 的 id 就变，按 id 认领它的下游（任务 `interact` 匹配、`poi-interact` 监听、marker 的 `userData.poiId`、今后进存档的发现进度）静默断链 —— 运行期不报错，只是"点了没反应"。14 处位面 `addPOI` 调用无一传 `options.id`，全走这条回退。按登记时的口径如实记录：修复前**无玩家可见故障**（碎片进度由 `onInteract` 派发的显式 `discovery` id 驱动，`discovered` 未进存档），这是契约隐患，不是已发生损坏 | 回退删除，改成与 `addRestPoint` 同一条契约：**缺 id / 非 kebab-case / 同区重复 id 在世界构建期直接抛错给开发者看**；14 处位面调用与 42 处致敬层登记补齐显式 id（最终 56 条位面 POI + 2 条 hub 记录 = 58）；规则是"凡 `onInteract` 派发 `discovery` 的 POI，其 id 必须等于那个发现 id"，由测试逐条遍历全表钉住，唯一例外 `fantasy-ring-echo` 走测试里那张必须显式登记的别名表。`WorldManager.assertPoiIdentity()` 在 `build()` 与 `attachPopCultureZones()` 各跑一次，把**合并后的全量表**（含两处不走 `addPOI` 的 hub 记录）收口 —— 同一段逻辑两个调用点，不是两道会各自漂移的门。证据：`tests/poi-identity.test.js` 14 例在 node 里跑完真世界后断言整张表（含"把全部 label 换成乱码，id 与交互结果一模一样"这条正面证据）；变异验证 —— 贴回 `options.id ?? \`${this.id}-${label}\`` 并关掉 kebab 校验后，缺 id 与非法 id 两例变红 |
| B44（注销半区） | `src/` 全局 151 个游戏事件监听 | 名字进表之后，注销这一半仍空的：每个 `window.addEventListener('<游戏事件>')` 挂上后，除了刷新页面没有任何路径能把它摘下来（全仓 3 处 `removeEventListener` 撤的都是 DOM 事件，游戏事件注销位点为 **0**）。`new Game()` 全仓只出现一次，所以今天是潜伏账；一旦"新游戏+/重开真重建子系统"或"每进副本 new 一个 director"发生，症状不是报错而是**同一事件被 N 份已死监听各响应一次**（横幅弹两层、CG 提示重复、成就计数翻倍），且无线索指向成因 | 新增 `src/engine/EventBus.js`：`on(name, handler, tag)` / `emit(name, detail)` / `offAll(tag)` + `listenerCount()` 诊断。**底层仍是 window 上的 CustomEvent**（迁移一个监听不动派发方、不动回调签名），但 `name` 必须是登记表里的名字，否则**启动当场抛错** —— 抄错名从"下游静默失踪"升级成"当场炸"，这是登记表唯一的运行期咽喉。`tag`（约定 `"域/类名"`）是所有权标识，系统 `dispose()` 里 `offAll(tag)` 一次结清该实例全部监听。样板落在两处：**`ui/HUD.js` 的 20 处裸监听整体迁成 `on(..., 'ui/HUD')`**，`dispose()` 从"只退订观测量"扩成结清三本账（观测量退订 + `offAll(EVENT_TAG)` + `scheduler.clear` 未到期任务）；**`game/RestDialogue.js` 的派发改走 `emit(type, detail)`**（总线派发有了第一个真实使用方）。门禁 `tests/event-bus.test.js` 15 例：总线自身行为（未登记名/`payload:null` 带 detail 抛错、按 tag 整体注销且幂等、退订函数单摘、同 handler 去重不虚报、无 window 返回 false）+ 三条静态门禁（① 裸监听逐文件台账**只许收缩**、新增一位点当场变红；② 用 `on()` 的文件必须同时有 `offAll()` —— 打了 tag 不注销比不打更糟；③ `on()` 一律带 tag，省略 tag 落进 `UNGROUPED` 等于换个地方继续漏）。同步扩 `tests/event-registry.test.js` 扫描器认 `emit()/on()` 新写法（只认旧写法的话，迁移越干净门禁越瞎）。**存量 131 处裸监听不在本片强迁**（那是逐系统接线的大活，见待修表末行 W-B），本切片交付的是"能力 + 样板 + 只许收缩的账" |
| B44（命名半区） | `src/` 全局 71 个事件名 | 派发与监听是**两次独立的手抄**，抄错不报错、只是下游永远醒不过来。动手前抓到的三条活病例：① `CgGallerySystem` 监听 `dungeon-room-clear`，派发方发的是 `dungeon-room-cleared` → 「副本清房」这张 CG **从此不可能解锁**；② `VoidBoss` 两处派发 `time-stop-end`，全仓无人监听 → HUD 的「⏳ 时停中」写上区副标题后**再也不会落回去**（要等下次换区才被顶掉）；③ `dungeon-enter` 从不带 `rerun`，HUD 却按它弹「深渊再探」→ 那条提示**永远不出现**。三条的共同点是：运行期零异常，只有"内容没了" | 新增 `src/engine/events.js`：71 条登记（每条 `desc` + `payload` 形状，16 条无监听者的**逐条写明为什么没人听也不影响表现**），营火对话的派生名收进 `REST_DIALOGUE_EVENTS`，`RestDialogue._emit` 改为**查表取名**并对非法阶段直接抛错。门禁 `tests/event-registry.test.js` 12 例：未登记名字硬零、登记表无死条目、`payload: null` ⇔「没人带 detail」双向对齐、hook ⇔ 无监听者双向对齐、登记表与条目双双冻结、**模板字符串拼事件名 0 处**、三条病例各钉一条回归。变异验证 8 项全部变红（CG 监听名退回 / 删一条在用登记 / 加一条不存在登记 / 带负载谎称 null / 无负载谎称有 / 有人监听却挂 hook / 对话退回模板字符串 / 撤掉 `time-stop-end` 监听）。浏览器端（`vite preview` :4181，构建产物）实测：派发 `dungeon-room-cleared` 当场得到 `cg-unlocked bonus:dungeon-clear@dungeon`（修前该位点无人响应）；`time-stop-start` → 副标题为「⏳ 时停中…」，`time-stop-end` → **落回区权威副标题**，而先 `realm-bleed` 后 `time-stop-end` 时渗漏文本保留（覆盖层带来源，谁开的谁关）；fresh 页面派发不带 `rerun` 的 `dungeon-enter` 无提示、带 `rerun: true` 的弹出「深渊再探」。副标题三个写者（区切换 / 位面渗漏 / 时停）改为经 HUD 的唯一写入口 `_renderZoneSubtitle()`，覆盖层优先、撤掉后自动落回 |


---

## 2. 目标

### 2.1 设计支柱（所有取舍以此为准）

1. **手感优先**：任何一次攻击、翻滚、锁定，必须"打得准、停得住、看得清"。
2. **可读的敌人**：招式有前摇/预警/收招，玩家能用时机反制，而非数值硬扛。
3. **数据驱动内容**：新增一个敌人/任务/区域只改数据，不改代码。
4. **帧预算是硬约束**：宁可少一个特效，不可少 10 fps。
5. **可回滚**：每个切片一次提交 + 一条验收记录。
6. **不许静默失败**（v2 新增）：错误要么有文案、要么有断言，禁止 `catch {}` 吞掉。

### 2.2 玩家体验目标

| 时间线 | 目标体验 |
|--------|----------|
| 0–1 分钟 | 进得去、动得起来、知道自己是谁、下一个目标在哪 |
| 1–10 分钟 | 第一次战斗就能感到"打中了"（震屏/火花/飘字/停顿）；死一次能看懂为什么死 |
| 10–60 分钟 | 有成长曲线：掉落能换、技能能点、招式能学；每 10 分钟遇到一个新东西 |
| 1–3 小时 | 5 个区域各有身份；Boss 是"解题"而不是"血条" |
| 通关 | 3–5 小时；有装备/词缀驱动重玩；有支线池与成就收尾 |

### 2.3 量化验收（终局）

| 维度 | 目标 |
|------|------|
| 性能 | 1080p / 中端独显 ≥ 60fps（1% low ≥ 45）；draw call < 400；单帧 JS < 6ms |
| 稳定性 | 连续游玩 30 分钟，`renderer.info` 三项零增长；无未捕获异常 |
| 帧率无关性 | 30 / 60 / 144Hz 下伤害、弹道、判定、位移结果一致 |
| 内容量 | 12+ 种敌人（各 ≥3 招）、6 个 Boss（各 3 真实阶段 + 场地机制）、15+ 支线、3–5 小时通关 |
| 战斗深度 | 装备 + 词缀 + 稀有度、3 条技能树（各 ≥10 节点）、难度 3 档 |
| 视听 | ≥ 20 个真实骨骼动画、区域 BGM + 分层环境音 + 全动作音效；材质含 normal/roughness |
| 架构 | 子系统 ≤ 40；事件名收敛到 1 个可注销类型化总线（**名字侧**：71 条全部登记在 `engine/events.js`，0 个未登记名、0 个死条目，切片5；**注销侧**：`engine/EventBus.js` 的 `on()/emit()/offAll(tag)` 已落地、HUD 20 处监听整体迁移作样板，切片6；剩下 131 处裸监听的逐系统迁移是收缩中的欠账，见待修表 W-B）；**0 处中文显示名匹配**（2026-09-23 达成并由静态门禁兜住） |
| 可访问性 | 键位重映射、字幕、色盲友好 HUD、纯键盘可达全部 UI |

---

## 3. 工作包总览

规模：**S** ≈ 1 切片，**M** ≈ 2–3 切片，**L** ≈ 4+ 切片。

### Phase A — 可玩性急救（当前批次）

| 编号 | 工作包 | 规模 | 依赖 | 状态 |
|------|--------|------|------|------|
| W-A1 | 计时与事件收口（游戏逻辑 `setTimeout` → 主循环 dt；每帧事件改变化派发） | M | — | ✅ 计时与事件两半都收口：`setTimeout` 与特效自建 rAF 归零（B39 / B41 / B43），事件名集中登记 + 静态门禁（B44 命名半区，切片5），总线 `on()/emit()/offAll(tag)` 落地并迁掉最重的监听方 HUD（B44 注销半区，切片6）。**B44 关闭**；剩下的 131 处裸监听逐系统迁移归 W-B（台账只许收缩） |
| W-A2 | 区域身份接口化（`Zone.id`、消 57 处中文匹配、修 B35） | M | — | ✅ 切片1/2/3 完成（B35 / B36 / B42 / B45 关闭）；W-A2 收口，唯一尾巴是 `RestDialogue.js` 的第四份营火名（归 W-B4） |
| W-A3 | 世界空间 UI billboard 化（敌人血条 / 锁定标记 / 预警圈） | S | — | ✅ |
| W-A4 | 战斗取消关系与输入缓冲（连段可取消、翻滚打断、0.18s 输入缓冲） | M | W-A1 | ✅ |
| W-A5 | 镜头混合栈 + 锁定手感（阻尼、越肩、过场平滑交接） | L | W-A1 | ✅ 切片1（过场交接不硬切 `5575801`）+ 切片2（锁定重定位阻尼 `e162c20`）+ 切片3（非锁定瞄准磁吸 `0433777`）完成，A4 三半区全消；余（低优先）：区域 FOV（多来源同时加权 blend 判为不需要，见变更记录）、越肩左右换边（暂缓） |
| W-A6 | Boss 场地机制（红圈 / 弹幕 / 引力 / 时停 四类原型 × 6 Boss） | L | W-A4 | 🔶 切片1（红圈底座 `2043968`：`GroundHazards` 生命周期 + Boss 砸地接线）；切片2（落点圈阵列 `3474fb0`：`BarragePattern` 纯几何铺场 + 大奥术师接线 + 场地夹取）；切片3（场地脚本表 `9daa748`：`content/arenaScripts.js` 数据化闸门，四份手抄起手删除，引力化身/混沌领主读弹幕）；切片4（引力井 `ccff4f2`：危险区第四态"域" —— 时长/tick 结算/向心拉力，井替换引力化身的凭空拉扯）；切片5（时停域 `e039202`：结算器扩成"伤害 / 拉力 / 时标"三选一 + 玩家侧带绳子的时标账本，四档原型齐）；切片6（玩家侧外部冲量通道 `c4f76a2`：井的拉力不再能被按键抹掉，外力与位移意图分开积分）。**四档原型已全部落地；剩"× 6 Boss"那一半是逐 Boss 遭遇编排（现在只有大奥术师/引力化身/执政官有场地脚本，其余走 `default`），归 W-B8 与 B4** |
| W-A7 | 手柄支持 + 键位重映射 | M | W-A3 | 🔶 切片1（`7e20251`：`content/keybinds.js` 绑定表 + 加载期整表校验，`engine/GamepadInput.js` 每帧轮询桥，把按钮/摇杆合成成现有 `keys` 的同一形状 —— 键盘路径与所有消费者零改动）；切片2（`2c359fa`：右摇杆 → 镜头的**模拟量**通路，镜头守卫收成 `cameraInputAllowed(forPointer)` 一处）。切片3（`7d1a01e`：UI 热键改成表 + 边沿轮询 —— `content/hotkeys.js` + `ui/HotkeyRouter`，`escapeRoute` 把七层级联抽成可测的纯函数，手柄 Start 从此开得了暂停菜单）。剩：重映射界面与持久化（两张表已就位）、菜单的手柄导航（摇杆移焦 + A 确认，依赖 **B46**：面板开着时 `Escape` 该关谁仍未定义，归 W-D1 `OverlayStack`）、模拟量移动 |

### Phase B — 内容与深度

| 编号 | 工作包 | 规模 | 依赖 | 状态 |
|------|--------|------|------|------|
| W-B1 | 数据驱动内容层（`content/` 注册表 + 构建期 schema 校验 + 修 B37） | L | W-A2 | ⬜ |
| W-B2 | 消灭 Wave/Extras 叠加（50 文件 / 4,219 行 → `content/`） | L | W-B1 | ⬜ |
| W-B3 | `ObjectiveEngine`（任务分支 / 条件 / 标志 / 失败 / 重访） | L | W-B1 | ⬜ |
| W-B4 | 对话节点图统一（7 个 `RestDialogue*` 合并为一份数据） | M | W-B1 | ⬜ |
| W-B5 | **装备 / 词缀 / 稀有度 / 掉落表** | L | W-B1 | ⬜ |
| W-B6 | 技能树 3×10+（剑 / 杖 / 位面） | M | W-B1 | ⬜ |
| W-B7 | 敌人 5 → 12 类 + 招式扩充 | L | W-B1 | ⬜ |
| W-B8 | Boss 6 个 × 3 阶段重做 | L | W-A6 | ⬜ |
| W-B9 | 区域 5 → 7 + 内部空间 + 竖向日程 | L | W-B1 | ⬜ |
| W-B10 | 地下城房间套件 + 遭遇表 | L | W-B1 | ⬜ |
| W-B11 | 开发期关卡编辑器（放置 / 碰撞 / 导出 JSON / 热重载） | L | W-B9 | ⬜ |
| W-B12 | 支线 7 → 15+ | M | W-B3 | ⬜ |

### Phase C — 视听与性能

| 编号 | 工作包 | 规模 | 依赖 | 状态 |
|------|--------|------|------|------|
| W-C1 | 特效对象池与资源生命周期收尾（`Assets.js` 共享库 + `renderer.info` 零增长门禁） | M | W-A1 | ⬜ |
| W-C2 | `InstancedMesh` / LOD 两档 / 距离剔除（替换冻结逻辑，修 B40） | L | W-C1 | ⬜ |
| W-C3 | 阴影单一所有者 + 紧致投影框 + 画质档 1024/2048/4096 | M | W-C2 | ⬜ |
| W-C4 | 后处理链（MSAA / SSAO / 景深 / 色彩分级 LUT / 区域雾） | L | W-C3 | ⬜ |
| W-C5 | 材质 normal + roughness（程序生成后离线烘焙成图集） | M | W-C4 | ⬜ |
| W-C6 | 真模型接入 + Mixamo → GLB 动画管线（替换 Soldier 占位） | L | — | ⬜ |
| W-C7 | 音频总线 + CC0 素材 + 事件化（`sfx:play(id)`），修 B38 | L | — | ⬜ |

### Phase D — 系统与质量

| 编号 | 工作包 | 规模 | 依赖 | 状态 |
|------|--------|------|------|------|
| W-D1 | `OverlayStack`（模态栈 / 焦点管理 / 指针锁释放）+ HUD 重设计 | L | W-A3 | ⬜ |
| W-D2 | i18n 文案抽取（`content/strings.zh.js` / `.en.js`） | M | W-B1 | ⬜ |
| W-D3 | 设置：画质预设 / 辅助功能 / 多存档槽 | M | W-D1 | ⬜ |
| W-D4 | 测试与 CI（无头 E2E 自动通关 + 性能回归门禁 + GitHub Actions） | L | — | ⬜ |
| W-D5 | 发布工程（分包与预加载、首屏 < 2MB、错误上报） | M | W-D4 | ⬜ |
| W-D6 | 可访问性（色盲 / 字幕 / 纯键盘 / 镜头敏感度） | M | W-D3 | ⬜ |

### Phase E — 长期打磨（不设终点）

| 编号 | 工作包 | 状态 |
|------|--------|------|
| W-E1 | 数值平衡与难度曲线（3 档难度 + 敌人成长曲线） | ⬜ |
| W-E2 | 性能回归门禁与持续优化 | ⬜ |
| W-E3 | 内容持续追加（新敌人 / 新 Boss / 新区域 / 新装备池） | ⬜ |

---

## 4. 阶段路线图与依赖

```
Phase A（可玩性急救）
  W-A1 ─┬─→ W-A4 ─→ W-A6 ─┐
        └─→ W-A5 ────────┘
  W-A2 ──→ W-B1
  W-A3 ──→ W-A7

Phase B（内容与深度）  W-B1 是总闸门
  W-B1 ─┬─→ W-B2  W-B3 ─→ W-B12  W-B4  W-B5  W-B6  W-B7  W-B9 ─→ W-B11
        └─→ ...

Phase C（视听与性能）
  W-C1 ─→ W-C2 ─→ W-C3 ─→ W-C4 ─→ W-C5
  W-C6、W-C7 可并行插入

Phase D（系统与质量）
  W-D1 ─→ W-D3 ─→ W-D6
  W-D4 ─→ W-D5
```

**排期原则**

1. **A 段先做**：A 段全是"玩家立刻能感觉到"的东西，且成本低。
2. **W-B1 是总闸门**：不做数据层，后面每加一个敌人/任务/装备都要改代码，战线必然膨胀。
3. **C 段与 B 段可并行**：只做一条线时 **B 优先**（内容 > 画质，画质受资产限制）。
4. **W-C6 / W-C7 需要外部素材**：素材到位前先做程序化替代并保留接口，来源必须可商用。

---

## 5. 内容扩充清单（数量目标）

| 类别 | 现状 | 目标 | 归属 |
|------|------|------|------|
| 敌人 | 5 类 | **12 类**（各 ≥3 招） | W-B7 |
| Boss | 6 个（无场地机制） | 6 个 × 3 真实阶段 + 场地机制 | W-A6 / W-B8 |
| 区域 | 5 个 | **7 个**（含内部空间、竖向日程） | W-B9 |
| 主线 | 32 步线性 | 带分支的章节制 | W-B3 |
| 支线 | 7 条 | **15+ 条** | W-B12 |
| 装备 | 无 | 装备槽 + 词缀池 + 4 档稀有度 + 掉落表 | W-B5 |
| 技能树 | 8 节点 | **3 条 × 10+ 节点** | W-B6 |
| 地下城 | 4×6 随机迷宫 | 房间模板库 + 连接规则 + 遭遇表 | W-B10 |
| 动画 | 占位 GLB | ≥ 20 个真实骨骼动画 | W-C6 |
| 音频 | 全合成 | 区域 BGM + 分层环境音 + 全动作音效 | W-C7 |

---

## 6. 工程规范与门禁

1. 新代码一律 ESM + JSDoc；`engine/` 目录开 `// @ts-check` 渐进约束（不做全量 TS 迁移）。
2. **游戏逻辑禁用 `setTimeout` / `setInterval`**，统一走 `engine/Time.js` 的 dt（音频音序与 CSS 过渡除外，且须注明理由）。
3. 任何 `new THREE.*Geometry/Material` 必须来自共享库或池；实体 `dispose()` 与 `remove()` 成对出现。
4. 事件名常量化在 `src/engine/events.js`，禁止裸字符串；监听器必须在系统 `dispose()` 中注销。**两半都已落地**：前半是 71 条登记 + `tests/event-registry.test.js` 的硬零断言（切片5，模板串拼事件名同样禁止）；后半是 `src/engine/EventBus.js` 的 `on(name,handler,tag)/emit/offAll(tag)` —— 未登记名当场抛错，系统 `dispose()` 用 `offAll(tag)` 一次结清该实例监听（切片6）。**存量 131 处裸监听的逐系统迁移仍在进行**，由 `tests/event-bus.test.js` 的只许收缩台账兜住（新增裸监听或未配对 `offAll` 当场变红），已迁样板：`ui/HUD.js`。
5. 内容（数值、文案、布局）不写在逻辑文件里。
6. **中文显示名只用于 UI 文本，逻辑判断一律用 `id`**。已由 `tests/content-boundary.test.js` 兜住（静态扫描 + 硬零断言，不留存量白名单；W-A2 切片1 落地时原计划的 lint 规则改走这条，理由见 §9）。
7. 三条硬性约束（承自 M0，仍然有效）：
   - 新增逻辑不得读写其他系统的内部字段，只能调用系统接口或走既定事件。
   - 新增 `THREE.*` 资源必须有明确的创建者与销毁者，副本/重生路径同样要释放。
   - 新增游戏逻辑计时不得用 `setTimeout` / 自建 rAF，必须走主循环 `dt`。
8. **门禁**：`npm run lint`（0 error）→ `npm run test`（全绿）→ `npm run build`（通过且不新增跨块循环）。

---

## 7. 风险与对策

| 风险 | 对策 |
|------|------|
| 战线再次膨胀（本项目的前车之鉴） | 严格按 §8 批次推进；未完成不开新线；新玩法需求一律排入 §8 而非插队 |
| 23k 行无完整回归保护 | 每切片必补测试；改动大系统前先补"行为钉住"用例 |
| 存档格式变更导致旧档失效 | 走 `SaveMigrations` 显式迁移 + `tests/` fixture；禁止静默 catch |
| 真美术/音频素材需外部下载且须可商用 | 先做程序化替代并保留接口；素材来源记录授权 |
| 关卡编辑器投入大 | 只做 dev-only 最小可用版（放置/碰撞/导出），不做通用工具 |
| 无浏览器截图能力（本机 `agent-browser` 安装失败） | 沿用既有做法：注入固定步长驱动真实系统 + node 单测钉住行为；数值可实测 |
| **沙箱内跑测试会假绿**：`vitest` 往 `%TEMP%` 写 SSR 产物被文件代理以 `EPERM` 拒绝，**每次随机丢一个测试文件**且只报 `Errors 1`，`Test Files` 计数悄悄变小（实测出现 26/28/30 三种计数，丢的文件每次都不同） | 跑测试一律**不受沙箱限制**；计数与本文件 §8 记的基线对不上时先怀疑这条，不要当成「测试变少了」 |
| 长周期上下文断裂 | §0 执行协议 + §8 进度看板 + §9 ADR，任何会话可冷启动续做 |

---

## 8. 进度看板

> 状态：⬜ 未开始 / 🔶 进行中 / ✅ 已完成

| 编号 | 工作包 | 状态 | 完成日期 | 提交 | 备注 |
|------|--------|------|----------|------|------|
| W-A1 | 计时与事件收口 | ✅ 计时 + 事件名 + 监听注销三半区全收口（B39/B41/B43/B44） | 2026-09-23 | `95c0533` + 收尾 `4f1adc6` + 切片4 `def9f8d` + 切片5 `bf93a4c` + 切片6 `dae0d51` | 游戏逻辑 `setTimeout` 28 → 0（`Scheduler`，21 处调用点 / 11 文件）；每帧 `stamina/mana` 事件改 `Observable`（B41）；切片4 把 4 条特效自建 rAF（`ExecutionEffects` ×3 + `WeatherSystem` 涟漪）改主循环 dt，并把计时门禁扩到 `requestAnimationFrame`（白名单 4 处 + `rAF-EXCEPTION` 标记双向对齐，B43 关闭）。切片5：`engine/events.js` 建立，71 个事件名全部登记（用途 + 负载形状 + 16 条无监听者理由），静态门禁 `tests/event-registry.test.js` 12 例把"抄错名字"变成构建期红；顺带修掉三条因此静默失踪的内容（CG `bonus:dungeon-clear`、时停副标题、深渊再探提示），三条都在浏览器里复读过。**切片6 关闭 B44 注销半区**：`engine/EventBus.js` 的 `on()/emit()/offAll(tag)` 落地，HUD 20 处监听整体迁移作样板（`dispose()` 结三本账），营火对话改走 `emit()`，`tests/event-bus.test.js` 15 例（含裸监听逐文件收缩台账）。**剩下的只是 131 处裸监听的逐系统迁移欠账**（归 W-B，台账只许收缩），B44 已无未修部分 |
| W-A2 | 区域身份接口化 | ✅ 切片1/2/3 完成 | 2026-09-23 | 切片1 `c4e859a`；切片2 `b4a8416`；切片3 `16edb9e`（收尾见 `4f1adc6` 与本批 docs 回填） | 切片1：`world/ZoneIdentity.js` + `content/franchises.js`，B35 伪对象、B36 的 57 处中文匹配、B42 区域提示门控关闭，`src/` 内中文显示名逻辑判定归零并上静态门禁。切片2：快速旅行目的地与面板"在此"改按 id 认领、`addRestPoint` 缺/重 id 构建期抛错、营火名表与任务区名的第二真源删除、效果层与天气层换成 `ZONE_IDS` 符号；`tests/fast-travel.test.js` 17 例（含变异验证）。切片3：`addPOI` 的 id 回退删除 —— 缺 / 非法 / 重复 id 在世界构建期抛错，56 条位面 POI 与 2 条 hub 记录（共 **58** 条）全部带 kebab-case id，`WorldManager.assertPoiIdentity()` 在 `build()` 与 `attachPopCultureZones()` 收口；`tests/poi-identity.test.js` 14 例在 node 里跑真世界断言整张表（B45 关闭）。**遗留（不属于本包）**：`RestDialogue.js` 的营火标题仍是各写一份的文案（'世界之锚营火' vs 营火实际名 '世界之锚休息点'、'魔法遗境营火' vs 区名 '霍格沃兹遗境'）—— 那是对话树的显示文案，归 W-B4 统一，不在本包偷改 |
| W-A3 | 世界空间 UI billboard 化 | ✅ | 2026-09-23 | `80ca313` | 血条/锁定标记/预警圈移出身体子树、挂场景根，只绕 Y 对齐相机；六处 `createMesh` 的自建血条收进 `hpBarSpec()` + `_buildHpBar()`；`setBodyVisible()` 成为身体可见性唯一出口（收编 6 处写入点，防浮空血条）。伴生改动：满血不再显示血条。`tests/world-ui-billboard.test.js` 37 例（含变异验证 7 红 / 1 红） |
| W-A4 | 战斗取消关系与输入缓冲 | ✅ | 2026-09-23 | `c2eff50` | 关闭 §1.2 短板 A1：`MoveTable` 每招加 `cancel:{from,into}`（`from` 一律 ≥ 命中帧 `at`，取消永不吞已登记的那一刀）—— 轻击→轻/重/翻滚，重击→只翻滚，战技与翻滚为承诺态不可打断（翻滚接翻滚会让无敌帧首尾相接）。`CombatController.canStart()` 统一取消判定；输入先进 `INPUT.buffer=0.18s` 缓冲、只记最近一次按下，当前招式一开放取消窗口就当帧兑现（替掉旧的 `mouseDown` 布尔锁存：重击起手按下的左键会挂到 0.58 秒后才兑现）。`_pressed()` 按下沿检测替掉"清 `keys` 冒充边沿"的旧写法（浏览器长按持续重发 keydown，旧写法让按住 Ctrl 退化成每帧一次翻滚）。弹反举盾表现移到按下当刻 + `_parrySwing` 保证一次按键只播一次、判定逐帧重试；翻滚摘掉上一招残留 `_strike` 防中途突然结算。`tests/combat-cancel.test.js` 22 例（表自证 / `canStart` 逐招 / 缓冲记住与过期 / 只留最近一次 / 长按边沿 / 重生清缓冲 / 取消不吞刀 / 弹反表现只播一次） |
| W-A5 | 镜头混合栈 + 锁定手感 | ✅ 切片1+2+3 完成（过场平滑交接 + 锁定重定位阻尼 + 非锁定瞄准磁吸） | 2026-09-24 | `5575801` + `e162c20` + `0433777` | 关闭 A4 全部三半区：**切片1** `CameraRig.setView` 引入所有权交接（所有者不变每帧直接落笔、不叠第二层阻尼，换人那一帧从当前画面 `smoothstep` 缓动到新目标，`commitView(rawDt)` 与 `commitFov()` 并列收尾；过场 `end()` 不再需恢复相机，`savedCamera` 删除；`CAMERA_BLEND={enter:0.45,exit:0.5}`；首帧认领不补间以兜住既有帧序用例；`tests/camera-blend.test.js` 9 例）。**切片2** 锁定重定位改指数逼近：`CombatController` 每帧把 `targetYaw` 硬写成指向目标 + 旧的 `yaw=targetYaw` 直赋 = 锁定身后敌人一帧甩 180°；落朝向收进 `_advanceYaw(dt)` —— 未锁定直赋（鼠标手感不被抹）、锁定走最短弧按秒指数逼近（帧率无关），命中朝向另走 `getCombatForwardXZ()`（读目标位置）故只缓观感不削准头；`LOCK_ON_CAMERA={yawRate:14,distance:5.4,distanceBlend:0.4}`，锁定力臂裸数收进常数；`tests/camera-lockon.test.js` 8 例。**切片3** 非锁定挥砍瞄准磁吸：`processHitWindow` 对本在锥外、但落在放宽 `extraDeg` 度宽容带内"最对准星的那一个"敌人补判命中，纯宽容（只多打中一个、绝不少打中），锁定/全向不参与，竖直 band 与背刺/格挡仍按真实位置；`AIM_ASSIST={enabled:true,extraDeg:10}`；`pickAimAssistTarget` 纯函数 + `tests/aim-assist.test.js` 12 例。余（低优先）：区域 FOV（多来源同时加权 blend 判为不需要，见变更记录） |
| W-A6 | Boss 场地机制 | 🔶 切片1+2+3+4+5+6 完成（红圈危险区底座 + 落点圈阵列 + 场地脚本表 + 引力井 + 时停域：**B5 四档原型全部落地**；再加玩家侧外部冲量通道） | 2026-09-24 | `2043968` + `3474fb0` + `9daa748` + `ccff4f2` + `e039202` + `c4f76a2` | `combat/GroundHazards.js`：危险区自成一格 —— `spawn(x, z, radius, telegraph, damage, color, owner)` 交出圈，之后"前摇画圈 → 落地结算一次 → 余像淡出"由管理器每帧 `dt` 推进，与施法者彻底解耦（它被打死/被传送都不撤销已经许诺出去的伤害；反过来主人倒地时**还没落下**的圈由 `cancelFor` 撤掉）。圆盘按峰值池化、`update()` 零分配，`radius` 同时是判定边界与圈的最终大小（单位圆盘按米缩放，修掉旧实现"判定 4.5 米、画到 18 米"的说谎圈）。数值在 `content/tuning.js` 的 `GROUND_HAZARD`。`Boss.startSlamTelegraph()` 改交圈并回 `boolean`（无危险区系统时不许起手，免得钉死在 slam 态），`SpaceBoss`/`ChaosBoss` 白捡同一条实现；`Boss.dispose()` 的 slam 圈特例与 `_hideSlamRing` 随之删除。F3 面板加"地面危险区"计数。**切片2（`3474fb0`）落"弹幕"这一档**：`combat/BarragePattern.js` 的 `barrageLayout(cx, cz, spec)` 是纯几何（黄金角 + 面积均匀散点，与 `_summon` 落点同一套路，无随机数、整表可断言），落点顺序**由内向外**错时（第 i 枚前摇 `telegraph + i*stagger`）—— 站住必吃内圈两枚、起手外跑一枚都不吃，这一招收的是"有没有在动"；`Boss.clampIntoArena(x, z, margin)` 把落点夹回竞技场内并留出自己半径的边距（墙外的圈既走不进去也躲不开，属于"预警不说谎"的另一半）；`MagicBoss` phase≥2 且近身时铺场，走 `barrage.cooldown` 自己的节奏、与砸地收招冷却互不抢，圈同样交 `GroundHazards`（主人倒地整片撤销）。数值在 `GROUND_HAZARD.barrage`。`tests/barrage.test.js` 16 例（几何 6 + 接线 10，五条关键断言做过变异验证）。**切片3（`9daa748`）把"什么时候铺场"收进 `content/arenaScripts.js`**：按 `bossId` 声明招式 × 阶段 × 三种互斥闸门（`melee` 抢一次普通挥击的位置 / `timed` 不看距离按每秒期望自己起手 / `opportunity` 冷却到期**且**玩家在 `range` 内），模块加载期整表校验（`assertArenaScript`，错表要在开打前红），`Boss.updateArenaCasts` 成为唯一驱动点；四份手抄闸门（守护者 0.35、引力化身 `dt*0.08`、混沌领主 `dt*0.06`、大奥术师弹幕整段）删除，`spawnVoidBoss` 与 `DungeonManager` 漏注入 `hazards` 造成的"从来不会砸地的 Boss 战"一并修掉。**切片4（`ccff4f2`）落"引力井"，给出危险区的第四种生命周期**：`spawn()` 新增 `duration/tick/pull`，`update()` 从三段变四段（前摇 → 落地 → 持续域 → 淡出），`_sustain()` 在向心拉力（写进 `playerRef.velocity`，所以跑动可以挣脱）之外按 `while (tickT >= tick)` 追帧结算每 tick 伤害 —— tick 数与帧率无关（B39）；主人倒地时**已落地**的域随 `cancelFor` 一起塌，不再从中奖的人身上继续抽血；`SpaceBoss` 那记凭空的速度拉扯换成第三阶段读表开井，数值在 `GROUND_HAZARD.gravityWell`，拉力强度由真实位移宿主实测定档（`pull 8` ≈ 0.55 米/秒漂移：有感、但不夺走控制权）。`tests/gravity-well.test.js` 37 例，九项变异验证各自转红。**切片5（`e039202`）落 B5 最后一档"时停域"**：`GroundHazards.spawn()` 多收 `slow`，结算器从此是三选一（伤害 / 拉力 / 时标），`GROUND_HAZARD.chronoField`（半径 6、前摇 1.1、持续 3.6 秒、`slow 0.3`、`damage 0`）只收机动不掉血；还账恰好三条活路径（出圈那帧 / 到期那帧 / 主人倒地那帧），`_hold`/`_letGo` 各一处、后者幂等，多余的兜底死代码由出现次数门禁算红；玩家侧新增时标账本 `applyTimeScale(key, scale, leash)` / `releaseTimeScale` / `updateTimeScales`（同 key 重复挂取更强且只占一格、跨 key 吃最狠那份、`TIME_SCALE_LEASH 0.12` 秒每帧续绳、断供自己烧完），`timeSlow` 降为 `_syncTimeSlow()` 算出的缓存，消费者仍只有 `speedMultiplier()` —— **改的是玩家自己的时钟，不是 `Game.time.timeScale`**（域吃主循环 `dt`、与游戏时标同进退，这条决策被静态门禁钉死，切片1/2/4 挂了三次的"dt 还是 rawDt"尾巴就此结清）。病灶本体：`VoidBoss` 那记无场时停从前只有"自然到期"一条还原路径，**被打断**与**死在时停里**都会把玩家永久留在 0.35 倍速（无提示、只能重开关卡），现在走同一本账、不再直接写 `timeSlow`。`startGravityWell` 换成通用 `startDomain`（井与场是同一段代码的两种数据）。`tests/chrono-field.test.js` 40 例（账本 7 + 域的生命周期 12 + 时标归属 3 + 表 5 + 执政官接线 13），12 项变异全部转红且各归其位（失败数 2/4/2/3/4/1/1/1/11/2/4/1）。**切片6（`c4f76a2`）把"被拖着走"做成一件有所有权的事**：`PlayerController.knock` 外部冲量账 + `applyKnockback`（脉冲）/ `applySustainedForce`（持续力，按本帧积分记，稳态速度精确 `= accel/decay`）/ `clearKnockback` / `_stepKnock`。核心是**两条通道分开积分** —— 外力从前并进 `velocity`，而那条通道自己也在被 locomotion 的摩擦衰减，同一个拉力被喂两遍（实测站住一秒漂 3.53 米，且稳态随帧率翻倍）；改成 `_stepKnock` 只交差值、在碰撞积分处与速度相加，稳态就是 `pull/decay ≈ 0.73` 米/秒。病灶本体：`moveHorizontal` 是整条改写水平速度的，所以按住方向键每一帧都抹掉拉力，那口井只对撒手站着的人生效。`GroundHazards` 的拉力与 `SpaceBoss` 那记凭空拖拽同时搬进这条通道（两处静态门禁不许再对 `velocity` 赋值），`teleport()` 无条件清账。`PLAYER_KNOCK.decay` 与 `HIT.decay` 同档并由断言守住（"我推敌人一下"与"场拽我一下"同一个钟）。`tests/player-knockback.test.js` 20 例，12 项变异各归其位（7/2/1/1/5/2/1/13/2/7/1/2）。待做：逐 Boss 遭遇编排（三只之外仍走 `default`，W-B8 / B4）、把圈接进阶段演出（`BossPhaseDirector`）、玩家受击击退接到这条通道、圈/井/场的表现层可读性（M5/M6） |
| W-A7 | 手柄支持 + 键位重映射 | 🔶 切片1+2+3 完成（手柄轮询桥与绑定表 + 右摇杆镜头 + UI 热键可轮询） | 2026-09-24 | `7e20251` + `2c359fa` + `7d1a01e` | 桥只做一件事：把 `navigator.getGamepads()` 的形状合成成现有 `keys`（`KeyboardEvent.code` 形态）与 `CombatController.mouseDown`，所以 locomotion / 战斗 / 法术 / 换武器四条消费者与键盘路径**逐字不动**。`content/keybinds.js`：14 个逻辑动作（移动四向 / 冲刺 / 跳 / 滚 / 弹反 / 战技 / 锁定 / 轻击 / 重击 / 法术一 / 换武器），每条声明 `mode`（`level` 按住即真 / `edge` 只在按下那一帧真）与出口（`code` 或 `mouse`，二选一），加载期 `assertKeybinds()` 整表校验（动作名与键名对齐、出口被抢用、移动动作绑错来源、未知按钮名全部当场抛）。三条边界各有用例：① **只还自己借走的那一格**（`claimed`）—— 键盘与手柄共用 `KeyW`，手柄回中不许抹掉键盘按着的那一份；② **`edge` 不连发** —— 一批老消费者是"读完把 `keys[code]` 清成 false"的写法（`KeyQ`/`KeyX`/`Digit4`/`KeyE`），给电平就是按住每帧触发一次（W-A4 修过的同类事故）；③ **拔手那一帧必须还键** —— 不清玩家会永远朝前走。摇杆走八向量（正方向各 ±22.5°、斜方向各 45°，`atan2` 量化）而不是"两轴各自过门限"，后者会让"想纯向前却斜着走"成为常态；十字键由动作的 `dir` 顺带同绑，不必另列一条。`tests/gamepad-input.test.js` **27 例**（表 8 + 不碰键盘 3 + 电平与边沿 10 + 热插拔 3 + 接线 3），全套 **698 例 / 43 文件**、lint 0 error / 10 warning 持平、build 绿；浏览器实测（5189 dev 口，注入假 `navigator.getGamepads` 后走真 `Game.update()` 主循环）：推杆 → `keys.KeyW` 为真、玩家从 (0,60) 走到 z=57.35（**2.65 米**，全程没有任何键盘事件），杆回中后 `g.keys` 里没有任何残留 true。**切片2（`2c359fa`）接右摇杆镜头**：镜头要的是**模拟量**（推一点转一点），所以它**不冒充 `keys`** —— 桥交回一枚复用槽 `look = {x, y}`，单位是"每秒相当于推多少鼠标点"（`PAD.lookPixelsPerSecond 1300`，配 `cameraSensitivity 0.002` = 2.6 弧度/秒 ≈ 150°/秒），主循环乘 `rawDt` 后喂给真实的 `addCameraInput`（灵敏度仍然只有那一个真源）。死区 0.15 之内算没碰，出死区把模长**重映射回 0~1**，免得"一出死区就是满舵"。与移动那条互不串门（左杆 axes[0/1]、右杆 axes[2/3]，各有用例钉住）。顺带把镜头输入守卫收成 `Game.cameraInputAllowed(forPointer)` 一处 —— 鼠标要指针锁、手柄没有指针锁这回事，两条路共用同一判据（`autoPlayMode` / `blocksCamera` / 面板开着）而不是各抄一份。拔手那一帧舵量归零（不清就是镜头一直转）。新增 8 例（`gamepad-input.test.js` 27 → **35**），全套 **706 例 / 43 文件**；八项变异全部转红（死区取消 / 不重映射 / 丢俯仰轴 / 拔手不还舵量 / 主循环不乘 dt / 手柄也要求指针锁 / 右杆读成左杆 / 速率退化成布尔 → 1/1/2/1/1/1/5/1）。浏览器实测（5190 dev 口注入假手柄）：未点过画面时 `cameraInputAllowed(false)=true`、`(true)=false`（手柄不必指针锁，鼠标仍要）；满舵 12 帧（ΣrawDt=0.251 秒）Δyaw **0.6534** 弧度 = 1300×0.002×0.251 精确吻合 ≈ **149°/秒**；杆回中与拔手那一帧 `look` 都是 0。**切片3（`7d1a01e`）把 UI 热键从 `keydown` 分支改成"表 + 边沿轮询"**：`content/hotkeys.js`（15 条 `{code, action, preventDefault?}` + 加载期 `assertHotkeys`，code/action 双唯一）与 `ui/HotkeyRouter.js`（`onKeydown` 只决定要不要挡浏览器默认行为、`poll` 派发边沿并再问一次阻塞判据；状态是一根定长数组）。`Game` 侧：`keydown` 监听器缩成三行，守卫原样变成 `hotkeyBlocked()`，15 个动作进 `runHotkey()` 的 switch，`update()` 每帧 `hotkeys.poll(this.keys)`。**`Escape` 那七层级联抽成纯函数 `escapeRoute(state)`**（六进一出，之前全仓零测试；`trySkip()`/`canSkip()` 是带副作用的谓词，入参只求值一次所以顺序等价）。`keybinds.js` 加 `start → Escape`，于是切片1 那条"不许绑事件码"的界碑翻案成"手柄开得了暂停菜单"（用例同步改写）。副作用两条都是好的：按住热键不再跟着浏览器重发连发（按住 `Tab` 抖面板），以及键盘/手柄走同一个派发口。新增 `tests/hotkey-router.test.js` **16 例**（表 5 + 派发语义 7 + 级联 4），两条静态门禁：`runHotkey` 的 `case` 集合与 `UI_ACTIONS` 集相等、`keydown` 监听器里不许再出现 `e.code ===`。八项变异全部转红（2/2/1/1/1/1/2/3）。全套 **722 例 / 44 文件**、lint 0 error / 10 warning、build 绿。浏览器实测（5191 口）：真实 `keydown KeyV` 两按两切、一按一停；假手柄按 Start → `pauseMenu.open`/`paused` 双真。当场记入 **B46**（面板开着时 `Escape` 该关谁从未定义 → 暂停菜单只能点"继续"关，键盘与手柄同样）：登记 §1.4 待修、归 W-D1 `OverlayStack`，不在本片就地拼。待做：重映射界面与 `SettingsManager` 版本化（两张表已就位）、菜单的手柄导航（依赖 B46）、模拟量移动、HUD 键名随输入设备切换、震动 |
| W-B1 | 数据驱动内容层 | ⬜ | | | 总闸门 |
| W-B2 | 消灭 Wave/Extras 叠加 | ⬜ | | | |
| W-B3 | ObjectiveEngine | ⬜ | | | |
| W-B4 | 对话节点图统一 | ⬜ | | | |
| W-B5 | 装备/词缀/稀有度 | ⬜ | | | |
| W-B6 | 技能树 3×10+ | ⬜ | | | |
| W-B7 | 敌人 5→12 类 | ⬜ | | | |
| W-B8 | Boss ×3 阶段重做 | ⬜ | | | |
| W-B9 | 区域 5→7 | ⬜ | | | |
| W-B10 | 地下城房间套件 | ⬜ | | | |
| W-B11 | 关卡编辑器 | ⬜ | | | |
| W-B12 | 支线 7→15+ | ⬜ | | | |
| W-C1 | 特效池与资源生命周期 | ⬜ | | | |
| W-C2 | InstancedMesh / LOD | ⬜ | | | |
| W-C3 | 阴影单一所有者 | ⬜ | | | |
| W-C4 | 后处理链 | ⬜ | | | |
| W-C5 | 材质 normal/roughness | ⬜ | | | |
| W-C6 | 真模型 + 动画管线 | ⬜ | | | 需外部素材 |
| W-C7 | 音频总线 + 素材 | ⬜ | | | 需外部素材 |
| W-D1 | OverlayStack + HUD 重设计 | ⬜ | | | |
| W-D2 | i18n | ⬜ | | | |
| W-D3 | 设置与多存档槽 | ⬜ | | | |
| W-D4 | 测试与 CI | ⬜ | | | |
| W-D5 | 发布工程 | ⬜ | | | |
| W-D6 | 可访问性 | ⬜ | | | |

---

## 9. 变更记录（ADR）

> 每条记录必须回答：**为什么做 / 放弃了什么 / 留了什么尾巴**。

- **2026-09-22 v2.0 制定**：把 v1（`OVERHAUL_PLAN.md`）从"重构计划"升级为"增强与内容总计划"。
  - **为什么**：v1 的 M0–M3 已完成（工程地基、移动碰撞、战斗重做、镜头收口），继续按"重构视角"排期会让项目一直停在"修地基"，而玩家感知到的是**内容与手感不足**。v2 把剩余工作重新切成 4 个阶段 + 33 个工作包，并补上 v1 缺失的"玩家体验目标"与"内容数量目标"。
  - **放弃了什么**：不再维护两套并列的"唯一权威计划"。`OVERHAUL_PLAN.md` 保留为工程详录（B 系列台账与 M0–M3 逐切片验收证据有长期价值），但排期一律以本文为准。
  - **留了什么尾巴**：W-C6 / W-C7 依赖外部可商用素材，在素材到位前只能做程序化替代；`agent-browser` 在本机安装失败（`npm.ps1` 的 `$LASTEXITCODE` 报错），短期仍无法截图验证，已写入 §7 风险表。

- **2026-09-23 W-A1：计时与每帧事件收口（`Scheduler` + `Observable`，修 B39 / B41）** —— 提交 `95c0533`
  - **为什么**：三条硬性约束里"计时必须走主循环 dt"这一条，当时是全仓最大的一块欠账：28 处游戏逻辑 `setTimeout` 分散在 10 个系统里，它们各自拿了一份墙钟，而世界的时间只有一份。同一处病灶的另一面是 B41 —— `CombatController.update()` 每帧派发一条 `'stamina-changed'`，60fps 下就是每秒 60 条内容完全相同的 CustomEvent。**它不是事件，是披着事件外衣的状态轮询**。后果具体到玩家身上：hitstop 把世界按住了，横幅、教程气泡、Boss 阶段提示却照常跳（这三处都是 `setTimeout`），而 HUD 与教程系统在每一帧都被同一条"精力变了"的消息唤醒。
  - **交付**：`engine/Scheduler.js`（`after/wait/cancel/clear(tag)`，按 rawDt 推进，一抛错不连累同帧其他任务但异常照抛）替换掉 21 处调用点、11 个文件；`clear(tag)` 是给"面板关了、系统 dispose 了、副本换了"这三条撤销路径准备的，B19 那一类"回调打到失效对象上"从机制上没了落脚处。`engine/Observable.js`（`quantize` 跨档才广播、`emits/writes` 两个计数器、`subscribe` 返回退订）接管战斗与法力两侧 8 枚观测量，`HUD` 存 `_offs` 并在 `dispose()` 成对退订。门禁 `tests/timing-boundary.test.js` 4 例：剥掉注释与字符串后扫 `src/**`，除 `audio/` 外不许出现 `setTimeout/setInterval`，并反向钉住"调度器自己无定时器、无 DOM"与"主循环确实用 rawDt 推它"。该提交时点：299 例 / 23 文件全绿。
  - **回填本片时抓出的一处代码与注释不一致**：`Scheduler.wait()` 写着"暂停时不推进"，而 `Game.update()` 里 `scheduler.update(rawDt)` 就排在 `canPlay` 那道暂停门控**之前** —— 真实语义是"后台标签页里 rAF 停摆所以不推进，游戏内暂停则照常到期"（UI 与演出量的是真实观看时间）。注释已改正，并给门禁补第 5 例把"推进点在 `canPlay` 之前"钉住：反着挪一行不会让任何功能测试变红，症状只是"打开背包时提示全冻住"。
  - **放弃了什么**：① 没给 `Scheduler` 做"按 `timeScale` 缩放"的第二条时间轴 —— 一把尺子两种用途一定会含糊，最后定死"调度器只吃 rawDt（演出与 UI 节奏不该被时停拉长），玩法自身的计时留在各系统自己的 dt 积分里"（`CombatController.schedule` 是这一类的既有落点）。② **原计划放在 W-A1 里的"事件名常量化总线"（规范第 4 条）没做**：`src/engine/events.js` 至今不存在，292 处裸字符串要连着补注销路径一起改，硬塞进这一片会把一件已经能验证的事（计时）拖成一件不能验证的事。这笔账登记为 B44，不再含糊地算作"W-A1 已完成"。③ `AudioManager` 的 6 处墙钟（4 `setTimeout` + 2 `setInterval`）保留：音序本质是给 Web Audio 调度时间，与世界的缩放无关，门禁给它开了显式例外并要求写明理由（B38 / W-C7）。④ 三处为 CSS 过渡制造"下一次绘制"的 `requestAnimationFrame`（`Dialog` / `ExecutionSkipBurst` / `CombatCameraDirector`）保留 —— 用 `after(0)` 会和赋值同帧，过渡根本不发生。
  - **留了什么尾巴**：**B43** —— `ExecutionEffects`（3 条循环）与 `WeatherSystem._spawnSplash` 仍自己 `requestAnimationFrame` 递归，并把 dt 写死 `0.016`：144Hz 下一片碎片只活约 0.15 秒（设计值 0.35），30Hz 下拖到 0.7 秒，hitstop 期间照速跑。**这条当时被漏掉了**，因为门禁的正则只扫 `setTimeout|setInterval`，自建 rAF 是它的盲区（B43 已于同日的 W-A1 切片4 关闭，提交 `def9f8d`，见本节末尾那条 —— 原文保留是因为"当时为什么会漏"本身就是这条记录的内容）；B44 见上。⑤ 本片的看板与 ADR 是**事后回填**的（提交在前、文档在后），这正是要写进 §0.3 DoD 的原因：记录落后于代码的这段时间里，任何人读 §8 都会得到"W-A1 未开始"的错误结论。
  - **仓库起点说明**：`95c0533` 同时是仓库重建点。执行 W-A1 时用 `git stash` 做基线对比，该命令把整个 `.git` 移入回收站且对象库不可恢复，21 条提交丢失（工作区文件完好）。现仓库的历史以 `docs/` 为准，且本项目**禁用 `git stash`**（基线对比走只读的 `git diff <ref> -- <path>` 或临时副本）。

- **2026-09-23 W-A2 切片1：区域身份接口化（修 B35 / B36 / B42）** —— 提交 `c4e859a`
  - **为什么**：57 处中文显示名匹配从来不是风格问题，而是"**内容会静默消失**"。动手前查到的真实病例：`QuestSystem` 用「名字里含『虚空』」判定精英，于是 Boss 召出的「虚空仆从」（`type` 其实是 `soldier`）全被记成 elite —— 精英任务白送，而主线「影之试炼」要的两名 soldier 永远数不满，玩家卡在第二章却看不到任何报错；`RealmBleed.zoneKey()` 六条 `includes` 里任何一条的措辞改掉，那一区的渗漏色就永久不再出现；`ContextualTutorial` 的两条区域提示干脆不看进的是哪个区（B42），第四章后走进任何一个位面都会弹出"破碎时线：重力与视野在此不稳定"。
  - **交付**：新增 `world/ZoneIdentity.js`（`ZONE_IDS / ZONE_ORDER / ZONE_NAMES` + 冻结的 `HUB_ZONE / CORRIDOR_ZONE` + `zoneIdAt / resolveZone / zoneDescriptor / isRealZone`）与 `content/franchises.js`（`FRANCHISE` 12 枚母题 id + `FRANCHISE_LABELS` + `franchiseLabel`）。判定面全线换成 id：区域归属由几何反推（`WorldManager.update` 里那段手写距离比较删掉，B12 顺带闭环）、枢纽与走廊改用冻结真描述（B35）、击杀归类看 `type`、任务交互看 `targetId`、49 条致敬回声的 `franchise` 字段改 id、成就分桶改表驱动（`ECHO_FRANCHISE_BUCKETS`）。台词选池 `barkKeyForZone(zoneId, rng)` 把随机数**收进参数**而不是自己掷骰 —— 否则那一半分支永远测不到。
  - **门禁**：`tests/content-boundary.test.js` 5 例做**硬零**断言（不留存量白名单，任何新中文判定直接变红）。它扫的是剥掉注释与字符串之后的真实代码，字符串里的 `//` 不算注释（逐行状态机，行号与磁盘一一对应，报出来的位置必须点得开）。行为面另两份：`tests/zone-identity.test.js` 28 例、`tests/franchise-identity.test.js` 7 例。**关键的防假绿设计**：其一，用例先把本轮新建的两个模块"探针式"断言在扫描集里（并断文件总数下界），因为静态扫描最容易犯的错就是扫了份过期快照然后一路绿灯；其二，把全部区域显示名换成乱码后重跑归属与雾色路径，要求事件序列一模一样 —— 这是"文案与逻辑真的解耦了"的正面证据，而不是"当前文案恰好能跑"的旁证；其三，击杀归类那组做过"把旧写法贴回去"的验证：贴回去后 2 例与内容边界门禁同时变红。
  - **行为增量（玩家会看到的差别，如实列）**：① 区际走廊不再等于 `null`，它有 id —— 转场特效此前在"位面 → 走廊"那一步会被当成 `hub` 去重（不响），现在会响；天气落回 `hub` 预设、`WorldEffects` 各组在走廊里全关（这两条与修前一致）。② 音频拿到 `corridor` 这个 `ZONE_DRONES` 里没有的键，落回 `wild` 底噪（修前落回的是 `hub`）。③ 精英击杀数不再把「虚空仆从」算进去、士兵击杀数开始算它 —— 于是「影之试炼」第一次成为可完成的任务。④ 魔法区的紫色尘粒与法球在实读时**第一次出现**（修前该区的光效分支按中文名比较，从没进对过）。⑤ 破碎时线 / 混沌边境的两条教程提示变"严格"了：必须真的重新进入该区才看得到（修前第四章后随便进任何一个区都会弹）。
  - **放弃了什么**：① **原计划的 lint 规则不做**。社区没有"中文字面量参与相等判定"这类规则，自研 ESLint 插件的成本远高于一条 vitest 静态用例，而且 lint 只看单文件 —— 它看不出 `zoneName === '混沌边境'` 与 `ZONE_NAMES` 之间的关系，静态扫描却能同时覆盖匹配类（`includes/indexOf/startsWith/…`）与相等类（`=== / !== / case`）。§6 规范第 6 条已就地改指这条门禁。② 顺手加过一个 `FRANCHISE_FILTERS` 导出，发现没有任何读方，删掉了 —— 图鉴筛选的 `all` 哨兵留在 `FRANCHISE_LABELS` 里并注明它不是母题。③ `PopCultureHomageRegistryWave3` 的 `TRIAD_FRANCHISE_META` 整块无人引用，删除而不是"留着以后可能用"。
  - **一次自我更正（必须留在记录里）**：门禁调试阶段我曾把"vitest 报出的命中行号在磁盘上点不开"归因为**扫描到过期快照**，并把这句写进了测试注释。那是错的归因 —— 真因是我在读自己后续批量编辑**之前**的 vitest 输出，同时第一版 `NAME_COMPARE` 的反向引用写坏了。已把注释改成正确的防假绿理由。留着这条更正的理由：本项目多次出现"绿色但什么都没拦住"的风险，**记录必须与真实做过的事一致**，写一条没验证过的归因比不写更糟。
  - **留了什么尾巴（切片2 的清单）**：① `FastTravelSystem.travel(name)` 仍按显示名查目的地，`getDestinations()` 把 id 直接丢了，`RestPointManager` 的 `id: id ?? name` 也会回落成显示名 —— 改一行营火文案就能让快速旅行面板点不出目的地。② `QuestSystem` 的 `QUEST_WAYPOINTS` / `TARGET_WAYPOINTS` label 与 `ZONE_NAMES` 已经漂移（前者写 '魔法遗境'，后者是 '霍格沃兹遗境'），文案仍有两份真源。③ 效果层（`WorldEffects` / `WeatherSystem`）判定用的是 id **字面量**（`zoneId === 'space'`），逻辑正确但没有符号名，改 id 时不会变红。④ `src/content/` 目前只有 `tuning.js` 与本片的 `franchises.js`，W-B1 的注册表与构建期 schema 校验尚未起步。

- **2026-09-23 W-A2 切片2：快速旅行与营火身份收口（B36 收尾）** —— 提交 `b4a8416`
  - **为什么**：切片1 把"用中文名做判定"清零了，但**"同一个事实写两份"**还剩三处，而且已经能查到实物病例：营火显示名有两张表（`RestPointManager` 写 '世界之锚休息点'，`CampfireMemorySystem` 的 `REST_NAMES` 写 '世界之锚营火'，`magic` 那格写的是早已废弃的 '魔法遗境营火'，而区名实为 '霍格沃兹遗境'）。更糟的是旅行链路整条按名字走：`travel(name)` 用 `d.name === name` 找目的地，`getDestinations()` 把 id 丢掉只留名字，面板的"在此"是 `d.name === fromName`，`addRestPoint` 的 `id: id ?? name` 还会把显示名当 id 兜底。合起来的后果是**两座同名营火会一起变灰、点哪座都跳第一座；改一句文案面板就点不出目的地** —— 而这两种都不会报错。
  - **交付**：`RestPointManager` 变成 id 契约的守门人 —— 缺 id 或重复 id **在世界构建期直接抛错**（静默兜底正是这个缺陷的成因，不再留第二份），新增 `ids()` / `nameOf(id)`（查不到返回 `null`，兜底文案由调用方决定，不许拿 id 冒充名字），默认营火表由 `ZONE_IDS` + `ZONE_NAMES` 生成；`FastTravelSystem` 的 `travel(id)` / `destinationsForPanel(currentId)` 全按 id 走，`FastTravelPanel` 渲染 `data-id` 并按 `here` 禁用；`CampfireMemorySystem` 的重复名表删除（含 `CAMPFIRE_REST_NAMES` 导出）；`QuestSystem` 指向位面的路点 label 改取 `ZONE_NAMES`；`WorldEffects.setZone()` 与 `WeatherSystem` 的 `ZONE_PRESETS` 换成 `ZONE_IDS` 符号（后者用计算键 `[ZONE_IDS.X]`）。
  - **门禁与防假绿**：`tests/fast-travel.test.js` 17 例（全仓 356 例 / 26 文件全绿；lint 0 error / 10 warning，文件集合与上批一致；构建通过）。三条关键用例**做过变异验证**，不是"恰好能跑"：把 `travel` 与 `here` 贴回按名字比 —— 5 例变红；把 id 契约贴回 `id = id ?? name` 并关掉重复抛错 —— 2 例变红。正面证据是那条"显示名全换成乱码后旅行结果不变"，以及"同名两座各自精确跳"。改完复扫：`src/` 内区域 id 字面量比较 **0 处**，`.name ===` 只剩注释里的一处引用。
  - **行为增量（玩家会看到的差别，浏览器实读见下）**：① 快速旅行面板里"在此"只灰脚下那座，同名另一座恢复可点（此前一起灰）。② 营火显示名与所在位面的区名一致了：魔法区的营火从 '魔法遗境营火' 变成 **'霍格沃兹遗境营火'**（面板行、`[E] 休息 / 升级 — …` 提示同步跟上）；营火记忆图鉴里作为说话人的营火名，也从那张已被删掉的旧表（'世界之锚营火'）变成世界里真实的那一个（'世界之锚休息点'）。③ 营火记忆图鉴的筛选项改成"实际存在的营火"，不再是一张写死的表。④ 开发者侧：营火 id 缺失/重复现在会在启动时抛错，而不是跳错地方。⑤ `WorldEffects` / `WeatherSystem` 的符号化**无可感知变化** —— 字面量与 `ZONE_IDS` 的值本来就相同，这一条买的是"改 id 时会变红"，不是修复。⑥ **任务路点那处漂移其实不产生玩家可见变化**（写这段时我先以为是"第二碎片的指引文字改对了"，读码后不成立）：`getQuestWaypoint()` 对 `discovery` 任务优先取 `TARGET_WAYPOINTS[q.targetId]`，而 'magic-castle' / 'space-tesseract' / 'void-rift' 都在里面，所以 `QUEST_WAYPOINTS` 那三条改掉的 label 走不到；本表唯一可达的改动项是 `soldiers`（kills 任务），它的值前后都是 '灰白森林'。留着这条更正的理由：删掉第二真源仍然有意义（那三份拷贝以后不会再各自漂），但**收益是结构性的，不是玩家看得见的修复**，记录里不能把前者写成后者。
  - **浏览器实读（`localhost:5178`，真实 `game`，视口 0×0 不渲染但代码路径为真）**：`restPoints.ids()` → `hub / fantasy / magic / space / void / abyss`，其中魔法区那座营火的名字确为 '霍格沃兹遗境营火'；`fastTravelPanel.show('magic')` 后 DOM 里 6 个 `.ft-btn` 只有 `data-id="magic"` 那一个 `disabled === true`；`travel('void')` 把玩家从 `(0, 999)` 放到 `(0, 5.10, 210)`（y 来自真实地形采样，不是 0），血量 35 → 118（= `maxHp`）；`travel('no-such-fire')` 返回 `false` 且不动玩家；把 6 座营火的显示名全部改成 `===garbled===` 后 `travel('fantasy')` 仍精确落到 `(-200, 0)`；`addRestPoint(..., 'hub')` 抛出 '营火 id hub 重复'，`addRestPoint(...)` 缺 id 抛出 '营火「x」缺少 id'。
  - **放弃了什么**：① `RestDialogue.js` 的营火标题（'世界之锚营火'、'魔法遗境营火'…）没跟着改。那是对话树的**显示文案**、按 rest id 取用（不参与判定），但它确实是第四份营火名字 —— 一并改属于"对话节点图统一"，硬塞进本片会让 W-B4 少一块它本该解决的证据。登记为 W-A2 尾巴，明写在这里而不是悄悄修掉。② `chaos-core` 等指向具体物件的路点保留自名，它们不是区域文案的第二真源。③ 没给 `destinationsForPanel` 加"未解锁则为空"的门控：解锁判定在 `tryOpen` 一处即够，两处门控迟早漂移。
  - **新登记的缺陷**：**B45** —— `BaseZone.addPOI` 未显式给 id 时回退成 `` `${this.id}-${label}` ``，把显示名嵌进了 id（5 个位面 14 处调用全部走这条回退）。实测**尚无玩家可见故障**（碎片进度由 `onInteract` 派发的显式 `discovery` id 驱动，`hub-anchor` 也是显式 id，`discovered` 未进存档），所以它是契约隐患而非已发生损坏；归属 W-A2 切片3 / W-B1。

- **2026-09-23 W-A2 切片3：POI 稳定 id 契约（修 B45）** —— 提交 `16edb9e`
  - **为什么**：`addPOI` 在没传 `options.id` 时回退成 `` `${this.id}-${label}` ``，等于**把显示名写进了稳定身份**。修复前那 14 处位面 POI 的 id 实测长这样：`fantasy-调查至尊石环`、`abyss-触碰混沌之核` —— 中文串进了 id。而 `onInteract` 里人肉派发的 `discovery` id 是另一套（`fantasy-ring`、`chaos-core`）：**同一个地物在表里有两个互不相干的字符串身份**。为什么没坏：按 POI id 认领的下游只有 `poi-interact` 事件（`PlayerController` 把 `nearbyPoint.id` 派发出去、`QuestAssistant` 按 `q.targetId` 模拟点击），而主线 interact 任务的 `targetId` 五处全是 `hub-anchor` —— 那是唯一一处**显式给了 id** 的调用，恰好躲过回退。也就是说：谁把任何一个位面地物写成任务目标，那一刻起任务就永远完成不了，且不报错。碎片进度走的是 `discovery` 事件，所以修前修后都不受影响（见"行为增量"）。
  - **交付**：回退删除，`addPOI` 换成与 `RestPointManager.addRestPoint` 同一条契约 —— **缺 id / 非 kebab-case / 同区重复 id 三件事都在世界构建期抛错给开发者看**（静默兜底本身就是这个缺陷的成因）。14 处位面调用与 42 处致敬层登记补齐显式 id，规则是"凡 `onInteract` 派发 `discovery` 的，POI id 必须等于那个发现 id"（这条由测试逐条遍历整张表钉住，不是逐处口头承诺）；唯一不同名的 `fantasy-ring-echo`（致敬层在至尊石环旁立的第二块碑）不悄悄豁免，走测试里那张 `DISCOVERY_ALIASES` 表 —— 加别名必须写进表，且表本身有一条用例断言"指向的 POI 还在登记那个发现"，防止豁免名单变成僵尸。`WorldManager.assertPoiIdentity()` 在 `build()` 与 `attachPopCultureZones()` 各调一次：后者是**最后写入 `pointsOfInterest` 的一方**，所以合并后的全量表必须在那里再收一次口 —— 同一段逻辑两个调用点，不是两道会各自漂移的门。
  - **门禁与防假绿**：`tests/poi-identity.test.js` 14 例（全仓 **370 例 / 27 文件**全绿；lint 0 error / 10 warning，文件集合与上批一致；构建通过，本批计时 3.48s）。区域本身能在 node 里无浏览器构建（`new WorldManager(scene, dialog).build()` + 四层致敬增强器 ≈ 0.5s，只有 THREE 材质告警），所以这里跑的是**真世界的整张表**而不是手写夹具 —— 逐个调用点补 id 是最容易漏一半的活。正面证据两条：把全表 label 换成乱码后 id 序列与交互派发结果一模一样；`discovery` 型 POI 的 id 必须等于它派发的发现 id（别名除外）。变异验证：贴回 `options.id ?? \`${this.id}-${label}\`` 并关掉 kebab 校验后，"缺 id 当场抛错"与"非法 id 被拦"两例变红；绕过 `addPOI` 直接往表里塞（重复 / 裸对象 / 中文名 id）三例由 `assertPoiIdentity` 拦住。
  - **行为增量**：**对玩家无可感知变化** —— 这一点必须写明白，别把契约修复记成 bug 修复。B45 登记时就注明了"尚无玩家可见故障"，切片3 兑现的是那个判断：碎片进度此前按 `discovery` 事件走，现在照旧。真正的收益在开发者侧：改任何一条 POI 文案不再可能悄悄改掉它的 id（构建期即抛），以及 `discovered` 标记进存档（W-B1 / 存档 v6）之前，按 id 寻址的前提已经成立。
  - **浏览器实读（`localhost:5178`，真实 `window.__game`，视口 0×0 不渲染但代码路径为真）**：`pointsOfInterest` 共 **58** 条，非法 id `[]`、重复 id `[]`，前 8 个为 `hub-anchor / fantasy-ring / fantasy-ruins / fantasy-tower / fantasy-boss-gate / magic-castle / magic-forest / magic-boss-gate`，`homage-*` 41 条；场景里 **56** 个 marker 带 `userData.poiId`，其中空值 / 非法值 **0** 个；控制台只剩已知的 0×0 视口 WebGL 帧缓冲告警（本批两次读数 97 与 106 条，随刷新次数变化），JS 错误 0 条。
  - **一处计数更正（留在记录里）**：提交信息 `16edb9e` 写的是"55 个 POI 全部显式带 id"。55 是我按 `homage-*` 前缀统计致敬层时得到的**调用点数**（14 位面 + 41 `homage-*`），不是登记表真值：位面上还有第 56 条 `fantasy-ring-echo`，hub 层另有 `hub-anchor` 与 `hub-poster-wall` 两条**不走 `addPOI`** 的直接 push（后者正是最终自检存在的理由）。以 **58** 为准，上表与测试口径都已按 58 记。
  - **放弃了什么**：① `fantasy-ring-echo` 与 `fantasy-ring` 的地物重复没删 —— 那是 W-B2（Wave 叠加导致的内容重复）的靶子，本切片只管身份不管内容。② 没把 POI 表挪进数据注册表：`addPOI` 的签名与调用点就是内容层，W-B1 的数据驱动改造会一并处理，现在改属于提前设计。③ `discovered` 仍不进存档 —— 加字段要走 v6 迁移，不在本切片夹带。④ `RestDialogue.js` 的第四份营火名（W-A2 尾巴）仍在，归 W-B4。

- **2026-09-23 W-A1 切片4：处决特效与雨滴涟漪改主循环 dt（修 B43）** —— 提交 `def9f8d`
  - **为什么**：`setTimeout` 归零之后，"绕过主循环的时间"还剩另一条路 —— 自己 `requestAnimationFrame` 递归。`ExecutionEffects` 的三条循环与 `WeatherSystem` 的涟漪都是这么写的，而且把每帧时长**写死成 `0.016`**。合起来的后果是寿命按**帧数**而不是按秒走：144Hz 的机器上一片血雾碎片约 0.15 秒就消失（设计值 0.35~0.6 秒），30Hz 下拖到 0.7 秒；更要紧的是暂停与 hitstop 期间它们照常跑完 —— 而 hitstop 那 0.1~0.2 秒正是"这一刀很重"的读数窗口，特效本该和它一起停。规范第 3 条禁的就是这个，B43 是它在存量代码里的最后一处。
  - **交付**：三条循环与涟漪改由 `update(dt)` 推进（dt 已被 `timeScale` 与 hitstop 缩过），条目到期就地 `geometry/material.dispose()` —— 创建者是 `burst()` / `_spawnSplash()`，销毁者是同一个 `update()` 通道，不留"只创建没回收"的路径。旧常数逐个换算：碎片"每帧转 0.12 / 0.08 弧度"变成角速度 `0.12×60 / 0.08×60 弧度每秒`，涟漪"每帧 ×1.08"变成 `1.08^60 每秒` 再按 dt 取幂 —— **60fps 下数值与修前完全一致**，改的只是"跟什么挂钩"。涟漪的推进放在粒子的早退之前，否则粒子缺位时网格会挂在场景里。
  - **门禁与防假绿**：新增 `tests/effect-timing.test.js` 10 例 + `tests/timing-boundary.test.js` 扩 2 例（全套 **382 例 / 28 文件**全绿；lint 0 error / 10 warning，文件集合与上批一致；构建通过）。行为面钉三件事：**144Hz 与 30Hz 跑出的寿命之差小于一帧**、`dt=0` 时一秒都不推进、网格与 `dispose` 一一对应且跑完 `group.children` 归零。防"改得很漂亮但没人调用"，另有一条源码断言 `Game.update()` 里确实出现 `this.executionFx.update(dt)`（与 `scheduler.update(rawDt)` 同一类风险，同一类钉法）。静态面把 rAF 收成 4 处白名单（主循环 + 三处 CSS"下一次绘制"），每处必须带 `rAF-EXCEPTION` 标记，且**名单与实际命中双向对齐**：新增未登记的红，登记了却不再用的也红。变异验证两组：把 `onTick(dt)` 换成 `onTick(0.016)` → 3 例变红（帧率一致性 / dt=0 冻结 / 冲击环数值）；在名单外的文件里塞一处 rAF → 白名单门禁直接报出文件名。
  - **行为增量（玩家会看到的差别）**：① 144Hz 玩家第一次看到设计时长的处决特效（碎片从约 0.15 秒回到 0.35~0.6 秒，涟漪从约 0.07 秒回到 0.25 秒）；30Hz 玩家不再看到拖到 0.7 秒的残影。② hitstop / 慢动作期间，冲击环与碎片**一起变慢** —— 这是手感层面真正的改动，过去那一圈环是自说自话地按墙钟跑完的。③ 后台标签页里 rAF 停摆，特效因此停在原地而不是"切回来时发现已经演完了"。④ 未改的语义如实记录：`executionFx.update(dt)` 与 `combatFeedback` / `damageNumbers` 同层，在 `canPlay` 门控**之外**，所以打开对话框时特效仍会走完 —— 与修前一致，改它属于"暂停时世界要不要冻住"那个更大的决定，不在本片偷改。
  - **浏览器读数的限制（写清楚，别冒充成跑过真实帧）**：本次用的 in-app 浏览器视口 0×0 且处于隐藏态，rAF 停摆 —— `game.time.rawDt` 在 600ms 等待后仍是 `0`、`elapsed` 仍是 `0`，也就是说**主循环一帧都没走**。所以浏览器侧只做了"手推 `update(dt)`"的读数：`burst(..., 'execution')` 出 18 条条目、按 1/60 步进 32 帧（0.533 秒）排空、`group.children` 归 0；`'bossKill'` 出 30 条。真实帧下的表现由测试里的 dt 断言与接线断言承担，不写成"浏览器已验证"。
  - **放弃了什么**：① 没给 `ExecutionEffects` 上对象池 —— 一次 bossKill 30 个网格，每条寿命 ≤0.6 秒，池化属于 M4 的"特效池与资源生命周期"整包（W-C 段），单独立在这里会让本片从"改计时"变成"改分配"。② 没动 `AudioManager` 的 4 处 `setTimeout` + 2 处 `setInterval`（B38 / W-C7）：那是给 Web Audio 调度时间，量得就不是世界时间。③ `WeatherSystem` 里雪花摆动仍读 `performance.now()` 作相位源 —— 它是装饰性相位，不参与寿命与物理，改它要给天气加一个累加时间字段，收益不及"多一处状态要管"。这条留在记录里，若后续做天气重做一并处理。

- **2026-09-23 W-A1 切片5：事件名登记表与静态门禁（修 B44 命名半区）** —— 提交 `bf93a4c`
  - **为什么**：`new CustomEvent('a')` 与 `addEventListener('b')` 是**两次独立的手抄**，中间没有任何东西把它们对上 —— 抄错不会报错，只会让下游永远醒不过来。这不是理论风险，动手前扫出来的三条实物病例（`dungeon-room-clear` vs `dungeon-room-cleared` 让一张 CG 永久锁死、`time-stop-end` 无人监听让 HUD 副标题永久挂在「⏳ 时停中」、`dungeon-enter` 从不带 `rerun` 让「深渊再探」提示永不出现）没有一条会在控制台留下痕迹。同一个形状和 B36（中文显示名判定）、B45（POI id 回退）是**同一类病灶**：稳定身份靠人肉复制，于是它一定会漂移。规范第 4 条要求的"既定事件"要有单一出处，到这里还欠着。
  - **交付**：新增 `src/engine/events.js`（357 行）—— 71 个事件名按域分组登记，每条带 `desc`（这条是谁发给谁用的）与 `payload`（`detail` 顶层形状，`null` 表示纯信号），16 条**在仓库内确实没有监听者**的挂 `hook` 并逐条写明"为什么没人听也不影响表现"（例：`game-saved` 的提示与失败上报由 `SaveSystem` 自己做完，这条只是给外部（云存档 / 统计）留的出口，仓库内没有监听点）。`Object.freeze` 只冻一层，所以条目本身也逐条冻 —— 否则"改登记"还能从 `payload` 溜过去。营火对话的派生名收进 `REST_DIALOGUE_EVENTS`，`RestDialogue._emit()` 改为**查表取名**，未知阶段直接抛错（原来那句按 `phase` 拼接的模板串，写错就是一个静默失踪的 CustomEvent，扫描工具还看不见它）。派发侧补齐 `dungeon-enter` 的 `rerun` 字段。HUD 的区副标题有了唯一写入口 `_renderZoneSubtitle()`，三个写者（区切换 / 位面渗漏 / 时停）里后两者变成**带来源的覆盖层**，`_clearSubtitleOverlay(source)` 只允许开它的那一路关它 —— 所以"时停结束"不会把渗漏提示一起撤掉，而换区作为权威重写会把覆盖层作废。
  - **门禁与防假绿**：`tests/event-registry.test.js` 12 例，剥掉注释与字符串后扫 `src/**`，断言：代码里出现的每个自定义事件名都已登记（**硬零**，抄错当场变红）、登记表里没有死条目、`payload: null` ⇔「没有任何派发位点带 `detail`」**双向**对齐、`hook` ⇔「无监听者」双向对齐（且理由必须写满 12 字，防"占位式理由"）、登记表与条目冻结、动态事件名只允许 `REST_DIALOGUE_EVENTS` 一个来源、**模板字符串拼事件名的位点为 0**、三条病例各钉一条回归。扫描器**不认登记表自身**（`SELF = 'engine/events.js'`），否则每条登记都自证在场，门禁当场失效。该提交时点：**394 例 / 29 文件**全绿，lint 0 error / 10 warning（两个新文件不添告警），构建通过。
  - **变异验证 8 项，以及一次"绿色骗人"**：CG 监听名退回 / 从登记表删一条仍在用的 / 加一条代码里不存在的 / 带负载的登记谎称 `payload: null` / 无负载的谎称有 / 有人监听却挂 `hook` / 对话退回模板字符串 / 撤掉 `time-stop-end` 监听 —— 最终全部变红。但这个结论是**第二次**才拿到的：第一版跑法用 python 抓 vitest 输出里的 `Tests N failed`，而 vitest 会在 `Tests` 与数字之间插 ANSI 转义，正则永不命中，于是**8 项全部误报 GREEN**，其中包括第 5 项（它当时确实是真的漏了）。改法是把转义序列先剥掉再匹配，重跑得 7 红 1 绿，那 1 绿是真的：`dynamicDispatches` 那条只比对"哪个文件里有动态名"，模板串形态仍然算"同一个文件的动态位点"，所以门禁没咬住 —— 于是补了"模板位点必须为 0 + 那份代码必须仍是查表"两条断言，重跑第 5 项转红。**教训与本文件 §0.3 同源：验证工具自己坏了的时候，它会报告一切正常。**另记一笔同因的事故：收尾时用 `python step.py -1` 想"还原全部"，而 `-1` 在 python 里是合法的**倒序索引**，于是还原后立刻又施加了一次变异；靠 `||` 短路侥幸没扩大影响，事后逐文件 grep 核对才确认工作区干净。本项目禁用 `git stash`，变异副本一律走临时目录。
  - **行为增量（玩家会看到的差别）**：① 图鉴里的「副本清房」这张 CG **第一次可能解锁**（修前那个监听名没人派发，属于纯失踪内容）。② 时停结束后区副标题落回区域本名，不再长期显示「⏳ 时停中 — 蓄力法术可打断」；Boss 死在时停里也有一条收口路径（那种情况下不会再派发 `time-stop-end`，所以 `boss-defeated` 里显式撤覆盖层）。③ 二周目进副本会弹「深渊再探 — 新随机布局已生成」，修前这条提示从未出现过。④ 对开发者：任何新代码抄错事件名，`npm test` 直接红，而不是等某个下游静默失效。
  - **浏览器实测（构建产物 `vite preview` :4181，与上面的测试口径互补）**：三条病例逐个在页面里复核过 —— 派发 `dungeon-room-cleared` 当场收到 `cg-unlocked`，`detail.id = 'bonus:dungeon-clear'`、`source = 'dungeon'`；`time-stop-start` 后 `#zone-subtitle` 为「⏳ 时停中…」，`time-stop-end` 后落回派发的那条区副标题，而先 `realm-bleed` 再 `time-stop-end` 时渗漏文本**保留**（来源门控生效）；fresh 页面上派发不带 `rerun` 的 `dungeon-enter` 无提示、带 `rerun: true` 的弹出「深渊再探」（第一次测时两条连着发，第二条被第一条 toast 的 2.6 秒存续期盖住，成了假阳性 —— reload 后分开测才作数）。控制台无异常，只剩该环境固有的 WebGL 零尺寸帧缓冲告警。
  - **放弃了什么**：① **不做 `detail` 键级精确校验**。登记里写的是"所有派发位点的并集"，消费侧一律按可选读；想把"读了没登记的键"也钉成静态断言，得靠自己手搓一份解析去判断"这处 `e.detail.xxx` 走的是哪条派发"，实测会产生假阳性 —— 一条假阳性的门禁比没有门禁更糟（它会教人忽略它）。键级校验等切片6 的 `emit()` 有了运行期咽喉之后再做。② **不在本片动监听器注销**。151 个游戏事件监听位点 vs **0** 个游戏事件注销位点（全仓 3 处 `removeEventListener` 都是 DOM 事件）是个更大的结构性欠账，它要的是 `on()/emit()/offAll(tag)` 总线加各系统 `dispose()` 的逐处接线，跟"名字登记"是两件事；合起来做会把一件已能验证的事拖成一件不能验证的事（与切片1 放弃 lint 规则同一条判断）。③ `ui/QuestAssistant.js` 直接派发 `enemy-defeated` / `dungeon-cleared` / `combat-hit` / `npc-talk` 等**玩法事件**：那是"任务助手"这个玩家可见捷径的既定设计（自动通关时替玩家补事件），不改它，只在登记里如实写明这条事件的第二个生产者。④ 没有给 `GAME_EVENTS` 生成 TS 类型或枚举包装 —— 项目无 TS，登记表的约束力来自门禁而不是类型。
  - **留了什么尾巴（切片6 的清单）**：① 监听器注销与总线（`on()/emit()/offAll(tag)`），以及"系统重建后旧实例还在响应事件"这类双份响应的显式验证；② `payload` 键级的运行期校验（在 `emit()` 里断言，开发期抛错）；③ HUD 那三十来处 `window.addEventListener` 目前没有退订路径，`dispose()` 只退订了 `Observable`（`_offs`）—— 切片6 要把它统一成同一套登记 + 退订；④ `dungeon-room-clear` 这类错误名字在旧记录与注释里还可能出现，登记表是唯一的现在时。

- **2026-09-23 W-A1 切片6：事件总线与监听器注销（关闭 B44 注销半区）** —— 提交 `dae0d51`
  - **为什么**：切片5 把名字收进了表，但"监听器一旦挂上就只能刷新页面才能摘下来"这件事一点没动 —— `src/` 里 151 个游戏事件监听位点，对应 **0** 个游戏事件的 `removeEventListener`（全仓那 3 处注销撤的都是 DOM 事件）。今天它还是潜伏账（`new Game()` 全仓仅 `main.js` 的 `boot()` 调一次，换区 / 进出副本 / 读档都原地改状态，一个会话里累积不出第二份监听），但两个改动会立刻引爆：① 新游戏+ / 重开一局真重建子系统；② 任何"每次进副本就 `new` 一个 director"的写法。到那天症状不是报错，而是**同一个事件被 N 份已死监听各响应一次**（横幅弹两层、CG 解锁提示重复、成就计数翻倍），且没有任何线索指向成因。规范第 4 条要求的"监听器必须在 `dispose()` 中注销"，到这里才有一个真能做到的落点。
  - **交付**：新增 `src/engine/EventBus.js`（153 行）—— `on(name, handler, tag)` / `emit(name, detail)` / `offAll(tag)` / `listenerCount(tag?)`。**底层刻意仍是 `window` 上的 `CustomEvent`**：迁移一个监听既不动派发方、也不动回调签名（回调拿到的还是那个 `e`，`e.detail` 照旧），151 处全迁完之前不谈换传输。两道咽喉：`name` 必须在 `events.js` 登记过，否则 `on()` 与 `emit()` **当场抛错**（抄错名从"下游静默失踪"升级成"启动就炸"）；`tag` 是所有权标识，约定 `"域/类名"`，`offAll(tag)` 一次撤掉该所有权下全部监听，所以一个 tag 只能属于一个活实例（多并存实例 tag 要带后缀，否则撤一个连坐撤光 —— 文档注释里写明）。同 `(name,handler)` 在同 tag 下重复注册与 DOM 一样吞掉第二次，账本跟着吞，`offAll` 返回的"撤了几条"才不会虚高。样板落在最重的两个位置：**`ui/HUD.js` 的 20 处裸 `window` 监听整体迁成 `on(..., 'ui/HUD')`**，`dispose()` 从切片5 那句"观测量退订（全局事件那种无一处注销不在这里重演）"（当时并不成立）扩成三本账一起结：`_offs` 退订 + `offAll(EVENT_TAG)` + `scheduler.clear(ZONE_BANNER_TAG/FINISHER_TAG)`；**`game/RestDialogue.js._emit` 改走 `emit(type, detail)`**，成为总线派发第一个真实使用方（`emit` 的 `payload:null ⇔ 不带 detail` 运行期校验就挂在这里）。
  - **门禁与防假绿**：新增 `tests/event-bus.test.js` **15 例**。行为面 8 例：`on()+emit()` 回调拿到同一个 `CustomEvent`、未登记名挂监听与派发都抛错、登记为纯信号的事件带 detail 抛错、`offAll(tag)` 整体注销且幂等、退订函数单摘一条其余不受影响、同 handler 去重不虚报条数、参数校验、无 window 时 `emit` 返回 false 而不是抛。静态面 7 例三条门禁：① **裸 `window.addEventListener('<游戏事件>')` 逐文件台账**（40 文件 131 处），断言 `toEqual` 整张快照 —— 迁移让某文件数字变小就必须改小、整文件迁完就删那行、新增一位点当场变红；台账自证覆盖当前源码树（`ui/HUD.js` 必须已从表里消失、且 `busUsers` 里它是 `on:20 offAll:1`）。② **用 `on()` 的文件必须同时有 `offAll()`** —— 打了 tag 不注销比不打更糟（它让"有注销路径"变成假象），stranded 清单必须空。③ **`on()` 一律带 tag**（省略 tag 落进 `UNGROUPED` 等于换个地方继续漏），`UNGROUPED` 计数必须 0。同步改 `tests/event-registry.test.js` 的扫描器认 `emit()/on()` 新写法并**排除总线与登记表自身** —— 只认 `new CustomEvent`/`addEventListener` 的话，迁移越干净门禁越瞎（会以为 HUD 那 20 个名字再没人消费）。
  - **变异验证**：给某文件加一处裸 `window` 游戏事件监听 → 台账门禁报出该文件；`on()` 去掉第三个参数 → tag 门禁红；把 HUD 的 `offAll(EVENT_TAG)` 从 `dispose()` 删掉 → `dispose()` 三本账断言红；给登记为 `payload:null` 的事件用 `emit(name, {...})` → 运行期抛错、断言抛错的那例红。
  - **行为增量**：玩家侧**无可感知变化**（这是契约 / 基础设施修复，不是 bug 修复）。可感知的是对开发者：抄错事件名从静默变当场炸；HUD 重建（未来若发生）不再累积第二份监听。如实记录未动之处：存量 131 处裸监听**不在本切片强迁**（那是逐系统接线的独立大活），`emit()` 也只是**新增的第二条派发通道**，没强制收编 137 处存量 `dispatchEvent` —— 名字与载荷的静态约束仍由 event-registry 门禁兜。
  - **放弃了什么**：① **不做 `detail` 键级 schema 校验**。登记里 `payload` 多数是散文（"整体转发成就对象：id/title/desc"），拿它当 schema 只会产生假阳性；`emit()` 里只校验"登记为纯信号却带了 detail"这一条不会假阳的。② **不换传输层**（仍是 window CustomEvent），等 151 处迁完再谈。③ **不引入 `off(name, handler)` 细粒度退订** —— `on()` 已返回退订函数，`offAll(tag)` 覆盖 dispose 场景，再加一个 `off` 是第三个入口而不是新能力。④ **不建 `TypedEvent` 包装**（项目无 TS，约束力来自门禁与运行期抛错）。
  - **遗留（B44 关闭后仍开的账，均已登记非缺陷）**：① 逐系统把 131 处裸监听迁到 `on()/offAll(tag)`，归 W-B，由本切片的只许收缩台账钉住不许反弹；② `emit()` 已就位，但派发侧 137 处 `new CustomEvent` 尚未收编，收编后才有真正单一的派发咽喉做键级校验；③ "系统重建后旧监听还在响应"这一类双份响应的正面测试要等某个真会重建的系统（新游戏+）落地才能写 —— 现在能测的是"注销机制本身有效"（已测）与"HUD 的 dispose 真结三本账"（已测）。另记一笔与本切片无关的既有测试抖动：全套 `vitest run` 偶发 1~3 条 `ProgressEvent is not defined` 未处理 rejection（three.js 纹理加载器在 fetch 分块时构造它、node 无此全局），在**不含本切片改动的 HEAD** 上同样复现（3 次跑 1/1/0 条），测试全绿不受影响，登记备查、归 M4 的测试夹具收口。 —— ✅ **已收口（M4 夹具 `937290d`）**：新增全局 vitest `setupFiles`（`tests/setup.js`）在缺失时补一枚最小 `ProgressEvent`，three 的 reader promise 不再抛错；连跑 6 次 0 复现、`Errors` 行消失。

- **2026-09-23 W-A3：世界空间 UI billboard 化（修 A2）** —— 提交 `80ca313`
  - **为什么**：敌人血条 / 锁定标记 / 预警圈此前都是**挂在敌人身体 `mesh` 上的子节点**，而那个 group 的旋转同时承担两件事 —— `facePoint()` 写 `rotation.y` 让敌人朝移动方向、`wobble()` 写 `rotation.z` 做悬浮摆动。于是世界空间 UI 跟着一起转、一起歪：从侧面看血条缩成一条线、从背后看是镜像、轨道无人机摆一下血条跟着摇。这是"UI 挂在了会动的骨骼上"的经典错误 —— **UI 的朝向该由相机决定，与载体姿态无关**。诊断里把它记作"前 10 分钟"级短板（A2）：玩家第一次战斗就要看血条，而它在多数角度下是坏的。
  - **交付**：新增 `src/effects/Billboard.js`。核心是 `yawToCamera(anchor, camPos, fallback)` 这个纯函数 —— **只绕 Y 轴**对齐相机，不抄相机四元数（抄四元数会让血条随俯仰一起翻，玩家抬头看天时血条变成竖的）；相机与锚点水平重合时退回**上一帧**朝向而不是跳 0（否则从敌人头顶掠过会看到血条甩一下）。`Billboard` 容器自己 `scene.add`，`follow(锚点)` 写"锚点 + 离地高度"的世界坐标，`faceCamera(相机)` 写朝向，`dispose()` 幂等且之后两个方法变安全空操作。`Enemy` 侧：血条 / 锁定标记 / 预警圈全部移出 `mesh` 子树；`hpBarSpec()` 成为规格的**唯一声明处**，六处 `createMesh`（Enemy + Boss + 四个位面 Boss）不再各自手搓 `PlaneGeometry`（修前是 6 份互不相干的拷贝，颜色与离地高度各写一遍）；`EnemyManager` 的共享 AI 上下文新增 `camera`，与 `collision` 同一条纪律（每帧从 `game` 重取，不缓存 —— 观看模式与过场会换相机）。
  - **实现过程中真实踩到的一个坑（值得留档）**：把血条移出 `mesh` 之后，`PerformanceManager.shouldUpdateEnemy` 里那句 `enemy.mesh.visible = false`（距离剔除）就只藏了身体 —— **血条会留在空中**。修前它作为子节点是自动跟着消失的，所以这是一处**由本次改动引入的新回归**，而不是旧缺陷。补法不是给剔除逻辑打补丁，而是把"身体可见性"收成一个出口 `setBodyVisible(v)`：它同时管 `mesh.visible` 与两块场景根 UI。全仓 6 处写入点（`die()`、`respawnEnemy()`、`Boss.die()`、`deactivateBoss`、`activateBoss`、`PlayerAutoPlay` 的 Boss 唤醒、`PerformanceManager` 剔除）全部收编，并由静态门禁钉住"`combat/` 内不得出现 `某实例.mesh.visible =`"。
  - **门禁与防假绿**：`tests/world-ui-billboard.test.js` **37 例**（全套 **446 例 / 31 文件**全绿 = 上批 409 + 本批 37；lint 0 error / 10 warning 持平；build 通过且未新增跨块循环 —— `effects/` 与 `engine/` 一样不在 manualChunks 表内，落进 index 被各块共享）。行为面核心两条：**敌人转身 90° 后血条世界朝向不变（dot = 1，判据 1e-9）**、**`rotation.z = 0.5` 后血条世界 up 仍为 `+Y`**；另有一条"锚点不动时身体转四个角度都不影响朝向"的加固例。**变异验证两组**：① 把血条挂回 `mesh` 子树 → 7 例变红（含核心回归）；② 让剔除绕过 `setBodyVisible` 直接写 `mesh.visible` → 静态门禁那 1 例变红。两组都用 `git checkout -- <file>` 还原并 grep 核对（本项目禁用 `git stash`）。
  - **行为增量（玩家会看到的差别）**：① 从任何角度看敌人，血条都正对镜头且保持水平 —— 本片的主要修复。② 悬浮单位摆动时血条不再跟着摇，预警圈也不再被扳歪。③ **满血不再显示血条，掉血才出现，回满又收起** —— 这是刻意的伴生改动，必须写明理由：修前大量血条恰好侧对着镜头而"看不见"，公告板化之后若仍全显示，屏幕会被红条铺满，等于把一个渲染缺陷换成一个可读性缺陷。做法与魂系一致（受击才出血条），Boss 另有顶部 HUD 长条兜底。④ 距离剔除时血条随身体一起消失（即上面那个坑）。
  - **放弃了什么**：① 预警圈**不做**公告板：地面圈就该平躺在地上，`pulseTelegraph` 的头顶警示靠自转表达"急"，抄相机朝向反而会让"圈长到本招真实落点"这个核心读数失真。② 不做全四元数公告板（理由见上）。③ 没顺手把 `DamageNumbers`（CSS2D）与 `HUD` 的锁定框并入同一套 —— 前者走 DOM 投影、后者是屏幕空间，本来就不受身体姿态影响，并进来只会把两套坐标系搅在一起。④ `Enemy.updateWorldUi` 没有做"远处敌人降频"：被 LOD 跳过的敌人朝向会停在上次更新的值，但那时它要么很远要么刚睡下，收益不及"多一处状态要同步"。

- **2026-09-23 W-A4：战斗取消关系与输入缓冲（修 §1.2 短板 A1）** —— 提交 `c2eff50`
  - **为什么**：战斗此前只有"轻击 / 重击 / 翻滚 / 弹反"四个**互不相通**的动作，出手后必须等 `stateTimer > duration` 完全走完才吃下一次输入 —— 连段之间是一段纯硬直等待。更要命的是攻击输入用 `mouseDown` 布尔锁存：在 0.58 秒的重击起手时按下的左键，会一直挂到重击结束后才突然兑现，期间再按也分辨不出新旧。这是"难玩"的第一来源（诊断记为 A1，前 10 分钟级）。同一个形状里还埋着一个**既存的键位 bug**：翻滚 / 弹反 / 战技此前靠 `keys['KeyF']=false` 这种"清掉按键冒充按下沿"的写法触发，而浏览器对按住不放的键会持续重发 keydown，于是**按住 Ctrl 会变成每帧一次翻滚请求**（平时被翻滚的不可打断态掩盖着，一旦允许打断就暴露）。
  - **交付**：三层各补一块。① **数据层** `MoveTable` 每招加 `cancel:{from,into}` —— `from` 是"起手后多少秒开放取消"、`into` 是"允许从本招打断进来的动作"。刻意的分级：轻击→轻/重/翻滚（连段能接、能主动撤），重击→**只**翻滚（重击是"压出去"的承诺，命中后能滚走是保命底线，但不能再连轻击，否则重击沦为零代价起手），战技与翻滚是**承诺态不可打断**（战技自带 4 秒冷却必须走完；翻滚的无敌帧 `iframes 0.42` 比它本身 `0.32` 还长，一旦允许翻滚接翻滚，无敌帧首尾相接 → 闪避变无敌）。一条硬不变量：**`from` 一律 ≥ 命中帧 `at`** —— 取消窗口若早于命中帧，玩家就能在"这一刀还没落地"时把它取消掉，那一刀永远打不出去而 `_strike` 还挂在控制器上；这条由测试的"表自证"例钉住，防以后调参调穿。② **缓冲层** `content/tuning.js` 加 `INPUT.buffer=0.18`（≈10 帧，覆盖"手比眼快"的提前量，又不至于让上一秒的按键下一秒突然生效）；`CombatController` 把四路输入（左右键 + KeyF/KeyR/Ctrl）统一成 `bufferAction()`：只记**最近一次**按下（连点两下不排队成两次攻击 —— 排队会让"我明明只按了一下"变成多打一刀，比丢一次输入更糟），`_consumeInput(dt)` 每帧在状态推进之后跑，所以本帧刚开放的取消窗口当帧就兑现。③ **边沿层** `_pressed(keys,code)` 用 `_prevKeys` 做真正的按下沿检测，替掉"清 keys 冒充边沿"；左右 Ctrl **分别求值**（`||` 短路会让右边那个的 `_prevKeys` 不被更新，按住右 Ctrl 反而退化成每帧触发）。`canStart()` 成为取消判定的唯一入口，五个 `try*` 各自的前置态检查收敛到它。两处细节表现修正：弹反的"举盾"动作移到**按下当刻**播、`_parrySwing` 保证一次按键只抬手一次（判定要逐帧重试，提前量正是缓冲存在的意义，但表现不该反复播）；翻滚起手时摘掉上一招残留的 `_strike` 并置 `attackHitDone`，避免那一刀在翻滚中途突然结算。
  - **门禁**：`tests/combat-cancel.test.js` **22 例**（全套 **468 例 / 32 文件**全绿 = 上批 446 + 本批 22；lint 0 error / 10 warning 持平，未添告警文件；build 通过、跨块循环告警集合未增）。覆盖：取消表自证（每招都声明 cancel 且 from≥at、into 只含已知动作、翻滚/战技 into 为空、轻击 into 不含弹反、重击 into 恰为 ['roll']）、`canStart` 逐招逐时点（窗口前拒、窗口后按 into 放行/拒绝）、输入缓冲（窗口前按被记住且窗口一开当帧兑现 / 按太早超缓冲不兑现 / 只留最近一次 / 空闲按当帧兑现不停缓冲 / 长按 Ctrl 只一次 / 松开再按能再来 / 重生清缓冲）、**取消不吞刀**（轻接重第一段仍结算一次命中 / 取消进翻滚后残留判定不中途结算 / 逐招验证取消窗口打开时那一刀已落地）、弹反表现只播一次、提前按 F 仍能在敌人进入可弹反窗口时兑现。
  - **行为增量（玩家会看到的差别）**：① 连段不再是"打完一刀干等"—— 恢复段按下的第二刀会被记住、在取消窗口打开的一刻当帧接上，手感从"一顿一顿"变"跟手"。② 重击打出硬直时可以滚走保命，但不能白嫖连段（只给翻滚）。③ **修掉一个真 bug**：按住 Ctrl 不再每帧请求翻滚。④ 提前按弹反不再被吞，敌人进入可弹反窗口的瞬间仍能兑现（输入宽容）。
  - **放弃了什么**：① **不做输入排队**（连点只留最近一次）—— 见上，多打一刀比丢一刀更糟。② 缓冲只做**单层**（一个 action 槽）而非多动作优先级队列：取消表已经把"能接什么"编码进数据，队列会在这一层之上再叠一层"想接什么"的猜测，收益不及复杂度。③ **没给弹反/战技开取消入口**（它们的 into 里没有彼此）：弹反需要"刀已收回、手能举盾"的物理叙事，战技是全套唯一高风险高回报动作，二者都该是承诺态。④ 未把取消关系外化到 `content/`（W-B1 数据层）—— 目前它是纯时序手感数据、与招式表同处 `MoveTable` 一处声明最紧凑；等 W-B1 建注册表时连同 `at/duration` 一起搬，不在这半独立搬。⑤ `INPUT.buffer` 取 0.18 而非路线图初写的 0.15 —— 0.15 在 60fps 下只 9 帧，实测覆盖不了"看预警再按"的常见提前量，0.18 是"够用又不幽灵触发"的那一档；如实记这个差值，不回头去对一个更差的数。
  - **留了什么尾巴**：① 取消表是**玩家侧**的，敌人招式（`EnemyMoves`）暂无取消/连段打断（第六切片的连段是敌人自己内部的，不开放给被打断）；把"弹反打断敌人连段"这类设计归 W-A6 Boss 场地与更高层的遭遇设计。② 手柄（W-A7）接入时，边沿检测要同时处理 gamepad 按钮的按下沿，`_prevKeys` 这套目前只覆盖键盘 `keys[code]`；鼠标走 `mouseDown` 已是事件级边沿，不受影响。③ 缓冲时长 0.18 是手感常数，正式数值回归应随 W-B1 的数据化一并进 `content/`。
  - **环境侧记录（与代码无关，但会直接误导验收）**：在沙箱内跑 `vitest` 时，它会往 `%TEMP%` 写 SSR 变换产物，而沙箱的文件代理以 `EPERM` 拒绝，导致**每次随机丢一个测试文件**、只报 `Errors 1`，`Test Files` 计数悄悄变小。本次实测在同一份代码上出现过 **26 / 28 / 30** 三种计数（丢的文件每次都不同，其中一次丢的正是本片新文件），一度让我以为"改动打坏了测试收集"。同一份代码在非沙箱下是 **31 文件 / 446 例 / 0 错误**。**结论：本项目跑测试必须不受沙箱限制，否则"绿"是假的**；计数与 §8 基线对不上时先怀疑这条。这与 §0.3 同源 —— 验证工具自己坏了的时候，它会报告一切正常。已写入 §7 风险表。另：`vite` 在加载配置时会留下 `vite.config.js.timestamp-*.mjs`，已加进 `.gitignore`。

- **2026-09-24 W-A5 切片1：镜头混合栈 —— 过场/观看进出平滑交接（修 §1.2 短板 A4 的"硬切"半区）** —— 提交 `5575801`
  - **为什么**：M3 把相机收进 `CameraRig` 唯一写入者之后，"两处写 FOV"消失了，但**机位**仍是一帧交接：过场开始时 `CinematicManager` 第一帧就把相机搬到绕轨机位（离玩家十万八千里），结束（`end()`）时只置 `cinematicActive=false`，玩家下一帧用自己那份**已经发黄的 `currentCameraPos`**（过场期间它不更新）一把拽回来 —— 进出各闪一下。这正是诊断表 A4 记的"进出过场是一帧硬切"。补一层"谁来播过渡"是死路：那又是一条要记得收尾的义务，跳过 / 面板抢占 / 异常任一路径漏掉就永久卡在过渡态。
  - **交付**：把"过渡"编码进**所有权**本身，而不是新增一个要收尾的层。`CameraRig.setView(pos, look, {owner, transition, snap})` 现在认得写入者是谁：**所有者不变**的每一帧直接落笔（尊重调用方自己已经做的阻尼，rig 不叠第二层 —— 第三人称轨道与观看模式都各自 `lerp` 平滑，再叠一层就变成双重阻尼、手感发黏）；所有者**变更**的那一帧从"当前真正在屏幕上的那笔"（新增 `_appliedPos/_appliedLook`，与"本帧目标"`_pos/_look` 分开）起一次 `smoothstep` 补间，`commitView(rawDt)` 每帧推一把、走满 `transition` 秒后自动收尾。**没有一处需要记得恢复**：过场 `end()` 现在什么都不做（连 `savedCamera` 一并删掉 —— 交接起点改由 rig 的 applied 变换持有），玩家下一帧重新认领时 rig 自己把镜头补回去。`reset()`（传送 / 进副本）连补间与所有者一起作废，下一次认领算"首次"、直接落位。三个写入点认领各自的 owner：`CinematicManager`→`'cinematic'`（`CAMERA_BLEND.enter=0.45`）、`PlayerController` 两种视角→`'player'`（`CAMERA_BLEND.exit=0.5`）、`SpectatorCamera`→`'spectator'`。`commitView(rawDt)` 与 `commitFov()` 并列在 `Game.update` 末尾（所有 setView 写入点都跑在它之前），取 rawDt 与 `Scheduler` 同口径 —— hitstop / 慢动作不该把一次镜头交接拉长。
  - **一处关键约束（诚实记录）**：首次认领**必须**直接落位、不补间。既有用例（`camera-contract` / `occlusion` / `shake-camera`）按真实帧序 `p.updateCamera(dt)` 后**直接读 `camera.position`**、不跑 `commitView`；若首帧也起补间，补间无人推进 → 相机冻结在初始位置，一片红。所以 `setView` 用 `_viewOwner === null` 判"没有上一位可交接"，当场 `_apply()`。这条同时兜住了 `engine-camera-rig` 里"`setView` 无 owner 也立刻到位"的既有合同。
  - **门禁**：`tests/camera-blend.test.js` **9 例**（全套 **477 例 / 33 文件**全绿 = 上批 468 + 本批 9；lint 0 error / 10 warning 持平、未添告警文件；build 通过、跨块循环告警集合未增）。覆盖：稳定所有者逐帧精确跟随不拖尾 / 首帧无 commitView 也到位 / 默认 owner 之间算稳定 / 交接那一帧起补间且相机先不跳 / smoothstep 过半即半程、走满 dur 精确收尾并清 blending / **帧率无关**（1/60 与 1/240 跑完同样秒数终点一致）/ 补间追随每帧挪动的最新目标 / `snap` 与不给 transition 仍是硬切（选择权交调用方）/ `reset` 后重新认领算首次、直接落位。
  - **行为增量（玩家会看到的差别）**：① Boss 过场开始与结束不再各闪一下，镜头从玩家视角平滑推入绕轨、再平滑交还。② 观看模式（`SpectatorCamera`，当前仍是未接线路径）若接线，进出同样软接。③ hitstop / 慢动作期间过场交接时长不变（走 rawDt）。
  - **放弃了什么**：① 没做"多来源**同时**混音"的加权 blend（gameplay+lockon+cinematic 权重叠加）—— 现实里过场/观看与玩家是**互斥独占**（`cinematicActive` 早退保证一帧只有一个写入者），独占切换用所有权交接就够，权重栈是为不存在的同时性付复杂度。② 没顺手把 `PhotoModeDirector`（不写相机也不被 update）接进来 —— 归它自己的切片。③ 第三人称的锁定重定位阻尼、越肩偏移、瞄准磁吸、区域 FOV 本片未碰（A4 的其余半区，留给后续切片），这里只消掉"硬切"这一条。④ 没有给所有权交接加曲线可选（linear/ease 之类）—— 单一 `smoothstep` 覆盖进出两种场景，调参需求出现再外化到 `content/`。
  - **留了什么尾巴**：① `CAMERA_BLEND.enter/exit` 是手感常数，正式数值回归随 W-B1 数据化进 `content/`。② `SpectatorCamera`/`DemoRunner` 整条观看路径仍未在 `Game` 构造（登记 M9），本片只保证它一旦接线就走同一协议。③ A4 还剩"锁定无阻尼、无越肩"两半（阻尼/越肩/瞄准磁吸），属 W-A5 后续切片。（后记：阻尼半区已由切片2 `e162c20` 关闭。）

- **2026-09-24 W-A5 切片2：锁定重定位阻尼 —— 锁定身后的敌人不再一帧甩镜头（修 §1.2 短板 A4 的"锁定无阻尼"半区）** —— 提交 `e162c20`
  - **为什么**：锁定（`CombatController` Q 键）在每帧更新尾部把 `player.targetYaw` 硬写成"指向锁定目标的方向"（`faceYawFromDirection(atan2)`），而 `PlayerController.update` 里落朝向的那一行是 `this.yaw = this.targetYaw` **一帧直赋**。合起来：锁定一个身处背后的敌人 = 第三人称镜头当场甩近 180°，玩家一瞬间不知东南西北，甩多了还晕。角色网格反倒是平滑的（`PlayerFSM` 的 lock 态用 `faceTarget` 以 rate 12 插值转身）—— 于是"身子在慢慢转、镜头已经跳过去了"，两者脱节。这是 A4 记的"锁定无阻尼"。
  - **交付**：把"落朝向"从裸赋值收进 `PlayerController._advanceYaw(dt)` 一处。**未锁定时仍直赋**（鼠标手感是玩家的直接操纵，被 rig/相机侧再抹一层只会发黏 —— 切片1 立的"稳定持有者不叠第二层阻尼"纪律在这里的同一种体现）。**锁定时改成按秒指数逼近**：`yaw += 最短弧差 * (1 - exp(-yawRate*dt))`，差值用 `atan2(sin,cos)` 折回 [-π,π] 保证走短的那段而不是绕远；速率按秒 → 帧率无关。俯仰不参与（锁定只改水平朝向，`pitch = targetPitch` 仍直赋）。**关键前提：这只缓观感、不削准头** —— 命中朝向另走 `getCombatForwardXZ()`，它直接读锁定目标的位置向量、与本 `yaw` 无关（`processHitWindow` 用它 + `LOCKED_CONE`），所以镜头还在半路转过去、判定已经按真实指向目标结算了。顺带把 `_updateThirdPersonCamera` 里锁定力臂的两个裸数（`5.4 / 0.4`）收进 `content/tuning.js` 的 `LOCK_ON_CAMERA`，与新增的 `yawRate` 同处一块，锁定手感三数一处可调。
  - **门禁**：`tests/camera-lockon.test.js` **8 例**（全套 **485 例 / 34 文件**全绿 = 上批 477 + 本批 8；lint 0 error / 10 warning 持平；build 通过、跨块循环告警集合未增）。覆盖：未锁定 yaw/pitch 当场等于 target（鼠标不被抹）/ 锁定身后敌人**首帧不甩到位**（正是过去的硬切那一下）/ 约一秒内指数收敛到 targetYaw / 锁定时 pitch 仍直赋 / 跨过 ±π 走**最短弧**（yaw 朝 π 回绕而非穿过 0 绕远）/ 30·60·144 Hz 跑同样秒数稳态一致 / `_updateThirdPersonCamera` 真的把拉远的力臂（8 米）收到 `LOCK_ON_CAMERA.distance` 设定档 / 锁定目标存在时机位各分量仍有限（阻尼与遮挡不打架）。
  - **行为增量（玩家会看到的差别）**：① 锁定身后的敌人，镜头平滑绕过去而不是瞬移，保留方向感。② 锁定期间轻微移动鼠标后，镜头自己缓回朝向目标（魂系惯例）。③ 命中判定不受影响（另走目标真实位置），不存在"镜头还没转到位所以打不着"。
  - **放弃了什么**：① 没做**瞄准磁吸**（reticle 吸附 / 视角自动微偏到敌人身上）—— 那是"锁定的吸附强度"另一档手感，且要先定"吸附多少"的设计参数，不和本片"消硬切"混做，登记为切片3。② 没把 `shoulderOffset`（越肩横向偏移，**已存在**：`lockTarget ? 0.35 : 0.175`）改成"随目标方位左右换边"—— 现固定右肩，左右换边要连带定"何时换边不打断连段视觉"，收益存疑，暂缓。③ 没顺手动锁定切目标（Q 连按循环）的选择逻辑（`getLockCandidates`），那是目标选择而非镜头手感，正交。④ 没给阻尼做"锁定瞬间一次性给较大步长再收敛"的曲线（critically-damped 之类）—— 单一指数已经消掉硬切且与帧率无关，先不过拟合手感。
  - **留了什么尾巴**：① `LOCK_ON_CAMERA.yawRate=14`（≈0.07 秒时间常数）是手感常数，正式数值回归随 W-B1 数据化进 `content/`。② 越肩"左右换边"与瞄准磁吸留后续切片；A4 至此只剩"磁吸"一档未做（硬切、无阻尼均已关）。 —— ✅ 磁吸已由切片3（`0433777`）补上，A4 三半区全消；越肩左右换边仍暂缓。

- **2026-09-24 W-A5 切片3：非锁定态挥砍瞄准磁吸 —— 侧前方的目标不再从锥沿溜走（修 §1.2 短板 A4 的"磁吸"半区，A4 至此全消）** —— 提交 `0433777`
  - **为什么**：未锁定平A 的命中判定按 `getCombatForwardXZ()` 方向 + 一个水平锥（`MoveTable` 的 `cone`）筛目标，`_toEnemy` 点积低于锥阈值即 `continue`。本作基础锥已很宽（`light.cone=0.12`≈半角 83°），但"贴着侧前方、几乎垂直方向上那一个"仍会因差几度而整个落空 —— 玩家会觉得"我明明在砍他"。A4 记的最后一档"磁吸"就是这个：让靠近准心的边缘目标被温和地拉进命中。
  - **交付**：新增纯函数 `pickAimAssistTarget(origin, forward, enemies, {range, swingMinDot, assistMinDot})` —— 在 `range` 内、落在宽容带 `[assistMinDot, swingMinDot)`（点积越小越偏，故该带即"刚出挥砍锥、还在放宽 `extraDeg` 度后的磁吸角内"）的目标里，取**最对准星（dot 最大）的唯一一个**，返回敌人引用或 null；与锥内目标不重复（那些主循环照常结算）。`processHitWindow` 在算好 `minDot` 后，**仅当非锁定、非全向、开关开启**时把本次锥放宽 `extraDeg` 度求出 `assistMinDot`、选出 `magnet`，命中循环的锥判定加一处 `&& enemy !== magnet` 放行。**关键不变式：这是纯宽容** —— 只把一个额外目标放进来，绝不移除任何原本会命中的目标；竖直 `pickPart`、`isBehind` 背刺、`isGuarded` 格挡全部按真实位置算，磁吸只碰水平锥这一个维度。锁定态走自己的 `LOCKED_CONE`（本就比平A宽）且明确不启用磁吸，全向招（`cone<=-1`）本就全周也不参与。
  - **门禁**：`tests/aim-assist.test.js` **12 例**（全套 **518 例 / 36 文件**全绿 = 上批 506 + 本批 12；lint 0 error / 10 warning 持平；build 通过、跨块循环告警集合未增）。8 例验纯函数宽容带数学：锥内不收 / 带内收 / 超外沿不收 / 超 range 不收 / 两个在带内只取最对准星 / 与出手点重合（dist=0）跳过不产 NaN / 死亡跳过 / 空列表 null。4 例经 `processHitWindow` 落地验纯宽容：默认开启"正面必中 + 侧前磁吸补中"、关掉开关"侧前打不到"（证明增量确由磁吸带来）、锁定态侧前目标不被磁吸、两个都在带内只补最对准星那一个。变异核对：把 `&& enemy !== magnet` 去掉 → 侧前用例转红；把锁定门 `!this.lockTarget?.alive` 去掉 → 锁定用例转红。
  - **行为增量（玩家会看到的差别）**：不锁定时朝一群敌人乱砍，靠近准心的侧前方目标更常被带到 —— 减少"明明对着他砍却空了"的挫败，混战更顺。因为基础锥已宽，效果是"补边缘一个"而非"自动锁敌"，不会把平A变成全周 AoE；且纯宽容不削任何既有命中，是纯增益。
  - **放弃了什么**：① 没做**转向磁吸**（出手瞬间把角色/镜头 `yaw` 轻微吸附到最近目标）—— 那会改玩家朝向、与切片2 的锁定阻尼和鼠标手感打架，且"吸附多少度"是更主观的手感账，收益不及风险，暂缓。② 没让磁吸补**多个**目标（只补最对准星那一个）—— 多个等价于变相加宽 AoE，破坏"纯宽容、少打中不会发生、但也不平白多扫一片"的克制。③ 没把磁吸用到重击/战技以外的路径（如弹体瞄准）—— 弹体另有 `SpellSystem` 的 aim 契约，正交，且远程磁吸手感另议。
  - **留了什么尾巴**：`AIM_ASSIST.extraDeg=10` 是手感常数，随 W-B1 数据化进 `content/`；`enabled` 已做成运行期可切（默认 true），若后续要"设置里开关辅助"直接接它。越肩左右换边仍暂缓（A4 不依赖它）。至此 **§1.2 短板 A（前 10 分钟）四项 A1–A4 全部关闭**。

- **2026-09-24 M4 切片1：相机热路径零分配 —— 第三人称每帧不再随手 new Vector3** —— 提交 `69a3f1a`
  - **为什么**：M3 立了"`CameraRig` 是相机唯一写者"，但玩家侧 `PlayerController` 的第三人称路径每帧仍在 `new THREE.Vector3`。这段代码在一秒 60~144 帧里反复跑，稳定的临时向量分配 = 稳定的 GC 压力，是 M4"零分配清单"点名的第一处实物病例（M2/M3 变更记录里多次以"玩家相机的第三人称路径每帧仍有 `new THREE.Vector3` 若干（M4 的零分配清单）"记账）。此前只做契约与手感，没动分配，是刻意把它留给 M4 收口。
  - **交付**：`_resolveThirdPersonLook` 里 3 处 `new THREE.Vector3` 换成两个复用槽 `this._camTmpLook` / `this._camTmpLookB`（构造期一次性分配）；`getForwardXZ` / `getRightXZ` 加**可选 `out` 参数**（默认仍 `new`，保持所有旧调用点行为不变），第三人称两处 `addScaledVector(this.getRightXZ(), …)` 改传 `this._camTmpRight`。约束是"带 out 复用时，同一表达式里不能让两个不同来源挤进同一个槽"—— `_resolveThirdPersonLook` 用两个不同槽正是为此。
  - **门禁**：新增 `tests/camera-alloc.test.js` **14 例**（全套 **499 例 / 35 文件**全绿 = 上批 485 + 本批 14；lint 0 error / 10 warning 持平；build 通过、跨块循环告警集合未增）。核心是**静态源码扫描门禁**（读 `PlayerController.js` 原文，沿 content-boundary / event-bus 台账的既有门禁文化）：四个热路径方法（`_updateFirstPersonCamera` / `_updateThirdPersonCamera` / `_resolveThirdPersonLook` / `_pullInFromSolids`）体内不得出现 `new THREE.\w+`，也不得出现无参 `get(?:Right|Forward)XZ()`（无参=走默认 new，等于绕过 out 参数）。另含 out 参数行为回归：传入复用向量返回值即同一引用、数值正确（`toBeCloseTo` 躲 `-0` vs `0`）、idle/锁定/focus 三态下两槽不互相踩踏（别名回归）。
  - **行为增量（玩家会看到的差别）**：无可见变化 —— 纯性能/分配收口。对开发者是相机热路径从此有静态门禁，以后往这几段里塞 `new Vector3` 会让测试直接红。
  - **放弃了什么**：① 没动 `readMoveDir` 的 `dir` 分配 —— 它在输入层不在相机层，改它风险面不同（要顺带核所有调用点是否依赖返回值的新旧语义），单列后续切片。② 没上 `renderer.info` 零增长运行期看门狗（PerfHUD 侧）—— 那是"验证无泄漏"的观测工具，与"消掉已知分配点"是两件事，本片先把已点名的病例治了、把源码级门禁立住，运行期看门狗留 M4 后续。③ `getForwardXZ/getRightXZ` 保留 `out` 默认值而非强制必填：强制必填会波及一批非热路径调用点（每帧一次与几十次一次，收益相同、改动面不同），默认值让热路径显式复用、冷路径零成本。
  - **留了什么尾巴**：M4 剩余 —— `renderer.info` 三角数/几何数随时间的零增长门禁（PerfHUD 侧）、特效对象池整包（W-C 段，`ExecutionEffects`/`LootSystem` 等）、"计时全走主循环"残账（`SpellSystem` 前摇 / `CombatController.schedule` / `EnemyManager` timeout / `CombatCinematicSkip`/`ExecutionSkipBurst` 的 `setTimeout`）、`readMoveDir` 零分配跟进。

- **2026-09-24 M4 切片2：移动输入热路径零分配 —— `readMoveDir` 每帧不再 new Vector3** —— 提交 `ab55c2d`
  - **为什么**：切片1 收口了相机热路径，`readMoveDir` 是它显式留下的尾巴（"它在输入层不在相机层，风险面不同，单列后续切片"）。`PlayerController.update` 每帧调 `readMoveDir` 一次，函数体过去 `new THREE.Vector3()` 造一枚返回值、`getForwardXZ()`/`getRightXZ()` 无参又各造一枚 —— 一秒 60~144 帧的稳定短命对象，与切片1 同一类 GC 抖动。
  - **交付**：构造期加三枚复用槽 `_moveTmpDir`/`_moveTmpFwd`/`_moveTmpRight`；`readMoveDir(keys, autoPlay, out = this._moveTmpDir)` 开头 `out.set(0, 0, 0)` 归零再累加，内部两条基向量改取 `getForwardXZ(this._moveTmpFwd)`/`getRightXZ(this._moveTmpRight)`。复用安全性前提：返回值只写进 `ctx.moveDir` 并在本帧内被 `fsm`→`moveHorizontal` 读 `.x/.z` 消费、不跨帧持有（已核对唯一调用点）；故下一帧开头归零即可复用同一槽。
  - **门禁**：`tests/camera-alloc.test.js` 静态扫描的 HOT 方法列表纳入 `readMoveDir`（体内禁 `new THREE.\w+`、禁无参 `getXZ()`），并 +**7 行为例**（传入 out 时写进该对象且返回它、缺省两次复用同槽且每次开头归零不累积上帧残值、四向与 W+D 对角归一正确、无键给零向量、autoPlay 沿速度方向且速度过小给零向量）。全套 **506 例 / 35 文件**（上批 499 + 本批 7）、lint 0 error / 10 warning 持平、build 绿。
  - **踩到的耦合（如实记）**：`tests/player-fsm.test.js` 用 `Object.create(PlayerController.prototype)` 造最小宿主、手工补 `update()` 用到的字段（该桩注释自陈"补齐 update() 用到的字段"）。`readMoveDir` 新增的三枚复用槽正是这类字段依赖，须在桩里同步补（与它本就手补 `_dashVelocity` 同一条契约）—— 补后 9 红转绿。这是"默认参数引用实例字段"对"绕过构造器的测试宿主"的固有风险，桩更新是对症修法，不改生产码语义。
  - **行为增量（玩家会看到的差别）**：无可见变化 —— 纯分配收口。对开发者是输入热路径从此也在静态门禁内，往 `readMoveDir` 塞 `new Vector3` 或漏传 out 会让测试直接红。
  - **放弃了什么**：① 没给 `getCombatForwardXZ` 加 out 参数 —— 它调用方散布 5 处（CombatController 命中/SpellSystem 瞄准/CombatCameraDirector），且只在出手/施法/锁定取景时跑、非稳态每帧，频率与风险面都低一档，留后续。② 没复用掉 `update` 里每帧的 `ctx = {...}` 小对象与 `moveHorizontal` 的 opts 字面量 —— 那是小对象、young-gen 秒回收，收益不及"多一处要管的复用状态"，且不在 `new THREE.` 门禁射程。③ 没做 `renderer.info` 零增长运行期看门狗（同切片1 的取舍）。
  - **留了什么尾巴**：M4 剩余不变 —— `renderer.info` 零增长门禁（PerfHUD 侧）、特效对象池整包（W-C）、"计时全走主循环"残账（注：`CombatController.schedule` 已实测是 dt 版 `_timed`、非 `setTimeout`，该残账的 grep 只剩 `ExecutionSkipBurst.js:19` 一处 rAF；SpellSystem/EnemyManager 已无 setTimeout，看板口径待下次核对时收敛）。

- **2026-09-24 M4 测试夹具收口：消除 `ProgressEvent is not defined` 未处理 rejection** —— 提交 `937290d`
  - **为什么**：多条变更记录把"全套 `vitest run` 偶发 1~3 条 `ProgressEvent is not defined` 未处理 rejection、登记备查归 M4 夹具收口"挂账。根因是 three 的 `FileLoader` 在 node 用 `fetch`+`getReader()` 流式读纹理/GLB，每块 `new ProgressEvent(...)`（`three.core.js:26954`），node 无此全局 → reader promise 在测试环境拆除后抛 `ReferenceError`，把收尾行从纯绿污染成 `Errors 1 error`。一个飘红的绿色门禁会让整份门禁文化失去可信度。
  - **交付**：新增全局 vitest 夹具 `tests/setup.js`（`vite.config.js` 加 `test.setupFiles`）—— 仅在 `globalThis.ProgressEvent` 缺失时补一枚携带 `loaded/total` 的最小构造体（测试无人挂 `onProgress`，事件造出即弃）。
  - **验证**：连跑 **6 次 0 复现**、`Errors` 行消失；全套 **506 例 / 35 文件**、lint 0 error / 10 warning、build 绿（`test` 块被 `vite build` 忽略）。玩家侧无影响（纯测试环境）。
  - **放弃了什么**：不给触发加载的用例逐个 `await`/取消 reader —— 那要改生产加载路径或给每个建世界的用例加 teardown 钩子，面大且脆；这本质是 node 环境缺一个浏览器全局，在夹具层一次性补才对得上病因。
- **2026-09-24 W-A6 切片1：场地红圈危险区原语（`GroundHazards`，B5 第一档）** —— 提交 `2043968`
  - **为什么**：B5 记的是"Boss 没有场地机制"，但动手前实物比"没有"更糟一层：会砸地的三个 Boss（影界守护者 / 引力化身 / 混沌领主）共用 `Boss.startSlamTelegraph()` 那份手抄的生命周期 —— 圈是它自己的网格、秒表是它自己的、判定是它自己写的一次 `distanceTo`。于是两条病灶同时存在：① **预警说谎**，圆环在前摇里从 4 米一路涨到约 18 米（`scale = 1 + (1.2 - timer) * 3`，几何外半径本身是 4），而伤害判定始终是 4.5 米 —— 玩家按圈走位反而会挨打；② **圈跟着施法者走**，Boss 一倒地 `die()` 就把圈藏掉，等于"已经当众许诺出去的伤害"可以凭一次爆发清空。这两条都不是缺美术，是缺一个把"这块地已经许诺出去了"当成一等公民的层。
  - **交付**：新增 `combat/GroundHazards.js` —— `spawn({ x, z, radius, telegraph, damage, color, owner })` 交出危险区并回该区自身（调用方拿它判 `done`），生命周期"前摇画圈 → 落地结算**一次** → 余像淡出"全由主循环 `dt` 推进；`update(dt, playerPos, playerRef)` 按水平圆判内外、玩家无敌帧照吞；`cancelFor(owner)` 只撤**还没落下**的圈（主人倒地/这场仗结束），已落下的不追溯；`count()` / `pooled()` 走公开接口给 PerfHUD 与用例看。单位圆盘（外半径 1 米）几何全系统共用一份、网格按峰值池化、`update()` 内不分配。数值进 `content/tuning.js` 的 `GROUND_HAZARD`（`bossSlam` 半径/前摇/伤害/颜色/收招冷却），`Boss` 与两个子类不再持有自己的秒表。接线：`EnemyManager` 构造并每帧推进（排在敌人之后、与 `projectiles` 同一条所有权路数），`spawnBoss` / `spawnSpaceBoss` / `spawnChaosBoss` 生成时把 `hazards` 交进 config，F3 面板加一条"地面危险区"计数。
  - **门禁与防假绿**：新增 `tests/ground-hazard.test.js` **17 例**（全套 **535 例 / 37 文件**全绿 = 上批 518 + 本批 17；lint 0 error / 10 warning 持平；build 绿）。四类断言都做过变异验证，不是"恰好能跑"：把水平距离判定换成恒真 → "圈外不伤人"与"在前摇里走出圈外"红；把缩放乘 4 → "预警必须诚实"红（那条同时断言前摇全程 `scale < radius`、落地当帧 `scale ≈ radius`）；删掉无敌帧检查与 `cancelled` 标记 → "无敌帧吞掉这一砸"与"cancelFor 只撤没落下的圈"红。另含 `update()` 本体的静态零分配扫描（与 `camera-alloc` 同一手法，正则扫不到方法体时用例自己报错，不假绿）。
  - **行为增量（玩家会看到的差别）**：① Boss 砸地的圈从此**只画到它真能打到的地方**，前摇里越清楚越危险，走位读招第一次有了可信依据；旧实现那一记 18 米的红环不再出现。② 起手之后 Boss 被击杀/被拉开，圈仍然在原地落下（伤害归圈，不归人）；而**前摇内**击杀 Boss 则整记取消，不再有"死后从坟里补一刀"。③ 落点从"落地那一刻的施法者脚下"改成"起手那一刻"（旧实现因 Boss 在 slam 期站桩而恰好等价，但那是巧合不是契约）。④ 判定从 3D 距离 `distanceTo` 改成水平圆 —— 玩家站高台时，旧实现可能因垂直距离差被算进/算出，现在只看水平：跳不高就躲不掉，绕出圈外才躲得掉。⑤ `updateSlam` 不再顺手写网格高度，引力化身在 slam 期间保住自己的悬浮动画（旧路径同样没写，此处是保持）。
  - **放弃了什么**：① 没给危险区做**持续伤害 / 多段 tick**（岩浆带、引力井那类）—— 现在只有"落地一击"，因为唯一的真实调用方只要这一种；持续区的每目标冷却是独立一笔账，等有调用方再设计，现在写属于提前设计。② 没做**竖直剔除**（跳起躲红圈）—— 那是玩家侧受击盒与 `band` 的事，接进来会把"场地机制"和"跳跃无敌窗口"两团账搅在一起，留待有招真需要跳的时候。③ 没让 `BossPhaseDirector`（阶段演出）参与落圈 —— 它是纯表现层，阶段推进的数值/速度变化仍归 `Boss.checkPhase()`；把"第 X 阶段开始铺圈"接进演出层需要一张 per-boss 的阶段脚本表，那是切片2 的题。④ 没动 `Boss.update` 里 `Math.random() < 0.35` 的起手概率（顺手能收进 `GROUND_HAZARD`，但它是 Boss 的决策而不是危险区的属性，收进来会把两层的边界糊掉，归 W-B1 数据化整包）。⑤ 没给危险区加音效/震屏：与旧实现持平优先，加反馈是独立切片。
  - **踩到的耦合（如实记）**：`tests/world-ui-billboard.test.js` 的"combat/ 内不得出现 `x.mesh.visible =`"静态门禁扫到了新文件的 `it.mesh.visible`（那条门禁的对象是"绕过 `setBodyVisible` 会把血条留在空中"，与危险区无关）。没有给门禁开后门，而是把字段改名 `it.disc`：它不是任何实体的身体，叫 `disc`（单位圆盘）比 `mesh` 更贴切，也让那条门禁继续只约束它本要约束的东西。顺带把 `tests/helpers/enemyHarness.js` 的 `makeScene` 桩件从 `{ add(){}, remove(){} }` 换成真 `THREE.Scene` —— 危险区要往场景里挂分组，假 `add` 吞参数会让"挂上了没有"这件事在用例里不可知，桩件与现实少一分偏差比多一条断言更值钱。
  - **留了什么尾巴（切片2 的清单）**：① 弹幕落点与引力井复用同一生命周期（`spawn` 已够用，引力井才需要"未落地可撤 + 持续段"），时停域是另一类（不改血量改时标），三条各占一片。② 每 Boss 的"哪一阶段铺什么圈"仍无处声明 —— 需要一张场地脚本表（`content/` 里 per-boss 的阶段 → 危险区序列），随 W-B1 数据化落位。③ 圈的可读性还只是一块半透明圆盘（无边缘高亮、无落地前 0.2 秒的"填充完成"提示音），美术反馈归 M5/M6。④ 危险区不参与 hitstop 之外的时间缩放语义（吃的是主循环 dt），若将来要"圈在时停里照旧走"需换 rawDt，届时一并决定。

- **2026-09-24 W-A6 切片2：落点圈阵列（`BarragePattern`，B5 第二档：弹幕）** —— 提交 `3474fb0`
  - **为什么**：切片1 把"红圈"这一档做成了可信的预警，但它的**躲法仍然是零成本的**：`Boss.startSlamTelegraph()` 的圆心钉在 Boss 自己脚下，玩家只要不主动贴上去就永远不必移动。B5 要的四档里，"弹幕"是唯一一档把圆心写在**玩家此刻脚下**的 —— 它买的东西不同：逼的是"这一秒你还站不站在原地"。而动手前大奥术师有什么？phase≥2 之后每 2 秒一发追踪弹体（`projectiles.spawn` 一次一枚），全程没有读招、没有落点、没有场地：它是六个 Boss 里唯一"魔法位面却不会任何魔法场面"的那一个。第二处病灶是账本：如果弹幕照旧写进 `MagicBoss.update` 自己计秒、自己存网格，切片1 刚删掉的那类"每只 Boss 手抄一份生命周期"就又长回来了 —— 所以这一档必须**只多一个几何函数 + 一张数值表**，其余全走 `GroundHazards`。
  - **交付**：新增 `combat/BarragePattern.js` —— `barrageLayout(cx, cz, spec)` 返回 `spec.count` 个 `{ x, z, telegraph }`，离心半径 `spread*sqrt((i+0.5)/count)`（面积均匀，每枚圈分到一样大的地盘）、方位角按黄金角递推，前摇 `telegraph + i*stagger` 且**随离心半径单调变长**（内圈先落、外圈后落）。这里没有随机数：同一份输入永远铺出同一张图，手感调的是 `content/tuning.js` 的 `GROUND_HAZARD.barrage`（`count/radius/damage/color/telegraph/stagger/spread/cooldown/range` 九个数），不是代码。`Boss.clampIntoArena(x, z, margin)` 新增在基类：以 `arenaCenter`/`arenaRadius` 为界，把落点沿径向夹回场内并留出 `margin`（危险区传自己的半径）——砸地那一档的圆心在 Boss 脚下，用不着它，弹幕是第一个调用方。`MagicBoss.update` 在 `super.update` 之前跑自己的闸门：`hazards && phase >= 2 && barrageCooldown <= 0 && distanceTo(player) < range` → `startBarrage(playerPos)` 逐枚 `clampIntoArena` 后 `hazards.spawn({ ..., owner: this })`，冷却写 `barrage.cooldown`；`EnemyManager.spawnMagicBoss` 补上 `hazards` 注入（与 `projectiles` 同一条所有权路，切片1 已为其余三个 Boss 铺好）。
  - **门禁与防假绿**：新增 `tests/barrage.test.js` **16 例**（全套 **551 例 / 38 文件**全绿 = 上批 535 + 本批 16；lint 0 error / 10 warning 持平；build 绿）。几何侧断言"铺几枚、离心按 sqrt 分布、由内向外依次变晚、两两圆心相距不小于半径、`count:0` 铺空场、同输入两次逐点相同"，另加一条静态门禁：`BarragePattern.js` 里不许出现 `Math.random`（否则"整表可断言"这句话就是空的）。接线侧五条关键断言全部做过变异验证，不是"恰好能跑"：**删掉 `clampIntoArena` 调用** → "落点全部夹回竞技场内"红（该用例同时要求真的夹到过，`clamped > 0`，否则是空跑）；**`owner: this` 改成 `null`** → "在前摇里被打死：整片撤掉"红；**`spread` 5 改成 9** → "站住不动必吃内圈"红（站桩代价从此只剩一枚，那条断言就失去意义）；**抹掉 `i * stagger`** → "落地顺序由内向外"红；**去掉 `phase >= 2` 闸门** → "一阶段不铺场"红。玩家外跑那一例用 `8 米/秒` 逐帧积分（低于玩家基础移速 15），跑的是离心方向而不是任意方向，避免"恰好朝空隙跑"蒙过断言。
  - **行为增量（玩家会看到的差别）**：① 大奥术师二阶段起会往玩家脚下铺一片紫圈，**站住连吃、开局外跑一枚不吃** —— 这是本作第一次"移动本身就是防御"。② 圈不再画到墙外：贴边躲雨时场外的假预告整片消失，能看到的一定打得着。③ 砸地与弹幕同期在场、各走各的冷却，不会因为共用一个秒表而互相顶掉。④ Boss 在前摇里被击杀，整片未落下的圈一起撤（切片1 的纪律自动覆盖阵列，无需再写一遍）。⑤ 内圈先落、外圈后落，读招方向唯一：往外走就是往安全走，不需要判断哪一枚先到。
  - **数值坦白（写下来免得下次当成 bug）**：`telegraph 1.5s` + `stagger 0.35` + `spread 5` + `radius 3` 的组合，对**已经知道要跑**的玩家是零威胁（1.5 秒走出 12 米，最外那枚才 4.74 米）—— 这一档现在收的是"站桩税"：贪刀、喝药、原地看技能冷却的人才付。真正的压力来自它和弹体、和近身贴打的同期叠加，而不是一圈自己。三阶段要不要收紧（更短 `telegraph` 或更密 `count`）现在**不定数**，因为收紧之后"外跑来得及"这条断言要一起改，那属于 per-boss 阶段脚本表落位后一次性决定，不在这里凭感觉调。
  - **放弃了什么**：① 没做**移动跟随式弹幕**（每帧把圆心重算到玩家当前位置）—— 那会把"这块地已经许诺出去了"的语义整个打掉，玩家再无躲法可言，是切片1 判定过的同一类病灶。② 没做**随机散布**：可断言性 > 表面的"每次都不同"，观众以为随机的东西往往正是靠确定性铺出来的。③ 没给弹幕换形状（环形带缺口、交叉火网、螺旋推进）—— 现在只有"以玩家为心的一团"，形状差异全在数值表里；这些变体等阶段脚本表落位后各是一条数据，不该先写几何。④ 没给引力化身 / 混沌领主也接上弹幕：它们的闸门条件（`phase >= 几`、`range` 多远、和自身哪一招收招衔接）各不相同，现在硬写就是在 `MagicBoss.update` 之外再长两份手抄 —— 那正是切片1 删掉的东西。⑤ 没做"圈内减速 / 击退 / 持续掉血"等落地后的段，`GroundHazards` 目前只有落地一击（引力井那一档才真需要持续段，届时一并设计）。⑥ 没加音效与边缘高亮：弹幕的可读性现在只靠颜色和半径，反馈包归 M5/M6。
  - **留了什么尾巴（切片3+ 的清单）**：① **per-boss 场地脚本表**：`phase >= 2`、`range`、`cooldown`、"哪一招接在哪一招收招后"现在是代码里的字面量，应搬进 `content/` 成一张 `bossId → 阶段 → 危险区序列` 的表（随 W-B1 数据化整包），引力化身与混沌领主入场就靠它。② **引力井**（B5 第三档）：需要"持续段 + 对玩家的拉力"，即危险区从"落地一击"扩成"有起止时间的域"，并给每目标一份已结算账；`cancelFor` 那半边已经有了。③ **时停域**（第四档）：不改血量改时标，是"另一类目标选择器 + 另一类结算"，与现有 `damage` 字段并列，需要想清楚它作用于主循环 dt 还是 rawDt（切片1 已把这条挂账）。④ `BossPhaseDirector` 阶段演出与落圈对齐（阶段播报出现的那一帧就该看见铺场），以及关卡工具侧能编辑这张表。⑤ 圈的美术可读性（边缘高亮、落地前 0.2 秒的"填充完成"提示、与地形贴花）归 M5/M6。⑥ 一帧内 6 枚圈同场（砸地 + 阵列）是当前的峰值，池化按峰值走；真按阶段脚本表铺更大阵列时需回来复核 F3 计数与 `update()` 的每帧开销。

- **2026-09-24 W-A6 切片3：Boss 场地脚本表（`content/arenaScripts.js`，闸门数据化）** —— 提交 `9daa748`
  - **为什么**：切片2 收尾时把"per-boss 阶段→危险区序列脚本表"记成尾巴，理由是" `phase >= 2` 这类门槛还在代码里"。这一轮动手前把整个 Boss 家族扫了一遍，发现比"还有一处"糟：同一条闸门被**手抄了四遍、且四种写法各不相同** —— 影界守护者与大奥术师走 `Boss.update` 近战位上的 `phase >= 2 && Math.random() < 0.35`，引力化身是 `phase >= 2 && Math.random() < dt * 0.08`（不看距离，随时自己起手），混沌领主是同一条换成 `dt * 0.06` 与第三阶段，大奥术师的弹幕则是切片2 新写的"冷却 + 距离"。四份代码互为参考却不互为约束，症状也各不相同：引力化身与混沌领主**同时挂着两条起手路径**（子类那条 + 基类近战那条），谁先抢到 `slamHazard` 谁赢，另一条静默失败；而 `spawnVoidBoss` 与 `DungeonManager` 生成副本 Boss 时压根没注入 `hazards`，切片1 之后它们的砸地**一直静默不成立**（`startSlamTelegraph()` 返回 false 退回普通挥砍，没有报错也没有日志）。这不是"缺一张表"，是缺一个唯一驱动点。
  - **交付**：新增 `src/content/arenaScripts.js`。
    - `ARENA_MOVES` 把招式名指向 `GROUND_HAZARD` 的数值档名（`slam → bossSlam`、`barrage → barrage`），两层的分工写进注释：**"改了它所有调用方都该跟着变"的（圈多大、掉多少血）留在数值档，逐 Boss 不同的（多久一次、离多远才肯铺）走脚本表**。据此把 `cooldown`/`range` 从 `GROUND_HAZARD.barrage` 搬进表；`bossSlam.recover` 是例外并说明原因（它是那一招收招动作本身，不是"多久愿意打一次"）。
    - `BOSS_ARENA_SCRIPTS[bossId]` 逐条声明 `{ move, phase, trigger, ... }`，三种互斥闸门：`melee`（抢一次普通挥击的位置，按 `chance`）、`timed`（不看距离、按每秒 `rate` 次期望自己起手）、`opportunity`（`cooldown` 秒一循环，到期**且**玩家在 `range` 内）。
    - `assertArenaScript()` 在**模块加载期**跑整表（招式名未登记 / 闸门名未知 / `phase` 不是 1~3 的整数 / `melee` 缺 `chance` / `timed` 缺 `rate` / `opportunity` 缺 `cooldown` 或 `range` 全部抛错），与 `WorldManager.assertPoiIdentity()` 同一条纪律：错表要在开打前红。`arenaScriptFor(id)` 未登记时回退 `default`（副本 Boss 与将来工具生成的野生 Boss 走这条）。
    - `Boss` 侧只留一条通用驱动：`updateArenaCasts(dt, playerPos)`（排在 `update` 的 slam 早退**之前** —— 砸地的那 1.2 秒里别处的圈照样该落、冷却照样该走）、`tryArenaMelee()`（近战位）、`castArenaMove()`（分派）、`startBarrage()` 从 `MagicBoss` 上收，`entry.tint` 让同一份圈几何各保配色。冷却表 `_arenaCd` 与脚本条目同序、构造期一次分配，热路径不建对象。
    - 删除四处手抄闸门：`Boss` 的 `phase >= 2 && Math.random() < 0.35`、`SpaceBoss` 与 `ChaosBoss` 的 `Math.random() < dt * N`、`MagicBoss` 切片2 写的弹幕整段（含 `barrageCooldown` 字段）。内容增量：引力化身与混沌领主第三阶段各得一次带自己配色的弹幕。
    - 两处静默失联一并修掉：`spawnVoidBoss` 注入 `hazards`；`DungeonManager` 生成副本 Boss 时传 `this.enemyManager.hazards`。
    - 一处构造期次序坑：子类的默认 `bossId` 原先写在 `super()` **之后**，而脚本按 id 查 —— 不传 `config.bossId` 时 `Boss` 会先按 `'shadow-warden'` 查表，子类再把 id 改成自己的。四个子类的默认 id 一律移进 `super` 的 config 对象，`bossId` 与 `hp/name/speed` 同属构造期配置。
  - **门禁与防假绿**：新增 `tests/arena-scripts.test.js` **20 例**（全套 **571 例 / 39 文件**全绿 = 上批 551 + 20；lint 0 error / 10 warning 持平；build 绿）。分四组：**表自证 8**（现表通过校验、五种畸形各抛其错、未登记 id 落 `default`、`EnemyManager` 源码里出现的每个 `bossId` 字面量都必须在表里点了名、子类不传 id 也拿得到自己那份脚本）；**闸门行为 9**（`melee` 抢到就不出刀／没轮到就照常挥砍／阶段未到一直是普通刀；`timed` 不看距离能铺场／阶段未到不铺；`opportunity` 的 `range` 硬门槛与阶段门槛；`tint` 两只 Boss 颜色不同；大奥术师换驱动后铺场时机与切片2 一致）；**静态门禁 3**（除 `Boss.js` 外 `combat/` 不许再出现 `startSlamTelegraph(`/`startBarrage(`、任何 combat 文件不许再出现 `phase >= N && Math.random` 或 `Math.random() < 0.35`、`Boss.js` 必须逐字段从 entry 上读 `e.phase/e.chance/e.rate/e.cooldown/e.range`）。变异验证六项全部转红且各归其位：驱动忽略 `e.phase` → 3 红；去掉 `range` 判定 → 行为 1 红 + 静态 1 红；`melee` 无视 `chance` → 行为 1 红 + 静态 1 红；忽略 `tint` → 配色 1 红；子类里再手抄一次起手 → 3 红（含静态门禁）；把默认 `bossId` 的赋值退回 `super()` 之后 → id 归属 1 红。
  - **行为增量（玩家会看到的差别）**：① 引力化身与混沌领主第三阶段开始往玩家脚下铺弹幕（各自配色：蓝 / 红），不再是"只会砸地的大号近战"。② 引力化身与混沌领主的砸地不再有两套起手路径互相抢 —— 前者只按秒期望（它本来就不该贴脸换刀），后者近战位 + 第三阶段定时并存，由表说了算。③ **时线执政官与所有副本 Boss 的砸地恢复生效**：此前因为没注入危险区，它们的 `slam` 静默退回普通挥砍，玩家看到的是一场"从来不会砸地的 Boss 战"。④ 手感调参从此有一个地方：改 `BOSS_ARENA_SCRIPTS` 的 `phase/chance/rate/cooldown/range` 即可，不必再进四个子类。⑤ 玩家侧无可感知变化的部分：大奥术师的铺场时机与切片2 完全一致（7 秒 / 24 米 / 第二阶段），那条断言就是钉这个的。
  - **放弃了什么**：① 没把**非危险区的自走技**（大奥术师的追踪弹、引力化身的引力拉扯与环形六连、混沌领主的混沌脉冲、时线执政官的时停）收进同一张表 —— 它们不是场地招，结算面完全不同（改速度、改时标、直接扣血），硬塞会让这张表变成第二个 `EnemyMoves` 而场地招这一档反而失焦。它们各自那份 `phase >= N && cooldown <= 0 && distance < R` 形状确实重复，**如实登记为 W-B1 的题**（一张覆盖"施法意图"的表），不在本切片凭直觉扩边。② 没做阶段转场的**演出脚本**（第 X 阶段开始铺场时该配什么播报、镜头、音效）—— `BossPhaseDirector` 现在仍不知道场地表的存在。③ 没给同一闸门类型做多条目冲突仲裁：`chaos-overlord` 同时有 `melee` 与 `timed` 两条 `slam`，靠 `castArenaMove` 返回 false 自然让位（`slamHazard` 未清空时另一条抢不到），这是切片1 就定下的语义，不额外加"优先级"字段。④ 没把表序列化/做成工具可编辑（关卡工具侧留 W-B 内容整包）。
  - **留了什么尾巴（切片4+ 的清单）**：① **引力井**：需要"有起止时间的域 + 对玩家的持续拉力"，会第一次要求危险区支持多段结算与每目标已结算账；届时 `timed`/`opportunity` 之外可能还要"域在玩家身上"这类资格判定。② **时停域**：改时标不改伤害，是另一类结算器，并要一并决定它吃主循环 `dt` 还是 `rawDt`（切片1/2 都挂着这条）。③ 其余三个 Boss 的**自走技**并入统一施法表（随 W-B1），本切片只做了场地招这一档。④ `BossPhaseDirector` 与场地表对齐（阶段播报出现那一帧就该看见铺场），以及美术/音效可读性（M5/M6）。⑤ 副本 Boss 现在走 `default` 脚本 —— 等副本遭遇表（B4）落地时，每张 Boss 房模板应能指定自己的场地脚本。

- **2026-09-24 W-A6 切片4：引力井（危险区的第四种生命周期：域）** —— 提交 `ccff4f2`
  - **为什么**：B5 四档里"引力"是唯一要求危险区**持续在场**的一档，而 `GroundHazards` 从切片1 起只有"一击定音"这一种生命周期（前摇 → 落地 → 余像），`spawn()` 里根本没有"时长"这个概念。动手前现场只有 `SpaceBoss` 的"引力拉扯"：每 3.5 秒给玩家速度 `+= 6` 朝自己，一个写在施法者身上的 if —— 玩家被拖了却在地上找不到"是哪块地在拖我"，预警与代价对不上号。第二条理由是同一片里已经躺着一条切片1 就登记的尾巴：要做域，要么把持续段塞进 `Boss`（那正好重新长出切片1 删掉的"每只 Boss 手抄一份生命周期"），要么给危险区加一段。选后者：域是**地**的属性，不是**谁**的属性。
  - **交付**：
    - `GroundHazards.spawn()` 多收三件：`duration`（域在地上留几秒）、`tick`（每几秒结算一段）、`pull`（每秒往圆心加多少速度）。落地那一拍照旧按切片1 的语义一击定音；给了 `duration` 的再转入 `active` 段，`update()` 由此变成 前摇 → **域** → 余像 三段。`duration > 0` 而 `tick <= 0` 在 `spawn` 当刻抛错 —— "永不结算的域"是把玩家白关在圈里，不许存在。
    - `_sustain()`：段与段之间用 `while` 补齐（一帧跨过多段一次算完，卡帧不等于免单，B39 那条纪律在新增的生命周期里继续成立）；只在水平半径内结算；圆盘停在**满半径**（判定边界 = 画出来的边界），透明度在 `warn..burst` 之间脉动，一眼读得出"这块地还在生效"。
    - 拉力写在 `playerRef.velocity` 上，与 `SpaceBoss` 那记一次性拖拽**同一条通道**（不是新发明一套位移接口）；离圆心 0.4 米内收手，免得人在原点上被来回加速。无敌帧吞得掉段数、吞不掉位移：翻滚的含义是"这一下不算"，不是"这一下别把我拖进去"。
    - `cancelFor()` 的语义扩到域：主人倒地时**还在 tick 的域塌掉**（转入余像放完），已经落下的那一拍留账 —— "不许被死掉的 Boss 从坟里打一下"这条契约，在持续段同样成立；否则玩家要站在 Boss 尸体旁边继续被一口看不见的井烧死。
    - 数据侧：`GROUND_HAZARD.gravityWell`（`radius 5.5 / telegraph 1.4 / damage 6 / tick 0.6 / duration 3 / pull 8 / 蓝`）；`ARENA_MOVES.well = 'gravityWell'`；`singularity-herald` 第三阶段多一条 `opportunity`（`cooldown 12 / range 15`）。井的 `range` 刻意比弹幕窄：跨阶段那一帧两条 `opportunity` 都会当帧起念，15 米内是"贴脸连吃两口"，退开些只落弹幕。
    - `Boss.startGravityWell(playerPos, entry)` + `castArenaMove()` 按 `entry.move` 分派，落点同样过 `clampIntoArena`；`arenaSpec(entry)` 第一次有真实调用方（招式名 → 数值档的查表由此走通，不再只服务校验器）。
    - 伴生：`makePlayer/runFrames` 从 `tests/player-fsm.test.js` 收进 `tests/helpers/playerHarness.js`（受击方契约补上 `hits/isInvulnerable/takeDamage`），"场地招 × 真实位移"第一次能在 node 里跑。
  - **门禁与防假绿**：新增 `tests/gravity-well.test.js` **37 例**（全套 **608 例 / 40 文件**全绿 = 上批 571 + 37；lint 0 error / 10 warning 持平；build 绿）。分五组：**域的生命周期 11**（落地那拍仍是单次／段数 = 圈内秒数 ÷ tick／1/64 与 1/128 段数相同／一帧跨 2 秒一次补齐 4 段／圈外零结算／主人倒地后不再新增段但余像放完／前摇内倒地整枚撤掉／**不给 duration 的老圈子行为逐字不变**（回归切片1）／散场回池且第二枚复用／满半径 + 透明度带宽／`duration` 缺 `tick` 抛错）；**拉力 7**（方向朝心／圆心死区／增量与帧长成正比（是"每帧一点"不是"一次性冲量"）／无敌帧吞段数不吞位移／圈外不拽／`pull 0` 只烧血不拖／无玩家参照时自己走完钟）；**接线 11**（`duration/tick/pull/color/owner` 一路传到危险区／二阶段与超距不开井／冷却没到期不开第二口／井口夹回竞技场内并带"必须真夹到"的反空跑断言／三条 `opportunity` 各走各的钟：弹幕 9 秒复铺时井的 12 秒还没到／站住连吃 `1+floor(0.8/tick)` 段／8 米/秒外跑一枚不挨／主人在 tick 中倒地／无危险区系统时不抛错）；**真实位移 3**（站着不动真的被拖走，且位移落在 0.1~1.5 米/秒这个"有感但不无解"的带里／按住背离方向就出得去／写的是真 `Vector3` 不是替身字段）；**表 5**（`ARENA_MOVES.well` 指向真档／三件事齐备且 `tick < duration`／总伤害与一次砸地同量级／抄错招式名与 `phase`、缺 `cooldown` 在加载期各抛其错／`Boss.js` 必须逐项 `spec.duration/tick/pull` 传下去且不在代码里另立数值档）。**单位用例自己交数值**（`tick 0.5`、`dt` 取 1/64 与 1/128）：二进制可精确表示的帧长让"几秒几段"成为整数断言，而不是"差一段也算过"。变异验证九项全部转红且各归其位：`while`→`if` → 1 红（补齐语义）；去掉半径门槛 → 3 红；`cancelFor` 退回"只撤未落地的" → 2 红；不进入 `active` 段 → 11 红；去掉 `spawn` 的 `duration/tick` 校验 → 1 红；去掉圆心死区 → 1 红；`startGravityWell` 漏传 `duration` → 7 红；删掉 `castArenaMove` 的 `well` 分派 → 5 红；整段拉力关掉 → 4 红（含真实位移那组）。
  - **行为增量（玩家会看到的差别）**：① 引力化身第三阶段从此会在玩家脚下留一口 3 秒的蓝圈，地上看得见"是谁在拖我"，不再只有那记没有来源的拉扯。② 站住的代价是 `6 × (1 次落地 + 5 段) = 36` 点，与一次砸地同量级但摊在 3 秒里，而且一边挨打一边往井心漂（实测约 0.55 米/秒，玩家自身移速 15 米/秒）—— 这一档买的是**"停下"**，不是"跑不动"。③ 打死了井就塌：不再出现"主人已死、井还在烧人"。④ 危险区第一次有可复用的"域"生命周期，时停域与后续岩浆带是它的数据变体而不是新代码。⑤ 其余 Boss 与之前完全一致：砸地、弹幕的时机与数值一字未动（切片3 的那条"重构不夹带手感改动"断言仍绿）。
  - **放弃了什么**：① 拉力**没走玩家的受击位移通道**（仍写在 `velocity` 上）。玩家有输入时状态机是整条改写水平速度的（`PlayerController.moveHorizontal`），所以按住方向就能抹掉每一帧的拉力。要做"连跑都被拖着"，得先给 PlayerController 立一条外部冲量账（与翻滚/击退共用），那是独立一片，不在本切片顺手改玩家位移的所有权。② 没做井的变体（减速、击退、向内爆炸），也没做"跳起来脱出"—— 竖直判定仍是切片1 划下的边界（只看水平距离）。③ 没做 per-target 已结算账：域对玩家天然按 `tick` 节奏结算，不需要；将来同一口井要管多个对象时这是必须的一笔，登记进 M2 尾巴。④ 只给引力化身开了井，其它 Boss"该不该有井"是遭遇设计（W-B8），不靠直觉铺。⑤ 时停域没动（它改时标不改血量，是另一类结算器）。⑥ 井的漩涡、被拖时的镜头提示与音效一律没做（M5/M6）。
  - **留了什么尾巴（切片5+ 的清单）**：① **时停域**（B5 最后一档）：改时标不改伤害，并且要一并决定危险区自己吃 `dt` 还是 `rawDt` —— 现在域跟游戏时标一起慢，时停里井也该停，这条要显式写死而不是延续默认。② 玩家侧**外部冲量通道**：把"被拖着走"做成一件有所有权的位移（与击退/翻滚同一份账），届时井的 `pull` 换到那条通道上。—— **已由切片6 关闭（`c4f76a2`）**。③ 域的**每目标已结算账**（同一片场地对多个敌人/召唤物生效时）。④ `BossPhaseDirector` 与场地表对齐、圈与井的美术/音效可读性（M5/M6）。⑤ 非危险区自走技并入统一施法表（W-B1）。

- **2026-09-24 W-A6 切片5：时停域（B5 最后一档：改时标，不改血条）** —— 提交 `e039202`
  - **为什么**：B5 四档里"时停"最特殊 —— 它是唯一**不扣血**的一档，`GroundHazards` 从切片1 起整个结算器都围着"命中 → `takeDamage`"转。更麻烦的是，动手前现场已经有一记时停：时线执政官的 `update()` 直接写 `playerRef.timeSlow = 0.35`，然后在**自然到期**那一条路径写回 `1`。这不是"能跑但难看"：`takeDamage` 里的打断分支和 `Boss.update` 开头的 `if (!this.alive) return` 两条路径都不经过那句还原 —— 玩家把执政官**打在时停里**、或者**被时停里的蓄力法术打断**，`timeSlow` 就永久停在 0.35，跑到天涯海角也不会恢复，而且现场没有任何报错。切片4 留下的两个问题也压在这片：① 危险区到底吃主循环 `dt` 还是墙钟 `rawDt`（域跟游戏时标一起慢，时停里井也该停 —— 默认值不能当决策）；② `slow` 这种"改玩家状态"的结算，写进 `playerRef` 的哪本账。选"账本"而不是"给漏还原补一句 `= 1`"，理由与时停域本身同源：**减速是一种所有权**，多个来源（场、无场时停、将来冰面/减速带）必须能叠加与各自退出，而"谁写了就负责还原"的写法天生只有写者自己知道该还原到什么值。
  - **交付**：
    - `GroundHazards.spawn()` 多收 `slow`（每秒把玩家自己的时钟乘上这个倍率），并给挂了时标的场分配 `timeKey = hazard:${++this._spawnSeq}`（不挂时标的场仍是 `null`，不往玩家账本里塞空格）。结算器从此是三选一：**伤害 / 拉力 / 时标**。`spawn` 当刻两条新校验：给了 `duration` 却什么都不结算（无 `tick`、无 `pull`、无 `slow`）抛错 —— "永不结算的域"是把玩家白关在圈里；`duration > 0` 且 `damage > 0` 而 `tick <= 0` 抛错（把切片4 那条笼统校验收窄成它真正要拦的情形，一击定音的老圈子不受影响）。
    - `_hold()` / `_letGo()`：挂账与还账各一处，`_letGo` 幂等。还账恰好三条活路径 —— **走出圈外那一帧**、**域自然到期那一帧**、**主人倒地 `cancelFor`**。到期与倒地仍在余像之前，所以"余像只欠眼睛，不欠玩家速度"。`_sustain` 的段结算前加 `if (!it.tick) return;`，`_land` 的伤害外包一层 `it.damage > 0 &&`（时停域连落地那一拍都不结算，`damage: 0` 是这一档的定义而不是缺省）。
    - 表现层跟着语义走：`_sustain` 里圆盘脉动乘 `it.slow`，被慢住的那块地**跳得比井慢**，玩家低头就能分出脚下是哪一档。
    - `PlayerController` 新增时标账本：`applyTimeScale(key, scale, leash)`（同 key 重复挂取**更强**、绳**更长**，不同 key 各自一格）、`releaseTimeScale(key)`（幂等）、`updateTimeScales(dt)`（绳子烧完自动删格）。`timeSlow` 从"谁想写就写的字段"降格成 `_syncTimeSlow()` 算出来的**缓存**（全表取最小值，空账本回到 1）。消费者仍只有一个：`speedMultiplier()`，所以这一档改的仍然是玩家移动速度，不是 `Game.time.timeScale`。每帧在 `PlayerFSM` 之前收绳，状态机这一帧就用得上正确的倍率。
    - `TIME_SCALE_LEASH = 0.12` 单独成常量（≈60Hz 七帧）：**每帧续绳**的模型里最坏的失败是"多慢 0.12 秒"，它不是任何一招的时长，不进 `GROUND_HAZARD`、不许当冷却调。
    - `Boss.startGravityWell` 换成通用的 `startDomain(playerPos, entry)`：井和场是**同一段代码**的两种数据（`duration/tick/pull/slow` 逐项从 `arenaSpec(entry)` 转发），第三档与第四档之间不再会长出第二份生命周期。`castArenaMove()` 分派 `barrage` / `slam` / 其余走 `startDomain`。
    - 数据侧：`GROUND_HAZARD.chronoField`（`radius 6 / telegraph 1.1 / damage 0 / duration 3.6 / slow 0.3 / tick 0 / 金 0xc9a962`）；`ARENA_MOVES.freeze = 'chronoField'`；`void-chronarch` 第三阶段一条 `opportunity`（`cooldown 14 / range 17`）。`slow 0.3` 刻意比那记**无场**时停（0.35）更狠一档：有场的惩罚必须比没场的更看得见。
    - 顺手还掉的旧账：`VoidBoss` 那记无场时停改走同一条 `applyTimeScale(TIME_STOP_KEY, 0.35, TIME_SCALE_LEASH)`，并**删掉**直接写 `timeSlow` 的还原句 —— 打断与死亡两条漏还原的路径不是补出来的，是不再存在（断供之后绳子自己烧完）。
  - **门禁与防假绿**：新增 `tests/chrono-field.test.js` **40 例**（全套 **648 例 / 41 文件**全绿 = 上批 608 + 40；lint 0 error / 10 warning 持平；build 绿）。分五组：**时标账本 7**（无来源时账本根本不建／挂上就改倍率、断供在 leash 内自己烧完／每帧续绳不会把持续效果烧断／两格取最狠且撤掉强的还剩弱的／同来源重复挂只占一格且取更强绳更长／没挂过的 key 也能 `release` 不抛／空账本不覆盖手工写的 `timeSlow`）；**时停域的生命周期 12**（前摇里只画圈不快人一步／落地且圈内才挂账且挂的是这一档的 `slow`／全程零伤害包括落地那拍／**走出去那一帧就还账**、不等绳子自己烧完／走回来复用同一格／恰在半径上算圈内／到期那帧还账且余像放完／主人倒地那帧还账／两片场各记各的账／不挂时标的域（井）不占空格／脉动被 `slow` 拖慢／什么都不结算的场在 `spawn` 当刻抛错／`duration` 为 0 的老圈子从不看 `tick`（回归切片1、4））；**时标归玩家，世界时标归世界 3**（`GroundHazards` 全文不出现 `timeScale =`/`hitstop(`/`timeScale *`，也不调 `applyTimeScale`——它只登记"这块地慢"这件事；给半速 `dt` 时场在两倍墙钟里到期，域的秒数是**游戏秒**，B39 那条纪律在新增生命周期里继续成立；还账三条路都在但只有三条 —— `._letGo(` 的出现次数钉死，多余的兜底死代码同样算红）；**表 5**（`ARENA_MOVES.freeze` 指向真档／`chronoField` 四件齐备（不掉血、有长度、有慢）／有场比无场狠／`freeze` 只在执政官脚本里出现，不退回 `default`／把数值档改坏要在加载期抛错）；**时线执政官接线 13**（三阶段冷却到期且入距才铺场且数值全读真表／二阶段不铺（门槛在表里不在代码里）／`range` 硬门槛／前摇里走出去照样落场但没人被挂账／两片场之间隔 `cooldown` 秒／**站在里面真的跑不动**：同一段输入位移短到慢的倍率上，拿不受慢的圈外玩家作对照／场塌了同一批帧里回到全速／无场时停也走账本一个来源一个 key／被打断不再把玩家永久留在慢里／死在时停里同样靠绳子收口／两片时标叠在一起吃最狠那份、场散了还剩那记无场的／无危险区系统时不开场也不报错）。**变异验证 12 项全部转红**（每次只改一处、跑本切片与其邻座两个文件共 77 例，失败数各不相同时才算各归其位）：账本后写覆盖先写 → 2 红；绳子不烧（leash 改 1e9）→ 4 红；出圈不还账 → 2 红；到期不还账 → 3 红；主人倒地不还账 → 4 红；`damage: 0` 也照结 → 1 红；两片场共用一格 → 1 红；不挂时标的域也占 key → 1 红；`castArenaMove` 不认 `freeze`（退回砸地）→ 11 红（含引力井那组）；`chronoField.slow` 调 0.5（弱于无场时停）→ 2 红；执政官退回直接写 `timeSlow` → 4 红；脉动不再乘 `slow` → 1 红。每步改前后都取 md5 指纹，还原后与基线一致。
  - **行为增量（玩家会看到的差别）**：① 时线执政官第三阶段从此会在玩家脚下铺一片 3.6 秒的金圈，站在里面移动速度只剩三成 —— B5 说的"场地机制"四档第一次凑齐。② 打断了时停、或者把执政官打在时停里，玩家**不再被永久减速**（旧版这是一条无提示、无存档、只能靠重开关卡 escape 的软锁，属于本片真正的病灶）。③ 时停域不掉血：它的惩罚是机动，跟井（掉血 + 被拖）与弹幕（连吃）分得开，四档各买一种行为。④ 减速从此可以叠加与各自退出，将来冰面、减速带、剧情虚弱共用同一本账。⑤ 井、砸地、弹幕的时机与数值一字未动（切片3 那条"重构不夹带手感改动"断言仍绿）。
  - **放弃了什么**：① 世界时标（`Game.time.timeScale`）没动：域的秒数按游戏时钟走，游戏慢下来时场也慢 —— 这是本片写死的决策（理由见"时标归玩家"那组），代价是"全场时停"这类招要求危险区改吃 `rawDt`，届时得新增一条显式契约而不是就地默认。② 玩家侧**外部冲量通道**仍没做（切片4 尾巴②）：`pull` 还写在 `velocity` 上，而 `slow` 走的是倍率 —— 两者都不是"玩家的位移所有权"那一层，一起留给那片。③ 没做时停域的"招式也变慢"（`PlayerFSM` 的帧表读 `dt`，所以玩家自己的攻速不变慢；要不要慢是手感设计）。④ 没有把无场时停（追踪弹/引力拉扯/混沌脉冲同理）搬进场地脚本表 —— 它是 Boss 自走技，归 W-B1 的统一施法表。⑤ 冰面/减速带/岩浆带这些 `slow`/`pull` 的数据变体没实装，只保证它们不需要新代码。⑥ 金色场的可读性美术（涟漪边、被慢住时的镜头提示）与音效一律没做（M5/M6）。
  - **留了什么尾巴（W-A6 之后）**：① **逐 Boss 遭遇编排**：现在只有大奥术师（弹幕）、引力化身（井）、执政官（时停 + 无场时停）各有场地脚本，守护者与副本 Boss 走 `default` —— 谁该有哪几档是遭遇设计（W-B8），B4 的副本遭遇表落地时每张 Boss 房模板应能指定自己的场地脚本。② 把圈接进**阶段演出**（`BossPhaseDirector.js`：阶段播报出现那一帧就该看见铺场）。③ 玩家侧外部冲量通道（切片4 尾巴，未变）—— **已由切片6 关闭，见本节末尾那条**。④ 危险区吃 `dt` 还是 `rawDt` 已有明确决策与门禁，但"全场时停"若要做，需要一条显式的域级例外路径。⑤ 圈与井与场的表现层可读性（M5/M6）。

- **2026-09-24 W-A6 切片6：玩家侧外部冲量通道 —— 引力井不再能被按键抹掉** —— 提交 `c4f76a2`
  - **为什么**：切片4 交出井的时候就在"放弃了什么"里写下这条：拉力直接加在 `playerRef.velocity` 上，而 `PlayerFSM.locomotion → moveHorizontal` 是**整条改写**水平速度的（`velocity = dir * speed`），所以玩家只要按住任何一个方向键，每一帧都把这一帧的拉力抹干净 —— 一口号称持续拽人的井，实际只对"撒手站着不动"的人生效，跑动中它等于不存在。另一头同样不对：撒手站着时唯一拦着它的是 locomotion 的摩擦（`decayHorizontal 0.82`），于是外力的钟借在玩家自己的速度上，谁衰减它、衰减多快，取决于玩家有没有按键。这类"两个所有者共用一格账"的症状不会只出现在井上：引力化身那记凭空的 `velocity += 6`、将来敌人打中玩家的位移、撞击、滑冰面，都要同一层。做法照搬已经在 `Enemy` 那边验证过的模型（`knock` 账 + 曲线平均积分），只是所有权归玩家。
  - **交付**：
    - `PlayerController.knock = { x, z }` + 四个入口：`applyKnockback(dirX, dirZ, speed)`（脉冲：归一方向、封顶 `maxSpeed`、返回记下的速度）、`applySustainedForce(dirX, dirZ, accel, dt)`（持续力：记的是**本帧积分** `a(1-e^{-λdt})/λ`）、`clearKnockback()`、`_stepKnock(dt)`（交回本帧要叠进位移的速度，并让账按秒衰减）。
    - **两条通道分开积分**是这一片的核心，不是风格：`_stepKnock` 只交出差值，`update()` 在碰撞积分那一处才 `velocity + kv` 相加。第一版把外力并进 `velocity`（"反正最后都要积分"），实测站住一秒漂了 **3.53 米** —— 因为 `velocity` 自己也在被 locomotion 的摩擦衰减，同一个拉力被喂了两遍，稳态速度变成 `knock/(λ_v·dt)`，**随帧率翻倍**。改成相加后才积分，稳态就是 `pull / decay`。
    - **持续力为什么要单列一个入口**：脉冲按"每帧 `+= a·dt` 再衰减"记账，离散稳态是 `a·dt/(1-e^{-λdt})`，60Hz 下比设计值高 8.9%、128Hz 下高 4.4% —— 帧率换了手感就换（B39 禁的正是这条）。按本帧积分记则稳态精确等于 `a/λ`，与帧长无关；用例直接把 64Hz 与 128Hz 的稳态钉成同一个数。
    - `GroundHazards._sustain` 的拉力换成 `applySustainedForce(dx, dz, it.pull, dt)`，圆心 0.4 米死区与"无敌帧吞段数不吞位移"两条语义原样保留；`SpaceBoss` 那记 `velocity.x += 6` 换成 `applyKnockback(dx, dz, 6)`（它从此会自己衰减，而不是靠玩家撒手才被摩擦抹掉）。**没有任何一处再直接写玩家的 `velocity`**，两条静态门禁守着。
    - `teleport()` **无条件**清账：`keepVelocity` 保的是玩家自己的动量，而拽他的那口井在上一张地图上 —— 落点上再留一笔隐形的手，等于快速旅行出去还往回漂。
    - `PLAYER_KNOCK = { decay: 11, maxSpeed: 14 }`：`decay` 与 `HIT.decay` 同档（"我推敌人一下"与"场拽我一下"两边衰减同一个钟，这条有断言守着）；`maxSpeed` 是多来源叠加的封顶。井的 `pull 8` 稳态 ≈ 0.73 米/秒，玩家移速 15。
    - 测试侧把替身收干净：`makePlayerRef()` 不再暴露 `velocity`，只记 `tugs`（脉冲记请求速度、持续力记 `accel + dt`），怎么衰减与积分归真实 `PlayerController` 管；`makePlayer` 宿主补上 `knock`/`_knockStep` 两个构造器字段。
  - **门禁与防假绿**：新增 `tests/player-knockback.test.js` **20 例**（全套 **671 例 / 42 文件**全绿 = 上批 648 + 20 + `gravity-well` 净增 3；lint 0 error / 10 warning 持平；build 绿）。分四组：**冲量账 8**（方向不必预先归一／不请不动：`speed<=0` 与零方向都不进账不抛／同向相加反向相消且不留 `-0`／封顶不封向／断供后 0.4 秒仍有余速、1.0 秒整干净／64Hz 与 128Hz 余额与累计位移相同／一帧跨一整秒也只用积分值 `v(1-e^{-λ})/λ`／持续力稳态两档帧率都精确等于 `accel/decay`）；**位移合成 4**（`_stepKnock` 不写 `velocity`／无账的一帧返回**同一个**复用槽对象（M4 不许热路径分配）／传送无条件清账（`keepVelocity: true` 也清）／账本没有竖直那一格，跳与重力仍是玩家自己的事）；**真实位移 4**（站住一秒走过的距离落在 `pull/decay` 的 0.8~1.05 带里且玩家速度账干净为 0／按住背离方向仍出得去但一秒少走 0.6~0.85 米／断供后尾冲不足一拃（<0.12 米）且一秒内收口／翻滚期间外力照叠 —— 冲量仍是那段的主导但每步被拽短）；**施法者一侧 4**（`SpaceBoss` 那记拖拽进的是账本，且替身根本没有 `velocity` 可写／井里的稳态漂移实测 `= pull/decay` 而玩家速度一秒过去一个子都没多／两处静态门禁不许再出现对 `velocity` 的赋值／`PLAYER_KNOCK.decay === HIT.decay`）。**变异验证 12 项全部转红**、失败数各归其位（外力并进 velocity → 7 红；持续力按 `a·dt` 记 → 2 红；封顶取消 → 1 红；传送不清账 → 1 红；方向不归一 → 5 红；位移用起始值 → 2 红；圆心死区取消 → 1 红；危险区同时又裸写 velocity → 13 红；引力化身退回裸写 → 2 红；玩家侧衰减改档 → 7 红；复用槽改每帧新建 → 1 红；小额不归零 → 2 红），每步用临时目录的 `cp` 副本还原并 `cmp` 证明一致。**这一片差点被自己的验证脚本毁掉**：第一版变异脚本在两处之间用 `git checkout -- <file>` 还原，而那些文件里是**未提交的本切片代码** —— 四个文件的改动被整体抹掉，只能照着会话记录重打一遍。纪律补进项目记忆：**验证回路里的还原一律用 `cp` 副本，不用 git**；脚本跑完即删，不留在 `scripts/`。
  - **行为增量（玩家会看到的差别）**：① 引力井对**跑动中的人**也生效了：按住背离方向仍然出得去（约 14.3 米/秒），但每一帧都被拽走约 0.73 米/秒，一秒少走约 0.7 米。② 站住不动的漂移从"借摩擦才停住"变成设计值 `pull/decay ≈ 0.73 米/秒`（实测一秒 0.66 米，切片4 定档时是 0.55），并且**帧率换了数就换**这条彻底不成立：64Hz 与 128Hz 一秒里的漂移差不到 3 厘米。③ 引力化身二阶段那记拖拽（无井的那次）现在是一记会自己衰减的 6 米/秒冲量，不再是一段靠玩家按键才停得下来的滑动。④ 快速旅行/重生/进副本落点不再带着上一张地图的隐形拉力。⑤ 井的伤害、时长、半径、颜色一字未动；砸地、弹幕、时停域同样未动（切片3 那条"重构不夹带手感改动"断言仍绿 —— 这一片**有意**夹带手感改动，改的只有拉力）。
  - **浏览器实测（§0.2 要求的那一栏）**：`vite --port 5188`（DEV 下 `window.__game` 才挂），注入帧跑真装配好的 `PlayerController` + `enemyManager.hazards`。① 在玩家 4 米处落一口真数值井（`pull 8 / radius 5.5`），注入 64 帧：`knock` 稳在 **0.72727**（理论 `pull/decay = 8/11 = 0.72727`），这一秒实际漂 **0.645 米**，而 `player.velocity` 全程是 **0** —— 外力没有漏进玩家那本账。② 同一位玩家按住 W 一秒：无拉力走 **12.89 米**、有拉力走 **12.35 米**（少走 **0.54 米**），两次的 `velocity` 读数都是满 15 —— 切片4 那句"按住方向键就能抹掉拉力"在现场不成立了。控制台只有 0×0 视口的 `GL_INVALID_FRAMEBUFFER_OPERATION` 警告（in-app 浏览器已知 quirky），无 JS 报错。
  - **放弃了什么**：① 玩家**被敌人打中时不产生击退**：通道建好了，但那是新战斗手感（要不要踉跄位移、格挡与硬直各吃多少），归 M2 剩下的手感项，这一片只把已有的两个施力者搬过来。② 没有给外力做竖直分量（井不把你往天上拽；被击飞的竖直冲量仍走 `velocity.y`）。③ 翻滚期间外力照叠，**没有**给翻滚"免控"（位移冲量远大于拉力，实测每秒仍被拽短一步；无敌帧吞位移的语义切片4 就定过）。④ 没做 `pull` 随半径衰减（井内是均匀力场；"越近越狠"是一档新数值形状）。⑤ `PlayerAutoPlay` 与 `QuestAssistant` 仍直接写 `velocity`（开发/自动化工具，不在战斗路径上，没顺手改）。⑥ 外力没有"重量"概念：Boss 拽玩家与玩家撞墙用同一个封顶，将来做击退差异时再拆。
  - **留了什么尾巴（切片7+）**：① 玩家受击时的击退接到这条通道上（M2 手感剩余项）。② 逐 Boss 遭遇编排与 `BossPhaseDirector` 对齐（未变，W-B8 / B4）。③ 岩浆带/冰面/减速带这些 `slow`/`pull`/`knock` 的数据变体。④ 表现层可读性：被拽时镜头与音效的提示（M5/M6）。⑤ "全场时停"若要做，需要危险区的域级 `rawDt` 例外路径（切片5 尾巴①，未变）。

- **2026-09-24 W-A7 切片1：手柄轮询桥与绑定表 —— 桥只做"合成成 keys"这一件事** —— 提交 `7e20251`
  - **为什么**：Phase A 只剩这一包没动（W-A7，依赖 W-A3 早已 ✅），而游戏现在**只能键盘 + 鼠标**玩：`Game.setupInput()` 是全仓唯一的采集器，`navigator.getGamepads` 在 `src/` 下出现 0 次。动手前有两种做法：① 先做一套"逻辑动作"抽象，把现有 20 多处 `keys['KeyW']` 全改成 `input.held('moveUp')`，再接手柄；② 手柄侧**合成成现有形状**（`keys` 用 `KeyboardEvent.code` 当键、攻击写进 `CombatController.mouseDown`），消费者一行不改。选 ②：它把"接手柄"和"改消费者"拆成两片，①的重构风险（改错一处就是手感回归、而且没有测试覆盖所有热键）现在完全没有必要承担；代价是 `code` 这一层暂时还留在中间，重映射界面将来要显示的是"动作 → 按键码"而不是"动作 → 抽象动作"，这条代价是可见且可还的。
  - **交付**：
    - `content/keybinds.js`：`PAD_ACTIONS`（14 个逻辑动作）+ `GAMEPAD_BINDINGS`（每动作一条：`mode`、出口 `code` 或 `mouse`、来源 `button` 或 `axes`+`dir`）+ `PAD`（径向死区 0.2、按下 0.5 / 松开 0.35 的扳机迟滞）+ `assertKeybinds()` 加载期整表校验（与 `assertArenaScript` 同一条纪律：**错表要在插上柄之前就红**，而不是玩家按下发现"没反应"却无从查起）。校验里有一条专防出口相撞：两个动作抢同一个 `code` = 一次按下办两件事。
    - `engine/GamepadInput.js`：`poll()` 每帧一次，全仓唯一读 `getGamepads()` 的地方（扫 `src/` 全树的静态门禁钉住：除桥之外任何文件都不许出现 `getGamepads`，避免长出第二个输入真源）。表在构造时展开成 `_slots` 数组（轮询路径不查表名、不分配对象）；`_pickPad()` 认住第一次选中的插槽，另一只手柄插进来不改变目标。
    - 三条决定"能不能用"的规则（也是这片真正的含量所在）：① **`claimed` 记账** —— 键盘与手柄共用同一格 `keys['KeyW']`，若每帧无条件写 `false`，插着柄时键盘按的 W 会被抹掉；所以手柄只还自己借走的那一份。② **`level` / `edge` 分开** —— 现有消费者里有一批是"读完把 `keys[code]` 清成 false"的老写法（`KeyQ` 锁定、`KeyX` 换武器、`Digit4`、`KeyE` 交互），给电平就会按住连发；这正是 W-A4 记录过的"按住 Ctrl 每帧请求一次翻滚"那一类事故，桥先把坑填上，老写法本身留给后续切片收口。③ **拔手那一帧 `releaseAll()`** —— 不清就是"松手还一直朝前走"，比没反应糟。
    - 摇杆按**八向量**走（`atan2` 量化，正方向各占 ±22.5°、斜方向各 45°），不是"两轴各自过门限"；后者推到 70° 时两根轴都算按着，玩家想纯向前却斜着走。十字键由动作的 `dir` 顺带同绑，一条声明覆盖两种输入习惯。
    - 接线：`Game.setupInput()` 里构造（`keys: this.keys` + `mouseDown: this.player.combat.mouseDown`），`Game.update()` 在算出 `dt` 之后、消费 `keys` 之前 `this.padInput?.poll()`。没有手柄时 `poll()` 只做一次枚举，`keys` 一个字节都不写（有用例直接断言仍是 `{}`）。
    - 伴生：`tests/gamepad-input.test.js` 用手写 `fakePad`（标准映射 16 键 4 轴）驱动，`getPads` 作为构造参数注入，不依赖浏览器实现。
  - **门禁与防假绿**：新增 **27 例**（表 8 + 不碰键盘 3 + 电平与边沿 10 + 热插拔 3 + 接线 3），全套 **698 例 / 43 文件**全绿（上批 671 + 27；lint 0 error / 10 warning 持平；build 绿）。用例的重心是**"第几帧为真"**而不是"读得到值"：`edge` 按住五帧断言 `[true,false,false,false,false]`、松开再按才算第二次、轻击走 `mouseDown` 时"按下帧置真、下一帧就交出去"（否则会排队成两刀）、扳机模拟量 0.4 不触发 / 0.95 触发、迟滞用 0.42（低于 `pressThreshold` 高于 `releaseThreshold`）验"还按着"。**变异验证 8 项全部转红且各归其位**（每次只改一处、只跑本文件 27 例，改前后 `cmp` 证明还原一致）：还原 `claimed` 语义、改成无条件写 `false` → 1 红（正是"键盘按着的 W 不被手柄抹掉"那一条）；`edge` 退回电平 → 3 红（不连发 / 松开再按 / 轻击不排队）；去掉拔手时的 `releaseAll` → 2 红；去掉扳机迟滞（两档阈值并成一档）→ 1 红；八向量换成"每轴各自过 0.3 门限" → 1 红（偏 20° 那格不该点亮第二个方向）；主循环不再轮询桥 → 1 红（接线静态门禁）；校验器去掉"两个动作抢同一个出口"那条 → 1 红；`mouse` 出口写成 `keys.left` → 2 红（轻击那组）。**浏览器实测**（`vite --port 5189`，注入假 `navigator.getGamepads` 后走真 `Game.update()`，全程零键盘事件）：推杆 → `g.keys.KeyW` 为真、玩家从 z=60 走到 z=57.35（**2.65 米**）；杆回中后 `g.keys` 无任何残留 true。
  - **行为增量（玩家会看到的差别）**：① 插上 XInput 手柄（Xbox / Switch Pro 的标准映射）就能用左摇杆与十字键走、A 跳、B 翻滚、RB 轻击、RT 重击、LB 锁定、X 弹反、Y 战技、LT 一号法术、Back 换武器、L3 冲刺 —— 这些以前**一个都没有**。② 键盘玩家完全无感：没有手柄时桥不写 `keys`，键盘与鼠标路径逐字不变。③ 手感上刻意保留两格"还没做"：Start 不弹菜单、右摇杆不转镜头（见尾巴），所以现在是"能用来自手柄的移动与战斗"，不是"完整手柄体验"。
  - **放弃了什么**：① 没做逻辑动作抽象层（`input.held('jump')`），`code` 仍是中间语言 —— 理由见"为什么"。② Start / Select 一类 UI 热键没接：`Escape`/`Tab`/`KeyM`/`KeyH` 这些是 `keydown` **事件监听器**消费的，桥写 `keys['Escape']` 没有任何人会读；表里有一条用例把这个坑钉住（不许出现只被事件消费的 code），接线改成可轮询形状是独立一片。③ 右摇杆镜头没接（要直接喂 `player.addCameraInput(dx, dy)`，不是 `keys` 形状），鼠标镜头不受影响。④ 摇杆只有八向，没有模拟量速度（推一半不等于走一半）—— 要它得让 `readMoveDir` 接受一个模拟向量，与"外部冲量通道"同属位移所有权那一层。⑤ 没有重映射界面与持久化：`SettingsManager` 现在是扁平无版本的结构，加一张绑定表进去要先把存档 schema 那条路铺好（另片）。⑥ 没做震动（`gamepad.hapticActuators`）与手柄图标提示（HUD 文案仍是键盘键名）。⑦ 没有 `gamepadconnected/disconnected` 事件接入：现在靠每帧枚举，拔手最坏晚一帧才还键。
  - **留了什么尾巴（W-A7 切片2+）**：① UI 热键改成可轮询（或桥直接派发同一套动作），然后接 Start=暂停 / Select=地图。② 右摇杆 → 镜头（含死区与曲线）。③ 重映射界面 + `SettingsManager` 持久化与版本化。④ 模拟量移动。⑤ 手柄图标/键名提示随输入设备切换（HUD）。⑥ 震动反馈与 M6 音效总线一起做。

- **2026-09-24 W-A7 切片2：右摇杆镜头 —— 模拟量不该冒充按键，镜头守卫只留一处** —— 提交 `2c359fa`
  - **为什么**：切片1 之后手柄"能走能打但看不到身后"，而最直接的做法是把右摇杆也按切片1 那套路子量化成四个方向码（`KeyRight` 之类）—— 那是**把模拟量塞进布尔的口子**：镜头是玩家用来微调准星的东西，八向量化会把它变成"要么不转要么满舵"的机械臂，比没接还难受。所以这一片刻意**不走 `keys`**：镜头另开一条模拟量出口，直连 `PlayerController.addCameraInput`。第二个动因是守卫：`mousemove` 那条监听器里写着四条判断（`autoPlayMode` / `blocksCamera` / `pointerLocked` / `dialog.open||upgrade.open`），手柄若要"再来一份几乎一样的判断"就是第二处守卫 —— 改一半漏一半是这类代码的标准死法，顺手收成一处。
  - **交付**：
    - `PAD` 多三项：`lookAxes [2,3]`、`lookDeadzone 0.15`、`lookPixelsPerSecond 1300`。**单位选"每秒相当于推多少鼠标点"而不是"度/秒"**，因为 `addCameraInput` 吃的就是点、灵敏度（`cameraSensitivity 0.002` 弧度/点）必须只有一个真源 —— 若桥自己按弧度算，灵敏度就有两处定义点，调 Sensitivity 滑杆时手柄不会跟着变。换算写进注释：1300 × 0.002 ≈ 2.6 弧度/秒 ≈ 150°/秒（既跟得上转身，也不至于满舵一秒就晕）。
    - 死区**重映射**：`scale = (mag - deadzone) / (1 - deadzone)`，出死区那一瞬间是 0 而不是跳一档；方向保持（按单位向量分轴），对角推的模长就是那一档的舵量。死区比移动小一档（0.15 vs 0.2）：镜头对漂移比走路更显眼。
    - `GamepadInput.poll()` 顺带算 `this.look`（复用槽，热路径不分配），`releaseAll()` 把舵量一起归零 —— 拔手不清就是镜头永远在转。
    - `Game.update()`：`addCameraInput(look.x * rawDt, look.y * rawDt)`。**吃 `rawDt` 而不是 `dt`**：命中停顿冻的是游戏时间，而鼠标从来不经过时间倍率，手柄与它同属"玩家的物理输入"，两者必须一起慢或一起不慢。
    - `Game.cameraInputAllowed(forPointer)` 成为镜头输入的唯一守卫：鼠标传 `true`（要指针锁），手柄传 `false` —— 指针锁是鼠标概念，要求手柄玩家"先点一下画面才能转镜头"等于把 Start 键按不出来。
  - **门禁与防假绿**：`tests/gamepad-input.test.js` 新增"右摇杆镜头"一组 **8 例**（27 → **35**），全套 **706 例 / 43 文件**全绿（上批 698 + 8；lint 0 error / 10 warning 持平；build 绿）。八例都在断言"形状与量级"而不是"有没有调用"：满舵 → `look.x = lookPixelsPerSecond` 且 **`keys` 仍是 `{}`**（镜头不许冒充按键）；死区内 → 两轴都是 0；半推 → 精确等于重映射式；对角 → 模长与方向都守恒；左杆/右杆互不串门（两条断言，正反对称）；拔手那一帧舵量为 0；**接到真 `PlayerController`**：满舵一秒转过的弧度 = `lookPixelsPerSecond × cameraSensitivity`（乘的是实例上的灵敏度，不是抄下来的 0.002 —— 改了真值这条就红），且 64Hz 与 128Hz 的累计转角相同（B39）；静态门禁：`cameraInputAllowed(` 在 `Game.js` 里恰好出现 3 次（定义 + 鼠标 + 手柄）、`(true)` 与 `(false)` 各一次、主循环那一句确实乘了 `rawDt`。**变异验证八项全部转红、各归其位**（每次只改一处、只跑本文件 35 例，`cmp` 证明还原一致）：死区取消 → 1 红；不做死区重映射 → 1 红；丢掉俯仰轴 → 2 红；拔手不还舵量 → 1 红；主循环不乘 `dt`（帧率越高转越快）→ 1 红；手柄也要求指针锁 → 1 红；右杆读成左杆 → 5 红；镜头速率退化成布尔（满舵或不动）→ 1 红。**浏览器实测**（`vite --port 5190`，注入假 `getGamepads` 走真 `Game.update()`）：没点过画面时 `cameraInputAllowed(false) = true` 而 `(true) = false`（手柄不必指针锁、鼠标仍然要）；满舵 12 帧（Σ`rawDt` = 0.251 秒）Δyaw = **0.6534** 弧度，与 `1300 × 0.002 × 0.251` 四位小数完全吻合（≈149°/秒）；杆回中与拔手那一帧 `look` 都是 `{x:0, y:0}`。
  - **行为增量（玩家会看到的差别）**：① 手柄玩家第一次能自由转身 —— 右摇杆推到哪就往哪看，推一半转半速。② 灵敏度滑杆仍然只有一个真源：改 `cameraSensitivity` 时鼠标与手柄一起变。③ 键盘/鼠标玩家零感知：没有手柄时 `look` 恒为 0，那条乘 `rawDt` 的分支根本不进。④ 鼠标镜头行为逐字不变（守卫重构是等价的：四条判断的合取与原来一致，只多了一条"手柄不要求指针锁"的分支）。
  - **放弃了什么**：① 没给手柄单独一档灵敏度曲线（响应曲线 / 加速度）—— 现在是一条线性映射加重映射死区，曲线是手感题，等重映射界面一起做才有意义（同一个面板里给"镜头速度 + 曲线"两项）。② 左摇杆移动**仍没有模拟量**（八向），这条与切片1 同源、留在同一个尾巴里。③ 没做"按下 L3 锁定目标后右杆改成越肩/微调"这类联动（归 W-A5 的镜头层）。④ 没接 `gamepadconnected` 事件，舵量最坏晚一帧才归零（每帧枚举已足够）。⑤ 垂直方向的俯仰上限沿用玩家既有的 clamp（第三人称 -0.12~0.62），手柄不额外收窄 —— 满舵往上推会顶到边界，这是既有行为。
  - **留了什么尾巴（W-A7 切片3+）**：① UI 热键的事件路由（Start 菜单 / Select 地图），未变。② 重映射界面 + `SettingsManager` 版本化持久化 —— 现在 `code` 仍是中间语言，界面上要显示的是"动作 → 按键码 / 手柄位置"。③ 模拟量移动。④ 镜头响应曲线与灵敏度滑杆合入同一个设置页。⑤ 手柄提示图标（HUD 仍显示键盘键名）。⑥ 震动（`hapticActuators`）与 M6 一起做。

- **2026-09-24 W-A7 切片3：UI 热键改成可轮询 —— 键盘与手柄共用一个派发口** —— 提交 `7d1a01e`
  - **为什么**：切片1 立过一条界碑用例："表里不许出现只被 `keydown` 事件消费的码"，因为那时 `Escape`/`Tab`/`KeyM` 全写在 `Game.setupInput()` 的监听器分支里，桥写 `keys['Escape']` 没有读者 —— 于是手柄**开得了战斗、开不了菜单**。界碑本身是对的，但它把"没人读"这件事固化成了设计约束；解法应该是让**有人读**。第二个动因是那条级联：`Escape` 有七层顺序（片尾跳过 → 战斗演出 → 世界地图 → 自动演示 → 图鉴 → 过场 → 暂停菜单），全仓**一行测试都没有**，顺序本身就是产品决策，却只以"分支书写的先后"存在。第三个动因是按住连发：浏览器对按住不放的键持续重发 `keydown`，所以按住 `Tab` 会把区域面板抖成筛子 —— 今天就在发生，只是没人按那么久。
  - **交付**：
    - `content/hotkeys.js`：`UI_HOTKEYS`（15 条 `{ code, action, preventDefault? }`）+ `UI_ACTIONS` + 加载期 `assertHotkeys`（code 唯一、action 唯一、非空）。分工与 `arenaScripts.js` 一致：**表只有声明，行为本体在 `Game.runHotkey()`**。
    - `ui/HotkeyRouter.js`：`onKeydown(code)`（只回答"这一下要不要挡浏览器默认行为"）与 `poll(keys)`（边沿派发，且**再问一次阻塞判据**）。状态是一根与表同长的定长数组，每帧只读写固定槽。
    - `Game.js`：`keydown` 监听器缩成三行（记 `keys[e.code]` + 问路由要不要 `preventDefault`）；原样保留的守卫变成 `hotkeyBlocked(code)`（三条判据一字未改，含"世界地图开着时 G / Escape / Tab 放行"那个例外）；15 个动作搬进 `runHotkey(action)` 的 switch；`update()` 里每帧 `this.hotkeys.poll(this.keys)`。
    - `escapeRoute(state)` 是**纯函数**：六个布尔进、一个归属出。`Game.runEscape()` 只负责按归属执行副作用。它保留了一个细节 —— `endCredits.trySkip()` / `combatCinematicSkip.canSkip()` 是**带副作用的谓词**（调用即跳过），所以入参只求值一次，级联顺序与原分支等价。
    - `keybinds.js`：`start → Escape`（`pauseMenu` 动作，`edge`）。切片1 那条"不许绑事件码"的用例就此翻案，改写成"手柄开得了暂停菜单，且按住不放只开关一次"。
    - 派发时机从"事件瞬间"变成"下一帧轮询"：≤1 帧延迟（键盘按下到画面响应本来就有这个量级的抖动），换来一条共用通路，而且 `CombatController` 的 0.18 秒输入缓冲同属"下一帧也认"的设计。
  - **门禁与防假绿**：新增 `tests/hotkey-router.test.js` **16 例**（表 5 + 派发语义 7 + 级联 4），`tests/gamepad-input.test.js` 仍 35 例（一条翻案重写），全套 **722 例 / 44 文件**全绿（上批 706 + 16；lint 0 error / 10 warning 持平；build 绿）。要点：表外键不许被 UI 层吃掉（`KeyW`/`Space`/`ControlLeft` 派发结果是空表）；**按住五帧只派发一次**（改前是五次，用例名就写着这件事）；阻塞时既不派发也不请求 `preventDefault`（焦点该还给浏览器）；"事件时没阻塞、轮询时已阻塞"→ **丢弃而不是延后补发**（边沿已经用掉）；`preventDefault` 只给声明过的键（`KeyH`/`Tab`/`F2` 真，`KeyM`/`Escape`/未知键假）；只写 `keys`、不派发任何事件也能开出 `escape`（这就是手柄那条路）。静态门禁两条：`runHotkey` 的 `case` 集合与 `UI_ACTIONS` **集相等**（漏一个红、多一个也红），`keydown` 监听器里不许再出现 `e.code ===`（分支加回去就是第二个派发真源）。`escapeRoute` 用阶梯表驱动测：七层全真时按序吃掉，每关掉一层轮到下一层，外加"地图与自动演示同开 → 先关地图"。**变异验证八项全部转红**（边沿退化成电平 2 红；轮询不判阻塞 2 红；事件时刻不判阻塞 1 红；`preventDefault` 声明被忽略 1 红；表里多一个没人实现的动作 1 红；`keydown` 里加回一条分支 1 红；级联里地图与演示顺序对调 2 红；边沿初值给 `true` 吞掉第一次按下 3 红），每步 `cp` 副本还原并 `cmp` 证明一致。**浏览器实测**（5191 dev 口）：派发真实 `keydown KeyV` → 一次 `g.update()` 就切到第一人称，松手再按 → 再切回（两按两切、一按一停）；注入假手柄按下 Start → `pauseMenu.open` 与 `paused` 双双为真、`keys.Escape` 由桥写入 —— **手柄第一次开出暂停菜单**；点"继续"后 `paused` 回假。
  - **行为增量（玩家会看到的差别）**：① 手柄能开暂停菜单了（Start）。② 按住热键不再连发：按住 `Tab`/`F2`/`KeyM` 只翻一次（改前跟着浏览器重发反复开关）。③ 键盘侧每个动作的**结果**不变，只晚不超过一帧；`preventDefault` 仍在事件里同刻决定，所以 `Tab` 不会跳焦点、反引号不会触发浏览器搜索。④ `Escape` 的七层顺序第一次有了名字和测试 —— 以后要改顺序得先改那张表。
  - **放弃了什么**：① **B46 没修**（暂停菜单开着时 `Escape` 关不掉）：这不是少写一个分支，而是"面板开着时 `Escape` 该关谁"从来没有定义 —— `runEscape` 的级联里没有 `settings`/`fastTravel` 层，随手补一个 pause 分支只是碰巧对。当场登记进 §1.4 待修表，归 W-D1 `OverlayStack`（其验收原文正是"模态栈、焦点管理、Esc/手柄返回一致"）。② `Select` 没绑地图：菜单导航的正解是"左摇杆 + A 在面板里走"，不是把更多 UI 码绑上手柄按钮（那会挤掉战斗位）。③ 没做热键重映射界面 —— 但 `UI_HOTKEYS` 已经是那张表，界面只剩渲染与持久化。④ `Dialog` / `CombatCinematicSkip` 自己的 `keydown` 监听器没动（它们与焦点有关，挪进轮询是另一道题）。⑤ 菜单内的手柄导航没做。
  - **留了什么尾巴（W-A7 切片4+）**：① **B46**（面板开着时 `Escape` 的归属）随 W-D1 一起做，做完 Start 才算"能开也能关"。② 重映射界面 + `SettingsManager` 版本化（`UI_HOTKEYS` 与 `GAMEPAD_BINDINGS` 已经是可渲染的两张表）。③ 菜单手柄导航（摇杆移焦 + A 确认 + B 返回，依赖 B46 与 `OverlayStack`）。④ 模拟量移动。⑤ HUD 键名/图标随输入设备切换。⑥ 震动。
