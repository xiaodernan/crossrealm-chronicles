/** 距离 LOD、更新节流 — 降低远处敌人/粒子开销 */
export class PerformanceManager {
  constructor() {
    this.enemyLodDistance = 85;
    this.enemySleepDistance = 120;
    this.frameSkip = 0;
  }

  shouldUpdateEnemy(enemy, playerPos) {
    if (!enemy.alive) return true;
    const dx = enemy.position.x - playerPos.x;
    const dz = enemy.position.z - playerPos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > this.enemySleepDistance ** 2) {
      enemy.mesh.visible = false;
      return false;
    }
    enemy.mesh.visible = true;
    if (distSq > this.enemyLodDistance ** 2) return false;
    return true;
  }

  updateSunShadow(sun, playerPos, enabled) {
    if (!sun) return;
    sun.castShadow = enabled;
    if (enabled) {
      sun.shadow.camera.position.copy(playerPos);
      sun.shadow.camera.updateProjectionMatrix?.();
    }
  }
}
