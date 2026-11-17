import { getLanguage, t } from '../engine/i18n.js';
import { localTelemetry } from './LocalTelemetry.js';
import { arbiterChoiceOf, arbiterStatsSummary } from '../content/endingChoice.js';
import { sanitizeVerse } from './BossVerseSystem.js';

/**
 * 烬灯回信 · 烬火答 · W-Z292 —— 终局之后，你在炉边写下的那一行字，炉火回你一行。
 *
 * ## 裁决
 *
 * 「LLM 作为 NPC」的实验场。玩家走完终章、离开相框般的片尾之后，
 * [J] 日志里开了一页专门的信纸：
 *   提笔 → 寄出 → 炉火回一行（或不回）→ 条目落进日志，随存档走。
 *
 * ## 边界
 *
 * - **终局之后才摊开**：抉择（keep / quiet / unwritten）未进 unwritten 之前，信纸只显示锁文案；
 * - **在线服务默认关**：`onlineServices.enabled() === true` 才发出请求；否则信纸沉默；
 * - **不可信文本只进 textContent**：收信人那一行先剥控制字符 + 截 120 字；
 *   炉火那一行过 `sanitizeVerse`（剥控制字符 + 空白合并 + 72 字符上限）；
 * - **零日志写入如果失败了**：回信失败时 thread 不落盘、日志不添条目、遥测仍记一笔——玩家永远只看到「炉火没回」。
 * - **历史上限 40 封**：超出按最早顺序退掉——信纸不会长成字典。
 */
export const LS = 'crossrealm_kindle_letter_v1';

const MAX_TURNS = 40;
const MAX_INPUT = 120;

const strip = (s) => [...String(s ?? '')].filter((ch) => {
  const c = ch.codePointAt(0);
  return c > 31 && c !== 127;
}).join('').replace(/\s+/g, ' ').trim();

export const sanitizePlayerLine = (s) => strip(s).slice(0, MAX_INPUT);

export class KindleLetterSystem {
  constructor(game) {
    this.game = game;
    this.state = this._load();
  }

  _default() {
    return { turns: [] };
  }

  _load() {
    if (typeof localStorage === 'undefined') return this._default();
    try {
      const raw = JSON.parse(localStorage.getItem(LS) ?? '{}');
      return {
        ...this._default(),
        ...raw,
        turns: Array.isArray(raw?.turns) ? raw.turns.slice(-MAX_TURNS) : [],
      };
    } catch {
      return this._default();
    }
  }

  _save() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(LS, JSON.stringify(this.state));
    } catch { /* privacy mode */ }
  }

  isEligible() {
    const stats = this.game?.quests?.stats;
    if (!stats) return false;
    return arbiterChoiceOf(stats) !== 'unwritten';
  }

  isEnabled() {
    return this.game?.onlineServices?.enabled?.() === true;
  }

  snapshot() {
    return { ...this.state, eligible: this.isEligible(), enabled: this.isEnabled() };
  }

  /** 清空所有回信（按下"重写"按钮时用） */
  reset() {
    this.state = this._default();
    this._save();
  }

  async ask(rawLine, { signal } = {}) {
    if (!this.isEligible()) return { ok: false, reason: 'locked' };
    const line = sanitizePlayerLine(rawLine);
    if (!line) return { ok: false, reason: 'empty' };
    if (!this.isEnabled()) return { ok: false, reason: 'disabled' };

    const stats = this.game?.quests?.stats ?? null;
    const choice = arbiterChoiceOf(stats);
    const killsTotal = Object.values(stats?.kills ?? {}).reduce((acc, n) => acc + (Number(n) || 0), 0);
    const payload = {
      choice,
      lang: getLanguage() === 'en' ? 'en' : 'zh',
      line,
      stats: arbiterStatsSummary(stats, { echoes: this.game?.popCulture?.unlocked?.size ?? 0, killsTotal }),
    };

    let reply = '';
    try {
      // Ember Reply 先（StateGraph 分拣 + lane 编排 + 回灌护栏，W-Z316）；
      // 旧后端没有该端点时（404/503/超时/坏 JSON）回落到 kindle-letter——同一条信纸契约、向后兼容。
      let res = await this.game.onlineServices.askEmberReply?.(payload, { signal });
      if (!res?.ok || !res?.data?.reply) {
        res = await this.game.onlineServices.askKindleLetter(payload, { signal });
      }
      reply = res?.ok ? sanitizeVerse(String(res?.data?.reply ?? '')) : '';
    } catch {
      reply = '';
    }

    if (!reply) {
      try { localTelemetry.record('kindle_letter_exchange', { choice, ok: false }); } catch { /* absent */ }
      return { ok: false, reason: 'unavailable' };
    }

    const turn = { ts: Date.now(), line, reply };
    this.state = {
      ...this.state,
      turns: [...this.state.turns, turn].slice(-MAX_TURNS),
    };
    this._save();
    try { localTelemetry.record('kindle_letter_exchange', { choice, ok: true }); } catch { /* absent */ }
    try {
      this.game.storyJournal?.addSilent?.({
        id: `kindle-letter-${Date.now()}-${this.state.turns.length}`,
        category: 'ending',
        title: t('kindle_letter_turn_title_fmt', { n: this.state.turns.length }),
        text: `${line}\n—— ${reply}`,
        chapter: this.game?.quests?.chapter ?? 5,
      });
    } catch { /* journal absent — the thread is enough */ }
    return { ok: true, turn };
  }
}
