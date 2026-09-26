import { DUNGEON_BOSS_PREFIX } from './bossRoster.js';

/** Boss 专属台词 — 开场 / 阶段 / 击败 / 地牢守钥者 */
export const BOSS_PHASE_LINES = {
  'shadow-warden': {
    1: { banner: '阶段 I · 影之审判', toast: '「踏入影界者，将承受三重审判。」' },
    2: { banner: '阶段 II · 裂地', toast: '「地面也会背叛你 — 躲开红环！」', shake: 0.1 },
    3: { banner: '阶段 III · 狂怒', toast: '「影界不会放过任何穿越者！」', shake: 0.14, color: '#ff4444' },
  },
  archmagus: {
    1: { banner: '阶段 I · 奥术帷幕', toast: '「光与位面，皆为我所吞噬。」' },
    2: { banner: '阶段 II · 弹幕', toast: '「躲开紫球 — 靠近才能弹反！」', shake: 0.08 },
    3: { banner: '阶段 III · 禁咒', toast: '「最后一页，不允许被读到！」', shake: 0.12, color: '#aa55ff' },
  },
  'singularity-herald': {
    1: { banner: '阶段 I · 引力井', toast: '「质量即命运。你逃不掉。」' },
    2: { banner: '阶段 II · 拉扯', toast: '「感受奇点 — 别被拉进中心！」', shake: 0.1 },
    3: { banner: '阶段 III · 轨道弹幕', toast: '「六条轨道，六条死路。」', shake: 0.15, color: '#4488ff' },
  },
  'void-chronarch': {
    1: { banner: '阶段 I · 时线', toast: '「你读这句话时，另一个你已经倒下。」' },
    2: { banner: '阶段 II · 时停', toast: '「时间在此折叠 — 蓄力法术可打断！」', shake: 0.12 },
    3: { banner: '阶段 III · 终刻', toast: '「所有时线归一 — 唯有斩裂。」', shake: 0.16, color: '#c9a962' },
  },
  'chaos-overlord': {
    1: { banner: '阶段 I · 裂隙', toast: '「四界归一，裂隙仍存。」' },
    2: { banner: '阶段 II · 混沌脉冲', toast: '「靠近我会被混沌灼烧 — 保持距离！」', shake: 0.11 },
    3: { banner: '阶段 III · 终焉', toast: '「斩裂我，或成为下一个裂隙。」', shake: 0.18, color: '#ff2244' },
  },
};

export const BOSS_DEFEAT_LINES = {
  'shadow-warden': { title: '影界守护者', text: '影散。灰白森林的第一道枷锁解除。\n\n营火可解锁「影界斩」剑系技能。' },
  archmagus: { title: '大奥术师·萨尔林', text: '禁书合上。魔法遗境的奥术风暴平息。\n\n杖系「奥术共鸣 II」已在营火可用。' },
  'singularity-herald': { title: '奇点领主', text: '引力井坍缩。米勒荒原恢复静止。\n\n剑系「位面斩强化」已解锁。' },
  'void-chronarch': { title: '时线执政官', text: '时线重新缝合。你看见无数个自己的倒影消散。\n\n杖系「时线洞察」已解锁。' },
  'chaos-overlord': { title: '混沌裂隙领主', text: '混沌暂退。边境的闪电归于沉默。\n\n双流派终极技能「无尽行者」已解锁。' },
};

export const DUNGEON_BOSS_LINES = {
  'ruin-crypt': {
    intro: '遗城守墓者从碑刻中站起。',
    p2: '守墓者唤醒遗城亡魂 — 更快，更狠。',
    defeat: '墓穴归于寂静。锚点碎片在墙后显露。',
  },
  'forbidden-library': {
    intro: '禁书守页人合成万卷之名。',
    p2: '最后一页开始燃烧 — 守页人暴走。',
    defeat: '禁书合上。图书馆的灾难被推迟。',
  },
  'five-dim-rift': {
    intro: '裂隙监工从五维投影中降临。',
    p2: '几何扭曲 — 监工进入猎杀模式。',
    defeat: '投影消散。裂隙观测站恢复信号。',
  },
  'forest-shrine': {
    intro: '神龛古树的根须化为守钥者。',
    p2: '根须缠绕 — 守钥者进入第二阶段。',
    defeat: '上一个纪元的记忆随风散去。',
  },
  'hub-catacombs': {
    intro: '枢纽守钥者从墓穴最深处苏醒。',
    p2: '守钥者拔出枢纽之钥 — 迷宫震动。',
    defeat: '守钥者倒下。枢纽地下再次封闭。',
  },
};

/**
 * 副本 id → bossId。
 *
 * 前缀不在这里写第二份：它由 `content/bossRoster.js` 的 `DUNGEON_BOSS_PREFIX` 给出，
 * 而名册那边同时用同一个常量做"认不认得这个 id"的判断 —— 一处改、两处跟着走。
 * 修前这里是独立的一份 `` `dungeon-${id}` ``，与 `DungeonManager` 里拼的那份各写一遍。
 */
export function getDungeonBossId(dungeonId) {
  return `${DUNGEON_BOSS_PREFIX}${dungeonId}`;
}
