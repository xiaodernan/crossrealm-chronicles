import { setSunShadow, applySunFollow } from '../engine/shadowPolicy.js';

/**
 * 距离 LOD —— 让远处的敌人省掉逻辑开销。
 *
 * 这个类只维护**一条不变量**：看得见的敌人一定在动（"可见 ⇔ 在更新"）。
 * 这条不变量为什么必须写死在这里，见 `shouldUpdateEnemy` 的注释（B40 / B14）。
 */
export class PerformanceManager {
  constructor() {
    this.enemyLodDistance = 85;
    this.enemySleepDistance = 120;
  }

  /**
   * 这一帧要不要推进这只敌人。
   *
   * 返回 `false` 与"把身体收起来"必须是**同一件事**：`false` 意味着这一帧不跑
   * `enemy.update()`，位置、朝向、招式、动画整帧停在原地。以前 85–120 米那一段
   * 返回 `false` 却仍然 `setBodyVisible(true)`，玩家看到的是"看得见、却一动不动的敌人"
   * —— 定格在某一帧姿势的敌人比直接看不见更糟，那就是 B14 / B40 记的症状。
   *
   * 生效半径取**玩家可调的更新距离**（设置面板的 `set-lod`，40–150）与**休眠硬上限**
   * 里更紧的那个：往大里调顶不穿上限，往小里调是真的少算。
   *
   * "看得见但隔帧更新"那种降频要等 W-C2 把 LOD 两档铺出来 —— 那时才有一个真正的
   * 帧计数出口可以挂。在本类里拿挂钟凑节流是另一条禁忌（W-A1：游戏逻辑不吃挂钟）。
   */
  shouldUpdateEnemy(enemy, playerPos) {
    // 死掉的敌人不受 LOD 管：重生计时得在远处照常走完，否则玩家回头时看不见它复活
    if (!enemy.alive) return true;
    const dx = enemy.position.x - playerPos.x;
    const dz = enemy.position.z - playerPos.z;
    const distSq = dx * dx + dz * dz;
    const radius = Math.min(this.enemyLodDistance, this.enemySleepDistance);
    if (distSq > radius * radius) {
      // 走统一出口：血条 / 锁定标记挂在场景根上，单写 mesh.visible 会把它们留在空中（W-A3）
      enemy.setBodyVisible(false);
      return false;
    }
    enemy.setBodyVisible(true);
    return true;
  }

  /**
   * 阴影框跟随与总开关（每帧从 `Game` 调）。
   *
   * ## 改前那两行为什么删掉
   * 原来写的是 `sun.shadow.camera.position.copy(playerPos)` —— 而它在 three 里是
   * **死代码**：每次阴影渲染前 `LightShadow.updateMatrices(light)` 都从
   * `light.matrixWorld` 重设阴影相机位置（0.172.0 `LightShadow.js:63-64`），手写的
   * 任何值渲染前必被覆盖。实测后果：正交阴影框焊死在"光位 (80,120,60) 看向原点"那条
   * 轴附近，而地形是 520×620 米 —— 玩家走出原点 ±140 米那一圈，整个画面**一片无影**。
   * 现在改挪光本体与 target（`applySunFollow`，方向恒定只平移），阴影框才真的跟着人走。
   */
  updateSunShadow(sun, playerPos, enabled) {
    if (!sun) return;
    setSunShadow(sun, enabled);
    if (enabled) applySunFollow(sun, playerPos);
  }
}
