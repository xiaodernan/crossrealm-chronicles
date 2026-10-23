import { scheduler } from '../engine/Scheduler.js';
import { refreshKeyText } from '../content/keyHints.js';
import { applyTranslations, t } from '../engine/i18n.js';
import { BOSS_STAT_KEYS, objectiveDesc } from '../content/objectives.js';
import { bossById } from '../content/bossRoster.js';
import { ZONE_IDS, ZONE_NAMES } from '../content/ZoneIdentity.js';
import { TRIAL_DUNGEON_IDS } from '../content/dungeons.js';

/** 自动通关/带路整条流程的计时分组，用户中途取消时整体撤销 */
const AUTOPILOT_TAG = 'quest-autopilot';

/** 位面助手 — U：自动通关 / 带路 / 传送 */
export class QuestAssistant {
  constructor(game) {
    this.game = game;
    this.panelOpen = false;
    this.autoPilot = false;
    this.demoRunning = false;
    this.autoPlayRunning = false;
    this._demoStep = 0;
    this._arriveTimer = 0;
    this._panel = null;
    this._statusEl = null;
    this._buildPanel();
  }

  _buildPanel() {
    this._panel = document.createElement('div');
    this._panel.id = 'quest-assistant';
    this._panel.className = 'quest-assistant hidden';
    this._panel.innerHTML = `
      <div class="qa-header">
        <strong data-i18n="qa_title">位面助手</strong>
        <button type="button" id="qa-close">×</button>
      </div>
      <p id="qa-status" class="qa-status" data-ktext="按 {questTracker} 打开助手"></p>
      <p id="qa-hint" class="qa-hint"></p>
      <!-- 抉择按钮（W-E3 切片18）：当前任务是 choice 类型时显示 -->
      <div id="qa-choices" class="qa-choices hidden"></div>
      <div class="qa-btns">
        <button type="button" id="qa-autoplay" class="qa-primary" data-i18n="qa_btn_autoplay">自动通关（你的角色）</button>
        <button type="button" id="qa-sync" data-i18n="qa_btn_sync">同步任务进度</button>
        <button type="button" id="qa-pilot" data-i18n="qa_btn_pilot">自动带路</button>
        <button type="button" id="qa-tp" data-i18n="qa_btn_teleport">传送到 Boss/目标</button>
        <button type="button" id="qa-quick" data-i18n="qa_btn_demo">瞬间验收</button>
      </div>
      <p class="qa-note" data-ktext="左下角「⚡自动通关」或按 {autoPlay} · 角色亲自跑图 · Boss 会现身 · {escape} 停止"></p>
    `;
    document.body.appendChild(this._panel);
    this._statusEl = this._panel.querySelector('#qa-status');
    this._hintEl = this._panel.querySelector('#qa-hint');
    this._panel.querySelector('#qa-close')?.addEventListener('click', () => this.hide());
    this._panel.querySelector('#qa-autoplay')?.addEventListener('click', () => this.startAutoPlay());
    this._panel.querySelector('#qa-sync')?.addEventListener('click', () => this.syncQuests());
    this._panel.querySelector('#qa-pilot')?.addEventListener('click', () => this.toggleAutoPilot());
    this._panel.querySelector('#qa-tp')?.addEventListener('click', () => this.teleportToObjective());
    this._panel.querySelector('#qa-quick')?.addEventListener('click', () => this.startFullDemo());
  }

  toggle() {
    if (this.panelOpen) this.hide();
    else this.show();
  }

  show() {
    this.panelOpen = true;
    // 面板只在构造时建一次 DOM：每次显示前按生效表重算一遍键名（切片6）
    refreshKeyText(this._panel);
    // 面板骨架的静态文字走 `data-i18n`（W-D2 切片16h）：换语言时整体重写，
    // 不用重建 DOM —— 重建会丢掉"用户正在看哪一行"的状态。
    applyTranslations(this._panel);
    this._panel?.classList.remove('hidden');
    this.refresh();
  }

  hide() {
    this.panelOpen = false;
    this._panel?.classList.add('hidden');
  }

  refresh() {
    const q = this.game.quests.current;
    if (this._statusEl) {
      if (this.autoPlayRunning) {
        this._statusEl.textContent = t('qa_status_autoplay');
      } else if (this.demoRunning) {
        this._statusEl.textContent = t('qa_status_demo', { n: this._demoStep });
      } else if (!q) {
        this._statusEl.textContent = t('qa_status_all_done');
      } else {
        this._statusEl.textContent = t('qa_status_quest', { ch: this.game.quests.chapter, title: t(q.title) });
      }
    }
    if (this._hintEl) {
      this._hintEl.textContent = this.game.quests.getAssistantHint();
    }
    // 抉择按钮（W-E3 切片18）：当前任务是 choice 类型时显示两个选项
    const choicesEl = this._panel?.querySelector('#qa-choices');
    const btnsEl = this._panel?.querySelector('.qa-btns');
    if (q && q.type === 'choice' && choicesEl) {
      choicesEl.innerHTML = '';
      choicesEl.classList.remove('hidden');
      if (btnsEl) btnsEl.classList.add('hidden');
      for (const c of q.choices) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'qa-choice-btn';
        btn.textContent = t(c.label);
        btn.addEventListener('click', () => this.makeChoice(c.flag));
        choicesEl.appendChild(btn);
      }
    } else if (choicesEl) {
      choicesEl.classList.add('hidden');
      choicesEl.innerHTML = '';
      if (btnsEl) btnsEl.classList.remove('hidden');
    }
    const pilotBtn = this._panel?.querySelector('#qa-pilot');
    // 带路按钮**不带** `data-i18n`：它的文字随开关变，由这里现填。
    if (pilotBtn) pilotBtn.textContent = this.autoPilot ? t('qa_btn_pilot_stop') : t('qa_btn_pilot');
  }

  syncQuests() {
    const n = this.game.quests.syncProgress();
    this.game.dialog.toast(n > 0 ? t('qa_toast_synced', { n }) : t('qa_toast_already_synced'));
    this.refresh();
  }

  /** 玩家做出抉择（W-E3 切片18）：记录 flag 并让任务系统判进度 */
  makeChoice(flag) {
    if (!this.game?.quests) return;
    this.game.quests.recordChoice(flag);
    this.refresh();
  }

  toggleAutoPilot() {
    if (this.demoRunning || this.autoPlayRunning) return;
    this.autoPilot = !this.autoPilot;
    this.game.dialog.toast(this.autoPilot ? t('qa_toast_pilot_on') : t('qa_toast_pilot_off'));
    this.refresh();
  }

  teleportToObjective() {
    const wp = this.game.quests.getQuestWaypoint();
    if (!wp) {
      this.syncQuests();
      const wp2 = this.game.quests.getQuestWaypoint();
      if (!wp2) {
        this.game.dialog.toast(t('qa_toast_no_waypoint'));
        return;
      }
      this._teleport(wp2.x, wp2.z);
      return;
    }
    this._teleport(wp.x, wp.z);
    this.game.dialog.toast(t('qa_toast_teleported', { label: t(wp.label) }));
    this.refresh();
  }

  _teleport(x, z) {
    const p = this.game.player;
    const y = this.game.world.getGroundHeight(x, z) + (p.invertedGravity ? 9 : 0);
    p.position.set(x, y, z);
    p.velocity.set(0, 0, 0);
    p.currentCameraPos.set(0, 0, 0);
  }

  startAutoPlay() {
    if (this.autoPlayRunning || this.game.playerAutoPlay?.active) {
      this.game.dialog.toast(t('qa_toast_autoplay_running'));
      return;
    }
    this.autoPilot = false;
    this.autoPlayRunning = true;
    this.hide();
    this.refresh();
    const steps = this._buildDemoSteps();
    const ok = this.game.playerAutoPlay.begin(steps, (step) => this._runDemoStep(step, false));
    if (!ok) {
      this.autoPlayRunning = false;
      this.game.dialog.toast(t('qa_toast_autoplay_failed'));
      this.refresh();
    }
  }

  async startFullDemo() {
    if (this.demoRunning || this.autoPlayRunning || this.game.playerAutoPlay?.active) return;
    this.autoPilot = false;
    this.demoRunning = true;
    this.game.dialog.toast(t('qa_toast_demo_start'));
    this.refresh();

    const steps = this._buildDemoSteps();
    for (let i = 0; i < steps.length; i++) {
      if (!this.demoRunning) break;
      this._demoStep = i + 1;
      const step = steps[i];
      this._hintEl.textContent = t(step.label, step.params);
      await this._runDemoStep(step, true);
      this.game.quests.syncProgress();
      this.refresh();
      await this._wait(500);
    }

    this.demoRunning = false;
    this.game.dialog.toast(t('qa_toast_demo_done'));
    this.refresh();
  }

  _buildDemoSteps() {
    return [
      { label: 'demo_step_anchor', action: 'tp', x: 0, z: 55 },
      { label: 'demo_step_touch_anchor', action: 'poi', id: 'hub-anchor' },
      { label: 'enemy_name_dummy', action: 'hits', x: 15, z: 45, count: 8 },
      { label: ZONE_NAMES[ZONE_IDS.FANTASY], action: 'tp', x: -200, z: 0 },
      { label: 'demo_step_kill_soldier', action: 'kills', type: 'soldier', count: 2 },
      { label: 'wp_label_one_ring', action: 'discover', id: 'fantasy-ring', x: -200, z: -30 },
      { label: 'demo_step_shadow_boss', action: 'tp', x: -250, z: -35 },
      { label: 'demo_step_boss_shadow_defeat', action: 'boss', key: 'bossDefeated', bossId: 'shadow-warden' },
      { label: ZONE_NAMES[ZONE_IDS.MAGIC], action: 'tp', x: 0, z: -180 },
      { label: 'demo_step_magic_castle', action: 'discover', id: 'magic-castle', x: 0, z: -195 },
      { label: 'wp_label_golem_patrol', action: 'kills', type: 'golem', count: 1 },
      { label: ZONE_NAMES[ZONE_IDS.SPACE], action: 'tp', x: 200, z: 80 },
      { label: 'demo_step_tesseract', action: 'discover', id: 'space-tesseract', x: 200, z: 80 },
      { label: 'demo_step_reforge', action: 'poi', id: 'hub-anchor' },
      { label: 'demo_step_chests', action: 'chests', count: 5 },
      { label: 'demo_step_wanderer', action: 'npc', id: 'wanderer', x: -8, z: 45 },
      { label: bossById('archmagus').shortNameKey, action: 'boss', key: 'boss2Defeated', bossId: 'archmagus', x: 5, z: -220 },
      { label: 'demo_step_void_knight', action: 'kills', type: 'elite', count: 1 },
      { label: 'demo_step_level5', action: 'level', level: 5 },
      { label: 'demo_step_astronaut', action: 'npc', id: 'astronaut-echo', x: 200, z: 90 },
      { label: 'demo_step_spells', action: 'spells', count: 8 },
      { label: 'demo_step_dungeons', params: { n: TRIAL_DUNGEON_IDS.length }, action: 'dungeons', ids: TRIAL_DUNGEON_IDS },
      { label: bossById('singularity-herald').shortNameKey, action: 'boss', key: 'boss3Defeated', bossId: 'singularity-herald', x: 235, z: 155 },
      { label: 'demo_step_mind', action: 'mind', value: 2 },
      { label: 'demo_step_ascend', action: 'poi', id: 'hub-anchor' },
      { label: ZONE_NAMES[ZONE_IDS.VOID], action: 'tp', x: 0, z: 220 },
      { label: 'demo_step_void_rift', action: 'discover', id: 'void-rift', x: 0, z: 220 },
      { label: 'demo_step_charged', action: 'charged', count: 5 },
      { label: bossById('void-chronarch').shortNameKey, action: 'boss', key: 'voidBossDefeated', bossId: 'void-chronarch', x: 0, z: 235 },
      { label: 'wp_label_void_tablet', action: 'discover', id: 'void-tablet', x: 0, z: 225 },
      { label: 'demo_step_true_walker', action: 'poi', id: 'hub-anchor' },
      { label: ZONE_NAMES[ZONE_IDS.ABYSS], action: 'tp', x: -200, z: 220 },
      { label: 'wp_label_chaos_core', action: 'discover', id: 'chaos-core', x: -200, z: 220 },
      { label: 'demo_step_weapon_skills', action: 'skills', count: 3 },
      { label: bossById('chaos-overlord').shortNameKey, action: 'boss', key: 'chaosBossDefeated', bossId: 'chaos-overlord', x: -200, z: 285 },
      { label: 'demo_step_dungeon_rerun', action: 'dungeonRerun' },
      { label: ZONE_NAMES[ZONE_IDS.GLOOM], action: 'tp', x: 180, z: 100 },
      { label: 'demo_step_gloom_deep', action: 'discover', id: 'gloom-deep-entrance', x: 180, z: 170 },
      { label: 'demo_step_gloom_moss', action: 'discover', id: 'gloom-moss', x: 150, z: 120 },
      { label: ZONE_NAMES[ZONE_IDS.RADIANT], action: 'tp', x: -180, z: -160 },
      { label: 'demo_step_radiant_gate', action: 'discover', id: 'radiant-main-gate', x: -180, z: -95 },
      { label: 'demo_step_radiant_altar', action: 'discover', id: 'radiant-altar', x: -155, z: -175 },
      { label: 'demo_step_endless_walker', action: 'poi', id: 'hub-anchor' },
    ];
  }

  async _runDemoStep(step, teleport = true) {
    const qs = this.game.quests;
    if (teleport && step.x != null) this._teleport(step.x, step.z);
    await this._wait(teleport ? 300 : 150);

    switch (step.action) {
      case 'poi':
        window.dispatchEvent(new CustomEvent('discovery', { detail: { id: step.id, title: step.id, text: '' } }));
        window.dispatchEvent(new CustomEvent('poi-interact', { detail: { id: step.id } }));
        break;
      case 'discover':
        window.dispatchEvent(new CustomEvent('discovery', { detail: { id: step.id, title: step.id, text: '' } }));
        qs.checkProgress();
        break;
      case 'hits':
        for (let i = 0; i < (step.count ?? 8); i++) window.dispatchEvent(new CustomEvent('combat-hit'));
        break;
      case 'kills':
        qs.stats.kills[step.type] = (qs.stats.kills[step.type] || 0) + (step.count ?? 1);
        qs.checkProgress();
        break;
      case 'boss':
        qs.stats[step.key] = true;
        window.dispatchEvent(new CustomEvent('enemy-defeated', {
          detail: { type: 'boss', bossId: step.bossId, name: step.bossId },
        }));
        break;
      case 'chests':
        qs.stats.chestsOpened = Math.max(qs.stats.chestsOpened, step.count ?? 5);
        qs.checkProgress();
        break;
      case 'npc':
        window.dispatchEvent(new CustomEvent('npc-talk', { detail: { id: step.id } }));
        break;
      case 'level':
        this.game.stats.level = step.level ?? 5;
        // 属性被 cheat 改了就要重推一次：战斗数值与蓝条上限都跟着这份读数走
        this.game.stats.pushToConsumers();
        qs.checkProgress();
        break;
      case 'spells':
        for (let i = 0; i < (step.count ?? 8); i++) window.dispatchEvent(new CustomEvent('spell-cast', { detail: { charged: false } }));
        break;
      case 'dungeons':
        for (const id of step.ids ?? []) {
          window.dispatchEvent(new CustomEvent('dungeon-cleared', { detail: { id } }));
        }
        break;
      case 'charged':
        for (let i = 0; i < (step.count ?? 5); i++) window.dispatchEvent(new CustomEvent('spell-cast', { detail: { charged: true } }));
        break;
      case 'mind':
        this.game.stats.mind = step.value ?? 2;
        this.game.stats.pushToConsumers();
        qs.checkProgress();
        break;
      case 'skills':
        qs.stats.skillsUnlocked = Math.max(qs.stats.skillsUnlocked, step.count ?? 3);
        qs.checkProgress();
        break;
      case 'dungeonRerun':
        qs.stats.dungeonRerun = true;
        qs.checkProgress();
        break;
      default:
        break;
    }
    qs.syncProgress();
  }

  /** 自动演示的节奏由主循环驱动（B39）：暂停时不推进，不会在后台"跑完整个演示" */
  _wait(ms) {
    return scheduler.wait(ms / 1000, AUTOPILOT_TAG);
  }

  update(dt) {
    if (this.demoRunning || this.autoPlayRunning || this.game.autoPlayMode || !this.autoPilot) return;
    const wp = this.game.quests.getQuestWaypoint();
    if (!wp) {
      this.game.quests.syncProgress();
      this.refresh();
      return;
    }

    const p = this.game.player;
    const dx = wp.x - p.position.x;
    const dz = wp.z - p.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 5) {
      this._arriveTimer += dt;
      p.velocity.x *= 0.5;
      p.velocity.z *= 0.5;
      if (this._arriveTimer > 0.6) {
        this._arriveTimer = 0;
        this._tryAutoAction();
      }
      return;
    }

    this._arriveTimer = 0;
    const speed = 16;
    p.velocity.x = (dx / dist) * speed;
    p.velocity.z = (dz / dist) * speed;
    p.targetYaw = p.meshYawFromDirection(dx, dz);
    p.yaw = p.targetYaw;
    if (this._hintEl) this._hintEl.textContent = `${t('qa_hint_autopilot', { label: t(wp.label) })} (${Math.round(dist)}m)`;
  }

  _tryAutoAction() {
    const q = this.game.quests.current;
    if (!q) return;
    const wp = this.game.quests.getQuestWaypoint();

    if (q.type === 'interact' && q.targetId) {
      // 修 B36：以前靠路点 label 里有没有「世界之锚」来决定要不要代发交互事件，
      // 现在与下面的 discovery 分支同构 —— 只认任务自己的 `targetId`。
      window.dispatchEvent(new CustomEvent('poi-interact', { detail: { id: q.targetId } }));
    } else if (q.type === 'discovery' && q.targetId) {
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id: q.targetId, title: t(q.title), text: t(objectiveDesc(q, this.game.quests.stats)) } }));
    } else if (q.type === 'hits') {
      window.dispatchEvent(new CustomEvent('combat-hit'));
    } else if (BOSS_STAT_KEYS[q.bossId]) {
      // 是不是 Boss 步只问名册（`content/objectives.js` 的 `BOSS_STAT_KEYS`）：
      // 以前这里逐个数类型名（`boss` / `boss2` / `boss3` / `voidboss` / `chaosboss`），
      // 而主线表已经把所有 Boss 统一写成 `type: 'boss'` + 各自的 `bossId` ——
      // 那份抄本一多出来，"自动带路到了 Boss 区"这句话就对不上号（它落进最后的 else）。
      this.game.dialog.toast(t('qa_toast_arrived_boss_fmt', { label: t(wp?.label ?? 'style_label_boss'), autoplay: t('autoplay_label') }));
      this.autoPilot = false;
    } else {
      this.game.dialog.toast(t('qa_toast_arrived_fmt', { label: t(wp?.label ?? 'common_target'), progress: this.game.quests.getProgressText() }));
    }
    this.game.quests.syncProgress();
    this.refresh();
  }
}
