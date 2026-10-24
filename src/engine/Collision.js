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

/**
 * 把**盒局部系**里算出的推出法线转回世界系（深度是标量，跟着走）。
 *
 * 为什么要有这一格：上面的世界→局部只喂了几何查询，而 `nx/nz` 是局部系的向量 ——
 * 直接把局部向量交出去，绕 X 之外的旋转盒就会沿**错的轴**推人。这条错误在装饰层之前
 * 踩不到：`rot` 只有 `blocked()`/`supportAt()` 这些"读"路径用（它们各自就地转，向量不外传），
 * 而"推"路径 `moveCircle`/`unpenetrate` 从来没遇到过带朝向的盒。装饰层一登记带朝向的摊/椅/断柱，
 * 玩家就不再是"穿过摆件"，而是**被错轴的法线推进摆件里**（实测离摊面 1.67m 一帧后被送到 0.26m）。
 *
 * 顺带记一笔翻案：`tests/collision.test.js` 里旧的那条"旋转盒按其朝向阻挡"在漏转版上**恰好是绿的**
 * —— 漏转把玩家原路顶回世界 −z，"z 没冲过去"当然成立。它现在钉的是切向滑行 + 局部系里的贴面距离，
 * 那才是朝向的证据（臂1 = 把这里退回恒等变换，红的正是这几条）。
 */
function rotatedNormal(o, nx, nz, depth) {
  if (!o.rot) return { nx, nz, depth };
  const cos = Math.cos(o.rot);
  const sin = Math.sin(o.rot);
  return { nx: nx * cos - nz * sin, nz: nx * sin + nz * cos, depth };
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
      if (ex < ez) return rotatedNormal(o, dx >= 0 ? 1 : -1, 0, pr + ex);
      return rotatedNormal(o, 0, dz >= 0 ? 1 : -1, pr + ez);
    }
    const inv = 1 / len;
    return rotatedNormal(o, nx * inv, nz * inv, pr - len);
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

  /**
   * `owner` 是**登记方留下的身份串**（如装饰层的家族名）。为什么要有这一格：`add()` 收整个对象、
   * 而这两个便捷入口只认列出的几格 —— 早先 `_blockCyl` 传的 `owner` 就是这样被静默丢掉的，
   * 于是"这一族登记了几块体"数出来永远是 0，按族认领的门禁整套空转（字段不会自己报错）。
   */
  addCylinder({ x, z, r, base = 0, top = 4, kind = SOLID, owner = null }) {
    if (!(r > 0)) return null;
    return this.add({ shape: 'cyl', x, z, r, base, top, kind, owner });
  }

  addBox({ x, z, hx, hz, base = 0, top = 4, rot = 0, kind = SOLID, owner = null }) {
    if (!(hx > 0 && hz > 0)) return null;
    return this.add({ shape: 'box', x, z, hx, hz, base, top, rot, rotated: !!rot, kind, owner });
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
    return this.blockersAt(x, z, y, pad) !== null;
  }

  /**
   * 压住这一格、且挡得住这个高度的**那一份**碰撞体（没有则 null）—— `blocksPoint()` 的
   * 同一件事，只是把答案交出来（与上面 `blockedBy()` 之于 `blocked()` 是一对同族）。
   *
   * 为什么要有这一格：门禁要说的不是"这里有问题"，而是"这一棵树没有认领到体、
   * 而它被旁边那块区里的石头代挡着"。判据仍只有一份 —— 调用方不必复刻这段几何。
   */
  blockersAt(x, z, y, pad = 0) {
    for (const c of this.candidates(x, z, 0.6 + pad)) {
      if (!this.blocks(c, y)) continue;
      if (c.shape === 'box') {
        const rx = x - c.x;
        const rz = z - c.z;
        const ax = c.rot ? rx * Math.cos(c.rot) + rz * Math.sin(c.rot) : rx;
        const az = c.rot ? rz * Math.cos(c.rot) - rx * Math.sin(c.rot) : rz;
        if (Math.abs(ax) < c.hx + pad && Math.abs(az) < c.hz + pad) return c;
      } else if (Math.hypot(x - c.x, z - c.z) < c.r + pad) {
        return c;
      }
    }
    return null;
  }

  /**
   * 视线是否被实体阻挡。
   *
   * 注意：按 1.5 米步进、且**不含端点**，所以两端距离小于一拍时一个采样都不取（恒为未阻挡）。
   * 现用途是 AI 视线（距离远大于一步），镜头遮挡因此改用上面的 `blocksPoint()`。
   *
   * 判据只有一份：这里就是 `blockedBy()` 非空。**别在调用方另抄一遍采样**（B125 的门禁
   * 要说出"挡住的是哪一份碰撞体"，那条需求由 `blockedBy()` 满足，而不是由谁去复刻这段循环）。
   */
  blocked(fromX, fromZ, toX, toZ, y) {
    return this.blockedBy(fromX, fromZ, toX, toZ, y) !== null;
  }

  /**
   * 挡住视线的那一份碰撞体（没有则 null）—— `blocked()` 的同一件事，只是把**答案**交出来。
   *
   * 为什么要有这一格：一句"这一格四向皆闷"不能修，而"闷在 `cyl@239.3,100.1 r=1.64`
   * 这一块石头上"能修。它同时是**一条诊断**（哪个工件压住了出生点）与**一份证据**
   * （门禁不必重抄采样口径，也就不会和生产侧漂开）。
   */
  blockedBy(fromX, fromZ, toX, toZ, y) {
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return null;
    const steps = Math.min(64, Math.ceil(len / 1.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = fromX + dx * t;
      const pz = fromZ + dz * t;
      for (const c of this.candidates(px, pz, 0.6)) {
        if (!this.blocks(c, y)) continue;
        if (c.shape === 'cyl') {
          if (Math.hypot(px - c.x, pz - c.z) < c.r) return c;
        } else {
          const rx = px - c.x;
          const rz = pz - c.z;
          const ax = c.rot ? rx * Math.cos(c.rot) + rz * Math.sin(c.rot) : rx;
          const az = c.rot ? rz * Math.cos(c.rot) - rx * Math.sin(c.rot) : rz;
          if (Math.abs(ax) < c.hx && Math.abs(az) < c.hz) return c;
        }
      }
    }
    return null;
  }

  clear() {
    this.colliders.length = 0;
    this.grid.clear();
    this.built = false;
  }

  /**
   * 摘掉一份障碍（子系统拆卸时用），并把空间哈希标脏。
   *
   * 为什么要有这一格：`clear()` 是"整份作废"，而**晚到**的登记方（装饰层在
   * `world.build()` 之后才建）拆卸时只能取回自己那几块 —— 连别人的墙一起拆是事故，
   * 只拆模型不拆障碍则是另一场事故（障碍活得比几何久，玩家撞在一团空气上）。
   */
  remove(c) {
    const i = this.colliders.indexOf(c);
    if (i < 0) return false;
    this.colliders.splice(i, 1);
    this.built = false;
    return true;
  }
}
