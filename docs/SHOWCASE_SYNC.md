# 跨界纪元 · Showcase 页面与 Pages 自动同步（W-Z68）

**本仓库带了一份完全自包含、双语的《最新成果展示页》** —— `creative/showcase.html`：
最新实验室规模、最新测试数、最新章节，一页自给，给你个人展示页用。

## 它是什么

- 一份单页 HTML（`creative/showcase.html`）：九个微服务 · 25 首 OST · 七章小说三番外 · 110 回声 · 40+ 成就 · MIT。
- **中文 / English 双语**（右上角切换），与游戏定义同源、与手册 `creative/player-guide.html` 口径一致。
- 与《跨界纪事》全系保持同一套叙事美学：炉火、雾、E2→A2、"火没有熄"——那是同源的灵魂。

## 怎么让它「最新」

推送后不及时机会出问题的字段只有测试数/提交列表这类动态指标——可以接受它们每次 push 更新一次。
但更重要的是：**你个人展示页 (`xiaodernan.github.io`) 的项目入口想要的是「如今天最新的成果」**。

本仓库已内置 `.github/workflows/showcase.yml`：

1. 推送到 `main`（或 `workflow_dispatch` 手动跑）→ 自动执行：
   - `npm ci`
   - `npm run build`（完整前端构建通过 = 最新能打包的成果）
   - 组装到 `_site/`：`index.html` ← showcase（最新成果）/`game/` ← `dist/`（整个游戏，可玩）/ `guide.html`（玩家小册子）/ `tapestry.html`（年鉴）/ `favicon.svg`
   - 推送到本仓库的 `gh-pages` 分支
2. 只要在 **Settings → Pages** 里把 Source 设为 `gh-pages` 分支根目录，
   `https://xiaodernan.github.io/crossrealm-chronicles/` 就是**你点进去就能玩、就能看**的最新状态。
3. 启用之后每次 push `main`，Pages 缓存会刷新；**不需要你手动改仓库任何内容**。

## 你需要做的（一次性，约 30 秒）

1. 打开本仓库 → **Settings → Pages**（需管理员）
2. Source: **Deploy from a branch** → Branch: **`gh-pages`** / **`/ (root)`** → Save
3. 进入 `https://xiaodernan.github.io/crossrealm-chronicles/` 验证（第一次部署约 1 分钟）
4. 在你的个人展示页 (`xiaodernan.github.io`) 把项目入口链接改为这个网址即可。

如果不想启用 Pages，本次同步仍然把最新内容推到了 `gh-pages` 分支（md 里也能看），
`./creative/showcase.html` 在本地直接双击也能打开 —— 它是自包含 HTML，无外部依赖。

## 文件索引

| 用途 | 文件 |
|------|------|
| 最新成果展示页 | `creative/showcase.html` |
| 玩家小册子 / Player Guide | `creative/player-guide.html` |
| 年鉴（tapestry） | `creative/tapestry.html` |
| 自动同步 CI | `.github/workflows/showcase.yml` |
| 玩家存档格式 | `crossrealm_save_v21` (browser localStorage) |
