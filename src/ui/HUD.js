import { MAP_BOSSES } from '../game/QuestSystem.js';
import { MAP_SPAN_M } from '../game/ExplorationMap.js';
import { WINDING_ROUTES } from '../content/windingRoutes.js';
import { JOURNAL_CATEGORIES, DISCOVERABLE_TOTAL } from '../game/StoryJournal.js';
import { mergeJournalCategories } from './JournalTabRegistry.js';
import { scheduler } from '../engine/Scheduler.js';
import { on, offAll } from '../engine/EventBus.js';
import { refreshKeyText, setHintDevice, keyText } from './keyHints.js';
import { focusFirstItem, parkFocus, preserveFocus, restoreParkedFocus } from './FocusNav.js';
import { inputDeviceLabel } from '../engine/InputDevice.js';
import { t } from '../engine/i18n.js';
import { objectiveTitle } from '../content/objectives.js';

import { attachDraggable, attachCollapsible } from './DraggablePanel.js';
import { applyBarTheme } from './barTheme.js';
/** 区域横幅计时分组（连播两个区域时先撤旧的） */
const ZONE_BANNER_TAG = 'hud-zone-banner';
/** 连击终结闪光的分组 */
const FINISHER_TAG = 'hud-finisher-flash';
/** 本类全部监听的所有权标识：dispose() 按它一次性注销（B44 剩余半区） */
const EVENT_TAG = 'ui/HUD';

/**
 * 小地图在没有布局可量时的退路边长（jsdom / 离屏渲染）。
 *
 * 真源在 `style.css`：`#minimap` 是 `width:100%` + `aspect-ratio:1/1`，它等于
 * `#minimap-wrap` 的声明宽度减去左右各一道边框（全站 `box-sizing:border-box`），
 * 也就是 180 − 2×1 = **178**。`drawMinimap()` 优先量 `clientWidth`，这一格只在量不到的
 * 时候兜底 —— 但它不能随手写：写歪了位图与盒子就各画各的（浏览器再缩放一次 ⇒ 糊）。
 * 所以 `tests/minimap-layout-capture.test.js` 从样式里把这三个数解析出来核对。
 */
export const MINIMAP_CSS_SIZE = 178;

/**
 * 雷达窗口的世界跨度（米）。小地图不再是"把整张世界压进一枚针尖"——那是世界地图的活；
 * 它是玩家脚下这一圈：北朝上、玩家钉在中心，世界（区圆/道路/标记）从窗口里流过。
 * 窗口从 `MAP_SPAN_M` 推（世界的三分之一），改世界跨度它跟着动。178px 盒子对 213 米
 * ⇒ 0.83 px/米，是整世界口径（0.28）的 3 倍；区圆（120 米）在区心正好溢出窗口 ——
 * 你看得见"自己站在区里"。
 */
export const RADAR_WINDOW_M = MAP_SPAN_M / 3;

/**
 * 字号按画布边长推的三档：区名 / 标记（Boss·自动）/ 兴趣点。ratio = 字号 ÷ 边长，
 * 在 178px 的盒子上还原 9/8/7px；盒子将来变宽变窄（CSS 改了）字跟着走，不再各抄各的。
 * 下限 7px：窗口退化到极小盒时字仍可辨，而不是缩成零。
 */
const MINIMAP_FONT_TIERS = { zone: 0.05, mark: 0.045, poi: 0.04 };
export const minimapSize = (w, tier) => Math.max(7, Math.round(w * (MINIMAP_FONT_TIERS[tier] ?? MINIMAP_FONT_TIERS.poi)));
export const minimapFont = (w, tier, weight = '') => `${weight ? weight + ' ' : ''}${minimapSize(w, tier)}px sans-serif`;

/** 区名锚点（世界坐标）：只在窗口内浮字，出窗就沉 —— 区际归属由横幅与世界地图说 */
export const RADAR_ZONE_LABELS = [
  { x: 0, z: 55, key: 'hud_map_anchor_hub' },
  { x: -200, z: 0, key: 'hud_map_anchor_forest' },
  { x: 0, z: -180, key: 'hud_map_anchor_magic' },
  { x: 200, z: 80, key: 'hud_map_anchor_space' },
  { x: 0, z: 220, key: 'hud_map_anchor_timeline' },
  { x: -200, z: 220, key: 'hud_map_anchor_chaos' },
];

/** 兴趣点锚点（世界坐标）：界内浮字 + 圆点，界外钳到窗口边缘当方向标 */
export const RADAR_POI_LABELS = [
  { x: -190, z: 25, key: 'hud_map_anchor_ruin' },
  { x: -35, z: -200, key: 'hud_map_anchor_library' },
  { x: 175, z: 95, key: 'hud_map_anchor_rift' },
  { x: -230, z: -15, key: 'hud_map_anchor_shrine' },
  { x: 28, z: 72, key: 'hud_map_anchor_tomb' },
];

/**
 * 日志抽屉里的"子页签"：这些格子不套清单模板，而是把整块 `#journal-panel` 换成自己的界面
 * （页签条也就一起没了）。列在这里 = 统一由 `ensureBackToList()` 保证回得去。
 */
const JOURNAL_SUB_TABS = {
  cg: (game, panel) => game.cgJournalTab.render(panel),
  achievements: (game, panel) => game.achievementsJournalTab.render(panel),
  codex: (game, panel) => game.loreCodexTab.render(panel),
  memory: (game, panel) => game.campfireMemoryTab.render(panel),
  dungeons: (game, panel) => game.dungeonJournalTab.render(panel),
  skills: (game, panel) => game.weaponSkillJournalTab.render(panel),
  side: (game, panel) => game.sideQuestJournalTab.render(panel),
  echoes: (game, panel) => game.popCultureTab.render(panel),
};

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
     * 权威文本与覆盖层分开存，覆盖层带来源 —— 谁开的谁才关得掉（修 B44）。
     * W-D2 切片36：区名 / 副标题 / 覆盖层存的全是**文案键**，展开只发生在写 DOM 的
     * 那一刻 —— 改前存的是展开后的文本，换语言后那两格留着旧语言。 */
    this._zoneNameKey = null;
    this._zoneSubtitleKey = null;
    this._subtitleOverlay = null;
    /* 常驻统计格的状态快照（切片36）：事件到来时"存值 + 渲染"，换语言时只按快照
     * 重渲染 —— 事件不会因为换了语言再派发一遍，没有这份快照就只能留着旧语言。 */
    this._souls = { souls: 0, level: 1 };
    this._skillPoints = 0;
    this._cameraMode = 'third';
    this._boss = null;
    this._refreshCombo = null;

    // 状态条配色按当前色觉档落地（W-D6 切片4）：只在构造与换档时写一次 CSS 变量，
    // 帧循环里只改 width 不碰颜色（见 ui/barTheme.js 文件头）。
    this.refreshBarColors();
    this.buildHUD();
    this.setupListeners();
    this.bindJournalEntry();
  }

buildHUD() {
    this.container.innerHTML = `
      <div class="hud-top">
        <div class="zone-badge" id="zone-badge">
          <div class="zone-icon" id="zone-icon" aria-hidden="true"></div>
          <div class="zone-info">
            <div class="zone-name" id="zone-name" data-i18n="hud_zone_name_default">交汇枢纽</div>
            <div class="zone-subtitle" id="zone-subtitle" data-i18n="hud_zone_subtitle_default">位面中心</div>
          </div>
        </div>
        <div class="hud-stats" id="hud-stats">
          <div class="stat-item" id="souls-display"></div>
          <div class="stat-item" id="chapter-display">Chapter 1</div>
          <div class="stat-item" id="coord-display">X: 0 · Z: 0</div>
          <div class="stat-item" id="discovery-count"></div>
          <div class="stat-item" id="skill-points-display"></div>
          <div class="stat-item combo-display" id="combo-display"></div>
          <div class="stat-item" id="weapon-display" data-i18n="hud_weapon_default">⚔ 位面长剑</div>
          <div class="stat-item" id="fps-display">— FPS</div>
          <div class="stat-item" id="camera-mode-display"></div>
          <div class="stat-item" id="input-device-display">—</div>
        </div>
      </div>
      <div id="quest-panel" class="quest-panel" role="region" data-i18n-aria="hud_quest_label">
        <div class="quest-header">
          <span class="quest-icon" aria-hidden="true">📜</span>
          <span class="quest-label" data-i18n="hud_quest_label"></span>
        </div>
        <div class="quest-title" id="quest-title" aria-live="polite"></div>
        <div class="quest-progress" id="quest-progress" aria-live="polite"></div>
        <div class="quest-guide" id="quest-guide" aria-live="polite"></div>
      </div>
      <div id="boss-bar-wrap" class="boss-bar-wrap hidden" role="region" data-i18n-aria="hud_aria_boss_hp">
        <div class="boss-header">
          <div class="boss-name" id="boss-name"></div>
          <div class="boss-phase" id="boss-phase"></div>
        </div>
        <div class="boss-bar-track">
          <div class="boss-bar-fill hp" id="boss-hp-bar" style="width:100%"></div>
          <div class="boss-bar-fill po" id="boss-poise-bar" style="width:0%"></div>
        </div>
      </div>
      <div class="status-bars" role="region" data-i18n-aria="hud_aria_status_bars">
        <div class="bar-row hp-row">
          <span class="bar-label" data-i18n="hud_hp"></span>
          <div class="bar-track">
            <div class="bar-fill hp" id="hp-bar" style="width:100%"></div>
          </div>
          <span class="bar-value" id="hp-value" aria-live="off">100/100</span>
        </div>
        <div class="bar-row stamina-row">
          <span class="bar-label" data-i18n="hud_stamina"></span>
          <div class="bar-track bar-track-st">
            <div class="bar-fill st" id="stamina-bar" style="width:100%"></div>
            <div class="bar-fill roll-cd" id="roll-cd-bar" style="width:0%"></div>
          </div>
          <span class="bar-value" id="stamina-value" aria-live="off">100/100</span>
        </div>
        <div class="bar-row mana-row">
          <span class="bar-label" data-i18n="hud_mana"></span>
          <div class="bar-track">
            <div class="bar-fill mana" id="mana-bar" style="width:100%"></div>
          </div>
          <span class="bar-value" id="mana-value" aria-live="off">100/100</span>
        </div>
        <div class="bar-row posture-row hidden" id="lock-row">
          <span class="bar-label" data-i18n="sem_label_posture"></span>
          <div class="bar-track">
            <div class="bar-fill po" id="posture-bar" style="width:0%"></div>
          </div>
          <span class="bar-value" id="posture-value" aria-live="off">0/60</span>
        </div>
      </div>
      <div id="spell-bar" class="spell-bar" role="region" data-i18n-aria="hud_aria_spell_bar">
        <div class="spell-slot" data-slot="1" role="button" tabindex="0" data-i18n-aria="hud_aria_spell_slot_1">
          <span class="spell-key" data-keys="spell1"></span>
          <span class="spell-name" data-i18n="hud_spell_1">真火</span>
          <span class="spell-cooldown" aria-hidden="true"></span>
        </div>
        <div class="spell-slot" data-slot="2" role="button" tabindex="0" data-i18n-aria="hud_aria_spell_slot_2">
          <span class="spell-key" data-keys="spell2"></span>
          <span class="spell-name" data-i18n="hud_spell_2">玄冰</span>
          <span class="spell-cooldown" aria-hidden="true"></span>
        </div>
        <div class="spell-slot" data-slot="3" role="button" tabindex="0" data-i18n-aria="hud_aria_spell_slot_3">
          <span class="spell-key" data-keys="spell3"></span>
          <span class="spell-name" data-i18n="hud_spell_3">引力</span>
          <span class="spell-cooldown" aria-hidden="true"></span>
        </div>
        <div class="spell-slot" data-slot="4" role="button" tabindex="0" data-i18n-aria="hud_aria_spell_slot_4">
          <span class="spell-key" data-keys="spell4"></span>
          <span class="spell-name" data-i18n="hud_spell_4">化身</span>
          <span class="spell-cooldown" aria-hidden="true"></span>
        </div>
      </div>
      <div id="charge-wrap" class="charge-wrap hidden" role="progressbar" data-i18n-aria="hud_aria_charge" aria-valuemin="0" aria-valuemax="100">
        <div id="charge-indicator" class="charge-fill"></div>
      </div>
      <div id="lock-target" class="lock-target hidden" aria-hidden="true"></div>
      <div id="quest-arrow" class="quest-arrow hidden" aria-hidden="true">▶</div>
      <div class="crosshair" aria-hidden="true"></div>
      <div id="controls-teach" class="controls-teach panel-draggable">
        <div class="panel-header panel-drag-handle">
          <span class="panel-drag-icon" aria-hidden="true">⋮⋮</span>
          <span class="panel-title" data-i18n="hud_controls_title"></span>
          <span class="panel-shortcut" id="controls-shortcut">${keyText(t('hud_help_full'))}</span>
          <button class="panel-collapse-btn" data-i18n-aria="hud_aria_collapse" aria-expanded="true">▼</button>
        </div>
        <div class="panel-body">
          <div class="ctrl-grid">
            <div class="ctrl-item"><kbd data-keys="moveUp moveLeft moveDown moveRight"></kbd><span data-i18n="start_move"></span></div>
            <div class="ctrl-item"><kbd data-keys="sprint"></kbd><span data-i18n="kb_label_sprint"></span></div>
            <div class="ctrl-item"><kbd data-keys="attackLight"></kbd><span data-i18n="kb_label_attack_light"></span></div>
            <div class="ctrl-item"><kbd data-keys="attackHeavy"></kbd><span data-i18n="kb_label_attack_heavy"></span></div>
            <div class="ctrl-item"><kbd data-keys="parry"></kbd><span data-i18n="style_label_parry"></span></div>
            <div class="ctrl-item"><kbd data-keys="roll"></kbd><span data-i18n="hud_ctrl_roll"></span></div>
            <div class="ctrl-item"><kbd data-keys="lockOn"></kbd><span data-i18n="kb_label_lock_on"></span></div>
            <div class="ctrl-item"><kbd data-keys="spell1 spell2 spell3 spell4"></kbd><span data-i18n="hud_ctrl_spell"></span></div>
            <div class="ctrl-item"><kbd data-keys="interact"></kbd><span data-i18n="kb_label_interact"></span></div>
            <div class="ctrl-item"><kbd data-keys="journal"></kbd><span data-i18n="hud_ctrl_journal"></span></div>
            <div class="ctrl-item"><kbd data-keys="photoMode"></kbd><span data-i18n="hud_ctrl_photo"></span></div>
            <div class="ctrl-item"><kbd data-keys="sessionStats"></kbd><span data-i18n="hotkey_label_session_stats"></span></div>
            <div class="ctrl-item"><kbd data-keys="questTracker"></kbd><span data-i18n="hud_ctrl_assistant"></span></div>
            <div class="ctrl-item"><kbd data-keys="cameraMode"></kbd><span data-i18n="hud_ctrl_camera"></span></div>
            <div class="ctrl-item"><kbd data-keys="minimap"></kbd><span data-i18n="hotkey_label_minimap"></span></div>
            <div class="ctrl-item"><kbd data-keys="worldMap"></kbd><span data-i18n="hud_ctrl_world_map"></span></div>
            <div class="ctrl-item"><kbd data-keys="save load"></kbd><span data-i18n="hud_ctrl_save_load"></span></div>
          </div>
        </div>
      </div>
      <div class="hud-bottom">
        <div class="controls-hint hidden" id="controls-hint" aria-live="polite">
          <div id="hint-combat">${keyText(t('hud_hint_combat'))}</div>
          <div id="hint-system">${keyText(t('hud_hint_system'))}</div>
        </div>
        <div class="compass" id="compass" data-i18n-aria="hud_aria_compass">N</div>
      </div>
    `;
    this.bossBarWrap = document.getElementById('boss-bar-wrap');
    this.minimapWrap?.classList.remove('hidden');
    this._setupDraggablePanels();
    this._setupCollapsiblePanels();
    this.refreshKeyHints();
  }

  _setupDraggablePanels() {
    const teach = document.getElementById('controls-teach');
    if (teach) {
      attachDraggable(teach, {
        storageKey: 'controls-teach',
        handle: '.panel-drag-handle',
      });
    }
  }

  _setupCollapsiblePanels() {
    const teach = document.getElementById('controls-teach');
    if (teach) {
      const btn = teach.querySelector('.panel-collapse-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          const collapsed = teach.classList.toggle('collapsed');
          btn.setAttribute('aria-expanded', !collapsed);
          btn.textContent = collapsed ? '▲' : '▼';
        });
      }
      attachCollapsible(teach, { storageKey: 'controls-teach' });
    }
  }

  /**
   * 把所有带键名的界面重算一遍（W-A7 切片6）。
   *
   * 构造时跑一次，之后每次 `Game.rebuildHotkeys()` 再跑一次；切片33 起，
   * "最近用的是哪一侧输入"变了（键盘 ↔ 手柄）也跑一次 —— 改绑与换手是同一类变化：
   * 都让屏幕上那些"该按什么键"变成假话。声明方式见 `refreshKeyText`。
   *
   * 这里也是**唯一**把"这一手是哪套输入"写进出口的地方（切片33）：先同步再重算，
   * 两件事不许分开 —— 重算了却没同步，屏幕上会整片按上一只手说话；反之同步了没重算，
   * 声明式那批（只在改动时重算）永远停在上一次的键名上。
   *
   * 走的是整份文档而不是 `#hud`：小地图标题、暂停菜单、区域面板、起始屏这些都声明在
   * `index.html` 里、却挂在 `#hud` 外面 —— 只扫容器的话，它们改绑后仍然说出厂键。
   */
  /**
   * 状态条配色按当前色觉档重写一次（W-D6 切片4）。
   *   - 构造时调一次（开机就落到存档里那一档）；
   *   - 玩家在设置里换色觉档时，由 `SettingsManager.applyToGame` 再调一次。
   * 真正写颜色的是 `ui/barTheme.js`（全仓唯一写状态条颜色的地方），这里只是转发 ——
   * HUD 自己出现第二组色值就是 B36 那一族。
   */
  refreshBarColors() {
    applyBarTheme();
  }

  refreshKeyHints() {
    // 通知出口这件事只有这一处（切片33）：把当前那一侧喂进出口，再重算整份文档的键名。
    // 之所以放在"重算"里而不是 `updateInputDevice()` 里：构造时、改绑时（`Game.rebuildHotkeys`）
    // 也走这一条 —— 少了这一句，那两条路上的格子会按上一只手说话，而屏幕上没有一处看起来是错的。
    setHintDevice(this.game.inputDevice?.current() ?? null);
    refreshKeyText(document);
    // W-D2 切片27：三句带 {动作} 的提示是 JS 现算的（data-i18n 扫不到它们），
    // 改绑与换语言都从这里重算 —— 少了这一句，改绑之后那三句说的就是旧键名/旧语言
    this.refreshLabels();
  }

  /** 三句 JS 现算的提示（W-D2 切片27）：纯标签走 data-i18n 由 applyTranslations 接管，
   *  这三句带 {动作} 占位、只能 keyText(t(键)) 现算，所以自己有一遍重算 */
  refreshLabels() {
    const combat = document.getElementById('hint-combat');
    if (combat) combat.textContent = keyText(t('hud_hint_combat'));
    const system = document.getElementById('hint-system');
    if (system) system.textContent = keyText(t('hud_hint_system'));
    const shortcut = document.getElementById('controls-shortcut');
    if (shortcut) shortcut.textContent = keyText(t('hud_help_full'));
    // W-D2 切片35：武器显示格的名字是 JS 现展开的（data-i18n 只够到开机那一格）——
    // 换语言时 applyTranslations 会把它涂回默认武器，这里按当前武器重算一次
    const w = this.game.weapons;
    if (w?.weapon?.nameKey) this._renderWeaponDisplay(w.current, w.weapon.nameKey);
    // W-D2 切片36：常驻格同理。下面每一格的值都是事件写进去的，而事件不会因为
    // 换语言再派发一遍 —— 所以在这里按各自存下来的键 / 快照重算一次。
    // 各写各的格子，先后无所谓；没有据可写的格子（还没来过事件）保持不动，
    // 那是 data-i18n 的出厂文案在说话。
    this._renderZone();
    this._renderSouls();
    this._renderSkillPoints();
    this._renderCameraMode();
    this._renderBoss();
    this._renderInputDevice();
    this.updateDiscoveryCount();
    this._refreshCombo?.();
  }

  /** 武器显示格：图标按武器 id 现算 + 名字按文案键现展开（W-D2 切片35） */
  _renderWeaponDisplay(weapon, nameKey) {
    const el = document.getElementById('weapon-display');
    if (!el || !nameKey) return;
    el.textContent = (weapon === 'staff' ? '✦ ' : '⚔ ') + t(nameKey);
  }

  /** 区名与区副标题（切片36）：键存下来，写 DOM 的那一刻才展开 */
  _renderZone() {
    const nameEl = document.getElementById('zone-name');
    if (nameEl && this._zoneNameKey) nameEl.textContent = t(this._zoneNameKey);
    this._renderZoneSubtitle();
  }

  /** 魂 / 等级那一格（切片36）：快照 + 渲染；换语言走 refreshLabels 重算 */
  _renderSouls() {
    const el = document.getElementById('souls-display');
    if (el) el.textContent = t('hud_souls_display_fmt', this._souls);
  }

  /** 技能点那一格（切片36）：同上 */
  _renderSkillPoints() {
    const el = document.getElementById('skill-points-display');
    if (el) el.textContent = t('hud_skill_points_fmt', { points: this._skillPoints });
  }

  /** 镜头模式那一格（切片36）：同上 */
  _renderCameraMode() {
    const el = document.getElementById('camera-mode-display');
    if (!el) return;
    el.textContent = this._cameraMode === 'first' ? t('hud_camera_mode_first') : t('hud_camera_mode_third');
  }

  /** Boss 名与阶段（切片36）：载荷带的是文案键，这里 t() 现展开 */
  _renderBoss() {
    if (!this._boss?.nameKey) return;
    const phaseLabels = [t('hud_boss_phase_1'), t('hud_boss_phase_2'), t('hud_boss_phase_3')];
    const nameEl = document.getElementById('boss-name');
    if (nameEl) nameEl.textContent = t(this._boss.nameKey);
    const phaseEl = document.getElementById('boss-phase');
    if (phaseEl) phaseEl.textContent = phaseLabels[this._boss.phase - 1] || t('hud_boss_phase_1');
  }

  /** 输入设备指示那一格（切片36）：没按动过就是破折号 */
  _renderInputDevice() {
    const el = document.getElementById('input-device-display');
    if (el) el.textContent = this._inputDeviceShown ? inputDeviceLabel(this._inputDeviceShown) : '—';
  }

  setupListeners() {
    on('zone-changed', (e) => {
      const z = e.detail.zone;
      // 区域名与副标题存的是**文案键**（W-D2 切片16i）；切片36 起把键存下来，
      // 换语言时 refreshLabels 按键重算 —— 改前只存展开后的文本，那一格留着旧语言
      this._zoneNameKey = z.name;
      this._zoneSubtitleKey = z.subtitle;
      // 换区是一次权威的重写：任何覆盖层（渗漏提示、时停）到此作废
      this._subtitleOverlay = null;
      this._renderZone();
      this.updateZonePanel(z);
      if (!e.detail.initial) this.showZoneBanner(this._zoneNameKey, this._zoneSubtitleKey);
    }, EVENT_TAG);

    on('discovery', (e) => {
      this.updateDiscoveryCount();
      this.game.dialog.toast(t('hud_toast_new_discovery', { title: e.detail.title }));
    }, EVENT_TAG);

    on('journal-updated', () => {
      this.updateDiscoveryCount();
      if (this.journalOpen) this.updateJournal();
    }, EVENT_TAG);

    on('journal-entry', (e) => {
      if (e.detail.category === 'fragment') {
        this.game.dialog.toast(t('hud_toast_lore_fragment', { title: e.detail.title }), 3500);
      }
    }, EVENT_TAG);

    on('stats-changed', (e) => {
      this._souls = { souls: e.detail.souls, level: e.detail.level };
      this._renderSouls();
    }, EVENT_TAG);

    on('quest-updated', (e) => {
      this.quest = e.detail;
      const q = e.detail.current;
      document.getElementById('chapter-display').textContent = `Chapter ${e.detail.chapter ?? 1}`;
      if (q) {
        // W-E3 切片36：标题问那处算式（真结局那一步按选中的结局报名）
        document.getElementById('quest-title').textContent = t(objectiveTitle(q, this.game.quests?.stats));
        document.getElementById('quest-progress').textContent = this.game.quests.getProgressText();
      } else {
        document.getElementById('quest-title').textContent = t('hud_quest_empty_title');
        document.getElementById('quest-progress').textContent = t('hud_quest_empty_progress');
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
        if (comboEl) comboEl.textContent = v.parryable.value ? t('hud_combo_executable') : (this.combo > 1 ? t('hud_combo_count', { count: this.combo }) : '');
      };
      this._refreshCombo = refreshStamina;
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
      this._setSubtitleOverlay('bleed', 'hud_subtitle_planar_bleed', { zone: e.detail.zone });
    }, EVENT_TAG);

    on('boss-start', () => {
      this.bossVisible = true;
      this.bossBarWrap.classList.remove('hidden');
    }, EVENT_TAG);

    on('boss-health', (e) => {
      if (!this.bossVisible) return;
      const { hp, maxHp, phase, nameKey } = e.detail;
      this._boss = { nameKey, phase };
      document.getElementById('boss-hp-bar').style.width = `${(hp / maxHp) * 100}%`;
      this._renderBoss();
    }, EVENT_TAG);

    on('boss-defeated', () => {
      this.bossVisible = false;
      this.bossBarWrap.classList.add('hidden');
      // Boss 死在时停里就不会再派发 time-stop-end（update 直接早退），这条是唯一的收口路径
      this._clearSubtitleOverlay('timeStop');
    }, EVENT_TAG);

    on('weapon-changed', (e) => {
      // 载荷里是**文案键**（W-D2 切片35）：图标按武器 id 现算，名字 t() 现展开 ——
      // 改前把载荷里的裸中文直接写进 DOM，英文玩家的这一格从开机起就是中文
      this._renderWeaponDisplay(e.detail.weapon, e.detail.nameKey);
    }, EVENT_TAG);

    on('skill-points-changed', (e) => {
      this._skillPoints = e.detail.points ?? 0;
      this._renderSkillPoints();
    }, EVENT_TAG);

    on('dungeon-enter', (e) => {
      if (e.detail.rerun) this.game.dialog.toast(t('hud_toast_rerun'));
    }, EVENT_TAG);

    on('time-stop-start', () => {
      this._setSubtitleOverlay('timeStop', 'hud_subtitle_time_stop');
    }, EVENT_TAG);

    /* 修 B44：VoidBoss 到期与被打断两处都派发 time-stop-end，而修前全仓无人监听 ——
     * 「⏳ 时停中」一旦写上就一直占着区副标题，直到下次换区才被顶掉。 */
    on('time-stop-end', () => {
      this._clearSubtitleOverlay('timeStop');
    }, EVENT_TAG);

    on('camera-mode-changed', (e) => {
      this._cameraMode = e.detail.mode;
      this._renderCameraMode();
    }, EVENT_TAG);

    /* 开机那一格由那位唯一写手落一次。`quests` 比 HUD 早建（`core/Game.js`），
     * 它构造函数里那次 `notifyUpdate()` 派发时这里还没挂监听 —— 于是任务面板第一眼
     * 显示的是模板里那份手抄旧文案，直到玩家推进第一步才改口。 */
    this.game.quests?.notifyUpdate();
  }

  /** 区副标题的唯一写入口：覆盖层优先于区域权威文本，撤掉后自动落回去。
   *  切片36：权威文本与覆盖层存的全是键，params 里的值也是键
   *  （位面渗漏那一句要把区名插进去）—— 换语言时才拿得到原文重展开。 */
  _renderZoneSubtitle() {
    const el = document.getElementById('zone-subtitle');
    if (!el) return;
    const o = this._subtitleOverlay;
    if (o) {
      const params = {};
      for (const [k, v] of Object.entries(o.params ?? {})) params[k] = v ? t(v) : v;
      el.textContent = t(o.key, params);
      return;
    }
    if (this._zoneSubtitleKey) el.textContent = t(this._zoneSubtitleKey);
  }

  _setSubtitleOverlay(source, key, params = {}) {
    this._subtitleOverlay = { source, key, params };
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

  /** 区横幅（切片36 起收的是文案键）：只活 3.2 秒，但键比展开后的文本便宜 */
  showZoneBanner(nameKey, subtitleKey) {
    this.zoneBanner.innerHTML = `<div class="banner-name">${t(nameKey)}</div><div class="banner-sub">${t(subtitleKey)}</div>`;
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

  /**
   * 输入侧指示（切片29）：文案只问 `inputDeviceLabel`，状态只问 `game.inputDevice.current()` ——
   * HUD 自己不判"哪一侧"，也不每帧重写一次文本（那是 DOM 写入，帧率热路径上不做）。
   */
  updateInputDevice() {
    const kind = this.game.inputDevice?.current() ?? null;
    if (kind === this._inputDeviceShown) return;
    this._inputDeviceShown = kind;
    this._renderInputDevice();
    // 指示器那一格变了，意味着"这一手"换了 —— 提示文案跟着换一套说法（切片33）。
    // 声明式那批（HUD 键位行、起始屏、小地图标题）只在改动时重算，不每帧重写 DOM。
    this.refreshKeyHints();
  }

  updateDiscoveryCount() {
    const j = this.game.storyJournal;
    const n = j?.entries?.length ?? 0;
    const fr = j?.getCounts?.().fragment ?? 0;
    const pct = this.game.explorationMap?.getExploredPercent?.() ?? 0;
    document.getElementById('discovery-count').textContent = t('hud_discovery_fmt', { count: n, fr: fr, pct: pct });
  }

  /**
   * 日志抽屉的重绘走 `preserveFocus`（切片28 / 修 B58）：整块 `innerHTML` 一换，旧按钮全销毁，
   * 浏览器把焦点丢回 `body` —— 改前读数里换一个页签就得从清单头重新走一遍（键盘侧甚至整个走不动）。
   */
  updateJournal() {
    preserveFocus(this.journalPanel, () => this.renderJournal());
  }

  renderJournal() {
    const sub = JOURNAL_SUB_TABS[this.journalTab];
    if (sub) {
      sub(this.game, this.journalPanel);
      this.ensureBackToList();
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
      return `<button type="button" class="journal-tab${tab === k ? ' active' : ''}" data-tab="${k}">${t(label)}${suffix}</button>`;
    }).join('');
    let questHtml = '';
    if (q.current) {
      // W-E3 切片36：这一格从前直接把**键名**摆进日志面板（玩家读到 "obj_anchor_title"），
      // 与 HUD 任务格是同一处算式；截图与走查都没点出来，因为中文表里那个形状太像一个词了。
      questHtml = `<p class="quest-current"><strong>Ch${q.chapter} · ${t('hud_quest_in_progress')}</strong>${t(objectiveTitle(q.current, q.stats))}<br><span>${q.getProgressText()}</span></p>`;
    }
    const items = j.getFiltered(tab).map((d) =>
      `<li><span class="journal-cat">${cats[d.category] ? t(cats[d.category]) : d.category}</span><strong>${d.title}</strong><span>${d.text}</span></li>`
    ).join('');
    this.journalPanel.innerHTML = `
      <h2>${t('hud_journal_title', { journal: keyText('{journal}') })}</h2>
      <div class="journal-tabs">${tabs}</div>
      ${questHtml}
      <ul class="journal-list">${items || `<li class="empty">${t('hud_journal_empty')}</li>`}</ul>
      <p class="hint">${t('hud_journal_hint', { count: j.entries.length, total: DISCOVERABLE_TOTAL })}</p>
    `;
    refreshKeyText(this.journalPanel);
    this.journalPanel.querySelectorAll('.journal-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.journalTab = btn.dataset.tab;
        this.updateJournal();
      });
    });
  }

  /**
   * 子页签一定要留一格"回得去清单"（W-B2 切片5 的真浏览器读数抓到的洞）。
   *
   * 为什么写在这里而不是每个子面板里：子面板各写各的整块 `innerHTML`，页签条是被换掉的那一块 ——
   * 读数里八格里只有 CG 与营火记忆自带返回按钮，玩家点进"位面秘典"之后关抽屉再开，
   * 仍停在秘典这一格（`journalTab` 记的就是它），于是**永远回不到清单**：六格皆然。
   * "靠每个子面板记得写一颗"正是要防的写法（漏一处静悄悄），所以由渲染出口统一补。
   */
  ensureBackToList() {
    const panel = this.journalPanel;
    if (!panel) return;
    let back = panel.querySelector('.journal-back-btn');
    if (!back) {
      back = document.createElement('button');
      back.type = 'button';
      back.className = 'journal-back-btn';
      back.addEventListener('click', () => {
        this.journalTab = 'all';
        this.updateJournal();
      });
      const h2 = panel.querySelector('h2');
      if (h2) h2.after(back);
      else panel.prepend(back);
    }
    // W-D2 切片28：按钮只建一次（早退过的那个判断拆掉了），语言文字每次重设 ——
    // 换语言之后再开日志，这一颗要说是新语言的那一句
    back.textContent = t('hud_journal_back');
  }

  updateZonePanel(zone) {
    if (!zone) return;
    // 区域三件套（名 / 副标题 / 描述）现在都是**文案键**（W-D2 切片16i）
    this.zonePanel.innerHTML = `
      <h2>${t(zone.name)}</h2>
      <p style="color:#888;margin-bottom:12px">${t(zone.subtitle)}</p>
      <p>${t(zone.description)}</p>
      <p style="margin-top:16px;font-size:0.8rem;color:#666">${t('hud_journal_close_hint', { zonePanel: keyText('{zonePanel}') })}</p>
    `;
    // innerHTML 每次都重写整块，所以写入这一刻自己展开一次（改绑那条路走 refreshKeyHints）
    refreshKeyText(this.zonePanel);
  }

  update(_dt) {
    this.updateInputDevice();
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
    const dirs = [t('dir_north'), t('dir_northeast'), t('dir_east'), t('dir_southeast'), t('dir_south'), t('dir_southwest'), t('dir_west'), t('dir_northwest')];
    const ang = Math.atan2(dx, dz);
    const idx = Math.round(ang / (Math.PI / 4)) & 7;
    return `▶ ${dirs[(idx + 8) % 8]} · ${Math.round(dist)}m · ${label}`;
  }

  /**
   * 把小地图的画布对齐到它的 CSS 盒子，返回**逻辑**边长（ drawing 用的坐标空间）。
   *
   * 三件事，每件都对应一处过去的糊：
   * - 尺寸**量出来**，不是抄一份 220 —— 盒子 180 而位图 220 ⇒ 浏览器缩放 0.82 倍，
   *   网格线和 7–9px 的字就是这么糊掉的。样式那一格才是真源（`MINIMAP_CSS_SIZE` 只兜底）。
   * - backing store 按 `devicePixelRatio` 放大再 `setTransform` 回来 ⇒ 2× 屏上 1 CSS px
   *   对 2 个真实像素，字不再发虚。上限 2 与 `core/Game.js` 给 WebGL 设的
   *   `setPixelRatio(Math.min(devicePixelRatio, 2))` 同一条口径。
   * - 写 `canvas.width` 等于清屏 + 重新分配位图，以前**每帧都写**。现在只在真的变了才写
   *   （窗口/DPR 变了才走这条路），其余帧只做一次 `setTransform`。
   */
  _fitMinimapCanvas(ctx) {
    const css = Math.round(this.minimapCanvas.clientWidth) || MINIMAP_CSS_SIZE;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const px = Math.round(css * dpr);
    if (this.minimapCanvas.width !== px) {
      this.minimapCanvas.width = px;
      this.minimapCanvas.height = px;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return css;
  }

  drawMinimap() {
    if (!this.minimapVisible || !this.minimapCanvas) return;
    const ctx = this.minimapCanvas.getContext('2d');
    const w = this._fitMinimapCanvas(ctx);
    const h = w;

    if (this.game.dungeons?.active?.layout) {
      this._drawDungeonMinimap(ctx, w, h);
      return;
    }
    // 一张雷达的口径：玩家钉在中心，世界从窗口里流过。换算只有一份：
    // 屏幕 = 盒心 +（世界 − 玩家）× scale，界内界外只看到玩家的距离这一条。
    const p = this.game.player.position;
    const scale = w / RADAR_WINDOW_M;
    const cx = w / 2;
    const cy = h / 2;
    const half = w / 2;
    const sx = (x) => cx + (x - p.x) * scale;
    const sy = (z) => cy + (z - p.z) * scale;
    const inWindow = (x, z) => Math.hypot(x - p.x, z - p.z) * scale <= half;
    // 界外钳到窗口边缘（留 6px 让三角自己站在盒内），并带回单位朝向给方向标
    const edge = (x, z) => {
      const dx = (x - p.x) * scale;
      const dz = (z - p.z) * scale;
      const d = Math.hypot(dx, dz) || 1;
      const ux = dx / d;
      const uz = dz / d;
      const r = half - 6;
      return { x: cx + ux * r, z: cy + uz * r, ux, uz };
    };
    /** 去堆叠的候选：绘制现场只收文字，最后由 _flushLabels 按优先级落笔 */
    const labels = [];
    const offer = (x, y, text, tier, color, priority) => {
      labels.push({ x, y, text, tier, color, priority });
    };

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

    for (const zone of this.game.world.getZoneMapData()) {
      ctx.beginPath();
      ctx.arc(sx(zone.center.x), sy(zone.center.z), zone.radius * scale, 0, Math.PI * 2);
      ctx.fillStyle = zone.color + '55';
      ctx.fill();
      ctx.strokeStyle = zone.color + 'cc';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const roads = WINDING_ROUTES.filter((r) => r.id !== 'hub-ring');
    ctx.strokeStyle = 'rgba(201, 169, 98, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    for (const route of roads) {
      ctx.beginPath();
      route.points.forEach(([x, z], i) => {
        const px = sx(x);
        const pz = sy(z);
        if (i === 0) ctx.moveTo(px, pz);
        else ctx.lineTo(px, pz);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const lb of RADAR_ZONE_LABELS) {
      if (!inWindow(lb.x, lb.z)) continue;
      offer(sx(lb.x) - 10, sy(lb.z) + 3, t(lb.key), 'zone', 'rgba(255,255,255,0.55)', 2);
    }

    this._drawRadarMarkers(ctx, w, { cx, cy, sx, sy, inWindow, edge, offer });
    this._flushLabels(ctx, labels, w);
  }

  _drawRadarMarkers(ctx, w, m) {
    const { cx, cy, sx, sy, inWindow, edge, offer } = m;
    /** 界外方向标：小三角钉在钳边点上、尖朝目标方位 */
    const blip = (e, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(e.x + e.ux * 5, e.z + e.uz * 5);
      ctx.lineTo(e.x - e.uz * 3 - e.ux * 2, e.z + e.ux * 3 - e.uz * 2);
      ctx.lineTo(e.x + e.uz * 3 - e.ux * 2, e.z - e.ux * 3 - e.uz * 2);
      ctx.closePath();
      ctx.fill();
    };

    for (const b of MAP_BOSSES) {
      const bx = sx(b.x);
      const bz = sy(b.z);
      if (inWindow(b.x, b.z)) {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, bz, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = b.color;
        ctx.font = minimapFont(w, 'mark', 'bold');
        ctx.fillText('💀', bx - 5, bz + 3);
        offer(bx + 8, bz + 3, b.short, 'mark', 'rgba(255,255,255,0.7)', 0);
      } else {
        const e = edge(b.x, b.z);
        blip(e, b.color);
        offer(e.x + 6, e.z + 3, b.short, 'mark', 'rgba(255,255,255,0.7)', 0);
      }
    }

    for (const def of RADAR_POI_LABELS) {
      if (inWindow(def.x, def.z)) {
        ctx.fillStyle = '#bb77ff';
        ctx.beginPath();
        ctx.arc(sx(def.x), sy(def.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
        offer(sx(def.x) + 5, sy(def.z) + 2, t(def.key), 'poi', 'rgba(200,160,255,0.8)', 1);
      } else {
        const e = edge(def.x, def.z);
        blip(e, '#bb77ff');
        offer(e.x + 6, e.z + 3, t(def.key), 'poi', 'rgba(200,160,255,0.8)', 1);
      }
    }

    for (const rp of this.game.restPoints?.points ?? []) {
      if (inWindow(rp.position.x, rp.position.z)) {
        ctx.fillStyle = '#ff9944';
        ctx.beginPath();
        ctx.arc(sx(rp.position.x), sy(rp.position.z), 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        blip(edge(rp.position.x, rp.position.z), '#ff9944');
      }
    }

    for (const mk of this.game.mapMarkers?.markers ?? []) {
      const active = mk.id === this.game.mapMarkers.activeId;
      if (inWindow(mk.x, mk.z)) {
        ctx.fillStyle = active ? '#66ddff' : '#4488aa';
        ctx.beginPath();
        ctx.moveTo(sx(mk.x), sy(mk.z) - 4);
        ctx.lineTo(sx(mk.x) + 3, sy(mk.z));
        ctx.lineTo(sx(mk.x), sy(mk.z) + 4);
        ctx.lineTo(sx(mk.x) - 3, sy(mk.z));
        ctx.closePath();
        ctx.fill();
      } else {
        blip(edge(mk.x, mk.z), active ? '#66ddff' : '#4488aa');
      }
    }

    const wp = this.game.quests.getQuestWaypoint();
    if (wp) {
      const inside = inWindow(wp.x, wp.z);
      const to = inside ? { x: sx(wp.x), z: sy(wp.z) } : edge(wp.x, wp.z);
      ctx.strokeStyle = 'rgba(255, 220, 80, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(to.x, to.z);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffdd44';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(to.x, to.z - 6);
      ctx.lineTo(to.x + 5, to.z + 4);
      ctx.lineTo(to.x - 5, to.z + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const isAuto = this.game.autoPlayMode && this.game.playerAutoPlay?.active;
    const dotColor = isAuto ? '#66ccff' : '#fff';
    const dotR = isAuto ? 6 : 5;
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isAuto ? '#4488ff' : '#88ccff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 朝向须：雷达不动、世界在动，针尖指哪 = 玩家自己的前进向量（sin yaw, cos yaw）
    const yaw = this.game.player.yaw ?? 0;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    ctx.strokeStyle = dotColor;
    ctx.beginPath();
    ctx.moveTo(cx + fx * dotR, cy + fz * dotR);
    ctx.lineTo(cx + fx * (dotR + 6), cy + fz * (dotR + 6));
    ctx.stroke();
    if (isAuto) {
      offer(cx + 8, cy + 3, t('hud_map_player_auto'), 'mark', 'rgba(102,204,255,0.9)', 0);
    }
  }

  /**
   * 标签去堆叠：优先级高的先占位，盒子叠上的那份**让出文字**（标记本身照画 ——
   * 位置信息不丢，丢的只是那行 7px 的字）。重叠的小字互相糊掉，正是"缩成一团"的另一半。
   */
  _flushLabels(ctx, labels, w) {
    const taken = [];
    for (const lb of labels.sort((a, b) => a.priority - b.priority)) {
      const size = minimapSize(w, lb.tier);
      const box = { x0: lb.x - 2, y0: lb.y - size, x1: lb.x + lb.text.length * size * 0.9 + 2, y1: lb.y + 3 };
      if (taken.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
      ctx.fillStyle = lb.color;
      ctx.font = minimapFont(w, lb.tier);
      ctx.fillText(lb.text, lb.x, lb.y);
      taken.push(box);
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
    ctx.font = minimapFont(w, 'zone');
    ctx.fillText(t('hud_dungeon_title_fmt', { name: t(this.game.dungeons.active.def.name) }), 6, 14);

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
    ctx.font = minimapFont(w, 'mark');
    ctx.fillText(t('hud_map_explore_fmt', { visited: hint?.visited ?? 0, total: hint?.total ?? 0, cleared: hint?.cleared ?? 0 }), 6, h - 8);
  }
}


