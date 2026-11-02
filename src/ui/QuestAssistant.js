import { scheduler } from '../engine/Scheduler.js';
import { refreshKeyText, keyText } from './keyHints.js';
import { applyTranslations, t } from '../engine/i18n.js';
import { emit } from '../engine/EventBus.js';
import { BOSS_STAT_KEYS, MAINLINE_BY_ID, objectiveDesc, objectiveTitle } from '../content/objectives.js';
import { rollGear } from '../content/gear.js';
import { buildDemoSteps } from './demoSteps.js';

/** 自动通关/带路整条流程的计时分组，用户中途取消时整体撤销 */
const AUTOPILOT_TAG = 'quest-autopilot';

/**
 * 演示要穿的那一件装备由一个**定值**的 rng 抽出来（W-D4 切片9）。
 *
 * 为什么不直接 `Math.random`：这两格（`gear-charm` / `gear-sigil`）走的是真生产者
 * `PlayerStats.equip`，随机就等于"每一轮 e2e 的属性加成不一样" —— 而这一条门禁要的
 * 是可重复的读数。0.5 落在哪一档由 `content/gear.js` 的权重表说，这里不抄那一格。
 */
const DEMO_ROLL = () => 0.5;

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
      <p id="qa-status" class="qa-status">${keyText(t('qa_open_hint'))}</p>
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
      <p class="qa-note">${keyText(t('qa_autoplay_note'))}</p>
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
    // W-D2 切片27：状态行与备注行是 JS 现算的带占位句子，每次显示按生效表重算
    this._statusEl.textContent = keyText(t('qa_open_hint'));
    this._panel.querySelector('.qa-note').textContent = keyText(t('qa_autoplay_note'));
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
        this._statusEl.textContent = t('qa_status_quest', { ch: this.game.quests.chapter, title: t(objectiveTitle(q, this.game.quests.stats)) });
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
    const steps = buildDemoSteps();
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

    const steps = buildDemoSteps();
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

  /**
   * 走一步：到位 → 把这一行的**效果发出去** → 让真 `QuestSystem` 判与推。
   *
   * 效果只有两条出口（口径与"为什么"见 `ui/demoSteps.js` 文件头）：
   * - `events` 一律是 `STAT_EVENTS` 里登记过的事件名，走 `emit()` ⇒ 名字抄错当场抛，
   *   而不是"下游静默失踪"（`engine/EventBus.js` 那条登记咽喉）；
   * - `producer` 是等级 / 心智 / 装备那三格的**真生产者**（`PlayerStats`）—— 它们在账本里
   *   是**读数**（`STAT_READINGS`），赋值进账本就是造一个生产方永远不会发的快照。
   *
   * 改前这里是这六处最坏的形状：`qs.stats.kills[type] += n` / `qs.stats[step.key] = true` /
   * `qs.stats.chestsOpened = Math.max(…)` / `qs.stats.skillsUnlocked = Math.max(…)` /
   * `qs.stats.dungeonRerun = true` + 两处 `game.stats.* = 值` 之后自己 `checkProgress()`。
   * 直接写账本 = 演示测的是"赋值能不能执行"，不是"那条链通不通"：记账表 `STAT_EVENTS`
   * 改一格、或某个事件的派发位点整个没了，演示照样一路"通关"（clear-r1 查实的正是这一族）。
   */
  async _runDemoStep(step, teleport = true) {
    const qs = this.game.quests;
    if (teleport && step.x != null) this._teleport(step.x, step.z);
    await this._wait(teleport ? 300 : 150);

    const 负载行 = MAINLINE_BY_ID.get(step.rowId);
    for (const 事件 of step.events) {
      // `discovery` 的负载按仓里的规矩带**已译好的**显示字段（派发方负责译，见下面
      // `_tryAutoAction` 那一处与 `world/WorldManager` 那几处）：HUD 的"发现：{title}"
      // 与日志条目直接取 `detail.title / .text`，不给它们就是空白。
      // 正文现问 `objectiveDesc(行, 账本)`，不从步表里抄 —— 抉择行的正文随玩家选的那条变。
      const 负载 = 事件.name === 'discovery'
        ? { ...事件.detail, title: t(step.label), text: t(objectiveDesc(负载行, qs.stats)) }
        : 事件.detail;
      emit(事件.name, 负载);
    }
    const 生产 = step.producer;
    if (生产?.kind === 'level') {
      this.game.stats.level = 生产.value;
      this.game.stats.pushToConsumers();
    } else if (生产?.kind === 'mind') {
      this.game.stats.mind = 生产.value;
      this.game.stats.pushToConsumers();
    } else if (生产?.kind === 'gear') {
      this.game.stats.equip(生产.slot, rollGear(DEMO_ROLL));
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
      // W-E3 切片36：发现卡的标题也问那处算式（真结局那一步按选中的结局报名）
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id: q.targetId, title: t(objectiveTitle(q, this.game.quests.stats)), text: t(objectiveDesc(q, this.game.quests.stats)) } }));
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
