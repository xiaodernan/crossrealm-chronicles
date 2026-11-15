# 跨界纪元 · Showcase 页面与 Pages 自动同步（W-Z68）

> English mirror: [`SHOWCASE_SYNC.en.md`](SHOWCASE_SYNC.en.md)
**本仓库带了一份完全自包含、双语的《最新成果展示页》** —— `creative/showcase.html`：
最新实验室规模、最新测试数、最新章节，一页自给，给你个人展示页用。

## 它是什么

- 一份单页 HTML（`creative/showcase.html`）：九个微服务 · 25 首 OST · 七章小说四番外（中 · 英双译） · 110 回声 · 40+ 成就 · MIT。
- **中文 / English 双语**（右上角切换），与游戏定义同源、与手册 `creative/player-guide.html` 口径一致。
- 与《跨界纪事》全系保持同一套叙事美学：炉火、雾、E2→A2、"火没有熄"——那是同源的灵魂。

## 怎么让它「最新」

## 部署路径（W-Z99 统一）

**Pages 源已固定为 workflow-artifact**——`main` 分支推送即全量自动部署，不再依赖 gh-pages 分支。

本仓库内置 `.github/workflows/pages.yml`，每次推送到 `main` 就自动执行：

1. `npm ci`
2. `npm run build`，其中 `BASE_PATH=/crossrealm-chronicles/game/`（游戏要放在 `/game/` 子路径，chunk 才不会 404）
3. 组装 `_site/`：
   - `/` → `creative/showcase.html`（最新成果单页）
   - `/game/` → `dist/`（完整可玩构建，**自动最新**）
   - `/guide.html`（玩家小册子）/ `/tapestry.html`（年鉴）/ `/tapestry.en.html`（年鉴 EN）/ `/favicon.svg`
   - 推送到 workflow artifact → `actions/deploy-pages@v4` → `https://xiaodernan.github.io/crossrealm-chronicles/`
4. 你**不需要任何手工操作**——Pages 源已设为 workflow；每次 `main` push 都自动刷新展示页。此前 `showcase.yml`（往 gh-pages 分支推 `_site/`）因孤儿推送自生自灭——Pages 真部署在 `pages.yml`，现已合并为唯一路径（gh-pages 分支保留为静态副本，不再维护）。无需再设 Settings → Pages。

可玩游戏的地址：**`https://xiaodernan.github.io/crossrealm-chronicles/game/`**（个人展示页「进入游戏」入口）。

`./creative/showcase.html` 在本地双击也能打开——它是自包含 HTML，零外部依赖；
`npm run build && npm run preview -— --base=/` 本地也可看整包效果。

## 文件索引

| 用途 | 文件 |
|------|------|
| 最新成果展示页 | `creative/showcase.html` |
| 玩家小册子 / Player Guide | `creative/player-guide.html` |
| 年鉴（tapestry） | `creative/tapestry.html` |
| 年鉴（tapestry）英文版 | `creative/tapestry.en.html` |
| 自动部署 CI | `.github/workflows/pages.yml` |
| 事实包（个人页数据源） | `docs/latest.json`（`scripts/build-latest.mjs` 生成；`sync-latest.yml` 每周一自动重推） |
| 玩家存档格式 | `crossrealm_save_v21` (browser localStorage) |

## 个人展示页实时同步（W-Z92）

`https://xiaodernan.github.io/` 的「跨界纪元」卡片需要「点进去即最新」的进度信物，而不是静态快照。本机制双通路：

1. **页面运行时直读**：`raw.githubusercontent.com/xiaodernan/crossrealm-chronicles/main/docs/latest.json?ts=<now>`（带 CORS `*`；直击缓存），失败退化为展示页仓库 `assets/crossrealm/latest.json`。
2. **每周一兜底**：`.github/workflows/sync-latest.yml` 在本仓库重跑 `scripts/build-latest.mjs` 并把 `docs/latest.json` 推回 `main`；展示页仓库侧 `sync-crossrealm.yml` 同步落盘 `assets/crossrealm/latest.json`（错峰 30 分钟）。

`docs/latest.json` 的每个数字（提交数 / 测试文件数 / i18n 键数 / 语料源数 / 双语章回数）都由脚本现场推导，不手抄、不漂移。发版里程碑之后可在 Actions 页手动跑一次 `Sync latest.json fact pack` 立即刷新。
