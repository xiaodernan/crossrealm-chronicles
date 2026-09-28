import * as THREE from 'three';
import { ZONE_IDS, ZONE_NAMES } from '../content/ZoneIdentity.js';

/**
 * 营火地标 —— 木牌、光柱、首次发现提示
 *
 * 木牌上的地名除枢纽外一律取**当前区名**（W-B4 切片2）。这张表以前六格全是手抄的，
 * `magic` 那一格抄的是早已废弃的 '魔法遗境' —— 于是第一次走近魔法区那座火，
 * 提示条说"发现营火 · 魔法遗境"，而同一屏脚下写着"霍格沃兹遗境营火"。
 * 枢纽那一格不取区名（'交汇枢纽'）：木牌指的是场地中央那件东西，玩家口中的名字是世界之锚。
 */
const SIGN_LABELS = {
  [ZONE_IDS.HUB]: '世界之锚',
  [ZONE_IDS.FANTASY]: ZONE_NAMES[ZONE_IDS.FANTASY],
  [ZONE_IDS.MAGIC]: ZONE_NAMES[ZONE_IDS.MAGIC],
  [ZONE_IDS.SPACE]: ZONE_NAMES[ZONE_IDS.SPACE],
  [ZONE_IDS.VOID]: ZONE_NAMES[ZONE_IDS.VOID],
  [ZONE_IDS.ABYSS]: ZONE_NAMES[ZONE_IDS.ABYSS],
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
