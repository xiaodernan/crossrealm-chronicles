/**
 * 支线任务名册 —— 两族一张表（W-B3 切片5）
 *
 * 以前基础那 7 条住在 `src/game/SideQuestRegistry.js`、致敬那 14 条住在这里，
 * 而致敬族是靠 `attachPopCultureSideQuests()` **改写 `checkAll` 方法**挂上去的
 * （`Game.js` 第 317 行调它）。后果有两处，都是玩家看得见的：
 *  - 进度分母只数基础那 7 条（`getProgress().total = SIDE_QUESTS.length`），
 *    而致敬支线完成后进的是同一个 `completed` 集合 —— HUD 那一行可以显示 "(12/7)"；
 *  - 支线页签只渲染基础那 7 张卡，14 条致敬支线**能完成、会弹提示、会写日志，却永远不出现在名单里**。
 *
 * 现在两族都在内容层、由 `SIDE_QUESTS_ALL` 一处合并；`SideQuestSystem` 只认这一份名单。
 * 字段：`id` / `title` / `desc` / `check(game)` / `reward`（魂火）/ `journal`（完成后写进日志的那句）。
 * `check` 是运行时判据，签名 `(game) => boolean`；它只看得到已经收进 `content/objectives.js`
 * 的那本账与各子系统自报的读数 —— 判据不许自己另记一份数。
 */
import { FRANCHISE } from './franchises.js';
import { ZONE_IDS } from './ZoneIdentity.js';
import { ECHOES } from './echoes.js';

export const SIDE_QUESTS_BASE = [
  {
    id: 'side-wisp-12',
    zone: 'global',
    title: '魂火萤猎人',
    desc: '吸收 12 个位面残响魂火',
    check: (g) => (g.soulWisps?.collected?.size ?? 0) >= 12,
    reward: 15,
    journal: '十二萤火归锚，位面脉动稍稳。',
  },
  {
    id: 'side-style-a',
    zone: 'global',
    title: '风格试炼',
    desc: '单场战斗风格达 A 级',
    check: (g) => (g.combatStyle?.sessionBest ?? 0) >= 250,
    reward: 10,
    journal: '弹反与处决的节奏，即是行者的语言。',
  },
  {
    id: 'side-dungeon-3',
    zone: 'global',
    title: '迷宫清道夫',
    desc: '清空 3 座不同地下城',
    check: (g) => Object.keys(g.dungeonRuns?.clears ?? {}).length >= 3,
    reward: 20,
    journal: '三座迷宫的空房间，都在低声复述旧战争。',
  },
  {
    id: 'side-rematch',
    zone: 'global',
    title: '信标猎人',
    desc: 'Boss 再战 2 次',
    check: (g) => (g.achievements?.stats?.rematches ?? 0) >= 2,
    reward: 12,
    journal: '信标再燃，证明你仍握剑。',
  },
  {
    id: 'side-cg-half',
    zone: 'global',
    title: '插画旅人',
    desc: 'CG 画廊解锁 40%',
    check: (g) => (g.cgGallery?.getStats()?.percent ?? 0) >= 40,
    reward: 8,
    journal: '每一张 CG 都是位面记忆的切片。',
  },
  {
    id: 'side-photo',
    zone: 'global',
    title: '荒原留影',
    desc: '使用 {photoMode} 拍照模式',
    check: (g) => g.achievements?.stats?.photoMode === true,
    reward: 5,
    journal: '米勒透镜下的留影，连引力都变慢。',
  },
  {
    id: 'side-campfire-all',
    zone: 'global',
    title: '六火皆憩',
    desc: '在全部 6 处营火休息',
    check: (g) => (g.campfireMemory?.getStats()?.zones ?? 0) >= 6,
    reward: 18,
    journal: '六簇火，六段路，一条行者轨迹。',
  },
];

function countFranchise(game, franchise) {
  const sys = game.popCulture;
  if (!sys) return 0;
  return sys.getEntries('all').filter((e) => e.franchise === franchise && sys.unlocked.has(e.id)).length;
}

/**
 * 系列 → 位面：**从回声表自己推**（W-B12 切片3）。
 *
 * 每条回声在 `content/echoes.js` 里都带着 `zone` 格，而同一个系列的回声今天恰好全住同一座位面。
 * "咒术学院巡礼"这类判据读的是该系列回声的解锁数 —— 完成它就等于在那座位面里做事，
 * 所以支线的 `zone` 标签不该手抄，从这里拿：回声漂了标签跟着漂，系列散进两位面时**开机即抛**
 * （那时"标哪座位面"这个问题本身已经不成立，静默选一个就是说谎）。
 */
export function franchiseZone(franchise, 表 = ECHOES) {
  const 座 = new Set(表.filter((e) => e.franchise === franchise).map((e) => e.zone));
  if (座.size === 0) throw new Error(`sideQuests: 系列 "${franchise}" 在回声表里一条都没有，推不出位面`);
  if (座.size > 1) throw new Error(`sideQuests: 系列 "${franchise}" 的回声散在 [${[...座].join('、')}] 两个以上位面里 —— 无法诚实标一座，先回数据层对账`);
  return [...座][0];
}

/**
 * 致敬族。`zone` 的口径（切片3）：判据读**单个系列**回声的，位面由 `franchiseZone()` 从回声表
 * 推导（完成它就等于在那座位面里做事）；读全局百分比、或多系列合缴的，诚实标 `global`。
 */
export const SIDE_QUESTS_POP = [
  {
    id: 'side-echo-half',
    zone: 'global',
    title: '次元共鸣者',
    desc: '次元回声解锁 50%',
    check: (g) => (g.popCulture?.getStats()?.percent ?? 0) >= 50,
    reward: 25,
    journal: '你与六个位面的「回声」同频 — 海报墙为你亮起。',
  },
  {
    id: 'side-wizard-tour',
    // 系列 → 位面由回声表推（切片3）：完成这条 = 在魔法位面里解锁它的回声
    zone: franchiseZone(FRANCHISE.WIZARD),
    title: '咒术学院巡礼',
    desc: '共鸣 3 个魔法学院回声',
    check: (g) => countFranchise(g, FRANCHISE.WIZARD) >= 3,
    reward: 15,
    journal: '环赛、温室、分院 — 学院的三道门都已叩响。',
  },
  {
    id: 'side-space-tour',
    zone: franchiseZone(FRANCHISE.INTERSTELLAR),
    title: '星际方程',
    desc: '共鸣 3 个星际穿越回声',
    check: (g) => countFranchise(g, FRANCHISE.INTERSTELLAR) >= 3,
    reward: 15,
    journal: '沙漏、书架、对接 — 方程的三个变量齐了。',
  },
  {
    id: 'side-upside-tour',
    zone: franchiseZone(FRANCHISE.UPSIDE),
    title: '逆相界幸存者',
    desc: '共鸣 3 个逆相界回声',
    check: (g) => countFranchise(g, FRANCHISE.UPSIDE) >= 3,
    reward: 18,
    journal: '广播塔、裂口、霓虹 — 1983 年的风不再追你。',
  },
  {
    id: 'side-echo-full',
    zone: 'global',
    title: '全频行者',
    desc: '解锁全部次元回声',
    check: (g) => (g.popCulture?.getStats()?.percent ?? 0) >= 100,
    reward: 40,
    journal: '所有回声同频 — 海报墙六色齐亮，六个梦在同一句台词里醒来。',
  },
  {
    id: 'side-western-tour',
    zone: franchiseZone(FRANCHISE.BORDER),
    title: '边境巡礼',
    desc: '共鸣 3 个边境往事回声',
    check: (g) => countFranchise(g, FRANCHISE.BORDER) >= 3,
    reward: 18,
    journal: '沙龙、决斗圈、铁道 — 边境三声枪响都已共鸣。',
  },
  {
    id: 'side-gangster-tour',
    zone: franchiseZone(FRANCHISE.FAMILY),
    title: '幽冥入会',
    desc: '共鸣 3 个幽冥帮派回声',
    check: (g) => countFranchise(g, FRANCHISE.FAMILY) >= 3,
    reward: 20,
    journal: '禁酒窖、圣龛、货仓 — 帮派的三道门都已叩响。',
  },
  {
    id: 'side-scifi-tour',
    zone: franchiseZone(FRANCHISE.DEEPSPACE),
    title: '深空编年',
    desc: '共鸣 3 个深空纪元回声',
    check: (g) => countFranchise(g, FRANCHISE.DEEPSPACE) >= 3,
    reward: 18,
    journal: '穹顶、AI、跃迁门 — 科幻方程的三个变量齐了。',
  },
  {
    id: 'side-triad-master',
    // 三个系列合缴的一条：任何单独一座位面都装不下它，诚实标就是 global
    zone: 'global',
    title: '三巨头同频',
    desc: '边境+帮派+深空各系列全共鸣',
    check: (g) =>
      countFranchise(g, FRANCHISE.BORDER) >= 3 &&
      countFranchise(g, FRANCHISE.FAMILY) >= 3 &&
      countFranchise(g, FRANCHISE.DEEPSPACE) >= 3,
    reward: 35,
    journal: '西部、黑帮、科幻 — 三巨头母题在同一条位面线上对齐。',
  },
  { id: 'side-cyber-tour', zone: franchiseZone(FRANCHISE.CYBER), title: '赛博巡礼', desc: '共鸣 3 个赛博霓虹回声', check: (g) => countFranchise(g, FRANCHISE.CYBER) >= 3, reward: 18, journal: '霓虹、诊所、尖塔 — 赛博三灯齐亮。' },
  { id: 'side-samurai-tour', zone: franchiseZone(FRANCHISE.SAMURAI), title: '武士入门', desc: '共鸣 3 个武士残响回声', check: (g) => countFranchise(g, FRANCHISE.SAMURAI) >= 3, reward: 18, journal: '鸟居、道场、刃冢 — 最后一式已共鸣。' },
  { id: 'side-cosmic-tour', zone: franchiseZone(FRANCHISE.COSMIC), title: '旧日幸存者', desc: '共鸣 3 个旧日低语回声', check: (g) => countFranchise(g, FRANCHISE.COSMIC) >= 3, reward: 22, journal: '方尖碑、抄写室、深井 — 回声不再数你。' },
  { id: 'side-starport-tour', zone: franchiseZone(FRANCHISE.STARPORT), title: '星港常客', desc: '共鸣 3 个星港商路回声', check: (g) => countFranchise(g, FRANCHISE.STARPORT) >= 3, reward: 18, journal: '酒肆、码头、星图 — 航线已谈判通过。' },
  { id: 'side-wave4-master', zone: 'global', title: '四系行者', desc: 'Wave4 四系列全共鸣', check: (g) => [FRANCHISE.CYBER, FRANCHISE.SAMURAI, FRANCHISE.COSMIC, FRANCHISE.STARPORT].every((f) => countFranchise(g, f) >= 3), reward: 45, journal: '赛博、武士、旧日、星港 — 四系在同一条回声线上对齐。' },
];

// 导出辅助函数供运行时使用
export { countFranchise };

/**
 * 分区支线（W-B12）—— 每一座位面都有一条**属于自己的**支线（切片1 起），切片2 起每位面两条。
 *
 * 为什么现在才加：板上这条工作包写的是"支线 7 → 15+"，而切片5 把两族合成一份名单之后量出来
 * 已经有 **21 条** —— 数量早就过线了，真正的空白是**这 21 条没有一条绑在某个位面上**
 * （读的全是跨切面的账：魂火萤、迷宫数、CG 百分比、致敬共鸣、再战次数、拍照、营火覆盖）。
 * "内容深度"用条数量不出来，所以切片1 把目标换成能检验的那一条：每个位面至少一条专属支线。
 *
 * 判据只读**持久化、且可跳过**的位面事实（四样，全在存档里）：
 *  - 在那座火边歇过几次（`campfireMemory.restCount`，营火 id = 区域 id，见 W-A2 切片2）；
 *  - 看过那张门口插画（`cgGallery.unlocked`，键是 `<营火>:start`）；
 *  - 收下该位面的萤火（`soulWisps.collectedInZone(zone)`，位面归属写在出生点表上，随存档往返）；
 *  - 认过那块火牌（`restPointEnhancer.discovered`，营火地标自己的账，存档 v7 起落库 —— B66）。
 *
 * 刻意不碰的仍是 `POI.discovered` 那种字段：它全仓没有读者、没人写、也不进存档
 * （W-A2 切片3 尾巴③已溶解），拿它当判据会让支线在读档后凭空退回"未完成"。
 */
const 歇过 = (game, zone, 次数) => (game.campfireMemory?.restCount?.[zone] ?? 0) >= 次数;
const 看过该区门口那张 = (game, zone) => game.cgGallery?.unlocked?.has(`${zone}:start`) === true;
const 认得一座 = (zone) => (game) => 看过该区门口那张(game, zone) && 歇过(game, zone, 3);

/** 切片2 的第二对事实：萤火收齐 + 火牌认过 —— 同一座位面里两个不同地点的两件事 */
const 收齐该区两枚萤 = (game, zone) => (game.soulWisps?.collectedInZone?.(zone) ?? 0) >= 2;
const 认过那块火牌 = (game, zone) => game.restPointEnhancer?.discovered?.has(zone) === true;
const 拾遗一座 = (zone) => (game) => 收齐该区两枚萤(game, zone) && 认过那块火牌(game, zone);

/** 三族：基础 / 分区 / 致敬。`zone` 是它们唯一的分区依据，`'global'` = 不属于任何一位面 */
export const SIDE_QUESTS_ZONE = [
  {
    id: 'side-zone-fantasy',
    zone: ZONE_IDS.FANTASY,
    title: '林火三歇',
    desc: '在灰白森林营火歇过三次，并看过那张林间插画',
    check: 认得一座(ZONE_IDS.FANTASY),
    reward: 12,
    journal: '影界的林子认得你的脚步声了。',
  },
  {
    id: 'side-zone-magic',
    zone: ZONE_IDS.MAGIC,
    title: '塔下常客',
    desc: '在霍格沃兹遗境营火歇过三次，并看过那座城堡的插画',
    check: 认得一座(ZONE_IDS.MAGIC),
    reward: 14,
    journal: '禁书合上又翻开，塔下的人都记得你递过的热汤。',
  },
  {
    id: 'side-zone-space',
    zone: ZONE_IDS.SPACE,
    title: '荒原第三盏',
    desc: '在米勒荒原营火歇过三次，并看过应急灯下那张插画',
    check: 认得一座(ZONE_IDS.SPACE),
    reward: 14,
    journal: '沙暴把脚印抹平三次，火还没灭。',
  },
  {
    id: 'side-zone-void',
    zone: ZONE_IDS.VOID,
    title: '同一刻第三次',
    desc: '在破碎时线营火歇过三次，并看过折叠时线那张插画',
    check: 认得一座(ZONE_IDS.VOID),
    reward: 16,
    journal: '你把同一个夜晚过了三遍，每一遍都往里添了一点体温。',
  },
  {
    id: 'side-zone-abyss',
    zone: ZONE_IDS.ABYSS,
    title: '边境守夜人',
    desc: '在混沌边境营火歇过三次，并看过那道边境的插画',
    check: 认得一座(ZONE_IDS.ABYSS),
    reward: 18,
    journal: '混沌在墙外数你的呼吸，数到第三次就不再数了。',
  },
  {
    id: 'side-wisp-fantasy',
    zone: ZONE_IDS.FANTASY,
    title: '林间双萤',
    desc: '收下灰白森林的两枚残响魂火，并在它的火牌前驻足（发现营火）',
    check: 拾遗一座(ZONE_IDS.FANTASY),
    reward: 10,
    journal: '两盏冷光跟着你走出林子，火牌在原地亮着。',
  },
  {
    id: 'side-wisp-magic',
    zone: ZONE_IDS.MAGIC,
    title: '塔下双灯',
    desc: '收下霍格沃兹遗境的两枚残响魂火，并认过那块火牌（发现营火）',
    check: 拾遗一座(ZONE_IDS.MAGIC),
    reward: 12,
    journal: '城堡的灯不数脚步，数你带走的两点光。',
  },
  {
    id: 'side-wisp-space',
    zone: ZONE_IDS.SPACE,
    title: '荒原双响',
    desc: '收下米勒荒原的两枚残响魂火，并认过那块火牌（发现营火）',
    check: 拾遗一座(ZONE_IDS.SPACE),
    reward: 12,
    journal: '沙暴盖得住脚印，盖不住两声应答。',
  },
  {
    id: 'side-wisp-void',
    zone: ZONE_IDS.VOID,
    title: '时线双影',
    desc: '收下破碎时线的两枚残响魂火，并认过那块火牌（发现营火）',
    check: 拾遗一座(ZONE_IDS.VOID),
    reward: 14,
    journal: '同一条夜路上捡回两个自己，火牌替你签收。',
  },
  {
    id: 'side-wisp-abyss',
    zone: ZONE_IDS.ABYSS,
    title: '边境双星',
    desc: '收下混沌边境的两枚残响魂火，并认过那块火牌（发现营火）',
    check: 拾遗一座(ZONE_IDS.ABYSS),
    reward: 16,
    journal: '墙外数呼吸的那位，今晚看见了额外两颗星。',
  },
  {
    id: 'side-zone-gloom',
    zone: ZONE_IDS.GLOOM,
    title: '雾林三歇',
    desc: '在幽暗林地营火歇过三次，并看过那片迷雾深处的插画',
    check: 认得一座(ZONE_IDS.GLOOM),
    reward: 15,
    journal: '迷雾记住了你的脚印，三次相逢方才肯认。',
  },
  {
    id: 'side-zone-radiant',
    zone: ZONE_IDS.RADIANT,
    title: '圣域三歇',
    desc: '在辉煌圣域营火歇过三次，并看过那座金色宫殿的插画',
    check: 认得一座(ZONE_IDS.RADIANT),
    reward: 18,
    journal: '晨曦见证了你的坚持，圣域记下了你的名字。',
  },
  {
    id: 'side-wisp-gloom',
    zone: ZONE_IDS.GLOOM,
    title: '雾林双萤',
    desc: '收下幽暗林地的两枚残响魂火，并认过那块火牌（发现营火）',
    check: 拾遗一座(ZONE_IDS.GLOOM),
    reward: 12,
    journal: '两盏冷光跟着你走出林子，火牌在原地亮着。',
  },
  {
    id: 'side-wisp-radiant',
    zone: ZONE_IDS.RADIANT,
    title: '圣域双萤',
    desc: '收下辉煌圣域的两枚残响魂火，并认过那块火牌（发现营火）',
    check: 拾遗一座(ZONE_IDS.RADIANT),
    reward: 16,
    journal: '两盏暖光跟着你走出圣域，火牌在原地亮着。',
  },
];
export const SIDE_QUESTS_ALL = (() => {
  const 名单 = [...SIDE_QUESTS_BASE, ...SIDE_QUESTS_ZONE, ...SIDE_QUESTS_POP];
  const 见过 = new Set();
  for (const q of 名单) {
    if (见过.has(q.id)) throw new Error(`sideQuests: 支线 id "${q.id}" 出现两次（后写的那条会静默盖掉前一条）`);
    见过.add(q.id);
  }
  return 名单;
})();

