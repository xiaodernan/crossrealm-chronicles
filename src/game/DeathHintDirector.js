/** 倒下提示 — 按死因给操作建议 */
const HINTS = [
  { test: (g) => (g.player?.combat?.comboCount ?? 0) >= 4, text: '高连击时别贪刀 — 留精力翻滚。' },
  { test: (g) => g.enemyManager?.boss?.alive, text: 'Boss 战：Q 锁定，红圈前 F 弹反或 Ctrl 翻滚。' },
  { test: (g) => g.dungeons?.active, text: '迷宫内先清小怪再进 Boss 房，留意小地图未探索房间。' },
  { test: () => true, text: '营火 E 可回满生命；J 日志有 Boss 攻略与流派说明。' },
];

export class DeathHintDirector {
  constructor(game) {
    this.game = game;
    this.deathCount = 0;
    window.addEventListener('player-respawn', () => this.onRespawn());
  }

  onRespawn() {
    this.deathCount += 1;
    const hint = HINTS.find((h) => h.test(this.game))?.text ?? HINTS[HINTS.length - 1].text;
    this.game.dialog.toast(`提示 · ${hint}`, 4200);
    this.game.storyJournal?.add?.({
      id: `death-${this.deathCount}-${Date.now()}`,
      category: 'poi',
      title: `第 ${this.deathCount} 次倒下`,
      text: hint,
      chapter: this.game.quests?.chapter ?? 1,
    });
    window.dispatchEvent(new CustomEvent('player-death-count', { detail: { count: this.deathCount } }));
  }

  toJSON() {
    return { deathCount: this.deathCount };
  }

  fromJSON(data) {
    if (data) this.deathCount = data.deathCount ?? 0;
  }
}
