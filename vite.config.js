import { defineConfig } from 'vite';

/**
 * 分块规则（W-B1 切片1，修 B37）。
 *
 * ## 修的是什么
 *
 * 修前按"目录叫什么"分块，而 `content/` `engine/` `assets/` `game/` `effects/` `player/`
 * 都没有归属，于是落进入口块 `index`。偏偏入口块又是**所有块的根**（`core/Game.js`
 * 是组装点，它 import 全部特性块），于是出现 `index → chunk-combat → index` 这类
 * "根被反向依赖"的循环，Rollup 报三条 `Circular chunk`。循环分块不只是告警：
 * 它让"哪块先加载"没有答案，后续任何真分包（W-D5）都会踩在上面。
 *
 * ## 现在的口径：按"依赖方向"分，不按"目录叫什么"
 *
 * - `chunk-core` —— **共享基础层**：谁都可以读它，它谁也不读（除自己）。
 *   判据是这一条，不是目录名。`content/`（纯数据表）与 `engine/`（与玩法无关的地基）
 *   本来就是这一定义的样板；`assets/`（资源清单）、`game/`（任务 / 存档 / 成就等被
 *   ui 与 world 同时读的系统）、`effects/`、`player/` 也满足"被多方读、不回读特性块"，
 *   所以一并收进来。
 * - `chunk-combat` —— 战斗与 AI（`ai/` 只服务战斗，同块以免跨块循环）。
 * - `chunk-world` —— 世界构建与区域。
 * - `chunk-ui` —— 界面与过场。
 * - `index` —— 只剩 `core/` 与入口。**它是唯一的根**，不允许被任何块反向依赖。
 *
 * 分块之间因此是一个 DAG：`index → {combat, ui, world} → core`，加上
 * `world → combat`（副本管理器要造副本 Boss）。这条由 `tests/chunk-graph.test.js`
 * **直接读本文件的 `manualChunks` 函数**复算并断言无环 —— 门禁不抄规则，
 * 所以这里改了规则它跟着改，不会各说各话。
 */
export default defineConfig({
  server: {
    port: 5173,
    open: true,
    host: true,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('/src/content/')
            || id.includes('/src/engine/')
            || id.includes('/src/assets/')
            || id.includes('/src/game/')
            || id.includes('/src/effects/')
            || id.includes('/src/player/')) {
            return 'chunk-core';
          }
          if (id.includes('/src/combat/')) return 'chunk-combat';
          // ai/ 只服务战斗场景（敌人状态机与围攻仲裁），与 combat 同块避免跨块循环
          if (id.includes('/src/ai/')) return 'chunk-combat';
          if (id.includes('/src/world/')) return 'chunk-world';
          if (id.includes('/src/ui/') || id.includes('/src/cinematic/')) return 'chunk-ui';
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  test: {
    // 全局夹具：给 node 补一枚最小 ProgressEvent，消掉 three 纹理流式加载器在用例结束后
    // 抛出的未处理 rejection（详见 tests/setup.js 头注）。见 M4 测试夹具账。
    setupFiles: './tests/setup.js',
    /**
     * 全量分母只认 `tests/`（W-B4 切片1 追加留下的尾巴）。
     *
     * 为什么要写这一条：vitest 的默认 include 是"全树找 `.test` / `.spec` 后缀"那条模式，
     * 而默认 exclude 只挡 `.idea` / `.git` / `.cache` / `.output` / `.temp` 这几类点目录 ——
     * **挡不住本仓库的 `.tmp-*` 草稿目录**（那些目录 gitignored，但文件确实在磁盘上）。
     * 实测证据：一次全量跑收到 80 个文件，其中一个是 `.tmp-wb3-slice3/replay.test.js`。
     * 后果不是"数字难看"而是**记录不可复现**：§8/§9 每条验收都要写"多少例多少文件"，
     * 分母随工作区堆了多少草稿而漂，读的人就没法判断红绿是不是同一件事。
     *
     * 收窄的代价由 `tests/suite-denominator.test.js` 付：它扫非点目录，要求"长得像测试
     * 的文件全在 `tests/` 里"，所以今后把用例放到别处**不是被静默跳过而是当场红**。
     *
     * （这段注释里故意不写 glob 的字面形式：连续星号紧跟斜杠会提前关掉块注释，
     * esbuild 报 "Expected identifier but found ."，整份配置加载不进来 —— 本条踩过。）
     */
    include: ['tests/**/*.test.js', 'tests/**/*.spec.js'],
  },
});
