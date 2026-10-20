/** 迷宫叙事碎片 — 场景叙事 / 碎片化文本 / 章节导语 */
import { LORE_FRAGMENTS_POP, mergeNpcChapterLines } from '../content/ambientLore.js';

export const LORE_FRAGMENTS = [
  { id: 'lore-1', title: 'lore_1_title', text: 'lore_1_text', chapter: 1 },
  { id: 'lore-2', title: 'lore_2_title', text: 'lore_2_text', chapter: 1 },
  { id: 'lore-3', title: 'lore_3_title', text: 'lore_3_text', chapter: 2 },
  { id: 'lore-4', title: 'lore_4_title', text: 'lore_4_text', chapter: 3 },
  { id: 'lore-5', title: 'lore_5_title', text: 'lore_5_text', chapter: 4 },
  { id: 'lore-6', title: 'lore_6_title', text: 'lore_6_text', chapter: 5 },
  { id: 'lore-7', title: 'lore_7_title', text: 'lore_7_text', chapter: 3 },
  { id: 'lore-8', title: 'lore_8_title', text: 'lore_8_text', chapter: 2 },
  ...LORE_FRAGMENTS_POP,
];


export const BOSS_LORE = {
  'ruin-crypt': { title: '遗城守墓者', text: '灰白遗城最深处的守墓者苏醒。击败它，锚点碎片才会显露。' },
  'forbidden-library': { title: '禁书守页人', text: '万卷禁书合成一个名字。它不允许任何人读到最后一页。' },
  'five-dim-rift': { title: '裂隙监工', text: '五维生物的投影。在这里它只有三维，但依然足够致命。' },
  'forest-shrine': { title: '神龛古树', text: '根须缠绕的不仅是石头，还有上一个纪元的记忆。' },
  'hub-catacombs': { title: '枢纽守钥者', text: '墓穴最深处，守钥者等待能走完全部迷宫的人。' },
};


export const CHAPTER_INTROS = {
  2: {
    title: 'Chapter 2 · 无尽位面',
    text: '锚点重铸之后，位面之间的墙变薄了。\n\n流浪者说宝箱与营火是生存之本；精灵斥候指向更深的 Boss 红圈。五区之外，还有迷宫在等待。',
  },
  3: {
    title: 'Chapter 3 · 位面飞升',
    text: '奥术与星际的碎片齐备。三座地下城是飞升前的最后试炼：遗城、图书馆、裂隙。\n\n学会法术 1–4，在营火解锁武器技能，然后面对奇点领主。',
  },
  4: {
    title: 'Chapter 4 · 破碎时线',
    text: '时间在这里折叠。向北进入破碎时线，长按法术蓄力可打断 Boss。\n\n时线执政官守护着第四碎片——击败它，你将触及「真·位面行者」的门槛。',
  },
  5: {
    title: 'Chapter 5 · 混沌边境',
    text: '混沌不是终点，是筛子。西北的边境会随机劈落闪电。\n\n击败裂隙领主后，旧地下城会以随机布局「深渊再探」——这是成为无尽行者的最后一步。',
  },
};


export const ZONE_STORY_HOOKS = {
  hub: {
    toast: '枢纽：所有位面的交汇点。世界之锚的脉动从这里扩散。',
    journal: '交汇枢纽 — 位面中心。每一次跨区域旅行，锚点都会记录你的足迹。',
  },
  fantasy: {
    toast: '灰白森林：精灵遗迹与至尊石环。影界守护者镇守西侧。',
    journal: '灰白森林弥漫着旧战争的气息。石环与塔楼是 Ch1 碎片的所在。',
  },
  magic: {
    toast: '霍格沃兹遗境：悬浮城堡在雾中漂移。禁林低语会迷惑方向。',
    journal: '霍格莫茨风格的废墟。大奥术师的竞技场在更深处。',
  },
  space: {
    toast: '米勒荒原：引力透镜扭曲星光。Endurance 号残骸仍在广播。',
    journal: '星际区的时间感不可靠。五维_tesseract 是 Ch3 的核心谜题。',
  },
  void: {
    toast: '破碎时线：重力会突然翻转。蓄力法术是生存关键。',
    journal: '时线裂隙与五维碑文在此交汇。Ch4 的真结局隐藏于此。',
  },
  abyss: {
    toast: '混沌边境：闪电无预警劈落。混沌之核在西北脉动。',
    journal: 'Ch5 终局之地。裂隙领主的竞技场是最后的审判。',
  },
};


/**
 * NPC 章节台词池（W-D2 切片14）。
 *
 * **这里存的是文案键，不是正文** —— 与 `npc.lines`（`world/NPCManager.js` 里那份）同一个口径。
 * 切片12 曾经把两个池子混着处理（`keyText(t(raw))`），正文被当键名查 ⇒ 30/30 句章节台词
 * 念成 `[MISSING: …]`（B119）；切片13 修掉症状，这一片把**因**收掉：正文进双表，
 * 池子里只剩键，两个池子从此共用一条展开链（`npcLine`）。
 *
 * 键名 `npc_<谁>_c<章>_<池内下标>`；`content/ambientLore.js` 的致敬层追加用 `_p` 前缀。
 * 与 `npc.lines` 那七条重名的两句复用旧键（一行文案只有一个键）。
 */
export const NPC_CHAPTER_LINES = mergeNpcChapterLines({

  wanderer: {
    1: ['npc_wanderer_0', 'npc_wanderer_c1_1'],
    2: ['npc_wanderer_c2_0', 'npc_wanderer_c2_1'],
    3: ['npc_wanderer_c3_0', 'npc_wanderer_c3_1'],
    4: ['npc_wanderer_c4_0', 'npc_wanderer_c4_1'],
    5: ['npc_wanderer_c5_0', 'npc_wanderer_c5_1'],
  },

  'elf-scout': {
    1: ['npc_scout_c1_0', 'npc_scout_c1_1'],
    2: ['npc_scout_c2_0', 'npc_scout_c2_1'],
    3: ['npc_scout_c3_0', 'npc_scout_c3_1'],
    4: ['npc_scout_c4_0', 'npc_scout_c4_1'],
    5: ['npc_scout_c5_0', 'npc_scout_c5_1'],
  },

  'astronaut-echo': {
    1: ['npc_astronaut_0', 'npc_astronaut_c1_1'],
    2: ['npc_astronaut_c2_0', 'npc_astronaut_c2_1'],
    3: ['npc_astronaut_c3_0', 'npc_astronaut_c3_1'],
    4: ['npc_astronaut_c4_0', 'npc_astronaut_c4_1'],
    5: ['npc_astronaut_c5_0', 'npc_astronaut_c5_1'],
  },

});


export const DUNGEON_ENTER_LINES = {
  'ruin-crypt': '遗城迷宫：石墙记得每一次脚步声。',
  'forbidden-library': '禁书迷宫：书架后面不是书，是未发生的灾难。',
  'five-dim-rift': '裂隙迷宫：几何在这里不可信。',
  'forest-shrine': '神龛迷宫：根须在脚下呼吸。',
  'hub-catacombs': '枢纽墓穴：最短的迷宫，最深的守钥者。',
};