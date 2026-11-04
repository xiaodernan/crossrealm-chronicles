/**
 * `scripts/cdp-channel.mjs` 的行为门禁（W-D4 切片10）。
 *
 * 这一族测试的存在就是这一片的目的：**断线交回 / 每请求超时这些"只在坏的时候才执行"的路径，
 * 第一次不靠起浏览器就能验**。切片9b 之前这类话只能靠源码级反向控制（证明"那段代码还在"），
 * 而"还在"与"真会响"是两件事 —— 9b 为了证明后者专门跑了 4 臂真机轮次，一轮一百多秒。
 * 这里拿一个假 ws 把同一批形状变成毫秒级。
 *
 * 假 ws **故意没有 `.on` 这个成员**（Node 自带的全局 `WebSocket` 也没有）：谁把 `addEventListener`
 * 改回 `ws.on('close', …)`，`开通道` 里那一句就当场 `TypeError: ws.on is not a function` ——
 * 那正是 `clear-r3.log` 在真机上撞过的错（退出码 2，而它红的原因与浏览器、页面、主线都没关系）。
 * 形状本身就是判据，最后那条例只是把这件事再钉一遍。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { 开通道, Chrome的话 } from '../scripts/cdp-channel.mjs';

const 源文 = readFileSync(join(process.cwd(), 'scripts/cdp-channel.mjs'), 'utf-8');

/** 一个只实现标准 WebSocket 那一面的假通道：`addEventListener` + `send`，没有 `.on` */
class 假通道 {
  constructor() {
    this.监听 = new Map();
    this.发出 = [];
    this.写就抛 = null;
  }

  addEventListener(名, fn) {
    if (!this.监听.has(名)) this.监听.set(名, []);
    this.监听.get(名).push(fn);
  }

  send(文本) {
    if (this.写就抛) throw this.写就抛;
    this.发出.push(JSON.parse(文本));
  }

  触发(名, ev) { for (const fn of this.监听.get(名) ?? []) fn(ev); }
  收到(消息) { this.触发('message', { data: JSON.stringify(消息) }); }
  第一条id() { return this.发出[0].id; }
}

/** 每请求上限取 2 秒：太短会把红话里的秒数舍成"0 秒"，那条红就没法读了 */
const 新通道 = (工厂选项 = {}) => {
  const ws = new 假通道();
  const 通道 = { 执行上下文: 0, 加载完成: 0 };
  const 浏览器输出 = [];
  const c = 开通道({ ws, 名义: '测试', 通道, 浏览器输出, 每请求毫秒: 2000, ...工厂选项 });
  return { ws, 通道, 浏览器输出, c };
};

describe('cdp-channel（W-D4 切片10）', () => {
  it('通道关闭 ⇒ 每一个在等的 await 都被交回，话里带着码与 Chrome 的原话', async () => {
    const { ws, c, 浏览器输出 } = 新通道();
    浏览器输出.push('DevTools listening on ws://127.0.0.1:1/json/target', '# Crash render process gone');
    const 甲 = c.send('Runtime.enable');
    const 乙 = c.evalJs('1 + 1');
    expect(ws.发出).toHaveLength(2);
    ws.触发('close', { code: 1006, wasClean: false, reason: 'renderer gone' });
    await expect(甲).rejects.toThrow(/CDP 通道关闭（码=1006 干净=false 理由=renderer gone）/);
    await expect(乙).rejects.toThrow(/# Crash render process gone/);
    // 红话要说出是谁家的通道：一份管道三个用户，不说名字就分不清是谁红了
    await expect(甲).rejects.toThrow(/^测试：/);
  });

  it('只认第一次成因：error 先来 close 后到，把成因改写成"关闭码"就查不到真因', async () => {
    const { ws, c } = 新通道();
    const 在等 = c.send('Page.enable');
    ws.触发('error', { message: 'socket hang up' });
    ws.触发('close', { code: 1006, wasClean: false, reason: '' });
    await expect(在等).rejects.toThrow(/CDP 通道报错（socket hang up）/);
    expect(c.断线信息()).toMatch(/报错/);
  });

  it('页不答话 ⇒ 到点自己 reject 并点名方法，而不是留一个永不 settle 的 await（退出码 13 那一族）', async () => {
    const { ws, c } = 新通道();
    await expect(c.send('Runtime.evaluate')).rejects.toThrow(/Runtime\.evaluate 2 秒没有回应/);
    expect(ws.发出).toHaveLength(1);
  });

  it('超时的请求被摘掉：同 id 的回答迟到也不许冒领，也不许被当成异常收走', async () => {
    const { ws, c } = 新通道();
    await expect(c.send('Runtime.evaluate')).rejects.toThrow(/没有回应/);
    ws.收到({ id: ws.第一条id(), result: { result: { value: '迟到的' } } });
    expect(c.异常).toEqual([]);
    // 摘干净了才谈得上"下一次照常能用"
    const 好 = c.send('Runtime.enable');
    ws.收到({ id: ws.发出[1].id, result: {} });
    await expect(好).resolves.toEqual({ id: ws.发出[1].id, result: {} });
  });

  it('断线之后再 send 立即红，而且不再往 ws 上写（那会抛成第二个结论）', async () => {
    const { ws, c } = 新通道();
    ws.触发('close', { code: 1001, wasClean: true, reason: 'going away' });
    const 写了几条 = ws.发出.length;
    await expect(c.send('Runtime.enable')).rejects.toThrow(/CDP 通道关闭/);
    expect(ws.发出).toHaveLength(写了几条);
  });

  it('往 ws 写就抛（socket 已不可写）⇒ 红话点名到 method，且这笔没挂在途、后面照常能用', async () => {
    const { ws, c } = 新通道();
    ws.写就抛 = new Error('INVALID_STATEError: WebSocket is already closed');
    await expect(c.send('Page.navigate')).rejects.toThrow(/往 CDP 写 Page\.navigate 就抛了/);
    ws.写就抛 = null;
    const 好 = c.send('Runtime.enable');
    ws.收到({ id: ws.第一条id(), result: {} });
    await expect(好).resolves.toBeTruthy();
  });

  it('evalJs 取回 returnByValue 的值，awaitPromise 按打开通道时那一格传', async () => {
    const 同步 = 新通道();
    const p = 同步.c.evalJs('window.__game.quests.questIndex');
    同步.ws.收到({ id: 同步.ws.第一条id(), result: { result: { value: 78 } } });
    expect(await p).toBe(78);
    expect(同步.ws.发出[0].params.awaitPromise).toBe(false);

    const 异步 = 新通道({ 等待页面Promise: true });
    const p2 = 异步.c.evalJs('(async () => 1)()');
    异步.ws.收到({ id: 异步.ws.第一条id(), result: { result: { value: 1 } } });
    expect(await p2).toBe(1);
    expect(异步.ws.发出[0].params.awaitPromise).toBe(true);
  });

  it('页面里抛错 ⇒ 带出它自己的那句原话与位置（抽 JSON 前 300 字会正好切掉 description）', async () => {
    const { ws, c } = 新通道();
    const 抛 = c.evalJs('bad()').catch((e) => String(e));
    ws.收到({
      id: ws.第一条id(),
      result: {
        exceptionDetails: {
          url: 'http://127.0.0.1:5321/src/game/QuestSystem.js', lineNumber: 43, columnNumber: 12,
          text: 'Uncaught',
          exception: { description: "TypeError: Cannot read properties of undefined (reading 'quests')\n    at x" },
        },
      },
    });
    const 话 = await 抛;
    expect(话).toMatch(/页面内抛错 @http:\/\/127\.0\.0\.1:5321\/src\/game\/QuestSystem\.js:44:12/);
    expect(话).toMatch(/TypeError: Cannot read properties of undefined/);
  });

  it('事件收集：exceptionThrown 进异常表（description 优先，两者都没有才是 ?）', async () => {
    const { ws, c } = 新通道();
    // 先挂一个真请求，用它证明"下面这三帧没在任何在途 promise 上冒领"
    const 在等 = c.send('Runtime.enable');
    ws.收到({ method: 'Runtime.exceptionThrown', params: { exceptionDetails: { text: 'Uncaught', exception: { description: 'boom' } } } });
    ws.收到({ method: 'Runtime.exceptionThrown', params: { exceptionDetails: { text: '只有一句 text' } } });
    ws.收到({ method: 'Runtime.exceptionThrown', params: {} });
    expect(c.异常).toEqual(['boom', '只有一句 text', '?']);
    await expect(在等).rejects.toThrow(/没有回应/);
  });

  it('计数器加在调用方那个 通道 对象上（catch 要读得到它 —— 6d 的那条作用域纪律）', async () => {
    const { ws, 通道, c } = 新通道();
    ws.收到({ method: 'Runtime.executionContextCreated', params: {} });
    ws.收到({ method: 'Runtime.executionContextCreated', params: {} });
    ws.收到({ method: 'Page.loadEventFired', params: {} });
    expect(通道).toEqual({ 执行上下文: 2, 加载完成: 1 });
    expect(c.断线信息()).toBe(null);
  });

  it('Chrome 的原话尾巴：判据交白卷不等于浏览器没说话（切片8 同一课）', () => {
    // `浏览器输出` 收的是 stderr **块**（`chrome.stderr.on('data', b => push(String(b)))`），
    // 一块里可能三行也可能半行 —— 所以这里喂的也是块，不是行。
    expect(Chrome的话([])).toMatch(/浏览器一个字都没输出/);
    expect(Chrome的话(['第一行\n', '\n 第二行 \n'])).toBe('第一行\n - 第二行');
    expect(Chrome的话(['a\nb\nc\nd\ne\nf'])).toBe('b\n - c\n - d\n - e\n - f');
  });

  it('每请求那只钟不许 unref：unref 之后"沉默的 Chrome"要等调用方的墙钟才响（soak 那边是十六分钟）', () => {
    expect(源文.includes('const 钟 = setTimeout('), '每请求的钟不是 setTimeout 那一格 —— 判据失去参照').toBe(true);
    expect(/钟\.unref/.test(源文), '钟被 unref 了：到点没人醒，这一轮不是红而是退出码 13').toBe(false);
  });

  it('只用标准 WebSocket 的监听面（`.on` 在 Node 自带实现上不存在，r3 就是这么红的）', () => {
    expect(源文.includes("addEventListener('close'") && 源文.includes("addEventListener('error'")
      && 源文.includes("addEventListener('message'"), '三个监听少一个 —— 断线与回包总得有人接').toBe(true);
    expect(/^\s*ws\.on\(/m.test(源文), 'ws.on( 回潮 —— Node 全局 WebSocket 没有 .on').toBe(false);
  });
});
