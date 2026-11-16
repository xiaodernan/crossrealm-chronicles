/**
 * 炉火的交棒 · The Passing of the Fire — 锚火三问之后的最后一课
 *
 * 这是《跨界纪事》卷十五「第七百年」之后阿祖留下的最后一段路：
 *   W-Z281《炉火的谈话》里阿祖说「我要走了」—— 炉火没有回应
 *   本模块就是炉火回应的那一刻：七百年的传承烧到你手心里。
 *
 * 你不是占卜它——你只是被它点名：
 *   1. 阿祖说完「炉火，我要走了」，炉火让你回答它一件事；
 *   2. 炉火让你做第二件事；
 *   3. 炉火把它最亮的那一点光照在你手心——
 *      你以什么记住这一晚。
 *
 * 三道题同样只走三个轴：
 *   `kindle`（火 — 喂它的人）：添白桦、守份量、做它问的第一件事
 *   `tend`（守 — 看火的人）：铁碗、长夜、灰里的手
 *   `root`（根 — 被叫出名字的人）：小火、炉火、七百年的孩子
 *
 * 判定规则与锚火三问、炉火祈愿一致：三题每题 1 点；
 * ≥2 点落轴的轴值决定结局系列，Q3 的选择决定具体结局；
 * 1-1-1 平票走「无名守火人」。StateGraph 同源：`kindlePassGraph`。
 *
 * 设计意图：
 *   锚火三问是「直视自己」；炉火祈愿是「对一炉火忠诚」；
 *   炉火的交棒是「接住七百年——火不过是在换手」。
 */
export const PASS_AXIS = Object.freeze({ kindle: 0, tend: 1, root: 2 });

export const PASS_QUESTIONS = Object.freeze([
  {
    key: 'q1',
    zh: {
      text: '阿祖说完「炉火，我要走了」——炉火让你回答它一件事。你说了什么？',
      a: '「你不灭。」——你没有问它记不记得你',
      b: '「我看着你。」——你把手压在铁沿上，看它烧',
      c: '「我叫它炉火。」——你替小火说出了那两个字',
    },
    en: {
      text: 'The old keeper says “The fire is going now.” — the fire asks you one thing first. What do you say?',
      a: '“You do not die.” — you do not ask whether it remembers you',
      b: '“I am watching you.” — your hand on the iron rim, watching it burn',
      c: '“I call it 炉火.” — you say the two characters out loud, like Xiao Huo taught you',
    },
  },
  {
    key: 'q2',
    zh: {
      text: '炉火让你做第二件事——你做的是哪一件？',
      a: '你添了一根白桦，不多不少——和守火的份量一样',
      b: '你把饭碗也放在铁沿上——它够不着，但你放了',
      c: '你对它念了母亲教你的那支歌',
    },
    en: {
      text: 'The fire asks for the second thing — which one do you do?',
      a: 'You feed one birch branch — no more — exactly the keeper’s measure',
      b: 'You set your own bowl on the rim — it could not reach it, but you set it down',
      c: 'You sing the song your mother taught you, quiet, straight at the fire',
    },
  },
  {
    key: 'q3',
    zh: {
      text: '炉火把最亮的一点光照在你手心——你以什么记住这一晚？',
      a: '母亲的手——它按在铁沿上的那一秒',
      b: '灶火燃着——整屋子的人都没有说话',
      c: '你自己——被光照出的轮廓里，一双和炉火一模一样的手',
    },
    en: {
      text: 'The fire pours its brightest crumb of light onto your palm — what do you remember this night by?',
      a: 'My mother’s hand — the one second it rested on the iron rim',
      b: 'The stove burning on — the whole room holding its breath, no one speaking',
      c: 'Me — outlined in the light — a pair of hands, identical to the fire’s',
    },
  },
]);

export const PASS_ENDINGS = Object.freeze([
  { id: 'kindle_1', souls: 25, rarity: 1, zh: { name: '食火者', line: '火当然会饿——你喂它，它记你一辈子。', }, en: { name: 'The One Who Feeds', line: 'The fire is always hungry — feed it, and it never forgets you.' } },
  { id: 'kindle_2', souls: 35, rarity: 2, zh: { name: '白桦路', line: '你一根一根添白桦——七百年，它替你留亮了一道路。', }, en: { name: 'The Birch Road', line: 'Branch after branch — seven hundred years of you, keeping the road white.' } },
  { id: 'kindle_3', souls: 60, rarity: 3, zh: { name: '春田之火', line: '你带回每一冬的第一筐白桦——炉火替你记着七百年的收成。', }, en: { name: 'The Spring Field', line: 'The first basket of birch each winter — the fire counted every harvest for seven hundred years.' } },
  { id: 'tend_1', souls: 25, rarity: 1, zh: { name: '铁沿上的碗', line: '你把碗也放上去了——它吃不了，但你知道它看见了。', }, en: { name: 'The Bowl on the Rim', line: 'You set a bowl beside it — it could not eat, but it saw you.' } },
  { id: 'tend_2', souls: 35, rarity: 2, zh: { name: '长夜守', line: '炉火没有熄过——你也是。', }, en: { name: 'The Night Watch', line: 'The fire never went out — and neither did you.' } },
  { id: 'tend_3', souls: 60, rarity: 3, zh: { name: '灰里的掌纹', line: '炉灰下面压着一个掌印——是你的，也是七百年每个守火人的。', }, en: { name: 'The Palm in the Ash', line: 'One palm-print under the ash — yours, and the hands of seven hundred years.' } },
  { id: 'root_1', souls: 25, rarity: 1, zh: { name: '小火', line: '你从被叫成小火那天起——就把这团火记在心上了。', }, en: { name: 'Xiao Huo', line: 'From the day they called you Xiao Huo — this fire has been yours to say.' } },
  { id: 'root_2', souls: 35, rarity: 2, zh: { name: '叫它炉火', line: '两个字——炉火——整屋子都亮了。', }, en: { name: 'The Named Fire', line: 'Two characters spoken aloud — 炉火 — the whole house answered.' } },
  { id: 'root_3', souls: 60, rarity: 3, zh: { name: '炉火七百', line: '七百年的第二条命——从阿祖手上过到你手上——没有一丝火星落地。', }, en: { name: 'The Seven-Hundred-Year Fire', line: 'The second life of the seven-hundred-year fire — passed from the old keeper’s hands into yours — not one spark fell.' } },
  { id: 'heirkeeper', souls: 30, rarity: 2, zh: { name: '无名守火人', line: '你没有偏向哪一边——炉火把你记下来了。', }, en: { name: 'The Unnamed Keeper', line: 'You belonged to no side — the fire keeps you anyway.' } },
]);

export const PASS_BATCH = Object.freeze({
  cands: PASS_ENDINGS,
  cardsPerDraw: 1,
});
