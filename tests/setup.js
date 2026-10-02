/**
 * 全局测试夹具（vitest setupFiles）。
 *
 * three 的 FileLoader 在 node 里用 `fetch` + `response.body.getReader()` 流式读取纹理 / GLB，
 * 每读到一块就 `new ProgressEvent('progress', { loaded, total })`（three.core.js 的 readData）。
 * node 没有 `ProgressEvent` 全局，于是那条浮动的 reader promise 抛 ReferenceError —— 它落在
 * 用例跑完之后（测试环境已拆除），变成一次未处理 rejection，把"全套绿"的收尾行污染成
 * `Errors 1 error`（间歇 1~3 条，正是 M4 夹具账里登记备查的那条）。
 *
 * 这里补一枚最小构造体即可：three 只用它携带 loaded/total 计数，注册了 onProgress 才会读；
 * 测试里没人挂 onProgress，事件造出来就被丢弃，所以无需实现任何真实事件语义。
 */
if (!globalThis.ProgressEvent) {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.lengthComputable = init.lengthComputable ?? false;
      this.loaded = init.loaded ?? 0;
      this.total = init.total ?? 0;
    }
  };
}

/**
 * 全局补一枚最小 `window`（W-B8 切片6）。
 *
 * ## 为什么补在这里而不是逐个文件
 *
 * 修前有 **22 个测试文件各自桩一份 `window`**，而另有一批（`arena-scripts` / `barrage` /
 * `chrono-field` / `gravity-well` / `ground-hazard` / `player-knockback`）**一份都没桩** ——
 * 它们跑得动只是因为当时被测的那条路径不派事件。切片6 让 `Boss.phase` 的写入走
 * `BossStateMachine.transitionTo`（那里会派 `boss-phase`），这 6 个文件当场全炸。
 *
 * 逐个文件补桩是"6 处重复 + 以后第 7 个文件还得再补一次"；补在夹具里是**一处**，
 * 而且与"node 里本来就没有 window"这个事实对得上：跑测试时它就该在。
 *
 * ## 为什么用真 `EventTarget` 而不是空壳
 *
 * 空壳（`dispatchEvent: () => {}`）能让"不炸"，但**监听器收不到事件** ——
 * 于是"注册了监听却没被调到"这类 bug 在测试里永远看不见。用 node 自带的 `EventTarget`
 * 转发，`addEventListener` 注册的东西**真的会收到**，与浏览器语义一致。
 *
 * 已经自己桩了的文件不受影响：它们在自己的 `beforeEach` 里覆盖这一份。
 * `delete globalThis.window` 的那几处也照旧（`dialogue-cg-pairing` 正是在测"没有 window 时"）。
 */
if (!globalThis.window) {
  const target = new EventTarget();
  globalThis.window = {
    dispatchEvent: (e) => target.dispatchEvent(e),
    addEventListener: (type, fn, opts) => target.addEventListener(type, fn, opts),
    removeEventListener: (type, fn, opts) => target.removeEventListener(type, fn, opts),
  };
}
