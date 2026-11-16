/**
 * 星轨 · 炉火祈愿 — Vigil Vow（锚火三问之后那三个祈愿）
 *
 * 这是《跨界纪事》第七百年篇的祈愿链——三道祈愿走完火和人：
 *   1. 你独自看见炉火；
 *   2. 你第一次被允许自己守它；
 *   3. 你终于给了它一个名字。
 *
 * 三道题仍然只做三个轴：
 *   `ember`（炉 — 火的命）：火、灶、炉火、守火、母亲、家、白茵
 *   `grey`（灰 — 烬的寂静）：影、归、沉默、白纸、夜半、铁匣子
 *   `self`（自 — 人的火）：小火、火、第一次独守、名字、孩子、炉火
 *
 * 这是嵌进世界的一条真祈愿链——不是占卜，不是故事模板
 * ——你的守火故事在屏幕上怎么「命」由你自己说了算。
 *
 * 判定规则与锚火三问一致：三题每题贡献 1 点——≥2 点 axis 的 match 落到
 * 对应结局；1-1-1 平票走「无名炉」。StateGraph 同源：`vigilVowGraph`。
 */
export const VOW_AXIS = Object.freeze({ ember: 0, grey: 1, self: 2 });

export const VOW_QUESTIONS = Object.freeze([
  {
    key: 'q1',
    zh: {
      text: '你独自站在灶前——炉火快要熄了。你说了什么话？',
      a: '「我等你。」——你蹲着。',
      b: '你把早餐掰成两半，一半放在炉子的铁沿上，安静地看火。',
      c: '「我在。」——你说了一句。',
    },
    en: {
      text: 'You are alone before the stove — the fire is nearly out. What do you say?',
      a: '"I will wait for you." — you crouch down.',
      b: 'You split your bread in half and rest one half on the iron rim, and watch the fire.',
      c: '"I am here." — you say it once, simply.',
    },
  },
  {
    key: 'q2',
    zh: {
      text: '第一次让你独自守火的那个夜晚，你做了什么？',
      a: '你像阿石那样一根一根地添白桦——一个时辰添一根。',
      b: '你坐了整夜，炉子和人都不再响——你学会了不打扰它。',
      c: '你在炉灰上刻了一个「火」字——你不想它认不得你。',
    },
    en: {
      text: 'The first night they let you tend the stove alone — what did you do?',
      a: 'Like A-Shi, you fed white birch branch by branch — one twig per hour.',
      b: 'You sat through the whole night; you did not speak; you did not disturb the fire.',
      c: 'You carved a single character into the soot — 火. So the fire would know you.',
    },
  },
  {
    key: 'q3',
    zh: {
      text: '炉火终于有了一个名字——炉火。你记住那天以什么？',
      a: '母亲的手按在铁沿上——灶烫的地方——那一秒钟。',
      b: '老人翻开他旧的卷轴纸条——用炭在纸上留下淡淡的印。',
      c: '小火在炉子边被你叫「炉火」——那一声喊叫得你心里有点暖。',
    },
    en: {
      text: 'Finally the fire got its name — 炉火. How do you remember that day?',
      a: 'My mother’s hand flat on the iron edge — that one second.',
      b: 'The old man unfolding a thin strip of paper and pressing one finger in soot — the outline of the character.',
      c: 'Xiao Huo calling it 炉火 at the stove-side — the warmth in his voice when he did.',
    },
  },
]);

export const VOW_ENDINGS = Object.freeze([
  { id: 'ember_1', souls: 25, rarity: 1, zh: { name: '灶前往', line: '灶前一坐，香气从矮凳升起来——灶火知道每一个会守的人—是它最熟的那一批。', }, en: { name: 'The Hearthfront', line: 'A meal split across the iron at dawn — the fire kept, soft and willing; the hearth-side in spring — the kitchen remembers.' } },
  { id: 'ember_2', souls: 35, rarity: 2, zh: { name: '炉火春安', line: '油纸条上灶火春安四个字——立春那个深夜院门自己响——你没有说过「炉火春安」——炉火替你记下了。', }, en: { name: 'Spring Peace', line: 'May the fire-hearth be at peace in spring — the four characters on the oil-paper; the night the gate rattled once on its own; the fire never said "peace" — but it remembered you.' } },
  { id: 'ember_3', souls: 60, rarity: 3, zh: { name: '炉名七百', line: '七百年来——守火人终于叫了那四个字——"灶火春安——灶火春安——炉火在"——炉火知回了那四个字。', }, en: { name: 'The Name Keeper', line: 'Seven hundred years, and the first name spoken — "炉火春安"; the fire answered the name.' } },
  { id: 'grey_1', souls: 35, rarity: 1, zh: { name: '白默灰', line: '你从来都安静。灰默知道每一个会独自坐着看火的人——他都听过了。', }, en: { name: 'The Ash Quiet', line: 'White-grey silence — you never spoke; you always sat. The ash-grey keeper who never once needed a word.' } },
  { id: 'grey_2', souls: 25, rarity: 1, zh: { name: '灰钥', line: '你按炉灰的时候——按下去的不是灰——是你自己。', }, en: { name: 'The Ash Key', line: 'When you press your hand into ash — not the ash — you.' } },
  { id: 'grey_3', souls: 60, rarity: 3, zh: { name: '手在炉', line: '炉灰下面有什么——有你手心的掌纹。打开炉门——里面一双手。那双手——是你的手。', }, en: { name: 'The Hand Beneath', line: 'What is under the ash? Your palm-print. Open the stove-door — inside is a hand. The hand is yours.' } },
  { id: 'self_1', souls: 60, rarity: 3, zh: { name: '炉火春安之叶', line: '火种树第一片黄色叶子——立春第一天——灶火照它照得发金——七百年来第一颗自己想醒的叶子——是你。', }, en: { name: 'The First Leaf', line: 'The first yellow-green leaf on the fire-seed tree opening itself to the light — the stove-lit leaf — the very first person to wake up in this kitchen in seven hundred years — was you.' } },
  { id: 'self_2', souls: 35, rarity: 2, zh: { name: '炉照面', line: '炉火映在你脸上——那一刻——你是火，也是人。', }, en: { name: 'The Kindled Face', line: 'The fire lit on your face — that is the moment; you were both fire and the one who carries it.' } },
  { id: 'self_3', souls: 25, rarity: 1, zh: { name: '炉火三文', line: '炉火三个字——你从小就念——它们在你心口里——谁也别来收。', }, en: { name: 'The Three Characters', line: 'Three characters you learned before letters — burned into the wall two feet from the stove — they belonged to you before you knew you had already learned them.' } },
  { id: 'windkeeper', souls: 30, rarity: 2, zh: { name: '无名炉', line: '你三道题——哪一边也没落进去。守火的人得不属于任何一边——炉火把你记下了。', }, en: { name: 'The Nameless Hearth', line: 'None of your answers landed on one side — the keeper belongs to no school. The fire knows you anyway.' } },
]);

export const VOW_BATCH = Object.freeze({
  cands: VOW_ENDINGS,
  cardsPerDraw: 1,
});
