import * as THREE from 'three';

/** 区域氛围粒子 + 营火光晕增强 */
export class AmbientScenePass {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'AmbientScenePass';
    game.scene.add(this.group);
    this.dust = null;
    this.restGlows = [];
    this.build();
    this.setupZoneListener();
  }

  build() {
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 400;
      pos[i * 3 + 1] = 2 + Math.random() * 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 400;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xc9d8e8,
      size: 0.35,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.group.add(this.dust);

    for (const rp of this.game.restPoints?.points ?? []) {
      const y = this.game.world.getGroundHeight(rp.position.x, rp.position.z);
      const light = new THREE.PointLight(0xff9944, 0.9, 18, 2);
      light.position.set(rp.position.x, y + 1.2, rp.position.z);
      this.group.add(light);
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.12 })
      );
      glow.position.copy(light.position);
      this.group.add(glow);
      this.restGlows.push({ light, glow, base: rp.position.clone() });
    }
  }

  setupZoneListener() {
    window.addEventListener('zone-changed', (e) => {
      const name = e.detail.zone?.name ?? '';
      if (name.includes('魔法')) this.dust.material.color.setHex(0xccaaee);
      else if (name.includes('米勒') || name.includes('星际')) this.dust.material.color.setHex(0x88aacc);
      else if (name.includes('时线')) this.dust.material.color.setHex(0xc9a962);
      else if (name.includes('混沌')) this.dust.material.color.setHex(0xff6688);
      else if (name.includes('森林')) this.dust.material.color.setHex(0xaaccaa);
      else this.dust.material.color.setHex(0xc9d8e8);
    });
  }

  update(dt, playerPos) {
    if (!this.dust) return;
    const t = performance.now() * 0.001;
    const arr = this.dust.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] += Math.sin(t + arr[i] * 0.01) * dt * 0.4;
      if (arr[i + 1] > 18) arr[i + 1] = 2;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;

    for (const g of this.restGlows) {
      g.light.intensity = 0.7 + Math.sin(t * 3 + g.base.x) * 0.25;
      g.glow.scale.setScalar(1 + Math.sin(t * 2) * 0.15);
      const d = Math.hypot(playerPos.x - g.base.x, playerPos.z - g.base.z);
      g.glow.material.opacity = d < 20 ? 0.18 : 0.08;
    }
  }
}
