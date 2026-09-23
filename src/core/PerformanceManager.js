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
      // 走统一出口：血条 / 锁定标记挂在场景根上，单写 mesh.visible 会把它们留在空中（W-A3）
      enemy.setBodyVisible(false);
      return false;
    }
    enemy.setBodyVisible(true);
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
