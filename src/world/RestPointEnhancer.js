import * as THREE from 'three';

/** 营火地标 — 木牌、光柱、首次发现提示 */
const SIGN_LABELS = {
  hub: '世界之锚',
  fantasy: '灰白森林',
  magic: '魔法遗境',
  space: '米勒荒原',
  void: '破碎时线',
  abyss: '混沌边境',
};

export class RestPointEnhancer {
  constructor(restPoints, game) {
    this.game = game;
    this.discovered = new Set();
    for (const p of restPoints.points) {
      this._enhance(p);
    }
  }

  _enhance(point) {
    const label = SIGN_LABELS[point.id] ?? point.name;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a4035, roughness: 0.9 })
    );
    post.position.set(-0.6, 0.8, 0.3);
    post.castShadow = true;
    point.mesh.add(post);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.35, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.85, emissive: 0x221100, emissiveIntensity: 0.2 })
    );
    board.position.set(-0.6, 1.55, 0.3);
    board.rotation.y = 0.35;
    point.mesh.add(board);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.12, 8, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    beam.position.y = 4.5;
    point.mesh.add(beam);
    point.landmarkBeam = beam;
    point.zoneLabel = label;
  }

  update(dt, playerPos) {
    for (const p of this.game.restPoints.points) {
      const d = Math.hypot(playerPos.x - p.position.x, playerPos.z - p.position.z);
      if (p.landmarkBeam) {
        p.landmarkBeam.material.opacity = 0.05 + Math.max(0, 1 - d / 40) * 0.12;
        p.landmarkBeam.rotation.y += dt * 0.4;
      }
      if (d < 12 && !this.discovered.has(p.id)) {
        this.discovered.add(p.id);
        this.game.dialog.toast(`发现营火 · ${p.zoneLabel ?? p.name}`, 2800);
        this.game.explorationMap?.revealZone?.(p.id);
        this.game.storyJournal?.add?.({
          id: `rest-found-${p.id}`,
          category: 'campfire',
          title: p.zoneLabel ?? p.name,
          text: `在 ${p.name} 与常驻 NPC 交谈可获战术提示。`,
          chapter: this.game.quests?.chapter ?? 1,
        });
      }
    }
  }

  toJSON() {
    return { discovered: [...this.discovered] };
  }

  fromJSON(data) {
    if (data?.discovered) this.discovered = new Set(data.discovered);
  }
}
