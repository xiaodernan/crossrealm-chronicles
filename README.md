# 跨界纪元 · Crossrealm Chronicles

> 浏览器端第三人称开放世界动作 RPG（Three.js + Vite）
> 世界观：奇幻 · 魔法 · 星际 三个位面碎片拼接而成
> 当前状态：**17 母题六档闭环 / 全链路可观测 / LLM 联调流式化** ——唯一执行计划：[`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md)

---

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
npm run test     # Vitest 单元测试
```

其他常用命令：

```bash
npm run build    # 产出 dist/
npm run size     # 首屏体积门禁（< 2.25 MiB）
npm run lint     # ESLint
npm run perf     # 回归 draw-call / 帧速门禁
npm run e2e      # 真玩家端到端通关（headless 浏览器，~226 秒）
```

## 操作

| 键 | 作用 |
|----|------|
| WASD / Shift / Space | 移动 / 疾跑 / 跳跃 |
| 鼠标左键 / 右键 | 轻击连段 / 重击 |
| Ctrl | 翻滚（有无敌帧） |
| F | 弹反 |
| R | 位面斩（战技） |
| Q | 锁定目标 |
| E | 交互（营火 / 宝箱 / NPC / 碎片） |
| X | 切换 剑 / 法杖 |
| T | 营火快速旅行（Chapter 2 后） |
| 1 / 2 / 3（长按蓄力）/ 4 | 法术 |
| J / M / G / Tab | 日志 / 小地图 / 世界地图 / 区域面板 |
| U / V | 任务助手 / 视角模式 |
| P / L | 存档 / 读档 |
| H | 手册 · `` ` `` 本局统计 · F2 拍照 · F10 设置 · Esc 暂停 |
| N | 自动演示（用于冒烟验证） |

## 目录

```
src/
  core/       主循环与装配（Game.js）
  engine/     与玩法无关的地基（碰撞/FSM/时间/事件）
  player/     第三人称控制器、角色模型
  combat/     战斗、敌人、Boss、法术、弹道
  world/      地形、区域、地下城、NPC、采集物、天空
  game/       任务、成长、存档、成就、叙事等系统
  ui/         HUD、日志、面板（含 *传说碑*个人最速 + Boss 阶段史诗演出）
  online/     在线伙伴服务客户端（可选，默认关闭，对接 server/ 的 Spring Cloud 网关）
  content/    数据驱动内容（敌人/任务/对话/物品/技能）
  audio/      音频
  effects/    特效与画质 pass
docs/         设计与实施文档
tests/        Vitest 单元测试
server/       在线伙伴服务（可选）：Spring Cloud 微服务 — 排行榜/遥测（Java 17+，与本体完全解耦）
creative/     周边内容：原画 / 小说 / OST / 海报
```

## 近期增强（2026-11）

- **回声母题全部出关**：**110 / 110** 枚回声全部上线；**16 / 17** 个母题各派 ≥6 枚 **（wizard 8 / interstellar 8 / upside 9 / homecoming 10 及所有 Wave 母题各 ≥6 枚；crossover 母题为 3 枚自成一帜）**。
- **成就**：`echo-<franchise>-6` 全册 **39** 枚次元回声母题徽章（wizard/space/samurai/cyber/upside/cosmic/…/homecoming 大师/wave4/wave5）+ `「墙外之约」` 跨界母题完成。**终局结算**挂上 *「衍生」* 行——署名整部原生宇宙（小说 / OST / 电影剧本）。
- **服务器侧可观测**：游戏 / ai-service / 网关**三条链路全部 export `/actuator/prometheus`**——`game_telemetry_{enqueued,dropped,processed}_total` / `ai_upstream_{calls,prompt_tokens,completion_tokens,cached_tokens}_total` + `ai_upstream_cache_hit_ratio`（Gauge）/ `gateway_requests_total{route,outcome}` + `gateway_request_duration_seconds`。每一次上游 LLM 调用都带 `stream:true` + `include_usage`。
- **在线伙伴服务**：五个 Spring Cloud 微服务（Eureka / Config / Gateway / game-service / season-service / ai-service）——排行榜和试炼榜都**带进程重启后的 Redis 镜像**（`LeaderboardRedisMirror`/`TrialRedisMirror`，ZSET 写穿 + `backend=redis` 可选；`ZCARD` 经 `/api/ops/redis` 直报）。
- **可靠投递**：顾问异步队列已过 Redis Streams consumer group 路径（W-Z1） —— `XADD/XACK/XREADGROUP` + pending re-claim，CI 真跑 5/5；`/api/ops/dead-letter` 白名单式诊断，**零玩家内容泄漏**；W-E20 起 `/api/ops/redis` 也经由 `§4q` 冒烟门禁。
- **LLM 真联调缓存命中率**：`wkapi.pro / v1 / gpt-6-sol` 实测 `stream:true + include_usage` 后**可见**地**报告缓存命中**（cachedRatio 近期批次 42%~80%）；echo-qa / ach-qa 判官门禁接同款细节。
- **判官收敛**：echo-qa 全册 **110 条，bad=0**；ach-qa **39+ 徽章，bad=0**。
- **算法改写**：`PopCultureEchoSystem.tryUnlock`（热路径）— 旧版每次触发都扫一遍 **109/110 枚** ECHOES；现在改用 `triggerIndex: Map<trigger, Echo[]>`，O(matched) 复杂度；full-resonance 判定也改成"见两项即停"短路。
- **终局字幕**：★ 27 段（每段 <p>），含结局变体（keep/quiet）、跨媒体衍生署名、个人最速（W-G6 在线碑）。
- **前端美学**：全仓 gold-dark 滚动条 + 选区 / 焦点光晕；暂停面板 slot focus-within 漂浮双层金辉；键帽字 (kbd pill)；区域横幅字岘；签名态「::selection」 鎏金深底。

## 文档

| 文件 | 内容 |
|------|------|
| [`MASTER_PLAN.md`](docs/MASTER_PLAN.md) | **唯一执行计划**：执行协议、现状快照、工作包 W-A/B/C/D、内容数量目标、进度看板、ADR |
| [`OVERHAUL_PLAN.md`](docs/OVERHAUL_PLAN.md) | 工程重构详录（历史，不再排期） |
| [`COMBAT_DESIGN.md`](docs/COMBAT_DESIGN.md) | 战斗设计 |
| [`MIXAMO_PIPELINE.md`](docs/MIXAMO_PIPELINE.md) | 动画导入管线 |
| [`ONLINE_SERVICES.md`](docs/ONLINE_SERVICES.md) | 在线伙伴服务手册：Spring Cloud 微服务部署、冒烟 `smoke §0-§6`、Prometheus 金丝雀验证 |

## 三条硬性约束（来自总计划）

1. 新增逻辑不得读写其他系统的内部字段，只能调用系统接口或走既定事件。
2. 新增 `THREE.*` 资源必须有明确的创建者与销毁者，副本/重生路径同样要释放。
3. 新增游戏逻辑计时不得用 `setTimeout` / 自建 rAF，必须走主循环 `dt`；新逻辑走 `src/engine/EventBus.js`，不再新增 `window` 事件。
