/**
 * 在线排行榜条目格式化（W-X7，纯函数）
 *
 * 面板只管 DOM/请求，格式化算式只在这里有一份：
 * ranking 展示行 = `#名次 · runner · bossId · Ch章 · mm:ss`（缺哪格少哪格）。
 * 服务端数据当不可信：所有字符串原样透传给 textContent（**绝不**拼 innerHTML）。
 */

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;
const isFiniteNumber = (v) => Number.isFinite(v);

/** 毫秒 → `mm:ss`（≥1 小时 → `h:mm:ss`）。非有限数 → '' */
export function formatClearTimeMs(ms) {
  if (!isFiniteNumber(ms)) return '';
  const total = Math.max(0, Math.floor(ms / 1000));
  const secs = total % 60;
  const mins = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mins}:${ss}`;
}

/**
 * 一条排行榜条目 → 展示文本。
 * @param {{runner?: unknown, bossId?: unknown, clearTimeMs?: unknown, chapter?: unknown}} entry
 * @param {number} rank
 */
export function formatLeaderboardEntry(entry, rank) {
  const e = entry ?? {};
  const bits = [isNonEmptyString(e.runner) ? e.runner : '—'];
  if (isNonEmptyString(e.bossId)) bits.push(e.bossId);
  if (isFiniteNumber(e.chapter)) bits.push(`Ch${e.chapter}`);
  const t = formatClearTimeMs(e.clearTimeMs);
  if (t) bits.push(t);
  return `#${rank} · ${bits.join(' · ')}`;
}
