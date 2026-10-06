import * as THREE from 'three';
import { ProceduralDungeonGenerator } from './ProceduralDungeonGenerator.js';
import { getRoomAt, clampToBounds } from './MazeLayout.js';
import { DungeonBoss } from '../combat/DungeonBoss.js';
import { BOSS_LORE, DUNGEON_ENTER_LINES } from '../game/LoreFragments.js';
import { DUNGEON_DEFS } from '../content/dungeons.js';
import { disposeDungeonSubtree } from './dungeonAssets.js';
import { applyShadow } from '../engine/shadowPolicy.js';

/** 副本每次重建/离开都会走这里（旧实现只 group.remove() 不 dispose，反复进出迷宫会让
 *  GPU 缓冲单调增长）。
 *  **释放权归 `dungeonAssets`**：地下城的几何与材质现在是七座副本共享的（B76），
 *  在这里无差别 dispose 会让"离开一座副本"顺手毁掉另外六座的地面。
 *  所以本地这份函数删掉，改调共享库那个会问归属的版本。 */
const disposeSubtree = disposeDungeonSubtree;

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
      applyShadow(base, 'castOnly');
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
        // 危险区跟着管理器走：副本 Boss 的 id 不在脚本表里，按 `default` 脚本打近战位砸地
        hazards: this.enemyManager.hazards,
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
        // 身份（名字与数值）走 `content/enemies.js` 那一名册：副本里的 `golem` 与图书馆里的
        // 那只是同一只（W-B10 切片2 之前，这里自己抄了一套「构装守卫 / posture 70 / damage 16」，
        // 而没点名的类型一律兜底成「遗城战士」）。房间不该在玩家回头时刷新，所以盖 respawn。
        const enemy = this.enemyManager.spawnAt(e.type, wx, wz, { respawn: false });
        list.push(enemy);
        dungeon.enemies.push(enemy);
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
      `${enterLine ? enterLine + '\n\n' : ''}迷宫 ${dungeon.layout.gridW}×${dungeon.layout.gridH} · ${roomCount} 个房间 · ${doorCount} 扇门。\n清剿房间敌人后门会打开；发光石碑 [{interact}] 读叙事；最远圆房有守钥者。`
    );
    window.dispatchEvent(new CustomEvent('dungeon-enter', {
      // rerun 是 HUD「深渊再探」提示的判据；修前这里从不带，那条提示永远不弹（B44）
      detail: {
        id: dungeon.def.id,
        name: dungeon.def.name,
        rooms: roomCount,
        doors: doorCount,
        rerun: this.cleared.has(dungeon.def.id),
      },
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
    const b = clampToBounds(this.active.layout, local.x, local.z, 1);
    let lx = b.x, lz = b.z;

    // 墙与**关着的门**是同一套推法（切片4h：关着的门 = 一道薄墙）：玩家中心落进
    // 「半轴 + 0.45」的扩展盒里，就沿**绝对剩余距离更短**的那一轴推到盒边界。
    // 落点必须带碰撞盒自己的中心 —— B99：改前写的是 `origin ± 半轴`、少了中心这一项，
    // 1348 个撞入点里 1304 个把玩家从墙边甩到十几米外（墙与门两个循环同款）。
    // 逐盒往下推：后一个盒看到的是推完的位置，不是进门时的旧坐标。
    const 推 = (x, z, hw, hd) => {
      const ox = hw + 0.45, oz = hd + 0.45;
      const dx = lx - x, dz = lz - z;
      if (Math.abs(dx) >= ox || Math.abs(dz) >= oz) return;
      if (dx !== 0 && (dz === 0 || ox - Math.abs(dx) <= oz - Math.abs(dz))) {
        lx = x + Math.sign(dx) * ox;
      } else if (dz !== 0) {
        lz = z + Math.sign(dz) * oz;
      }
    };
    for (const col of this.active.layout.colliders ?? []) 推(col.x, col.z, col.hw, col.hd);
    for (const door of this.active.layout.doors ?? []) {
      if (door.open || !door.collider) continue;
      const c = door.collider;
      推(c.x, c.z, c.hw, c.hd);
    }

    player.position.x = o.x + lx;
    player.position.z = o.z + lz;
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
