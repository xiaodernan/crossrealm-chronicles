/**
 * 毫秒 → `h:mm:ss` / `m:ss`（boss 战与个人最速的唯一格式出口）。
 *
 * 抽到这里的原因：`LegendsJournalTab`（传说碑）与 `EndCreditsDirector`（结局结算）
 * 都要用同一个时钟格式，而两处各写一份 m:ss 迟早会对不上 ——
 * `clockText` 是秒级（`m:ss`，没有小时位）；这个要毫秒入、带小时位兜底。
 */
export function fmtClock(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}
