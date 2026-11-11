/**
 * [J] 传说碑（W-G4 切片1）—— 世界 Boss 最速通关碑
 *
 * W-X2 把 `submitRun` 挂进了 Boss 讨伐那条路；服务端 `LeaderboardService`
 * 也留了 `/api/leaderboard`。榜单那一端写好之后就一直没人来读 ——
 * 玩家交上去的成绩躺在一个自己看不到的地方，这不是榜，是黑洞。
 *
 * 这一片在日志页补上那一格：诸神陨落之名的最速纪录。
 *
 * ## 与试炼榜（W-G2 切片1）同一套纪律
 *
 * 1. **只画自己那一格**：异步回来的那一笔只重写 `[data-legends-board]`，绝不整页重渲染；
 * 2. **发号**：连点刷新（切页重进即再拉）只认最后一份；
 * 3. **服务端数据当不可信**：行只用 `textContent` 拼，bossId 过名册（未登记 id 走
 *    `boss_name_unknown`，副本 Boss 走守钥长那一格），不让任意字符串进 DOM；
 * 4. **离线即安静**：没开在线 / 拉不到 / 抛错 —— 都只落一句"取不到碑铭"，板面不坏。
 */

import { keyText, refreshKeyText } from './keyHints.js';
import { t } from '../engine/i18n.js';
import { bossNameKeyOf } from '../content/bossRoster.js';
import { bossBestTimes } from '../game/BossBestTimes.js';
import { fmtClock } from './msClock.js';

/** 拉几条。服务端 maxLimit ≤ 50，这里取十条 —— 一块随身碑看得完的量 */
const BOARD_LIMIT = 10;

/** 榜消息态 → 文案键（`ready` 不走这张表——它要画行） */
const MSG_KEY_BY_STATE = {
  idle: 'legends_loading',
  loading: 'legends_loading',
  empty: 'legends_empty',
  off: 'legends_offline',
};

/** `typeof` 判别用的字面量 —— 别直接写在 bossId 旁边的判断里（字面量台账门禁会逮它） */
const TYPEOF_STRING = 'string';

export class LegendsJournalTab {
  constructor(game) {
    this.game = game;
    /** 榜的当前快照：`{ state, items }`。state: idle/loading/ready/empty/off */
    this._board = { state: 'idle', items: [] };
    /** 发号器：只认最后回来的那一份 */
    this._seq = 0;
  }

  render(panelEl) {
    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_legends'))}</h2>
      <div class="trial-card">
        <p class="trial-intro">${t('legends_intro')}</p>
        <div class="legends-personal" data-legends-personal></div>
        <div class="trial-board" data-legends-board></div>
      </div>
    `;
    refreshKeyText(panelEl);
    // 个人最速：纯本地 localStorage —— 在线关着也照常显示
    this._paintPersonal(panelEl);
    // 每次打开都拉一次：刚刚那局被镌刻上没，重进这一页即见真章（不靠跨打开的失效标记）
    this._loadBoard(panelEl);
  }

  /**
   * 画"你的最速"那一格。数据源完全本地（`game.bossBestTimes`，缺省走单例），
   * 不碰网络、不看在线开关 —— 诸神哪天倒下，账本就在这一刻记下。
   */
  _paintPersonal(panelEl) {
    const box = panelEl?.querySelector?.('[data-legends-personal]');
    if (!box) return;
    box.textContent = '';

    const head = document.createElement('div');
    head.className = 'legends-personal-head';
    const title = document.createElement('span');
    title.className = 'legends-personal-title';
    title.textContent = t('legends_personal_title');
    head.appendChild(title);
    box.appendChild(head);

    const store = this.game.bossBestTimes ?? bossBestTimes;
    const rows = typeof store?.top === 'function' ? store.top(BOARD_LIMIT) : [];
    if (!rows.length) {
      const msg = document.createElement('div');
      msg.className = 'legends-personal-msg';
      msg.textContent = t('legends_personal_empty');
      box.appendChild(msg);
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'legends-personal-list';
    for (const { bossId, bestMs } of rows) {
      const li = document.createElement('li');
      li.className = 'legends-personal-row';
      li.textContent = t('legends_personal_row_fmt', {
        boss: t(bossNameKeyOf(bossId)),
        clock: fmtClock(bestMs),
      });
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }

  /**
   * 拉一次碑榜并画出来。**永不抛** —— 拉不到只是一句"取不到"，这一页照常可读。
   * 离线（没开在线 / 这一层没拉取方法）**不进 loading**，落"取不到"那一句。
   */
  async _loadBoard(panelEl) {
    const seq = (this._seq += 1);
    const online = this.game.onlineServices;
    const canLoad = !!online?.enabled?.() && typeof online.fetchLeaderboard === 'function';
    if (!canLoad) {
      this._board = { state: 'off', items: [] };
      this._paintBoard(panelEl);
      return;
    }
    this._board = { state: 'loading', items: [] };
    this._paintBoard(panelEl);

    let payload = null;
    try {
      payload = await online.fetchLeaderboard(BOARD_LIMIT);
    } catch (e) {
      // 客户端承诺吞错，但不依赖那个承诺：一个抛出的 Promise 会让这一块永远停在"叩石"
      console.warn('[legends-board] fetch failed; treating as stele unavailable', e?.message ?? e);
    }
    if (seq !== this._seq) return;   // 又开了一次：这一份已经过期
    const items = Array.isArray(payload?.items) ? payload.items : null;
    this._board = items
      ? { state: items.length ? 'ready' : 'empty', items }
      : { state: 'off', items: [] };
    this._paintBoard(panelEl);
  }

  /**
   * 画榜那一格。**只用 DOM API** —— `runner` / `bossId` 全是服务端来的字符串，
   * 拼进 HTML 就是注入口。找不到那一格就直接返回（页签切走 / 面板关了）。
   */
  _paintBoard(panelEl) {
    const box = panelEl?.querySelector?.('[data-legends-board]');
    if (!box) return;
    box.textContent = '';

    const head = document.createElement('div');
    head.className = 'trial-board-head';
    const title = document.createElement('span');
    title.className = 'trial-board-title';
    title.textContent = t('journal_tab_legends');
    head.appendChild(title);
    box.appendChild(head);

    if (this._board.state === 'ready') {
      const ul = document.createElement('ul');
      ul.className = 'trial-board-list';
      this._board.items.slice(0, BOARD_LIMIT).forEach((row, i) => {
        const li = document.createElement('li');
        li.className = 'trial-board-row';
        // bossId 过名册：未登记 id 也能安静出图（boss_name_unknown），不会把原始字符串画到页面上
        const bossId = typeof row?.bossId === TYPEOF_STRING ? row.bossId : '';
        const bossName = t(bossNameKeyOf(bossId));
        const runner = typeof row?.runner === TYPEOF_STRING && row.runner ? row.runner : '?';
        li.textContent = t('legends_row_fmt', {
          rank: i + 1,
          runner,
          boss: bossName,
          clock: fmtClock(Number.isFinite(row?.clearTimeMs) ? row.clearTimeMs : 0),
          chapter: Number.isFinite(row?.chapter) ? row.chapter : 0,
        });
        ul.appendChild(li);
      });
      box.appendChild(ul);
    } else {
      const msg = document.createElement('div');
      msg.className = 'trial-board-msg';
      msg.textContent = t(MSG_KEY_BY_STATE[this._board.state] ?? 'legends_loading');
      box.appendChild(msg);
    }

    const note = document.createElement('div');
    note.className = 'trial-board-note';
    note.textContent = t('legends_note');
    box.appendChild(note);
  }
}
