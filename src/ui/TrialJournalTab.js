/**
 * [J] 试炼 Tab（W-F3 切片1，切片3 起显示刷怪实况）。
 *
 * ## 这一页要回答的四个问题
 *
 * ① 现在什么状态（未开始 / 进行中 / 通关 / 结束）；
 * ② 本局**真的生效**的是哪几条词缀、各改了什么（数值在这里第一次露出来 ——
 *    赛季页刻意不写数值，因为那是"承诺"；这里写，因为它是"正在发生"）；
 * ③ 本层刷了几只、场上还剩几只（切片3：怪是试炼自己刷的，玩家要知道该往哪看）；
 * ④ 打完五层还是没打完，为什么结束。
 *
 * ## 为什么把"只有试炼刷的才算"写在页面上
 *
 * 这是一次**口径收窄**（切片1/2 是"任何击杀都算"）。收窄不写出来，玩家会按老规矩
 * 去世界里拉一群怪来打，然后发现计数不动 —— 那不是难度，那是没说清规则。
 *
 * ## 读数为什么不在页面上走秒
 *
 * 这一页是**打开时算一次**的快照（与赛季页同一口径）。要让它走秒得挂一个定时器，
 * 而本仓的纪律是游戏逻辑计时不许自建定时器（B39/B43）。真正的倒计时在 HUD 上
 * （`trial-*` 事件驱动），这一页负责的是"规则与账"。
 */

import { keyText, refreshKeyText } from './keyHints.js';
import { t } from '../engine/i18n.js';
import { modifierOf } from '../content/seasons.js';
import { TRIAL_LAYERS } from '../content/trial.js';

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

/** 乘子显示成两位小数，整数值不写 `.00`（×1.15 / ×1 / ×1.60 → ×1.6，玩家读得舒服） */
function fmtMul(v) {
  if (!Number.isFinite(v)) return '1';
  return String(Math.round(v * 100) / 100);
}

export class TrialJournalTab {
  constructor(game) {
    this.game = game;
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
      </div>
    `;
    refreshKeyText(panelEl);

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
}
