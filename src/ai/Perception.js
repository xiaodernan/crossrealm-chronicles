/**
 * 感知 —— 敌人"看不看得见玩家"，与看见了多久。
 *
 * 三件事集中在这里，`EnemyFSM` 只读结果：
 * 1. **视距**：`aggroRange` 内且视线不被遮挡才算看见（旧实现只看平面距离，隔一堵墙照样扑过来）；
 *    遮挡判定用的那条视线是**站着的那一层 + 眼高**，不是绝对 1.5 米（见 `eyeY()`）；
 * 2. **记忆**：看见过之后丢失视野仍追 `AI.memory` 秒（否则绕根柱子就脱战，是"怪很傻"的主要来源）；
 * 3. **仇恨**：被打到立刻仇恨，不需要看得见（背后一刀不该让敌人继续散步）。
 *
 * 归位判定（`leashed`）也在这里：离出生点太远就彻底放弃，避免整张地图的怪跟到世界边界。
 * 数值来自 `content/tuning.js` 的 `AI`，由 `Enemy` 合成到 `enemy.ai`（可被 spawn config 覆盖）。
 */
export class Sense {
  constructor(enemy) {
    this.enemy = enemy;
    this.alerted = false;
    this.seen = false;
    this.lost = 0;
    this.dist = Infinity;
    /** 归位是一次承诺：一旦决定回去就走到家为止，半路重见玩家不就地翻脸 */
    this.returning = false;
    /** 最近一次的敌人视角目标：选招要按它校准朝向，不必让状态机把坐标再传一遍 */
    this.target = null;
  }

  /** 受击、被弹反、同伴示警都走这里 */
  noteHostile() {
    this.alerted = true;
    this.returning = false;
    this.lost = 0;
  }

  clear() {
    this.alerted = false;
    this.seen = false;
    this.lost = 0;
  }

  /**
   * 视线采样的高度：**站立面 + 眼高**，不是绝对的那 1.5 米。
   *
   * `CollisionWorld.blocked()` 把这一个数当整条视线的等高高度。直接递 `ai.eyeHeight`
   * 就等于假设"世界从绝对 y=0 起"：在 10 米台地上，那条线落在**地表以下 8 米**，
   * 埋在坡里的那块石头于是把四个方向全判成遮挡 —— 高台上的敌人永远看不见贴到 1.7 米
   * 的玩家（B125 的 B 类，与"出生在实体里"那一族同一条门禁、不同一条因）。
   * 取两端**较高**的那层站立面：保证视线不从任何一端的脚下钻过去；口径与
   * `_advance()`／`unpenetrate()` 一致（脚下高度一律问 `getGroundHeight`，敌人的
   * `position.y` 恒为 0，不可用）。只在视距内被调用，短路交给 `update()` 的 `&&`。
   */
  eyeY(targetPos) {
    const e = this.enemy;
    const 本站 = e.world?.getGroundHeight(e.position.x, e.position.z) ?? 0;
    return Math.max(本站, targetPos.y) + e.ai.eyeHeight;
  }

  /**
   * @param world `CollisionWorld`，副本等未登记碰撞的场景传 null（视为无遮挡）
   */
  update(dt, targetPos, world) {
    const e = this.enemy;
    this.target = targetPos;
    this.dist = e.distanceTo(targetPos);
    const range = e.aggroRange;
    this.seen = this.dist <= range
      && (world ? !world.blocked(e.position.x, e.position.z, targetPos.x, targetPos.z, this.eyeY(targetPos)) : true);

    if (this.seen) {
      this.lost = 0;
      this.alerted = true;
    } else if (this.alerted) {
      this.lost += dt;
      // 记忆到期且已不在贴身距离：才允许脱战（贴脸时丢失视野不能突然罢手）
      if (this.lost > e.ai.memory && this.dist > e.threatRange) this.clear();
    }
    if (this.alerted && this.leashed) {
      // 拉出 leash 距离：脱战并承诺归位，半路重新看见玩家也不就地翻脸
      this.clear();
      this.returning = true;
    }
    return this;
  }

  /** 离出生点过远：追击没有意义，回去 */
  get leashed() {
    return this.enemy.distanceTo(this.enemy.spawnPoint) > this.enemy.aggroRange * this.enemy.ai.leashScale;
  }
}
