import * as THREE from 'three';
import { addShake } from '../engine/Shake.js';
import { scheduler } from '../engine/Scheduler.js';

/** 单次闪电的收尾计时（新雷劈下时先撤旧的） */
const STRIKE_TAG = 'chaos-lightning';

/** 一条雷的形状：从 28 米高的天顶点往下 6 段 */
const BOLT_HEAD_Y = 28;
const BOLT_SEGMENTS = 6;
/** 缓冲必须与写法同源：点数 = 天顶 1 + 段数 */
const BOLT_POINTS = BOLT_SEGMENTS + 1;

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
    /** 雷从头到尾复用同一条线：每一劈只重写那几个点，不再新建几何与材质 */
    this.boltGeo = new THREE.BufferGeometry();
    this.boltGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(BOLT_POINTS * 3), 3),
    );
    this.boltMat = new THREE.LineBasicMaterial({ color: 0xff6688, transparent: true, opacity: 0.9 });
    this.bolt = new THREE.Line(this.boltGeo, this.boltMat);
    // 包围球会停在第一次算出的位置，而每一劈的落点都不同 —— 这条线不做剔除
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.boltGroup.add(this.bolt);
  }

  setActive(v) {
    this.active = v;
    if (!v) {
      this.flash.intensity = 0;
      this.clearBolt();
    }
  }

  /** 收雷只是把那条线藏起来：资源留在场上，下一雷接着写 */
  clearBolt() {
    this.bolt.visible = false;
  }

  strike(near) {
    const x = near.x + (Math.random() - 0.5) * 40;
    const z = near.z + (Math.random() - 0.5) * 40;
    this.clearBolt();
    const pos = this.boltGeo.attributes.position;
    pos.setXYZ(0, x, BOLT_HEAD_Y, z);
    for (let i = 0; i < BOLT_SEGMENTS; i++) {
      pos.setXYZ(
        i + 1,
        x + (Math.random() - 0.5) * 4,
        BOLT_HEAD_Y - i * 4 - Math.random() * 2,
        z + (Math.random() - 0.5) * 4,
      );
    }
    pos.needsUpdate = true;
    this.bolt.visible = true;
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
