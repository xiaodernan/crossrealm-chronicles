import * as THREE from 'three';
import { generateMaze } from './MazeLayout.js';
import { dungeonEncounterOf } from '../content/dungeonEncounters.js';

/** 程序化迷宫地下城 — 多房间、多门、可探索 */
export class ProceduralDungeonGenerator {
  static generate(def, seed = Date.now()) {
    const gridW = def.gridW ?? 5;
    const gridH = def.gridH ?? 5;
    // 「出谁、几只」按副本 id 认领遭遇表（W-B10 切片3b）：认不出就抛，而不是兜到某一座的池子。
    const layout = generateMaze(gridW, gridH, seed, dungeonEncounterOf(def.id));
    layout.theme = def.theme;
    layout.accent = def.accent;
    layout.name = def.name;
    return layout;
  }

  static buildGeometry(group, layout, def) {
    group.userData.layout = layout;
    group.userData.colliders = [];

    const floorMat = new THREE.MeshStandardMaterial({
      color: def.theme,
      roughness: 0.88,
      metalness: 0.06,
      envMapIntensity: 0.35,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(def.theme).multiplyScalar(0.75),
      roughness: 0.9,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: def.accent,
      emissive: def.accent,
      emissiveIntensity: 0.55,
    });
    const doorClosedMat = new THREE.MeshStandardMaterial({
      color: 0x3a3028,
      roughness: 0.85,
      metalness: 0.2,
    });
    const doorOpenMat = new THREE.MeshStandardMaterial({
      color: def.accent,
      emissive: def.accent,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.5,
    });

    const CS = layout.cellSize;
    const WH = layout.wallH;
    const WT = layout.wallT;
    const doorW = 4;

    layout.loreMeshes = [];

    for (const room of layout.rooms) {
      const rw = room.w ?? CS;
      const rd = room.d ?? CS;

      if (room.isBossArena) {
        ProceduralDungeonGenerator._buildBossArena(group, room, layout, def, accentMat, wallMat);
        continue;
      }

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(rw - 0.2, rd - 0.2), floorMat.clone());
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(room.x, 0.02, room.z);
      floor.receiveShadow = true;
      group.add(floor);

      const torch = new THREE.PointLight(def.accent, 0.35, 14);
      torch.position.set(room.x, 3.2, room.z);
      group.add(torch);

      const w = room.walls;
      if (w.n) addWallSegment(group, wallMat, room.x, room.z - rd / 2, rw, WT, WH, layout);
      else addWallWithGap(group, wallMat, room.x, room.z - rd / 2, rw, WT, WH, doorW, layout);
      if (w.s) addWallSegment(group, wallMat, room.x, room.z + rd / 2, rw, WT, WH, layout);
      else addWallWithGap(group, wallMat, room.x, room.z + rd / 2, rw, WT, WH, doorW, layout);
      if (w.w) addWallSegment(group, wallMat, room.x - rw / 2, room.z, WT, rd, WH, layout, true);
      else addWallWithGap(group, wallMat, room.x - rw / 2, room.z, WT, rd, WH, doorW, layout, true);
      if (w.e) addWallSegment(group, wallMat, room.x + rw / 2, room.z, WT, rd, WH, layout, true);
      else addWallWithGap(group, wallMat, room.x + rw / 2, room.z, WT, rd, WH, doorW, layout, true);

      if (room.lore) {
        const ob = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 1.6, 0.3),
          accentMat.clone()
        );
        ob.position.set(room.x + rw * 0.25, 0.8, room.z - rd * 0.2);
        ob.userData.lore = room.lore;
        ob.userData.roomId = room.id;
        ob.name = 'lore_shard';
        group.add(ob);
        layout.loreMeshes.push(ob);
      }
    }

    layout.doorMeshes = [];
    for (const door of layout.doors) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.2, 0.5), doorClosedMat.clone());
      panel.position.set(door.x, 2.1, door.z);
      if (door.dir === 'n' || door.dir === 's') panel.rotation.y = 0;
      else panel.rotation.y = Math.PI / 2;
      panel.userData.door = door;
      panel.name = `door_${door.id}`;
      group.add(panel);
      layout.doorMeshes.push(panel);
      door.collider = { x: door.x, z: door.z, hw: 2, hd: 0.45, open: false };

      const frame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.8, 0.15), accentMat.clone());
      frame.position.copy(panel.position);
      frame.position.y = 2.4;
      if (door.dir === 'e' || door.dir === 'w') frame.rotation.y = Math.PI / 2;
      frame.userData.isFrame = true;
      group.add(frame);
    }

    layout._doorClosedMat = doorClosedMat;
    layout._doorOpenMat = doorOpenMat;
  }

  static setDoorOpen(layout, door, open) {
    door.open = open;
    door.locked = !open;
    if (door.collider) door.collider.open = open;
    const mesh = layout.doorMeshes?.find((m) => m.userData.door?.id === door.id);
    if (!mesh) return;
    mesh.visible = !open;
  }

  static _buildBossArena(group, room, layout, def, accentMat, wallMat) {
    const rw = room.w;
    const rd = room.d;
    const WH = layout.wallH;
    const WT = layout.wallT;
    const doorW = 5;

    const floorMat = new THREE.MeshStandardMaterial({
      color: def.accent,
      emissive: def.accent,
      emissiveIntensity: 0.08,
      roughness: 0.75,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(rw * 0.45, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.x, 0.03, room.z);
    floor.receiveShadow = true;
    group.add(floor);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = room.x + Math.cos(a) * rw * 0.38;
      const pz = room.z + Math.sin(a) * rd * 0.38;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, WH + 1, 8), wallMat.clone());
      pillar.position.set(px, (WH + 1) / 2, pz);
      pillar.castShadow = true;
      group.add(pillar);
      pushCollider(layout, px, pz, 1.2, 1.2);
    }

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(8, 0.2, 8, 48),
      accentMat.clone()
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(room.x, 0.15, room.z);
    group.add(ring);

    const exit = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.18, 10, 40), accentMat.clone());
    exit.rotation.x = Math.PI / 2;
    exit.position.set(room.x + rw * 0.32, 1.5, room.z);
    exit.name = 'exit';
    group.add(exit);

    const bossLight = new THREE.PointLight(def.accent, 0.9, 40);
    bossLight.position.set(room.x, 6, room.z);
    group.add(bossLight);

    const w = room.walls;
    if (w.n) addWallSegment(group, wallMat, room.x, room.z - rd / 2, rw, WT, WH, layout);
    else addWallWithGap(group, wallMat, room.x, room.z - rd / 2, rw, WT, WH, doorW, layout);
    if (w.s) addWallSegment(group, wallMat, room.x, room.z + rd / 2, rw, WT, WH, layout);
    else addWallWithGap(group, wallMat, room.x, room.z + rd / 2, rw, WT, WH, doorW, layout);
    if (w.w) addWallSegment(group, wallMat, room.x - rw / 2, room.z, WT, rd, WH, layout, true);
    else addWallWithGap(group, wallMat, room.x - rw / 2, room.z, WT, rd, WH, doorW, layout, true);
    if (w.e) addWallSegment(group, wallMat, room.x + rw / 2, room.z, WT, rd, WH, layout, true);
    else addWallWithGap(group, wallMat, room.x + rw / 2, room.z, WT, rd, WH, doorW, layout, true);
  }
}

function addWallSegment(group, mat, x, z, w, d, h, layout) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.clone());
  m.position.set(x, h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  pushCollider(layout, x, z, w, d);
}

function addWallWithGap(group, mat, x, z, totalLen, thickness, h, gap, layout, alongZ = false) {
  const seg = (totalLen - gap) / 2;
  if (alongZ) {
    addWallSegment(group, mat, x, z - totalLen / 2 + seg / 2, thickness, seg, h, layout);
    addWallSegment(group, mat, x, z + totalLen / 2 - seg / 2, thickness, seg, h, layout);
  } else {
    addWallSegment(group, mat, x - totalLen / 2 + seg / 2, z, seg, thickness, h, layout);
    addWallSegment(group, mat, x + totalLen / 2 - seg / 2, z, seg, thickness, h, layout);
  }
}

function pushCollider(layout, x, z, w, d) {
  layout.colliders = layout.colliders || [];
  layout.colliders.push({ x, z, hw: w / 2, hd: d / 2 });
}
