/**
 * 无头 harness 的 **CDP 管道真源**（W-D4 切片10）—— `npm run e2e`、`npm run e2e:combat`
 * 与 `npm run perf` 三个脚本共用这一段"把一句话写进 Chrome、把它的回答等回来"。
 *
 * ## 为什么现在抽这一份（而不是再抄第三遍）
 *
 * 抽之前那三处长得几乎一样，差别全在**坏的那一面**：
 * - `e2e-clear.mjs`（切片9b）有断线交回，但 `send` 只有 `res`、没有每请求上限；
 * - `e2e-combat.mjs:264` 与 `perf-smoke.mjs:282` 两处都只有 `pending.set(id, res)` ——
 *   没有 `rej`、没有 close 监听、没有钟。于是"Chrome 活着、`/json/list` 答话、`Runtime.evaluate`
 *   一条都不回"那种沉默的坏（`soak.mjs:264` 在 2026-10-31 校准8 真撞上过一次）在这两条门禁上
 *   **不是红，是永远挂着**：两个脚本都没有 soak 那只 `墙钟保险`。
 * - `evalJs` 里"页面内抛错要带出原话与位置"那一段（`perf-smoke.mjs:290` / `e2e-combat.mjs:273` /
 *   `e2e-clear.mjs:388`）是第三份一字不差的抄本，改一处另外两处不会红 —— 这正是这一族
 *   一直在清的形状。
 *
 * `soak.mjs` 那份**这次不动**：它的 `send` 早就有 `rej` 与钟，形状与这里一致，但它还在用
 * `ws.onclose`（属性式）而不是 `addEventListener`，且它的 `墙钟保险` 与本管道纠缠在一起。
 * 并它需要单独一轮真机 soak（20 分钟起），登记成尾巴。
 *
 * ## 这一份定的三件事
 *
 * ① **断线与超时都走 reject**（不是"交回一个带标记的Resolve"）。`e2e-clear` 原来交回 `{ 断线 }`
 *   是因为它唯一的消费者 `evalJs` 会检查那一格；可这三个脚本里都有**裸** `await send('Runtime.enable')`，
 *   交回标记等于"通道死了还算成功"，下一步才炸。reject 让每一处 await 自己就是红的。
 * ② **每请求的钟不 `unref`**。`soak` 那边 unref 了，于是"页不应答"要等它的墙钟保险（十六分钟）才响；
 *   不 unref 就是到点自己 settle 并抛出一条点名的环境红 —— 顺带避开切片9b 量到的另一种收尾：
 *   顶层 await 永不 settle 时 Node 直接以 **13** 退出（`.tmp-20261031-s25/exit-probe.mjs`），
 *   那个码既不是 1 也不是 2，谁都不会去读它。
 * ③ **事件一律 `addEventListener`**，不用 `ws.on(…)`：这里没有 import `ws`，`WebSocket` 是 Node
 *   自带的全局实现（undici），`.on` 在它身上不存在 —— 写成 `ws.on('close', …)` 的后果就是
 *   `clear-r3.log` 那句 `ws.on is not a function`（退出码 2，而它红的原因与浏览器、页面、主线都没关系）。
 *   这条不是靠注释守：`tests/cdp-channel.test.js` 的假 ws **没有** `.on` 这个成员，谁改回去当场 TypeError。
 *
 * 本模块**导入不执行**（不碰端口、不起浏览器），所以门禁可以直接 import 它跑行为测试 ——
 * 断线交回、每请求超时这些"只在坏的时候才走"的路径，第一次不用起浏览器就能验。
 */
import { 原话尾巴 } from './harness-readings.mjs';

/** 判据交白卷时的话 —— 与"浏览器真的没说话"分得开（切片8 同一课） */
const 交白卷 = '(浏览器一个字都没输出 —— 那句"通道断了"不是它说的)';

/**
 * Chrome 自己那条流的原话尾巴（`vite话()` 那一族立的规矩在这里照用：**交白卷也要交尾巴**）。
 *
 * 断线那句话点不出成因：崩在渲染进程、显存不够、上一轮泄漏的浏览器被 `taskkill` 打掉 ——
 * 在 CDP 这一侧全都只写成同一句"通道关闭（码=1006）"。能点名的一样都在浏览器这条流上
 * （`# Crash` / out of memory / renderer gone），所以**收了却不读**等于没收。
 * 反过来，尾巴是空的这句必须明说是空的 —— 判据交白卷不等于浏览器没说话。
 */
export const Chrome的话 = (浏览器输出) => {
  const 尾 = 原话尾巴(浏览器输出.join(''), 5);
  return 尾.length ? 尾.join('\n - ') : 交白卷;
};

/**
 * 打开一条 CDP 通道。
 *
 * @param ws             已经 `open` 的 WebSocket（连接本身不归本模块管：三个脚本各自
 *                       `await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; })`，
 *                       那是**属性式**的，与下面的 `addEventListener` 各走各的、不互相顶掉）
 * @param 名义           红话前缀（`e2e-clear` / `e2e-combat` / `perf-smoke`）—— 一份管道三个用户，
 *                       话里得说得出是谁家的通道断了
 * @param 通道           调用方的**外层**计数器 `{ 执行上下文, 加载完成 }`：声明在 try 外面是 6d 要的
 *                       （catch 也要读得到），所以由调用方持有、本模块只往里加
 * @param 浏览器输出     Chrome 的 stderr/stdout 收集数组，断线那句尾巴用它算
 * @param 每请求毫秒      单个 CDP 调用的上限
 * @param 等待页面Promise `Runtime.evaluate` 的 `awaitPromise`：`e2e-clear` 推的是同步表达式（false），
 *                       另外两家的站点是页内 async IIFE（true）—— 这一格分得开，是因为它问的是
 *                       "调用方交给页面的那段代码长什么形状"，不是通道的判据
 */
export function 开通道({ ws, 名义, 通道, 浏览器输出 = [], 每请求毫秒 = 300000, 等待页面Promise = false }) {
  let msgId = 0;
  /** id → `{ res, rej, 钟 }`：每个在途调用都带一支自己的表，页不答话时能点名而不是永远等 */
  const pending = new Map();
  const 异常 = [];
  let 断线 = null;

  /** 通道级的红话一律带 Chrome 的尾巴：光说"通道断了"，下一步就去考古 Chrome 为什么退 */
  const 那句 = (为什么) => new Error(`${名义}：${为什么}\nChrome 的话：\n - ${Chrome的话(浏览器输出)}`);

  const 拆通道 = (为什么) => {
    // 只认第一次：异常终止时 `error` 与 `close` 会各来一刀，第二刀不该把成因改成"关闭码 1006"
    if (断线) return;
    断线 = 为什么;
    for (const [, p] of pending) {
      clearTimeout(p.钟);
      p.rej(那句(为什么));
    }
    pending.clear();
  };

  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      clearTimeout(p.钟);
      p.res(m);
    } else if (m.method === 'Runtime.exceptionThrown') {
      // description 优先：抽 JSON 或只取 `text` 会正好切掉异常自己那句话，
      // 于是红只会说"页面内抛错"，责任落不到具体哪一句拒上（perf-smoke 2026-10-20 就这么瞎过一次）
      异常.push(m.params?.exceptionDetails?.exception?.description
        ?? m.params?.exceptionDetails?.text ?? '?');
    } else if (m.method === 'Runtime.executionContextCreated') 通道.执行上下文 += 1;
    else if (m.method === 'Page.loadEventFired') 通道.加载完成 += 1;
  });
  ws.addEventListener('close', (ev) => 拆通道(
    `CDP 通道关闭（码=${ev?.code ?? '?'} 干净=${ev?.wasClean === true} 理由=${String(ev?.reason ?? '').slice(0, 120) || '无'}）`,
  ));
  ws.addEventListener('error', (ev) => 拆通道(`CDP 通道报错（${String(ev?.message ?? ev?.type ?? '?').slice(0, 200)}）`));

  const send = (method, params = {}, 请求毫秒 = 每请求毫秒) => new Promise((res, rej) => {
    if (断线) { rej(那句(断线)); return; } // 通道已经死了：别再往 ws 上写（那会抛成第二个结论）
    const id = ++msgId;
    const 钟 = setTimeout(() => {
      if (!pending.has(id)) return; // 回答已经到过（或被断线交回），这一拍不算超时
      pending.delete(id);
      rej(那句(`CDP ${method} ${Math.round(请求毫秒 / 1000)} 秒没有回应 —— 渲染进程卡死或已崩（口还在、页地址还在，但主线程不答话）`));
    }, 请求毫秒);
    pending.set(id, { res, rej, 钟 });
    try {
      ws.send(JSON.stringify({ id, method, params }));
    } catch (e) {
      pending.delete(id);
      clearTimeout(钟);
      rej(那句(`往 CDP 写 ${method} 就抛了（${String(e?.message ?? e).slice(0, 200)}）`));
    }
  });

  const evalJs = async (expr, 请求毫秒) => {
    const r = await send('Runtime.evaluate',
      { expression: expr, awaitPromise: 等待页面Promise, returnByValue: true }, 请求毫秒);
    if (r.result?.exceptionDetails) {
      const d = r.result.exceptionDetails;
      const 原话 = d.exception?.description ?? d.exception?.value ?? d.text ?? '?';
      const 位置 = `${d.url || '页内'}:${(d.lineNumber ?? -1) + 1}:${d.columnNumber ?? '?'}`;
      throw new Error(`页面内抛错 @${位置}：${String(原话).split('\n')[0].slice(0, 400)}`);
    }
    return r.result?.result?.value;
  };

  return {
    send, evalJs, 异常,
    /** 通道此刻死没死、以及死因（调用方拿来写自己的"谁动的"那句归因） */
    断线信息: () => 断线,
  };
}
