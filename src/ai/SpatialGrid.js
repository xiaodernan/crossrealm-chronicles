/**
 * W-Z2：分离推力的**空间哈希网格**（均匀桶，XZ 平面）。
 *
 * ## 为什么是它
 * `EnemyManager.update()` 每帧把全部活敌人塞进 `ctx.neighbors`，然后每只敌人在
 * `_advance()` 里都遍历一次这个数组 —— n 只怪就是 n² 次距离计算。分离是一个
 * **局部**作用：两只怪隔得比「半径之和 + pad」远时，互相的贡献严格为 0。
 * 全遍历把 99% 的算力花在注定返回 null 的配对上。
 *
 * 均匀网格给的是 O(n) 建表 + O(邻域桶) 查询：cellSize 取典型挤压半径的两倍左右，
 * 每只怪只看周围 3×3 个桶。没有四叉树：敌人分布是**均匀且高频移动**的，
 * 四叉树每帧重建/重平衡的常数比几个 Map 桶更贵，而这里没有「大片空地 + 一个密团」
 * 那种值得自适应剖分的形状。
 *
 * ## 正确性的唯一口径：不漏，而不是精确
 * 这里只产出**候选集**，`separationPush` 里的 `repel` 仍会做最终距离判定。
 * 因此网格允许「多给几个」（repel 会判掉），绝不允许「少给一个」（推力会凭空消失）。
 * 查询半径取 `self.r + maxOtherRadius + pad`：这是所有可能生效的配对的上界
 * （`repel` 用的 want 正是 `self.r + other.r + ai.separationPad`）。
 * `maxRadius` 只在插入时取 max、在 clear 时归零 —— 它偏大只会多扫几个桶，不会漏。
 *
 * ## 分配纪律
 * 每帧 `rebuild()` 复用 `bodies` / 候选数组，查询默认写进同一个 `out` 数组。
 * 调用方**必须同步消费**返回值（本仓的 `_advance` 正是如此）；要留着以后用请传自己的数组。
 * 网格不认识 THREE、不碰 DOM、不起计时器 —— 纯数据结构，node 里可直接测。
 */
export class SpatialGrid {
  constructor(cellSize = 6) {
    this.cellSize = Math.max(0.5, cellSize);
    /** @type {Map<string, Array<object>>} */
    this.cells = new Map();
    /** 防重复插入：同一个身体进两次桶，query 就会把它算成两个邻居，推力直接翻倍 */
    this._seen = new Set();
    /** 当前在册的身体（插入顺序即查询结果顺序，便于与全遍历对拍） */
    this.bodies = [];
    /** 在册身体的最大分离半径；保守上界，宁大勿小 */
    this.maxRadius = 0;
    this._out = [];
    /** 开发期/门禁用的读数：候选数之比是复杂度的证据，不是墙钟时间 */
    this.stats = { rebuilds: 0, insertions: 0, queries: 0, candidates: 0, bucketsScanned: 0 };
  }

  clear() {
    this.cells.clear();
    this._seen.clear();
    this.bodies.length = 0;
    this.maxRadius = 0;
    return this;
  }

  /** 半径读取兼容「只带 position 的普通点」；半径缺失按 0 处理 */
  static radiusOf(body) {
    const r = typeof body?.separationRadius === 'function' ? body.separationRadius() : 0;
    return Number.isFinite(r) && r > 0 ? r : 0;
  }

  static cellKey(cx, cz) {
    return `${cx},${cz}`;
  }

  cellOf(x, z) {
    return { cx: Math.floor(x / this.cellSize), cz: Math.floor(z / this.cellSize) };
  }

  insert(body) {
    if (!body?.position || this._seen.has(body)) return false;
    const p = body.position;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
    this._seen.add(body);
    const r = SpatialGrid.radiusOf(body);
    const { cx, cz } = this.cellOf(p.x, p.z);
    const key = SpatialGrid.cellKey(cx, cz);
    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = [];
      this.cells.set(key, bucket);
    }
    bucket.push(body);
    this.bodies.push(body);
    if (r > this.maxRadius) this.maxRadius = r;
    this.stats.insertions += 1;
    return true;
  }

  /** 每帧一次：清空并按当下位置重建（敌人是会动的，缓存格子索引只会让邻居说谎） */
  rebuild(bodies) {
    this.clear();
    for (const b of bodies) this.insert(b);
    this.stats.rebuilds += 1;
    return this;
  }

  /** 对 self 而言，任何可能产生推力的身体都落在这个半径内 */
  radiusFor(body, pad = 0) {
    return SpatialGrid.radiusOf(body) + this.maxRadius + Math.max(0, pad || 0) + 1e-6;
  }

  /**
   * 返回候选数组（默认复用内部数组）。
   * 扫描的是以 self 为中心、半径 R 的**外接方格**：AABB 永远包含圆，所以不会漏；
   * AABB 多出来的角落会被 `repel` 判掉，所以只是多几个常数比较。
   */
  query(body, pad = 0, out = this._out) {
    out.length = 0;
    if (!body?.position) return out;
    const p = body.position;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return out;
    const r = this.radiusFor(body, pad);
    const minCx = Math.floor((p.x - r) / this.cellSize);
    const maxCx = Math.floor((p.x + r) / this.cellSize);
    const minCz = Math.floor((p.z - r) / this.cellSize);
    const maxCz = Math.floor((p.z + r) / this.cellSize);
    let buckets = 0;
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      for (let cz = minCz; cz <= maxCz; cz += 1) {
        const bucket = this.cells.get(SpatialGrid.cellKey(cx, cz));
        if (!bucket) continue;
        buckets += 1;
        for (const other of bucket) {
          // self 本来就在桶里；separationPush 也会跳过它，这里提前省一次比较
          if (other !== body) out.push(other);
        }
      }
    }
    this.stats.queries += 1;
    this.stats.candidates += out.length;
    this.stats.bucketsScanned += buckets;
    return out;
  }

  /** 平均每次查询给出的候选数 / 在册总数；剪枝效果的结构读数，与机器快慢无关 */
  candidateRatio() {
    const n = this.bodies.length;
    if (!this.stats.queries || !n) return 0;
    return this.stats.candidates / (this.stats.queries * n);
  }
}
