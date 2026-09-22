# 跨界纪元 — Crossrealm Chronicles

> 浏览器端第三人称开放世界动作 RPG（Three.js + Vite）
> 世界观：奇幻 · 魔法 · 星际 三个位面碎片拼接而成
> 当前状态：**增强与内容扩充进行中**，唯一执行计划见 [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md)

---

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
```

其他命令：

```bash
npm run build    # 产出 dist/
npm run lint     # ESLint
npm run test     # Vitest 单元测试
npm run test:watch
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
  engine/     与玩法无关的地基（碰撞/FSM/池/时间/事件）— 逐步建立
  player/     第三人称控制器、角色模型
  combat/     战斗、敌人、Boss、法术、弹体
  world/      地形、区域、地下城、NPC、采集物、天气
  game/       任务、成长、存档、成就、叙事等系统
  ui/         HUD、日志、面板
  content/    数据驱动内容（敌人/任务/对话/物品/技能）— M7 引入
  audio/      音频
  effects/    特效与画面 pass
docs/         设计与实施文档
tests/        Vitest 单元测试
```

## 文档

| 文件 | 内容 |
|------|------|
| [`MASTER_PLAN.md`](docs/MASTER_PLAN.md) | **唯一执行计划**：执行协议、现状快照、工作包 W-A/B/C/D、内容数量目标、进度看板、ADR |
| [`OVERHAUL_PLAN.md`](docs/OVERHAUL_PLAN.md) | 工程重构详录：B1–B34 缺陷台账与 M0–M3 逐切片验收证据（历史，不再排期） |
| [`COMBAT_DESIGN.md`](docs/COMBAT_DESIGN.md) | 战斗设计 |
| [`MIXAMO_PIPELINE.md`](docs/MIXAMO_PIPELINE.md) | 动画导入管线 |

## 三条硬性约束（来自总计划）

1. 新增逻辑不得读写其他系统的内部字段，只能调用系统接口或走既定事件。
2. 新增 `THREE.*` 资源必须有明确的创建者与销毁者，副本/重生路径同样要释放。
3. 新增游戏逻辑计时不得用 `setTimeout` / 自建 rAF，必须走主循环 `dt`；新逻辑走 `src/engine/EventBus.js`，不再新增 `window` 事件。
