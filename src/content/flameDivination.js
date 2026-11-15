/**
 * 火种占卜 · 锚火十签（Flame Divination · Ten Seeds of the Anchor）
 *
 * ## 为何这样设计
 *
 * 营火是玩家停留最久、心最稳的地方。占卜是一种"低承诺的奖励"——
 * 不考验操作、不影响平衡，只给一句铭文 + 一小笔魂反馈。
 *
 * ## 卡池（10 张 · 3 档品质）
 *
 * 3 星（稀有）× 2：
 *   01 判者 · Arbiter      ★3 —— 收官剧情见证者
 *   10 祥灯 · Beacon        ★3 —— 锚火本愿
 * 2 星（珍惜）× 5：
 *   02 灰烬 · Ash           ★2 —— 过往
 *   04 潮汐 · Tide          ★2 —— 周期 / 循环
 *   06 远火 · Faraway       ★2 —— 距离 / 期许
 *   08 回声 · Echo          ★2 —— 键位 / 共鸣
 *   09 缝补 · Mend          ★2 —— 修复 / 平和
 * 1 星（普通）× 3：
 *   03 烬火 · Spark         ★1 —— 一线生机
 *   05 骤雨 · Rain          ★1 —— 宣泄 / 净化
 *   07 锈印 · Rustmark      ★1 —— 旧痕 / 警示
 */
export const FLAME_CARDS = Object.freeze([
  {
    id: 'arbiter',
    glyph: '⚖',
    rarity: 3,
    souls: 60,
    zh: { name: '判者', line: '有些仗打完并不是为了赢——是为了证明火还能烧。' },
    en: { name: 'The Arbiter', line: 'Some wars are not won on the field — they are proven by the flame that still burns.' },
  },
  {
    id: 'beacon',
    glyph: '✵',
    rarity: 3,
    souls: 60,
    zh: { name: '祥灯', line: '祥灯照见的不是终点——是还能被照见的下一个转角。' },
    en: { name: 'The Beacon', line: 'The beacon does not shine on the end — it shines on the next corner still reachable.' },
  },
  {
    id: 'ash',
    glyph: '✦',
    rarity: 2,
    souls: 30,
    zh: { name: '灰烬', line: '灰烬落定的那一刻，你才知道哪段路已经被烧进骨头里。' },
    en: { name: 'The Ash', line: 'The moment ash settles is the moment you know which path has burned itself into bone.' },
  },
  {
    id: 'tide',
    glyph: '≈',
    rarity: 2,
    souls: 30,
    zh: { name: '潮汐', line: '潮水不怕你走得远——只怕你忘了它还会回来。' },
    en: { name: 'The Tide', line: 'The tide is not afraid of how far you walk — it only asks you never forget it returns.' },
  },
  {
    id: 'faraway',
    glyph: '◉',
    rarity: 2,
    souls: 30,
    zh: { name: '远火', line: '有时你拼命往前赶，只是为了赶上还在等你的灯。' },
    en: { name: 'The Faraway', line: 'Sometimes you run hard only to catch the lamp still waiting.' },
  },
  {
    id: 'echo',
    glyph: ')',
    rarity: 2,
    souls: 30,
    zh: { name: '回声', line: '你说出去的话，会在另一个世界被一个你不认识的人听懂。' },
    en: { name: 'The Echo', line: 'Words you send out will be understood by a stranger in another world.' },
  },
  {
    id: 'mend',
    glyph: '✚',
    rarity: 2,
    souls: 30,
    zh: { name: '缝补', line: '破了的东西，有时只是等一张能盖它的布。' },
    en: { name: 'The Mend', line: 'What is broken sometimes only waits for the cloth to cover it.' },
  },
  {
    id: 'spark',
    glyph: '✧',
    rarity: 1,
    souls: 15,
    zh: { name: '烬火', line: '别看不起一簇飞火——天黑的时候，一点够照一整条路。' },
    en: { name: 'The Spark', line: 'Do not discount a single spark — in the dark, one is enough to see the whole road.' },
  },
  {
    id: 'rain',
    glyph: '∴',
    rarity: 1,
    souls: 15,
    zh: { name: '骤雨', line: '雨过会把灰冲走，也会把没话说的人淋醒。' },
    en: { name: 'The Rain', line: 'The rain washes the ash away and wakes those who have fallen silent.' },
  },
  {
    id: 'rust',
    glyph: '◈',
    rarity: 1,
    souls: 15,
    zh: { name: '锈印', line: '锈不是坏，是时间在铁上留的笔迹。' },
    en: { name: 'The Rustmark', line: 'Rust is not ruin — it is time writing on iron in its own hand.' },
  },
]);

/** 取卡面语种（language === 'en' ? en : zh） */
export const cardText = (card, lang) => card[lang === 'en' ? 'en' : 'zh'];
