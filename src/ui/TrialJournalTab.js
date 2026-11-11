/**
 * [J] 试炼 Tab（W-F3 切片1，切片3 起显示刷怪实况，W-G2 切片1 起带榜）。
 *
 * ## 这一页要回答的五个问题
 *
 * ① 现在什么状态（未开始 / 进行中 / 通关 / 结束）；
 * ② 本局**真的生效**的是哪几条词缀、各改了什么（数值在这里第一次露出来 ——
 *    赛季页刻意不写数值，因为那是"承诺"；这里写，因为它是"正在发生"）；
 * ③ 本层刷了几只、场上还剩几只（切片3：怪是试炼自己刷的，玩家要知道该往哪看）；
 * ④ 打完五层还是没打完，为什么结束；
 * ⑤ 别人打到哪儿了（W-G2 切片1：`/api/trials/leaderboard`）。
 *
 * ## 为什么把"只有试炼刷的才算"写在页面上
 *
 * 这是一次**口径收窄**（切片1/2 是"任何击杀都算"）。收窄不写出来，玩家会按老规矩
 * 去世界里拉一群怪来打，然后发现计数不动 —— 那不是难度，那是没说清规则。
 *
 * ## 读数为什么不走秒，榜却要异步
 *
 * 上面那些读数是**打开时算一次**的快照（与赛季页同一口径）。要让它走秒得挂一个定时器，
 * 而本仓的纪律是游戏逻辑计时不许自建定时器（B39/B43）。真正的倒计时在 HUD 上
 * （`trial-*` 事件驱动），这一页负责的是"规则与账"。
 *
 * 榜是这一页**唯一的异步内容**，而日志页其余部分都是同步渲染的快照。三条纪律把它关住：
 * 1. **只画自己那一格**：异步回来的那一笔只重写 `[data-trial-board]` 的内容，
 *    绝不 `render(panelEl)` —— 后者会把玩家切走之后另一个页签的内容整片盖掉；
 * 2. **找不到那一格就不画**：`querySelector` 取不到 = 页签已经切走或面板关了，
 *    那时只更新缓存、不碰 DOM；
 * 3. **发号**：连点两次范围按钮就发两个请求，回来的顺序不一定对 —— 只认最后一个号。
 */

import { keyText, refreshKeyText } from './keyHints.js';
import { t } from '../engine/i18n.js';
import { modifierOf, seasonOf } from '../content/seasons.js';
import { TRIAL_LAYERS } from '../content/trial.js';
import { clockText } from './HUD.js';

/** 状态 → 文案键。**不用模板串拼键名** —— 拼出来的键没有任何静态门禁看得见
 *  （`i18n-dynamic-key-coverage` 只能靠人肉补名单），而这三行本来就该显式。 */
const STATE_KEY = {
  idle: 'trial_state_idle',
  running: 'trial_state_running',
  finished: 'trial_state_finished',
  failed: 'trial_state_failed',
};

/** 结束原因 → 文案键（同上） */
const REASON_KEY = {
  timeout: 'trial_reason_timeout',
  death: 'trial_reason_death',
  abandon: 'trial_reason_abandon',
};

/** 榜的空态 / 载入 / 取不到 → 文案键。`ready` 不走这张表（它要画行） */
const BOARD_MSG_KEY = {
  idle: 'trial_board_loading',
  loading: 'trial_board_loading',
  empty: 'trial_board_empty',
  off: 'trial_board_offline',
};

/** 拉几条。服务端 `max-limit` 是 50，这里只要前十条 —— 一块随身页面看得完的量 */
const BOARD_LIMIT = 10;

/** 乘子显示成两位小数，整数值不写 `.00`（×1.15 / ×1 / ×1.60 → ×1.6，玩家读得舒服） */
function fmtMul(v) {
  if (!Number.isFinite(v)) return '1';
  return String(Math.round(v * 100) / 100);
}

export class TrialJournalTab {
  constructor(game) {
    this.game = game;
    /** 榜的当前快照：`{ key, state, items }`。`key` = 范围 + 赛季，用来判断"这一份还算不算数" */
    this._board = { key: '', state: 'idle', items: [] };
    /** 看哪一张：`season`（本赛季）/ `all`（跨季总榜）。缺赛季时强制 `all` */
    this._scope = 'season';
    /** 发号器：连点两次范围按钮时，只认最后回来的那一份 */
    this._seq = 0;
  }

  /** 当前赛季 id；没有赛季系统时是空串（榜退化成"跨季总榜"） */
  _seasonId() {
    return this.game.seasons?.getState?.()?.id ?? '';
  }

  /** 实际生效的范围：没有赛季 id 时 `season` 无从谈起，一律按总榜看 */
  _scopeInEffect() {
    return this._seasonId() ? this._scope : 'all';
  }

  render(panelEl) {
    const trial = this.game.trial;
    const state = trial?.getState?.();
    if (!state) {
      panelEl.innerHTML = `
        <h2>${keyText(t('journal_tab_trial'))}</h2>
        <p class="trial-empty">${t('trial_unavailable')}</p>
      `;
      refreshKeyText(panelEl);
      return;
    }

    const running = state.state === 'running';
    const affixRows = state.affixIds.length
      ? state.affixIds.map((id) => {
        const row = modifierOf(id);
        // 词缀名与一句话复用赛季页那两把键（同一句话两处看，不新开第三把）
        return `<li class="trial-affix"><span class="trial-affix-name">${row ? t(row.label) : id}</span></li>`;
      }).join('')
      : `<li class="trial-affix is-none">${t('trial_affix_none')}</li>`;

    /* 生效规则逐条列：**只列真的不为零的那几条** —— 一串"时限 +0 秒 / 配额 +0 只"
     * 会让玩家以为页面在敷衍他。纯净试炼就整块不出现。 */
    const effectRows = [];
    if (state.active.timeDelta) effectRows.push(t('trial_effect_time_fmt', { n: state.active.timeDelta }));
    if (state.active.quotaDelta) effectRows.push(t('trial_effect_quota_fmt', { n: state.active.quotaDelta }));
    if (state.active.burnDps) effectRows.push(t('trial_effect_burn_fmt', { n: state.active.burnDps }));
    if (state.active.fogMul !== 1) effectRows.push(t('trial_effect_fog_fmt', { n: fmtMul(state.active.fogMul) }));

    const effectLine = running && effectRows.length ? `
        <div class="trial-effect">
          <div class="trial-effect-label">${t('trial_effect_header')}</div>
          <ul class="trial-effect-list">${effectRows.map((row) => `<li>${row}</li>`).join('')}</ul>
          <div class="trial-spawn">${t('trial_spawn_live_fmt', {
    hp: fmtMul(state.spawnScale?.hp), damage: fmtMul(state.spawnScale?.damage), speed: fmtMul(state.spawnScale?.speed),
  })}</div>
          <div class="trial-wave">${state.spawnerLive
    ? t('trial_wave_fmt', {
      spawned: state.spawnedThisLayer, quota: state.quota, alive: state.aliveCount,
    })
    : t('trial_wave_off')}</div>
          <div class="trial-pending">${t('trial_wave_note')}</div>
        </div>` : '';

    const reason = state.lastReason ? t(REASON_KEY[state.lastReason]) : '';
    const layerRow = (row) => `<li class="trial-layer">
        <span class="trial-layer-no">${t('trial_layer_no_fmt', { n: row.layer })}</span>
        <span class="trial-layer-meta">${t('trial_layer_meta_fmt', { s: row.seconds, n: row.quota })}</span>
      </li>`;

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_trial'))}</h2>
      <div class="trial-card">
        <div class="trial-state trial-state-${state.state}">${t(STATE_KEY[state.state])}</div>
        <p class="trial-intro">${t('trial_intro')}</p>
        <div class="trial-line">
          ${t('trial_layer_fmt', { layer: running ? state.layer : state.layersCleared, max: state.maxLayers })}
          ${running ? ` · ${t('trial_kills_fmt', { kills: state.kills, quota: state.quota })}` : ''}
          ${running ? ` · ${t('trial_seconds_fmt', { s: state.secondsLeft })}` : ''}
        </div>
        <div class="trial-line">${t('trial_best_fmt', { score: state.best.score, layer: state.best.layersCleared })}</div>
        ${reason ? `<div class="trial-reason">${reason}</div>` : ''}
        <div class="trial-actions">
          <button type="button" class="trial-btn" data-trial-start>${t('trial_start')}</button>
          <button type="button" class="trial-btn" data-trial-abandon ${running ? '' : 'disabled'}>${t('trial_abandon')}</button>
        </div>
        <div class="trial-affix-label">${t('trial_affix_header')}</div>
        <ul class="trial-affix-list">${affixRows}</ul>
        ${effectLine}
        <div class="trial-layers-label">${t('trial_layers_header')}</div>
        <ul class="trial-layers">${TRIAL_LAYERS.map(layerRow).join('')}</ul>
        <div class="trial-board" data-trial-board></div>
      </div>
    `;
    refreshKeyText(panelEl);

    // 榜：每次打开都拉一次（不缓存跨打开的快照 —— 刚刚那局成绩要不要出现，
    // 靠"下次打开时重问"比靠一个失效标记可靠）。离线时这一句是零网络。
    this._loadBoard(panelEl);

    const startBtn = panelEl.querySelector('[data-trial-start]');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        // 词缀取**当前赛季**那几条：赛季是什么，这一局就带什么（玩家不必再选一次）
        const ids = this.game.seasons?.getState?.()?.modifierIds ?? [];
        this.game.trial.start(ids);
        this.render(panelEl);
      });
    }
    const abandonBtn = panelEl.querySelector('[data-trial-abandon]');
    if (abandonBtn) {
      abandonBtn.addEventListener('click', () => {
        this.game.trial.abandon();
        this.render(panelEl);
      });
    }
  }

  /**
   * 拉一次榜并画出来。**永不抛** —— 拉不到只是"取不到"，而这一页照常可读。
   *
   * 离线（在线服务关着 / 这一层没有拉取方法）时**不进 loading**：直接落"取不到"那一句。
   * 否则玩家会看到"正在读取…"闪一帧再变成"取不到" —— 那句话本来就不该跟网络有关。
   */
  async _loadBoard(panelEl) {
    const seq = (this._seq += 1);
    const scope = this._scopeInEffect();
    const seasonId = this._seasonId();
    const key = `${scope}:${seasonId}`;
    const online = this.game.onlineServices;
    const canLoad = !!online?.enabled?.() && typeof online.fetchTrialLeaderboard === 'function';
    if (!canLoad) {
      this._board = { key, state: 'off', items: [] };
      this._paintBoard(panelEl);
      return;
    }
    this._board = { key, state: 'loading', items: [] };
    this._paintBoard(panelEl);

    let payload = null;
    try {
      payload = await online.fetchTrialLeaderboard(scope === 'season' ? seasonId : '', BOARD_LIMIT);
    } catch (e) {
      // 客户端承诺吞错，但这一层不依赖那个承诺：一个抛出的 Promise 会让这一块永远停在"读取中"
      console.warn('[trial-board] fetch failed; treating as board unavailable', e?.message ?? e);
    }
    if (seq !== this._seq) return;   // 又点了一次：这一份答案已经过期，别把新答案盖掉
    const items = Array.isArray(payload?.items) ? payload.items : null;
    this._board = items
      ? { key, state: items.length ? 'ready' : 'empty', items }
      : { key, state: 'off', items: [] };
    this._paintBoard(panelEl);
  }

  /**
   * 画榜那一格。**只用 DOM API，不拼 innerHTML** —— 行里的 `runner` 是服务端来的字符串，
   * 而这一页是玩家能打开的任何时候；把它拼进 HTML 就是一条现成的注入口
   * （设置页的 Boss 榜当年也是为这个才全程 `textContent`）。
   *
   * 找不到那一格就直接返回：页签已经切走 / 面板关了，那时只该留缓存。
   */
  _paintBoard(panelEl) {
    const box = panelEl?.querySelector?.('[data-trial-board]');
    if (!box) return;
    box.textContent = '';

    const head = document.createElement('div');
    head.className = 'trial-board-head';
    const title = document.createElement('span');
    title.className = 'trial-board-title';
    title.textContent = t('trial_board_title');
    head.appendChild(title);
    // 没有赛季 id 时不给"本赛季"这个按钮：点了会得到与"总榜"一模一样的结果，
    // 而"两个按钮同一个答案"会让玩家以为榜坏了
    const scopes = this._seasonId()
      ? [['season', 'trial_board_scope_season'], ['all', 'trial_board_scope_all']]
      : [['all', 'trial_board_scope_all']];
    for (const [scope, labelKey] of scopes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'trial-board-scope';
      if (this._scopeInEffect() === scope) btn.classList.add('is-active');
      btn.textContent = t(labelKey);
      // 点当前范围 = 重新拉一次（这就是"刷新"，不为它单开一个按钮）
      btn.addEventListener('click', () => {
        this._scope = scope;
        this._loadBoard(panelEl);
      });
      head.appendChild(btn);
    }
    box.appendChild(head);

    if (this._board.state === 'ready') {
      const ul = document.createElement('ul');
      ul.className = 'trial-board-list';
      this._board.items.slice(0, BOARD_LIMIT).forEach((row, i) => {
        const li = document.createElement('li');
        li.className = 'trial-board-row';
        li.textContent = t('trial_board_row_fmt', {
          rank: i + 1,
          runner: typeof row?.runner === 'string' && row.runner ? row.runner : '—',
          score: Number.isFinite(row?.score) ? row.score : 0,
          layers: Number.isFinite(row?.layersCleared) ? row.layersCleared : 0,
          clock: clockText(row?.secondsLeft),
        });
        ul.appendChild(li);
      });
      box.appendChild(ul);
    } else {
      const msg = document.createElement('div');
      msg.className = 'trial-board-msg';
      msg.textContent = t(BOARD_MSG_KEY[this._board.state] ?? 'trial_board_loading');
      box.appendChild(msg);
    }

    // 范围与赛季在这一行写清楚：榜上的分数是**带赛季**的，不说清就是一张会骗人的表。
    // 句子里那句"成绩在结束时自动提交"是这一块唯一能让玩家明白"为什么我刚打完还没上榜"的话。
    const note = document.createElement('div');
    note.className = 'trial-board-note';
    const seasonName = seasonOf(this._seasonId())?.name;
    const scopeWord = this._scopeInEffect() === 'season' && seasonName
      ? t(seasonName)
      : t('trial_board_scope_all');
    note.textContent = t('trial_board_note_fmt', { scope: scopeWord });
    box.appendChild(note);
  }
}
