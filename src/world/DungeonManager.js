import * as THREE from 'three';
import { ProceduralDungeonGenerator } from './ProceduralDungeonGenerator.js';
import { getRoomAt, clampToBounds } from './MazeLayout.js';
import { DungeonBoss } from '../combat/DungeonBoss.js';
import { BOSS_LORE, DUNGEON_ENTER_LINES } from '../game/LoreFragments.js';

const DUNGEON_DEFS = [
  {
    id: 'ruin-crypt',
    name: '灰白遗城',
    theme: 0x4a5048,
    accent: 0xc9a962,
    themeType: 'soldier',
    gridW: 6,
    gridH: 6,
    origin: { x: 5000, y: 120, z: 5000 },
    entrance: { x: -190, z: 25 },
    exterior: { x: -190, z: 25, label: '灰白遗城入口' },
  },
  {
    id: 'forbidden-library',
    name: '禁书图书馆',
    theme: 0x2a2040,
    accent: 0xaa66ff,
    themeType: 'golem',
    gridW: 5,
    gridH: 6,
    origin: { x: 5000, y: 120, z: 6500 },
    entrance: { x: -35, z: -200 },
    exterior: { x: -35, z: -200, label: '图书馆侧门' },
  },
  {
    id: 'five-dim-rift',
    name: '五维裂隙',
    theme: 0x0a1830,
    accent: 0x66ccff,
    themeType: 'drone',
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 8000 },
    entrance: { x: 175, z: 95 },
    exterior: { x: 175, z: 95, label: '裂隙观测站' },
  },
  {
    id: 'forest-shrine',
    name: '古树神龛',
    theme: 0x2a3828,
    accent: 0x88cc66,
    themeType: 'soldier',
    gridW: 4,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 9500 },
    entrance: { x: -230, z: -15 },
    exterior: { x: -230, z: -15, label: '神龛石门' },
  },
  {
    id: 'hub-catacombs',
    name: '枢纽地下墓穴',
    theme: 0x3a3530,
    accent: 0xffaa44,
    themeType: 'elite',
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 80, z: 11000 },
    entrance: { x: 28, z: 72 },
    exterior: { x: 28, z: 72, label: '墓穴阶梯' },
  },
];

/** 递归释放并摘下一棵子树的网格资源。副本每次重建/离开都会走这里，
 *  旧实现只 group.remove() 不 dispose，反复进出迷宫会让 GPU 缓冲单调增长。 */
function disposeSubtree(root) {
  for (const child of [...root.children]) {
    root.remove(child);
    child.traverse((o) => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m?.dispose?.());
      else o.material?.dispose?.();
    });
  }
}

export class DungeonManager {
  constructor(scene, world, dialog, enemyManager, game = null) {
    this.scene = scene;
    this.world = world;
    this.dialog = dialog;
    this.enemyManager = enemyManager;
    this.game = game;
    this.dungeons = new Map();
    this.active = null;
    this.currentRoomId = null;
    this.returnPos = new THREE.Vector3();
    this.cleared = new Set();
    this.rerunUnlocked = false;
    this.exteriorGroup = new THREE.Group();
    this.exteriorGroup.name = 'ExplorationExteriors';
    scene.add(this.exteriorGroup);
    this.build();
    this.buildEntranceMarkers();
    this.buildExteriorShells();
    window.addEventListener('quest-updated', (e) => {
      if ((e.detail.chapter ?? 1) >= 5) this.rerunUnlocked = true;
    });
    window.addEventListener('enemy-defeated', () => this._checkRoomClear());
    // 在迷宫内死亡会被传回世界之锚，但 active 仍挂着会让玩家失去世界碰撞（走 bug）。
    // 这里按事件退出并释放本次副本资源，不反向读取战斗系统字段。
    window.addEventListener('player-respawn', () => this.abandonRun());
  }

  abandonRun() {
    if (!this.active) return;
    const dungeon = this.active;
    this.active = null;
    this.currentRoomId = null;
    this.resetDungeon(dungeon);
    window.dispatchEvent(new CustomEvent('game-audio-mode', { detail: { mode: 'zone' } }));
  }

  buildExteriorShells() {
    for (const def of DUNGEON_DEFS) {
      if (!def.exterior) continue;
      const g = new THREE.Group();
      const gy = this.world.getGroundHeight(def.exterior.x, def.exterior.z);
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.9 });
      const archMat = new THREE.MeshStandardMaterial({
        color: def.accent,
        emissive: def.accent,
        emissiveIntensity: 0.25,
      });

      const base = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 8), wallMat);
      base.position.y = 3;
      base.castShadow = true;
      g.add(base);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(7, 3, 4), wallMat);
      roof.position.y = 7.5;
      roof.rotation.y = Math.PI / 4;
      g.add(roof);

      const door = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4, 0.3), archMat);
      door.position.set(0, 2, 4.1);
      g.add(door);

      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 0.8),
        new THREE.MeshBasicMaterial({ color: def.accent, transparent: true, opacity: 0.85 })
      );
      sign.position.set(0, 5.5, 4.2);
      g.add(sign);

      g.position.set(def.exterior.x, gy, def.exterior.z);
      g.userData.dungeonId = def.id;
      this.exteriorGroup.add(g);
    }
  }

  buildEntranceMarkers() {
    for (const def of DUNGEON_DEFS) {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: def.accent,
        emissive: def.accent,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.85,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 8, 32), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1.5;
      group.add(ring);
      const y = this.world.getGroundHeight(def.entrance.x, def.entrance.z);
      group.position.set(def.entrance.x, y, def.entrance.z);
      this.scene.add(group);
    }
  }

  build() {
    for (const def of DUNGEON_DEFS) {
      this.dungeons.set(def.id, this.buildDungeon(def));
    }
  }

  buildDungeon(def) {
    const group = new THREE.Group();
    group.position.set(def.origin.x, def.origin.y, def.origin.z);
    this.scene.add(group);
    return { def, group, enemies: [], roomEnemies: new Map(), spawned: false, layout: null, boss: null, bossSpawned: false };
  }

  getEntranceNear(pos, range = 5) {
    for (const [, d] of this.dungeons) {
      if (this.cleared.has(d.def.id) && !this.rerunUnlocked) continue;
      const e = d.def.entrance;
      const dist = Math.hypot(pos.x - e.x, pos.z - e.z);
      if (dist < range) return d;
    }
    return null;
  }

  resetDungeon(dungeon) {
    /* 召唤物不在 `dungeon.enemies` 里（它们是战斗中由管理器生成的），
     * 但它们的网格同样挂在这次的场景上 —— 不清就会跟着玩家回枢纽，成为隐形占场的敌人 */
    this.enemyManager.clearSummons?.();
    for (const e of dungeon.enemies) {
      e.alive = false;
      e.dispose?.();
    }
    const stale = new Set(dungeon.enemies);
    const list = this.enemyManager.enemies;
    for (let i = list.length - 1; i >= 0; i--) if (stale.has(list[i])) list.splice(i, 1);
    dungeon.enemies = [];
    dungeon.roomEnemies = new Map();
    dungeon.spawned = false;
    dungeon.layout = null;
    dungeon.boss = null;
    dungeon.bossSpawned = false;
    disposeSubtree(dungeon.group);
  }

  _worldToLocal(dungeon, wx, wz) {
    return { x: wx - dungeon.def.origin.x, z: wz - dungeon.def.origin.z };
  }

  _spawnRoomEnemies(dungeon, room) {
    if (dungeon.roomEnemies.has(room.id)) return;
    const list = [];

    if (room.isBossArena && !dungeon.bossSpawned) {
      dungeon.bossSpawned = true;
      const wx = dungeon.def.origin.x + room.x;
      const wz = dungeon.def.origin.z + room.z;
      const boss = new DungeonBoss(this.scene, this.world, {
        name: BOSS_LORE[dungeon.def.id]?.title ?? `${dungeon.def.name}守钥者`,
        x: wx,
        z: wz,
        hp: 480 + dungeon.layout.rooms.length * 25,
        dungeonId: dungeon.def.id,
        bossId: `dungeon-${dungeon.def.id}`,
      });
      boss.setDialogToast((msg) => this.dialog.toast(msg));
      list.push(boss);
      dungeon.boss = boss;
      dungeon.enemies.push(boss);
      this.enemyManager.enemies.push(boss);
      window.dispatchEvent(new CustomEvent('boss-start', {
        detail: { name: boss.name, bossId: boss.bossId, position: boss.position.clone() },
      }));
      this.dialog.show(BOSS_LORE[dungeon.def.id]?.title ?? '迷宫守钥者', BOSS_LORE[dungeon.def.id]?.text ?? '击败守钥者以打开出口。');
      window.dispatchEvent(new CustomEvent('game-audio-mode', { detail: { mode: 'boss' } }));
    } else if (!room.isBossArena) {
      for (const e of room.enemySpawns) {
        const wx = dungeon.def.origin.x + e.x;
        const wz = dungeon.def.origin.z + e.z;
        const cfg = {
          name: e.type === 'golem' ? '构装守卫' : e.type === 'drone' ? '裂隙无人机' : '遗城战士',
          type: e.type,
          x: wx,
          z: wz,
          hp: e.hp,
          posture: 70,
          damage: 16,
          respawn: false,
          aggroRange: 14,
        };
        list.push(this.enemyManager.spawn(cfg));
        dungeon.enemies.push(list[list.length - 1]);
      }
    }

    dungeon.roomEnemies.set(room.id, list);
  }

  _unlockDoorsFromRoom(dungeon, roomId) {
    const layout = dungeon.layout;
    let opened = false;
    for (const door of layout.doors) {
      if (door.fromRoomId === roomId || door.toRoomId === roomId) {
        if (!door.open) opened = true;
        ProceduralDungeonGenerator.setDoorOpen(layout, door, true);
      }
    }
    if (opened) window.dispatchEvent(new CustomEvent('game-audio-sfx', { detail: { sfx: 'doorOpen' } }));
  }

  _checkRoomClear() {
    if (!this.active?.layout) return;
    const dungeon = this.active;
    for (const room of dungeon.layout.rooms) {
      if (room.cleared || !room.visited) continue;
      const list = dungeon.roomEnemies.get(room.id) ?? [];
      if (list.length && list.every((e) => !e.alive)) {
        room.cleared = true;
        this._unlockDoorsFromRoom(dungeon, room.id);
        this.dialog.toast(`房间已清空 — 门已打开`);
        window.dispatchEvent(new CustomEvent('game-audio-sfx', { detail: { sfx: 'roomClear' } }));
        window.dispatchEvent(new CustomEvent('dungeon-room-cleared', { detail: { roomId: room.id, dungeonId: dungeon.def.id } }));
        if (room.isBossArena) {
          this.dialog.toast('守钥者已倒下 — 出口已开启');
          window.dispatchEvent(new CustomEvent('game-audio-sfx', { detail: { sfx: 'levelUp' } }));
        } else if (Math.random() < 0.22) {
          this.dialog.toast('隐藏补给：体力与生命略微恢复');
          window.dispatchEvent(new CustomEvent('dungeon-supply', { detail: { hp: 8, stamina: 15 } }));
        }
      }
    }
  }

  enter(dungeon, player) {
    if (this.active) return;
    this.active = dungeon;
    this.returnPos.copy(player.position);

    if (!dungeon.spawned) {
      dungeon.spawned = true;
      dungeon.layout = ProceduralDungeonGenerator.generate(dungeon.def, Date.now());
      disposeSubtree(dungeon.group);
      ProceduralDungeonGenerator.buildGeometry(dungeon.group, dungeon.layout, dungeon.def);
      for (const door of dungeon.layout.doors) {
        ProceduralDungeonGenerator.setDoorOpen(dungeon.layout, door, false);
      }
    }

    const spawn = dungeon.layout.spawn;
    this.currentRoomId = spawn.id;
    spawn.visited = true;
    spawn.cleared = true;
    for (const door of dungeon.layout.doors) {
      if (door.fromRoomId === spawn.id || door.toRoomId === spawn.id) {
        ProceduralDungeonGenerator.setDoorOpen(dungeon.layout, door, true);
      }
    }
    player.teleport(
      dungeon.def.origin.x + spawn.x,
      dungeon.def.origin.y,
      dungeon.def.origin.z + spawn.z
    );

    const roomCount = dungeon.layout.rooms.length;
    const doorCount = dungeon.layout.doors.length;
    const enterLine = DUNGEON_ENTER_LINES[dungeon.def.id];
    this.dialog.show(
      dungeon.def.name,
      `${enterLine ? enterLine + '\n\n' : ''}迷宫 ${dungeon.layout.gridW}×${dungeon.layout.gridH} · ${roomCount} 个房间 · ${doorCount} 扇门。\n清剿房间敌人后门会打开；发光石碑 [E] 读叙事；最远圆房有守钥者。`
    );
    window.dispatchEvent(new CustomEvent('dungeon-enter', {
      detail: { id: dungeon.def.id, name: dungeon.def.name, rooms: roomCount, doors: doorCount },
    }));
    window.dispatchEvent(new CustomEvent('game-audio-mode', { detail: { mode: 'dungeon' } }));
  }

  getNearbyLore(playerPos) {
    if (!this.active?.layout) return null;
    const local = this._worldToLocal(this.active, playerPos.x, playerPos.z);
    for (const mesh of this.active.layout.loreMeshes ?? []) {
      const lore = mesh.userData.lore;
      if (!lore || lore.discovered) continue;
      const dx = local.x - mesh.position.x;
      const dz = local.z - mesh.position.z;
      if (Math.hypot(dx, dz) <= 3.2) return lore;
    }
    return null;
  }

  tryReadLore(playerPos) {
    if (!this.active?.layout) return false;
    const local = this._worldToLocal(this.active, playerPos.x, playerPos.z);
    for (const mesh of this.active.layout.loreMeshes ?? []) {
      const lore = mesh.userData.lore;
      if (!lore || lore.discovered) continue;
      const dx = local.x - mesh.position.x;
      const dz = local.z - mesh.position.z;
      if (Math.hypot(dx, dz) > 3) continue;
      lore.discovered = true;
      this.dialog.show(lore.title, lore.text);
      window.dispatchEvent(new CustomEvent('discovery', {
        detail: { id: lore.id, title: lore.title, text: lore.text, category: 'fragment' },
      }));
      window.dispatchEvent(new CustomEvent('game-audio-sfx', { detail: { sfx: 'loreDiscover' } }));
      return true;
    }
    return false;
  }

  updatePlayerRoom(playerPos) {
    if (!this.active?.layout) return null;
    const local = this._worldToLocal(this.active, playerPos.x, playerPos.z);
    const room = getRoomAt(this.active.layout, local.x, local.z);
    if (room && room.id !== this.currentRoomId) {
      this.currentRoomId = room.id;
      room.visited = true;
      if (room.hasEnemies && !room.cleared && !this.active.roomEnemies.has(room.id)) {
        this._spawnRoomEnemies(this.active, room);
        this.dialog.toast('敌人出现！');
      }
      window.dispatchEvent(new CustomEvent('dungeon-room-enter', { detail: { roomId: room.id } }));
    }
    return room;
  }

  clampPlayer(player) {
    if (!this.active?.layout) return;
    const o = this.active.def.origin;
    const local = this._worldToLocal(this.active, player.position.x, player.position.z);
    const c = clampToBounds(this.active.layout, local.x, local.z, 1);
    player.position.x = o.x + c.x;
    player.position.z = o.z + c.z;

    for (const col of this.active.layout.colliders ?? []) {
      const dx = local.x - col.x;
      const dz = local.z - col.z;
      const ox = col.hw + 0.45;
      const oz = col.hd + 0.45;
      if (Math.abs(dx) < ox && Math.abs(dz) < oz) {
        const px = (Math.abs(dx) / ox) > (Math.abs(dz) / oz)
          ? Math.sign(dx) * ox
          : local.x;
        const pz = (Math.abs(dx) / ox) <= (Math.abs(dz) / oz)
          ? Math.sign(dz) * oz
          : local.z;
        player.position.x = o.x + px;
        player.position.z = o.z + pz;
      }
    }
    for (const door of this.active.layout.doors ?? []) {
      if (door.open || !door.collider) continue;
      const c = door.collider;
      const dx = local.x - c.x;
      const dz = local.z - c.z;
      if (Math.abs(dx) < c.hw + 0.4 && Math.abs(dz) < c.hd + 0.4) {
        player.position.x = o.x + (Math.abs(dx) > 0.01 ? Math.sign(dx) * (c.hw + 0.45) : local.x);
        player.position.z = o.z + (Math.abs(dz) > 0.01 ? Math.sign(dz) * (c.hd + 0.45) : local.z);
      }
    }
  }

  getNearestDoor(playerPos, range = 3.5) {
    if (!this.active?.layout) return null;
    const local = this._worldToLocal(this.active, playerPos.x, playerPos.z);
    let best = null;
    let minD = range;
    for (const door of this.active.layout.doors) {
      if (door.open) continue;
      const d = Math.hypot(local.x - door.x, local.z - door.z);
      if (d < minD) { minD = d; best = door; }
    }
    return best;
  }

  tryUseDoor(playerPos) {
    return false;
  }

  tryExit(playerPos) {
    if (!this.active?.layout) return false;
    const local = this._worldToLocal(this.active, playerPos.x, playerPos.z);
    const exitRoom = this.active.layout.exit;
    const dist = Math.hypot(local.x - exitRoom.x, local.z - exitRoom.z);
    if (dist > 4) return false;

    if (!exitRoom.cleared) {
      const list = this.active.roomEnemies.get(exitRoom.id) ?? [];
      if (!this.active.bossSpawned) this._spawnRoomEnemies(this.active, exitRoom);
      const all = this.active.roomEnemies.get(exitRoom.id) ?? list;
      if (all.some((e) => e.alive)) {
        this.dialog.toast('击败守钥者后再从出口离开');
        return false;
      }
      exitRoom.cleared = true;
    }

    if (this.active.boss?.alive) {
      this.dialog.toast('击败守钥者后再离开');
      return false;
    }

    this.cleared.add(this.active.def.id);
    const leaving = this.active;
    this.game?.stats?.addSouls?.(25 + Math.floor(Math.random() * 15));
    window.dispatchEvent(new CustomEvent('stats-changed', { detail: this.game.stats.toJSON() }));
    window.dispatchEvent(new CustomEvent('dungeon-cleared', { detail: { id: this.active.def.id } }));
    playerPos.copy(this.returnPos);
    this.active = null;
    this.currentRoomId = null;
    this.resetDungeon(leaving);
    this.game.player?.resolveOverlap?.();
    window.dispatchEvent(new CustomEvent('game-audio-mode', { detail: { mode: 'zone' } }));
    this.dialog.toast('迷宫探索完成！');
    return true;
  }

  getExplorationHint() {
    if (!this.active?.layout) return null;
    const layout = this.active.layout;
    const room = layout.rooms.find((r) => r.id === this.currentRoomId);
    const cleared = layout.rooms.filter((r) => r.cleared).length;
    const visited = layout.rooms.filter((r) => r.visited).length;
    const enemies = (this.active.roomEnemies.get(this.currentRoomId) ?? []).filter((e) => e.alive).length;
    const bossAlive = this.active.boss?.alive;
    return {
      name: this.active.def.name,
      room: room?.id ?? '?',
      cleared,
      total: layout.rooms.length,
      visited,
      enemies,
      isExit: room?.isExit,
      bossAlive,
    };
  }

  isInside() {
    return this.active !== null;
  }

  getGroundHeight() {
    if (!this.active) return 0;
    return this.active.def.origin.y;
  }

  update(dt) {
    if (!this.active) return;
  }

  getClearedCount() {
    return this.cleared.size;
  }
}
