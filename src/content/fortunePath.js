/**
 * 命途 · 锚火三问 —— Fortune Path (The Three Questions of the Anchor)
 *
 * 它不是又一个"抽一张卡"。
 * 它是三道你必须直视自己的题目：
 *   1. 你第一次看见的那一团不灭的火，在哪儿——
 *      （家 / 荒野 / 你自己——三种不同的"见"）
 *   2. 它快要灭的时候，你的第一反应是什么——
 *      （拨灶添柴 / 守着等它自己烧 / 呼唤它）
 *   3. 你愿意把它交给谁——
 *      （一个你还没见过的孩子 / 你还没敢开口说出口的人 / 没有谁——它自己知道去处）
 *
 * 三道题共享一套轴——
 *   `ember`（红 - 炉火 · 收拢）：温暖 / 守护 / 守火的手
 *   `grey`（白 - 灰白 · 厘清）：沉静 / 独立 / 看清楚它本身
 *   `self`（金 - 自火 · 燃起）：向内 / 不问 / 由己
 *
 * 终端节点（末端结局）是典籍馆《卷五》炉火母题的缩影——
 * 阿石的炉火 / 林渡的父亲的火盆 / 老柿子树枝上的暗火
 *
 * 判定规则（刻意极简、确定性、不抽奖）：
 *   - 同 `ember/grey/self` 的选择会被记为 axes[0]/[1]/[2]；
 *   - 每题贡献 1 点，三题总 3 点——2 点及以上为 dominant axis；
 *   - 无 dominant axis 时走「风守」；
 *   - 每个 dominant axis 有 3 种 dominant×q3 组合（q3=1/2/3），各自落到一个固定结局；
 *   - 末端结局是 StateGraph 里的终端节点，name 到 display 映射全在 fortunePathEndings。
 */
export const AXIS = Object.freeze({ ember: 0, grey: 1, self: 2 });

export const QUESTIONS = Object.freeze([
  {
    key: 'q1',
    zh: {
      text: '你第一次看见的那一团不灭的火，是在哪儿？',
      a: '在炉灶边——母亲／奶奶／谁生火的人。',
      b: '在荒野的尽头——远远的一道光，走了很久才到的那道。',
      c: '在你自己——哪儿都不用去，你就能觉得它亮过。',
    },
    en: {
      text: 'The first time you saw the flame that would not die — where was it?',
      a: 'By the stove — my mother, my grandmother, whoever kept the fire.',
      b: 'At the far end of a wilderness — a long walk to a distant light.',
      c: 'Inside yourself — no walk needed; you could feel it in you.',
    },
  },
  {
    key: 'q2',
    zh: {
      text: '那团火快要灭的时候，你的第一反应是？',
      a: '你拎起柴刀添加干柴，它复又红了。',
      b: '你只是安静地坐下来，守着它。',
      c: '你对着它呼一口自己的气——不是吹灭，是把自己那一部分借它。',
    },
    en: {
      text: 'When that fire was about to dwindle — what was your first instinct?',
      a: 'You knew where the dry kindling was; you fed it more.',
      b: 'You sat with it a while longer — silent, watchful.',
      c: 'You exhaled against it — not blowing it out; lending yourself to it.',
    },
  },
  {
    key: 'q3',
    zh: {
      text: '你愿意把它交给谁？',
      a: '一个我还没见过的人。世界那端总有人在等。',
      b: '一个我一直不敢开口找对方的人。',
      c: '没有谁——火跟你同路，不必交给别人。它自己知道怎么走。',
    },
    en: {
      text: 'To whom would you entrust it?',
      a: 'Someone I have never met — somewhere out there, someone waits.',
      b: 'Someone I have been afraid to reach out to.',
      c: 'No one — it walks with me; it already knows the way.',
    },
  },
]);

export const FORTUNE_ENDINGS = Object.freeze([
  { id: 'ember_1', souls: 35, rarity: 2, zh: { name: '炉火守灯', line: '你握过的每一根木头，都是别人当年留给你的余温——' }, en: { name: 'The Hearthkeeper', line: 'Every stick you ever fed the fire was a warmth handed down to you by someone before you.' } },
  { id: 'ember_2', souls: 25, rarity: 1, zh: { name: '橙袖', line: '橙袖扣着炉檐的风声——守好这个家的习惯，火就会一直回应。' }, en: { name: 'The Orange Sleeve', line: 'Guard this household as the kettle greets the dawn — the fire will not pretend it doesn’t remember.' } },
  { id: 'ember_3', souls: 60, rarity: 3, zh: { name: '灶光千灯', line: '三代人的灶光都在一碗里——火不是你的，火是从遥火驿替你守了很多代的——你也是火。' }, en: { name: 'The Thousand Stoves', line: 'Three generations of stove-light inside one bowl — the fire has never belonged to you; it has always been the other way round — you belong to it.' } },
  { id: 'grey_1', souls: 25, rarity: 1, zh: { name: '青石立页', line: '你见过那么多炉子熄，你只是一尾燃着的叶子——灰烬在风里才站得最直。' }, en: { name: 'The Slate Page', line: 'You watched many fires go grey; you are the one leaf that stays red — the page that never flickers.' } },
  { id: 'grey_2', souls: 35, rarity: 2, zh: { name: '白默', line: '阿石的那碗没灭，它只是一直在等一双会守的手——那双手就是你。' }, en: { name: 'The White Quiet', line: 'A-Shi’s bowl never died; it waited for a hand willing to sit beside it — that hand is yours.' } },
  { id: 'grey_3', souls: 60, rarity: 3, zh: { name: '残火守者', line: '别人觉得你独自坐着是孤独，你知道——你是在烧那些安息都不愿离开的人——他们都还在火里。' }, en: { name: 'The Keeper of the Embers', line: 'They said you sat alone; you knew — you are the one who keeps the ones who never left.' } },
  { id: 'self_1', souls: 60, rarity: 3, zh: { name: '炉心', line: '你翻过了黑书的最后一页，抹掉了火灭以后的那一行死刑。你是《跨界纪事》写了很久、守火人写不回来的那一字。' }, en: { name: 'The Forge Heart', line: 'You crossed out the line they once sentenced the fire to die by. You are the one stroke — your mother’s long-lost line — that the writing could not reach.' } },
  { id: 'self_2', souls: 35, rarity: 2, zh: { name: '烬轴', line: '三千里以外的遥火驿点出一盏炉，每一次都真实——和你自己一次也答应过的答案——它们都叫火——你都记得——' }, en: { name: 'The Ember Axis', line: 'Every station lit in the mount always worked; every answer you ever gave also made the light answer — they are the same word.' } },
  { id: 'self_3', souls: 25, rarity: 1, zh: { name: '焰骨', line: '火不是世界，火是你走了很远很远以后发现自己仍然可以回不去的步伐——从此以后每一个清晨你都背上一根新木头。' }, en: { name: 'The Ember Bone', line: 'Fire is not the world — it is the step you take after you come back; and every morning you carry one stick forward.' } },
  { id: 'windkeeper', souls: 30, rarity: 2, zh: { name: '风守', line: '你三道题每一题都没落向同一边——风守得住火的每个方向，你也是。' }, en: { name: 'The Windkeeper', line: 'None of your answers pulled in one direction — the windkeeper guards every axis at once; so you do.' } },
]);

export const FORTUNE_PATH_BATCH = Object.freeze({
  cands: FORTUNE_ENDINGS,
  cardsPerDraw: 1,
});
