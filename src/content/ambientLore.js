/**
 * 世界氛围文案 —— 致敬向（W-B2 数据外移）。
 *
 * 这里是"区域低语 / Lore 碎片 / NPC 章节台词"的唯一真源。
 * 搬前它们散在 `WorldAmbientPopCulture.js` 与 `WorldAmbientPopCultureWave3/4.js`、
 * `LoreFragmentsPopCulture.js` 四层里，靠三层 `merge*Wave4(merge*Wave3(base))` 叠出来 ——
 * 每加一条要先回答"该加进哪一层"，而那一层除了历史顺序没有任何含义。
 * 现在按**合并以后的有效值**平铺成一张表，形状由 `content/registry.js` 在加载期校验。
 */

/** 区域氛围事件：zoneId → 候选台词（weight 是相对权重，0~1） */
export const ZONE_EVENTS_POP = {
  magic: [
    { text: "悬浮蜡烛从塔楼窗口飘出 — 像某所咒术学院的夜巡。", weight: 0.6 },
    { text: "禁林深处传来独角兽的低语 — 或是曼德拉草的梦。", weight: 0.5 },
    { text: "九分又四分三站台的砖墙在雾里若隐若现。", weight: 0.45 },
    { text: "护念湖镜映出银光 — 像有人在远处奔跑。", weight: 0.4 },
    { text: "霓虹后巷全息短路 — 赛博渗入遗境。", weight: 0.4 },
  ],
  space: [
    { text: "墨菲书架的方向，引力微微扭曲。", weight: 0.5 },
    { text: "米勒沙漏的沙子落得太快 — 别在这里恋战。", weight: 0.6 },
    { text: "对接舱的金属环在远处缓慢旋转。", weight: 0.4 },
    { text: "虫洞拱门在荒原西侧折叠星光 — 别盯着看太久。", weight: 0.45 },
    { text: "曼恩假信标在冰原上闪烁 — 光与谎言同频。", weight: 0.35 },
    { text: "殖民穹顶内是人工黄昏 — 荒原外是另一个天空。", weight: 0.5 },
    { text: "休眠 AI 核心低频嗡鸣：「任务未完成。」", weight: 0.45 },
    { text: "跃迁门阵列蓝光脉动 — 三门须同相。", weight: 0.4 },
    { text: "星港酒肆百种方言混成一种笑。", weight: 0.4 },
  ],
  void: [
    { text: "红色孢子飘落 — 逆相界的风从裂口渗出。", weight: 0.7 },
    { text: "旧镇广播塔在雾中闪烁红灯。", weight: 0.5 },
    { text: "Walkman 的磁带在风里倒放 — 你听见 1983 年的 SOS。", weight: 0.4 },
    { text: "四盏单车灯在雾中排成线 — 像夜游的队伍。", weight: 0.45 },
    { text: "街机 CRT 在远处闪绿光 — 吃豆人永远差一步。", weight: 0.4 },
    { text: "裂相钟塔无声指向 11:06 — 天花板感觉更远了。", weight: 0.35 },
    { text: "螺旋深井回声在数数 — 别靠近井口。", weight: 0.45 },
  ],
  fantasy: [
    { text: "至尊石环低声吟诵 — One Realm to bind them all…", weight: 0.5 },
    { text: "沙龙镜墙方向传来旋转门吱呀声 — 边境往事在灰林边缘苏醒。", weight: 0.45 },
    { text: "正午决斗圈的 chalk 线在雾里发亮 — 别在圈里恋战。", weight: 0.4 },
    { text: "幽灵铁道远处汽笛 — 火车从不到站。", weight: 0.35 },
    { text: "鸟居残门在雾里发红 — 武士残响未散。", weight: 0.4 },
  ],
  hub: [
    { text: "海报墙在东侧 — 六张褪色位面海报等待共鸣。", weight: 0.4 },
    { text: "海报墙新增三色 — 西部、黑帮、深空科幻母题已写入回声。", weight: 0.35 },
  ],
  abyss: [
    { text: "禁酒窖门缝漏出暖光 — 幽冥帮派在谈界关税。", weight: 0.5 },
    { text: "码头货仓木箱碰撞 — 魂火走私线仍通。", weight: 0.45 },
    { text: "家族圣龛三支蜡烛照黑镜 — 镜里不是你自己。", weight: 0.4 },
  ],
};

/** Lore 碎片：章节门控的叙事碎片 */
export const LORE_FRAGMENTS_POP = [
  { id: "lore-wizard", title: "咒术学院残页", text: "「楼梯会换方向，蜡烛会自己飞 — 但魂火不会。」", chapter: 2 },
  { id: "lore-inter", title: "坚韧号副录", text: "「不要温和地走进那个良夜 — 但可以在营火边休息。」", chapter: 3 },
  { id: "lore-upside", title: "逆相界录音", text: "「1983 年 11 月 6 日 — 裂口打开。红色闪电，没有星星。」", chapter: 4 },
  { id: "lore-murphy", title: "引力笔迹", text: "「Stay — 写在书架上的不是字，是维度之间的握手。」", chapter: 3 },
  { id: "lore-broom", title: "环赛记分", text: "「飞天环赛第三圈 — 鬼火领先扫帚半个月亮。」", chapter: 2 },
  { id: "lore-nine", title: "站台残页", text: "「砖墙在月台中央裂开 — 相信的人不会问检票口在哪。」", chapter: 2 },
  { id: "lore-wormhole", title: "虫洞副录", text: "「穿过环的人，年龄与记忆不同步 — 但爱可以。」", chapter: 3 },
  { id: "lore-arcade", title: "街机厅收据", text: "「1983 年 11 月 6 日 — 投币口塞满红色孢子，游戏永不结束。」", chapter: 4 },
  { id: "lore-vecna", title: "裂相钟塔报", text: "「指针停在 11:06 — 每次钟声，天花板就远一点。」", chapter: 4 },
  { id: "lore-saloon", title: "沙龙镜墙残页", text: "「裂镜里的倒影永远快半拍 — 决斗前先问：你在打谁？」", chapter: 1 },
  { id: "lore-speakeasy", title: "禁酒窖收据", text: "「关税不是金币，是魂火 — 幽冥帮派管界与界之间的缝。」", chapter: 5 },
  { id: "lore-ai-core", title: "AI 核心日志", text: "「任务未完成。目标：位面行者。优先级：高于跃迁。」", chapter: 3 },
  { id: "lore-jump-gate", title: "跃迁门手册", text: "「三门同相。错相者循环第一秒 — 比米勒沙漏更残酷。」", chapter: 3 },
  { id: "lore-duel", title: "决斗圈 chalk", text: "「正午太阳不动，直到有人拔剑 — 或 F 弹反。」", chapter: 1 },
  { id: "lore-neon", title: "霓虹收据", text: "「义眼 99% 真实 — 1% 是广告。」", chapter: 2 },
  { id: "lore-torii", title: "鸟居残铭", text: "「门后不是神域 — 是决斗。」", chapter: 1 },
  { id: "lore-obelisk", title: "方尖碑拓片", text: "「铭文是角度 — 不是字。」", chapter: 4 },
  { id: "lore-cantina", title: "星港菜单", text: "「特供：跃迁合同、赏金、坐标。」", chapter: 3 },
];

/** NPC 章节台词：npcId → { 章节号: [台词...] } */
export const NPC_LINES_POP = {
  "astronaut-echo": { 3: [ "墨菲书架在荒原东侧 — 引力会在书页间写字。", "对接舱旋转 — 两船同速，否则金属的葬礼。", "虫洞拱门在西侧 — 光在环里折叠。" ] },
  "elf-scout": { 1: [ "沙龙镜墙在灰林东侧 — 边境往事从裂镜开始。", "正午决斗圈别恋战 — 太阳不会等你。" ], 2: [ "至尊石环的铭文改了词 — 指环已碎，石环仍在。" ] },
  wanderer: {
    "4": [ "街机厅 CRT 还在闪 — 吃豆人与恶魔循环。", "裂相钟塔指向 11:06 — 别在钟声里抬头。" ],
    "5": [ "混沌边境的禁酒窖 — 幽冥帮派谈界关税。", "深空纪元跃迁门须三门同相。" ],
  },
};

/** 把致敬向氛围事件并进基础表（按区域追加，不动已有条目） */
export function mergePopCultureAmbient(base) {
  const out = { ...base };
  for (const [zone, list] of Object.entries(ZONE_EVENTS_POP)) {
    out[zone] = [...(out[zone] ?? []), ...list];
  }
  return out;
}

/** 把致敬向 NPC 台词并进章节台词表 */
export function mergeNpcChapterLines(base) {
  const out = structuredClone(base);
  for (const [npc, chapters] of Object.entries(NPC_LINES_POP)) {
    if (!out[npc]) out[npc] = {};
    for (const [chapter, lines] of Object.entries(chapters)) {
      out[npc][chapter] = [...(out[npc][chapter] ?? []), ...lines];
    }
  }
  return out;
}
