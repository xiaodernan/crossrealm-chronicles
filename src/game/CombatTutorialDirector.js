import { refreshKeyText } from '../content/keyHints.js';

import { on, offAll } from '../engine/EventBus.js';

const GAME_COMBATTUTORIALDIRECTOR = 'game/CombatTutorialDirector';
const tutorialOn = (name, handler) => on(name, handler, GAME_COMBATTUTORIALDIRECTOR);
/** 首次战斗演出提示 + 处决输入锁定协调 */
export class CombatTutorialDirector {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第八处） */
  dispose() {
    offAll(GAME_COMBATTUTORIALDIRECTOR);
  }

  constructor(game) {
    this.game = game;
    this.seen = new Set();
    this._bindEvents();
  }

  _bindEvents() {
    tutorialOn('combo-finisher', () => this._once('finisher', '连击终结：镜头绕轨锁定 — 此时无法移动/攻击'));
    tutorialOn('combat-riposte', () => this._once('riposte', '致命反击：慢镜头中输入已锁定'));
    tutorialOn('combat-execution', (e) => {
      const msg = e.detail?.boss ? 'Boss 击破：全屏演出期间输入锁定' : '处决：短瞬间无法操作';
      this._once(e.detail?.boss ? 'bossKill' : 'execution', msg);
    });
  }

  _once(id, msg) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.game.dialog.toast(msg, 4200);
    this.game.contextualTutorial?.showTip?.(`combat-${id}`, msg);
  }

  toJSON() {
    return { seen: [...this.seen] };
  }

  fromJSON(data) {
    if (!data?.seen) return;
    this.seen = new Set(data.seen);
  }
}

/** 处决演出期间锁定玩家输入 */
export class CombatInputLock {
  constructor(game) {
    this.game = game;
    this.locked = false;
    this.lockTimer = 0;
    this.allowCamera = true;
  }

  lock(duration, opts = {}) {
    this.locked = true;
    this.lockTimer = duration;
    this.allowCamera = opts.allowCamera ?? false;
    this.game.player?.combat?.clearLock?.();
    if (this.game.player?.combat) {
      this.game.player.combat.mouseDown.left = false;
      this.game.player.combat.mouseDown.right = false;
    }
    if (!this._hint) {
      this._hint = document.createElement('div');
      this._hint.className = 'combat-input-lock hidden';
      // 跳过那一枚键写在**声明**里而不是 CSS 的 `content` 上（W-B2 切片5）：伪元素吃不到
      // `data-ktext`，玩家改了返回键，CSS 里那句仍会说他该按 Esc。
      this._hint.innerHTML = '<span>演出中…</span><span class="combat-input-lock-skip" data-ktext=" · {escape} 跳过"></span>';
      document.body.appendChild(this._hint);
      // 这一条是**演出开始那一刻**才进 DOM 的，赶在 `HUD.refreshKeyHints()` 之后，
      // 所以建好就展开一次；之后每次改绑由整份 document 的扫描接住
      refreshKeyText(this._hint);
    }
    this._hint.classList.remove('hidden');
  }

  release() {
    this.locked = false;
    this.lockTimer = 0;
    this._hint?.classList.add('hidden');
  }

  update(dt) {
    if (!this.locked) return;
    this.lockTimer -= dt;
    if (this.lockTimer <= 0) this.release();
  }

  blocksInput() {
    return this.locked;
  }

  blocksCamera() {
    return this.locked && !this.allowCamera;
  }
}
