import { on, offAll } from '../engine/EventBus.js';
import { t, getLanguage } from '../engine/i18n.js';
import { bossNameKeyOf } from '../content/bossRoster.js';
import { ZONE_NAMES } from '../content/ZoneIdentity.js';
import { localTelemetry } from './LocalTelemetry.js';

/**
 * 余火回响 · W-Z289 —— Boss 倒下的那一刻，炉火的记录者为还活着的人说一句。
 *
 * ## 裁决
 *
 * 玩家看完这段没有"金光闪过就过去了"——HUD 上炸出一句炉火自己在自言自语的话。
 * 不是台词（没有人在说话），不是教程，不是伤害数字：是世界在记账的那一声。
 *
 * ## 边界
 *
 * - **在线服务默认关**：不发任何请求；即使坏网络也吞掉——玩家永远不会因为这一句卡顿或崩溃。
 * - **确定性只住在协议里**：谁倒下、第几章、第几次击杀是真数据；大模型只收束这一瞬的文学密度。
 * - **不可信文本不进 innerHTML**：回句走 `sanitizeVerse` → `textContent`（HUD toast），
 *   控制字符净化、空白合并、max 72 字符截断。
 */

const BG = 'game/BossVerseSystem';
const MAX_CHARS = 72;

/** 控制字符净化 + 空白合并 + 截断——回句必须是"一行可以落字幕的话" */
export function sanitizeVerse(raw) {
  const cleaned = [...String(raw ?? '')].filter((ch) => {
    const code = ch.codePointAt(0);
    return code > 31 && code !== 127;
  }).join('').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, MAX_CHARS);
}

/** 把击杀现场收敛成 `/api/ai/boss-verse` 的请求体（Java 侧还会再净化 + 限长） */
export function bossVersePayload(game, bossId) {
  const stats = game?.quests?.stats;
  const id = String(bossId ?? '').slice(0, 64);
  const nameKey = bossNameKeyOf(bossId);
  const name = nameKey ? String(t(nameKey) ?? id).slice(0, 80) : id;
  // 地带：Boss 死在哪座区是**已知事实**，此前恒传空串、服务端只能写「（未登记）」。
  // 走 ZONE_NAMES → t() 得到人类可读的区域名（灰白森林 / 幽暗林地…），随语言切换；
  // 未知区或取不到时留空——服务端会诚实写「未登记」，不编造。
  const zoneKey = ZONE_NAMES[game?.world?.zoneId];
  const zone = zoneKey ? String(t(zoneKey) ?? '').slice(0, 60) : '';
  return {
    bossId: id,
    name,
    chapter: String(game?.quests?.chapter ?? 1),
    kills: String(game?.stats?.bossDefeated?.[bossId] ?? 1),
    level: String(stats?.level ?? 1),
    zone,
    lang: getLanguage() === 'en' ? 'en' : 'zh',
  };
}

export class BossVerseSystem {
  /** 本文件的监听挂在同一所有权下，`dispose()` 一次结清（W-A1 同一套纪律） */
  dispose() {
    offAll(BG);
  }

  constructor(game) {
    this.game = game;
    this._bg = BG;
    on('boss-defeated', (e) => { void this._onBossDefeated(e); }, BG);
  }

  async _onBossDefeated(event) {
    const bossId = String(event?.detail?.bossId ?? '');
    if (!bossId) return;
    const online = this.game?.onlineServices;
    if (!online?.enabled?.() || typeof online.askBossVerse !== 'function') return;
    const payload = bossVersePayload(this.game, bossId);
    let line = '';
    try {
      const res = await online.askBossVerse(payload);
      line = res?.ok ? sanitizeVerse(res?.data?.verse) : '';
    } catch {
      line = '';
    }
    if (!line) {
      try { localTelemetry.record('boss_verse', { bossId, ok: false }); } catch { /* absent */ }
      return;
    }
    this.game.dialog?.toast?.(line, 6000);
    try { localTelemetry.record('boss_verse', { bossId, ok: true }); } catch { /* absent */ }
    // W-Z291：余火回响落进 [J] 日志——LLM 亲笔写下的这一句，真成为日志里的一款条目
    try {
      this.game.storyJournal?.addSilent?.({
        id: `boss-verse-${bossId}-${Date.now()}`,
        category: 'boss',
        title: t('boss_verse_journal_title_fmt', { name: payload.name }),
        text: line,
        chapter: Number(payload.chapter) || 1,
      });
    } catch { /* journal absent — the toast is enough */ }
  }
}
