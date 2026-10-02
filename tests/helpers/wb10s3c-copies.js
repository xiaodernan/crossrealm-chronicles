/**
 * W-B10 切片3c 的**历史读数**（测试与誊写对账脚本共用一份）。
 *
 * ## 为什么这份东西单独成一个模块
 *
 * `tests/dungeon-identity-copies.test.js` 的第 ⑥ 层要做两件事：
 * ① 证明"动手之前那种写法"在役源码里已经绝迹；② 证明那把尺子**认得**旧写法（否则"扫到 0"
 * 只是在读空集）。第二件事需要动手之前的字节。字节在 `git show e5ce526:src/<文件>` 里，
 * 而测试运行时不保证有 git —— 所以把它们誊一份进来。
 *
 * 誊，就有誊错的风险，而誊错的后果恰好是这条用例的立身之本（一条永远为真的反向对照）。
 * 于是这份表**不在测试文件里**：`.tmp-20261002/wb10s3c-oldfrag.mjs` import 同一个模块，
 * 逐段要求 `旧字节` 在那一笔提交的真实 blob 里整段命中，并用同一把 `尺` 在脚本这一侧
 * 复量"认得到旧写法 / 认不到在役写法"。测试与核查读的是同一批字节，不是两份抄本。
 *
 * ## 每一行为什么是这个形状
 *
 * 五处抄本的**拼法本来就不同**（成串数组 / `??` 兜底 / 步表里的 `ids: [...]` / 三条 `.has()` 链 /
 * `MAINLINE.filter` 自算 / 面板那张私有表），所以一把通用正则对其中几种是白扫。
 * `尺` 按每一处自己的形状写，`认领` 写它现在改读哪一份推导。
 */

/** 动手之前那三枚 id 在四处抄本里共同写着的顺序（冻结读数，不是从 `TRIAL_DUNGEON_IDS` 推的） */
export const 试炼三座 = ['ruin-crypt', 'forbidden-library', 'five-dim-rift'];

/** `git show` 的对账基准：切片3c 开工时的那一笔（文档回填提交，代码状态与它一致） */
export const 基准提交 = 'e5ce526';

/**
 * 世界地图面板曾经自己养的那五行（坐标逐格等于副本表的 `entrance`，简称是全名的手写缩写）。
 * 行数 5 而名册 7 —— 新增的两座在地图上根本没有点，这就是这一片的读数起点。
 */
export const 旧面板表 = [
  { id: 'ruin-crypt', x: -190, z: 25, t: '遗城' },
  { id: 'forbidden-library', x: -35, z: -200, t: '图书馆' },
  { id: 'five-dim-rift', x: 175, z: 95, t: '裂隙' },
  { id: 'forest-shrine', x: -230, z: -15, t: '神龛' },
  { id: 'hub-catacombs', x: 28, z: 72, t: '墓穴' },
];

/** 六处手抄：每处一把尺、一段旧字节、一个现在认领的推导 */
export const 抄本表 = [
  {
    标题: 'ExplorationMap 的开局点亮',
    文件: 'game/ExplorationMap.js',
    认领: 'TRIAL_DUNGEON_IDS',
    尺: (s) => /new Set\(\s*\['ruin-crypt'/.test(s),
    旧字节: "    this.dungeonRevealed = new Set(['ruin-crypt', 'forbidden-library', 'five-dim-rift']);",
  },
  {
    标题: 'ExplorationMap 的读档兜底',
    文件: 'game/ExplorationMap.js',
    认领: 'TRIAL_DUNGEON_IDS',
    尺: (s) => /dungeonRevealed \?\? \['ruin-crypt'/.test(s),
    旧字节: "    this.dungeonRevealed = new Set(data.dungeonRevealed ?? ['ruin-crypt', 'forbidden-library', 'five-dim-rift']);",
  },
  {
    标题: 'QuestAssistant 的助手清单',
    文件: 'ui/QuestAssistant.js',
    认领: 'TRIAL_DUNGEON_IDS',
    尺: (s) => /action: 'dungeons', ids: \[/.test(s),
    旧字节: "      { label: '三座地下城', action: 'dungeons', ids: ['ruin-crypt', 'forbidden-library', 'five-dim-rift'] },",
  },
  {
    标题: 'objectives 的飞升门',
    文件: 'content/objectives.js',
    认领: 'TRIAL_DUNGEON_IDS',
    // 这一处不写成串，是三条 `.has('id')` 各占一行 —— 尺子按它自己的形状来
    尺: (s) => /dungeonsCleared\?\.has\('ruin-crypt'\)/.test(s) && /dungeonsCleared\?\.has\('forbidden-library'\)/.test(s),
    旧字节: "    && state.stats.dungeonsCleared?.has('ruin-crypt')\n    && state.stats.dungeonsCleared?.has('forbidden-library')\n    && state.stats.dungeonsCleared?.has('five-dim-rift'),",
  },
  {
    标题: 'QuestSystem 自己算的第五份',
    文件: 'game/QuestSystem.js',
    认领: 'TRIAL_DUNGEON_IDS',
    // 尺子按**算式**而不是按那一行的形状：旧写法是具名 const，退回时可以写成行内表达式
    // （`for (const id of MAINLINE.filter((r) => r.type === 'dungeon').map(...))`），
    // 只认得声明那种拼法的尺，对着行内那份会安静地扫到 0 —— 臂 A10 就是这么量出来的。
    尺: (s) => 滤抄.test(s),
    旧字节: "const DUNGEON_IDS = MAINLINE.filter((r) => r.type === 'dungeon').map((r) => r.dungeonId);",
  },
  {
    标题: 'WorldMapPanel 的私有副本表',
    文件: 'ui/WorldMapPanel.js',
    // 面板是"名册上有几座，图上就几个点"的读者，不是试炼清单的读者 —— 它认领的那份推导另有其名
    认领: 'DUNGEON_DEFS',
    尺: (s) => /const dungeons = \[/.test(s),
    旧字节: [
      '    const dungeons = [',
      "      { x: -190, z: 25, t: '遗城', id: 'ruin-crypt' },",
      "      { x: -35, z: -200, t: '图书馆', id: 'forbidden-library' },",
      "      { x: 175, z: 95, t: '裂隙', id: 'five-dim-rift' },",
      "      { x: -230, z: -15, t: '神龛', id: 'forest-shrine' },",
      "      { x: 28, z: 72, t: '墓穴', id: 'hub-catacombs' },",
      '    ];',
    ].join('\n'),
  },
];

/** 全域那一层用的三把通用尺：各认一种"把那句话重写一遍"的拼法，都不碰单行引用（见测试里那条的理由） */
export const 串抄 = /\[[^\]]*'(?:ruin-crypt|forbidden-library|five-dim-rift)'[^\]]*'(?:ruin-crypt|forbidden-library|five-dim-rift)'/;
export const 门抄 = (s) => (s.match(/dungeonsCleared\??\.has\('(ruin-crypt|forbidden-library|five-dim-rift)'\)/g) ?? []).length >= 2;
/** 第三份算式：不写 id，而是从主线行现算"哪几座算试炼" —— 前面两把尺对它是瞎的（串里没有 id，门里没有 `.has()`） */
export const 滤抄 = /MAINLINE\s*\.\s*filter\s*\(\s*\(?\w+\)?\s*=>\s*\w+\.type === 'dungeon'/;
