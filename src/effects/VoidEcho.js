import * as THREE from 'three';

/** 场上同时最多几道残影：这也是池子的上限 —— 一场时线下来新建过的网格不会超过这个数 */
export const MAX_ECHOES = 12;

/** 破碎时线 — 玩家时间回响残影 */
export class VoidEcho {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.echoes = [];
    /** 用完的残影摘出场景存这里：不再每次新建胶囊与材质，也不留下"remove 但不 dispose"的孤儿 */
    this._pool = [];
    this.timer = 0;
    this.active = false;
    /** 残影的形状从不按人改，只有透明度是每道自己的 —— 所以胶囊全系统共用一份 */
    this.geometry = new THREE.CapsuleGeometry(0.32, 0.9, 6, 12);
    this.mat = new THREE.MeshStandardMaterial({
      color: 0xc9a962,
      transparent: true,
      opacity: 0.35,
      emissive: 0x664400,
      emissiveIntensity: 0.5,
      depthWrite: false,
    });
  }

  setActive(v) {
    this.active = v;
    if (!v) this.clear();
  }

  clear() {
    for (const e of this.echoes) this._release(e.mesh);
    this.echoes = [];
  }

  /** 取一格残影：池里有用完的就复用，没有才新建（材质必须每格一份，透明度各道自己算） */
  _acquire() {
    const body = this._pool.pop() ?? new THREE.Mesh(this.geometry, this.mat.clone());
    this.group.add(body);
    return body;
  }

  /** 还回池里而不是丢掉：从场景摘出去，资源留着下一道接着用 */
  _release(mesh) {
    this.group.remove(mesh);
    this._pool.push(mesh);
  }

  /**
   * 拆干净：把残影那一组从场景里摘掉，逐道释放材质，再释放那份共享的胶囊几何。
   *
   * 为什么现在才有（W-C1 切片3i）：`Game._adopt` **拒绝**没有 `dispose()` 的子系统
   * （"假装收编"的防线），而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒
   * `Game.dispose()` 走完，它造的那些几何与材质**一份都不还**。
   *
   * 残影的**几何是共享**的那一份（所有残影同一个胶囊）⇒ 只释放一次；
   * **材质逐道一份**（透明度各道自己算）⇒ 逐道释放。
   */
  dispose() {
    this.scene.remove(this.group);
    for (const e of this.echoes) e.mesh?.material?.dispose?.();
    for (const mesh of this._pool) mesh.material?.dispose?.();
    this.echoes.length = 0;
    this._pool.length = 0;
    this.geometry.dispose();
    this.mat.dispose();
  }

  /** 池里备用网格数：泄漏 watchdog 与用例都看这个，不翻内部结构 */
  pooled() {
    return this._pool.length;
  }

  spawn(pos, yaw) {
    // 先腾格子再取网格：反过来会让池子在第 13 格上多建一份资源（同时在场仍是 MAX_ECHOES 道）
    if (this.echoes.length === MAX_ECHOES) this._release(this.echoes.shift().mesh);
    const body = this._acquire();
    body.material.opacity = this.mat.opacity;
    body.position.copy(pos);
    body.position.y += 0.9;
    body.rotation.y = yaw;
    this.echoes.push({ mesh: body, life: 1.4 });
  }

  update(dt, playerPos, playerYaw, inVoid) {
    if (!inVoid) {
      if (this.active) this.setActive(false);
      return;
    }
    this.active = true;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.16;
      this.spawn(playerPos.clone(), playerYaw);
    }
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const e = this.echoes[i];
      e.life -= dt;
      e.mesh.material.opacity = Math.max(0, e.life * 0.3);
      e.mesh.position.y += dt * 0.15;
      if (e.life <= 0) {
        this._release(e.mesh);
        this.echoes.splice(i, 1);
      }
    }
  }
}
