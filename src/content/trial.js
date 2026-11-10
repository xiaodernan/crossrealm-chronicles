/**
 * 位面试炼（W-F3 切片1）—— 层数曲线、词缀数值、计分口径。
 *
 * ## 这一片与 W-F2 的分界线
 *
 * W-F2 把赛季词缀**显示**出来了，但页面上刻意不写数值 —— 因为"词缀影响什么"
 * 那是试炼的事。这一片就是那件事：**词缀第一次真的改规则**。
 *
 * 分界守在这里：**赛季页说"这一季带哪几条"，试炼说"每条值多少"**。
 * 数值只放在本文件，赛季页不读它 —— 一份真源，两处消费者（试炼的规则、试炼页的说明）。
 *
 * ## 层数曲线为什么写死在内容层而不做随机
 *
 * 试炼是**可比较**的东西（成绩要进排行榜）。随机层数等于让两个玩家的成绩没法比 ——
 * 所以层数曲线是死表，随机只发生在"这一层从池子里摸哪几只"。
 *
 * ## 缩放的三个乘子为什么是乘而不是覆盖
 *
 * `scale` 是**叠在名册基值上的乘子**，不是绝对值。理由是 W-E1 那条咽喉已经有一套
 * `名册 × 难度 × 成长`，试炼再来一套绝对值就成了"第二个真源"（B36 那一族）。
 * 乘子可交换，加进来只是多乘一项。
 */

/** 试炼一共几层。层号从 1 开始 —— 玩家看见的也是这个数 */
export const TRIAL_MAX_LAYERS = 5;

/**
 * 层数曲线。`quota` 是这一层要清掉多少只，`seconds` 是这一层的时限（秒，世界时）。
 *
 * `pool` 里的 id 必须都在 `ENEMY_ROSTER` 里 —— 这条由 `tests/trial.test.js` 直接对着
 * 敌人名册断言，不靠人肉记（B45 那一族：稳定身份靠人肉复制就会漂）。
 */
export const TRIAL_LAYERS = Object.freeze([
  Object.freeze({
    layer: 1, quota: 4, seconds: 90,
    pool: Object.freeze(['soldier', 'crawler']),
    scale: Object.freeze({ hp: 1, damage: 1, speed: 1 }),
  }),
  Object.freeze({
    layer: 2, quota: 5, seconds: 90,
    pool: Object.freeze(['soldier', 'stalker', 'dancer']),
    scale: Object.freeze({ hp: 1.15, damage: 1.05, speed: 1.05 }),
  }),
  Object.freeze({
    layer: 3, quota: 5, seconds: 100,
    pool: Object.freeze(['knight', 'sentinel']),
    scale: Object.freeze({ hp: 1.3, damage: 1.1, speed: 1.1 }),
  }),
  Object.freeze({
    layer: 4, quota: 6, seconds: 100,
    pool: Object.freeze(['juggernaut', 'hexer']),
    scale: Object.freeze({ hp: 1.45, damage: 1.15, speed: 1.15 }),
  }),
  Object.freeze({
    layer: 5, quota: 6, seconds: 120,
    pool: Object.freeze(['elite', 'wraith']),
    scale: Object.freeze({ hp: 1.6, damage: 1.2, speed: 1.2 }),
  }),
]);

/**
 * 取某一层的曲线。**层号越界当场抛** —— 与 `enemyRosterOf` / `difficultyOf` 同一口径：
 * 层号越界若静默返回 `undefined`，症状是"试炼跑完第一层就没了"，而报错栈里不会有一行
 * 指向那个越界的一。
 */
export function trialLayerOf(layer) {
  const row = TRIAL_LAYERS.find((r) => r.layer === layer);
  if (!row) {
    throw new Error(
      `位面试炼没有第 ${layer} 层（共 ${TRIAL_MAX_LAYERS} 层）—— `
      + '返回 undefined 会让试炼静默停在这一层之前',
    );
  }
  return row;
}

/**
 * 词缀的**数值口径**（八条，id 与 `content/seasons.js` 的 `SEASON_MODIFIERS` 逐字相同）。
 *
 * 每一条只写"它改了什么"，**不写文案** —— 文案在 `strings.*.js`（`trial_affix_*`），
 * 因为同一句话要给赛季页与试炼页两处看，写两份就会漂。
 *
 * 字段语义（都是"加在基线之上的增量"，折叠规则见 `trialModifiers`）：
 * - `timeDelta`   每层时限的秒数增量（负数 = 更紧）
 * - `quotaDelta`  每层配额的增量
 * - `hpMul` / `damageMul` / `speedMul`  出生缩放的乘法增量（1 表示不改）
 * - `burnDps`     玩家在试炼里每秒承受的灼烧（0 表示没有）
 * - `fogMul`      雾浓度乘子（1 表示不改）
 */
export const TRIAL_AFFIX_EFFECTS = Object.freeze({
  'burning-ground': Object.freeze({ burnDps: 2.5 }),
  'elite-surge': Object.freeze({ quotaDelta: 1 }),
  'drowned-echo': Object.freeze({ timeDelta: -15 }),
  'heavy-fog': Object.freeze({ fogMul: 1.9 }),
  'gloom-veil': Object.freeze({ fogMul: 1.45, speedMul: 0.95 }),
  'swift-shades': Object.freeze({ speedMul: 1.15 }),
  'radiant-decree': Object.freeze({ damageMul: 1.15 }),
  'armored-choir': Object.freeze({ hpMul: 1.1, speedMul: 0.9 }),
});

/** 词缀效果的**基线**（没有任何词缀时的那一份）。折叠的起点，也是返回值的形状 */
export const TRIAL_BASE_EFFECT = Object.freeze({
  timeDelta: 0, quotaDelta: 0, hpMul: 1, damageMul: 1, speedMul: 1, burnDps: 0, fogMul: 1,
});

/** 折叠时的加法项与乘法项 —— 分开列，免得"加"和"乘"混在一个循环里靠运气 */
const ADDITIVE = Object.freeze(['timeDelta', 'quotaDelta', 'burnDps']);
const MULTIPLICATIVE = Object.freeze(['hpMul', 'damageMul', 'speedMul', 'fogMul']);

/**
 * 把一组词缀 id 折成一份效果。**未知 id 直接抛** —— 与"未知敌人类型"同一口径：
 * 试炼是靠词缀改规则的，悄悄忽略一条等于让玩家的成绩与规则对不上（而且没人看得出来）。
 *
 * 同一条 id 出现两次只算一次（赛季下发的是集合，不是序列）。
 */
export function trialModifiers(affixIds = []) {
  if (!Array.isArray(affixIds)) {
    throw new Error(`trialModifiers: 要一组词缀 id，收到 ${typeof affixIds}`);
  }
  const out = { ...TRIAL_BASE_EFFECT };
  for (const id of new Set(affixIds)) {
    const eff = TRIAL_AFFIX_EFFECTS[id];
    if (!eff) {
      throw new Error(
        `未知词缀 "${id}"（可用：${Object.keys(TRIAL_AFFIX_EFFECTS).join(' / ')}）—— `
        + '悄悄忽略会让试炼规则与页面写的那几条不一致',
      );
    }
    for (const k of ADDITIVE) out[k] += eff[k] ?? 0;
    for (const k of MULTIPLICATIVE) out[k] *= eff[k] ?? 1;
  }
  // 乘子必须保持正有限数：乘出 0 或 NaN 的后果是"敌人没有血量"这种查不出来的症状
  for (const k of MULTIPLICATIVE) {
    if (!Number.isFinite(out[k]) || out[k] <= 0) {
      throw new Error(`trialModifiers: ${k} 折出 ${out[k]} —— 乘子必须正有限`);
    }
  }
  return out;
}

/** 某一层**带上词缀之后**的实际时限（最小 10 秒：再短就不是"限时"而是"抽奖"） */
export function layerSeconds(layer, mods) {
  return Math.max(10, Math.round(trialLayerOf(layer).seconds + (mods?.timeDelta ?? 0)));
}

/** 某一层**带上词缀之后**的实际配额（最小 1 只） */
export function layerQuota(layer, mods) {
  return Math.max(1, Math.round(trialLayerOf(layer).quota + (mods?.quotaDelta ?? 0)));
}

/** 某一层**带上词缀之后**的出生缩放（把词缀乘子折进曲线自带的 scale） */
export function layerScale(layer, mods) {
  const base = trialLayerOf(layer).scale;
  return Object.freeze({
    hp: base.hp * (mods?.hpMul ?? 1),
    damage: base.damage * (mods?.damageMul ?? 1),
    speed: base.speed * (mods?.speedMul ?? 1),
  });
}

/**
 * 计分：清掉的层数为主，剩余秒数为辅。
 *
 * 口径刻意简单到可以被玩家心算：**每层 100 分，剩余秒数每 10 秒 1 分**。
 * 不加连杀、不加难度系数 —— 那些是"看起来深"的东西，而排行榜上真正要比的是
 * "你打到第几层"，别的都只是同层之内的先后。
 */
export function trialScore(layersCleared, secondsLeft = 0) {
  const 层 = Math.max(0, Math.floor(layersCleared));
  const 秒 = Math.max(0, Math.floor(secondsLeft));
  return 层 * 100 + Math.floor(秒 / 10);
}
