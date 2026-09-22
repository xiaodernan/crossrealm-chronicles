/**
 * 2D 碰撞世界（XZ 平面）— 玩家/敌人以圆表示，场景障碍为圆柱或盒。
 * 垂直方向只负责"可站立顶面"，地形高度仍由 TerrainHeight 提供。
 * 不依赖 THREE，便于单测。
 */

export const SOLID = 'solid';
export const PLATFORM = 'platform';
export const GHOST = 'ghost';

function aabbOf(c) {
  if (c.shape === 'box') {
    // 仅支持 0/90 度之外的旋转用外接方形近似（原型足够）
    const ext = c.rotated ? Math.hypot(c.hx, c.hz) : 0;
    const hx = c.rotated ? ext : c.hx;
    const hz = c.rotated ? ext : c.hz;
    return { minX: c.x - hx, maxX: c.x + hx, minZ: c.z - hz, maxZ: c.z + hz };
  }
  return { minX: c.x - c.r, maxX: c.x + c.r, minZ: c.z - c.r, maxZ: c.z + c.r };
}

/** 圆 c 与障碍求穿透深度与推出方向；无穿透返回 null */
function contact(px, pz, pr, o) {
  if (o.shape === 'box') {
    let dx = px - o.x;
    let dz = pz - o.z;
    if (o.rot) {
      const cos = Math.cos(-o.rot);
      const sin = Math.sin(-o.rot);
      const rx = dx * cos - dz * sin;
      dz = dx * sin + dz * cos;
      dx = rx;
    }
    const cx = Math.max(-o.hx, Math.min(o.hx, dx));
    const cz = Math.max(-o.hz, Math.min(o.hz, dz));
    let nx = dx - cx;
    let nz = dz - cz;
    const dist2 = nx * nx + nz * nz;
    if (dist2 > pr * pr) return null;
    const len = Math.sqrt(dist2);
    if (len < 1e-6) {
      // 圆心落在盒内：沿最浅退出轴推出
      const ex = o.hx - Math.abs(dx);
      const ez = o.hz - Math.abs(dz);
      if (ex < ez) return { nx: dx >= 0 ? 1 : -1, nz: 0, depth: pr + ex };
      return { nx: 0, nz: dz >= 0 ? 1 : -1, depth: pr + ez };
    }
    const inv = 1 / len;
    return { nx: nx * inv, nz: nz * inv, depth: pr - len };
  }
  const dx = px - o.x;
  const dz = pz - o.z;
  const rr = pr + o.r;
  const dist2 = dx * dx + dz * dz;
  if (dist2 >= rr * rr) return null;
  const len = Math.sqrt(dist2);
  if (len < 1e-6) return { nx: 1, nz: 0, depth: rr };
  return { nx: dx / len, nz: dz / len, depth: rr - len };
}

export class CollisionWorld {
  constructor(cellSize = 16) {
    this.cellSize = cellSize;
    this.colliders = [];
    this.grid = new Map();
    this.built = false;
  }

  addCylinder({ x, z, r, base = 0, top = 4, kind = SOLID }) {
    if (!(r > 0)) return null;
    return this.add({ shape: 'cyl', x, z, r, base, top, kind });
  }

  addBox({ x, z, hx, hz, base = 0, top = 4, rot = 0, kind = SOLID }) {
    if (!(hx > 0 && hz > 0)) return null;
    return this.add({ shape: 'box', x, z, hx, hz, base, top, rot, rotated: !!rot, kind });
  }

  add(c) {
    c.id = this.colliders.length;
    if (c.shape === 'box') c.rotated = !!c.rot;
    this.colliders.push(c);
    this.built = false;
    return c;
  }

  build() {
    this.grid.clear();
    const cs = this.cellSize;
    for (const c of this.colliders) {
      if (c.kind === GHOST) continue;
      const b = aabbOf(c);
      const ix0 = Math.floor(b.minX / cs);
      const ix1 = Math.floor(b.maxX / cs);
      const iz0 = Math.floor(b.minZ / cs);
      const iz1 = Math.floor(b.maxZ / cs);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const key = `${ix}|${iz}`;
          let arr = this.grid.get(key);
          if (!arr) this.grid.set(key, (arr = []));
          arr.push(c);
        }
      }
    }
    this.built = true;
  }

  candidates(x, z, radius) {
    if (!this.built) this.build();
    const cs = this.cellSize;
    const out = [];
    const seen = new Set();
    const ix0 = Math.floor((x - radius) / cs);
    const ix1 = Math.floor((x + radius) / cs);
    const iz0 = Math.floor((z - radius) / cs);
    const iz1 = Math.floor((z + radius) / cs);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const arr = this.grid.get(`${ix}|${iz}`);
        if (!arr) continue;
        for (const c of arr) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          out.push(c);
        }
      }
    }
    return out;
  }

  blocks(c, y) {
    return c.kind !== GHOST && y >= c.base - 0.05 && y < c.top;
  }

  /**
   * 将半径 radius 的圆从 (x,z) 移动 (dx,dz)，沿接触面滑行。
   * 位移超过半径一半时自动细分步长，避免高速冲刺穿墙（隧穿）。
   * @param y 脚部高度，用于跳过高架障碍（如门洞上方横梁）
   * @returns {{x:number,z:number,hit:boolean}}
   */
  moveCircle(x, z, radius, dx, dz, y = 0, iterations = 3) {
    const len = Math.hypot(dx, dz);
    const maxStep = Math.max(0.05, radius * 0.5);
    const sub = Math.max(1, Math.ceil(len / maxStep));
    const sx = dx / sub;
    const sz = dz / sub;
    let px = x;
    let pz = z;
    let hit = false;
    for (let s = 0; s < sub; s++) {
      px += sx;
      pz += sz;
      for (let i = 0; i < iterations; i++) {
        let pushed = false;
        for (const c of this.candidates(px, pz, radius + 0.5)) {
          if (!this.blocks(c, y) && !this.blocks(c, y + 0.9)) continue;
          const ct = contact(px, pz, radius, c);
          if (!ct) continue;
          px += ct.nx * ct.depth;
          pz += ct.nz * ct.depth;
          hit = true;
          pushed = true;
        }
        if (!pushed) break;
      }
    }
    return { x: px, z: pz, hit };
  }

  /** 已在实体内部时脱困（重生/传送后调用） */
  unpenetrate(x, z, radius, y = 0, maxTries = 6) {
    let px = x;
    let pz = z;
    for (let i = 0; i < maxTries; i++) {
      let pushed = false;
      for (const c of this.candidates(px, pz, radius + 0.5)) {
        if (!this.blocks(c, y)) continue;
        const ct = contact(px, pz, radius, c);
        if (!ct) continue;
        px += ct.nx * ct.depth;
        pz += ct.nz * ct.depth;
        pushed = true;
      }
      if (!pushed) break;
    }
    return { x: px, z: pz };
  }

  /**
   * 脚下可站立顶面：返回高于 fromY - 允许下沉、且不高于 fromY + stepUp 的最高支撑面。
   * 不含地形 —— 调用方与地形高度取较大者。
   */
  supportAt(x, z, radius, fromY, stepUp = 0.6) {
    let best = null;
    for (const c of this.candidates(x, z, radius + 0.5)) {
      if (c.kind === GHOST) continue;
      if (c.top > fromY + stepUp || c.top < fromY - 1.2) continue;
      const pad = radius * 0.6;
      if (c.shape === 'box') {
        const dx = x - c.x;
        const dz = z - c.z;
        const rx = c.rot ? dx * Math.cos(c.rot) + dz * Math.sin(c.rot) : dx;
        const rz = c.rot ? dz * Math.cos(c.rot) - dx * Math.sin(c.rot) : dz;
        if (Math.abs(rx) > c.hx + pad || Math.abs(rz) > c.hz + pad) continue;
      } else if (Math.hypot(x - c.x, z - c.z) > c.r + pad) {
        continue;
      }
      if (best === null || c.top > best) best = c.top;
    }
    return best;
  }

  /**
   * 某个高度上的**点**是否落在实体内（第三人称镜头遮挡用）。
   *
   * 为什么不复用下面的 `blocked()`：它按 1.5 米步进采段内点，**短于一步的线段一个采样点都不取**，
   * 于是恒为"没挡住"。镜头是从支点向外一步步走（步长 ~0.65 米），拿它当逐段查询会静默失效
   * —— 一个永远返回 false 的遮挡判定比没有遮挡更糟。`blocked()` 本身的这个特性留给
   * 视线用途（两端距离通常远大于一步），已登记到计划里作为后续项。
   */
  blocksPoint(x, z, y, pad = 0) {
    for (const c of this.candidates(x, z, 0.6 + pad)) {
      if (!this.blocks(c, y)) continue;
      if (c.shape === 'box') {
        const rx = x - c.x;
        const rz = z - c.z;
        const ax = c.rot ? rx * Math.cos(c.rot) + rz * Math.sin(c.rot) : rx;
        const az = c.rot ? rz * Math.cos(c.rot) - rx * Math.sin(c.rot) : rz;
        if (Math.abs(ax) < c.hx + pad && Math.abs(az) < c.hz + pad) return true;
      } else if (Math.hypot(x - c.x, z - c.z) < c.r + pad) {
        return true;
      }
    }
    return false;
  }

  /**
   * 视线是否被实体阻挡。
   *
   * 注意：按 1.5 米步进、且**不含端点**，所以两端距离小于一拍时一个采样都不取（恒为未阻挡）。
   * 现用途是 AI 视线（距离远大于一步），镜头遮挡因此改用上面的 `blocksPoint()`。
   */
  blocked(fromX, fromZ, toX, toZ, y) {
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return false;
    const steps = Math.min(64, Math.ceil(len / 1.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = fromX + dx * t;
      const pz = fromZ + dz * t;
      for (const c of this.candidates(px, pz, 0.6)) {
        if (!this.blocks(c, y)) continue;
        if (c.shape === 'cyl') {
          if (Math.hypot(px - c.x, pz - c.z) < c.r) return true;
        } else {
          const rx = px - c.x;
          const rz = pz - c.z;
          const ax = c.rot ? rx * Math.cos(c.rot) + rz * Math.sin(c.rot) : rx;
          const az = c.rot ? rz * Math.cos(c.rot) - rx * Math.sin(c.rot) : rz;
          if (Math.abs(ax) < c.hx && Math.abs(az) < c.hz) return true;
        }
      }
    }
    return false;
  }

  clear() {
    this.colliders.length = 0;
    this.grid.clear();
    this.built = false;
  }
}
