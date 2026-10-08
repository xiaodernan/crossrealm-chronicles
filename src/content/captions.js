/**
 * 字幕线索名册（W-D6 切片8）。
 *
 * ## 这一片要解决什么
 * 本仓的音频**全是合成音，没有一句语音**。所以"字幕"在这里不是给台词配文字，
 * 而是给**只靠声音传递的信息**配一个视觉出口 —— 对听障与重听玩家，那些声音等于不存在。
 *
 * ## 普查结论（动手前逐个调用点看过，别凭直觉加格子）
 * 直觉上"有声音就该有字幕"，真数一遍却发现**大部分声音旁边已经有字了**：
 * `roomClear` 旁白就是 `dialog.toast('房间已清空 — 门已打开')`，`bossPhase` 有 `showBanner()`，
 * `loreDiscover` 直接开对话，`levelUp` / `wispAbsorb` / `voidGravityFlip` 各有自己的 toast。
 * 给它们再配一条字幕，等于把屏幕上刚说过的话再说一遍 —— 那不是可访问性，是噪音。
 *
 * 真正"只有声音"的只有三处（就是下面这三格）：
 * - `gearDrop`：稀有度只藏在**音高**与**光柱的颜色/尺度**里，两条都是"不看就不知道"的通道；
 * - `pickup`：开箱与拾取的那一刻，屏幕上一个字都不多；
 * - `execution`：处决只有音效与特效，没有一句确认。
 *
 * 所以这张表今天是三条，而且**刻意停在三条**。机制是通用的（`engine/cues.js` 的
 * `emitCue` + `game-cue` 事件 + `ui/Captions.js` 的字幕条）：往后发现新的"只有声音"的
 * 线索，在这里加一格、把调用点的 `audio.x()` 换成 `emitCue('x')` 就完了，不用再动管道。
 *
 * ## 为什么不是每个声音都配字幕
 * 判据是"这个声音是否传递了**屏幕上没有**的信息"。`playerHurt` 是反例：血条每帧都在跳，
 * 给它配字幕会把字幕条刷成噪底，反而淹掉真正重要的那几条。字幕条是稀缺的注意力资源，
 * 不是声音日志。
 */

/**
 * 字幕的两档。只分两档，不搞"每条自定义时长"：时长是表现参数，多一个参数就多一处能写错，
 * 而两档已经覆盖"瞥一眼就行"与"错过就亏了"。
 */
export const CUE_KINDS = Object.freeze({
  /** 瞥一眼就够的信息（掉落、拾取） */
  info: Object.freeze({ ttl: 3.2 }),
  /** 错过就亏了的确认（处决）—— 停得久一些，也画得重一些 */
  critical: Object.freeze({ ttl: 5 }),
});

/**
 * 线索名册：`cue id → { kind, key, sound, soundArg? }`。
 *
 * - `kind`：进 `CUE_KINDS` 哪一档（决定停多久、画多重）。
 * - `key`：`content/strings.*.js` 里的文案键。文案**不在这里现编** ——
 *   现编的那一份切语言时不会跟着变（B47 那一族：显示与行为分家）。
 * - `sound`：`AudioManager` 上那个方法名。**"这个线索发什么声音"的唯一真源就在这一格**，
 *   调用点不再直接摸 `audio.x()`（理由见 `engine/cues.js` 的文件头）。
 * - `soundArg`：可选。这个音效要一个参数时，参数从 `emitCue` 的 `data` 里哪一格取。
 *   只有 `gearDrop` 用得到（它按稀有度序定音高）。没有它就是零参调用。
 *
 * 冻结：加一格是显式动作。表外名字由 `cueOf()` 当场抛错 —— 与 `SFX_NAMES` /
 * `enemyRosterOf` / `playSfx` 同一条口径（B71：抄错名字不许静默）。
 */
export const CUE_CATALOG = Object.freeze({
  gearDrop: Object.freeze({
    kind: 'info', key: 'caption_gear_drop', sound: 'gearDrop', soundArg: 'rank',
  }),
  pickup: Object.freeze({ kind: 'info', key: 'caption_pickup', sound: 'pickup' }),
  execution: Object.freeze({ kind: 'critical', key: 'caption_execution', sound: 'executionSting' }),
});

/** 表里的线索 id，按名册顺序（测试与门禁都读它，不另抄一份） */
export const CUE_IDS = Object.freeze(Object.keys(CUE_CATALOG));

/**
 * 取一格线索。认不出**当场抛**，不返回 null、不静默跳过。
 *
 * 调用点写错一个字母的症状必须是"启动就炸"，而不是"那条字幕永远不出现" ——
 * 后者正是 B71 那一族：稳定身份靠人肉复制，复制错了不报错。
 */
export function cueOf(id) {
  const cue = CUE_CATALOG[id];
  if (!cue) {
    throw new Error(
      `未知的字幕线索 "${String(id)}"：CUE_CATALOG 里没有这一格`
      + `（现有 ${CUE_IDS.length} 条：${CUE_IDS.join('、')}）。`
      + '新线索要先在 content/captions.js 登记（kind + 文案键 + 音效名），再到调用点 emitCue。',
    );
  }
  return cue;
}

/** 这个线索发什么声音。表外名字同样当场抛（与 `cueOf` 同一条口径） */
export const cueSoundOf = (id) => cueOf(id).sound;

/** 这个线索的文案键。表外名字同样当场抛 */
export const cueTextKeyOf = (id) => cueOf(id).key;

/** 这个线索停多久（秒）。表外名字同样当场抛 */
export function cueTtlOf(id) {
  const cue = cueOf(id);
  const kind = CUE_KINDS[cue.kind];
  if (!kind) {
    throw new Error(`线索 "${id}" 的 kind "${String(cue.kind)}" 不在 CUE_KINDS 里`);
  }
  return kind.ttl;
}
