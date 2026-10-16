/**
 * 营火常驻 NPC 的定义表 —— 纯数据（W-B1 切片1）。
 *
 * 从 `world/RestNpcManager.js` 搬过来：它的两个读者里有一个是 `game/` 侧的
 * （`game/RestDialogue.js` 与 `game/CgGalleryRegistry.js` 都要按 restId 取定义），
 * 而 `world/` 与 `game/` 是两个分块 —— 留在 `world/` 里就逼出 `chunk-core → chunk-world`
 * 这条回边，是 B37 循环分块的成因之一。
 *
 * 定义（名字 / 头衔 / 配色 / 站位）是数据，"怎么把 NPC 建出来、怎么跟着对话高亮"
 * 是行为，后者留在 `world/RestNpcManager.js`。
 *
 * `name` / `title` / `barks` 存的是**文案键**（W-D2 切片15），不是文案本身 —— 与 CG 目录、
 * 台词池同一个口径：数据层存键，显示侧在播出那一刻 `t()`。三处出口各自展开：
 * `game/RestDialogue.js`（对话框说话人 / 头衔 / `rest-dialogue` 事件的 `speaker`，
 * 它会被营火记忆**存成快照**，所以必须在离开这一格之前说完真话）、
 * `world/RestNpcManager.js`（口癖气泡与两条 toast）、`game/CgGalleryRegistry.js`（画廊卡片）。
 *
 * 顺带收掉一份 93 行的抄本：`content/restDialogues.js` 的每个节点过去都自带一格
 * `speaker: "…"`，实测 93 处**逐字等于**这里的 `name`（探针
 * `.tmp-20261016-wd2s15/probe-speaker-copies.mjs`：93 处 / 0 处不一致）—— 已删净，
 * 说话人名从此只有这一份（`registry.js` 的节点 schema 相应把 `speaker` 收成可选）。
 */
export const REST_NPC_DEFS = {
  hub: {
    name: 'rest_npc_hub_name',
    title: 'rest_npc_hub_title',
    body: 0x5a5048,
    cloak: 0xc9a962,
    emissive: 0x664422,
    accent: '#c9a962',
    height: 1.05,
    offset: [1.35, 0, 0.6],
    idle: 'stand',
    barks: ['rest_npc_hub_bark_0', 'rest_npc_hub_bark_1', 'rest_npc_hub_bark_2'],
  },
  fantasy: {
    name: 'rest_npc_fantasy_name',
    title: 'rest_npc_fantasy_title',
    body: 0x3a5a40,
    cloak: 0x2a4030,
    emissive: 0x224422,
    accent: '#66aa77',
    height: 0.95,
    offset: [-1.1, 0, 0.45],
    idle: 'sit',
    barks: ['rest_npc_fantasy_bark_0', 'rest_npc_fantasy_bark_1', 'rest_npc_fantasy_bark_2'],
  },
  magic: {
    name: 'rest_npc_magic_name',
    title: 'rest_npc_magic_title',
    body: 0x4a3868,
    cloak: 0x8866cc,
    emissive: 0x5533aa,
    accent: '#aa88ff',
    height: 1.0,
    offset: [0.9, 0, -0.7],
    idle: 'float',
    barks: ['rest_npc_magic_bark_0', 'rest_npc_magic_bark_1', 'rest_npc_magic_bark_2'],
  },
  space: {
    name: 'rest_npc_space_name',
    title: 'rest_npc_space_title',
    body: 0x8899aa,
    cloak: 0x667788,
    emissive: 0x334455,
    accent: '#88ccff',
    height: 1.0,
    offset: [-0.8, 0, 0.9],
    idle: 'stand',
    helmet: true,
    barks: ['rest_npc_space_bark_0', 'rest_npc_space_bark_1', 'rest_npc_space_bark_2'],
  },
  void: {
    name: 'rest_npc_void_name',
    title: 'rest_npc_void_title',
    body: 0x6a6050,
    cloak: 0x998866,
    emissive: 0xaa8844,
    accent: '#ddbb66',
    height: 1.08,
    offset: [0.7, 0, 0.5],
    idle: 'ghost',
    transparent: true,
    barks: ['rest_npc_void_bark_0', 'rest_npc_void_bark_1', 'rest_npc_void_bark_2'],
  },
  abyss: {
    name: 'rest_npc_abyss_name',
    title: 'rest_npc_abyss_title',
    body: 0x3a2028,
    cloak: 0x661122,
    emissive: 0xff2244,
    accent: '#ff4466',
    height: 1.12,
    offset: [-0.95, 0, -0.4],
    idle: 'stand',
    barks: ['rest_npc_abyss_bark_0', 'rest_npc_abyss_bark_1', 'rest_npc_abyss_bark_2'],
  },
  gloom: {
    name: 'rest_npc_gloom_name',
    title: 'rest_npc_gloom_title',
    body: 0x3a3a4a,
    cloak: 0x4a4a6a,
    emissive: 0x556688,
    accent: '#6a6a8a',
    height: 1.02,
    offset: [1.0, 0, -0.5],
    idle: 'sit',
    barks: ['rest_npc_gloom_bark_0', 'rest_npc_gloom_bark_1', 'rest_npc_gloom_bark_2'],
  },
  radiant: {
    name: 'rest_npc_radiant_name',
    title: 'rest_npc_radiant_title',
    body: 0xffdd88,
    cloak: 0xffcc00,
    emissive: 0xffaa00,
    accent: '#ffdd44',
    height: 1.05,
    offset: [-1.1, 0, 0.7],
    idle: 'stand',
    barks: ['rest_npc_radiant_bark_0', 'rest_npc_radiant_bark_1', 'rest_npc_radiant_bark_2'],
  },
};
