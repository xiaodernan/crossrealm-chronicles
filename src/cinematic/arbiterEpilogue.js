import { getLanguage } from '../engine/i18n.js';
import { endingDialogKey } from '../content/objectives.js';

/**
 * 烬灯回信 · W-Z288 —— 终章抉择之后，炉火的记录者为玩家写下一封短信。
 *
 * ## 设计裁决（来自 W-288 的终局，不是顺手加一片）
 *
 * 片尾字幕此前是**完全确定的**：固定的 9 行 + 按抉择取 flavor + 按母题回望。这些是
 * 《跨界纪事》的仪式，不能被 LLM 改写——LLM 的归置只能**追加一段**，它写的题名与话
 * 自成一节，绝不改一行既有台词。
 *
 * 换取什么：玩家**这一手**的轨迹（抉择 / 通关 / 探索 / 母题点亮）真实影响
 * 片尾读到的那段话。同一个人，三次通关，三封不同的回信。
 *
 * ## 三个不变量
 *
 * 1. **确定性在协议里，不在模型里**：抉择（keep / quiet / unwritten）是选择分支的
 *    路由键（`endingDialogKey` 是全仓唯一的抉择取名入口，与 `endingDialogKey` 同钮同源）；
 *    模型只负责分支里的文学密度。
 * 2. **失败要静默**：在线服务未启用 / 熔断 / 超时 / 返回不可解析 → 整段不渲染，
 *    片尾依旧完整——绝不告诉玩家"这封信本来应该有的"。
 * 3. **不可信文本永不进 innerHTML**：模型回的 JSON 经 `JSON.parse` 后只走
 *    `textContent`，三行分别截断（title ≤ 30 / epilogue ≤ 160 / omen ≤ 60）。
 */
export const ARBITER_TEXT_LIMITS = Object.freeze({
  titleLen: 30,
  epilogueLen: 160,
  omenLen: 60,
  statsMax: 500,
});

const stripControls = (s) => [...String(s ?? '')].filter((ch) => {
  const code = ch.codePointAt(0);
  return code > 31 && code !== 127;
}).join('');

/**
 * 终局抉择路由键 —— 与 `endingDialogKey` **同钮同源**（全仓唯一的抉择取名入口，
 * 由 choice-objective.test.js 这类尺子钉住"这一族判据只在一处问"）。
 * 别自己读 `stats.decisions.has(...)`：那是第二真相，改了一头另一头不会红。
 */
export function arbiterChoiceOf(stats) {
  const key = endingDialogKey(stats);
  if (key === 'ending_dialog_text_keep') return 'keep';
  if (key === 'ending_dialog_text_quiet') return 'quiet';
  return 'unwritten';
}

/** 旅途账本摘要：紧凑 JSON，永远别超过 server 的 @Size(500) */
export function arbiterStatsSummary(stats, { echoes = 0, killsTotal = 0 } = {}) {
  const compact = {
    echoes,
    dungeons: stats?.dungeonsCleared?.size ?? 0,
    discoveries: stats?.discoveries?.size ?? 0,
    decisions: stats?.decisions?.size ?? 0,
    level: stats?.level ?? 1,
    killsTotal,
  };
  let out = JSON.stringify(compact);
  if (out.length > ARBITER_TEXT_LIMITS.statsMax) out = JSON.stringify({ echoes, dungeons: compact.dungeons, killsTotal });
  return out.slice(0, ARBITER_TEXT_LIMITS.statsMax);
}

/** 把这一档的账本收敛成 `/api/ai/arbiter` 的请求体 */
export function buildArbiterPayload(game) {
  const stats = game?.quests?.stats ?? null;
  const killsTotal = Object.values(stats?.kills ?? {}).reduce((acc, n) => acc + (Number(n) || 0), 0);
  return {
    choice: arbiterChoiceOf(stats),
    lang: getLanguage() === 'en' ? 'en' : 'zh',
    stats: arbiterStatsSummary(stats, { echoes: game?.popCulture?.unlocked?.size ?? 0, killsTotal }),
  };
}

function clamp(text, max) {
  const t2 = stripControls(text).trim();
  return t2.slice(0, max);
}

/**
 * 宽容解析模型回信：找第一个 {...} 段落 → JSON.parse → 截断到限长。
 * 模型被 prompt 要求"严格只输出 JSON"，但现实里它会带前后的客套话——这一层是真正的解析器。
 * @returns {{ title: string, epilogue: string, omen: string } | null}
 */
export function parseArbiterAnswer(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = stripControls(raw).trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    const title = clamp(obj?.title, ARBITER_TEXT_LIMITS.titleLen);
    const epilogue = clamp(obj?.epilogue, ARBITER_TEXT_LIMITS.epilogueLen);
    const omen = clamp(obj?.omen, ARBITER_TEXT_LIMITS.omenLen);
    if (!title || !epilogue) return null;
    return { title, epilogue, omen };
  } catch {
    return null;
  }
}
