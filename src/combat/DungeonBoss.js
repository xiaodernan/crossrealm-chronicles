import { Boss } from './Boss.js';

/** 迷宫终点 Boss — 双阶段，地牢专用 */
export class DungeonBoss extends Boss {
  constructor(scene, world, config) {
    super(scene, world, {
      ...config,
      bossId: config.bossId ?? 'dungeon-warden',
      name: config.name ?? '迷宫守钥者',
      hp: config.hp ?? 520,
      posture: 100,
      damage: 20,
      speed: 5,
      aggroRange: 28,
      attackRange: 3.8,
    });
    this.dungeonId = config.dungeonId;
    this.phaseTriggered = { p2: false, p3: false };
    this.dialogToast = null;
  }

  setDialogToast(fn) {
    this.dialogToast = fn;
  }

  checkPhase() {
    const ratio = this.hp / this.maxHp;
    if (ratio <= 0.45 && !this.phaseTriggered.p2) {
      this.phase = 2;
      this.phaseTriggered.p2 = true;
      this.speed = 6.5;
      this.damage = 26;
      this.dialogToast?.('守钥者进入第二阶段！');
      window.dispatchEvent(new CustomEvent('boss-phase', { detail: { phase: 2, bossId: this.bossId, name: this.name } }));
    }
  }
}
