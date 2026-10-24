import { codeFor } from '../content/keybinds.js';
import { keyText } from '../ui/keyHints.js';
import { t } from '../engine/i18n.js';

/** 营火快速旅行 — Chapter 2 解锁，休息界面或 `fastTravel` 键（`content/keybinds.js`） */
export class FastTravelSystem {
  constructor(game) {
    this.game = game;
    this.unlocked = false;
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.game.dialog.toast(keyText(t('fast_travel_toast_unlocked')));
  }

  getDestinations() {
    const pts = this.game.restPoints.points;
    return pts.map((p) => ({ id: p.id, name: p.name, x: p.position.x, z: p.position.z }));
  }

  /**
   * 面板用的视图模型。
   *
   * "你正站在哪座营火"由 id 判定（修 B36 的最后一处：此前是 `d.name === fromName`，
   * 于是两座同名营火会一起变灰，而改一行文案就让"在此"标记消失）。
   */
  destinationsForPanel(currentId = null) {
    return this.getDestinations().map((d) => ({ ...d, here: d.id === currentId }));
  }

  travel(id) {
    const dest = this.getDestinations().find((d) => d.id === id);
    if (!dest) return false;
    const y = this.game.world.getGroundHeight(dest.x, dest.z);
    this.game.player.teleport(dest.x, y + 0.1, dest.z);
    this.game.player.combat.restHeal();
    this.game.dialog.toast(t('fast_travel_arrived', { name: dest.name }));
    return true;
  }

  tryOpen(keys) {
    if (!this.unlocked || !keys[codeFor('fastTravel')]) return false;
    keys[codeFor('fastTravel')] = false;
    const rest = this.game.restPoints.getNearest(this.game.player.position, 5);
    if (!rest) {
      this.game.dialog.toast(t('fast_travel_need_campfire'));
      return false;
    }
    this.game.fastTravelPanel?.show(rest.id);
    return true;
  }
}
