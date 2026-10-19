import * as THREE from 'three';
import { shouldUpdate as frameShouldUpdate } from '../engine/FrameBudget.js';

/** 营火环境粒子 — 每个休息点额外火星 / 奥术屑 */
const ZONE_EMBER = {
  hub: { color: 0xffaa44, count: 35, speed: 1.2 },
  fantasy: { color: 0x88aa66, count: 28, speed: 0.9 },
  magic: { color: 0xaa66ff, count: 40, speed: 1.4 },
  space: { color: 0xaaccff, count: 32, speed: 0.7 },
  void: { color: 0xddbb88, count: 38, speed: 1.0 },
  abyss: { color: 0xff4422, count: 45, speed: 1.6 },
};

export class RestCampfireAmbient {
  constructor(restPoints) {
    this.systems = [];

    for (const point of restPoints.points) {
      const preset = ZONE_EMBER[point.id] ?? ZONE_EMBER.hub;
      const pos = new Float32Array(preset.count * 3);
      for (let i = 0; i < preset.count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 2.2;
        pos[i * 3 + 1] = 0.5 + Math.random() * 1.8;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 2.2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        color: preset.color,
        size: 0.12,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      point.mesh.add(pts);
      this.systems.push({ pts, preset, point, t: Math.random() * 10 });
    }
  }

  update(dt, playerPos) {
    // 相位每帧累积（B118）；粒子位置更新降频 1/2 帧；可见性判定每帧做。
    const 视觉帧 = frameShouldUpdate(2);
    for (const s of this.systems) {
      s.t += dt;
      const arr = s.pts.geometry.attributes.position.array;
      const near = Math.hypot(playerPos.x - s.point.position.x, playerPos.z - s.point.position.z) < 18;
      s.pts.visible = near;
      if (!near) continue;

      if (视觉帧) {
        for (let i = 0; i < arr.length / 3; i++) {
          arr[i * 3 + 1] += s.preset.speed * dt * (0.8 + Math.sin(s.t + i) * 0.2);
          arr[i * 3] += Math.sin(s.t * 2 + i * 0.3) * dt * 0.15;
          if (arr[i * 3 + 1] > 2.8) {
            arr[i * 3] = (Math.random() - 0.5) * 2.2;
            arr[i * 3 + 1] = 0.4;
            arr[i * 3 + 2] = (Math.random() - 0.5) * 2.2;
          }
        }
        s.pts.geometry.attributes.position.needsUpdate = true;
        s.pts.material.opacity = 0.55 + Math.sin(s.t * 3) * 0.2;
      }
    }
  }
}
