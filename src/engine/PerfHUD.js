/**
 * 性能与泄漏 HUD（开发期工具）。
 *
 * 只做三件事：按主循环 dt 统计帧率、把 `renderer.info` 与场景规模摊开、监控"只增不减"的
 * 计数器（几何体/纹理/场景节点是最典型的泄漏信号）。所有数值刷新走 dt 累计，不开定时器。
 *
 * 它不认识任何玩法系统：外部计数通过 `gauge(label, getter)` 注册，避免反向读取内部字段。
 */
export class PerfHUD {
  /**
   * @param renderer THREE.WebGLRenderer（读取 renderer.info）
   * @param scene    THREE.Object3D 根节点
   * @param refreshEvery 两次 DOM 写入之间的现实秒数
   */
  constructor({ renderer, scene, refreshEvery = 0.25 } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.refreshEvery = refreshEvery;
    this.visible = false;
    this._gauges = [];
    this._accum = 0;
    this._frames = 0;
    this._fps = 0;
    this._frameMs = 0;
    this._maxFrameMs = 0;
    this._baselines = new Map();
    this.el = null;
  }

  /**
   * 注册一条计数。`leak: true` 表示该值应当有界——超过历史最小值容忍带即标红。
   * @param label   显示名
   * @param getter  () => number
   */
  gauge(label, getter, { leak = false, tolerance = 32 } = {}) {
    this._gauges.push({ label, getter, leak, tolerance });
    return this;
  }

  toggle(on) {
    this.visible = on ?? !this.visible;
    if (!this.el) this._build();
    this.el.style.display = this.visible ? 'block' : 'none';
    return this.visible;
  }

  /** 由主循环每帧调用；传入未缩放的 dt，hitstop 期间帧率仍要真实统计 */
  update(rawDt) {
    this._frames++;
    this._accum += rawDt;
    this._frameMs += rawDt * 1000;
    this._maxFrameMs = Math.max(this._maxFrameMs, rawDt * 1000);
    if (!this.visible) return;
    if (this._accum < this.refreshEvery) return;
    // 刷新节流用帧累加而非挂起的计时器，避免 HUD 自身成为第二时间源
    this._fps = this._frames / this._accum;
    this._frameMs /= this._frames;
    this._render();
    this._accum = 0;
    this._frames = 0;
    this._maxFrameMs = 0;
  }

  /** 当前泄漏监控快照，供测试与回归门禁读取 */
  stats() {
    const out = { fps: this._fps, leaks: {} };
    for (const g of this._gauges) {
      if (!g.leak) continue;
      const v = this._value(g);
      out.leaks[g.label] = { value: v, growth: this._growth(g.label, v) };
    }
    return out;
  }

  _value(g) {
    const v = g.getter();
    return Number.isFinite(v) ? v : -1;
  }

  /** 相对历史最低点的净增长；健康的计数器应当来回摆动而不是单调上升 */
  _growth(label, value) {
    const min = Math.min(this._baselines.get(label) ?? value, value);
    this._baselines.set(label, min);
    return value - min;
  }

  /** 行有两种：`value` 是给人看的字符串；`num` 是参与泄漏监控的原始数字 */
  _lines() {
    const info = this.renderer?.info;
    const rows = [
      { label: 'FPS', value: this._fps.toFixed(1), warn: this._fps > 0 && this._fps < 55 },
      { label: '帧耗时', value: `${this._frameMs.toFixed(2)}ms`, warn: this._frameMs > 20 },
      { label: '峰值帧', value: `${this._maxFrameMs.toFixed(1)}ms`, warn: this._maxFrameMs > 50 },
    ];
    if (info) {
      const mem = info.memory;
      rows.push(
        { label: 'draw call', value: info.render.calls, warn: info.render.calls > 400 },
        { label: '三角面', value: `${(info.render.triangles / 1000).toFixed(1)}k` },
        { label: '几何体', value: mem.geometries, leak: true },
        { label: '纹理', value: mem.textures, leak: true },
        { label: '着色器', value: info.programs?.length ?? 0, leak: true },
      );
    }
    if (this.scene) {
      let nodes = 0;
      this.scene.traverse(() => { nodes++; });
      rows.push({ label: '场景节点', value: nodes, leak: true, tolerance: 200 });
    }
    if (performance.memory) {
      rows.push({ label: 'JS 堆', value: `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)}MB` });
    }
    for (const g of this._gauges) {
      rows.push({ label: g.label, value: this._value(g), leak: g.leak, tolerance: g.tolerance });
    }
    return rows;
  }

  _render() {
    const html = this._lines().map((r) => {
      const growth = r.leak ? this._growth(r.label, r.value) : 0;
      const bad = r.warn || (r.leak && growth > (r.tolerance ?? 32));
      const tail = r.leak && growth > 0 ? ` <span class="perf-warn">+${growth}</span>` : '';
      return `<div class="${bad ? 'perf-bad' : ''}">${r.label}: ${r.value}${tail}</div>`;
    }).join('');
    this.el.innerHTML = html;
  }

  _build() {
    const style = document.createElement('style');
    style.textContent = `
      .perf-hud{position:fixed;left:8px;top:8px;z-index:9999;display:none;pointer-events:none;
        font:11px/1.5 ui-monospace,Consolas,monospace;color:#cfe;background:rgba(0,0,0,.55);
        padding:6px 8px;border-radius:6px;white-space:pre}
      .perf-hud .perf-bad{color:#f77}
      .perf-hud .perf-warn{color:#fa0}
    `;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.className = 'perf-hud';
    document.body.appendChild(this.el);
  }

  dispose() {
    this.el?.remove();
    this.el = null;
    this._gauges.length = 0;
  }
}
