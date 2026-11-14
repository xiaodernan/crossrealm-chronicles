/**
 * W-Z58：出场页「此刻 · 炉边传闻」——报讯台直达旅程之门
 *
 * 只在在线启用时工作（离线 = 零网络，与 OnlineServices 整体契约一致）：
 * boot 结束、出场页 unhide 之后拉一次最近的世界报讯，挑最新一条上墙。
 * 纯文本、textContent、无定时器、不做旋转——门上只放一行真话。
 */
import { onlineServices } from './OnlineServices.js';

export const START_TICKER_LIMIT = 3;

/** 挑出场页该上墙的那一条：优先 world（真实世界事件），否则首条；没有则空 */
export function pickTickerItem(items) {
  if (!Array.isArray(items)) return null;
  const world = items.find((n) => n && n.kind === 'world');
  const chosen = world ?? items[0];
  return chosen && typeof chosen.title === 'string' && chosen.title.length > 0 ? chosen : null;
}

export function revealStartTicker(doc = document, fetcher) {
  const el = doc.getElementById('start-ticker');
  if (!el) return false;
  // 未启用在线 → 不建 DOM 之外的任何网络活动
  if (typeof onlineServices.enabled === 'function' && !onlineServices.enabled()) return false;
  const fetchRecents = fetcher ?? ((limit) => onlineServices.fetchNotifyRecents(limit));
  fetchRecents(START_TICKER_LIMIT).then((data) => {
    const item = pickTickerItem(data?.items);
    if (!item) return; // 世界暂时安静 —— 出场页不说谎、不编凑
    const text = doc.getElementById('start-ticker-text');
    if (text) text.textContent = item.title; // textContent only —— 永不 innerHTML
    el.classList.remove('hidden');
  }).catch(() => { /* 报讯台断了就断了 —— 出场页保持安静 */ });
  return true;
}
