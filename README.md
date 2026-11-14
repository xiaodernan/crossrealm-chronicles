# 跨界纪元 · Crossrealm Chronicles

> 浏览器端第三人称开放世界动作 RPG（Three.js + Vite）
> Browser-based third-person open-world action RPG (Three.js + Vite)
> 世界观：奇幻 · 魔法 · 星际 三个位面碎片拼接而成 · 中文 ↔ 英文 UI 完全双表
> Setting: three planes — Fantasy · Magick · Starlight — stitched into one world. Full bilingual UI (zh/en).
> 当前状态：**17 母题六档闭环 / 全链路可观测 / LLM 联调流式化** ——唯一执行计划：[`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md)
> Status: 17 mother-themes × full loop / end-to-end observability / real-time LLM streaming out of the box. Authoritative plan: [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md)

> 🆕 **线上展示（最新成果同步）：** [作品最新进展一页看](creative/showcase.html) · [玩家小册子（双语全量）](creative/player-guide.html) · [启用自动同步 → Pages](docs/SHOWCASE_SYNC.md) · [跨界纪事设定集 · 英文版](creative/GLOSSARY-en.md)
> 🆕 **Live showcase (always latest):** [One-page latest results](creative/showcase.html) · [Player booklet (full bilingual)](creative/player-guide.html) · [Auto-sync via Pages →](docs/SHOWCASE_SYNC.md) · [Crossrealm Chronicles Codex · EN](creative/GLOSSARY-en.md)

---

## 快速开始 / Quickstart

```bash
npm install
npm run dev      # http://localhost:5173
npm run test     # Vitest 单元测试 / Vitest unit tests
```

其他常用命令 / Other common commands:

```bash
npm run build    # 产出 dist/ / produce dist/
npm run size     # 首屏体积门禁（< 2.25 MiB）/ first-paint size budget (< 2.25 MiB)
npm run lint     # ESLint
npm run perf     # 回归 draw-call / 帧速门禁 / regression gate for draw calls & framerate
npm run e2e      # 真玩家端到端通关（headless 浏览器，~226 秒）/ end-to-end headless full playthrough (~226s)
npm run preview  # 本地预览构建产物（测试生产白屏回归）/ local preview of the production build
node scripts/cache-hit-bench.mjs --calls=8   # 真上游 prompt-cache 命中率实测（LLM_API_KEY 必需；输出 plain 文本或 --json）/
                                             # live upstream prompt-cache hit-rate bench (requires LLM_API_KEY)
```

## 操作 / Controls

| 键 Key | 作用 Action |
|--------|-------------|
| WASD / Shift / Space | 移动 / 疾跑 / 跳跃 · Move / Sprint / Jump |
| 鼠标左键 / 右键 · LMB / RMB | 轻击连段 / 重击 · Light combo / Heavy attack |
| Ctrl | 翻滚（有无敌帧）· Dodge roll (i-frames) |
| F | 弹反 · Parry |
| R | 位面斩（战技）· Plane Slash (battle skill) |
| Q | 锁定目标 · Lock on |
| E | 交互（营火 / 宝箱 / NPC / 碎片）· Interact (campfire / chest / NPC / shard) |
| X | 切换 剑 / 法杖 · Toggle sword / staff |
| T | 营火快速旅行（Chapter 2 后）· Campfire fast travel (after Chapter 2) |
| 1 / 2 / 3（长按蓄力）/ 4 · hold to charge | 法术 · Spells |
| J / M / G / Tab | 日志 / 小地图 / 世界地图 / 区域面板 · Journal / minimap / world map / zone panel |
| U / V | 任务助手 / 视角模式 · Quest assistant / camera mode |
| P / L | 存档 / 读档 · Save / Load |
| H | 手册 · 「`」本局统计 · F2 拍照 · F10 设置 · Esc 暂停 · Manual · backtick stats · F2 photo · F10 settings · Esc pause |
| N | 自动演示（用于冒烟验证）· Autoplay demo (smoke verification) |

## 目录 / Layout

```
src/
  core/       主循环与装配（Game.js）· Main loop & assembly (Game.js)
  engine/     与玩法无关的地基（碰撞/FSM/时间/事件）· Gameplay-agnostic foundation (collision, FSM, time, events)
  player/     第三人称控制器、角色模型 · Third-person controller, character models
  combat/     战斗、敌人、Boss、法术、弹道 · Combat, enemies, bosses, spells, projectiles
  world/      地形、区域、地下城、NPC、采集物、天空 · Terrain, zones, dungeons, NPCs, collectibles, sky
  game/       任务、成长、存档、成就、叙事等系统 · Quests, progression, saves, achievements, narrative systems
  ui/         HUD、日志、面板（含 *传说碑*个人最速 + Boss 阶段史诗演出）· HUD, journal, panels (*Legend stele* personal bests + Boss stage cinematics)
  online/     在线伙伴服务客户端（可选，默认关闭，对接 server/ 的 Spring Cloud 网关）· Optional online-partner client (default off; talks to the Spring Cloud gateway in server/)
  content/    数据驱动内容（敌人/任务/对话/物品/技能）· Data-driven content (enemies, quests, dialogue, items, skills)
  audio/      音频 · Audio
  effects/    特效与画质 pass · Effects & visual passes
docs/         设计与实施文档 · Design & implementation docs
tests/        Vitest 单元测试 · Vitest unit tests
server/       在线伙伴服务（可选）：Spring Cloud 微服务 — 排行榜/遥测（Java 17+，与本体完全解耦）· Optional online-partner service: Spring Cloud microservices (leaderboards/telemetry; Java 17+, fully decoupled)
creative/     周边内容：原画 / 小说 / OST / 海报 · Surrounding content: art, novel, OST, posters
```

## 近期增强（2026-11） / Recent upgrades (Nov 2026)

- **回声母题全部出关 / All echo mother-themes live**：**110 / 110** 枚回声全部上线；**16 / 17** 个母题各派 ≥6 枚（wizard 8 / interstellar 8 / upside 9 / homecoming 10 及所有 Wave 母题各 ≥6 枚；crossover 母题为 3 枚自成一帜）。
  **110 / 110** echoes are live; **16 of 17** mother-themes ship ≥6 each (wizard 8 / interstellar 8 / upside 9 / homecoming 10 and every Wave mother-theme ≥6; the crossover theme stands alone with 3).
- **成就 / Achievements**：`echo-<franchise>-6` 全册 **39** 枚次元回声母题徽章（wizard/space/samurai/cyber/upside/cosmic/…/homecoming 大师/wave4/wave5）+ `「墙外之约」` 跨界母题完成 + `「炉主」echo-keeper`（17 母题终段全数共鸣）。**卷帙残章**——母题毕业时炉火替你留一行碑文（`echo-crossover` / `homecoming-master` / all `echo-*-6`）。**终局结算**挂上 *「衍生」* 行——署名整部原生宇宙（小说 / OST / 电影剧本）。
  **39** `echo-<franchise>-6` mother-theme badges (wizard / space / samurai / cyber / upside / cosmic / … / homecoming-master / wave4 / wave5) + the cross-boundary `“墙外之约”` finale badge + `“炉主” echo-keeper` (all 17 mother-themes resolved). **Scroll epitaphs** — when a theme graduates, the hearth leaves a line in the codex (`echo-crossover` / `homecoming-master` / all `echo-*-6`). The **end-of-run crawl** now includes a *“derivatives”* line — crediting the entire native universe (novel / OST / film script).
- **服务器侧可观测 / Server-side observability**：游戏 / ai-service / 网关**三条链路全部 export `/actuator/prometheus`**——`game_telemetry_{enqueued,dropped,processed}_total` / `ai_upstream_{calls,prompt_tokens,completion_tokens,cached_tokens}_total` + `ai_upstream_cache_hit_ratio`（Gauge）/ `gateway_requests_total{route,outcome}` + `gateway_request_duration_seconds`。每一次上游 LLM 调用都带 `stream:true` + `include_usage`。
  Game / ai-service / gateway **all export `/actuator/prometheus`** — `game_telemetry_{enqueued,dropped,processed}_total`, `ai_upstream_{calls,prompt_tokens,completion_tokens,cached_tokens}_total` + `ai_upstream_cache_hit_ratio` (Gauge), `gateway_requests_total{route,outcome}` + `gateway_request_duration_seconds`. Every upstream LLM call carries `stream:true` + `include_usage`.
- **在线伙伴服务 / Online partner service**：八个 Spring Cloud 微服务（Eureka / Config / Gateway / game-service / season-service / ai-service / presence-service（:8084，W-Z-同游：心跳 → Redis Set/Hash+TTL，SSE `/api/presence/{channel}/stream` 扇出；`PRESENCE_BACKEND=redis` 才走真 Pub/Sub）/ notification-service（:8085，W-Z49：炉火报讯台——跨微服务通知登记处，Redis List+Hash 环形台账（50 条 / 7 天 TTL）+ Pub/Sub `crossrealm:notify:channel` 广播；memory 默认 / `SPRING_CACHE_TYPE=redis` 切真共享台账；`POST /api/notify`、`GET /api/notify/recent`、`GET /api/notify/stats`、`GET /api/notify/ops`（W-Z52 运维只读白名单）；网关路由 `/api/notify/**`））——排行榜和试炼榜都**带进程重启后的 Redis 镜像**（`LeaderboardRedisMirror`/`TrialRedisMirror`，ZSET 写穿 + `backend=redis` 可选；`ZCARD` 经 `/api/ops/redis` 直报）；顾问 FAB 未读金点（W-Z52，在线开启 + 有未读报讯时亮起，打开面板熄灭）。
  Eight Spring Cloud microservices (Eureka / Config / Gateway / game-service / season-service / ai-service / presence-service (:8084 — heartbeat → Redis Set/Hash+TTL, SSE fan-out on `/api/presence/{channel}/stream`; real Pub/Sub only under `PRESENCE_BACKEND=redis`) / notification-service (:8085, W-Z49 — the Fireside-herald, a cross-service notification registry: Redis List+Hash ring ledger (50 entries / 7-day TTL) + `crossrealm:notify:channel` Pub/Sub broadcast; memory default, `SPRING_CACHE_TYPE=redis` switches to the real shared ledger)). Leaderboards and trial boards both carry **Redis mirrors across process restarts** (`LeaderboardRedisMirror`/`TrialRedisMirror`, ZSET write-through + `backend=redis` optional; `ZCARD` reports straight through `/api/ops/redis`). The advisor FAB gets an unread gold dot (W-Z52 — lights up when online + unread heralds exist; dims when the panel opens).
- **可靠投递 / Reliable delivery**：顾问异步队列已过 Redis Streams consumer group 路径（W-Z1） —— `XADD/XACK/XREADGROUP` + pending re-claim，CI 真跑 5/5；`/api/ops/dead-letter` 白名单式诊断，**零玩家内容泄漏**；W-E20 起 `/api/ops/redis` 也经由 `§4q` 冒烟门禁。
  The advisor async queue now runs on the Redis Streams consumer-group path (W-Z1) — `XADD/XACK/XREADGROUP` + pending re-claim, verified 5/5 in CI. `/api/ops/dead-letter` diagnostics are allowlist-gated — **zero player-content leakage**. Since W-E20, `/api/ops/redis` is also guarded by the `§4q` smoke gate.
- **LLM 真联调缓存命中率 / Live LLM cache hit-rate**：`wkapi.pro / v1 / gpt-6-sol` 实测 `stream:true + include_usage` 后**可见**地**报告缓存命中**；W-Z22 深度修正（稳定系统前缀扩为完整世界观智库 + `cache_control: ephemeral` 显式打点 + 始终流式）后，实测 `LIVE cache first prompt=5864 cached=4755` → `second prompt=5921 cached=4908`（全程 **>80%** 前缀命中）；`upstreamCached` 逐次打进 `ai.upstream.usage` 日志；echo-qa / ach-qa 判官门禁接同款细节。
  Live `wkapi.pro / v1 / gpt-6-sol` now **visibly reports cache hits** under `stream:true + include_usage`. After the W-Z22 deep fix (stable system prefix expanded to the full world-view codex + explicit `cache_control: ephemeral` markers + always streaming), measured `LIVE cache: first prompt=5864 cached=4755 → second prompt=5921 cached=4908` (consistently **>80%** prefix hit). `upstreamCached` lands in `ai.upstream.usage` per call; echo-qa / ach-qa referee gates use the same instrumentation.
- **判官收敛 / Referee convergence**：echo-qa 全册 **110 条，bad=0**；ach-qa **39+ 徽章（含「炉主」），bad=0**。
  echo-qa clean slate: **110 lines, bad=0**; ach-qa **39+ badges (including “炉主”), bad=0**.
- **算法改写 / Algorithm rewrite**：`PopCultureEchoSystem.tryUnlock`（热路径）— 旧版每次触发都扫一遍 **109/110 枚** ECHOES；现在改用 `triggerIndex: Map<trigger, Echo[]>`，O(matched) 复杂度；full-resonance 判定也改成“见两项即停”短路。
  `PopCultureEchoSystem.tryUnlock` (hot path) — the old build scanned **109/110 ECHOES** on every trigger; now it uses `triggerIndex: Map<trigger, Echo[]>`, O(matched); the full-resonance check short-circuits after the second witness.
- **终局字幕 / End-of-run crawl**：★ 27 段（每段 <p>），含结局变体（keep/quiet）、跨媒体衍生署名、个人最速（W-G6 在线碑）。
  ★ 27 rollout cards (each one a `<p>`), including the ending variants (keep/quiet), cross-media derivative credits, and your personal best (W-G6 online stele).
- **前端美学 / Front-end aesthetics**：全仓 gold-dark 滚动条 + 选区 / 焦点光晕；暂停面板 slot focus-within 漂浮双层金辉；键帽字 (kbd pill)；区域横幅字岘；签名态「::selection」 鎏金深底。
  Repo-wide gold-dark scrollbars + selection / focus halos; pause-panel slot focus-within floating dual-gold glow; key-cap typography (kbd pill); zone-banner molten glyph ringing; a `::selection` liveried with forge-deep gold.
- **跨媒体宇宙 / Transmedia universe**：《跨界纪事》长篇**七章 + 序言 + 四番外**（《炉火给你的回信》·《看守的回信》·《林渡给看守的回信》·《后来者的回信》，终章后彩蛋《星图之外》已并进 142 分钟电影剧本）——整书英译已完成（`novel/en/00` → `11-interlude-came-after`）——+ OST **25 曲**（可播放 Web Audio 25/25）+ 海报 5 张——游戏、小说、剧本、OST、海报五条产线同源。
  *Crossrealm Chronicles* — **seven chapters + a prologue + four epistles** (*A Letter from the Fire* · *The Keeper’s Reply* · *Lin’s Reply to the Keeper* · *The Reply of the One Who Came After*, with the epilogue “Beyond the Star-Charts” folded into the 142-minute film script) — the full novel is **now rendered in English** (`novel/en/00` → `11-interlude-came-after`) — plus an **OST of 25 tracks** (playable via Web Audio, 25/25) and **5 posters**. Game, novel, script, OST and posters all grow from one canon.
- **日志 · 归途残卷 / Journal · Remnants of the Road**：通关后才点亮的终局一页——终局正文（keep/quiet 两路）+ 17 枚星尘铭文复刻展陈；页签计数 (x/17)。
  A terminal page that only lights up after the true ending — the full ending text (keep/quiet branches) plus a gallery of the 17 dust-stele inscriptions; tab counter shows (x/17).
- **顾问面板 · 炉火报讯台条 / Advisor panel · Fireside herald strip**：开启在线伙伴后，顾问面板顶部出现报讯 strip——最近三条跨微服务通知（成就/赛季/世界事件），W-Z50 起 `boss_defeated` 遥测自动进台（Feign → notification-service，fallback 静默丢弃）；**W-Z52 FAB 金点**：FAB 右上角随未读报讯亮起，打开面板即熄。
  With the online partner enabled, a herald strip appears at the top of the advisor panel — the three most recent cross-service notifications (achievements / seasons / world events). Since W-Z50, `boss_defeated` telemetry flows straight into the strip (Feign → notification-service; silent fallback drop). **W-Z52 FAB gold dot** — a dot on the FAB’s upper-right corner while there are unread heralds; it dims as soon as the panel opens.

## 文档 / Docs

| 文件 File | 内容 Contents |
|-----------|---------------|
| [`MASTER_PLAN.md`](docs/MASTER_PLAN.md) | **唯一执行计划**：执行协议、现状快照、工作包 W-A/B/C/D、内容数量目标、进度看板、ADR · **The single running plan**: execution protocol, current snapshot, work packets W-A/B/C/D, content targets, status board, ADRs |
| [`OVERHAUL_PLAN.md`](docs/OVERHAUL_PLAN.md) | 工程重构详录（历史，不再排期） · Overhaul log (historical, no longer scheduled) |
| [`COMBAT_DESIGN.md`](docs/COMBAT_DESIGN.md) | 战斗设计 · Combat design |
| [`MIXAMO_PIPELINE.md`](docs/MIXAMO_PIPELINE.md) | 动画导入管线 · Animation import pipeline |
| [`ONLINE_SERVICES.md`](docs/ONLINE_SERVICES.md) | 在线伙伴服务手册：Spring Cloud 微服务部署、冒烟 `smoke §0-§6`、Prometheus 金丝雀验证 · Online-partner manual: Spring Cloud deployment, smoke suite `§0-§6`, Prometheus canary checks |
| [`SHOWCASE_SYNC.md`](docs/SHOWCASE_SYNC.md) | 个人展示页自动同步（One-time Pages toggle） · Personal showcase auto-sync (one-time Pages toggle) |
| [`I18N_GUIDE.md`](docs/I18N_GUIDE.md) | 双语门禁要点 · Bilingual gatekeeping notes |

## 三条硬性约束（来自总计划）/ Three hard constraints (from the master plan)

1. 新增逻辑不得读写其他系统的内部字段，只能调用系统接口或走既定事件。<br>New logic must not touch other systems’ internal fields — call system APIs or use the established event paths.
2. 新增 `THREE.*` 资源必须有明确的创建者与销毁者，副本/重生路径同样要释放。<br>New `THREE.*` resources need an explicit creator and a destroyer; clone and respawn paths must release too.
3. 新增游戏逻辑计时不得用 `setTimeout` / 自建 rAF，必须走主循环 `dt`；新逻辑走 `src/engine/EventBus.js`，不再新增 `window` 事件。<br>No `setTimeout` / hand-rolled rAF for game-time logic — everything rides the main-loop `dt`; new systems use `src/engine/EventBus.js`, no new `window` events.
