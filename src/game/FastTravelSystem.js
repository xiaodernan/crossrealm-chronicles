/** 营火快速旅行 — Chapter 2 解锁，休息界面或 T 键 */
export class FastTravelSystem {
  constructor(game) {
    this.game = game;
    this.unlocked = false;
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.game.dialog.toast('快速旅行已解锁 — 在营火按 T');
  }

  getDestinations() {
    const pts = this.game.restPoints.points;
    return pts.map((p) => ({ name: p.name, x: p.position.x, z: p.position.z }));
  }

  travel(name) {
    const dest = this.getDestinations().find((d) => d.name === name);
    if (!dest) return false;
    const y = this.game.world.getGroundHeight(dest.x, dest.z);
    this.game.player.teleport(dest.x, y + 0.1, dest.z);
    this.game.player.combat.restHeal();
    this.game.dialog.toast(`快速旅行：${name}`);
    return true;
  }

  tryOpen(keys) {
    if (!this.unlocked || !keys['KeyT']) return false;
    keys['KeyT'] = false;
    const rest = this.game.restPoints.getNearest(this.game.player.position, 5);
    if (!rest) {
      this.game.dialog.toast('靠近营火才能快速旅行');
      return false;
    }
    this.game.fastTravelPanel?.show(rest.name);
    return true;
  }
}
