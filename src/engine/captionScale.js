/**
 * 字幕字号三档（W-D6 切片67）—— 字幕开关之后的第二格：**看得见**还不够，得**看得清**。
 *
 * ## 为什么要这一格
 * `settings_captions` 只回答"要不要把声音线索写到屏幕上"。可字幕写多大，一直是
 * `style.css` 里的两个固定值（正文 0.85rem、关键线索 0.95rem）。视力较弱、坐得远、
 * 或者在电视上玩的玩家，开了字幕仍然读不清；反过来，觉得字幕挡画面的玩家也没有
 * "小一点"的出口。这一格把字号从样式常量升成玩家设置。
 *
 * ## 三档的数值
 * - `small` = **0.85**：比出厂小一档，给"字幕挡视野"的玩家；
 * - `medium` = **1**：出厂，逐像素与"没有这一格"相同（机制片不夹带视觉变更）；
 * - `large` = **1.3**：正文 0.85rem → 约 1.11rem，关键线索 0.95rem → 约 1.24rem。
 *
 * 倍率乘在 `.caption` / `.caption-critical` 各自的基准字号上，而不是改成一个绝对值 ——
 * 关键线索本来就比正文大一档，这一格只放大整体，不该把两档的层次抹平。
 *
 * ## 脏值口径
 * 存储是玩家可写的：认不出的档回落 `medium`、**不抛**（与 `normalizeShakeStrength`
 * 同一条先例）。数值不做连续插值：这是一格"选档"，不是滑杆。
 */
export const CAPTION_SCALES = Object.freeze({ small: 0.85, medium: 1, large: 1.3 });

/** 档位名册，按面板里的显示顺序 */
export const CAPTION_SCALE_IDS = Object.freeze(Object.keys(CAPTION_SCALES));

export const DEFAULT_CAPTION_SCALE = 'medium';

/** 脏值回落出厂，不抛 */
export function normalizeCaptionScale(value) {
  return Object.hasOwn(CAPTION_SCALES, value) ? value : DEFAULT_CAPTION_SCALE;
}

/** 档位 → 字号倍率。认不出的档按出厂算 */
export const captionScaleOf = (value) => CAPTION_SCALES[normalizeCaptionScale(value)];

/**
 * 面板用的选项：只给档位 id。文案键由面板在 `t()` 的现场拼
 * （`settings_caption_${id}`），与震屏强度同一纪律 —— 拼键在 `t()` 现场才能被
 * 扫描器量到。
 */
export const captionScaleOptions = () => [...CAPTION_SCALE_IDS];
