/**
 * 事件总线 —— `on() / emit() / offAll()`，给规范第 3 条的"走既定事件"和第 4 条的
 * "监听器必须在系统 `dispose()` 中注销"提供一个能真正做到的落点。
 *
 * 为什么要有它（B44 剩下的另一半）：`src/` 里有 **151 处** `window.addEventListener('<游戏事件>')`，
 * 而**游戏事件的注销位点是 0**（全仓那 3 处 `removeEventListener` 撤的都是 DOM 事件）。
 * 也就是说：监听器一旦挂上，除了刷新页面没有任何办法让它下来。今天这还是一笔**潜伏账**
 * —— `new Game()` 全仓只出现一次（`core/Game.js` 由 `main.js` 的 `boot()` 调一次），
 * 换区、进出副本、读档都是原地改状态而不重建系统，所以还没有人在一个会话里累积出第二份监听。
 * 但这个前提随时会被两类改动打破：① 新游戏+ / 重开一局真正重建子系统；② 任何一个"每次进副本
 * 就 new 一个 director"的写法。到那一天症状不是报错，而是**同一个事件被 N 份监听各响应一次**
 * （横幅弹两层、CG 解锁提示重复、成就计数翻倍），而且没有任何线索指向成因。
 *
 * 口径（刻意保持窄）：
 * - **底层仍然是 `window` 上的 `CustomEvent`**。迁移一个监听不需要改动派发方，也不需要改动
 *   回调签名 —— 回调拿到的还是那个 `CustomEvent`（`e.detail` 照旧）。等 151 处全部迁完再谈换传输。
 * - `name` 必须是 `engine/events.js` 里登记过的名字，否则**当场抛错**。抄错名字从"下游静默失踪"
 *   升级成"启动就炸"，这是这张登记表唯一的运行期咽喉。
 * - `tag` 是**所有权标识**，约定 `"域/类名"`（例：`'ui/HUD'`）。`offAll(tag)` 会把该 tag 下的
 *   全部监听一次性撤掉，所以**一个 tag 只能属于一个活实例**；确有多个并存实例时（例如按实体
 *   建的 director），tag 必须带上实例后缀（`'combat/boss#${id}'`），否则撤一个会连坐撤光。
 * - 载荷的**键级校验仍没做**：登记表里 58 条 `payload` 有 45 条写的是散文（"整体转发成就对象：
 *   id/title/desc"），拿它当 schema 校验只会产生假阳性。等 payload 改成精确键清单再开。
 */

import { GAME_EVENTS } from './events.js';

/** 没给 tag 的监听归到这里：能被统计，但没法按所有权撤销 —— 门禁不许新代码走这条路 */
export const UNGROUPED = 'ungrouped';

/**
 * tag → 该所有权下的监听记录。
 * @type {Map<string, Array<{ name: string, handler: EventListener }>>}
 */
const owned = new Map();

/** 运行期可能没有 window（node 里的单测、SSR 预演）；每次调用时再取，避免模块加载顺序决定行为 */
const win = () => (typeof globalThis.window === 'object' && globalThis.window !== null ? globalThis.window : null);

/** @param {string} name */
function assertRegistered(name) {
  if (typeof name !== 'string' || !Object.hasOwn(GAME_EVENTS, name)) {
    throw new Error(
      `EventBus: 「${String(name)}」不在事件登记表里。登记过的名字见 src/engine/events.js 的 GAME_EVENTS；`
      + '新事件必须先在登记表里登记（用途 + 负载形状），再来挂监听。',
    );
  }
}

/** @param {string} name @param {unknown} detail */
function assertDetailMatches(name, detail) {
  const spec = GAME_EVENTS[name];
  if (spec.payload === null && detail !== undefined && detail !== null) {
    throw new Error(
      `EventBus.emit('${name}'): 登记表把这条标成纯信号（payload: null），但调用方给了 detail。`
      + '要么把负载去掉，要么先改登记表并确认派发位点真的都带它。',
    );
  }
}

/**
 * 挂一个监听。
 * @param {string} name 登记表里的事件名
 * @param {(e: CustomEvent) => void} handler 回调，签名与 addEventListener 一致
 * @param {string} [tag] 所有权标识，约定 `"域/类名"`；省略则归入 UNGROUPED（无法按所有权注销）
 * @returns {() => boolean} 退订函数，与 `Observable.subscribe()` 的返回形状一致
 */
export function on(name, handler, tag = UNGROUPED) {
  assertRegistered(name);
  if (typeof handler !== 'function') {
    throw new Error(`EventBus.on('${name}'): handler 必须是函数，收到 ${typeof handler}。`);
  }
  if (typeof tag !== 'string' || tag.length === 0) {
    throw new Error(`EventBus.on('${name}'): tag 必须是非空字符串（约定 "域/类名"），收到 ${String(tag)}。`);
  }
  let records = owned.get(tag);
  if (!records) {
    records = [];
    owned.set(tag, records);
  }
  /* 同一个 (name, handler) 在同一个 tag 下重复注册，DOM 会自己吞掉第二次；
   * 账本必须跟着吞，否则 offAll 返回的"撤掉了几条"会比真实值大，测试就信错了。 */
  const dup = records.find((r) => r.name === name && r.handler === handler);
  const record = dup ?? { name, handler };
  if (!dup) {
    records.push(record);
    win()?.addEventListener(name, handler);
  }
  return () => remove(record);
}

/**
 * 移除一个监听，返回是否真的移除了一条。
 * @param {{ name: string, handler: EventListener }} record
 */
function remove(record) {
  for (const [tag, records] of owned) {
    const i = records.findIndex((r) => r === record);
    if (i < 0) continue;
    records.splice(i, 1);
    if (records.length === 0) owned.delete(tag);
    win()?.removeEventListener(record.name, record.handler);
    return true;
  }
  return false;
}

/**
 * 派发。**注意：本切片起只是新增的第二条路，存量 137 处 `dispatchEvent` 未强制收编**，
 * 所以"绕过 emit 直接派发"仍然合法 —— 名字与载荷的静态门禁由 `tests/event-registry.test.js` 兜。
 * @param {string} name
 * @param {*} [detail]
 */
export function emit(name, detail = null) {
  assertRegistered(name);
  assertDetailMatches(name, detail);
  const w = win();
  if (!w) return false;
  w.dispatchEvent(
    detail === null || detail === undefined
      ? new CustomEvent(name)
      : new CustomEvent(name, { detail }),
  );
  return true;
}

/**
 * 按所有权整体注销 —— 系统 `dispose()` 里调这一条。
 * @param {string} tag
 * @returns {number} 实际撤掉的监听条数（幂等：第二次调用返回 0）
 */
export function offAll(tag) {
  const records = owned.get(tag);
  if (!records) return 0;
  const w = win();
  const list = records.slice();
  owned.delete(tag);
  for (const r of list) w?.removeEventListener(r.name, r.handler);
  return list.length;
}

/**
 * 诊断用：某个所有权下挂了几条，不给参数就是全仓总数。
 * 测试靠它断言"dispose 之后账本真的空了"，而不是靠"看起来没报错"。
 * @param {string} [tag]
 */
export function listenerCount(tag = undefined) {
  if (tag !== undefined) return owned.get(tag)?.length ?? 0;
  let n = 0;
  for (const records of owned.values()) n += records.length;
  return n;
}
