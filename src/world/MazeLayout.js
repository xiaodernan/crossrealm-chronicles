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
  const rnd = makeSeededRng(seed);

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

  // 洗的是文献池与"发文献的房序"两份**副本**：`rooms` 本体保持网格序（见 `shuffle` 的说明）。
  const lorePool = shuffle(LORE_FRAGMENTS, rnd);
  let li = 0;
  for (const room of shuffle(rooms, rnd)) {
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
 * 迷宫的随机流（W-B10 切片4a，修 B75）。换掉的那一行是
 * `s = (s * 16807) % 2147483647; return (s - 1) / 2147483646;`。
 *
 * 它承诺 `[0,1)`，实际给的是 `[-4.66e-10, 0.9999999995]`，而消费方一律写 `Math.floor(rnd() * 长度)`：
 * 那一发**负零头**取到 `[-1]`（undefined），下一行解构就抛。普查 `.tmp-20260930/wb10s4a-census2.mjs`
 * 把坏的定义域量成了三块，而不是一块：
 * - `seed ≡ 0 (mod 2^31-1)` 整族崩（0 / 2147483647 / 4294967294 / 6442450941 四颗全崩）；
 * - `seed < 0` **整片**崩（随机 100 颗负种子里 100 颗第一发就不可用）—— JS 的 `%` 保留符号，
 *   所以那是半个平面，不是台账原话里那种"个别边界值"；
 * - `NaN` / `Infinity` 崩。
 *
 * 反过来，台账那句"进副本当场崩"在生产侧今天并不成立：唯一的调用点递 `Date.now()`，实测它前后
 * 各 500 万毫秒里 **0 颗**落进坏值。所以这一片修的不是"现在会崩"，是**"种子的定义域没人管"**——
 * 下一个不递 `Date.now()` 的调用方（存档里的种子、掷出来的负数、URL 上的字符串）才会把它变成门口的一次崩溃。
 *
 * 新做法：**有限整数种子 → 32 位整数状态**（mulberry32 那一步）。全是整数算术，积不会越过 2^53，
 * 所以没有"乘法丢低位"那一档；`>>> 0` 之后每一发都落在 `[0,1)` 里 —— 这是构造出来的，不是祈祷的。
 * 状态是 32 位，种子因此以 2^32 为周期。非有限与非数字**不兜底**（B71 口径，与 `dungeonEncounterOf`
 * 同一把尺子）：静默把 `NaN` 折成 0 号种子等于把"调用方递错了"变成"这座副本悄悄用了别座的布局"。
 */
function makeSeededRng(seed) {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    throw new TypeError(
      `generateMaze 的种子必须是一个有限数字（收到 ${typeof seed} ${显示(seed)}）—— `
      + 'NaN / Infinity / 非数字都摇不出可重现的迷宫（W-B10 切片4a，修 B75）'
    );
  }
  let a = fold32(Math.floor(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 报错消息里要把收到的东西说出来，而 `String()` 自己也会抛（Symbol 进了模板、BigInt 进 JSON） */
function 显示(v) {
  try { return String(v); } catch { return Object.prototype.toString.call(v); }
}

/**
 * 把任意有限整数搅成一个 32 位状态：右移—异或—乘大奇素数三段，于是种子的每一位都影响状态，
 * 相邻种子不会只差一位。`>>> 0` 只看得见低 32 位，所以超过 2^32 的种子（`Date.now()` 就是）
 * 把高位乘进来，`seed` 与 `seed + 2^32` 因此不并档。
 */
function fold32(n) {
  const 低 = n >>> 0;
  const 高 = Math.floor(n / 4294967296);
  let x = (低 ^ Math.imul(高, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * 洗一份**副本**：Fisher–Yates（W-B10 切片4b，修 B77）。换掉的是
 * `arr.sort(() => rnd() - 0.5)` 那种"比较器掷硬币"的洗法，它坏在两层，第二层比第一层难查：
 *
 * 1. **分布不匀**。实测 n=5 的 120 种排列全出现过，但恒等排列 `01234` 占 9.54%、最稀的只占
 *    0.18%（理论 0.83%）；同一把流下 Fisher–Yates 的最大偏差是 0.07 个百分点
 *    （`.tmp-20261002/wb10s4b-census.mjs` P1）。落到玩法上是"哪间房带文献"有偏好：
 *    n=25 里 0 号元素挤进前 8 的概率 45.1%，理论 32%（P4）—— 这种洗法把靠前的东西留在靠前。
 * 2. **洗完之后流走到哪儿，由排序实现决定**。那个比较器每比一次吃两发，而比较次数随数据漂：
 *    n=25 实测 61..90 发（P2）。引擎换个排序、数组换个规模，后面每一发（文献落点、池子抽样）
 *    都跟着挪位 —— 于是"同一颗种子给同一座迷宫"只对当前这一个 V8 成立。
 *    Fisher–Yates 恒为 n−1 次交换、n−1 发，流的位置只由规模决定。
 *
 * 返回新数组、不碰传进来的那一个：`LORE_FRAGMENTS` 是模块级共享的表，就地洗它等于
 * 让第二次 `generateMaze` 洗的是已被上一次的种子重排过的那一份。
 * 同样地，迷宫的 `rooms` 也不再被打乱本体 —— 消费者按数组序遍历房间，而那个序不承担任何玩法
 * （房间身份是 `r_x_z`），它今天随机、明天可能又不随机，只是没人说过它该是什么样。
 */
export function shuffle(arr, rnd) {
  const out = Array.from(arr);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
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
  // 门开在 **from 那一侧**的边界上，所以只需要 from 的半个尺寸；
  // 原先还算了 to 的 `half2` 但没人用（W-B1 切片4 清掉）
  const half = (fromRoom.isBossArena ? fromRoom.w : cellSize) / 2;
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
