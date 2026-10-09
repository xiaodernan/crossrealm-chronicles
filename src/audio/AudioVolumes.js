/**
 * 音量的唯一真源（W-C7 切片3，B103）。
 *
 * 这一份负责"玩家说的音量"这两个字到底是多少，全仓只有这里写得出数：
 * - `SettingsManager` 的出厂两格从这里取（改前它手抄 0.5，而 `AudioManager` 的解锁回调里
 *   手抄 0.55 —— 同一个量两处定义，已经漂了 0.05，见下面"迁移口径"）；
 * - `AudioManager` 的增益节点从 `normalizeVolume` 之后唯一落笔，解锁那一刻落的是**当时那份档**，
 *   不再是自己的一套字面量（改前存了 0.9 的玩家第一次点击后听到的仍是 0.35）。
 *
 * 与 `engine/aaPolicy.js`、`engine/ssaoSettings.js` 同一条骨架：名册 + `normalize` + 唯一落笔口，
 * 存储里的脏值回落出厂而不是抛 —— localStorage 是玩家可写的，一行手改不该把开机炸了。
 *
 * **迁移口径（如实）**：出厂 sfx 从 0.55 改成 0.5。取的是面板那一份而不是喇叭那一份，
 * 理由不是"数更小更安全"，而是**玩家看得见的那一格就是 0.5**：面板回显读 `settings.get()`，
 * 而实际发声读 `_initOnGesture` 里的字面量，两处从来不同源。留 0.55 等于把"显示 50%、
 * 实听 55%"这条错账固化成"官方数值"。代价：全新存档的音效相对以前响 -9% 增益（一次可听
 * 出来的变小），而它换来的是"面板说的数就是真数"。
 */

/** 音量档的定义域：滑杆量程就是 [0,1]，越界钳住而不是拒收（见 `normalizeVolume`） */
export const VOLUME_BOUNDS = Object.freeze({ min: 0, max: 1 });

/**
 * 两条玩家可调的总线（`master` 之后还有 ambient/bgm/combat/bleed 那四条，但它们是
 * 内部混音比、不归玩家调，出厂数仍长在 `AudioManager` 里 —— 那一份的账见 §9 尾巴）。
 */
export const VOLUME_DEFAULTS = Object.freeze({ master: 0.35, sfx: 0.5 });

/**
 * 把一格可能来自存储/网络的脏值收成能安全写进 `AudioParam.value` 的数。
 *
 * 三种病分开治，因为它们该给的答案不同：
 * - **不是数**（`null`/`undefined`/`NaN`/`Infinity`/`'abc'`）→ 回落出厂。这一格根本表达不了
 *   "想要多响"，猜一个数不如用那份有出处的出厂值。
 * - **越界的数**（5、−1）→ 钳进 `[0,1]`。它表达了意图（"要最大/最小"），拒收反而会让
 *   玩家以为设置坏了。
 * - **数字字符串**（`'0.4'`）→ 按 `Number()` 收（Web Audio 的 `float` 转换就是这么做的），
 *   因为存进 localStorage 的数读回来本来就是字符串。
 *
 * 绝不抛：`AudioParam.value` 收到非有限值在 Chrome 是 `TypeError`，而这条路径的入口
 * （设置面板、开机、读档）都不该被一行手改的存档炸断。
 */
export function normalizeVolume(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(VOLUME_BOUNDS.max, Math.max(VOLUME_BOUNDS.min, n));
}

/** 落笔前的自检：名册自己得在定义域里，否则 `normalizeVolume` 的"回落"就回落到一个坏值 */
export function assertVolumeRoster(table = VOLUME_DEFAULTS) {
  for (const [key, value] of Object.entries(table)) {
    if (!Number.isFinite(value) || value < VOLUME_BOUNDS.min || value > VOLUME_BOUNDS.max) {
      throw new Error(`音量出厂值 ${key}=${String(value)} 不在 [${VOLUME_BOUNDS.min}, ${VOLUME_BOUNDS.max}] 里`);
    }
  }
  return table;
}

assertVolumeRoster();
