/** 递归回溯迷宫 → 房间+门+墙+Boss 大房 */
import { LORE_FRAGMENTS } from '../game/LoreFragments.js';

const CELL = 18;
const BOSS_CELL = 34;
const WALL_H = 5;
const WALL_T = 0.6;

export function generateMaze(gridW, gridH, seed = Date.now()) {
  let s = seed;
  const rnd = () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };

  const visited = Array.from({ length: gridH }, () => Array(gridW).fill(false));
  const walls = Array.from({ length: gridH }, () =>
    Array.from({ length: gridW }, () => ({ n: true, e: true, s: true, w: true }))
  );

  const stack = [[0, 0]];
  visited[0][0] = true;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const neighbors = [];
    if (cz > 0 && !visited[cz - 1][cx]) neighbors.push([cx, cz - 1, 'n', 's']);
    if (cx < gridW - 1 && !visited[cz][cx + 1]) neighbors.push([cx + 1, cz, 'e', 'w']);
    if (cz < gridH - 1 && !visited[cz + 1][cx]) neighbors.push([cx, cz + 1, 's', 'n']);
    if (cx > 0 && !visited[cz][cx - 1]) neighbors.push([cx - 1, cz, 'w', 'e']);
    if (!neighbors.length) { stack.pop(); continue; }
    const pick = neighbors[Math.floor(rnd() * neighbors.length)];
    const [nx, nz, dir, opp] = pick;
    walls[cz][cx][dir] = false;
    walls[nz][nx][opp] = false;
    visited[nz][nx] = true;
    stack.push([nx, nz]);
  }

  const rooms = [];
  for (let gz = 0; gz < gridH; gz++) {
    for (let gx = 0; gx < gridW; gx++) {
      rooms.push({
        id: `r_${gx}_${gz}`,
        gx, gz,
        x: (gx - gridW / 2) * CELL,
        z: (gz - gridH / 2) * CELL,
        w: CELL, d: CELL,
        walls: { ...walls[gz][gx] },
        cleared: false,
        visited: false,
        hasEnemies: true,
        enemySpawns: [],
        lore: null,
      });
    }
  }

  const doors = [];
  for (let gz = 0; gz < gridH; gz++) {
    for (let gx = 0; gx < gridW; gx++) {
      const room = rooms.find((r) => r.gx === gx && r.gz === gz);
      const w = room.walls;
      if (!w.n && gz > 0) doors.push(makeDoor(room, 'n', CELL, rooms, gx, gz - 1));
      if (!w.e && gx < gridW - 1) doors.push(makeDoor(room, 'e', CELL, rooms, gx + 1, gz));
    }
  }

  const spawn = rooms.find((r) => r.gx === 0 && r.gz === 0) ?? rooms[0];
  const exit = findFarthestRoom(spawn, rooms, doors);
  spawn.hasEnemies = false;
  spawn.cleared = true;
  spawn.visited = true;

  exit.isExit = true;
  exit.isBossArena = true;
  exit.hasEnemies = true;
  exit.w = BOSS_CELL;
  exit.d = BOSS_CELL;
  exit.enemySpawns = [];
  exit.bossSpawn = { x: exit.x, z: exit.z };

  for (const room of rooms) {
    if (room.id === spawn.id || room.isExit) continue;
    const n = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      room.enemySpawns.push({
        x: room.x + (rnd() - 0.5) * (CELL - 6),
        z: room.z + (rnd() - 0.5) * (CELL - 6),
        type: ['soldier', 'golem', 'drone'][Math.floor(rnd() * 3)],
        hp: 120 + Math.floor(rnd() * 100),
      });
    }
  }

  const lorePool = [...LORE_FRAGMENTS].sort(() => rnd() - 0.5);
  let li = 0;
  for (const room of rooms.sort(() => rnd() - 0.5)) {
    if (room.isExit || room.id === spawn.id) continue;
    if (rnd() > 0.55 && li < lorePool.length) {
      room.lore = { ...lorePool[li++], discovered: false };
    }
  }

  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const room of rooms) {
    minX = Math.min(minX, room.x - room.w / 2);
    maxX = Math.max(maxX, room.x + room.w / 2);
    minZ = Math.min(minZ, room.z - room.d / 2);
    maxZ = Math.max(maxZ, room.z + room.d / 2);
  }

  return {
    seed, gridW, gridH, cellSize: CELL, bossCell: BOSS_CELL,
    rooms, doors, spawn, exit,
    bounds: { minX, maxX, minZ, maxZ },
    wallH: WALL_H, wallT: WALL_T,
  };
}

function findFarthestRoom(spawn, rooms, doors) {
  const dist = new Map([[spawn.id, 0]]);
  const q = [spawn.id];
  while (q.length) {
    const id = q.shift();
    const d = dist.get(id);
    for (const door of doors) {
      let next = null;
      if (door.fromRoomId === id) next = door.toRoomId;
      if (door.toRoomId === id) next = door.fromRoomId;
      if (next && !dist.has(next)) {
        dist.set(next, d + 1);
        q.push(next);
      }
    }
  }
  let best = spawn;
  let bestD = 0;
  for (const [id, d] of dist) {
    if (d > bestD) {
      bestD = d;
      best = rooms.find((r) => r.id === id) ?? best;
    }
  }
  return best;
}

function makeDoor(fromRoom, dir, cellSize, rooms, tgx, tgz) {
  const toRoom = rooms.find((r) => r.gx === tgx && r.gz === tgz);
  const half = (fromRoom.isBossArena ? fromRoom.w : cellSize) / 2;
  const half2 = (toRoom?.isBossArena ? toRoom.w : cellSize) / 2;
  let x = fromRoom.x;
  let z = fromRoom.z;
  if (dir === 'n') z -= half;
  if (dir === 's') z += half;
  if (dir === 'e') x += half;
  if (dir === 'w') x -= half;
  return {
    id: `d_${fromRoom.gx}_${fromRoom.gz}_${dir}`,
    dir, x, z,
    fromRoomId: fromRoom.id,
    toRoomId: toRoom.id,
    locked: true,
    open: false,
  };
}

export function getRoomAt(layout, wx, wz) {
  for (const room of layout.rooms) {
    if (
      wx >= room.x - room.w / 2 + 0.5
      && wx <= room.x + room.w / 2 - 0.5
      && wz >= room.z - room.d / 2 + 0.5
      && wz <= room.z + room.d / 2 - 0.5
    ) return room;
  }
  return null;
}

export function clampToBounds(layout, wx, wz, margin = 0.8) {
  const b = layout.bounds;
  return {
    x: Math.max(b.minX + margin, Math.min(b.maxX - margin, wx)),
    z: Math.max(b.minZ + margin, Math.min(b.maxZ - margin, wz)),
  };
}
