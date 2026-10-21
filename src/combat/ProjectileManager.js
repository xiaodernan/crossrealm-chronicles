import * as THREE from 'three';

const _dir = new THREE.Vector3();

export class ProjectileManager {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.projectiles = [];
    /**
     * 一份**共享几何**（W-C1 切片3h）—— 所有弹体都是同一个球。
     *
     * 改前每发弹体各造一份 `SphereGeometry` ⇒ 一次齐射就是 N 份几何（N 场战斗下来
     * 成百上千份），而它们**一模一样**。现在全局只有**一份**。
     *
     * 材质**逐发一份**（颜色按法术走 ⇒ 共用会串色）。
     */
    this.geometry = new THREE.SphereGeometry(0.35, 8, 8);
  }

  spawn(from, target, damage, speed = 12, color = 0xaa44ff) {
    const geometry = this.geometry;
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(from);
    mesh.position.y += 2;
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      geometry,
      material,
      target: target.clone(),
      damage,
      speed,
      life: 6,
    });
  }

  _recycle(i) {
    const p = this.projectiles[i];
    this.projectiles.splice(i, 1);
    this.scene.remove(p.mesh);
    // 几何是**共享**的那一份 ⇒ 这里**不释放**（释放了，后一发弹体就没形状了）
    p.material.dispose();
  }

  /**
   * 拆干净：把在场的弹体都摘掉，逐发释放材质，再释放那份共享几何（W-C1 切片3h）。
   *
   * 为什么现在才有：`Game._adopt` **拒绝**没有 `dispose()` 的子系统（"假装收编"的防线），
   * 而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒ `Game.dispose()` 走完，
   * 它造的那些几何与材质**一份都不还**。
   */
  dispose() {
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
      p.material.dispose();
    }
    this.projectiles.length = 0;
    this.geometry.dispose();
  }

  /** 存活弹体数 — 观察者接口，避免外部翻内部数组 */
  count() {
    return this.projectiles.length;
  }

  update(dt, playerPos, playerRef) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      _dir.subVectors(p.target, p.mesh.position);
      _dir.y = 0;
      const len = _dir.length();
      if (len > 0.5) {
        _dir.normalize();
        p.mesh.position.addScaledVector(_dir, p.speed * dt);
      }
      p.mesh.position.y = 1.5 + Math.sin(p.life * 8) * 0.3;

      const dist = Math.sqrt(
        (playerPos.x - p.mesh.position.x) ** 2 + (playerPos.z - p.mesh.position.z) ** 2
      );
      if (dist < 1.2 && playerRef && !playerRef.combat.isInvulnerable()) {
        // 顶开方向 = 弹体→玩家，与来时的弹道同向：挨的这一下有"从哪飞来"的感觉
        playerRef.combat.takeDamage(p.damage, null, null, { from: p.mesh.position });
        this._recycle(i);
        continue;
      }
      if (p.life <= 0 || len < 0.5) this._recycle(i);
    }
  }
}
