import * as THREE from 'three';
import { addShake } from '../engine/Shake.js';
import { scheduler } from '../engine/Scheduler.js';

/** 单次闪电的收尾计时（新雷劈下时先撤旧的） */
const STRIKE_TAG = 'chaos-lightning';

/** 混沌边境 — 随机裂隙闪雷 */
export class ChaosLightning {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.active = false;
    this.cooldown = 2.5;
    this.flash = new THREE.PointLight(0xff4466, 0, 120);
    this.flash.position.set(0, 30, 0);
    scene.add(this.flash);
    this.boltGroup = new THREE.Group();
    scene.add(this.boltGroup);
  }

  setActive(v) {
    this.active = v;
    if (!v) {
      this.flash.intensity = 0;
      this.clearBolt();
    }
  }

  clearBolt() {
    while (this.boltGroup.children.length) this.boltGroup.remove(this.boltGroup.children[0]);
  }

  strike(near) {
    const x = near.x + (Math.random() - 0.5) * 40;
    const z = near.z + (Math.random() - 0.5) * 40;
    this.clearBolt();
    const mat = new THREE.LineBasicMaterial({ color: 0xff6688, transparent: true, opacity: 0.9 });
    const pts = [new THREE.Vector3(x, 28, z)];
    for (let i = 0; i < 6; i++) {
      pts.push(new THREE.Vector3(
        x + (Math.random() - 0.5) * 4,
        28 - i * 4 - Math.random() * 2,
        z + (Math.random() - 0.5) * 4,
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.boltGroup.add(new THREE.Line(geo, mat));
    this.flash.position.set(x, 20, z);
    this.flash.intensity = 2.8;
    addShake(0.08);
    // 一次闪电的收尾走主循环（B39）：暂停时不该在后台偷偷放完，也不该被 hitstop 拉长
    scheduler.clear(STRIKE_TAG);
    scheduler.after(0.12, () => {
      this.flash.intensity = 0;
      this.clearBolt();
    }, STRIKE_TAG);
  }

  update(dt, playerPos, inAbyss) {
    if (!inAbyss) {
      if (this.active) this.setActive(false);
      return;
    }
    this.active = true;
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.cooldown = 3 + Math.random() * 5;
      this.strike(playerPos);
    }
  }
}
