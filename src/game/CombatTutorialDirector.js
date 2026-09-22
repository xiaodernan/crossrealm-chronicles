/** 首次战斗演出提示 + 处决输入锁定协调 */
export class CombatTutorialDirector {
  constructor(game) {
    this.game = game;
    this.seen = new Set();
    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('combo-finisher', () => this._once('finisher', '连击终结：镜头绕轨锁定 — 此时无法移动/攻击'));
    window.addEventListener('combat-riposte', () => this._once('riposte', '致命反击：慢镜头中输入已锁定'));
    window.addEventListener('combat-execution', (e) => {
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
      this._hint.textContent = '演出中…';
      document.body.appendChild(this._hint);
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
