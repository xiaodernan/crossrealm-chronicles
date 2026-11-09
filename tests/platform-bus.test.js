import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  建总线, 实例身份, 换实例身份, 默认总线名, 账上限, 身份键, 结果集,
} from '../src/platform/bus.js';
import { 建配置, 配置总线题, 刷新题, 默认应用名 } from '../src/platform/config.js';
import { SaveSystem, 存档总线题, 存档题 } from '../src/game/SaveSystem.js';
import { SaveValidator } from '../src/game/SaveValidator.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { CURRENT_VERSION } from '../src/game/SaveMigrations.js';

/**
 * 跨实例总线（B167 / Spring Cloud 内化 切片5）。
 *
 * 借的契约是 **Spring Cloud Bus**：一台"服务"同时跑着好几个实例时，改在一处发生，
 * 消息要送到其余每一处。这里的"实例"就是同一个页面开的第二个标签页 —— 改前普查
 * （2026-11-10）：全仓 `BroadcastChannel` 命中 **0** 处、`storage` 事件监听 **0** 处，
 * 而写同一批 localStorage 键的位点有 **8** 处。于是两个标签页是两份互不通气的状态，
 * 症状不是报错，是"B 写了这一格存档 / B 下发了这个旋钮，A 完全不知道"。
 *
 * 六组分别量：
 *  ① 身份：同一张标签页 = 同一个实例（重载不换人），拿不到 sessionStorage 也不炸；
 *  ② 传输：三条降级链各走**生产那条路**（真 BroadcastChannel / 真 storage 事件 / 都没有），
 *     而不是只测注入的假件 —— 假传输测不出"缺能力时不假装工作"；
 *  ③ 题名册与形状：没登记的题**自己发当场抛、外来拒收**，信封与载荷各有尺子；
 *  ④ 投递与账：一位订阅者炸了不带走另一位，回声不吃，序号跳了要说出跳了几条，
 *     通道抛了不带走主事但照样占号，账按指纹去重且上限是硬的；
 *  ⑤ 配置防风暴：`local` / `remote` 那一格分家在**总线两侧都不许漏**；
 *  ⑥ 存档与接线：写成功才广播、载荷里不许有存档内容，Game 那一段接线在册。
 *
 * 有对照臂：⑤ 里那一条"故意不给来源"的接法必须比生产接法多涨一格版本 —— 没有它，
 * "不广播"那一条可能只是通道没通。
 */

const ROOT = process.cwd();
const 总线源文 = readFileSync(join(ROOT, 'src/platform/bus.js'), 'utf8');
const 配置源文 = readFileSync(join(ROOT, 'src/platform/config.js'), 'utf8');
const 存档源文 = readFileSync(join(ROOT, 'src/game/SaveSystem.js'), 'utf8');
const 游戏源文 = readFileSync(join(ROOT, 'src/core/Game.js'), 'utf8');
const 去注释 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** 从源码里 `标记` 之后第一个 `{` 起取配对的那一块（比 indexOf 猜尾巴稳） */
function 取块(源码, 标记) {
  const 起 = 源码.indexOf(标记);
  expect(起, `源码里找不到「${标记}」`).toBeGreaterThan(-1);
  const 开 = 源码.indexOf('{', 起);
  let 深度 = 0;
  for (let i = 开; i < 源码.length; i += 1) {
    if (源码[i] === '{') 深度 += 1;
    else if (源码[i] === '}') {
      深度 -= 1;
      if (深度 === 0) return 源码.slice(起, i + 1);
    }
  }
  throw new Error(`「${标记}」的左括号没有配对的右括号`);
}

/** 探针题：载荷要带一个数字 n */
const 探针题 = { 题: 'probe-topic', 校验: (p) => typeof p?.n === 'number', 说明: '要带一个数字 n' };
const 另一题 = { 题: 'other-topic', 说明: '没有校验的一道题' };
const 全名册 = [探针题, 另一题, 配置总线题, 存档总线题];

/** 本文件建过的总线：逐条关掉，真通道的句柄不给下一轮留场 */
const 建过的 = [];
function 建(选 = {}) {
  const 总线 = 建总线({ 名册: 全名册, ...选 });
  建过的.push(总线);
  return 总线;
}

afterEach(() => {
  while (建过的.length) 建过的.pop()?.关();
});

/**
 * 一个内存枢纽（注入用的假传输）：**每个收到的人拿到的都是自己那一份副本**，
 * 与真 BroadcastChannel 的结构化拷贝同口径。`回环` 打开时连发送方自己也投 ——
 * 那是专门用来验"回声过滤到底住在谁的代码里"的形状。
 */
function 造枢纽({ 回环 = false } = {}) {
  const 分组 = new Map();
  return (名, 交回) => {
    if (!分组.has(名)) 分组.set(名, new Set());
    const 集 = 分组.get(名);
    集.add(交回);
    return {
      名: 'hub',
      发送: (条) => {
        for (const 送 of [...集]) {
          if (!回环 && 送 === 交回) continue;
          送(JSON.parse(JSON.stringify(条)));
        }
      },
      关: () => { 集.delete(交回); },
    };
  };
}

describe('① 实例身份：同一张标签页 = 同一个实例', () => {
  afterEach(() => { 换实例身份(null); delete globalThis.sessionStorage; });

  it('两次调用回同一个值（每调用一次新造一个，两个标签页就分不出谁是谁了）', () => {
    换实例身份(null);
    expect(实例身份()).toBe(实例身份());
    expect(typeof 实例身份()).toBe('string');
    expect(实例身份().length).toBeGreaterThan(0);
  });

  it('sessionStorage 里已经有那一份 ⇒ 用它（重载一张标签页在 Bus 的口径里还是同一个实例）', () => {
    const 存 = new Map([['别的键', 'x']]);
    globalThis.sessionStorage = {
      getItem: (k) => (存.has(k) ? 存.get(k) : null),
      setItem: (k, v) => 存.set(k, String(v)),
      removeItem: (k) => 存.delete(k),
    };
    换实例身份(null);
    const 第一次 = 实例身份();
    expect(存.get(身份键), '身份没落到 sessionStorage —— 重载就会换人').toBe(第一次);
    换实例身份(null);                      // 模拟"页面重载：内存清了，存储还在"
    expect(实例身份(), '重载之后换了身份').toBe(第一次);
  });

  it('sessionStorage 一取就抛（隐私模式）⇒ 不炸，照样给一个身份', () => {
    globalThis.sessionStorage = {
      getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('SecurityError'); },
      removeItem() { throw new Error('SecurityError'); },
    };
    换实例身份(null);
    expect(() => 实例身份()).not.toThrow();
    expect(实例身份()).toBe(实例身份());
  });
});

describe('② 传输：三条降级链各走生产那条路', () => {
  it('node 里有 BroadcastChannel ⇒ 默认就选它，而且两条总线**真的**互通（不是注入的假件）', async () => {
    const A = 建({ 身份: 'tab-A' });
    const B = 建({ 身份: 'tab-B' });
    expect(A.传送名(), `默认传输该走 broadcast-channel，读到「${A.传送名()}」`).toBe('broadcast-channel');
    const 收到 = [];
    B.订阅(探针题.题, (消息) => 收到.push(消息));
    A.发布(探针题.题, { n: 7 });
    await new Promise((取) => { setTimeout(取, 20); });
    expect(收到.length, '真通道没把消息送到另一个实例').toBe(1);
    expect(收到[0].载荷).toEqual({ n: 7 });
    expect(收到[0].发出方).toBe('tab-A');
  });

  it('摘掉 BroadcastChannel、有 window 与 localStorage ⇒ 走 storage 事件，且不给自己回声', () => {
    const 真通道 = globalThis.BroadcastChannel;
    const 监听们 = [];
    const 存 = new Map();
    globalThis.BroadcastChannel = undefined;
    globalThis.window = {
      addEventListener: (名, 手) => { if (名 === 'storage') 监听们.push(手); },
      removeEventListener: (名, 手) => { const i = 监听们.indexOf(手); if (i >= 0) 监听们.splice(i, 1); },
    };
    globalThis.localStorage = {
      getItem: (k) => (存.has(k) ? 存.get(k) : null),
      setItem: (k, v) => 存.set(k, String(v)),
      removeItem: (k) => 存.delete(k),
    };
    try {
      const A = 建({ 身份: 'tab-A' });
      const B = 建({ 身份: 'tab-B' });
      expect(A.传送名()).toBe('storage-event');
      const 甲 = []; const 乙 = [];
      A.订阅(探针题.题, (消息) => 甲.push(消息));
      B.订阅(探针题.题, (消息) => 乙.push(消息));
      A.发布(探针题.题, { n: 1 });
      // 浏览器给"别的标签页"发 storage 事件：写的人自己不收 —— 这里手工把事件递给 B
      const 键 = `crossrealm.bus.${默认总线名}`;
      expect(存.has(键), '没往那一个固定键上写').toBe(true);
      const 事件 = { key: 键, newValue: 存.get(键) };
      for (const 手 of 监听们) 手(事件);
      expect(乙.length, 'storage 那条路没送进对端').toBe(1);
      expect(甲.length, '写的那一页收到了自己的回声').toBe(0);
      // 载荷是 JSON 过的：改它改不动发出方那一份
      乙[0].载荷.n = 99;
      expect(JSON.parse(存.get(键)).payload.n, '存储里那份被订阅者改动了').toBe(1);
      // 别的键 / 不是 JSON 的内容都不该喂进订阅者
      const 前 = 乙.length;
      for (const 手 of 监听们) 手({ key: 'crossrealm_save_v21', newValue: '{"topic":"probe-topic","sender":"x","seq":9,"payload":{"n":5}}' });
      for (const 手 of 监听们) 手({ key: 键, newValue: 'not-json{' });
      expect(乙.length, '不相干的键或坏 JSON 也喂进了订阅者').toBe(前);
      A.关();
      expect(存.has(键), '关掉的总线把那一个键留在存储里（有界，但不该留）').toBe(false);
    } finally {
      globalThis.BroadcastChannel = 真通道;
      delete globalThis.window;
      delete globalThis.localStorage;
    }
  });

  it('两样都没有 ⇒ 报 local，发布不抛但**不投递**（缺能力时不假装在工作）', () => {
    const 真通道 = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = undefined;
    delete globalThis.window;
    try {
      const A = 建({ 身份: 'tab-A' });
      expect(A.传送名()).toBe('local');
      const 收到 = [];
      A.订阅(探针题.题, (消息) => 收到.push(消息));
      expect(() => A.发布(探针题.题, { n: 1 })).not.toThrow();
      expect(收到.length, 'local 传输把消息投给了自己 —— 那是"看起来在广播"').toBe(0);
      expect(A.读数().传送).toBe('local');
      expect(A.读数().发出).toBe(1);
    } finally {
      globalThis.BroadcastChannel = 真通道;
    }
  });

  it('关掉之后：不再吃进来的消息，发布与订阅当场抛，dispose 幂等', () => {
    const 枢纽 = 造枢纽();
    const A = 建({ 身份: 'tab-A', 传送: 枢纽 });
    const B = 建({ 身份: 'tab-B', 传送: 枢纽 });
    const 甲 = [];
    A.订阅(探针题.题, (消息) => 甲.push(消息));
    expect(A.关()).toBe(true);
    expect(A.关(), '第二次关该是"已经关了"').toBe(false);
    expect(() => A.发布(探针题.题, { n: 1 })).toThrow(/已关/);
    expect(() => A.订阅(探针题.题, () => {})).toThrow(/已关/);
    expect(() => B.发布(探针题.题, { n: 2 })).not.toThrow();
    expect(甲.length, '关掉的总线还替别人分了一条').toBe(0);
    expect(A.读数().已关).toBe(true);
    // 关的时候把自己从通道上摘干净：剩下两页之间照常通，没被这一下带坏
    const C = 建({ 身份: 'tab-C', 传送: 枢纽 });
    const 乙 = [];
    B.订阅(探针题.题, (消息) => 乙.push(消息));
    C.发布(探针题.题, { n: 3 });
    expect(乙.length, 'A 关完把枢纽里别人的通道也关了').toBe(1);
    expect(A.dispose()).toBe(false);
  });

  it('关的时候通道里还有一条在飞 ⇒ 投递自己认闸（订阅表清了不稀奇，连账都不再记才是证据）', () => {
    const 交回们 = [];
    const A = 建({
      身份: 'tab-A',
      传送: (名, 交回) => { 交回们.push(交回); return { 名: 'hub', 发送: () => {}, 关: () => {} }; },
    });
    const 收到 = [];
    A.订阅(探针题.题, (消息) => 收到.push(消息));
    expect(A.关()).toBe(true);
    // 关只摘监听器，管不到已经在路上那一条；`订阅表` 也当场清了 —— 于是"没人收到"是两样清空的表
    // 挡下来的，跟闸有没有关没关系。真证据在账上：迟到的那一条**一行都不许留**。
    expect(() => 交回们[0]({ topic: 探针题.题, sender: 'tab-X', seq: 1, payload: { n: 1 } })).not.toThrow();
    expect(收到).toEqual([]);
    expect(A.账(), `关掉的总线还在替在途的消息记账：${JSON.stringify(A.账())}`).toEqual([]);
    expect(A.读数().收到).toBe(0);
  });
});

describe('③ 题名册与形状：没登记的题与不合的载荷都到不了订阅者', () => {
  it('名册外的题：自己发**当场抛**，不许飘进通道让别人猜', () => {
    const A = 建({ 身份: 'tab-A', 传送: 造枢纽() });
    expect(() => A.发布('topic-not-in-roster', {})).toThrow(/不在名册/);
    expect(() => A.订阅('topic-not-in-roster', () => {})).toThrow(/不在名册/);
  });

  it('名册外的题：**外来**的消息拒收并记账，订阅者零调用（别的应用共用同一条通道不该炸这里）', () => {
    const 交回们 = [];
    const A = 建({
      身份: 'tab-A',
      传送: (名, 交回) => { 交回们.push(交回); return { 名: 'hub', 发送: () => {}, 关: () => {} }; },
    });
    const 收到 = [];
    A.订阅(探针题.题, (消息) => 收到.push(消息));
    expect(() => 交回们[0]({ topic: 'stranger-topic', sender: 'other-app', seq: 1, payload: {} })).not.toThrow();
    expect(收到.length).toBe(0);
    const 行 = A.账().find((条) => 条.结果 === 'unknown-topic');
    expect(行, '拒收了但没留名').toBeTruthy();
    expect(行.题).toBe('stranger-topic');
    expect(结果集).toContain(行.结果);
  });

  it('载荷不合校验：发的时候抛（说出那道校验的说明），收的时候拒', () => {
    const A = 建({ 身份: 'tab-A', 传送: 造枢纽() });
    expect(() => A.发布(探针题.题, { n: '不是数字' })).toThrow(/要带一个数字 n/);
    const 交回们 = [];
    const B = 建({
      身份: 'tab-B',
      传送: (名, 交回) => { 交回们.push(交回); return { 名: 'hub', 发送: () => {}, 关: () => {} }; },
    });
    const 收到 = [];
    B.订阅(探针题.题, (消息) => 收到.push(消息));
    交回们[0]({ topic: 探针题.题, sender: 'tab-A', seq: 1, payload: { n: null } });
    expect(收到.length).toBe(0);
    expect(B.读数().拒收).toBe(1);
    expect(B.账().find((条) => 条.结果 === 'bad-payload').摘要).toBe(探针题.说明);
  });

  it('信封不合的每一种都只记账，不进订阅者', () => {
    const 交回们 = [];
    const A = 建({
      身份: 'tab-A',
      传送: (名, 交回) => { 交回们.push(交回); return { 名: 'hub', 发送: () => {}, 关: () => {} }; },
    });
    const 收到 = [];
    A.订阅(探针题.题, (消息) => 收到.push(消息));
    const 坏们 = [
      [null, '不是对象'],
      ['字符串', '不是对象'],
      [[], '不是对象'],
      [{ sender: 'x', seq: 1, payload: {} }, '缺 topic'],
      [{ topic: 探针题.题, seq: 1 }, '缺 sender'],
      [{ topic: 探针题.题, sender: 'x', seq: 1.5 }, 'seq 不是非负整数'],
      [{ topic: 探针题.题, sender: 'x', seq: -1 }, 'seq 不是非负整数'],
    ];
    for (const [坏, 期望摘要] of 坏们) {
      expect(() => 交回们[0](坏), `信封坏成 ${期望摘要} 时把派发搞崩了`).not.toThrow();
    }
    expect(收到.length).toBe(0);
    // 同一种死法只占一行（与死信账同口径的指纹去重）：**四种**死法四行，次数加起来还是七
    const 行们 = A.账().filter((条) => 条.结果 === 'bad-envelope');
    const 死法 = new Set(行们.map((条) => 条.摘要));
    expect(死法, `坏信封的死法没都留名：读到 ${[...死法].join(' / ') || '(空)'}`).toEqual(
      new Set(['不是对象', '缺 topic', '缺 sender', 'seq 不是非负整数']));
    expect(行们.length).toBe(4);
    expect(行们.reduce((n, 条) => n + 条.次数, 0), '七条坏信封有没进账的').toBe(7);
    for (const 条 of 行们) expect(条.摘要, '拒收没写原因').toBeTruthy();
  });

  it('名册自己也要合法：重复的题与缺题名的条目当场抛', () => {
    expect(() => 建总线({ 名册: [探针题, 探针题] })).toThrow(/两次/);
    expect(() => 建总线({ 名册: [{ 说明: '没有题名' }] })).toThrow(/题名/);
  });

  it('名册读得出题与说明；没有校验的题任何载荷都收', () => {
    const A = 建({ 身份: 'tab-A', 传送: 造枢纽() });
    expect(A.名册().map((条) => 条.题)).toEqual([探针题.题, 另一题.题, 刷新题, 存档题]);
    expect(() => A.发布(另一题.题, { 随便: '什么都行' })).not.toThrow();
  });
});

describe('④ 投递与账：炸一个不带走一片，回声不吃，丢了要说', () => {
  it('订阅者收到 (消息, 总线)：题 / 发出方 / 序号 / 载荷齐全', () => {
    const 枢纽 = 造枢纽();
    const A = 建({ 身份: 'tab-A', 传送: 枢纽 });
    const B = 建({ 身份: 'tab-B', 传送: 枢纽 });
    let 交来的 = null; let 宿主 = null;
    B.订阅(探针题.题, (消息, 总线) => { 交来的 = 消息; 宿主 = 总线; });
    const 序号 = A.发布(探针题.题, { n: 3 });
    expect(交来的).toEqual({ 题: 探针题.题, 发出方: 'tab-A', 序号, 载荷: { n: 3 } });
    expect(宿主).toBe(B);
  });

  it('一位订阅者炸了不带走另一位，且留下 subscriber-failure 与上报', () => {
    const 枢纽 = 造枢纽();
    const A = 建({ 身份: 'tab-A', 传送: 枢纽 });
    const 上报们 = [];
    const B = 建({ 身份: 'tab-B', 传送: 枢纽, 上报: (条) => 上报们.push(条) });
    let 好的 = 0;
    B.订阅(探针题.题, () => { throw new Error('这一位炸了'); });
    B.订阅(探针题.题, () => { 好的 += 1; });
    expect(() => A.发布(探针题.题, { n: 1 })).not.toThrow();
    expect(好的, '前一位炸了把后一位带走了').toBe(1);
    expect(B.账().find((条) => 条.结果 === 'subscriber-failure').摘要).toBe('这一位炸了');
    expect(上报们.length).toBe(1);
    expect(上报们[0].题).toBe(探针题.题);
    expect(上报们[0].发出方).toBe('tab-A');
    expect(上报们[0].描述).toContain('这一位炸了');
  });

  it('上报出口自己炸了也不带走派发（B166 的同一条纪律）', () => {
    const 枢纽 = 造枢纽();
    const A = 建({ 身份: 'tab-A', 传送: 枢纽 });
    const B = 建({ 身份: 'tab-B', 传送: 枢纽, 上报: () => { throw new Error('上报也炸了'); } });
    let 好的 = 0;
    B.订阅(探针题.题, () => { throw new Error('订阅者炸了'); });
    B.订阅(探针题.题, () => { 好的 += 1; });
    expect(() => A.发布(探针题.题, { n: 1 })).not.toThrow();
    expect(好的).toBe(1);
  });

  it('回环传输把消息也投给发送方 ⇒ **过滤住在生产代码里**，订阅者收不到自己的回声', () => {
    const 枢纽 = 造枢纽({ 回环: true });
    const A = 建({ 身份: 'tab-A', 传送: 枢纽 });
    const 收到 = [];
    A.订阅(探针题.题, (消息) => 收到.push(消息));
    A.发布(探针题.题, { n: 1 });
    expect(收到.length, '回声进了订阅者 —— 纪律 1 是靠假件躲过去的，不是代码守住的').toBe(0);
    const 行 = A.账().find((条) => 条.结果 === 'self-echo');
    expect(行, '吃了回声但没记账').toBeTruthy();
    expect(A.读数().拒收).toBe(1);
  });

  it('序号跳了要说跳了几条；连着的不报', () => {
    const 交回们 = [];
    const A = 建({
      身份: 'tab-A',
      传送: (名, 交回) => { 交回们.push(交回); return { 名: 'hub', 发送: () => {}, 关: () => {} }; },
    });
    const 递 = (seq) => 交回们[0]({ topic: 探针题.题, sender: 'tab-X', seq, payload: { n: seq } });
    const 缺口们 = () => A.账().filter((条) => 条.结果 === 'gap');
    递(1); 递(2);
    expect(缺口们().length, '连着的两条也被报成缺口').toBe(0);
    递(5);
    expect(缺口们().length, '跳了 3、4 却没记缺口').toBe(1);
    const 缺口 = 缺口们()[0];
    expect(缺口.摘要).toContain('丢了 2 条');
    expect(缺口.发出方).toBe('tab-X');
    // 每位发出方按自己的时间线计：换一位从 1 开始不算缺口
    expect(() => 交回们[0]({ topic: 探针题.题, sender: 'tab-Y', seq: 1, payload: { n: 1 } })).not.toThrow();
    expect(缺口们().length).toBe(1);
  });

  it('账：同一种事一行只累加次数、是副本、上限是硬的、清得掉', () => {
    const 交回们 = [];
    const A = 建({
      身份: 'tab-A',
      传送: (名, 交回) => { 交回们.push(交回); return { 名: 'hub', 发送: () => {}, 关: () => {} }; },
    });
    for (let i = 1; i <= 9; i += 1) {
      交回们[0]({ topic: 'not-in-roster', sender: 'spam', seq: i, payload: {} });
    }
    const 行们 = A.账().filter((条) => 条.结果 === 'unknown-topic');
    expect(行们.length, '同一种死法占了 9 行').toBe(1);
    expect(行们[0].次数).toBe(9);
    const 读 = A.账();
    读[0].次数 = 999;
    expect(A.账()[0].次数, '账是内部那本引用，改得到').toBe(9);
    for (let i = 0; i < 账上限 + 30; i += 1) {
      交回们[0]({ topic: 'not-in-roster', sender: `spam-${i}`, seq: 1, payload: {} });
    }
    expect(A.账().length, `账没封顶在 ${账上限}`).toBeLessThanOrEqual(账上限);
    expect(A.清账()).toBeGreaterThan(0);
    expect(A.账()).toEqual([]);
  });

  it('通道当场抛：发布不许带崩主事，但送失败要记账、**序号照样占掉**', () => {
    let 第几次 = 0;
    const A = 建({
      身份: 'tab-A',
      传送: () => ({
        名: 'flaky',
        发送: () => { 第几次 += 1; if (第几次 === 2) throw new Error('通道断了'); },
        关: () => {},
      }),
    });
    expect(A.发布(探针题.题, { n: 1 })).toBe(1);
    expect(() => A.发布(探针题.题, { n: 2 })).not.toThrow();
    // 序号在发送**之前**发下来：失败那一次也吃掉一个号 —— 对端看到的缺口是真的缺口
    expect(A.发布(探针题.题, { n: 3 })).toBe(3);
    const 失败 = A.账().find((条) => 条.结果 === 'send-failed');
    expect(失败, '送失败没留账 —— 那"广播出去了"这句话没人能核对').toBeTruthy();
    expect(失败.摘要).toBe('通道断了');
    expect(失败.序号).toBe(2);
    expect(A.读数().发出, '发出数把没送出去的那条也算进去了').toBe(2);
    expect(A.读数().送出失败).toBe(1);
  });

  it('读数里的每一个数都是从账推的（不另起一本计数器）', () => {
    const 枢纽 = 造枢纽();
    const A = 建({ 身份: 'tab-A', 传送: 枢纽 });
    const B = 建({ 身份: 'tab-B', 传送: 枢纽 });
    B.订阅(探针题.题, () => {});
    A.发布(探针题.题, { n: 1 });
    const a = A.读数(); const b = B.读数();
    expect([a.发出, a.收到, a.拒收, a.送出失败, a.回调故障, a.缺口]).toEqual([1, 0, 0, 0, 0, 0]);
    expect([b.发出, b.收到, b.拒收]).toEqual([0, 1, 0]);
    expect(b.订阅数).toBe(1);
    expect(a.身份).toBe('tab-A');
  });
});

describe('⑤ 配置那一侧：local / remote 不分家就是广播风暴', () => {
  const 一册 = [{ 键: 'crossrealm.demo.knob', 缺省: 1, 校验: (v) => typeof v === 'number', 说明: '一个数' }];
  const 一份文档 = { name: 默认应用名, propertySources: [{ name: 'mem', source: { 'crossrealm.demo.knob': 42 } }] };

  /** 两台"实例"：各自的配置 + 各自接在生产接法上的总线（同一个内存枢纽） */
  function 接一对({ 分家 = true } = {}) {
    const 枢纽 = 造枢纽();
    const 甲 = 建({ 身份: 'tab-A', 名册: [配置总线题, 存档总线题], 传送: 枢纽 });
    const 乙 = 建({ 身份: 'tab-B', 名册: [配置总线题, 存档总线题], 传送: 枢纽 });
    const A = 建配置({ 名册: 一册 });
    const B = 建配置({ 名册: 一册 });
    A.订阅((c, 事件) => {
      if (分家 && 事件?.来源 === 'remote') return;
      甲.发布(刷新题, { 文档: c.导出() });
    });
    B.订阅((c, 事件) => {
      if (分家 && 事件?.来源 === 'remote') return;
      乙.发布(刷新题, { 文档: c.导出() });
    });
    甲.订阅(刷新题, (消息) => { A.下发(消息.载荷.文档, { 来源: 分家 ? 'remote' : 'local' }); });
    乙.订阅(刷新题, (消息) => { B.下发(消息.载荷.文档, { 来源: 分家 ? 'remote' : 'local' }); });
    return { A, B, 甲, 乙 };
  }

  it('A 本地下发 ⇒ B 的同一格生效，且 B 不再往外广播（风暴在这就断）', () => {
    const { A, B, 甲, 乙 } = 接一对();
    expect(A.下发(一份文档).成).toBe(true);
    expect(B.取('crossrealm.demo.knob'), '对端没跟着生效').toBe(42);
    expect(A.版本(), 'A 因自己的回声又涨了一格').toBe(1);
    expect(B.版本(), 'B 该只涨一次（remote 不再广播 ⇒ 一次正好）').toBe(1);
    expect(乙.读数().发出, 'B 把收到的文档又广播出去了 —— 那就是风暴').toBe(0);
    expect(甲.读数().发出).toBe(1);
  });

  it('对照臂：不给来源分家的接法，同一份文档让两边版本各多涨一格（上面那条不是恒绿）', () => {
    const { A, B, 甲, 乙 } = 接一对({ 分家: false });
    A.下发(一份文档);
    expect(A.版本(), '不分家也没多涨 —— 那这条对照臂什么都没量到').toBeGreaterThan(1);
    expect(B.版本()).toBeGreaterThan(1);
    expect(乙.读数().发出).toBeGreaterThan(0);
    expect(甲.读数().发出, '发起那一侧只发了一条 —— 那这条臂没量到风暴').toBeGreaterThan(1);
    expect(A.取('crossrealm.demo.knob')).toBe(42);   // 值没错，错的是"没人改却在涨版本、还在来回发"
  });

  it('两台构建的名册不一样：文档被拒的一方不崩、不改值，收到的那一条本身不算拒收', () => {
    const 枢纽 = 造枢纽();
    const 甲 = 建({ 身份: 'tab-A', 名册: [配置总线题, 存档总线题], 传送: 枢纽 });
    const 乙 = 建({ 身份: 'tab-B', 名册: [配置总线题, 存档总线题], 传送: 枢纽 });
    const A = 建配置({ 名册: 一册 });
    const B = 建配置({ 名册: [{ 键: 'crossrealm.demo.other', 缺省: 1, 校验: (v) => typeof v === 'number', 说明: '另一个数' }] });
    A.订阅((c) => 甲.发布(刷新题, { 文档: c.导出() }));
    乙.订阅(刷新题, (消息) => { B.下发(消息.载荷.文档, { 来源: 'remote' }); });
    A.下发(一份文档);
    expect(乙.读数().收到, '消息根本没到对端 —— 那后面几条什么都没量到').toBe(1);
    expect(B.取('crossrealm.demo.other'), '被拒的文档把对端的值改了').toBe(1);
    expect(B.版本(), '被拒的下发涨了版本').toBe(0);
    expect(B.取('crossrealm.demo.knob', '没有'), '对端凭一条没登记的键改了口径').toBe('没有');
    expect(乙.读数().拒收).toBe(0);                  // "键认不出来"归配置中心记账，不归总线
  });

  it('总线只判信封形状，语义交给收到那一侧的 下发（否则名册就漂成两份）', () => {
    expect(配置总线题.题).toBe(刷新题);
    expect(配置总线题.校验({ 文档: { name: 默认应用名, propertySources: [] } })).toBe(true);
    expect(配置总线题.校验({ 文档: { name: 默认应用名 } })).toBe(false);
    expect(配置总线题.校验({})).toBe(false);
    expect(配置总线题.校验(undefined)).toBe(false);
    // 键不在名册里也照样放行到 下发 —— 判"能不能吃"的那把尺只该有一把
    expect(配置总线题.校验({ 文档: { name: 默认应用名, propertySources: [{ source: { 谁也不认识的: 1 } }] } })).toBe(true);
  });

  it('下发 的回调第二个参数带来源（local / remote，ASCII）', () => {
    const 事件们 = [];
    const 配置 = 建配置({ 名册: [{ 键: 'crossrealm.demo.knob', 缺省: 1, 校验: (v) => typeof v === 'number', 说明: '一个数' }] });
    配置.订阅((c, 事件) => 事件们.push(事件));
    配置.下发({ name: 默认应用名, propertySources: [{ source: { 'crossrealm.demo.knob': 2 } }] });
    配置.下发({ name: 默认应用名, propertySources: [{ source: { 'crossrealm.demo.knob': 3 } }] }, { 来源: 'remote' });
    配置.清空();
    expect(事件们.map((e) => e.来源)).toEqual(['local', 'remote', 'local']);
    for (const e of 事件们) expect(Number.isInteger(e.版本)).toBe(true);
  });
});

describe('⑥ 存档与接线：写成功才广播，载荷里没有存档内容', () => {
  function 造宿主() {
    return {
      dialog: { toasts: [], toast(m) { this.toasts.push(m); } },
      errorReporter: { 记: [], record(条) { this.记.push(条); } },
      player: { position: { x: 1, y: 2, z: 3 }, yaw: 0.5, pitch: 0.2, combat: { hp: 100, maxHp: 118, stamina: 50 }, teleport() {} },
      stats: { data: { bag: [], level: 1, souls: 10 }, toJSON() { return { ...this.data }; }, fromJSON(d) { this.data = { ...this.data, ...d }; }, pushToConsumers() {} },
      quests: new QuestSystem({ toast() {} }),
      spells: { mana: 100 },
      settings: { data: {}, applyToGame() {} },
      weaponSkills: { unlocked: new Set(), toJSON: () => ({ unlocked: [] }), fromJSON() {} },
      restPointEnhancer: { discovered: new Set(), toJSON() { return { discovered: [...this.discovered] }; }, fromJSON(d) { this.discovered = new Set(d?.discovered ?? []); } },
      总线: null,
    };
  }

  beforeEach(() => {
    const 存 = new Map();
    globalThis.window = { addEventListener() {}, dispatchEvent() { return true; } };
    globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
    globalThis.localStorage = {
      getItem: (k) => (存.has(k) ? 存.get(k) : null),
      setItem: (k, v) => 存.set(k, String(v)),
      removeItem: (k) => 存.delete(k),
      _store: 存,
    };
  });

  it('存一次 ⇒ 广播一条，载荷恰好三格且都是写档那一步本来就有的数', () => {
    const 发 = [];
    const 宿主 = 造宿主();
    宿主.总线 = { 发布: (题, 载荷) => 发.push([题, 载荷]) };
    expect(SaveSystem.save(宿主, 1)).toBe(true);
    expect(发.length).toBe(1);
    const [题, 载荷] = 发[0];
    expect(题).toBe(存档题);
    expect(Object.keys(载荷).sort()).toEqual(['slot', 'time', 'version']);
    expect(载荷.slot).toBe(1);
    expect(载荷.version).toBe(CURRENT_VERSION);
    expect(存档总线题.校验(载荷), `出厂那条载荷过不了自己的校验：${存档总线题.说明}`).toBe(true);
  });

  it('结构不合法被拒的档**不广播**：没落盘就没有"这一格刚被写过"', () => {
    const 发 = [];
    const 宿主 = 造宿主();
    宿主.总线 = { 发布: (题, 载荷) => 发.push([题, 载荷]) };
    宿主.player.yaw = Number.NaN;   // SaveValidator 对 yaw/pitch 的要求是有限数
    expect(SaveValidator.validate(SaveSystem.toData(宿主)).length, '这份坏档该被拒').toBeGreaterThan(0);
    expect(SaveSystem.save(宿主, 0)).toBe(false);
    expect(发.length, '拒掉的档还是广播了').toBe(0);
    expect(globalThis.localStorage._store.size).toBe(0);
  });

  it('广播这一步炸了不带走存档（存档是主事，通知是附带的）', () => {
    const 宿主 = 造宿主();
    宿主.总线 = { 发布() { throw new Error('总线没接上'); } };
    expect(() => SaveSystem.save(宿主, 0)).not.toThrow();
    expect(SaveSystem.save(宿主, 0)).toBe(true);
    expect(globalThis.localStorage._store.size, '广播失败却没落盘').toBe(1);
    expect(宿主.errorReporter.记.length).toBe(2);
    expect(宿主.errorReporter.记[0].kind).toBe('bus');
    expect(宿主.errorReporter.记[0].message).toContain('总线没接上');
  });

  it('存档总线题的校验逐条咬：槽越界、版本与时间不是整数都拒', () => {
    const 好 = { slot: 0, version: CURRENT_VERSION, time: 1700000000000 };
    expect(存档总线题.校验(好)).toBe(true);
    for (const 坏 of [
      undefined, {},
      { ...好, slot: 3 }, { ...好, slot: -1 }, { ...好, slot: 1.5 }, { ...好, slot: '0' },
      { ...好, version: 0 }, { ...好, version: null },
      { ...好, time: -1 }, { ...好, time: 'now' },
    ]) {
      expect(存档总线题.校验(坏), `坏载荷过了校验：${JSON.stringify(坏)}`).toBe(false);
    }
  });

  it('存档这一侧的边界：题的校验住主人，广播走宿主递来的总线（不 import platform/bus）', () => {
    const 代码 = 去注释(存档源文);
    // 分层：game/ 不反过来依赖 platform/ 的实现 —— 总线由 Game 接好后挂在 game.总线 上，
    // 存档系统只按"有一个 发布 方法"的约定用它。抄一条 import 就把 chunk-core 内部
    // 又织出一根方向不明的边（B37 那一族）。
    expect(代码, 'SaveSystem 直接 import 了 platform/bus.js —— 分层边又长出来了').not.toMatch(/from\s+['"][^'"]*platform\/bus\.js/);
    expect(存档总线题.题).toBe(存档题);
    expect(存档总线题.说明).toBeTruthy();
    // 广播不能把存档带崩：那一步必须包在 try 里（上面那条用例是它的行为证据，这一条是它的形状）
    const 体 = 取块(代码, 'function 广播存档');
    expect(体).toMatch(/try\s*\{[\s\S]*?发布[\s\S]*?\}\s*catch/);
    expect(体).toContain('errorReporter?.record?.(');
    // 反向控制：同一把尺子套在"没包 try"的假实现上必须量不到
    expect(取块('function 广播存档(game, 载荷) { game.总线?.发布?.(存档题, 载荷); }', 'function 广播存档'))
      .not.toMatch(/try\s*\{/);
  });

  it('Game 的接线：建了总线、两样题都登记、配置那一侧按来源分家、存档那一侧会提示', () => {
    const 代码 = 去注释(游戏源文);
    expect(代码).toMatch(/this\.总线\s*=\s*this\._adopt\(/, '总线没走登记表（关通道与退订得进拆卸账）');
    expect(代码).toMatch(/名册:\s*\[\s*配置总线题\s*,\s*存档总线题\s*\]/, '题名册没登记全两样');
    expect(代码).toMatch(/发布\(刷新题/, '没把本地刷新广播出去');
    expect(代码, '广播那一步没按来源分家').toMatch(/来源\s*===\s*'remote'/);
    expect(代码).toMatch(/下发\([\s\S]{0,40}来源:\s*'remote'/);
    expect(代码).toMatch(/订阅\(存档题/, '收到别的标签页写档却没接线');
    expect(代码).toMatch(/save_written_by_other_fmt/);
    // 拒收的文档要留一行账，但话由 config.js 说：Game 这里只是把 原因 递出去
    // （Game.js 的裸中文字面量清零由 ending-upgrade-i18n 那条静态腿守着）
    expect(代码).toMatch(/订阅\(刷新题[\s\S]{0,240}message:\s*回\.原因/);
    // 双份真相的反面：总线自己一份题都不抄
    expect(总线源文).not.toMatch(/刷新题|存档题|config-refresh|save-written/);
    // 反向控制：把 `message: 回.原因` 换成裸中文，同一把尺子必须量不到
    expect(代码.replace('message: 回.原因', 'message: `文档没被接受：${回.原因}`'))
      .not.toMatch(/订阅\(刷新题[\s\S]{0,240}message:\s*回\.原因/);
  });

  it('bus.js 不开计时器、不读钟（先后靠每实例的单调序号）', () => {
    const 代码 = 去注释(总线源文);
    for (const 禁 of ['setTimeout', 'setInterval', 'Date.now', 'performance.now', 'requestAnimationFrame']) {
      expect(代码, `总线里出现了 ${禁} —— 那就不停在主循环的时钟上了`).not.toContain(禁);
    }
    expect(配置源文, '配置中心把来源写成了中文判据（content-boundary 那条盖整个 src/）').not.toMatch(/来源\s*===\s*'[^']*[\u4e00-\u9fff]/);
  });
});
