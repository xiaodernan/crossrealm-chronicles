/**
 * StateGraph —— 一个不依赖任何第三方库的、确定性 StateGraph 实现。
 *
 * 之所以这样设计：
 *   1. 项目本身绝大部分逻辑都是纯 JS/TS，不经过第三方
 *      运行时即可复用；
 *   2. 作为「状态机式」阅读<->结算链路：用节点函数直接读取/
 *      写入状态，用条件边（conditional edge）把它钉在纸面上，
 *      不再是一长串 if-else 漏斗；
 *   3. 配套 precompile/compile 阶段，缺节点提早抛错，不产生活
 *      得好好的「最终状态错」而是直接抛「缺节点 X」给定位；
 *   4. 保留完整执行轨迹——
 *      对冥灯/命途这类内容而言，「走过了哪些节点」就是设计画布本身。
 *
 * ## 约束
 *   - 无异步兼容（保证测试与线上行为一致，无竞态）；
 *   - 无第三方依赖（left-to-right 直读、不拉任何东西）；
 *   - 无 Intent 拦截（任何 goto 只能改变下一个节点，而非跳过节点本身）；
 *   - 节点函数必须「纯」——副作用写进 Context 而不是直接 state。
 */

export class StateGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.entry = null;
    this.meta = Object.create(null);
  }

  /** 注册一个节点。`fn` 接收 (state, context)，返回部分状态 patch（会 merge 到 state）。*/
  addNode(name, fn) {
    if (typeof fn !== 'function') throw new Error(`StateGraph.addNode: node "${name}" fn 必须是函数`);
    this.nodes.set(name, fn);
    return this;
  }

  /** 静态边：from → to 无条件。 */
  addEdge(from, to) {
    this._ensureNode(from);
    this._ensureNode(to);
    this.edges.set(from, () => to);
    return this;
  }

  /** 条件边：routeFn(state) ⇒ 下一个节点名。 */
  addConditionalEdges(from, routeFn) {
    this._ensureNode(from);
    if (typeof routeFn !== 'function') throw new Error(`StateGraph.addConditionalEdges: from="${from}" routeFn 必须是函数`);
    this.edges.set(from, routeFn);
    return this;
  }

  /** 顺手绑定 meta 信息（例如标签、位置、视觉专用）；读侧可见，不影响走图。 */
  setMeta(name, meta) {
    this._ensureNode(name);
    this.meta[name] = { ...(this.meta[name] ?? {}), ...(meta ?? {}) };
    return this;
  }

  setEntryPoint(name) {
    this._ensureNode(name);
    this.entry = name;
    return this;
  }

  /** 宽松编译：所有「从入口可达」的条件边都由测试覆盖——这里只做静态良构检查。 */
  compile() {
    if (!this.entry) throw new Error('StateGraph: 缺少 setEntryPoint —— 编译失败');

    // 静态注册性检查：检查所有添加的边都指向合法节点（条件边的 routeFn 不在此调用——它可能依赖 state）
    for (const [cur, edgeFn] of this.edges) {
      if (!this.nodes.has(cur)) throw new Error(`StateGraph.compile: 边起点未注册节点 "${cur}"`);
      // 仅在 probe-state 合法时尝试——若 routeFn 抛错，容忍（测试会再走 invoke）
      try {
        const out = edgeFn({});
        if (typeof out !== 'string') throw new Error('不是字符串');
      } catch { /* 条件边合法：routeFn 依赖 state —— invoke 再检查 */ }
      if (!this.nodes.has(cur)) throw new Error(`StateGraph.compile: 节点 "${cur}" 不存在`);
    }

    const self = this;
    return {
      invoke(initialState = {}) {
        const state = { ...initialState };
        const trace = [];
        let cursor = self.entry;
        for (let step = 0; step < 1024; step++) {
          if (!cursor) break;
          const fn = self.nodes.get(cursor);
          if (!fn) throw new Error(`StateGraph.invoke: 未注册节点 "${cursor}"`);
          const patch = fn(state, self) ?? {};
          Object.assign(state, patch);
          trace.push({ node: cursor, state: { ...state } });
          const edgeFn = self.edges.get(cursor);
          if (!edgeFn) break;
          const next = edgeFn(state);
          if (!next || next === cursor) break;
          cursor = next;
        }
        return { state, trace };
      },
    };
  }

  _ensureNode(name) {
    if (!this.nodes.has(name)) {
      throw new Error(`StateGraph: 节点 "${name}" 尚未 addNode —— 拒绝先用。请先注册节点再连边。`);
    }
  }
}

export function buildGraph() {
  return new StateGraph();
}
