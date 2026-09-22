import * as THREE from 'three';
import { HIT } from '../content/tuning.js';

/**
 * 战斗反馈 —— 命中火花与冲击波，定容量对象池。
 *
 * 旧实现一次命中造 8~13 个球 + 1 个圆环，每个都带**自己的** geometry 与 material
 * （一套连击瞬时上百次 GPU 资源创建/销毁），到期再逐个 `dispose()`：
 * 这就是挥刀越久帧时间越抖的来源之一（B29）。
 * 现在几何体只有两份（单位球 + 单位环），材质与网格在构造期一次建满，
 * 运行期只改颜色/透明度/缩放/速度，没有任何分配，也不会超过池容量。
 *
 * 方向：命中把火花沿"攻击者 → 目标"的水平方向偏置喷出，
 * 于是轻击、重击、法术的受力方向在屏幕上读得出来（`dir` 由结算侧给出，不传就是四散）。
 */
export class CombatFeedback {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'CombatFeedback';
    scene.add(this.group);

    this.sparkGeometry = new THREE.SphereGeometry(1, 4, 4);
    this.ringGeometry = new THREE.RingGeometry(0.2, 1, 16);
    this.sparks = [];
    this.rings = [];
    this.live = [];

    for (let i = 0; i < HIT.sparkPool; i++) {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(this.sparkGeometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.sparks.push({ mesh, material, vel: new THREE.Vector3(), life: 0, maxLife: 1, r: 0.08 });
    }
    for (let i = 0; i < HIT.ringPool; i++) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.ringGeometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, material, life: 0, maxLife: 1, r0: 0.2, r1: 1, spin: 0 });
    }
  }

  /**
   * 取一个空闲元素；池满时复用最旧的一条 —— 特效是"正在发生"，不是必须排队的历史。
   * 只能偷同类：环不能顶替火花的位置（环没有速度，火花不该按半径长大）。
   */
  _take(pool) {
    return pool.pop() ?? this._steal(pool === this.sparks);
  }

  _steal(wantVel) {
    for (const live of this.live) {
      if (!!live.vel === wantVel) {
        this._drop(live);
        return live;
      }
    }
    return null;
  }

  /** 从在用表摘出并隐藏 —— 不复用归池，否则调用方拿到的元素会同时在池和用表里 */
  _drop(e) {
    const i = this.live.indexOf(e);
    if (i >= 0) this.live.splice(i, 1);
    e.mesh.visible = false;
    e.material.opacity = 0;
  }

  _retire(e) {
    this._drop(e);
    (e.vel ? this.sparks : this.rings).push(e);
  }

  _hideAll() {
    while (this.live.length) this._retire(this.live[0]);
  }

  /**
   * @param dir 命中方向（水平，不必归一）；null 为四散
   * @param scale 强度倍率：重击/处决把火花喷得更远更亮
   */
  impact(position, color = 0xffdd88, scale = 1, dir = null) {
    const count = HIT.sparkPerHit;
    for (let i = 0; i < count; i++) {
      const s = this._take(this.sparks);
      if (!s) break;
      s.material.color.setHex(color);
      s.material.opacity = 0.9;
      s.r = 0.06 + Math.random() * 0.08;
      s.mesh.scale.setScalar(s.r);
      s.mesh.position.copy(position);
      s.mesh.position.y += 1 + Math.random() * 0.8;
      s.mesh.visible = true;
      // 各向同性打底 + 沿受力方向偏置：既看得出方向，又不会变成一条直线
      s.vel.set(
        (Math.random() - 0.5) * 4 * scale + (dir?.x ?? 0) * 4.5 * scale,
        (0.35 + Math.random()) * 3 * scale,
        (Math.random() - 0.5) * 4 * scale + (dir?.z ?? 0) * 4.5 * scale
      );
      s.maxLife = s.life = 0.3 + Math.random() * 0.22;
      this.live.push(s);
    }

    const ring = this._take(this.rings);
    if (ring) {
      ring.material.color.setHex(color);
      ring.material.opacity = 0.75;
      ring.mesh.position.copy(position);
      ring.mesh.position.y += 0.5;
      ring.mesh.visible = true;
      ring.r0 = 0.22 * scale;
      ring.r1 = 0.95 * scale;
      ring.maxLife = ring.life = 0.22;
      this.live.push(ring);
    }
  }

  parryFlash(position) {
    const ring = this._take(this.rings);
    if (!ring) return;
    ring.material.color.setHex(0xaaccff);
    ring.material.opacity = 0.85;
    ring.mesh.position.copy(position);
    ring.mesh.position.y += 1;
    ring.mesh.visible = true;
    ring.r0 = 0.5;
    ring.r1 = 2.3;
    ring.maxLife = ring.life = 0.35;
    this.live.push(ring);
  }

  /** 在用元素数 —— 观察者接口 */
  activeCount() {
    return this.live.length;
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.life -= dt;
      if (e.life <= 0) {
        this._retire(e);
        continue;
      }
      const t = 1 - e.life / e.maxLife;
      if (e.vel) {
        e.mesh.position.addScaledVector(e.vel, dt);
        e.vel.y -= 9 * dt;
        e.material.opacity = 0.9 * (e.life / e.maxLife);
        e.mesh.scale.setScalar(e.r * (1 - t * 0.55));
      } else {
        e.mesh.scale.setScalar(e.r0 + (e.r1 - e.r0) * t);
        e.material.opacity = 0.75 * (e.life / e.maxLife);
      }
    }
  }

  /** 副本切换/重开：池里的元素留在场景图中也没关系，但必须已经不可见 */
  reset() {
    this._hideAll();
  }

  dispose() {
    this._hideAll();
    const owned = [...this.sparks, ...this.rings];
    for (const e of owned) {
      this.group.remove(e.mesh);
      e.material.dispose();
    }
    this.sparks.length = 0;
    this.rings.length = 0;
    this.live.length = 0;
    this.scene.remove(this.group);
    this.sparkGeometry.dispose();
    this.ringGeometry.dispose();
  }
}
