/**
 * 分层环境音（W-C7 切片4）—— 每座位面几层可叠加的环境声。
 *
 * ## 为什么要有这一层
 *
 * 改前的环境声只有**一条线**：`_startZoneDrone` 起两个振荡器（基频 + 泛音）铺一条底噪，
 * `_startMelody` 按音阶走一条旋律。两者都在 `ambient` / `bgm` 总线上，但**只有一条环境层** ——
 * 于是"霍格沃兹遗境"与"破碎时线"听起来只是底噪的音高不同，玩家听不出那是**两个地方**。
 *
 * §1.2 C1 记的"音频全部 Web Audio 合成"这一条里，能**不靠外部素材**补上的就是分层：
 * 环境声本来就不该是一个人的独奏，而是一叠互不相同的声源（风 / 低鸣 / 滴水 / 铃），
 * 每一层有自己的合成配方与音量，换区时旧的淡出、新的淡入。
 *
 * ## 四种层配方（`AMBIENCE_KINDS`）
 *
 * | kind | 是什么 | 合成方式 |
 * |---|---|---|
 * | `wind` | 风 | 噪声 → 带通滤波，中心频率被一条慢 LFO 扫（风声会"呼吸"） |
 * | `rumble` | 地底低鸣 | 低频振荡器 + 慢速颤音（空间在"响"） |
 * | `drip` | 滴水 | 每隔若干秒一声短促的滤波噪声脉冲（洞穴 / 雨） |
 * | `chime` | 铃 | 每隔若干秒一串正弦泛音（神殿 / 冰晶） |
 *
 * ## 为什么这张表住在 `content/`
 *
 * 与 `content/difficulty.js` / `content/semanticColors.js` 同一形状：**数值与选项名单是内容，
 * 不是逻辑**。`AudioManager` 只负责"照着这行合成一条声线"，不决定这座区该有风声还是滴水。
 * 表进注册表（`zoneAmbience` 条目），于是"加了第五种层配方却没在面板/消费者里接上"当场红。
 *
 * ## 音量的口径
 *
 * 每层的 `音量` 是**这一层自己的增益**（0~0.2），最终还要乘 `ambient` 总线那 0.12。
 * 门禁钉住两件事：① 音量在 (0, 0.2] 内 —— 0 等于"这一层不存在"（那就别登记），
 * 超过 0.2 则是"忘了乘总线"（叠起来会盖住旋律）；② 每座区**至少一层** ——
 * 一座没有环境声的区听起来像加载失败。
 */

/** 四种层配方。`AudioManager` 只认这四个名字，认不出当场抛（与 `sfx:play` 同一口径） */
export const AMBIENCE_KINDS = Object.freeze(['wind', 'rumble', 'drip', 'chime']);

/** 每层音量的上限：乘 `ambient` 总线（0.12）之后约 0.024 —— 再大就压过旋律了 */
export const AMBIENCE_MAX_GAIN = 0.2;

/**
 * 每座位面的层表。键 = 区 id（与 `ZONE_IDS` 同一套名字）。
 *
 * 副本与 Boss 各有一份**通用**层（`dungeon` / `boss`）—— 副本内部不该每一座都换一套环境声
 * （那是"每座副本一个身份"，归 `content/dungeons.js` 的 `theme`/`accent` 管），
 * 但"地下城"这个大类是该有自己的声音的。
 */
export const ZONE_AMBIENCE = Object.freeze({
  hub: Object.freeze([
    { kind: 'wind', 音量: 0.06, 中心频率: 300, 扫频: 160 },
    { kind: 'chime', 音量: 0.035, 间隔: 7.0, 音高: 587 },
  ]),
  fantasy: Object.freeze([
    { kind: 'wind', 音量: 0.09, 中心频率: 620, 扫频: 320 },
    { kind: 'chime', 音量: 0.03, 间隔: 9.0, 音高: 784 },
  ]),
  magic: Object.freeze([
    { kind: 'chime', 音量: 0.05, 间隔: 5.5, 音高: 880 },
    { kind: 'rumble', 音量: 0.05, 频率: 62 },
  ]),
  space: Object.freeze([
    { kind: 'rumble', 音量: 0.10, 频率: 44 },
    { kind: 'wind', 音量: 0.04, 中心频率: 1400, 扫频: 700 },
  ]),
  void: Object.freeze([
    { kind: 'rumble', 音量: 0.08, 频率: 38 },
    { kind: 'drip', 音量: 0.05, 间隔: 4.5, 音高: 220 },
  ]),
  abyss: Object.freeze([
    { kind: 'drip', 音量: 0.08, 间隔: 3.2, 音高: 165 },
    { kind: 'rumble', 音量: 0.09, 频率: 33 },
  ]),
  gloom: Object.freeze([
    { kind: 'wind', 音量: 0.07, 中心频率: 240, 扫频: 120 },
    { kind: 'drip', 音量: 0.05, 间隔: 5.0, 音高: 196 },
  ]),
  radiant: Object.freeze([
    { kind: 'chime', 音量: 0.055, 间隔: 4.2, 音高: 1046 },
    { kind: 'wind', 音量: 0.05, 中心频率: 900, 扫频: 400 },
  ]),
  corridor: Object.freeze([
    { kind: 'wind', 音量: 0.07, 中心频率: 420, 扫频: 200 },
  ]),
  dungeon: Object.freeze([
    { kind: 'drip', 音量: 0.06, 间隔: 4.0, 音高: 180 },
    { kind: 'rumble', 音量: 0.06, 频率: 40 },
  ]),
  wild: Object.freeze([
    { kind: 'wind', 音量: 0.07, 中心频率: 520, 扫频: 260 },
  ]),
  boss: Object.freeze([
    { kind: 'rumble', 音量: 0.12, 频率: 36 },
    { kind: 'wind', 音量: 0.05, 中心频率: 180, 扫频: 90 },
  ]),
});

/** 兜底：认不出的区 id 落这一份（"野外" —— 哪儿都不是时的中性环境声） */
export const DEFAULT_AMBIENCE_KEY = 'wild';

/**
 * 取某座位面的层表；认不出的 id 落 `DEFAULT_AMBIENCE_KEY` 那一档。
 *
 * **不抛**：区 id 是运行时来的（`zoneAt` 那条链），一个没登记的 id 不该让整个音频层炸掉 ——
 * 兜到"野外"那一档是安静的降级。与 `sfx:play` 那条"认不出就抛"不同：那条错的是**拼写**，
 * 这条错的可能是**新加的区还没登记**。
 */
export function ambienceOf(zoneKey) {
  if (typeof zoneKey !== 'string') return ZONE_AMBIENCE[DEFAULT_AMBIENCE_KEY];
  if (ZONE_AMBIENCE[zoneKey]) return ZONE_AMBIENCE[zoneKey];
  // Boss 各有专属的底噪档（`boss-shadow` / `boss-archmagus` …）：它们落在 `ZONE_DRONES` 那张表上，
  // 环境层跟着"Boss"这一档走 —— 否则打混沌领主听到的是打影界守护者的环境声。
  if (zoneKey.startsWith('boss-')) return ZONE_AMBIENCE.boss;
  return ZONE_AMBIENCE[DEFAULT_AMBIENCE_KEY];
}

/** 每种配方**各自**要的参数。缺一个不会报错 —— 只会静默用兜底值（风没有中心频率就用 400 Hz），
 *  于是"这一层听着不对"没有任何报错可查。这里把每种配方要什么写明，缺一个当场点名。 */
export const AMBIENCE_KIND_PARAMS = Object.freeze({
  wind: Object.freeze(['中心频率']),
  rumble: Object.freeze(['频率']),
  drip: Object.freeze(['间隔', '音高']),
  chime: Object.freeze(['间隔', '音高']),
});

/** 表的自检（加载期跑一次）—— 形状不对当场炸，不等到某座区切过去才没声 */
export function assertZoneAmbience(table = ZONE_AMBIENCE) {
  for (const [区, 层表] of Object.entries(table)) {
    if (!Array.isArray(层表) || 层表.length === 0) {
      throw new Error(`环境音表 ${区}：层表必须是非空数组（一座没有环境声的区听起来像加载失败）`);
    }
    for (const [i, 层] of 层表.entries()) {
      const at = `${区}[${i}]`;
      if (!AMBIENCE_KINDS.includes(层.kind)) {
        throw new Error(`环境音表 ${at}：层配方 "${层.kind}" 不在名单里（可用：${AMBIENCE_KINDS.join(' / ')}）`);
      }
      if (!(typeof 层.音量 === 'number' && Number.isFinite(层.音量) && 层.音量 > 0 && 层.音量 <= AMBIENCE_MAX_GAIN)) {
        throw new Error(
          `环境音表 ${at}：音量 ${JSON.stringify(层.音量)} 必须在 (0, ${AMBIENCE_MAX_GAIN}] 内`
          + '（0 等于这一层不存在 —— 那就别登记；超过上限是忘了乘 ambient 总线）'
        );
      }
      for (const 参数 of AMBIENCE_KIND_PARAMS[层.kind] ?? []) {
        const v = 层[参数];
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
          throw new Error(
            `环境音表 ${at}：配方 "${层.kind}" 缺参数 ${参数}（收到 ${JSON.stringify(v)}）——`
            + ' 缺了不会报错，只会静默用兜底值，那一层听着就不对却查不出原因'
          );
        }
      }
    }
  }
  return table;
}

assertZoneAmbience();
