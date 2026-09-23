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
| 测试 | 266 例 / 20 文件 | **409 例 / 30 文件**，全绿 | 新增 10 个文件：`timing-boundary` `engine-scheduler` `engine-observable` `zone-identity` `franchise-identity` `fast-travel` `poi-identity` `effect-timing` `event-registry` `event-bus`（本片 +15 例）。注：本批 `npx vitest run` 偶发 1~3 条 `ProgressEvent is not defined` 的**未处理 rejection**（three.js 纹理加载器在 fetch 分块时构造 `ProgressEvent`，node 无此全局）—— 经复查在**未含本片改动的 HEAD** 上同样复现（3 次跑 1/1/0 条），属既有测试的定时性抖动，非本切片引入，测试全绿不受影响 |
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
| A4 | 镜头只有单层覆盖，**没有混合栈**：进出过场是一帧硬切，锁定无阻尼、无越肩 | M3 第一/二切片已登记"未做" |

**B. 前 1 小时**

| # | 短板 | 证据 |
|---|------|------|
| B1 | **没有装备系统**。掉落只有一个八面体给"位面之魂"，无装备/词缀/稀有度 | `LootSystem.js` 全文无 `rarity`/`affix`/`equip` |
| B2 | 技能树只有 **8 个节点**（剑系 4 + 杖系 4） | `WeaponSkillTree.js` |
| B3 | 支线只有 **7 条**；主线 32 步是硬编码线性数组，**零分支** | `SideQuestRegistry.js` / `QuestSystem.js` |
| B4 | 地下城是 4×6 随机迷宫，房间只差配色，没有房间模板与遭遇表 | `ProceduralDungeonGenerator.js` |
| B5 | Boss 有 6 个类，但**没有场地机制**（红圈/弹幕/引力/时停），阶段只是数值与速度变化 | `BossPhaseDirector.js`，M2 遗留项 |
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
| W-A5 | 镜头混合栈 + 锁定手感（阻尼、越肩、过场平滑交接） | L | W-A1 | ⬜ |
| W-A6 | Boss 场地机制（红圈 / 弹幕 / 引力 / 时停 四类原型 × 6 Boss） | L | W-A4 | ⬜ |
| W-A7 | 手柄支持 + 键位重映射 | M | W-A3 | ⬜ |

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
| W-A5 | 镜头混合栈 + 锁定手感 | ⬜ | | | |
| W-A6 | Boss 场地机制 | ⬜ | | | |
| W-A7 | 手柄支持 + 键位重映射 | ⬜ | | | |
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
  - **遗留（B44 关闭后仍开的账，均已登记非缺陷）**：① 逐系统把 131 处裸监听迁到 `on()/offAll(tag)`，归 W-B，由本切片的只许收缩台账钉住不许反弹；② `emit()` 已就位，但派发侧 137 处 `new CustomEvent` 尚未收编，收编后才有真正单一的派发咽喉做键级校验；③ "系统重建后旧监听还在响应"这一类双份响应的正面测试要等某个真会重建的系统（新游戏+）落地才能写 —— 现在能测的是"注销机制本身有效"（已测）与"HUD 的 dispose 真结三本账"（已测）。另记一笔与本切片无关的既有测试抖动：全套 `vitest run` 偶发 1~3 条 `ProgressEvent is not defined` 未处理 rejection（three.js 纹理加载器在 fetch 分块时构造它、node 无此全局），在**不含本切片改动的 HEAD** 上同样复现（3 次跑 1/1/0 条），测试全绿不受影响，登记备查、归 M4 的测试夹具收口。

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
