/**
 * 程序化表面贴图的门禁（W-C5 切片1；切片2 起每个表面都过 ②③ 两层的同一套尺）。
 *
 * ## 这一片交付了什么、这里钉的是什么
 * 一条**离线烘焙管线**：`content/materialSurfaces.js`（规格表）→ `npm run bake:textures`
 * → `public/textures/gen/*.png`（提交进仓）→ `TextureLibrary.uvVariant`（共享库）
 * → `ProceduralDungeonGenerator` 的地面 / 墙 / 柱（切片1）、Boss 场石板地面（切片2）
 * 与门板木纹（切片3）。四段各有自己的坏法：
 *
 * - **规格改了没重烘焙**：文件旧、规格新，不报错，只是墙上的砖换不了 —— ① 层拿规格**重算像素**
 *   再与提交的 PNG 逐字节比（解码端独立于编码端，CRC 逐个块验）。
 * - **噪声不可平铺**：接缝处一条亮线 —— ② 层量"竖缝 / 横缝的相邻差 ≤ 内部平均"，并配一条
 *   反向对照（线性斜坡场在这把尺下必须**红**，证明这把尺真的在量平铺性而不是在走过场）。
 * - **贴图铺数脱节**：几何 UV 是"每面 0..1"而材质只有一个 `repeat`，18 米的整墙与 7 米的墙段
 *   共用一份材质时砖尺寸必然不等 —— ⑤ 层量的是 **UV 以米计**（盒逐面 = 该面自己的尺寸、
 *   柱逐行 = 该行半径的周长、`repeat = 1 / tileMeters`；Boss 场圆盘按直径），两者相乘每面都恰好一个 tileMeters。
 * - **文件名抄第二份**：`gen/*.png` 这些串只许出现在规格表里 —— ⑥ 层的尺**从规格表现推**
 *   （每个表面两个文件名），新增一个表面自动进扫。
 *
 * ## 反向控制（本文件内建，不依赖外部脚本）
 * - 解码器对**被改坏的字节**必须抛（CRC 不符）；
 * - `seed+1` 必须换出一套砖（"改输入没变化"与"算对了"是两回事）；
 * - 斜坡场在平铺尺下必须红；
 * - 表结构门禁对**每一枚数值**的越界各自点名（⑦ 层逐格变异）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { inflateSync } from 'node:zlib';
import * as THREE from 'three';
import { SURFACE_SPECS, SURFACE_NAMES } from '../src/content/materialSurfaces.js';
import { buildSurface, encodePNG, surfaceFiles } from '../scripts/bake-textures.mjs';
import { TextureLibrary } from '../src/assets/TextureLibrary.js';
import {
  ProceduralDungeonGenerator,
} from '../src/world/ProceduralDungeonGenerator.js';
import { isSharedAsset, dungeonAssetStats } from '../src/world/dungeonAssets.js';
import { DOOR_JAMB } from '../src/world/dungeonDimensions.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { CONTENT_TABLES, checkTable } from '../src/content/registry.js';

const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'public', 'textures');
const SEED = 42;

/* ------------------------------------------------------------------ *
 * 独立 PNG 解码：测试端自己一份（不 import 烘焙脚本的编码器）
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

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** 解析 PNG（校验签名、每块 CRC、IHDR 字段、过滤器 0），返回像素 Buffer */
function 解PNG(buf) {
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIG[i]) throw new Error('不是 PNG 签名');
  }
  let off = 8;
  let ihdr = null;
  const idat = [];
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const crc = buf.readUInt32BE(off + 8 + len);
    const 应 = crc32(buf.subarray(off + 4, off + 8 + len));
    if (crc !== 应) throw new Error(`${type} 块 CRC 不符：文件 ${crc} ≠ 计算 ${应}`);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') idat.push(data);
    else if (type !== 'IEND') throw new Error(`不认识的块 ${type}`);
    off += 12 + len;
    if (type === 'IEND') break;
  }
  if (!ihdr) throw new Error('没有 IHDR');
  if (ihdr.bitDepth !== 8) throw new Error(`位深 ${ihdr.bitDepth} —— 烘焙器只写 8 位`);
  if (ihdr.colorType !== 0 && ihdr.colorType !== 2) throw new Error(`颜色类型 ${ihdr.colorType} —— 只认灰度 0 / RGB 2`);
  if (ihdr.interlace !== 0) throw new Error('隔行 PNG 不在支持里');
  const channels = ihdr.colorType === 2 ? 3 : 1;
  const stride = ihdr.width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * ihdr.height) {
    throw new Error(`解压后字节数不对：${raw.length} ≠ ${(stride + 1) * ihdr.height}`);
  }
  const pixels = Buffer.alloc(stride * ihdr.height);
  for (let y = 0; y < ihdr.height; y++) {
    const f = raw[y * (stride + 1)];
    if (f !== 0) throw new Error(`第 ${y} 行的过滤器是 ${f} —— 烘焙器只写 0（直存）`);
    raw.copy(pixels, y * stride, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  }
  return { ...ihdr, channels, pixels };
}

/* ------------------------------------------------------------------ *
 * ② 平铺尺：接缝处的相邻差 vs 内部平均相邻差
 * ------------------------------------------------------------------ */

function 接缝诊断(field, W, H) {
  let 内部 = 0, 内部N = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) {
      内部 += Math.abs(field[y * W + x + 1] - field[y * W + x]);
      内部N++;
    }
  }
  const 内部平均 = 内部 / 内部N;
  let 竖缝 = 0, 横缝 = 0;
  for (let y = 0; y < H; y++) 竖缝 += Math.abs(field[y * W] - field[y * W + W - 1]);
  for (let x = 0; x < W; x++) 横缝 += Math.abs(field[x] - field[(H - 1) * W + x]);
  return { 内部平均, 竖缝: 竖缝 / H, 横缝: 横缝 / W };
}

/* ------------------------------------------------------------------ *
 * ⑤ 副本接线：假表面库 + 逐网格读数
 * ------------------------------------------------------------------ */

/** 一枚只有"接口形状"的库：真类、真 uvVariant、假纹理数据（node 里 DataTexture 不需要 GPU） */
function 假表面库() {
  const lib = new TextureLibrary();
  const dt = (bytes, v) => new THREE.DataTexture(new Uint8Array(bytes).fill(v), 4, 4);
  lib.sets.masonry = { map: null, normalMap: dt(48, 128), roughnessMap: dt(16, 200), roughness: 1 };
  lib.sets.slabs = { map: null, normalMap: dt(48, 96), roughnessMap: dt(16, 168), roughness: 1 };
  lib.sets.plank = { map: null, normalMap: dt(48, 120), roughnessMap: dt(16, 232), roughness: 1 };
  lib.ready = true;
  return lib;
}

const 建一座 = (def, lib) => {
  const group = new THREE.Group();
  const layout = ProceduralDungeonGenerator.generate(def, SEED);
  ProceduralDungeonGenerator.buildGeometry(group, layout, def, lib);
  return { group, layout };
};

function 收集(group) {
  const 地面 = [];
  const 墙 = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry.type === 'PlaneGeometry'
      && Math.abs(o.rotation.x + Math.PI / 2) < 1e-9
      && Math.abs(o.position.y - 0.02) < 1e-9) 地面.push(o);
    if (o.userData.isWall) 墙.push(o);
  });
  return { 地面, 墙 };
}

function uv范围(geometry) {
  const uv = geometry.attributes.uv;
  let uMax = -Infinity, vMax = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    uMax = Math.max(uMax, uv.getX(i));
    vMax = Math.max(vMax, uv.getY(i));
  }
  return { uMax, vMax };
}

/** 一枚不分段盒的**逐面**实测 u/v 上限（面序 px/nx/py/ny/pz/nz，每面 4 顶点 —— 与 uvBox 的顶点序约定对齐） */
function 逐面盒实测(geometry) {
  const uv = geometry.attributes.uv;
  if (uv.count !== 24) throw new Error(`逐面盒实测只接受 24 顶点的盒，拿到 ${uv.count}`);
  const out = [];
  for (let f = 0; f < 6; f++) {
    let u = 0, v = 0;
    for (let i = f * 4; i < f * 4 + 4; i++) {
      u = Math.max(u, uv.getX(i));
      v = Math.max(v, uv.getY(i));
    }
    out.push([u, v]);
  }
  return out;
}

/** 测试端自己的一份"每一面该是哪个尺寸"（与 dungeonAssets 的 盒面尺寸 互为见证 —— 与编码/解码那对同一个写法） */
const 盒面期望 = (w, h, d) => [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];

/** 圆柱躯干（group 0）按行分组：y（4 位小数）→ 该行实测 uMax */
function 柱行实测(o) {
  const g = o.geometry;
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const { start, count } = g.groups[0];
  const 行 = new Map();
  for (let i = start; i < start + count; i++) {
    const vi = g.index.getX(i);
    const y = Math.round(pos.getY(vi) * 1e4) / 1e4;
    行.set(y, Math.max(行.get(y) ?? 0, uv.getX(vi)));
  }
  return 行;
}

describe('① 提交的 PNG 就是规格重算出来的那张（改数不重烤 = 红灯）', () => {
  it('逐表面：文件存在、尺寸与规格一致、像素与重算逐字节相同', () => {
    expect(SURFACE_NAMES.length).toBeGreaterThan(0);
    for (const name of SURFACE_NAMES) {
      const spec = SURFACE_SPECS[name];
      const 图案 = buildSurface(spec);
      const files = surfaceFiles(spec);

      const 法线图 = 解PNG(readFileSync(join(PUBLIC, files.normal)));
      expect([法线图.width, 法线图.height], `${files.normal} 的尺寸`).toEqual([spec.size, spec.size]);
      expect(法线图.colorType).toBe(2);
      expect(
        Buffer.from(法线图.pixels).equals(Buffer.from(图案.normal)),
        `${files.normal} 与规格重算的像素不一致 —— 改过 materialSurfaces.js 没重烘焙？`,
      ).toBe(true);

      const 粗糙图 = 解PNG(readFileSync(join(PUBLIC, files.roughness)));
      expect([粗糙图.width, 粗糙图.height], `${files.roughness} 的尺寸`).toEqual([spec.size, spec.size]);
      expect(粗糙图.colorType).toBe(0);
      expect(
        Buffer.from(粗糙图.pixels).equals(Buffer.from(图案.roughness)),
        `${files.roughness} 与规格重算的像素不一致 —— 改过 materialSurfaces.js 没重烘焙？`,
      ).toBe(true);
    }
  });

  it('反向控制：编码往返一致，而被改坏的字节必须抛（解码器真的在验 CRC）', () => {
    const spec = SURFACE_SPECS.masonry;
    const 图案 = buildSurface(spec);
    const png = encodePNG(图案.width, 图案.height, 图案.normal);
    const 回来 = 解PNG(png);
    expect(Buffer.from(回来.pixels).equals(Buffer.from(图案.normal))).toBe(true);

    const 坏 = Buffer.from(png);
    坏[30] ^= 0xff; // IHDR 块 CRC 区域
    expect(() => 解PNG(坏), '改了一个字节还解得出，说明 CRC 没在验').toThrow(/CRC/);
  });

  it('尺寸与颜色类型必须由编码器把住：像素数与声明不符当场抛', () => {
    expect(() => encodePNG(4, 4, new Uint8Array(4 * 4 * 3 - 1))).toThrow(/像素数/);
  });
});

// 每一个表面都过这五关（切片2 起不止一种：石板与石砌吃同一把尺）
for (const 名 of SURFACE_NAMES) describe(`② 表面读数（${名}）：可平铺、法线是单位向量、粗糙度围绕基准带对比`, () => {
  const spec = SURFACE_SPECS[名];
  const 图案 = buildSurface(spec);
  const W = spec.size;
  const H = spec.size;

  it('高度场的接缝不比内部更跳（不可平铺的噪声会在这里红）', () => {
    const d = 接缝诊断(图案.heightField, W, H);
    // 阈值 = 内部平均的 1.1 倍：不是"must equal"，是"不许明显更跳"。
    // 实测（2026-10-07）：内部 0.02571、竖缝 0.02046、横缝 0.02524。
    expect(d.竖缝, `竖缝 ${d.竖缝.toFixed(5)} vs 内部 ${d.内部平均.toFixed(5)}`).toBeLessThanOrEqual(d.内部平均 * 1.1);
    expect(d.横缝, `横缝 ${d.横缝.toFixed(5)} vs 内部 ${d.内部平均.toFixed(5)}`).toBeLessThanOrEqual(d.内部平均 * 1.1);
  });

  it('反向对照：同一把尺量线性斜坡场必须红（否则这把尺什么都没量）', () => {
    const ramp = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ramp[y * W + x] = x / W;
    const d = 接缝诊断(ramp, W, H);
    expect(d.竖缝, '斜坡的竖缝居然没比内部大 —— 尺子坏了').toBeGreaterThan(d.内部平均 * 10);
  });

  it('法线：R/G 无偏、逐像素是单位向量（解码回 [-1,1] 验）', () => {
    let mx = 0, my = 0, 最大偏差 = 0;
    for (let i = 0; i < W * H; i++) {
      const nx = (图案.normal[i * 3] / 255) * 2 - 1;
      const ny = (图案.normal[i * 3 + 1] / 255) * 2 - 1;
      const nz = (图案.normal[i * 3 + 2] / 255) * 2 - 1;
      mx += nx; my += ny;
      最大偏差 = Math.max(最大偏差, Math.abs(Math.hypot(nx, ny, nz) - 1));
    }
    expect(Math.abs(mx / (W * H)), '平均 nx 偏了（法线有整体倾斜）').toBeLessThan(0.02);
    expect(Math.abs(my / (W * H)), '平均 ny 偏了（法线有整体倾斜）').toBeLessThan(0.02);
    expect(最大偏差, '有非单位向量 —— 编码回合出错').toBeLessThan(0.01);
  });

  it('粗糙度：均值围绕基准、有真实波动、非恒定贴图', () => {
    let sum = 0, min = 255, max = 0;
    for (let i = 0; i < W * H; i++) {
      const v = 图案.roughness[i];
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const mean = sum / (W * H) / 255;
    let 方差 = 0;
    for (let i = 0; i < W * H; i++) {
      const d = 图案.roughness[i] / 255 - mean;
      方差 += d * d;
    }
    const sd = Math.sqrt(方差 / (W * H));
    // 实测（2026-10-07）：均值 0.8453、sd 0.0522、min 194、max 255；规格 roughBase = 0.86
    expect(Math.abs(mean - spec.roughBase), `均值 ${mean.toFixed(4)} 离基准 ${spec.roughBase} 太远`).toBeLessThan(0.08);
    expect(sd, '粗糙度几乎是常数 —— 这张图没有信息').toBeGreaterThan(0.02);
    expect(max).toBeGreaterThan(250);
    expect(min).toBeLessThan(210);
  });

  it('分块结构：块心有真实高度分布（不是一张纯噪声或平板）', () => {
    const { rows, cols, stagger, phase } = spec.bricks;
    const rowPx = H / rows;
    const blockPx = W / cols;
    const 高度 = new Set();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // 与烘焙器同一条错缝/相位公式（切片2 起两者都在规格里：石砌 0.5/0、石板 0/0.5）
        const offset = ((r * stagger) % 1) * blockPx;
        const cx = Math.floor(((((c + 0.5 - phase) * blockPx - offset) % W) + W) % W);
        const cy = Math.floor((((r + 0.5 - phase) * rowPx) % H + H) % H);
        高度.add(图案.heightField[cy * W + cx].toFixed(3));
      }
    }
    // 实测：masonry 31/32 个砖心互不相同（错缝顺砌 + 每砖独立 hash）；slabs 2×2 = 4 块
    expect(高度.size, `块心高度只有 ${高度.size} 种`).toBeGreaterThanOrEqual(Math.min(8, rows * cols));
  });
});

for (const 名 of SURFACE_NAMES) describe(`③ 确定性（${名}）：同规格永远同一张，换种子必须换图`, () => {
  const spec = SURFACE_SPECS[名];

  it('两次构建逐字节相同（没有 Math.random / 没有时间）', () => {
    const a = buildSurface(spec);
    const b = buildSurface(spec);
    expect(Buffer.from(a.normal).equals(Buffer.from(b.normal))).toBe(true);
    expect(Buffer.from(a.roughness).equals(Buffer.from(b.roughness))).toBe(true);
    expect(Buffer.from(new Float32Array(a.heightField).buffer).equals(Buffer.from(new Float32Array(b.heightField).buffer))).toBe(true);
  });

  it('反向对照：seed+1 之后法线与粗糙度都必须换一套', () => {
    const a = buildSurface(spec);
    const b = buildSurface({ ...spec, seed: spec.seed + 1 });
    expect(Buffer.from(a.normal).equals(Buffer.from(b.normal))).toBe(false);
    expect(Buffer.from(a.roughness).equals(Buffer.from(b.roughness))).toBe(false);
  });
});

describe('④ 共享库：loaded() 的同步口与 uvVariant 的按铺数缓存', () => {
  it('load() 之前 loaded() 是 null（同步构建路径拿不到就是拿不到）', () => {
    expect(TextureLibrary.loaded()).toBe(null);
  });

  it('load() 之后：就绪、masonry 进 sets；node 里图像加载不了 ⇒ 全槽 null，uvVariant 也退成 null', async () => {
    const lib = await TextureLibrary.load();
    expect(lib.ready).toBe(true);
    expect(TextureLibrary.loaded()).toBe(lib);
    expect('masonry' in lib.sets, 'masonry 没进 MANIFEST').toBe(true);
    expect('slabs' in lib.sets, 'slabs 没进 MANIFEST').toBe(true);
    expect('plank' in lib.sets, 'plank 没进 MANIFEST').toBe(true);
    // node 没有 document，TextureLoader 载不出图 —— 这恰好就是"库在但这一组没贴图"的退路形状
    expect(lib.sets.masonry.normalMap).toBe(null);
    expect(lib.sets.slabs.normalMap).toBe(null);
    expect(lib.sets.plank.normalMap).toBe(null);
    expect(lib.uvVariant('masonry', 0.5, 0.5)).toBe(null);
    expect(lib.uvVariant('slabs', 1 / SURFACE_SPECS.slabs.tileMeters, 1 / SURFACE_SPECS.slabs.tileMeters)).toBe(null);
    expect(lib.uvVariant('plank', 1 / SURFACE_SPECS.plank.tileMeters, 1 / SURFACE_SPECS.plank.tileMeters)).toBe(null);
  });

  it('uvVariant：clone 共享 Source、repeat 按铺数、同铺数同壳、异铺数新壳', () => {
    const lib = 假表面库();
    const set = lib.sets.masonry;
    const v1 = lib.uvVariant('masonry', 0.5, 0.5);
    expect(v1).not.toBe(null);
    expect(v1.map, 'masonry 没有颜色图，变体也不该凭空有').toBe(null);
    expect(v1.normalMap).not.toBe(set.normalMap); // 是壳不是原件
    expect(v1.normalMap.source, 'clone 必须共享 Source（GPU 只传一份）').toBe(set.normalMap.source);
    expect(v1.normalMap.repeat.x).toBe(0.5);
    expect(v1.normalMap.repeat.y).toBe(0.5);
    expect(v1.roughnessMap.repeat.x).toBe(0.5);

    expect(lib.uvVariant('masonry', 0.5, 0.5), '同铺数该拿同一份壳').toBe(v1);
    const v2 = lib.uvVariant('masonry', 1, 1);
    expect(v2).not.toBe(v1);
    expect(v2.normalMap.repeat.x).toBe(1);
    expect(lib.uvVariantCount()).toBe(2);

    expect(lib.uvVariant('ghost', 1, 1)).toBe(null);
    const 空库 = new TextureLibrary();
    空库.sets.masonry = { map: null, normalMap: null, roughnessMap: null, roughness: 1 };
    expect(空库.uvVariant('masonry', 0.5, 0.5), '全空槽还发壳 = 拿 null 贴图骗消费方').toBe(null);
  });
});

describe('⑤ 副本接线：地面 / 墙 / 柱都贴上了，且 UV 以米计', () => {
  it('贴图路径：地面与墙的材料挂着同一份变体（normal + roughness 都非空）', () => {
    const def = DUNGEON_DEFS[0];
    const lib = 假表面库();
    const { group } = 建一座(def, lib);
    const { 地面, 墙 } = 收集(group);
    const 变体 = lib.uvVariant('masonry', 1 / SURFACE_SPECS.masonry.tileMeters, 1 / SURFACE_SPECS.masonry.tileMeters);

    expect(地面.length, '一间标准的平面地面都没建出来').toBeGreaterThan(0);
    expect(墙.length).toBeGreaterThan(0);
    for (const m of 地面) {
      expect(m.material.normalMap, `${m.name} 的地面没有法线图`).toBe(变体.normalMap);
      expect(m.material.roughnessMap).toBe(变体.roughnessMap);
      expect(m.material.roughness, '贴图在时 material.roughness 必须是 1（贴图是唯一真源）').toBe(1);
      expect(m.material.color.getHex()).toBe(def.theme);
      expect(isSharedAsset(m.material)).toBe(true);
      expect(isSharedAsset(m.geometry)).toBe(true);
    }
    for (const m of 墙) {
      expect(m.material.normalMap, `${m.name} 的墙没有法线图`).toBe(变体.normalMap);
      expect(m.material.roughness).toBe(1);
    }
    expect(new Set(墙.map((m) => m.material)).size, '一面副本的墙材料该只有一份').toBe(1);
  });

  it('UV 以米计：地面 uvMax = 17.8 米、每铺 2 米；墙段的 uvMax 就是它自己的宽', () => {
    const def = DUNGEON_DEFS[0];
    const lib = 假表面库();
    const { group, layout } = 建一座(def, lib);
    const { 地面, 墙 } = 收集(group);
    const 砖 = 1 / SURFACE_SPECS.masonry.tileMeters;

    const 房 = layout.rooms.find((r) => !r.isBossArena);
    const 边长 = 房.w - 0.2; // 17.8
    const { uMax, vMax } = uv范围(地面[0].geometry);
    // uv 属性是 Float32（17.8 → 17.7999992…），4 位小数 ≈ 5e-5 容差，够严也够稳
    expect(uMax, `地面 uvMax=${uMax}，不是米数`).toBeCloseTo(边长, 4);
    expect(vMax).toBeCloseTo(边长, 4);
    const rep = 地面[0].material.normalMap.repeat.x;
    expect(rep).toBe(砖);
    expect(边长 / (uMax * rep), '每铺米数不等于 tileMeters —— 砖尺寸脱节').toBeCloseTo(SURFACE_SPECS.masonry.tileMeters, 6);

    // 墙：18 米的整墙与 7 米的门旁段，uvMax 各自等于自己的宽/深（米），于是同一份材质下砖一样大
    const 宽窄 = new Set();
    for (const m of 墙) {
      const p = m.geometry.parameters;
      const { uMax: wu, vMax: wv } = uv范围(m.geometry);
      expect(wu, `墙 (${p.width}×${p.height}×${p.depth}) 的 uMax=${wu} 不是米数`).toBeCloseTo(Math.max(p.width, p.depth), 6);
      expect(wv).toBeCloseTo(Math.max(p.height, p.depth), 6);
      // 逐面：全局 max 会被"同一维出现在两张脸上"的墙盖住（漏一张脸查不出来），逐面才照得见
      const 实测面 = 逐面盒实测(m.geometry);
      const 期望面 = 盒面期望(p.width, p.height, p.depth);
      for (let f = 0; f < 6; f++) {
        expect(实测面[f][0], `墙 (${p.width}×${p.height}×${p.depth}) 第 ${f} 面 uMax=${实测面[f][0]}，不是该面自己的尺寸`).toBeCloseTo(期望面[f][0], 4);
        expect(实测面[f][1], `墙 (${p.width}×${p.height}×${p.depth}) 第 ${f} 面 vMax=${实测面[f][1]}，不是该面自己的尺寸`).toBeCloseTo(期望面[f][1], 4);
      }
      宽窄.add(p.width);
    }
    expect([...宽窄].some((w) => Math.abs(w - 18) < 1e-9), '没量到 18 米的整墙').toBe(true);
    expect([...宽窄].some((w) => w > 0 && Math.abs(w - 18) > 1e-9), '没量到窄墙段（门旁那截）').toBe(true);
  });

  it('柱面（wallMat 的圆柱）也按米：逐行 uMax = 该行半径的周长、vMax = 高', () => {
    const def = DUNGEON_DEFS[0];
    const { group } = 建一座(def, 假表面库());
    const 墙材 = 收集(group).墙[0].material;
    let 柱 = 0;
    group.traverse((o) => {
      if (!o.isMesh || o.geometry.type !== 'CylinderGeometry' || o.material !== 墙材) return;
      柱++;
      const p = o.geometry.parameters;
      const { uMax, vMax } = uv范围(o.geometry);
      expect(uMax, `圆柱 (rt=${p.radiusTop}, rb=${p.radiusBottom}) 的 uMax 不是绕底圈的米数`)
        .toBeCloseTo(2 * Math.PI * p.radiusBottom, 3);
      expect(vMax, `圆柱 vMax=${vMax}，不是高 ${p.height} —— 竖直方向的砖尺寸会脱节`)
        .toBeCloseTo(p.height, 3);
      // 逐行：全局 uMax 只看得到最粗那一行；上细下粗的柱，每行的绕周长都得是它自己的半径算的
      const 行 = 柱行实测(o);
      expect(行.size, '躯干该有 ≥2 行顶点（上/下）').toBeGreaterThanOrEqual(2);
      for (const [y, u] of 行) {
        const r = ((p.height / 2 - y) / p.height) * (p.radiusBottom - p.radiusTop) + p.radiusTop;
        expect(u, `y=${y} 行的 uMax=${u.toFixed(4)}，不是该行半径的周长 2π·${r.toFixed(4)}≈${(2 * Math.PI * r).toFixed(4)}`)
          .toBeCloseTo(2 * Math.PI * r, 3);
      }
    });
    expect(柱, '一座副本里一个 wallMat 圆柱都没有 —— 这条用例没量到东西').toBeGreaterThan(0);
  });

  it('模板装饰的墙材盒（壁柱 / 壁龛）逐面也是米 —— 全局 max 被同维盖住的那张脸在这里红', () => {
    const def = DUNGEON_DEFS[0];
    const { group } = 建一座(def, 假表面库());
    const 墙材 = 收集(group).墙[0].material;
    let 件 = 0;
    group.traverse((o) => {
      if (!o.isMesh || o.userData.isWall) return;
      if (o.geometry.type !== 'BoxGeometry' || o.material !== 墙材) return;
      件++;
      expect(isSharedAsset(o.geometry), '装饰盒的几何不在共享库里').toBe(true);
      const p = o.geometry.parameters;
      const 实测面 = 逐面盒实测(o.geometry);
      const 期望面 = 盒面期望(p.width, p.height, p.depth);
      for (let f = 0; f < 6; f++) {
        expect(实测面[f][0], `装饰盒 (${p.width}×${p.height}×${p.depth}) 第 ${f} 面 uMax=${实测面[f][0]}，不是该面自己的尺寸`).toBeCloseTo(期望面[f][0], 4);
        expect(实测面[f][1], `装饰盒 (${p.width}×${p.height}×${p.depth}) 第 ${f} 面 vMax=${实测面[f][1]}，不是该面自己的尺寸`).toBeCloseTo(期望面[f][1], 4);
      }
    });
    expect(件, '一座副本里一件 wallMat 装饰盒都没有 —— 这条用例没量到东西').toBeGreaterThan(0);
  });

  it('拿不到库（texLib = null）：退回无贴图，颜色与旧读数原样', () => {
    const def = DUNGEON_DEFS[0];
    const { group, layout } = 建一座(def, null);
    const { 地面, 墙 } = 收集(group);
    for (const m of 地面) {
      expect(m.material.normalMap).toBe(null);
      expect(m.material.roughnessMap).toBe(null);
      expect(m.material.roughness, '无贴图时该回到 0.88').toBe(0.88);
      expect(m.material.color.getHex()).toBe(def.theme);
    }
    for (const m of 墙) expect(m.material.roughness).toBe(0.9);
    // 门板也一样退回（切片3）：贴着 `door:closed` 的键，不是 `door:closed@tex`
    expect(layout.doorMeshes.length, '一扇门都没建出来').toBeGreaterThan(0);
    for (const m of layout.doorMeshes) {
      expect(m.material.normalMap, '无贴图时门板不该挂着木纹').toBe(null);
      expect(m.material.roughness, '无贴图时该回到 0.85').toBe(0.85);
    }
  });

  it('Boss 场地面：石板贴图按直径算铺数（4 米一铺），缺库退回纯色自发光（W-C5 切片2）', () => {
    // 取最后一座的 Boss 场：`dungeonMaterial` 的材质缓存是**全模块**的，前面的用例已经用
    // 各自的库建过 def[0] 的 `bossFloor@tex` —— 那会拿到旧库的贴图，身份断言量的是缓存而不是接线。
    const def = DUNGEON_DEFS[DUNGEON_DEFS.length - 1];
    // 贴图路径：一张 4 米的石板图铺满直径 30.6 米的圆盘 ⇒ repeat = 直径 / tileMeters。
    // 圆盘的 UV 是 0..1 跨整个直径（CircleGeometry 口径），所以"每铺米数"就是这条除法的读数。
    {
      const lib = 假表面库();
      const { group } = 建一座(def, lib);
      let 地面数 = 0;
      group.traverse((o) => {
        if (!o.isMesh || o.geometry.type !== 'CircleGeometry' || Math.abs(o.position.y - 0.03) > 1e-9) return;
        地面数++;
        expect(o.material.normalMap, 'Boss 场地面的石板法线图没挂上').not.toBe(null);
        expect(o.material.roughnessMap).not.toBe(null);
        expect(o.material.roughness, '贴图在时 material.roughness 必须是 1').toBe(1);
        expect(o.material.color.getHex(), '颜色该还是这座副本的点缀色').toBe(def.accent);
        expect(o.material.emissive.getHex(), '自发光没保住 —— 石板不该抹掉 Boss 场的底色').toBe(def.accent);
        const 直径 = o.geometry.parameters.radius * 2;
        expect(直径 / o.material.normalMap.repeat.x, '每铺米数不等于 slabs.tileMeters —— 石板尺寸脱节')
          .toBeCloseTo(SURFACE_SPECS.slabs.tileMeters, 6);
        // 变体就是库按这个铺数发的那一份（不是别的档、也不是直挂 set 级那份）
        const 变体 = lib.uvVariant('slabs', 直径 / SURFACE_SPECS.slabs.tileMeters, 直径 / SURFACE_SPECS.slabs.tileMeters);
        expect(o.material.normalMap).toBe(变体.normalMap);
      });
      expect(地面数, '一座 Boss 场的地面圆盘一个都没量到').toBe(1);
    }
    // 缺库退回：纯色自发光（roughness 回 0.75），与墙/地同一条退路
    {
      const { group } = 建一座(def, null);
      let 地面数 = 0;
      group.traverse((o) => {
        if (!o.isMesh || o.geometry.type !== 'CircleGeometry' || Math.abs(o.position.y - 0.03) > 1e-9) return;
        地面数++;
        expect(o.material.normalMap).toBe(null);
        expect(o.material.roughnessMap).toBe(null);
        expect(o.material.roughness, '无贴图时该回到 0.75').toBe(0.75);
        expect(o.material.color.getHex()).toBe(def.accent);
      });
      expect(地面数).toBe(1);
    }
  });

  it('门板：plank 木纹挂上、UV 以米计、铺数 = 1 / tileMeters（W-C5 切片3）', () => {
    // 材质身份不逐份对：门板材质是**全模块**一份（先被哪个用例的库建出来就先得谁的贴图）——
    // 与 Boss 场那条同一个坑。这里验的是四条事实：贴上了、铺数对、UV 以米计、全域共用。
    const def = DUNGEON_DEFS[0];
    const lib = 假表面库();
    const { layout } = 建一座(def, lib);
    const 板 = layout.doorMeshes;
    expect(板.length, '一扇门都没量到').toBeGreaterThan(20);
    const 砖 = 1 / SURFACE_SPECS.plank.tileMeters;
    for (const m of 板) {
      expect(m.material.normalMap, `${m.name} 的门板没有法线图`).not.toBe(null);
      expect(m.material.roughnessMap, `${m.name} 的门板没有粗糙度图`).not.toBe(null);
      expect(m.material.roughness, '贴图在时 material.roughness 必须是 1（贴图是唯一真源）').toBe(1);
      expect(m.material.normalMap.repeat.x, '门板木纹的铺数与 tileMeters 脱节').toBeCloseTo(砖, 9);
      const p = m.geometry.parameters;
      expect(p.width, '门板宽该还是"洞宽减两侧让缝"的派生量').toBeCloseTo(layout.doorWidth - 2 * DOOR_JAMB, 6);
      // 逐面：UV 以米计（uvBox），铺数乘上去每面都恰好一个 2 米见方 —— 门板是 3.9×4.2 的一张脸
      const 实测面 = 逐面盒实测(m.geometry);
      const 期望面 = 盒面期望(p.width, p.height, p.depth);
      for (let f = 0; f < 6; f++) {
        expect(实测面[f][0], `${m.name} 门板第 ${f} 面 uMax=${实测面[f][0]}，不是该面自己的尺寸（米）`).toBeCloseTo(期望面[f][0], 4);
        expect(实测面[f][1], `${m.name} 门板第 ${f} 面 vMax=${实测面[f][1]}，不是该面自己的尺寸（米）`).toBeCloseTo(期望面[f][1], 4);
      }
      expect(isSharedAsset(m.geometry), '门板几何不在共享库里').toBe(true);
    }
    expect(new Set(板.map((m) => m.material)).size, '全部门板该共用一份材质（颜色与副本无关）').toBe(1);
    expect(new Set(板.map((m) => m.geometry)).size, '全部门板该共用一份几何').toBe(1);
  });

  it('七座副本：贴/不贴两种面各 21 份材料，反复 build 缓存零增长（B76 的账在贴图之后照样成立）', () => {
    const lib = 假表面库();
    const 一轮 = () => {
      const 材料 = new Set();
      for (const def of DUNGEON_DEFS) {
        const { group } = 建一座(def, lib);
        const { 地面, 墙 } = 收集(group);
        for (const m of 地面) 材料.add(m.material);
        for (const m of 墙) 材料.add(m.material);
        // Boss 场石板地面（W-C5 切片2）也是每座一份
        group.traverse((o) => {
          if (o.isMesh && o.geometry.type === 'CircleGeometry' && Math.abs(o.position.y - 0.03) < 1e-9) 材料.add(o.material);
        });
      }
      return 材料;
    };
    const 第一轮材料 = 一轮();
    expect(第一轮材料.size, '7 座 ×（地面 + 墙 + Boss 场石板）该是 21 份').toBe(DUNGEON_DEFS.length * 3);
    // 三档铺数：石砌 1/2 米、石板按直径（7.65）、木板 1/2 米（切片3）—— 变体该是三份
    expect(lib.uvVariantCount(), '石砌 / 石板 / 木板三份变体（木板与石砌同铺数但不同 set）').toBe(3);

    const 第一轮 = dungeonAssetStats();
    const 第二轮材料 = 一轮();
    const 第二轮 = dungeonAssetStats();
    expect(第二轮).toEqual(第一轮);
    expect(第二轮材料).toEqual(第一轮材料);
  });
});

describe('⑥ 文件名只有规格表一份（抄第二份的症状是 404 而不报错）', () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(js|mjs)$/.test(name) ? [full] : [];
  });

  it('src/ 与 scripts/ 里出现 gen/*.png 文件名的只能有 materialSurfaces.js', () => {
    // 尺**从规格表现推**（每个表面两个文件名；切片2 起不止一种）—— 新增一个表面自动进这把尺，
    // 不再手抄 'masonry_(nor|rough)' 这种只有一个表面时够用的写法。
    const 文件名 = SURFACE_NAMES
      .flatMap((n) => [SURFACE_SPECS[n].files.normal, SURFACE_SPECS[n].files.roughness])
      .map((p) => p.slice(p.lastIndexOf('/') + 1));
    const 尺 = new RegExp(文件名.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
    // 每一个表面的两个文件名都必须被这把尺咬住 —— 漏一个 = 那个文件名没人守
    for (const f of 文件名) expect(尺.test(`files: { normal: 'gen/${f}' }`), `尺子咬不住 ${f}`).toBe(true);

    const 命中 = [];
    for (const f of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'scripts'))]) {
      if (尺.test(readFileSync(f, 'utf8'))) 命中.push(relative(ROOT, f).replace(/\\/g, '/'));
    }
    expect(命中).toEqual(['src/content/materialSurfaces.js']);
  });
});

describe('⑦ 表结构门禁：每一枚数值越界都各自点名（规格表真的在 schema 下）', () => {
  const 表 = CONTENT_TABLES.find((t) => t.kind === 'materialSurfaces');
  const 跑 = (改) => checkTable({ ...表, table: { masonry: { ...SURFACE_SPECS.masonry, ...改 } } }).join('\n');

  it('真规格过，且登记在案', () => {
    expect(表, 'materialSurfaces 没进 CONTENT_TABLES').toBeTruthy();
    expect(表.value.t).toBe('row');
    expect(checkTable(表)).toEqual([]);
  });

  it.each([
    ['tileMeters', { tileMeters: 0 }, /tileMeters/],
    ['size', { size: 4096 }, /size/],
    ['seed', { seed: -1 }, /seed/],
    ['bricks.mortarPx', { bricks: { rows: 8, cols: 4, mortarPx: 0 } }, /mortarPx/],
    ['bricks.stagger', { bricks: { ...SURFACE_SPECS.masonry.bricks, stagger: -0.1 } }, /stagger/],
    ['octaves 空', { octaves: [] }, /octaves/],
    ['octaves.amp', { octaves: [{ lattice: 16, amp: 0 }] }, /amp/],
    ['normalStrength', { normalStrength: 0 }, /normalStrength/],
    ['roughAmp', { roughAmp: 1 }, /roughAmp/],
    ['files 缺一枚', { files: { normal: 'gen/a.png' } }, /roughness/],
  ])('变异 %s 被点名', (_名, 改, 图案) => {
    const 错误 = 跑(改);
    expect(错误, `${_名} 越界却过表了`).toMatch(图案);
  });
});
