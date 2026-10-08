/**
 * 离线烘焙：把 `content/materialSurfaces.js` 里的规格表变成 `public/textures/` 下的 PNG。
 * 跑法：`npm run bake:textures`（写文件）。
 *
 * ## 设计口径
 *
 * - **确定性**：全部随机来自整数 hash（`hash2`），没有 `Math.random`、没有时间。
 *   同一份规格在同一台机器上永远是同一串字节（zlib 版本若换、字节可能变，
 *   所以门禁比对的是**解出来的像素**，不是字节 —— 见 `tests/material-surfaces.test.js`）。
 * - **可平铺**：噪声在环面上取值（lattice 取模）、砖块索引同样取模，所以左右/上下
 *   接缝处的图案本来就是连续的，不靠"修边"。
 * - **自带 PNG 编码**：只依赖 `node:zlib`。仓库没有图像库，加一个只为一个脚本服务
 *   的依赖不值；PNG 的编码面（三种块 + CRC + deflate）正好是能写全的大小。
 * - **法线是烘出来的，不是画的**：先有高度场（砖块高度 + 灰缝下凹 + 颗粒），
 *   再由环面上的中心差分求梯度 —— 粗糙度与法线共享同一套"离砖缝的距离"事实。
 */
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SURFACE_SPECS } from '../src/content/materialSurfaces.js';

/* ------------------------------------------------------------------ *
 * PNG 编码（IHDR / IDAT / IEND，8 位，RGB 或灰度）
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

/** PNG 块用的 CRC-32（无符号）。测试端独立实现一份，互为见证 */
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  return Buffer.concat([u32be(data.length), body, u32be(crc32(body))]);
}

/**
 * 像素 → PNG 字节。`pixels` 是行优先的 `Uint8Array`（gray 时每像素 1 字节，否则 RGB）。
 * 每行统一用过滤器 0（直存）—— 这是本编码器的唯一过滤器，解码端只需跳过首字节。
 */
export function encodePNG(width, height, pixels, { gray = false } = {}) {
  const channels = gray ? 1 : 3;
  const stride = width * channels;
  if (pixels.length !== stride * height) {
    throw new TypeError(`像素数不对：期望 ${stride * height} 字节，拿到 ${pixels.length}`);
  }
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.concat([
    u32be(width), u32be(height),
    Buffer.from([8, gray ? 0 : 2, 0, 0, 0]), // 8 位 / 颜色类型 / 压缩 / 过滤 / 隔行
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ *
 * 噪声：整数 hash + 环面值噪声
 * ------------------------------------------------------------------ */

/** 格点 hash → [0,1)。三位整数混合（imul 链），确定性、无状态 */
export function hash2(x, y, seed) {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smoothstep = (t) => t * t * (3 - 2 * t);
const frac = (v) => v - Math.floor(v);

/**
 * 环面上的值噪声。`u / v ∈ [0,1)`，格点数 `lattice` 必须整除贴图像素边长
 * （调用方由规格表保证），格点坐标按 lattice 取模 —— 这就是"可平铺"的全部秘密。
 */
export function valueNoise(u, v, lattice, seed) {
  const x = u * lattice;
  const y = v * lattice;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);
  const x0 = ((ix % lattice) + lattice) % lattice;
  const y0 = ((iy % lattice) + lattice) % lattice;
  const x1 = (x0 + 1) % lattice;
  const y1 = (y0 + 1) % lattice;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

/** 多层值噪声叠加 */
export function fbm(u, v, octaves, seed) {
  let sum = 0;
  for (const { lattice, amp } of octaves) sum += amp * valueNoise(u, v, lattice, seed + lattice);
  return sum;
}

/* ------------------------------------------------------------------ *
 * 高度场 → 法线（两个图案族共用）
 * ------------------------------------------------------------------ */

/**
 * 高度场 → 切线空间法线（环面中心差分；图里 y 向下 ⇒ G 通道取 +dH/dy_img，V 轴在 UV 里朝上）。
 * 分块族与拉丝族共用这一段：法线怎么从高度场来是两个族共有的机制，换的只是高度场本身。
 */
export function normalFromHeight(height, W, H, S) {
  const normal = new Uint8Array(W * H * 3);
  const hAt = (x, y) => height[(((y % H) + H) % H) * W + (((x % W) + W) % W)];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dHdx = (hAt(x + 1, y) - hAt(x - 1, y)) / 2;
      const dHdy = (hAt(x, y + 1) - hAt(x, y - 1)) / 2;
      let nx = -dHdx * S;
      let ny = dHdy * S;
      const nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv;
      ny *= inv;
      const i = (y * W + x) * 3;
      normal[i] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
    }
  }
  return normal;
}

/* ------------------------------------------------------------------ *
 * 分块表面（石砌 / 石板 / 木板）：高度场 → 法线 + 粗糙度
 * ------------------------------------------------------------------ */

/**
 * 生成一张"分块"表面的三件套（石砌 / 石板 / 木板共用这一套机制，差在尺子：
 * 行/列数、缝宽、错缝比例、相位 —— 木板的 rows=1 即"整高无横缝的竖板"）。返回：
 * - `heightField`：Float32Array(W×H)，行优先（y 向下，与像素同序）
 * - `normal`：Uint8Array(W×H×3)，切线空间法线（R=+U 方向，G=+V 方向，three 口径）
 * - `roughness`：Uint8Array(W×H)，乘性粗糙度贴图（消费方 material.roughness 置 1）
 */
export function buildTiledSurface(spec) {
  const W = spec.size;
  const H = spec.size;
  const { rows, cols, mortarPx, stagger, phase } = spec.bricks;
  const rowPx = W / rows;
  const blockPx = W / cols;
  const seed = spec.seed;

  // 一、高度场：砖块随机高度 × 灰缝下凹 + 颗粒
  const height = new Float32Array(W * H);
  const joint = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const yShift = (y + 0.5) / rowPx + phase;
    const row = Math.floor(yShift) % rows;
    const fy = frac(yShift);
    // 逐行错缝：stagger 0.5 = 顺砌错半砖（石砌）、0 = 对缝（石板）。
    // 取 frac(row × stagger) 而不是 row × 0.5 —— 前者对任意比例都在环上周期，平铺不破。
    const offsetPx = frac(row * stagger) * blockPx;
    for (let x = 0; x < W; x++) {
      const xShift = (x + 0.5 + offsetPx) / blockPx + phase;
      const col = Math.floor(xShift) % cols;
      const fx = frac(xShift);
      const dxEdge = Math.min(fx, 1 - fx) * blockPx;
      const dyEdge = Math.min(fy, 1 - fy) * rowPx;
      const d = Math.min(dxEdge, dyEdge);
      // d ≥ mortarPx 处为砖面（0），d = 0 处为灰缝底（1）
      const j = 1 - smoothstep(Math.min(1, d / mortarPx));
      const blockH = 0.35 + 0.65 * hash2(col, row, seed);
      const micro = fbm((x + 0.5) / W, (y + 0.5) / H, spec.octaves, seed);
      height[y * W + x] = (blockH + micro * 0.6) * (1 - 0.9 * j);
      joint[y * W + x] = j;
    }
  }

  // 二、法线（环面中心差分 → 与拉丝族共用的一段，见 normalFromHeight）
  const normal = normalFromHeight(height, W, H, spec.normalStrength);

  // 三、粗糙度：灰缝更糙、砖面对比 + 颗粒
  const roughness = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const grain = valueNoise((x + 0.5) / W, (y + 0.5) / H, 64, seed ^ 0x5bd1e995);
      const r = spec.roughBase
        + spec.roughAmp * (1.4 * joint[i] - 0.4)
        + spec.roughAmp * 0.6 * (grain - 0.5) * 2;
      roughness[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
    }
  }

  return { width: W, height: H, heightField: height, normal, roughness };
}

/* ------------------------------------------------------------------ *
 * 拉丝金属（W-C5 切片5）：第一族"非分块"图案
 * ------------------------------------------------------------------ */

/**
 * 拉丝表面的三件套 —— 与分块族的区别在**高度场的形状**：分块是"砖面 + 灰缝"的二维格，
 * 拉丝是**一维条纹** —— u 方向逐列一个独立 hash（列内同值，不插值：条纹是刻出来的），
 * v 方向 `rows` 格平滑起伏（纹路沿程的深浅漂移）。列号与行号都取模，接缝处的两条边
 * 本来就是相邻列 —— 平铺不靠修边。高度场 → 法线、粗糙度围绕 base 两段与分块族共用。
 */
export function buildBrushedSurface(spec) {
  const W = spec.size;
  const H = spec.size;
  const { lines, rows, amp } = spec.brushed;
  const colW = W / lines;
  const bandH = H / rows;
  const seed = spec.seed;

  // 一、格点（lines × rows 的 hash 网格）+ 高度场：沿 v 平滑插值、沿 u 逐列独立
  const grid = new Float32Array(lines * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < lines; i++) grid[j * lines + i] = hash2(i, j, seed);
  }
  const streak = new Float32Array(W * H);
  const height = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const vy = (y + 0.5) / bandH;
    const iy = Math.floor(vy);
    const fy = smoothstep(vy - iy);
    const y0 = iy % rows;
    const y1 = (y0 + 1) % rows;
    for (let x = 0; x < W; x++) {
      const cx = Math.floor((x + 0.5) / colW);
      const a = grid[y0 * lines + cx];
      const b = grid[y1 * lines + cx];
      const s = a + (b - a) * fy;
      const i = y * W + x;
      streak[i] = s;
      const micro = fbm((x + 0.5) / W, (y + 0.5) / H, spec.octaves, seed);
      height[i] = amp * s + micro * 0.6;
    }
  }

  // 二、法线（同一段：环面中心差分）
  const normal = normalFromHeight(height, W, H, spec.normalStrength);

  // 三、粗糙度：条纹深浅 + 金属杂点颗粒，围绕 roughBase（均值 ≈ roughBase —— 贴图接管前后读数同档）
  const roughness = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const grain = valueNoise((x + 0.5) / W, (y + 0.5) / H, 64, seed ^ 0x5bd1e995);
      const r = spec.roughBase
        + spec.roughAmp * (1.6 * streak[i] - 0.8)
        + spec.roughAmp * 0.6 * (grain - 0.5) * 2;
      roughness[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
    }
  }

  return { width: W, height: H, heightField: height, normal, roughness };
}

/* ------------------------------------------------------------------ *
 * 图案分派
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 无格岩面（W-C5 切片10）：第三种图案族
 * ------------------------------------------------------------------ */

/**
 * 生成一张"无格岩面"的三件套（岩 `crag` / 冰 `ice` 共用这一套机制，差在档位）。
 *
 * ## 为什么要有第三族
 * 前两族都是"有人排过的纹样"：分块是砖工排的（`bricks`），拉丝是机床拉的（`brushed`）。
 * 一块石头谁都没排过 —— 它的形是**一整块岩体被时间劈开**，特征是平台 + 台阶立面，
 * 不是"格子里有什么"。所以这一族没有 `bricks` / `brushed` 那样的格参数，只有三格：
 * `facets`（量化成几级台阶）/ `amp`（高度振幅）/ `grain`（台阶面上的细颗粒权重）。
 *
 * ## 高度场
 * `t = fbm(octaves) / 总amp ∈ [0,1]` 是连续的岩体起伏；`facets > 1` 时量化成
 * `floor(t × facets)` 级平台 —— 平台内是常数（劈裂面的"面"），平台之间相差
 * 一格 1/(facets-1)（法线在那一条线上立起来）。再叠一层 64 格细颗粒（`grain` 权重，
 * 环面取值）让平台不是死的。`facets: 1` 即不量化 —— 冰面用这一档，要的是缓慢的
 * 冻胀起伏而不是劈裂面。
 *
 * ## 与另两族共用的部分
 * 法线仍是 `normalFromHeight`（环面中心差分）；粗糙度仍围绕 `roughBase` 上下
 * （这里由 `t` 驱动：岩体的低处更糙）。三族共有的机制不重写，换的只有高度场。
 *
 * ## 可平铺
 * fbm 与细颗粒都在环面上取值（lattice 整除 size），量化是逐像素的纯函数 ——
 * 右回卷那一对像素与任何一对相邻像素同分布，接缝不靠修边。
 */
export function buildCraggySurface(spec) {
  const W = spec.size;
  const H = spec.size;
  const { facets, amp, grain } = spec.craggy;
  const seed = spec.seed;
  const 总amp = spec.octaves.reduce((s, o) => s + o.amp, 0);

  // 一、高度场：量化台阶 + 细颗粒。t / 细 留着给粗糙度用（同一个循环里算掉，不多扫一遍）
  const height = new Float32Array(W * H);
  const t场 = new Float32Array(W * H);
  const 细场 = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const v = (y + 0.5) / H;
      const t = fbm(u, v, spec.octaves, seed) / 总amp;
      const 细 = valueNoise(u, v, 64, seed ^ 0x5bd1e995);
      const q = facets > 1 ? Math.floor(t * facets) / (facets - 1) : t;
      const i = y * W + x;
      t场[i] = t;
      细场[i] = 细;
      height[i] = amp * q + grain * 细;
    }
  }

  // 二、法线（与另两族共用）
  const normal = normalFromHeight(height, W, H, spec.normalStrength);

  // 三、粗糙度：由 t 驱动（岩体低处更糙）+ 细颗粒抖动，均值仍回到 roughBase
  const roughness = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = spec.roughBase
      + spec.roughAmp * (0.75 - 1.5 * t场[i])
      + spec.roughAmp * 0.5 * (细场[i] - 0.5) * 2;
    roughness[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
  }

  return { width: W, height: H, heightField: height, normal, roughness };
}

/** 图案类型 → 构建器（键与 `SURFACE_PATTERNS` 一一对应，由门禁用例守着） */
export const SURFACE_BUILDERS = {
  tiled: buildTiledSurface,
  brushed: buildBrushedSurface,
  craggy: buildCraggySurface,
};

/**
 * 规格 → 三件套。未知图案**当场抛**、不落到任何默认 —— "落到默认"会让表里写错图案名的
 * 表面安静地按另一种图案烘出来：改数不重烤好歹还是同一张图，改错族名则是另一张图。
 */
export function buildSurface(spec) {
  const build = SURFACE_BUILDERS[spec.pattern];
  if (!build) {
    throw new Error(`未知的图案类型 "${spec.pattern}"（只有 ${Object.keys(SURFACE_BUILDERS).join(' / ')}）`);
  }
  return build(spec);
}

/** 规格 → 输出文件（相对 `public/textures/`）。名字来自规格表，绝不手抄 */
export function surfaceFiles(spec) {
  return { normal: spec.files.normal, roughness: spec.files.roughness };
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

export function bakeAll({ publicDir = join(process.cwd(), 'public', 'textures'), log = console.log } = {}) {
  const out = [];
  for (const [name, spec] of Object.entries(SURFACE_SPECS)) {
    const surface = buildSurface(spec);
    const files = surfaceFiles(spec);
    const normalPng = encodePNG(surface.width, surface.height, surface.normal);
    const roughPng = encodePNG(surface.width, surface.height, surface.roughness, { gray: true });
    const targets = [
      [join(publicDir, files.normal), normalPng],
      [join(publicDir, files.roughness), roughPng],
    ];
    for (const [path, buf] of targets) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, buf);
    }
    let roughSum = 0;
    for (const b of surface.roughness) roughSum += b;
    const mean = roughSum / surface.roughness.length / 255;
    const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
    log(`[bake] ${name}: ${surface.width}² tile=${spec.tileMeters}m`);
    log(`  ${files.normal}: ${normalPng.length} 字节 sha=${sha(normalPng)}`);
    log(`  ${files.roughness}: ${roughPng.length} 字节 sha=${sha(roughPng)} 均值 ${mean.toFixed(3)}`);
    out.push({ name, files, normalPng, roughPng });
  }
  return out;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  bakeAll();
  console.log('[bake] 完成。贴图已写入 public/textures/，记得提交。');
}
