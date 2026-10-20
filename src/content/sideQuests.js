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
    title: 'sq_side_wisp_12_title',
    desc: 'sq_side_wisp_12_desc',
    check: (g) => (g.soulWisps?.collected?.size ?? 0) >= 12,
    reward: 15,
    journal: 'sq_side_wisp_12_journal',
  },
  {
    id: 'side-style-a',
    zone: 'global',
    title: 'sq_side_style_a_title',
    desc: 'sq_side_style_a_desc',
    check: (g) => (g.combatStyle?.sessionBest ?? 0) >= 250,
    reward: 10,
    journal: 'sq_side_style_a_journal',
  },
  {
    id: 'side-dungeon-3',
    zone: 'global',
    title: 'sq_side_dungeon_3_title',
    desc: 'sq_side_dungeon_3_desc',
    check: (g) => Object.keys(g.dungeonRuns?.clears ?? {}).length >= 3,
    reward: 20,
    journal: 'sq_side_dungeon_3_journal',
  },
  {
    id: 'side-rematch',
    zone: 'global',
    title: 'sq_side_rematch_title',
    desc: 'sq_side_rematch_desc',
    check: (g) => (g.achievements?.stats?.rematches ?? 0) >= 2,
    reward: 12,
    journal: 'sq_side_rematch_journal',
  },
  {
    id: 'side-cg-half',
    zone: 'global',
    title: 'sq_side_cg_half_title',
    desc: 'sq_side_cg_half_desc',
    check: (g) => (g.cgGallery?.getStats()?.percent ?? 0) >= 40,
    reward: 8,
    journal: 'sq_side_cg_half_journal',
  },
  {
    id: 'side-photo',
    zone: 'global',
    title: 'cg_gallery_photo',
    desc: 'sq_side_photo_desc',
    check: (g) => g.achievements?.stats?.photoMode === true,
    reward: 5,
    journal: 'sq_side_photo_journal',
  },
  {
    id: 'side-campfire-all',
    zone: 'global',
    title: 'sq_side_campfire_all_title',
    desc: 'sq_side_campfire_all_desc',
    check: (g) => (g.campfireMemory?.getStats()?.zones ?? 0) >= 6,
    reward: 18,
    journal: 'sq_side_campfire_all_journal',
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
    title: 'sq_side_echo_half_title',
    desc: 'sq_side_echo_half_desc',
    check: (g) => (g.popCulture?.getStats()?.percent ?? 0) >= 50,
    reward: 25,
    journal: 'sq_side_echo_half_journal',
  },
  {
    id: 'side-wizard-tour',
    // 系列 → 位面由回声表推（切片3）：完成这条 = 在魔法位面里解锁它的回声
    zone: franchiseZone(FRANCHISE.WIZARD),
    title: 'sq_side_wizard_tour_title',
    desc: 'sq_side_wizard_tour_desc',
    check: (g) => countFranchise(g, FRANCHISE.WIZARD) >= 3,
    reward: 15,
    journal: 'sq_side_wizard_tour_journal',
  },
  {
    id: 'side-space-tour',
    zone: franchiseZone(FRANCHISE.INTERSTELLAR),
    title: 'sq_side_space_tour_title',
    desc: 'sq_side_space_tour_desc',
    check: (g) => countFranchise(g, FRANCHISE.INTERSTELLAR) >= 3,
    reward: 15,
    journal: 'sq_side_space_tour_journal',
  },
  {
    id: 'side-upside-tour',
    zone: franchiseZone(FRANCHISE.UPSIDE),
    title: 'sq_side_upside_tour_title',
    desc: 'sq_side_upside_tour_desc',
    check: (g) => countFranchise(g, FRANCHISE.UPSIDE) >= 3,
    reward: 18,
    journal: 'sq_side_upside_tour_journal',
  },
  {
    id: 'side-echo-full',
    zone: 'global',
    title: 'sq_side_echo_full_title',
    desc: 'sq_side_echo_full_desc',
    check: (g) => (g.popCulture?.getStats()?.percent ?? 0) >= 100,
    reward: 40,
    journal: 'sq_side_echo_full_journal',
  },
  {
    id: 'side-western-tour',
    zone: franchiseZone(FRANCHISE.BORDER),
    title: 'sq_side_western_tour_title',
    desc: 'sq_side_western_tour_desc',
    check: (g) => countFranchise(g, FRANCHISE.BORDER) >= 3,
    reward: 18,
    journal: 'sq_side_western_tour_journal',
  },
  {
    id: 'side-gangster-tour',
    zone: franchiseZone(FRANCHISE.FAMILY),
    title: 'sq_side_gangster_tour_title',
    desc: 'sq_side_gangster_tour_desc',
    check: (g) => countFranchise(g, FRANCHISE.FAMILY) >= 3,
    reward: 20,
    journal: 'sq_side_gangster_tour_journal',
  },
  {
    id: 'side-scifi-tour',
    zone: franchiseZone(FRANCHISE.DEEPSPACE),
    title: 'sq_side_scifi_tour_title',
    desc: 'sq_side_scifi_tour_desc',
    check: (g) => countFranchise(g, FRANCHISE.DEEPSPACE) >= 3,
    reward: 18,
    journal: 'sq_side_scifi_tour_journal',
  },
  {
    id: 'side-triad-master',
    // 三个系列合缴的一条：任何单独一座位面都装不下它，诚实标就是 global
    zone: 'global',
    title: 'sq_side_triad_master_title',
    desc: 'sq_side_triad_master_desc',
    check: (g) =>
      countFranchise(g, FRANCHISE.BORDER) >= 3 &&
      countFranchise(g, FRANCHISE.FAMILY) >= 3 &&
      countFranchise(g, FRANCHISE.DEEPSPACE) >= 3,
    reward: 35,
    journal: 'sq_side_triad_master_journal',
  },
  { id: 'side-cyber-tour', zone: franchiseZone(FRANCHISE.CYBER), title: 'sq_side_cyber_tour_title', desc: 'sq_side_cyber_tour_desc', check: (g) => countFranchise(g, FRANCHISE.CYBER) >= 3, reward: 18, journal: 'sq_side_cyber_tour_journal' },
  { id: 'side-samurai-tour', zone: franchiseZone(FRANCHISE.SAMURAI), title: 'sq_side_samurai_tour_title', desc: 'sq_side_samurai_tour_desc', check: (g) => countFranchise(g, FRANCHISE.SAMURAI) >= 3, reward: 18, journal: 'sq_side_samurai_tour_journal' },
  { id: 'side-cosmic-tour', zone: franchiseZone(FRANCHISE.COSMIC), title: 'sq_side_cosmic_tour_title', desc: 'sq_side_cosmic_tour_desc', check: (g) => countFranchise(g, FRANCHISE.COSMIC) >= 3, reward: 22, journal: 'sq_side_cosmic_tour_journal' },
  { id: 'side-starport-tour', zone: franchiseZone(FRANCHISE.STARPORT), title: 'sq_side_starport_tour_title', desc: 'sq_side_starport_tour_desc', check: (g) => countFranchise(g, FRANCHISE.STARPORT) >= 3, reward: 18, journal: 'sq_side_starport_tour_journal' },
  { id: 'side-wave4-master', zone: 'global', title: 'sq_side_wave4_master_title', desc: 'sq_side_wave4_master_desc', check: (g) => [FRANCHISE.CYBER, FRANCHISE.SAMURAI, FRANCHISE.COSMIC, FRANCHISE.STARPORT].every((f) => countFranchise(g, f) >= 3), reward: 45, journal: 'sq_side_wave4_master_journal' },
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
    title: 'sq_side_zone_fantasy_title',
    desc: 'sq_side_zone_fantasy_desc',
    check: 认得一座(ZONE_IDS.FANTASY),
    reward: 12,
    journal: 'sq_side_zone_fantasy_journal',
  },
  {
    id: 'side-zone-magic',
    zone: ZONE_IDS.MAGIC,
    title: 'sq_side_zone_magic_title',
    desc: 'sq_side_zone_magic_desc',
    check: 认得一座(ZONE_IDS.MAGIC),
    reward: 14,
    journal: 'sq_side_zone_magic_journal',
  },
  {
    id: 'side-zone-space',
    zone: ZONE_IDS.SPACE,
    title: 'sq_side_zone_space_title',
    desc: 'sq_side_zone_space_desc',
    check: 认得一座(ZONE_IDS.SPACE),
    reward: 14,
    journal: 'sq_side_zone_space_journal',
  },
  {
    id: 'side-zone-void',
    zone: ZONE_IDS.VOID,
    title: 'sq_side_zone_void_title',
    desc: 'sq_side_zone_void_desc',
    check: 认得一座(ZONE_IDS.VOID),
    reward: 16,
    journal: 'sq_side_zone_void_journal',
  },
  {
    id: 'side-zone-abyss',
    zone: ZONE_IDS.ABYSS,
    title: 'sq_side_zone_abyss_title',
    desc: 'sq_side_zone_abyss_desc',
    check: 认得一座(ZONE_IDS.ABYSS),
    reward: 18,
    journal: 'sq_side_zone_abyss_journal',
  },
  {
    id: 'side-wisp-fantasy',
    zone: ZONE_IDS.FANTASY,
    title: 'sq_side_wisp_fantasy_title',
    desc: 'sq_side_wisp_fantasy_desc',
    check: 拾遗一座(ZONE_IDS.FANTASY),
    reward: 10,
    journal: 'sq_side_wisp_fantasy_journal',
  },
  {
    id: 'side-wisp-magic',
    zone: ZONE_IDS.MAGIC,
    title: 'sq_side_wisp_magic_title',
    desc: 'sq_side_wisp_magic_desc',
    check: 拾遗一座(ZONE_IDS.MAGIC),
    reward: 12,
    journal: 'sq_side_wisp_magic_journal',
  },
  {
    id: 'side-wisp-space',
    zone: ZONE_IDS.SPACE,
    title: 'sq_side_wisp_space_title',
    desc: 'sq_side_wisp_space_desc',
    check: 拾遗一座(ZONE_IDS.SPACE),
    reward: 12,
    journal: 'sq_side_wisp_space_journal',
  },
  {
    id: 'side-wisp-void',
    zone: ZONE_IDS.VOID,
    title: 'sq_side_wisp_void_title',
    desc: 'sq_side_wisp_void_desc',
    check: 拾遗一座(ZONE_IDS.VOID),
    reward: 14,
    journal: 'sq_side_wisp_void_journal',
  },
  {
    id: 'side-wisp-abyss',
    zone: ZONE_IDS.ABYSS,
    title: 'sq_side_wisp_abyss_title',
    desc: 'sq_side_wisp_abyss_desc',
    check: 拾遗一座(ZONE_IDS.ABYSS),
    reward: 16,
    journal: 'sq_side_wisp_abyss_journal',
  },
  {
    id: 'side-zone-gloom',
    zone: ZONE_IDS.GLOOM,
    title: 'sq_side_zone_gloom_title',
    desc: 'sq_side_zone_gloom_desc',
    check: 认得一座(ZONE_IDS.GLOOM),
    reward: 15,
    journal: 'sq_side_zone_gloom_journal',
  },
  {
    id: 'side-zone-radiant',
    zone: ZONE_IDS.RADIANT,
    title: 'sq_side_zone_radiant_title',
    desc: 'sq_side_zone_radiant_desc',
    check: 认得一座(ZONE_IDS.RADIANT),
    reward: 18,
    journal: 'sq_side_zone_radiant_journal',
  },
  {
    id: 'side-wisp-gloom',
    zone: ZONE_IDS.GLOOM,
    title: 'sq_side_wisp_gloom_title',
    desc: 'sq_side_wisp_gloom_desc',
    check: 拾遗一座(ZONE_IDS.GLOOM),
    reward: 12,
    journal: 'sq_side_wisp_gloom_journal',
  },
  {
    id: 'side-wisp-radiant',
    zone: ZONE_IDS.RADIANT,
    title: 'sq_side_wisp_radiant_title',
    desc: 'sq_side_wisp_radiant_desc',
    check: 拾遗一座(ZONE_IDS.RADIANT),
    reward: 16,
    journal: 'sq_side_wisp_radiant_journal',
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

