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
