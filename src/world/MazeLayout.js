import { LORE_FRAGMENTS } from '../game/LoreFragments.js';

const CELL = 18;
const BOSS_CELL = 34;
const WALL_H = 5;
const WALL_T = 0.6;

/**
 * 递归回溯迷宫 → 房间+门+墙+Boss 大房
 *
 * 「这一座出哪几类、一间房出几只」由调用方递进来的遭遇表说话（`content/dungeonEncounters.js`，
 * W-B10 切片3b）。这一句以前写死在这里：`['soldier','golem','drone'][摇 3]` 配 `1 + 摇 2` 只，
 * 于是五座副本打的是同一场仗（普查 `.tmp-20260930/wb10s1-census.mjs` M2 —— 各跑 200 个种子，
 * 直方图 34 / 34 / 33，无怪房 0 间）。第 4 个参数**必填**：留一个默认池等于把
 * "这座副本忘了登记" 变成 "这座副本悄悄用了别座的敌人"，而后者不是报错，是没人注意的换仗。
 */
export function generateMaze(gridW, gridH, seed = Date.now(), encounters) {
  if (!encounters?.pool?.length || !encounters.group) {
    throw new TypeError(
      'generateMaze 需要一张遭遇表 { pool: [{ type, weight }], group: { min, max } }，'
      + '由 `dungeonEncounterOf(def.id)` 申领（W-B10 切片3b）'
    );
  }
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
    // 一次几只、出哪一类：两个数都从遭遇表来。编组公式与切片3b 之前逐字同形
    // （`min + 摇 (max-min+1)` 在 min=1,max=2 时就是原来的 `1 + 摇 2`），
    // 因为这一片改的是"**出谁**"而不是"难度曲线"——同时动两个变量就没法归因。
    const { min, max } = encounters.group;
    const n = min + Math.floor(rnd() * (max - min + 1));
    // 每只多硬、叫什么，W-B10 切片2 已经交给 `content/enemies.js` 那一名册，所以这里不写 hp。
    for (let i = 0; i < n; i++) {
      room.enemySpawns.push({
        x: room.x + (rnd() - 0.5) * (CELL - 6),
        z: room.z + (rnd() - 0.5) * (CELL - 6),
        type: drawFromPool(encounters.pool, rnd),
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

/**
 * 按权重从池子里抽一类。权重是**相对值**（不必凑成 100）：抽法是把 `rnd()` 落在的
 * `[0, 总权重)` 摊到累计区间上，先跨过的那一类胜出。这样"往池子里加一类"不必重算全表，
 * 而切片1 普查到的那种均匀三分也能用等权表达。
 */
function drawFromPool(pool, rnd) {
  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  let t = rnd() * total;
  for (const entry of pool) {
    t -= entry.weight;
    if (t < 0) return entry.type;
  }
  // 走到这里说明 `rnd()` 给出了不小于 1 的读数 —— 那不是设计里的抽样，让它交到
  // `enemyRosterOf(undefined)` 手上抛（B71 口径：认不出就当场红，不许兜到某一类）
  throw new RangeError(`遭遇池抽样越界：rnd() 给出 ${t + total} / 总权重 ${total}`);
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
