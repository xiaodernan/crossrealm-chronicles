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
 * ## B166：一个监听器抛异常，凭什么没人知道是哪一条
 *
 * 派发有**两条通道**，而这两条对"监听器抛异常"的处理**不一样**：
 *
 * - 真浏览器：`dispatchEvent` 把每个监听器各自包起来，一个抛了只留一条**未捕获异常**
 *   —— 那句异常说的是"谁的栈炸了"，不说"**哪条事件的哪个所有权**炸的、**炸了几次**、
 *   **之后还送不送**"。每帧都抛的事件（`projectile-hit` 这一族）就是一秒几十条同样的堆栈。
 * - 门禁里的 window 垫片：`handlers.get(type)?.forEach((fn) => fn(event))` —— **没有包**。
 *   于是同一个监听器在门禁里会**把派发方一起掀翻**：派发点后面的代码不执行、
 *   后面那些**没坏的**监听器也收不到这一条事件。
 *
 * 同一份代码两边行为不一样，而没有任何一本账记着这件事 —— 这是"机制能坏到没人看得见"的
 * 第三种形状（B161 是跨行锚点在 CRLF 上静默 no-op，B163 是子系统一抛就冻整帧）。
 *
 * 修法挂在**监听侧**而不是派发侧：派发侧收不干净 —— 普查口径下 `src/` 里订阅 144 处全走
 * `on()`，但派发仍是两条通道（`emit()` 6 处 + 裸 `dispatchEvent(new CustomEvent(…))` 约 140 处）。
 * 挂在监听侧，两条通道一次管住。借的契约与 B163 同源（Hystrix / Resilience4j 的**每客户端
 * 熔断**），再加上 Spring Cloud Stream 的 **error channel / 死信队列**：送不达的那一条
 * **记下来**，而不是悄悄丢掉。
 *
 * 口径（刻意保持窄）：
 * - **底层仍然是 `window` 上的 `CustomEvent`**。迁移一个监听不需要改动派发方，也不需要改动
 *   回调签名 —— 回调拿到的还是那个 `CustomEvent`（`e.detail` 照旧），`this` 照旧是事件宿主。
 * - `name` 必须是 `engine/events.js` 里登记过的名字，否则**当场抛错**。抄错名字从"下游静默失踪"
 *   升级成"启动就炸"，这是这张登记表唯一的运行期咽喉。
 * - `tag` 是**所有权标识**，约定 `"域/类名"`（例：`'ui/HUD'`）。`offAll(tag)` 会把该 tag 下的
 *   全部监听一次性撤掉，所以**一个 tag 只能属于一个活实例**；确有多个并存实例时（例如按实体
 *   建的 director），tag 必须带上实例后缀（`'combat/boss#${id}'`），否则撤一个会连坐撤光。
 * - 载荷的**键级校验仍没做**：登记表里 58 条 `payload` 有 45 条写的是散文（"整体转发成就对象：
 *   id/title/desc"），拿它当 schema 校验只会产生假阳性。等 payload 改成精确键清单再开。
 * - **死信账只记不重放**：这里没有"重新派发"的能力，也没有顺序保证。要谈重放就得先谈
 *   "这条事件现在还有没有意义"（`enemy-defeated` 重放一只早就清理掉的敌人是错的），那是另一片。
 * - **本模块不开计时器**（与 `platform/bulkhead.js` 同一条纪律）：熔断冷却吃 `推进监听时钟()`
 *   推进来的秒数，那是主循环的基建时钟。没有主循环推它（node 直跑、构建期预演）⇒ 冷却不走
 *   ⇒ 断开的那一条一直断开 —— 那是那句纪律的直接读法，不是缺陷。
 */

import { GAME_EVENTS } from './events.js';
import { 建舱壁, 舱壁调用, 舱壁账, 闭合, 打开 } from '../platform/bulkhead.js';
import { 正整数, 正整数至少一 } from '../platform/config.js';
import { 监听故障描述 } from './errorReporter.js';

/** 没给 tag 的监听归到这里：能被统计，但没法按所有权撤销 —— 门禁不许新代码走这条路 */
export const UNGROUPED = 'ungrouped';

/**
 * 监听侧的两个旋钮（B165 的纪律：**缺省与校验住在主人模块**，配置中心只认这份名册）。
 *
 * 缺省与舱壁组不一样是有意为之：子系统每帧都被调一次，连续三次失败就是一帧之内的事；
 * 监听器的派发密度由玩家行为决定（`enemy-defeated` 可能几秒才一条），冷却太短会让
 * "偶尔炸一次"的消费者永远回不来。
 */
export const 监听阈值键 = 'crossrealm.event-bus.listener-failure-threshold';
export const 监听冷却键 = 'crossrealm.event-bus.listener-cooldown-seconds';
export const 默认监听阈值 = 3;
export const 默认监听冷却秒 = 5;

export const 监听可调项 = [
  {
    键: 监听阈值键,
    缺省: 默认监听阈值,
    校验: 正整数至少一,
    说明: '同一个监听器连续失败几次就断开它（整数，至少 1）',
  },
  {
    键: 监听冷却键,
    缺省: 默认监听冷却秒,
    校验: 正整数,
    说明: '断开后隔多少秒再放一次探测（整数秒，至少 0）',
  },
];

/** 死信账的槽位数（与错误账同一个道理：一个每帧抛的消费者不许把整本账刷满） */
export const 死信上限 = 50;

/**
 * tag → 该所有权下的监听记录。`壳` 才是挂到 `window` 上的那一个（`offAll` 撤的也必须是它）。
 * @type {Map<string, Array<{ name: string, tag: string, handler: EventListener, 壳: EventListener, 舱壁: object, 序号: number }>>}
 */
const owned = new Map();

/** 接线后的配置客户端（`platform/config.js`）—— 没接线就用主人给的缺省 */
let 配置 = null;
/** 失败上报出口（Game 把它接到仓里唯一那本错误账） */
let 上报 = null;
/** 熔断提示出口（Game 把它接到 toast） */
let 提示 = null;
/** 由主循环推进的运行秒 —— 本模块不自建计时器 */
let 运行秒 = 0;
/** 每条 `on()` 注册的序号：舱壁名要唯一，靠它把同 (事件, 所有权) 的多条监听分开 */
let 监听序列 = 0;
/** 已经订阅过的那一个**配置实例**与它的退订口（换实例要先退旧的，见 `接监听`） */
let 已订阅配置 = null;
let 退订配置 = null;

/** @type {Array<{指纹:string,事件:string,所有权:string,原因:string,摘要:string,次数:number,最近运行秒:number,态:string}>} */
let 死信 = [];

/** 当前生效的两个旋钮：优先级 **配置下发 > 主人缺省** */
const 现阈值 = () => (配置 ? 配置.取(监听阈值键, 默认监听阈值) : 默认监听阈值);
const 现冷却 = () => (配置 ? 配置.取(监听冷却键, 默认监听冷却秒) : 默认监听冷却秒);

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
 * 接线：把配置中心、错误账、提示交给监听侧的隔离层。
 *
 * **不接线也能用** —— 隔离、死信账、熔断照常工作，只是没人上报、没有提示，旋钮停在主人缺省上。
 * 这条是刻意的：`on()` 在全仓有 144 个调用点，其中一大半跑在没有 Game 的地方（单测、构建期预演）。
 *
 * @param {object} [选]
 * @param {object} [选.配置] 配置客户端（`platform/config.js`）
 * @param {(条: {事件: string, 所有权: string, 原因: string, 描述: string, 错误: Error|null}) => void} [选.上报]
 * @param {(条: {事件: string, 所有权: string}) => void} [选.提示] 断开那一刻调一次（不是每次失败）
 * @returns {{阈值: number, 冷却秒: number}} 接完之后生效的两个旋钮（给调用方核对，不靠日志）
 */
export function 接监听({ 配置: c = null, 上报: r = null, 提示: n = null } = {}) {
  // 换了一台配置实例（重开一局 = 新 `Game` = 新 `建配置()`）先把旧订阅退掉。
  // 不退的话旧客户端每次下发都会来敲一次已经不作数的大门，而新那台**一个订阅者都没有**
  // —— 旋钮下发了却不换档，那是"配置中心失灵但没人报警"的形状。
  if (已订阅配置 && 已订阅配置 !== c) {
    退订配置?.();
    已订阅配置 = null;
    退订配置 = null;
  }
  配置 = c && typeof c.取 === 'function' ? c : null;
  上报 = typeof r === 'function' ? r : null;
  提示 = typeof n === 'function' ? n : null;
  换档();
  if (配置 && !已订阅配置) {
    已订阅配置 = 配置;
    退订配置 = 配置.订阅(换档);
  }
  return { 阈值: 现阈值(), 冷却秒: 现冷却() };
}

/** 下发即刻生效：**已经挂着**的那一位跟着换档（不只新注册的用新值）。 */
function 换档() {
  if (!配置) return;
  const 阈 = 现阈值();
  const 冷 = 现冷却();
  for (const records of owned.values()) {
    for (const rec of records) {
      const 舱 = rec.舱壁;
      舱.失败阈值 = 阈;
      舱.冷却秒 = 冷;
      // 与舱壁组同一句读法：旋钮说的是"断开后多久放一次探测"，调大就是"先别探"
      if (舱.态 === 打开) 舱.剩余冷却 = 冷;
    }
  }
}

/**
 * 推进监听侧的运行秒 —— 主循环每帧用**基建时钟**调一次。
 * @param {number} 秒
 * @returns {number} 推进之后的运行秒
 */
export function 推进监听时钟(秒) {
  const n = Number(秒);
  if (Number.isFinite(n) && n > 0) 运行秒 += n;
  return 运行秒;
}

/** 当前运行秒（死信账里那一格说的是"哪一刻"） */
export const 监听时钟 = () => 运行秒;

/**
 * 送不达记账（Spring Cloud Stream 的死信语义）。
 *
 * 指纹 = 事件 + 所有权 + 原因 + 摘要 —— 同一种死法占一个槽位、只累加次数；换一个异常消息
 * 就是另一种死法，分开记（与仓里那本错误账同一套去重口径）。
 */
function 记死信(rec, 原因, 错) {
  const 摘要 = String(错?.message ?? 错 ?? '');
  const 指纹 = `${rec.name}|${rec.tag}|${原因}|${摘要}`;
  const hit = 死信.find((d) => d.指纹 === 指纹);
  if (hit) {
    hit.次数 += 1;
    hit.最近运行秒 = 运行秒;
    hit.态 = rec.舱壁.态;
    return hit;
  }
  const 条 = {
    指纹,
    事件: rec.name,
    所有权: rec.tag,
    原因,
    摘要,
    次数: 1,
    最近运行秒: 运行秒,
    态: rec.舱壁.态,
  };
  死信.push(条);
  while (死信.length > 死信上限) 死信.shift();
  return 条;
}

/**
 * 诊断链自己不许掀翻派发链。
 *
 * `上报` 是外面接进来的回调（Game 的错误账），`console.error` 在测试里可能被人换成会抛的桩。
 * 这一层要是漏出去，垫片那条通道上"一个坏监听掀翻派发方"就换了个主角重演一遍 —— 那正是本片要治的病。
 */
function 兜住(fn) {
  try {
    fn();
  } catch (外) {
    // 与 `记死信` 同一套去重口径：一种死法占一个槽位、只累加次数。
    // 不去重的话，一个**每帧都抛**的坏监听配上同样每帧都炸的上报回调，会把整本死信账
    // 冲成一色 —— 而那些行是诊断链自己的事，不是消费者丢掉的消息。
    const 摘要 = String(外?.message ?? 外);
    const 指纹 = `__diagnostic__|${摘要}`;
    const hit = 死信.find((d) => d.指纹 === 指纹);
    if (hit) {
      hit.次数 += 1;
      hit.最近运行秒 = 运行秒;
      return;
    }
    死信.push({
      指纹,
      事件: 'diagnostic-chain',
      所有权: 'engine/EventBus.js',
      原因: 'diagnostic-failure',
      摘要,
      次数: 1,
      最近运行秒: 运行秒,
      态: 闭合,
    });
    while (死信.length > 死信上限) 死信.shift();
  }
}

/**
 * 包一条监听：跑下游 → 抛了就记死信并叫醒诊断链；连续失败到阈值就断开这一位消费者。
 *
 * 状态机本身在 `platform/bulkhead.js` 里（与 B163 同一台机器，不另起一本），这里只补
 * "监听器这一族"独有的三件事：死信账、把 `this` 交回事件宿主、失败之后仍然不许把异常扔回派发方。
 */
function 派发壳(rec) {
  return function 监听壳(e) {
    const 舱 = rec.舱壁;
    // 冷却吃"距离上一次送给这一位过了多久"—— 派发密度由事件决定，不由帧决定
    const dt = 运行秒 - 舱.上次派发秒;
    舱.上次派发秒 = 运行秒;
    const 宿主 = this ?? win();
    const r = 舱壁调用(舱, () => rec.handler.call(宿主, e), dt);
    if (r.成) return r.值;
    if (r.短路) {
      // 断开期间这一条事件**压根没送到**这一位手里 —— "没送达"本身是信息，记一笔
      记死信(rec, 'dropped-while-open', 舱.最近错误);
      return 舱.降级;
    }
    const 描述 = 监听故障描述(rec.name, rec.tag, r.错误);
    记死信(rec, 'listener-threw', r.错误);
    兜住(() => {
      console.error(描述, r.错误);
      上报?.({ 事件: rec.name, 所有权: rec.tag, 原因: 'listener-threw', 描述, 错误: r.错误 });
      if (r.熔断) 提示?.({ 事件: rec.name, 所有权: rec.tag });
    });
    return 舱.降级;
  };
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
  let record = dup;
  if (!record) {
    const 序号 = ++监听序列;
    record = {
      name,
      tag,
      handler,
      壳: null,
      序号,
      舱壁: 建舱壁(`${name} @ ${tag}#${序号}`, { 失败阈值: 现阈值(), 冷却秒: 现冷却() }),
    };
    record.壳 = 派发壳(record);
    records.push(record);
    win()?.addEventListener(name, record.壳);
  }
  return () => remove(record);
}

/**
 * 移除一个监听，返回是否真的移除了一条。
 * @param {{ name: string, 壳: EventListener }} record
 */
function remove(record) {
  for (const [tag, records] of owned) {
    const i = records.findIndex((r) => r === record);
    if (i < 0) continue;
    records.splice(i, 1);
    if (records.length === 0) owned.delete(tag);
    win()?.removeEventListener(record.name, record.壳);
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
  for (const r of list) w?.removeEventListener(r.name, r.壳);
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

/**
 * 监听侧名册（注册表读数）：一条**还挂着**的监听 = 一位消费者。
 *
 * 注销掉的不在这里 —— 这本读的是"现在谁在听"，不是"历史上谁炸过"（后者是 `死信账()`）。
 * 所以 `offAll()` 之后这一格不许留尸体。
 */
export function 监听名册() {
  const 出 = [];
  for (const records of owned.values()) {
    for (const rec of records) 出.push({ ...舱壁账(rec.舱壁), 事件: rec.name, 所有权: rec.tag, 序号: rec.序号 });
  }
  return 出;
}

/** 不在闭合态的消费者（真坏的） */
export function 坏监听() {
  return 监听名册().filter((c) => c.态 !== 闭合).map((c) => c.名);
}

/** 健康判据：全部闭合，且没有留着一个未清的最近错误（与舱壁组同一条） */
export function 监听健康() {
  return 监听名册().every((c) => c.态 === 闭合 && c.最近错误 === null);
}

/** 死信账（副本，改不动真账） */
export const 死信账 = () => 死信.map((d) => ({ ...d }));

/** 一共丢了多少条送不达的消息（同一死法重复的次数都算） */
export const 死信数 = () => 死信.reduce((n, d) => n + d.次数, 0);

/** 清死信账，返回清掉了几行（换关 / 诊断台用） */
export function 清死信() {
  const n = 死信.length;
  死信 = [];
  return n;
}
