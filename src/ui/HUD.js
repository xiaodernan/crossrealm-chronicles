import { MAP_BOSSES } from '../game/QuestSystem.js';
import { WINDING_ROUTES } from '../content/windingRoutes.js';
import { JOURNAL_CATEGORIES, DISCOVERABLE_TOTAL } from '../game/StoryJournal.js';
import { mergeJournalCategories } from './JournalTabRegistry.js';
import { scheduler } from '../engine/Scheduler.js';
import { on, offAll } from '../engine/EventBus.js';
import { refreshKeyText } from '../content/keyHints.js';
import { focusFirstItem, parkFocus, restoreParkedFocus } from './FocusNav.js';

import { attachDraggable, attachCollapsible } from './DraggablePanel.js';

/** 区域横幅计时分组（连播两个区域时先撤旧的） */
const ZONE_BANNER_TAG = 'hud-zone-banner';
/** 连击终结闪光的分组 */
const FINISHER_TAG = 'hud-finisher-flash';
/** 本类全部监听的所有权标识：dispose() 按它一次性注销（B44 剩余半区） */
const EVENT_TAG = 'ui/HUD';

export class HUD {
  constructor(game) {
    this.game = game;
    this.container = document.getElementById('hud');
    this.minimapWrap = document.getElementById('minimap-wrap');
    this.minimapCanvas = document.getElementById('minimap');
    this.zonePanel = document.getElementById('zone-panel');
    this.zoneBanner = document.getElementById('zone-banner');
    this.journalPanel = document.getElementById('journal-panel');
    this.questPanel = document.getElementById('quest-panel');
    this.bossBarWrap = document.getElementById('boss-bar-wrap');
    this.minimapVisible = true;
    this.journalOpen = false;
    this.journalTab = 'all';
    this.killCount = 0;
    this.playerHp = 100;
    this.playerMaxHp = 100;
    this.stamina = 100;
    this.combo = 0;
    this.quest = null;
    this.bossVisible = false;
    /** 观测量退订函数（dispose 时必须调用） */
    this._offs = [];
    /* 区副标题只有一个 DOM 槽位、三个写者（区切换 / 位面渗漏 / 时停）。
     * 权威文本与覆盖层分开存，覆盖层带来源 —— 谁开的谁才关得掉（修 B44）。 */
    this._zoneSubtitle = '';
    this._subtitleOverlay = null;

    this.buildHUD();
    this.setupListeners();
    this.bindJournalEntry();
  }

  buildHUD() {
    this.container.innerHTML = `
      <div class="hud-top">
        <div class="zone-badge">
          <div class="name" id="zone-name">交汇枢纽</div>
          <div class="desc" id="zone-subtitle">位面中心</div>
        </div>
        <div class="stats">
          <div id="souls-display">魂 0 · Lv.1</div>
          <div id="chapter-display">Chapter 1</div>
          <div id="coord-display">X: 0 · Z: 0</div>
          <div id="discovery-count">发现 0 / 10</div>
          <div id="skill-points-display">技能点 0</div>
          <div id="combo-display"></div>
          <div id="weapon-display">⚔ 位面长剑</div>
          <div id="fps-display">— FPS</div>
          <div id="camera-mode-display">第三人称</div>
        </div>
      </div>
      <div id="quest-panel" class="quest-panel">
        <div class="quest-label" data-ktext="当前任务 · ★目标 · 💀Boss · {questTracker} 助手"></div>
        <div class="quest-title" id="quest-title">觉醒：世界之锚</div>
        <div class="quest-progress" id="quest-progress">触摸世界之锚</div>
        <div class="quest-guide" id="quest-guide">▶ 北 · 5m · 世界之锚</div>
      </div>
      <div id="boss-bar-wrap" class="boss-bar-wrap hidden">
        <div class="boss-name" id="boss-name">影界守护者</div>
        <div class="bar-track boss-track"><div class="bar-fill boss-hp" id="boss-hp-bar" style="width:100%"></div></div>
        <div class="boss-phase" id="boss-phase">阶段 I</div>
      </div>
      <div class="status-bars">
        <div class="bar-row"><span>生命</span><div class="bar-track"><div class="bar-fill hp" id="hp-bar" style="width:100%"></div></div></div>
        <div class="bar-row"><span>精力</span><div class="bar-track bar-track-st"><div class="bar-fill st" id="stamina-bar" style="width:100%"></div><div class="bar-fill roll-cd" id="roll-cd-bar" style="width:0%"></div></div></div>
        <div class="bar-row"><span>法力</span><div class="bar-track"><div class="bar-fill mana" id="mana-bar" style="width:100%"></div></div></div>
        <div class="bar-row lock-row hidden" id="lock-row"><span>架势</span><div class="bar-track"><div class="bar-fill po" id="posture-bar" style="width:0%"></div></div></div>
      </div>
      <div id="spell-bar" class="spell-bar">
        <div class="spell-slot" data-slot="1"><span class="key" data-keys="spell1"></span>真火</div>
        <div class="spell-slot" data-slot="2"><span class="key" data-keys="spell2"></span>玄冰</div>
        <div class="spell-slot" data-slot="3"><span class="key" data-keys="spell3"></span>引力</div>
        <div class="spell-slot" data-slot="4"><span class="key" data-keys="spell4"></span>化身</div>
      </div>
      <div id="charge-wrap" class="charge-wrap hidden"><div id="charge-indicator" class="charge-fill"></div></div>
      <div id="lock-target" class="lock-target hidden"></div>
      <div id="quest-arrow" class="quest-arrow hidden">▶</div>
      <div class="crosshair"></div>
      <div id="controls-teach" class="controls-teach">
        <div class="controls-teach-title panel-drag-handle">⋮⋮ 操作 · <span data-keys="help"></span> 完整说明 · 可拖动</div>
        <div class="ctrl-grid">
          <div class="ctrl-item"><kbd data-keys="moveUp moveLeft moveDown moveRight"></kbd><span>移动</span></div>
          <div class="ctrl-item"><kbd data-keys="sprint"></kbd><span>冲刺</span></div>
          <div class="ctrl-item"><kbd data-keys="attackLight"></kbd><span>轻击</span></div>
          <div class="ctrl-item"><kbd data-keys="attackHeavy"></kbd><span>重击</span></div>
          <div class="ctrl-item"><kbd data-keys="parry"></kbd><span>弹反</span></div>
          <div class="ctrl-item"><kbd data-keys="roll"></kbd><span>闪避</span></div>
          <div class="ctrl-item"><kbd data-keys="lockOn"></kbd><span>锁定</span></div>
          <div class="ctrl-item"><kbd data-keys="spell1 spell2 spell3 spell4"></kbd><span>法术</span></div>
          <div class="ctrl-item"><kbd data-keys="interact"></kbd><span>交互</span></div>
          <div class="ctrl-item"><kbd data-keys="journal"></kbd><span>日志/CG</span></div>
          <div class="ctrl-item"><kbd data-keys="photoMode"></kbd><span>拍照</span></div>
          <div class="ctrl-item"><kbd data-keys="sessionStats"></kbd><span>本局统计</span></div>
          <div class="ctrl-item"><kbd data-keys="questTracker"></kbd><span>助手</span></div>
          <div class="ctrl-item"><kbd data-keys="cameraMode"></kbd><span>视角</span></div>
          <div class="ctrl-item"><kbd data-keys="minimap"></kbd><span>小地图</span></div>
          <div class="ctrl-item"><kbd data-keys="worldMap"></kbd><span>全图/路点</span></div>
          <div class="ctrl-item"><kbd data-keys="save load"></kbd><span>存读</span></div>
        </div>
      </div>
      <div class="hud-bottom">
        <div class="controls-hint hidden" id="controls-hint">
          <div data-ktext="{attackLight} 连击 · {attackHeavy} 重击 / 处决 · {parry} 弹反 · {skill} 位面斩 · {lockOn} 锁定 · {roll} 闪避"></div>
          <div data-ktext="{spell1}~{spell4} 法术 · {swapWeapon} 切换剑 / 杖 · {fastTravel} 营火快速旅行 · {help} 说明书 · {escape} 暂停"></div>
        </div>
        <div class="compass" id="compass">N</div>
      </div>
    `;
    this.bossBarWrap = document.getElementById('boss-bar-wrap');
    this.minimapWrap?.classList.remove('hidden');
    attachDraggable(document.getElementById('controls-teach'), {
      storageKey: 'controls-teach',
      handle: '.controls-teach-title',
    });
    attachCollapsible(document.getElementById('controls-teach'), { storageKey: 'controls-teach' });
    this.refreshKeyHints();
  }

  /**
   * 把所有带键名的界面重算一遍（W-A7 切片6）。
   *
   * 构造时跑一次，之后每次 `Game.rebuildHotkeys()` 再跑一次 —— 玩家改绑之后，
   * HUD 上那些"该按什么键"跟着一起改口。声明方式见 `refreshKeyText`。
   *
   * 走的是整份文档而不是 `#hud`：小地图标题、暂停菜单、区域面板、起始屏这些都声明在
   * `index.html` 里、却挂在 `#hud` 外面 —— 只扫容器的话，它们改绑后仍然说出厂键。
   */
  refreshKeyHints() {
    refreshKeyText(document);
  }

  setupListeners() {
    on('zone-changed', (e) => {
      const z = e.detail.zone;
      document.getElementById('zone-name').textContent = z.name;
      this._zoneSubtitle = z.subtitle;
      // 换区是一次权威的重写：任何覆盖层（渗漏提示、时停）到此作废
      this._subtitleOverlay = null;
      this._renderZoneSubtitle();
      this.updateZonePanel(z);
      if (!e.detail.initial) this.showZoneBanner(z.name, z.subtitle);
    }, EVENT_TAG);

    on('discovery', (e) => {
      this.updateDiscoveryCount();
      this.game.dialog.toast(`新发现：${e.detail.title}`);
    }, EVENT_TAG);

    on('journal-updated', () => {
      this.updateDiscoveryCount();
      if (this.journalOpen) this.updateJournal();
    }, EVENT_TAG);

    on('journal-entry', (e) => {
      if (e.detail.category === 'fragment') {
        this.game.dialog.toast(`📜 叙事碎片：${e.detail.title}`, 3500);
      }
    }, EVENT_TAG);

    on('stats-changed', (e) => {
      document.getElementById('souls-display').textContent = `魂 ${e.detail.souls} · Lv.${e.detail.level}`;
    }, EVENT_TAG);

    on('quest-updated', (e) => {
      this.quest = e.detail;
      const q = e.detail.current;
      document.getElementById('chapter-display').textContent = `Chapter ${e.detail.chapter ?? 1}`;
      if (q) {
        document.getElementById('quest-title').textContent = q.title;
        document.getElementById('quest-progress').textContent = this.game.quests.getProgressText();
      } else {
        document.getElementById('quest-title').textContent = '无尽探索';
        document.getElementById('quest-progress').textContent = '自由探索整个世界';
      }
    }, EVENT_TAG);

    on('player-damaged', (e) => {
      this.playerHp = e.detail.hp;
      this.playerMaxHp = e.detail.maxHp;
      document.getElementById('hp-bar').style.width = `${(this.playerHp / this.playerMaxHp) * 100}%`;
    }, EVENT_TAG);

    on('player-healed', (e) => {
      this.playerHp = e.detail.hp;
      document.getElementById('hp-bar').style.width = '100%';
    }, EVENT_TAG);

    /* 精力 / 连击 / 处决提示改走观测量（B41）：以前每帧一条 CustomEvent，
     * 现在只在量化档位真的挪动时被叫醒一次。 */
    this._offs = [];
    const combat = this.game.player?.combat;
    if (combat?.vitals) {
      const v = combat.vitals;
      const refreshStamina = () => {
        this.stamina = v.stamina.value;
        this.combo = v.combo.value;
        const comboEl = document.getElementById('combo-display');
        if (comboEl) comboEl.textContent = v.parryable.value ? '⚡ 可处决' : (this.combo > 1 ? `连击 x${this.combo}` : '');
      };
      this._offs.push(v.stamina.subscribe(refreshStamina));
      this._offs.push(v.combo.subscribe(refreshStamina));
      this._offs.push(v.parryable.subscribe(refreshStamina));
    }
    const spells = this.game.spells;
    if (spells?.vitals) {
      this._offs.push(spells.vitals.mana.subscribe(() => this._renderMana(spells)));
      this._offs.push(spells.vitals.charging.subscribe(() => this._renderMana(spells)));
      this._offs.push(spells.vitals.chargePct.subscribe(() => this._renderMana(spells)));
      this._offs.push(spells.vitals.transform.subscribe(() => this._renderMana(spells)));
    }

    on('enemy-defeated', () => {
      this.killCount = (this.killCount || 0) + 1;
    }, EVENT_TAG);

    on('combo-finisher', () => {
      document.body.classList.add('finisher-flash');
      scheduler.clear(FINISHER_TAG);
      scheduler.after(0.42, () => document.body.classList.remove('finisher-flash'), FINISHER_TAG);
    }, EVENT_TAG);

    on('realm-bleed', (e) => {
      this._setSubtitleOverlay('bleed', `⟡ 位面渗漏 · ${e.detail.zone}`);
    }, EVENT_TAG);

    on('boss-start', () => {
      this.bossVisible = true;
      this.bossBarWrap.classList.remove('hidden');
    }, EVENT_TAG);

    on('boss-health', (e) => {
      if (!this.bossVisible) return;
      const { hp, maxHp, phase, name } = e.detail;
      document.getElementById('boss-name').textContent = name;
      document.getElementById('boss-hp-bar').style.width = `${(hp / maxHp) * 100}%`;
      document.getElementById('boss-phase').textContent = ['', '阶段 I', '阶段 II', '阶段 III'][phase] || '阶段 I';
    }, EVENT_TAG);

    on('boss-defeated', () => {
      this.bossVisible = false;
      this.bossBarWrap.classList.add('hidden');
      // Boss 死在时停里就不会再派发 time-stop-end（update 直接早退），这条是唯一的收口路径
      this._clearSubtitleOverlay('timeStop');
    }, EVENT_TAG);

    on('weapon-changed', (e) => {
      const el = document.getElementById('weapon-display');
      if (el) el.textContent = (e.detail.weapon === 'staff' ? '✦ ' : '⚔ ') + e.detail.name;
    }, EVENT_TAG);

    on('skill-points-changed', (e) => {
      const el = document.getElementById('skill-points-display');
      if (el) el.textContent = `技能点 ${e.detail.points ?? 0}`;
    }, EVENT_TAG);

    on('dungeon-enter', (e) => {
      if (e.detail.rerun) this.game.dialog.toast('深渊再探 — 新随机布局已生成');
    }, EVENT_TAG);

    on('time-stop-start', () => {
      this._setSubtitleOverlay('timeStop', '⏳ 时停中 — 蓄力法术可打断');
    }, EVENT_TAG);

    /* 修 B44：VoidBoss 到期与被打断两处都派发 time-stop-end，而修前全仓无人监听 ——
     * 「⏳ 时停中」一旦写上就一直占着区副标题，直到下次换区才被顶掉。 */
    on('time-stop-end', () => {
      this._clearSubtitleOverlay('timeStop');
    }, EVENT_TAG);

    on('camera-mode-changed', (e) => {
      const el = document.getElementById('camera-mode-display');
      if (el) el.textContent = e.detail.mode === 'first' ? '第一人称' : '第三人称';
    }, EVENT_TAG);
  }

  /** 区副标题的唯一写入口：覆盖层优先于区域权威文本，撤掉后自动落回去 */
  _renderZoneSubtitle() {
    const el = document.getElementById('zone-subtitle');
    if (el) el.textContent = this._subtitleOverlay?.text ?? this._zoneSubtitle;
  }

  _setSubtitleOverlay(source, text) {
    this._subtitleOverlay = { source, text };
    this._renderZoneSubtitle();
  }

  /** 只有开覆盖层的那一路才能关它：渗漏提示不会被时停结束误撤 */
  _clearSubtitleOverlay(source) {
    if (this._subtitleOverlay?.source !== source) return;
    this._subtitleOverlay = null;
    this._renderZoneSubtitle();
  }

  /** 法力 / 蓄力 / 化身的渲染：读观测量当前值，由订阅触发（B41） */
  _renderMana(spells) {
    const v = spells.vitals;
    const maxMana = spells.maxMana || 1;
    const manaBar = document.getElementById('mana-bar');
    if (manaBar) manaBar.style.width = `${(v.mana.value / maxMana) * 100}%`;

    const spellBar = document.getElementById('spell-bar');
    if (spellBar) spellBar.classList.toggle('transform-active', v.transform.value > 0);

    const wrap = document.getElementById('charge-wrap');
    const chargeEl = document.getElementById('charge-indicator');
    if (wrap && chargeEl) {
      if (v.charging.value) {
        wrap.classList.remove('hidden');
        chargeEl.style.width = `${v.chargePct.value * 100}%`;
      } else {
        wrap.classList.add('hidden');
      }
    }
  }

  /** 系统销毁：三本账一起结 —— 观测量退订、事件监听注销、未到期的调度任务撤销 */
  dispose() {
    for (const off of this._offs ?? []) off();
    this._offs = [];
    offAll(EVENT_TAG);
    scheduler.clear(ZONE_BANNER_TAG);
    scheduler.clear(FINISHER_TAG);
  }

  showZoneBanner(name, subtitle) {
    this.zoneBanner.innerHTML = `<div class="banner-name">${name}</div><div class="banner-sub">${subtitle}</div>`;
    this.zoneBanner.classList.remove('hidden');
    this.zoneBanner.classList.add('show');
    scheduler.clear(ZONE_BANNER_TAG);
    scheduler.after(3.2, () => {
      this.zoneBanner.classList.remove('show');
      scheduler.after(0.6, () => this.zoneBanner.classList.add('hidden'), ZONE_BANNER_TAG);
    }, ZONE_BANNER_TAG);
  }

  toggleMinimap() {
    this.minimapVisible = !this.minimapVisible;
    this.minimapWrap.classList.toggle('hidden', !this.minimapVisible);
  }

  /**
   * 暂停菜单里的"日志"那一格（切片27 / 修 B57）：手柄玩家今天没有别的入口能开日志
   * （两张手柄表里都没有 `journal` 这一格，而 `KeyJ` 对纯手柄玩家不存在）。
   *
   * 与"设置 / 说明书"那两处同一条形状：下层不关，只 `parkFocus` 让位，回来时站回原来那一格。
   */
  bindJournalEntry() {
    document.getElementById('pause-journal')?.addEventListener('click', () => {
      parkFocus(this.game.pauseMenu?.panel);
      this.setJournal(true);
    });
  }

  /**
   * 日志抽屉的开合只有一个写点（切片27）。
   *
   * 为什么不是到处 `this.journalOpen = !this.journalOpen`：这一格今天进了层表（`overlayState()`
   * 里的 `journalOpen`），于是"它开着吗"有了消费者 —— 级联关它的时候**不能**再走 toggle
   * （按一次 Escape 变成"再开一次"就是 B57 读数里那个"关不掉"的形状）。
   */
  setJournal(open) {
    const want = open === true;
    if (want === this.journalOpen) return want;
    this.journalOpen = want;
    this.journalPanel?.classList?.toggle('hidden', !want);
    if (want) {
      this.updateJournal();
      // 落焦第一格：走焦（↑↓ / 手柄十字键）从外面进来要有落点，与其它面板同一条 `focusFirstItem`
      focusFirstItem(this.journalPanel);
    } else {
      restoreParkedFocus();   // 从暂停菜单里点开的，退回去时站回原来那一格（切片12）
    }
    return want;
  }

  toggleJournal() {
    return this.setJournal(!this.journalOpen);
  }

  toggleZonePanel() {
    this.zonePanel.classList.toggle('hidden');
  }

  updateDiscoveryCount() {
    const j = this.game.storyJournal;
    const n = j?.entries?.length ?? 0;
    const fr = j?.getCounts?.().fragment ?? 0;
    const pct = this.game.explorationMap?.getExploredPercent?.() ?? 0;
    document.getElementById('discovery-count').textContent = `日志 ${n} · 碎片 ${fr}/8 · 地图 ${pct}%`;
  }

  updateJournal() {
    if (this.journalTab === 'cg') {
      this.game.cgJournalTab.render(this.journalPanel);
      return;
    }
    if (this.journalTab === 'achievements') {
      this.game.achievementsJournalTab.render(this.journalPanel);
      return;
    }
    if (this.journalTab === 'codex') {
      this.game.loreCodexTab.render(this.journalPanel);
      return;
    }
    if (this.journalTab === 'memory') {
      this.game.campfireMemoryTab.render(this.journalPanel);
      return;
    }
    if (this.journalTab === 'dungeons') {
      this.game.dungeonJournalTab.render(this.journalPanel);
      return;
    }
    if (this.journalTab === 'skills') {
      this.game.weaponSkillJournalTab.render(this.journalPanel);
      return;
    }
    if (this.journalTab === 'side') {
      this.game.sideQuestJournalTab.render(this.journalPanel);
      return;
    }
    if (this.journalTab === 'echoes') {
      this.game.popCultureTab.render(this.journalPanel);
      return;
    }
    const j = this.game.storyJournal;
    const q = this.game.quests;
    const tab = this.journalTab;
    const cats = mergeJournalCategories(JOURNAL_CATEGORIES);
    const tabs = Object.entries(cats).map(([k, label]) => {
      let suffix = '';
      if (k === 'cg') suffix = ` (${this.game.cgGallery?.getStats()?.unlocked ?? 0})`;
      else if (k === 'achievements') suffix = ` (${this.game.achievements?.unlocked?.size ?? 0})`;
      else if (k === 'codex') suffix = ` (${this.game.loreCodex?.getStats()?.unlocked ?? 0})`;
      else if (k === 'memory') suffix = ` (${this.game.campfireMemory?.getStats()?.total ?? 0})`;
      else if (k === 'dungeons') suffix = ` (${this.game.dungeonRuns?.getStats()?.totalClears ?? 0})`;
      else if (k === 'skills') suffix = ` (${this.game.weaponSkills?.unlocked?.size ?? 0})`;
      else if (k === 'side') suffix = ` (${this.game.sideQuests?.getProgress()?.done ?? 0}/${this.game.sideQuests?.getProgress()?.total ?? 0})`;
      else if (k === 'echoes') suffix = ` (${this.game.popCulture?.getStats()?.unlocked ?? 0})`;
      else if (k !== 'all') suffix = ` (${j.getCounts()[k] ?? 0})`;
      return `<button type="button" class="journal-tab${tab === k ? ' active' : ''}" data-tab="${k}">${label}${suffix}</button>`;
    }).join('');
    let questHtml = '';
    if (q.current) {
      questHtml = `<p class="quest-current"><strong>Ch${q.chapter} · 进行中</strong>${q.current.title}<br><span>${q.getProgressText()}</span></p>`;
    }
    const items = j.getFiltered(tab).map((d) =>
      `<li><span class="journal-cat">${cats[d.category] ?? d.category}</span><strong>${d.title}</strong><span>${d.text}</span></li>`
    ).join('');
    this.journalPanel.innerHTML = `
      <h2>跨界日志 · J 关闭</h2>
      <div class="journal-tabs">${tabs}</div>
      ${questHtml}
      <ul class="journal-list">${items || '<li class="empty">此类别暂无记录 — 探索世界、读石碑、对话 NPC</li>'}</ul>
      <p class="hint">已记录 ${j.entries.length} 条 · 全游戏可发现约 ${DISCOVERABLE_TOTAL}+ 处</p>
    `;
    this.journalPanel.querySelectorAll('.journal-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.journalTab = btn.dataset.tab;
        this.updateJournal();
      });
    });
  }

  updateZonePanel(zone) {
    if (!zone) return;
    this.zonePanel.innerHTML = `
      <h2>${zone.name}</h2>
      <p style="color:#888;margin-bottom:12px">${zone.subtitle}</p>
      <p>${zone.description}</p>
      <p style="margin-top:16px;font-size:0.8rem;color:#666" data-ktext="按 {zonePanel} 关闭"></p>
    `;
    // innerHTML 每次都重写整块，所以写入这一刻自己展开一次（改绑那条路走 refreshKeyHints）
    refreshKeyText(this.zonePanel);
  }

  update(_dt) {
    const p = this.game.player.position;
    document.getElementById('coord-display').textContent = `X: ${p.x.toFixed(0)} · Z: ${p.z.toFixed(0)}`;
    document.getElementById('stamina-bar').style.width = `${this.stamina}%`;

    const combat = this.game.player.combat;
    const rollEl = document.getElementById('roll-cd-bar');
    if (combat && rollEl) {
      const ratio = combat.rollCooldownTimer / combat.rollCooldown;
      rollEl.style.width = `${Math.min(1, ratio) * 100}%`;
      rollEl.style.opacity = ratio > 0.02 ? '0.6' : '0';
    }

    const lock = this.game.player.combat?.lockTarget;
    const lockEl = document.getElementById('lock-target');
    const lockRow = document.getElementById('lock-row');
    if (lock?.alive) {
      lockEl.classList.remove('hidden');
      lockEl.textContent = `🔒 ${lock.name}`;
      lockRow.classList.remove('hidden');
      document.getElementById('posture-bar').style.width = `${(lock.posture / lock.maxPosture) * 100}%`;
    } else {
      lockEl.classList.add('hidden');
      lockRow.classList.add('hidden');
    }

    this.frameCount = (this.frameCount || 0) + 1;
    this.fpsTimer = (this.fpsTimer || 0) + _dt;
    if (this.fpsTimer >= 0.5) {
      document.getElementById('fps-display').textContent = `${Math.round(this.frameCount / this.fpsTimer)} FPS`;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    const yaw = this.game.player.yaw;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(((-yaw + Math.PI) / (Math.PI * 2)) * 8) % 8;
    document.getElementById('compass').textContent = dirs[(idx + 8) % 8];

    const guideEl = document.getElementById('quest-guide');
    const arrowEl = document.getElementById('quest-arrow');
    const customMk = this.game.mapMarkers?.getActive?.();
    const wp = this.game.quests.getQuestWaypoint();
    const nav = customMk ? { x: customMk.x, z: customMk.z, label: `◆ ${customMk.label}` } : wp;
    const dirText = customMk
      ? this._dirTo(p.x, p.z, customMk.x, customMk.z, customMk.label)
      : this.game.quests.getQuestDirectionText(p.x, p.z);
    if (guideEl) {
      guideEl.textContent = dirText || this.game.quests.getAssistantHint();
    }
    if (arrowEl && nav) {
      const dx = nav.x - p.x;
      const dz = nav.z - p.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 12) {
        const angle = Math.atan2(dx, dz) - yaw;
        const margin = 52;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const nx = Math.sin(angle);
        const ny = -Math.cos(angle);
        const tx = cx + nx * (Math.min(window.innerWidth, window.innerHeight) * 0.42);
        const ty = cy + ny * (Math.min(window.innerWidth, window.innerHeight) * 0.38);
        arrowEl.classList.remove('hidden');
        arrowEl.style.left = `${Math.max(margin, Math.min(window.innerWidth - margin, tx))}px`;
        arrowEl.style.top = `${Math.max(margin, Math.min(window.innerHeight - margin, ty))}px`;
        arrowEl.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
      } else {
        arrowEl.classList.add('hidden');
      }
    } else if (arrowEl) {
      arrowEl.classList.add('hidden');
    }

    this.drawMinimap();
  }

  _dirTo(px, pz, tx, tz, label) {
    const dx = tx - px;
    const dz = tz - pz;
    const dist = Math.hypot(dx, dz);
    const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    const ang = Math.atan2(dx, dz);
    const idx = Math.round(ang / (Math.PI / 4)) & 7;
    return `▶ ${dirs[(idx + 8) % 8]} · ${Math.round(dist)}m · ${label}`;
  }

  drawMinimap() {
    if (!this.minimapVisible || !this.minimapCanvas) return;
    const ctx = this.minimapCanvas.getContext('2d');
    const w = 220;
    const h = 220;
    this.minimapCanvas.width = w;
    this.minimapCanvas.height = h;

    if (this.game.dungeons?.active?.layout) {
      this._drawDungeonMinimap(ctx, w, h);
      return;
    }
    const scale = 0.135;
    const cx = w / 2;
    const cy = h / 2;

    ctx.fillStyle = '#12141c';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 30, 0);
      ctx.lineTo(cx + i * 30, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, cy + i * 30);
      ctx.lineTo(w, cy + i * 30);
      ctx.stroke();
    }

    const zoneLabels = [
      { x: 0, z: 55, t: '枢纽' },
      { x: -200, z: 0, t: '森林' },
      { x: 0, z: -180, t: '魔法' },
      { x: 200, z: 80, t: '星际' },
      { x: 0, z: 220, t: '时线' },
      { x: -200, z: 220, t: '混沌' },
    ];

    const roads = WINDING_ROUTES.filter((r) => r.id !== 'hub-ring');
    ctx.strokeStyle = 'rgba(201, 169, 98, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    for (const route of roads) {
      ctx.beginPath();
      route.points.forEach(([x, z], i) => {
        const px = cx + x * scale;
        const pz = cy + z * scale;
        if (i === 0) ctx.moveTo(px, pz);
        else ctx.lineTo(px, pz);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const zone of this.game.world.getZoneMapData()) {
      ctx.beginPath();
      ctx.arc(cx + zone.center.x * scale, cy + zone.center.z * scale, zone.radius * scale, 0, Math.PI * 2);
      ctx.fillStyle = zone.color + '55';
      ctx.fill();
      ctx.strokeStyle = zone.color + 'cc';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    for (const lb of zoneLabels) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '9px sans-serif';
      ctx.fillText(lb.t, cx + lb.x * scale - 10, cy + lb.z * scale + 3);
    }

    this._drawMapMarkers(ctx, cx, cy, scale, w, h, MAP_BOSSES);
  }

  _drawMapMarkers(ctx, cx, cy, scale, w, h, mapBosses) {
    for (const b of mapBosses) {
      const bx = cx + b.x * scale;
      const bz = cy + b.z * scale;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, bz, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = b.color;
      ctx.font = 'bold 8px sans-serif';
      ctx.fillText('💀', bx - 5, bz + 3);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '8px sans-serif';
      ctx.fillText(b.short, bx + 8, bz + 3);
    }

    for (const def of [
      { x: -190, z: 25, t: '遗城' },
      { x: -35, z: -200, t: '图书馆' },
      { x: 175, z: 95, t: '裂隙' },
      { x: -230, z: -15, t: '神龛' },
      { x: 28, z: 72, t: '墓穴' },
    ]) {
      ctx.fillStyle = '#bb77ff';
      ctx.beginPath();
      ctx.arc(cx + def.x * scale, cy + def.z * scale, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,160,255,0.8)';
      ctx.font = '7px sans-serif';
      ctx.fillText(def.t, cx + def.x * scale + 5, cy + def.z * scale + 2);
    }

    for (const rp of this.game.restPoints?.points ?? []) {
      ctx.fillStyle = '#ff9944';
      ctx.beginPath();
      ctx.arc(cx + rp.position.x * scale, cy + rp.position.z * scale, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const mk of this.game.mapMarkers?.markers ?? []) {
      ctx.fillStyle = mk.id === this.game.mapMarkers.activeId ? '#66ddff' : '#4488aa';
      ctx.beginPath();
      ctx.moveTo(cx + mk.x * scale, cy + mk.z * scale - 4);
      ctx.lineTo(cx + mk.x * scale + 3, cy + mk.z * scale);
      ctx.lineTo(cx + mk.x * scale, cy + mk.z * scale + 4);
      ctx.lineTo(cx + mk.x * scale - 3, cy + mk.z * scale);
      ctx.closePath();
      ctx.fill();
    }

    const wp = this.game.quests.getQuestWaypoint();
    const p = this.game.player.position;
    if (wp) {
      const wx = cx + wp.x * scale;
      const wz = cy + wp.z * scale;
      ctx.strokeStyle = 'rgba(255, 220, 80, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx + p.x * scale, cy + p.z * scale);
      ctx.lineTo(wx, wz);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffdd44';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(wx, wz - 6);
      ctx.lineTo(wx + 5, wz + 4);
      ctx.lineTo(wx - 5, wz + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const isAuto = this.game.autoPlayMode && this.game.playerAutoPlay?.active;
    const dotColor = isAuto ? '#66ccff' : '#fff';
    const dotR = isAuto ? 6 : 5;
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(cx + p.x * scale, cy + p.z * scale, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isAuto ? '#4488ff' : '#88ccff';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (isAuto) {
      ctx.fillStyle = 'rgba(102,204,255,0.9)';
      ctx.font = '8px sans-serif';
      ctx.fillText('自动', cx + p.x * scale + 8, cy + p.z * scale + 3);
    }
  }

  _drawDungeonMinimap(ctx, w, h) {
    const layout = this.game.dungeons.active.layout;
    const local = this.game.dungeons._worldToLocal(
      this.game.dungeons.active,
      this.game.player.position.x,
      this.game.player.position.z
    );
    const rooms = layout.rooms;
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const r of rooms) {
      minX = Math.min(minX, r.x - r.w / 2);
      maxX = Math.max(maxX, r.x + r.w / 2);
      minZ = Math.min(minZ, r.z - r.d / 2);
      maxZ = Math.max(maxZ, r.z + r.d / 2);
    }
    const pad = 8;
    const scaleX = (w - pad * 2) / (maxX - minX || 1);
    const scaleZ = (h - pad * 2) / (maxZ - minZ || 1);
    const sc = Math.min(scaleX, scaleZ);
    const ox = (w - (maxX - minX) * sc) / 2 - minX * sc;
    const oz = (h - (maxZ - minZ) * sc) / 2 - minZ * sc;

    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(201,169,98,0.9)';
    ctx.font = '9px sans-serif';
    ctx.fillText(`${this.game.dungeons.active.def.name} · 迷宫`, 6, 14);

    for (const r of rooms) {
      const rx = r.x * sc + ox;
      const rz = r.z * sc + oz;
      const rw = r.w * sc;
      const rh = r.d * sc;
      ctx.fillStyle = r.isBossArena ? 'rgba(180,60,60,0.35)' : r.cleared ? 'rgba(60,120,80,0.45)' : r.visited ? 'rgba(80,90,120,0.5)' : 'rgba(40,42,55,0.65)';
      ctx.fillRect(rx - rw / 2, rz - rh / 2, rw, rh);
      ctx.strokeStyle = r.id === this.game.dungeons.currentRoomId ? '#ffdd44' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = r.id === this.game.dungeons.currentRoomId ? 2 : 1;
      ctx.strokeRect(rx - rw / 2, rz - rh / 2, rw, rh);
      if (r.isExit) {
        ctx.fillStyle = '#66ffaa';
        ctx.beginPath();
        ctx.arc(rx, rz, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(local.x * sc + ox, local.z * sc + oz, 4, 0, Math.PI * 2);
    ctx.fill();

    const hint = this.game.dungeons.getExplorationHint();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '8px sans-serif';
    ctx.fillText(`探索 ${hint?.visited}/${hint?.total} · 清空 ${hint?.cleared}/${hint?.total}`, 6, h - 8);
  }
}
