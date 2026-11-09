import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installWindowShim } from './helpers/enemyHarness.js';
import {
  on, emit, offAll, listenerCount,
  接监听, 推进监听时钟, 监听时钟, 监听名册, 坏监听, 监听健康,
  死信账, 死信数, 清死信,
  监听可调项, 监听阈值键, 监听冷却键, 默认监听阈值, 默认监听冷却秒, 死信上限,
} from '../src/engine/EventBus.js';
import { 建配置, 默认应用名 } from '../src/platform/config.js';
import { 舱壁可调项 } from '../src/platform/bulkhead.js';
import { 追踪可调项 } from '../src/platform/tracing.js';

/**
 * 监听器隔离与死信账（B166 / Spring Cloud 内化 切片4）。
 *
 * 借的两个契约：**每客户端熔断**（Hystrix / Resilience4j —— 炸的是那一个消费者，
 * 不是整条派发链）与 **error channel / 死信队列**（Spring Cloud Stream —— 送不达的
 * 那一条要留下一行账，而不是悄悄丢掉）。
 *
 * 为什么这病在**这个项目**里成立，而且没人看得见：派发有两条通道，两条对"监听器抛异常"
 * 的处理不一样。真浏览器把每个监听器各自包起来，一个抛了只多一条未捕获异常；而门禁里的
 * window 垫片是 `handlers.get(type)?.forEach((fn) => fn(event))` —— **没有包**，于是同一个
 * 监听器在门禁里会把派发方一起掀翻（后半段代码不执行、后面那些没坏的监听收不到）。
 * 同一份代码两边行为不一样，且没有任何一本账记着。下面 ① 的第一条与最后一条合起来
 * 就是这句话的机器读法：走 `on()` 的炸不了别人，裸挂上去的**当场能炸**（反向控制）。
 *
 * 五组分别量：
 *  ① 隔离：一个监听器抛了，其余照收、派发方照跑；断开期间零调用；冷却到点半开恢复；
 *  ② 死信账：行的形状、按指纹去重累加、上限是硬的、短路也算一条、诊断链自己炸了也有账；
 *  ③ 旋钮：键的形状、缺省与校验住主人、下发即刻给**已挂着**的那一位换档、订阅不叠不 leak；
 *  ④ 时钟：不推不走（本模块不开计时器），且每位消费者按自己的时间线计冷却；
 *  ⑤ 接线与性质：Game 那三处接线、`this` 仍是事件宿主、注销不留尸体、读数全是副本。
 */

const ROOT = process.cwd();
const 总线源文 = readFileSync(join(ROOT, 'src/engine/EventBus.js'), 'utf8');
const 配置源文 = readFileSync(join(ROOT, 'src/platform/config.js'), 'utf8');
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

/** 一份"应用名对得上、键都在名册里"的文档 */
const 造文档 = (源 = {}) => ({
  name: 默认应用名,
  profiles: ['default'],
  label: 'main',
  version: '1',
  propertySources: [{ name: 'memory:./config/b166.yml', source: 源 }],
});

let 序号 = 0;
/** 每条用例一套自己的所有权：清场按名册撤，不靠手抄 tag 名 */
const 新所有权 = () => `probe/b166#${++序号}`;

const 那一位 = (事件, 所有权) => 监听名册().find((c) => c.事件 === 事件 && c.所有权 === 所有权);

function 清场() {
  for (const 所有权 of new Set(监听名册().map((c) => c.所有权))) offAll(所有权);
  清死信();
  接监听({});
}

const 全名册 = [...舱壁可调项, ...追踪可调项, ...监听可调项];

beforeAll(() => {
  installWindowShim();
});
beforeEach(清场);
afterAll(清场);

describe('监听器隔离与死信账（B166）', () => {
  describe('① 隔离：一位消费者炸了不带走派发方', () => {
    it('抛异常的监听插在中间：前后两位都收到、派发方的后半段照跑（门禁垫片那条通道）', () => {
      const 所有权 = 新所有权();
      const 收到 = [];
      on('enemy-defeated', () => 收到.push('前'), 所有权);
      on('enemy-defeated', () => { throw new Error('中间那位炸了'); }, 所有权);
      on('enemy-defeated', () => 收到.push('后'), 所有权);
      expect(() => emit('enemy-defeated')).not.toThrow();
      expect(收到).toEqual(['前', '后']);
    });

    it('裸 dispatchEvent 那条通道同样管住（存量约 140 处派发走的是它，不是 emit()）', () => {
      const 所有权 = 新所有权();
      const 收到 = [];
      on('enemy-defeated', () => { throw new Error('这条通道上也炸'); }, 所有权);
      on('enemy-defeated', () => 收到.push('后'), 所有权);
      const 事件 = new globalThis.CustomEvent('enemy-defeated', { detail: undefined });
      expect(() => globalThis.window.dispatchEvent(事件)).not.toThrow();
      expect(收到).toEqual(['后']);
    });

    it('回调签名没变：拿到的还是那条事件，`e.detail` 照旧', () => {
      const 所有权 = 新所有权();
      const 见的 = [];
      on('zone-changed', (e) => 见的.push([e.type, e.detail.zoneId]), 所有权);
      emit('zone-changed', { zone: {}, zoneId: 'hub', initial: true });
      expect(见的).toEqual([['zone-changed', 'hub']]);
    });

    it('同一条事件挂两位：炸的那位断开，另一位不连坐（隔离粒度是**每条注册**）', () => {
      const 所有权 = 新所有权();
      let 好的次数 = 0;
      on('enemy-defeated', () => { throw new Error('只炸我自己'); }, 所有权);
      on('enemy-defeated', () => { 好的次数 += 1; }, 所有权);
      for (let i = 0; i < 5; i += 1) emit('enemy-defeated');
      const 在册 = 监听名册().filter((c) => c.所有权 === 所有权);
      expect(在册).toHaveLength(2);
      expect(new Set(在册.map((c) => c.名)).size, '两位共用一条舱壁 = 连坐').toBe(2);
      const 炸 = 在册.find((c) => c.失败数 > 0);
      const 好 = 在册.find((c) => c.失败数 === 0);
      expect(炸.态).toBe('open');
      expect(好.态).toBe('closed');
      expect(炸.调用数).toBe(默认监听阈值);
      expect(炸.短路数).toBe(5 - 默认监听阈值);
      expect(炸.熔断次数).toBe(1);
      expect(好的次数).toBe(5);
    });

    it('断开期间这一位零调用：事件照送别人，不再送它', () => {
      const 所有权 = 新所有权();
      let 进来 = 0;
      on('boss-start', () => { 进来 += 1; throw new Error('每次都炸'); }, 所有权);
      for (let i = 0; i < 6; i += 1) emit('boss-start');
      const 舱 = 那一位('boss-start', 所有权);
      expect(进来).toBe(默认监听阈值);
      expect(舱.调用数).toBe(默认监听阈值);
      expect(舱.短路数).toBe(6 - 默认监听阈值);
      expect(舱.失败数).toBe(默认监听阈值);
    });

    it('冷却走完 ⇒ 半开放一次探测 ⇒ 好了就闭合（那位消费者回来了）', () => {
      const 所有权 = 新所有权();
      let 该炸 = true;
      const 收到 = [];
      on('boss-start', () => { if (该炸) throw new Error('暂时坏了'); 收到.push('回来了'); }, 所有权);
      for (let i = 0; i < 默认监听阈值; i += 1) emit('boss-start');
      expect(那一位('boss-start', 所有权).态).toBe('open');
      该炸 = false;
      推进监听时钟(默认监听冷却秒);
      emit('boss-start');
      expect(收到).toEqual(['回来了']);
      expect(那一位('boss-start', 所有权).态).toBe('closed');
      emit('boss-start');
      expect(收到).toEqual(['回来了', '回来了']);
    });

    it('探测还是失败 ⇒ 立刻再断开，且这一轮只放过一次', () => {
      const 所有权 = 新所有权();
      let 进来 = 0;
      on('boss-start', () => { 进来 += 1; throw new Error('一直坏'); }, 所有权);
      for (let i = 0; i < 默认监听阈值; i += 1) emit('boss-start');
      const 烧完 = 进来;
      for (let i = 0; i < 10; i += 1) emit('boss-start');
      expect(进来, '断开期间不该再放进来').toBe(烧完);
      推进监听时钟(默认监听冷却秒);
      emit('boss-start');
      expect(进来).toBe(烧完 + 1);
      expect(那一位('boss-start', 所有权).态).toBe('open');
      for (let i = 0; i < 5; i += 1) emit('boss-start');
      expect(进来, '半开失败不该连着再放探测').toBe(烧完 + 1);
      expect(那一位('boss-start', 所有权).熔断次数).toBe(2);
    });

    it('反向控制：不走 on() 的裸监听当场能掀翻派发方 —— 上面那几条不是恒绿', () => {
      const 收到 = [];
      const 炸 = () => { throw new Error('裸奔的坏监听'); };
      const 后 = () => 收到.push('裸');
      globalThis.window.addEventListener('enemy-defeated', 炸);
      globalThis.window.addEventListener('enemy-defeated', 后);
      try {
        expect(() => emit('enemy-defeated')).toThrow(/裸奔的坏监听/);
        expect(收到, '判据失灵：没有包壳时后面那位本来就该收不到').toEqual([]);
      } finally {
        globalThis.window.removeEventListener('enemy-defeated', 炸);
        globalThis.window.removeEventListener('enemy-defeated', 后);
      }
    });
  });

  describe('② 死信账：送不达的那一条要留下名字', () => {
    it('一行的形状：哪条事件、哪个所有权、为什么、摘要、第几次', () => {
      const 所有权 = 新所有权();
      on('enemy-defeated', () => { throw new Error('空指针的一句话'); }, 所有权);
      emit('enemy-defeated');
      expect(死信账()).toEqual([
        {
          指纹: `enemy-defeated|${所有权}|listener-threw|空指针的一句话`,
          事件: 'enemy-defeated',
          所有权,
          原因: 'listener-threw',
          摘要: '空指针的一句话',
          次数: 1,
          最近运行秒: 监听时钟(),
          态: 'closed',
        },
      ]);
      expect(死信数()).toBe(1);
    });

    it('同一种死法占一个槽位只累加次数；换一条异常消息就是另一种死法', () => {
      const 所有权 = 新所有权();
      const 话 = ['甲坏了', '甲坏了', '乙坏了'];
      let i = 0;
      on('enemy-defeated', () => { throw new Error(话[i++]); }, 所有权);
      for (let k = 0; k < 3; k += 1) emit('enemy-defeated');
      const 账 = 死信账();
      expect(账).toHaveLength(2);
      expect(账.find((d) => d.摘要 === '甲坏了').次数).toBe(2);
      expect(账.find((d) => d.摘要 === '乙坏了').次数).toBe(1);
      expect(死信数()).toBe(3);
    });

    it('上限是硬的：一个每帧都炸的消费者不许把整本账刷成自己那一色', () => {
      const 所有权 = 新所有权();
      const 造 = 死信上限 + 10;
      for (let i = 0; i < 造; i += 1) {
        on('enemy-defeated', () => { throw new Error(`第 ${i} 种死法`); }, `${所有权}#${i}`);
      }
      emit('enemy-defeated');
      const 账 = 死信账();
      expect(账.length).toBe(死信上限);
      expect(死信数(), '账是环形的：出局的老行连它自己的次数一起出局').toBe(死信上限);
      expect(账.some((d) => d.摘要 === '第 0 种死法'), '最老的那行该被挤掉').toBe(false);
      expect(账.some((d) => d.摘要 === `第 ${造 - 1} 种死法`), '最新的那行该留着').toBe(true);
    });

    it('断开期间**没送达**的那一条也算一笔：原因分开写，不混进"抛异常"', () => {
      const 所有权 = 新所有权();
      on('enemy-defeated', () => { throw new Error('一直炸'); }, 所有权);
      for (let i = 0; i < 默认监听阈值 + 2; i += 1) emit('enemy-defeated');
      const 账 = 死信账();
      expect(new Set(账.map((d) => d.原因))).toEqual(new Set(['listener-threw', 'dropped-while-open']));
      const 短路条 = 账.find((d) => d.原因 === 'dropped-while-open');
      expect(短路条.次数).toBe(2);
      expect(短路条.态).toBe('open');
      expect(短路条.摘要, '摘要要说"上一次是为什么断的"').toBe('一直炸');
    });

    it('账是副本：改了返回出去的行，改不动真账', () => {
      const 所有权 = 新所有权();
      on('enemy-defeated', () => { throw new Error('副本不是真账'); }, 所有权);
      emit('enemy-defeated');
      const 抄 = 死信账();
      抄[0].次数 = 999;
      抄.push({ 摘要: '我凭空造的一行' });
      expect(死信账()).toHaveLength(1);
      expect(死信账()[0].次数).toBe(1);
      expect(死信账().some((d) => d.摘要 === '我凭空造的一行')).toBe(false);
    });

    it('清死信返回清掉了几行，之后账是空的（换关 / 诊断台的出口）', () => {
      const 所有权 = 新所有权();
      on('enemy-defeated', () => { throw new Error('甲'); }, 所有权);
      on('boss-start', () => { throw new Error('乙'); }, 所有权);
      emit('enemy-defeated');
      emit('boss-start');
      expect(死信账()).toHaveLength(2);
      expect(清死信()).toBe(2);
      expect(死信账()).toEqual([]);
      expect(死信数()).toBe(0);
      expect(清死信()).toBe(0);
    });

    it('诊断链自己炸了不许掀翻派发链：上报抛 ⇒ 派发不抛，且有一行 diagnostic-failure', () => {
      const 所有权 = 新所有权();
      const 收到 = [];
      接监听({ 上报: () => { throw new Error('错误账自己挂了'); } });
      on('enemy-defeated', () => { throw new Error('消费者炸了'); }, 所有权);
      on('enemy-defeated', () => 收到.push('后'), 所有权);
      expect(() => emit('enemy-defeated')).not.toThrow();
      expect(收到).toEqual(['后']);
      const 诊断 = 死信账().filter((d) => d.原因 === 'diagnostic-failure');
      expect(诊断).toHaveLength(1);
      expect(诊断[0]).toMatchObject({
        事件: 'diagnostic-chain', 所有权: 'engine/EventBus.js', 摘要: '错误账自己挂了', 次数: 1,
      });
      // 同一条诊断故障也只占一个槽位（否则诊断链会把真消费者的账冲干净）
      emit('enemy-defeated');
      emit('enemy-defeated');
      expect(死信账().filter((d) => d.原因 === 'diagnostic-failure')).toHaveLength(1);
      expect(死信账().find((d) => d.原因 === 'diagnostic-failure').次数).toBe(3);
    });

    it('原因值是 ASCII 的固定那几个，且三条今天都真的能出现', () => {
      const 允许 = new Set(['listener-threw', 'dropped-while-open', 'diagnostic-failure']);
      const 所有权 = 新所有权();
      on('enemy-defeated', () => { throw new Error('x'); }, 所有权);
      for (let i = 0; i < 默认监听阈值 + 2; i += 1) emit('enemy-defeated');
      接监听({ 上报: () => { throw new Error('y'); } });
      const 第二个 = 新所有权();
      on('enemy-defeated', () => { throw new Error('z'); }, 第二个);
      emit('enemy-defeated');
      const 账 = 死信账();
      for (const d of 账) {
        expect(/^[ -~]+$/.test(d.原因), `原因该是 ASCII：${d.原因}`).toBe(true);
        expect(允许.has(d.原因), `没登记过的原因值：${d.原因}`).toBe(true);
      }
      expect(new Set(账.map((d) => d.原因))).toEqual(允许);
    });
  });

  describe('③ 旋钮：缺省与校验住在主人，配置中心只认名册', () => {
    it('两个旋钮的键是 ASCII 点号路径，且不与舱壁那两个撞号', () => {
      expect(监听可调项.map((i) => i.键)).toEqual([监听阈值键, 监听冷却键]);
      for (const 项 of 监听可调项) {
        expect(项.键).toMatch(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/);
        expect(项.说明.length).toBeGreaterThan(3);
        expect(项.校验(项.缺省)).toBe(true);
      }
      const 别人的 = new Set([...舱壁可调项, ...追踪可调项].map((i) => i.键));
      for (const 项 of 监听可调项) expect(别人的.has(项.键)).toBe(false);
    });

    it('缺省与校验真的住在主人模块：配置中心里搜不到 event-bus 这个键', () => {
      expect(默认监听阈值).toBe(3);
      expect(默认监听冷却秒).toBe(5);
      expect(配置源文).not.toContain('event-bus');
      expect(配置源文).not.toContain('listener-failure');
      const [阈, 冷] = 监听可调项;
      expect(阈.校验(0)).toBe(false);
      expect(阈.校验(1)).toBe(true);
      expect(冷.校验(-1)).toBe(false);
      expect(冷.校验(0), '冷却 0 秒 = 每次派发都放探测，是合法旋钮').toBe(true);
    });

    it('不接线也能用：接监听() 交回主人缺省，隔离照常', () => {
      expect(接监听()).toEqual({ 阈值: 默认监听阈值, 冷却秒: 默认监听冷却秒 });
      const 所有权 = 新所有权();
      let 收到 = 0;
      on('enemy-defeated', () => { throw new Error('没接线也炸不出去'); }, 所有权);
      on('enemy-defeated', () => { 收到 += 1; }, 所有权);
      expect(() => emit('enemy-defeated')).not.toThrow();
      expect(收到).toBe(1);
    });

    it('下发即刻换档：**已经挂着**的那一位跟着换，不只新注册的用新值', () => {
      const 所有权 = 新所有权();
      let 进来 = 0;
      on('enemy-defeated', () => { 进来 += 1; throw new Error('换档'); }, 所有权);
      expect(那一位('enemy-defeated', 所有权).失败阈值).toBe(默认监听阈值);
      const 配置 = 建配置({ 名册: 全名册 });
      expect(配置.下发(造文档({ [监听阈值键]: 1, [监听冷却键]: 0 })).成).toBe(true);
      expect(接监听({ 配置 })).toEqual({ 阈值: 1, 冷却秒: 0 });
      expect(那一位('enemy-defeated', 所有权)).toMatchObject({ 失败阈值: 1, 冷却秒: 0 });
      emit('enemy-defeated');
      expect(进来).toBe(1);
      expect(那一位('enemy-defeated', 所有权).态).toBe('open');
      emit('enemy-defeated');
      expect(进来, '冷却 0 秒 ⇒ 每次派发都放一次探测').toBe(2);
      expect(那一位('enemy-defeated', 所有权).态).toBe('open');
    });

    it('正在冷却时下发新冷却 ⇒ 按新值重新起算（调大就是"先别探"）', () => {
      const 配置 = 建配置({ 名册: 监听可调项 });
      配置.下发(造文档({ [监听阈值键]: 1, [监听冷却键]: 10 }));
      接监听({ 配置 });
      const 所有权 = 新所有权();
      let 进来 = 0;
      on('enemy-defeated', () => { 进来 += 1; throw new Error('冷却重计'); }, 所有权);
      emit('enemy-defeated');
      推进监听时钟(6);
      emit('enemy-defeated');
      expect(进来).toBe(1);
      expect(那一位('enemy-defeated', 所有权).剩余冷却).toBeCloseTo(4);
      expect(配置.下发(造文档({ [监听阈值键]: 1, [监听冷却键]: 2 })).成).toBe(true);
      expect(那一位('enemy-defeated', 所有权).剩余冷却, '下发之后按新冷却重新起算').toBe(2);
      推进监听时钟(3);
      emit('enemy-defeated');
      expect(进来, '调小冷却 ⇒ 提前放探测').toBe(2);
    });

    it('接监听 反复交同一台配置只订一次；换一台先退旧的（重开一局不留僵尸订阅）', () => {
      const A = 建配置({ 名册: 监听可调项 });
      const B = 建配置({ 名册: 监听可调项 });
      接监听({ 配置: A });
      接监听({ 配置: A });
      接监听({ 配置: A });
      expect(A.订阅数()).toBe(1);
      接监听({ 配置: B });
      expect(A.订阅数(), '旧那台还挂着订阅者 = 每次下发都来敲一扇不作数的门').toBe(0);
      expect(B.订阅数()).toBe(1);
      B.下发(造文档({ [监听阈值键]: 1 }));
      expect(接监听({ 配置: B })).toEqual({ 阈值: 1, 冷却秒: 默认监听冷却秒 });
      接监听({});
      expect(B.订阅数()).toBe(0);
      expect(接监听().阈值).toBe(默认监听阈值);
    });
  });

  describe('④ 时钟：本模块不开计时器，秒数由主循环推进来', () => {
    it('不推时钟 ⇒ 冷却不走 ⇒ 断开的那一位一直断开；一推就动', () => {
      const 所有权 = 新所有权();
      let 进来 = 0;
      on('enemy-defeated', () => { 进来 += 1; throw new Error('不推不回来'); }, 所有权);
      for (let i = 0; i < 20; i += 1) emit('enemy-defeated');
      expect(进来).toBe(默认监听阈值);
      expect(那一位('enemy-defeated', 所有权).剩余冷却).toBeCloseTo(默认监听冷却秒);
      for (let i = 0; i < 20; i += 1) emit('enemy-defeated');
      expect(进来, '没有主循环推它 ⇒ 再多派发也回不来').toBe(默认监听阈值);
      expect(那一位('enemy-defeated', 所有权).短路数).toBe(40 - 默认监听阈值);
      推进监听时钟(默认监听冷却秒);
      emit('enemy-defeated');
      expect(进来).toBe(默认监听阈值 + 1);
    });

    it('每位消费者按**自己的**时间线计冷却：一直被打扰的那位没结算完，闲着的那位早就走完了', () => {
      const 所有权 = 新所有权();
      let A = 0;
      let B = 0;
      on('enemy-defeated', () => { A += 1; throw new Error('A'); }, 所有权);
      on('boss-start', () => { B += 1; throw new Error('B'); }, 所有权);
      for (let i = 0; i < 默认监听阈值; i += 1) {
        emit('enemy-defeated');
        emit('boss-start');
      }
      expect([A, B]).toEqual([默认监听阈值, 默认监听阈值]);
      // 接下来 4 秒里只有 A 被叫醒（每秒一次）：它每次只结算自己那 1 秒，仍差 1 秒
      for (let i = 0; i < 默认监听冷却秒 - 1; i += 1) {
        推进监听时钟(1);
        emit('enemy-defeated');
      }
      expect(A).toBe(默认监听阈值);
      expect(那一位('enemy-defeated', 所有权).剩余冷却).toBeCloseTo(1);
      expect(那一位('enemy-defeated', 所有权).态).toBe('open');
      // B 一次都没被叫醒，可这 5 秒照样在它身上流过
      推进监听时钟(2);
      emit('boss-start');
      expect(B, 'B 自己的时间线已过 6 秒 ⇒ 放一次探测').toBe(默认监听阈值 + 1);
      expect(那一位('boss-start', 所有权).态).toBe('open');
      expect(那一位('enemy-defeated', 所有权).剩余冷却, '没被叫醒就不结算（冷却是派发时算的，不是后台跑的）').toBeCloseTo(1);
    });

    it('推进监听时钟只吃正的有限数，返回推进之后的运行秒（垃圾不许把时钟拉回去）', () => {
      const 起 = 监听时钟();
      expect(推进监听时钟(2)).toBe(起 + 2);
      expect(推进监听时钟('3')).toBe(起 + 5);
      expect(推进监听时钟(-1)).toBe(起 + 5);
      expect(推进监听时钟(NaN)).toBe(起 + 5);
      expect(推进监听时钟(Infinity)).toBe(起 + 5);
      expect(推进监听时钟()).toBe(起 + 5);
      expect(监听时钟()).toBe(起 + 5);
    });

    /** 同一把尺子在假源码上必须量得到 —— 否则上面那条静态腿是空转的 */
    const 扫计时装置 = (源码) => ['performance.now', 'Date.now', 'new Date(', 'setTimeout', 'setInterval', 'requestAnimationFrame']
      .filter((词) => 源码.includes(词));

    it('EventBus 源码里没有墙钟也没有计时器：秒数只能由 推进监听时钟() 交进来', () => {
      expect(扫计时装置(去注释(总线源文))).toEqual([]);
      expect(总线源文).toMatch(/export function 推进监听时钟/);
      expect(总线源文).toMatch(/const dt = 运行秒 - 舱\.上次派发秒/);
      // 反向控制：假源码里埋一个 setTimeout，同一把尺子必须点名它
      expect(扫计时装置("win()?.addEventListener('x', () => setTimeout(f, 100));")).toEqual(['setTimeout']);
    });
  });

  describe('⑤ 接线与性质', () => {
    it('Game 把监听侧的旋钮登记进配置名册，并接上错误账与提示', () => {
      const 导入 = /import\s*\{([^}]*)\}\s*from\s*'\.\.\/engine\/EventBus\.js'/.exec(游戏源文);
      expect(导入, 'Game 没从 EventBus 导入东西？').not.toBeNull();
      const 名字 = 导入[1].split(',').map((s) => s.trim());
      for (const 名 of ['on', 'offAll', '接监听', '推进监听时钟', '监听可调项']) {
        expect(名字, `Game 的 EventBus 导入里少了 ${名}`).toContain(名);
      }
      expect(游戏源文).toMatch(/名册:\s*\[\s*\.\.\.舱壁可调项,\s*\.\.\.追踪可调项,\s*\.\.\.监听可调项,\s*\.\.\.租约可调项\s*\]/);
      const 接线 = 取块(游戏源文, '接监听({');
      expect(接线).toContain("kind: 'listener'");
      expect(接线).toContain('this.errorReporter?.record?.(');
      expect(接线).toContain("source: 'engine/EventBus.js'");
      expect(接线).toContain("this.dialog?.toast(t('sys_subsystem_degraded'))");
      // 配置必须建在接监听之前（它是旋钮的读数口）
      expect(游戏源文.indexOf('建配置({')).toBeLessThan(游戏源文.indexOf('接监听({'));
    });

    it('update() 把**基建时钟**推给监听侧：推在 _基建dt 之后，且推的是 rawDt 不是玩法 dt', () => {
      const 起 = 游戏源文.indexOf('  update() {');
      expect(起).toBeGreaterThan(-1);
      const 体 = 游戏源文.slice(起, 游戏源文.indexOf('\n  }\n', 起));
      expect(体).toContain('this._基建dt = rawDt;');
      expect(体).toContain('推进监听时钟(rawDt);');
      expect(体.indexOf('推进监听时钟(rawDt)'), '推在 _基建dt 之前 = 读的是上一帧的数').toBeGreaterThan(体.indexOf('this._基建dt = rawDt;'));
      expect(体, '推玩法 dt ⇒ 慢动作里冷却永远走不完').not.toMatch(/推进监听时钟\(\s*(?:dt|this\.time\.dt)/);
    });

    it('走舱壁的失败分支现在真的往控制台打印（B163 那句"控制台照旧打印"不再是空头）', () => {
      const 体 = 取块(游戏源文, 'function 走舱壁(');
      expect(体).toMatch(/console\.error\(子系统故障描述\(名, r\.错误\), r\.错误\);/);
      expect(体).toContain("kind: 'subsystem'");
      // 反向控制：同一把尺子在"只记账不打印"的假实现上必须量不到
      expect(取块('function 走舱壁(游戏) { 游戏.errorReporter?.record?.({}); }', 'function 走舱壁('))
        .not.toMatch(/console\.error/);
    });

    it('注册到 window 的是**包壳**，注销的也必须是同一个包壳', () => {
      const 码 = 去注释(总线源文);
      const 扫裸注册 = (源码) => [...源码.matchAll(/\.addEventListener\(\s*[^,]+,\s*(?:rec\.handler|record\.handler|handler)\s*[,)]/g)]
        .map((m) => m[0].trim());
      expect(扫裸注册(码)).toEqual([]);
      expect(总线源文).toMatch(/addEventListener\(name, record\.壳\)/);
      expect(总线源文).toMatch(/removeEventListener\(record\.name, record\.壳\)/);
      expect(总线源文).toMatch(/removeEventListener\(r\.name, r\.壳\)/);
      // 反向控制：忘了包壳的写法（直接把 handler 交出去）必须被同一把尺子点名
      expect(扫裸注册("win()?.addEventListener(name, handler);")).toHaveLength(1);
    });

    it('`this` 仍然是事件宿主：迁移一个监听不需要改写回调', () => {
      const 所有权 = 新所有权();
      const 见的 = [];
      function 方法() { 见的.push(this === globalThis.window); }
      on('enemy-defeated', 方法, 所有权);
      emit('enemy-defeated');
      expect(见的).toEqual([true]);
    });

    it('offAll 之后名册不留尸体，重挂的是**新身份**（旧账不连坐新实例）', () => {
      const 所有权 = 新所有权();
      on('enemy-defeated', () => { throw new Error('烧掉'); }, 所有权);
      for (let i = 0; i < 默认监听阈值; i += 1) emit('enemy-defeated');
      const 旧的 = 那一位('enemy-defeated', 所有权);
      expect(旧的.态).toBe('open');
      expect(坏监听()).toContain(旧的.名);
      expect(监听健康()).toBe(false);
      expect(offAll(所有权)).toBe(1);
      expect(监听名册().some((c) => c.所有权 === 所有权)).toBe(false);
      expect(listenerCount(所有权)).toBe(0);
      on('enemy-defeated', () => { throw new Error('又烧掉'); }, 所有权);
      const 新的 = 那一位('enemy-defeated', 所有权);
      expect(新的.名).not.toBe(旧的.名);
      expect(新的).toMatchObject({ 态: 'closed', 失败数: 0, 短路数: 0, 熔断次数: 0, 连续失败: 0 });
    });

    it('监听名册是副本、健康判据认得"闭合但带着未清的错"', () => {
      const 所有权 = 新所有权();
      on('enemy-defeated', () => { throw new Error('一次而已'); }, 所有权);
      emit('enemy-defeated'); // 没到阈值 ⇒ 仍是闭合，但最近错误没清
      const 在册 = 监听名册();
      const 那条 = 在册.find((c) => c.所有权 === 所有权);
      expect(那条.态).toBe('closed');
      expect(那条.最近错误).toBe('一次而已');
      expect(坏监听()).toEqual([]);
      expect(监听健康()).toBe(false);
      在册[0].态 = '我说了算';
      expect(监听名册().find((c) => c.所有权 === 所有权).态).toBe('closed');
      // 成功一次就把未清的错翻篇：闭合 + 零未清 才算健康
      const 第二个 = 新所有权();
      let 第几次 = 0;
      on('boss-start', () => { 第几次 += 1; if (第几次 === 1) throw new Error('第二次才算'); }, 第二个);
      emit('boss-start');
      expect(那一位('boss-start', 第二个).最近错误).toBe('第二次才算');
      emit('boss-start');
      expect(那一位('boss-start', 第二个)).toMatchObject({ 态: 'closed', 最近错误: null, 连续失败: 0 });
      expect(那一位('boss-start', 第二个).失败数, '翻篇的是"现在"，不是历史账').toBe(1);
    });

    it('死信账与名册是分开的两本：注销之后账还在（历史上炸过什么，不看现在谁在听）', () => {
      const 所有权 = 新所有权();
      on('enemy-defeated', () => { throw new Error('注销不抹账'); }, 所有权);
      emit('enemy-defeated');
      offAll(所有权);
      expect(监听名册().some((c) => c.所有权 === 所有权)).toBe(false);
      expect(死信账().map((d) => d.摘要)).toContain('注销不抹账');
      expect(监听健康()).toBe(true);
    });
  });
});
