/**
 * 三日曜盘 · The Trisolar Tide — 8 cards / 3 tiers / weekly draw
 *
 * ## 为什么有自己的池子
 *
 * 每日锚火占卜回答"今天怎么过"，每周曜盘回答"这一周轮到谁"。
 * 曜盘只在周一（UTC）刷新，一次三张牌（左阳/中阳/右阳），
 * 续《三日之议》《太阳塔》母题——第四滴蜡、边上的座席、空管风琴、看守你自己。
 *
 * 每张牌 souls 较轻；三张同档（全 ★1 / 全 ★2 / 全 ★3）算「合帘 · Aligned」，
 * 额外 +30% 魂。无需配置，纯内容模块。
 */
export const TRI_SUN_CARDS = Object.freeze([
  {
    id: 'trilance-still', glyph: '☆', rarity: 1, souls: 10,
    zh: { name: '三阳自照', line: '三颗太阳各转各的——这周你不必替谁省心。' },
    en: { name: 'The Suns Rest', line: 'Three suns turning in their own right — this week you need not carry anyone.' },
  },
  {
    id: 'trilance-number', glyph: '✦', rarity: 1, souls: 10,
    zh: { name: '几号的客人', line: '先问自己是几号的客人，再问哪盏先灭。' },
    en: { name: 'Which Number', line: 'Ask which number you are — before you ask which lamp goes out first.' },
  },
  {
    id: 'trilance-unlit', glyph: '✧', rarity: 1, souls: 10,
    zh: { name: '没点起的灯', line: '你回头才看见那盏一直没点起来的灯——它在你心里。' },
    en: { name: 'The Unlit Lamp', line: 'Only when you look back do you see the lamp you never lit — it is within you.' },
  },
  {
    id: 'trilance-wax', glyph: '∷', rarity: 2, souls: 20,
    zh: { name: '碑缝的蜡', line: '第四滴蜡渗到地底；把一直咽着的话说出来。' },
    en: { name: 'The Wax in the Seam', line: 'The fourth drop of wax seeped deep into the stone — say the thing you kept swallowing.' },
  },
  {
    id: 'trilance-seat', glyph: '◉', rarity: 2, souls: 20,
    zh: { name: '边上的座席', line: '来了就是边上的位置；你不必再往中间挤。' },
    en: { name: 'The Seat at the Edge', line: 'You came; the seat at the edge is yours — stop pushing for the middle.' },
  },
  {
    id: 'trilance-letter', glyph: '⚖', rarity: 2, souls: 20,
    zh: { name: '信还没烧掉', line: '那封信一直没烧；这一周它不走，你也不必走。' },
    en: { name: 'The Letter Lives', line: 'The letter never burned. This week, neither it nor you have to leave.' },
  },
  {
    id: 'trilance-hollow', glyph: '☾', rarity: 3, souls: 35,
    zh: { name: '空管风琴', line: '琴再没奏过一次——但它替某个没写完的句子作证。' },
    en: { name: 'The Hollow Organ', line: 'The organ never played again — and yet it bore witness to an unfinished sentence.' },
  },
  {
    id: 'trilance-keeper', glyph: '☼', rarity: 3, souls: 35,
    zh: { name: '看守在你手里', line: '你就是看守——这一周不必等人给你许可。' },
    en: { name: 'The Keeper in You', line: 'You are the keeper — this week you need no one’s permission.' },
  },
]);

export const cardText = (card, lang) => card[lang === 'en' ? 'en' : 'zh'];

/** Fisher–Yates 抽样（不复用 RNG 外的任何随机源；入参种子决定可重放性） */
export const dealTrilance = (rng = Math.random, count = 3) => {
  const pool = [...TRI_SUN_CARDS];
  const picked = [];
  while (picked.length < count && pool.length > 0) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
};
