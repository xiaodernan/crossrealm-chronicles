/**
 * 运行时错误收集（W-D5 切片2）
 *
 * ## 这一片做什么、不做什么
 * 做：把**未捕获的异常**与**未处理的 Promise 拒绝**收进一个可读的账本，
 * 让"玩着玩着崩了"至少留下现场（控制台之外还留一份可复制的报告）。
 *
 * **不做：发到远端**。仓里没有上报端点，凭空造一个等于把"看起来在工作"当成工作。
 * 出口留成 `setSink(fn)`：将来接上端点时只改这一处，捕获与账本的形状不动。
 *
 * ## 三条纪律（每一条都能单独写坏，所以每条都有门禁）
 * 1. **不吞异常**。`error` 的处理器**不返回 `true`**、`unhandledrejection` 不调
 *    `preventDefault()` —— 吞掉的话控制台不再打印、浏览器默认行为也停了，
 *    等于用一个"错误收集器"把错误藏起来。
 * 2. **不无限增长**。环形缓冲到顶丢最旧的，并记 `dropped`；
 *    同一处错误**按指纹去重**只占一个槽位、只累加次数 —— 否则一个每帧抛的错
 *    会在几秒内把整个缓冲刷满，真正的第一现场被挤出去。
 * 3. **装得上也卸得掉**。`install()` 幂等（装两次不会绑两份），`uninstall()` 真的解绑
 *    （与 `engine/EventBus.js` 的注销纪律同一条）。
 */
import { GAME_EVENTS } from './events.js';

/** 环形缓冲上限 */
export const MAX_ERRORS = 50;
/** 每条错误保留的栈行数（栈可能几百行，全留会把报告淹掉） */
export const MAX_STACK_LINES = 12;
/** 报告里一条错误的摘要长度上限 */
export const MAX_MESSAGE_CHARS = 300;

const trim = (s, n) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n)}…` : s);

/** 指纹：同一种错误（同 kind + 同 message + 同位置）算一条 */
function fingerprintOf(kind, message, source, line) {
  return [kind, trim(message, MAX_MESSAGE_CHARS), source ?? '', line ?? ''].join('|');
}

/**
 * @param {object} [opts]
 * @param {object} [opts.target] 事件宿主（默认 globalThis；测试传假 target）
 * @param {number} [opts.limit]
 * @param {() => number} [opts.now]
 * @param {(detail: object) => void} [opts.dispatch] 派发出口（默认发 `error-captured` 自定义事件）
 */
export function createErrorReporter(opts = {}) {
  const target = opts.target ?? globalThis;
  const limit = opts.limit ?? MAX_ERRORS;
  const now = opts.now ?? (() => Date.now());
  const notify = opts.dispatch ?? defaultDispatch;

  /** @type {Array<{kind:string,message:string,stack:string|null,source:string|null,line:number|null,column:number|null,time:number,count:number}>} */
  const entries = [];
  let dropped = 0;
  let installed = false;
  let sink = null;

  const size = () => entries.length;
  const getDropped = () => dropped;
  const getErrors = () => entries.map((e) => ({ ...e }));
  const setSink = (fn) => { sink = typeof fn === 'function' ? fn : null; };

  /** 记一条。返回那条记录（去重时返回已有那条，只把 count +1） */
  function record({ kind, message, stack = null, source = null, line = null, column = null, time = now() }) {
    const fp = fingerprintOf(kind, message, source, line);
    const hit = entries.find((e) => e.fp === fp);
    if (hit) {
      hit.count += 1;
      hit.time = time;
      if (sink) sink(hit);
      return hit;
    }
    const entry = {
      fp,
      kind,
      message: trim(String(message ?? ''), MAX_MESSAGE_CHARS),
      stack: stack ? String(stack).split('\n').slice(0, MAX_STACK_LINES).join('\n') : null,
      source,
      line,
      column,
      time,
      count: 1,
    };
    entries.push(entry);
    while (entries.length > limit) { entries.shift(); dropped += 1; }
    notify({ kind: entry.kind, message: entry.message, count: entry.count });
    if (sink) sink(entry);
    return entry;
  }

  /** `window` 的 error 事件。**不返回 true**（返回 true 会吞掉默认处理） */
  function onError(event) {
    record({
      kind: 'error',
      message: event?.message ?? String(event?.error?.message ?? event?.error ?? '未知错误'),
      stack: event?.error?.stack ?? null,
      source: event?.filename ?? null,
      line: typeof event?.lineno === 'number' ? event.lineno : null,
      column: typeof event?.colno === 'number' ? event.colno : null,
    });
    // 刻意不 return true：让控制台照常打印、让浏览器默认行为继续
  }

  /** 未处理的 Promise 拒绝。**不调 preventDefault()** */
  function onRejection(event) {
    const reason = event?.reason;
    const isErr = reason instanceof Error;
    record({
      kind: 'unhandledrejection',
      message: isErr ? reason.message : (typeof reason === 'string' ? reason : safeStringify(reason)),
      stack: isErr ? reason.stack : null,
      source: null,
      line: null,
      column: null,
    });
    // 刻意不 event.preventDefault()
  }

  function install() {
    if (installed) return api;
    if (typeof target?.addEventListener === 'function') {
      target.addEventListener('error', onError);
      target.addEventListener('unhandledrejection', onRejection);
    }
    installed = true;
    return api;
  }

  function uninstall() {
    if (!installed) return api;
    if (typeof target?.removeEventListener === 'function') {
      target.removeEventListener('error', onError);
      target.removeEventListener('unhandledrejection', onRejection);
    }
    installed = false;
    return api;
  }

  function clear() {
    entries.length = 0;
    dropped = 0;
  }

  /** 可复制的纯文本报告 */
  function toReport() {
    if (!entries.length) return '（没有捕获到运行时错误）';
    const lines = [`运行时错误 ${entries.length} 种${dropped ? `（另有 ${dropped} 条因超出缓冲被丢弃）` : ''}`];
    entries.forEach((e, i) => {
      lines.push(`${i + 1}. [${e.kind}] ×${e.count} ${e.message}`);
      if (e.source) lines.push(`   位置：${e.source}:${e.line ?? '?'}:${e.column ?? '?'}`);
      if (e.stack) lines.push(...e.stack.split('\n').map((l) => `   ${l.trim()}`));
    });
    return lines.join('\n');
  }

  const api = {
    install, uninstall, record, clear, toReport,
    getErrors, size, getDropped, setSink,
    get installed() { return installed; },
  };
  return api;
}

function safeStringify(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

/**
 * 默认派发出口。**事件名在这里写成字面量** —— 不是风格问题：
 * `tests/event-registry.test.js` 的"死条目"判据只认 `new CustomEvent('字面量')`
 * 这一种生产位点，名字走变量的话那条门禁会把这个事件判成"没有任何地方生产它"。
 * （注入出口 `opts.dispatch` 仍然收一个 detail，测试可以拿它当探针。）
 */
function defaultDispatch(detail) {
  if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    // `detail:` 写成带冒号的形态而不是简写 `{ detail }` —— 事件登记门禁的
    // "payload 非 null 就必须真的带 detail" 那一条，认的是 `detail:` 这个写法。
    globalThis.dispatchEvent(new CustomEvent('error-captured', { detail: { ...detail } }));
  }
}

/** 这个名字登记在 events.js（引擎启动时会校验未登记的名字） */
export const ERROR_EVENT_NAME = 'error-captured';
export const errorEventRegistered = () => Object.prototype.hasOwnProperty.call(GAME_EVENTS, ERROR_EVENT_NAME);
