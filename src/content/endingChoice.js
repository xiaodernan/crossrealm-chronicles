import { endingDialogKey } from './objectives.js';

/**
 * 终局判定的真源（全仓唯一的抉择取名入口在 objectives.js，这一层以它为锚）。
 *
 * 上提到 content/ 层：cinematic（chunk-ui）与 game（chunk-core）都要读它——
 * 双方都不得 import 对方（B37：chunk-core 是叶子，谁也不许读 chunk-ui）。
 * 本文件零外部依赖（只从同层读 objectives.js），两层谁读都合 ./content 自洽规约。
 */

export const ARBITER_TEXT_LIMITS = Object.freeze({
  titleLen: 30,
  epilogueLen: 160,
  omenLen: 60,
  statsMax: 500,
});

/**
 * 终局抉择路由键 —— 与 `endingDialogKey` 同钮同源。
 * 改别处不算数，尺度在这里有且只有这一份。
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
