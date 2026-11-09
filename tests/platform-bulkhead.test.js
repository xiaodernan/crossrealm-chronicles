/**
 * 舱壁与熔断的门禁（B163）—— Spring Cloud（Hystrix）语义的内化。
 *
 * ## 这一片在钉什么
 *
 * `core/Game.js` 的 `run()` 曾经是：
 *
 *     const loop = () => { requestAnimationFrame(loop); this.update(); this.render(); };
 *
 * 而 `update()` 里有 50+ 处子系统调用、**一处 try/catch 都没有**。任何一处抛异常 ⇒
 * `render()` 这一帧不执行 ⇒ 画面停在上一帧；`requestAnimationFrame` 已经排上了 ⇒
 * 下一帧照样抛、照样不渲染 ⇒ **画面永久冻结**，而堆栈只说"谁炸了"，不说"炸了之后怎么办"。
 *
 * 修法是 Spring Cloud 的两个契约：**舱壁隔离**（一个子系统坏了只停它自己）与
 * **熔断降级**（连续失败就断开、断开期间不再调用下游、交降级值、冷却后放一次探测）。
 *
 * ## 门禁分五组
 *
 * ① **状态机**：闭合 →（连续失败到阈值）→ 打开 →（冷却走完）→ 半开 →（探测成功）→ 闭合。
 * ② **熔断期间不许再调下游**：下游一次都不许被调用（用计数夹具钉死），且交的是降级值。
 * ③ **恢复**：半开探测失败 ⇒ 重新打开且冷却重计；探测成功 ⇒ 回闭合。
 * ④ **注册表**（服务注册与发现语义）：名册、名字唯一、健康判据、坏舱壁名单。
 * ⑤ **接线**：源扫钉住"`update()` 里不许再有裸子系统直调"，外加一条**豁免不白给**
 *    （时钟为什么必须留在舱壁外面）。
 *
 * 判据住在生产代码（`src/platform/bulkhead.js`），这里只喂坏数据。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Game } from '../src/core/Game.js';
import { 扫站点 } from '../src/engine/frameCensus.js';
import {
  建舱壁,
  舱壁调用,
  舱壁账,
  建舱壁组,
  闭合,
  打开,
  半开,
  默认失败阈值,
  默认冷却秒,
} from '../src/platform/bulkhead.js';

const ROOT = process.cwd();

/** 一个会数自己被调了几次、并且按剧本抛的下游。剧本用尽 ⇒ 继续抛（"这个子系统一直坏着"） */
function 造下游(剧本) {
  const 账 = { 次数: 0 };
  const fn = () => {
    账.次数 += 1;
    const 这一步 = 剧本[账.次数 - 1];
    if (这一步 === undefined) throw new Error(`第 ${账.次数} 次调用炸了（剧本已用尽）`);
    if (这一步 === '抛') throw new Error(`第 ${账.次数} 次调用炸了`);
    return 这一步;
  };
  fn.账 = 账;
  return fn;
}

describe('舱壁与熔断（B163）', () => {
  describe('① 状态机：闭合 → 打开 → 半开 → 闭合', () => {
    it('默认档是生产侧给的数（阈值 3 / 冷却 2 秒），不是测试自己定的', () => {
      expect(默认失败阈值).toBe(3);
      expect(默认冷却秒).toBe(2);
      const c = 建舱壁('x');
      expect(c.失败阈值).toBe(3);
      expect(c.冷却秒).toBe(2);
      expect(c.态).toBe(闭合);
    });

    it('连续失败到阈值才断开；差一次不断', () => {
      const c = 建舱壁('x', { 失败阈值: 3, 冷却秒: 2 });
      const 炸 = 造下游(['抛', '抛', '抛']);
      // 两次失败：还闭着
      expect(舱壁调用(c, 炸, 0.016).成).toBe(false);
      expect(c.态).toBe(闭合);
      expect(舱壁调用(c, 炸, 0.016).成).toBe(false);
      expect(c.态).toBe(闭合);
      // 第三次：到阈值 ⇒ 断开
      const 第三 = 舱壁调用(c, 炸, 0.016);
      expect(第三.成).toBe(false);
      expect(第三.熔断).toBe(true);
      expect(c.态).toBe(打开);
      expect(c.熔断次数).toBe(1);
      expect(c.连续失败).toBe(3);
    });

    it('成功一次就把连续失败清零（不是累计制）', () => {
      const c = 建舱壁('x', { 失败阈值: 3, 冷却秒: 2 });
      const 剧本 = 造下游(['抛', '抛', '好', '抛', '抛']);
      舱壁调用(c, 剧本, 0.016);
      舱壁调用(c, 剧本, 0.016);
      expect(c.连续失败).toBe(2);
      expect(舱壁调用(c, 剧本, 0.016).成).toBe(true);
      expect(c.连续失败).toBe(0);
      expect(c.态).toBe(闭合);
      // 清零之后再失败两次仍然不断（累计三次才算）
      舱壁调用(c, 剧本, 0.016);
      舱壁调用(c, 剧本, 0.016);
      expect(c.态).toBe(闭合);
      expect(c.失败数).toBe(4); // 账是累计的，不清
    });

    it('冷却没走完就还是打开；走完了放一次探测（探测再炸 ⇒ 重新打开）', () => {
      const c = 建舱壁('x', { 失败阈值: 1, 冷却秒: 2 });
      const 炸 = 造下游(['抛']);
      舱壁调用(c, 炸, 0.016);
      expect(c.态).toBe(打开);
      expect(c.剩余冷却).toBeCloseTo(2, 6);
      // 冷却只走 1 秒：还没到 ⇒ 短路，下游一次都不许被调
      const 短路 = 舱壁调用(c, 炸, 1);
      expect(短路.短路).toBe(true);
      expect(c.态).toBe(打开);
      expect(炸.账.次数, '冷却期内下游被调用了').toBe(1);
      // 再走 1.5 秒：过了 ⇒ 放一次探测（探测是真的调了下游）
      const 探测 = 舱壁调用(c, 炸, 1.5);
      expect(探测.短路).toBe(false);
      expect(探测.成).toBe(false);
      expect(炸.账.次数).toBe(2);
      expect(c.态, '探测又炸 ⇒ 重新打开，不是半开').toBe(打开);
      expect(c.熔断次数).toBe(2);
    });

    it('半开是"探测在飞"的那一瞬 —— 探测函数跑着的时候，态确实是半开', () => {
      const c = 建舱壁('x', { 失败阈值: 1, 冷却秒: 1 });
      const 炸 = 造下游(['抛']);
      舱壁调用(c, 炸, 0.016); // 断开
      expect(c.态).toBe(打开);
      let 探测时的态 = null;
      const 探 = () => { 探测时的态 = c.态; throw new Error('探测也炸'); };
      舱壁调用(c, 探, 2); // 冷却走完 ⇒ 转半开 ⇒ 放探测
      expect(探测时的态, '探测在飞的时候不是半开 —— 那"只放一次"就没地方落脚').toBe(半开);
      expect(c.态, '探测失败 ⇒ 重新打开').toBe(打开);
    });

    it('时间只走调用方给的 dt —— 本模块不开计时器（README 硬约束）', () => {      const c = 建舱壁('x', { 失败阈值: 1, 冷却秒: 2 });
      const 炸 = 造下游(['抛']);
      舱壁调用(c, 炸, 0.016);
      // 断开那一刻按冷却秒计满
      expect(c.剩余冷却).toBeCloseTo(2, 6);
      // 打开态里每被调一次就扣掉这次给的 dt
      舱壁调用(c, 炸, 0.5);
      expect(c.剩余冷却).toBeCloseTo(1.5, 6);
      // 不再被调 ⇒ 冷却一秒都不走（没有 setTimeout、没有自建 rAF）
      expect(c.剩余冷却).toBeCloseTo(1.5, 6);
    });
  });

  describe('② 熔断期间：下游一次都不许被调用，且交的是降级值', () => {
    it('断开之后下游不再被调用（计数夹具钉死）', () => {
      const c = 建舱壁('x', { 失败阈值: 1, 冷却秒: 10, 降级: '降级值' });
      const 炸 = 造下游(['抛']);
      舱壁调用(c, 炸, 0.016);
      expect(炸.账.次数).toBe(1);
      // 冷却期内的十帧：下游一次都不许再被调
      for (let i = 0; i < 10; i++) {
        const r = 舱壁调用(c, 炸, 0.016);
        expect(r.短路).toBe(true);
        expect(r.成).toBe(false);
        expect(r.值).toBe('降级值');
        expect(r.错误).toBe(null);
      }
      expect(炸.账.次数, '熔断期间下游被调用了 —— 那不叫熔断').toBe(1);
      expect(c.短路数).toBe(10);
    });

    it('熔断期间不许再把异常抛给调用方（抛出去就等于没熔断）', () => {
      const c = 建舱壁('x', { 失败阈值: 1, 冷却秒: 10, 降级: 42 });
      const 炸 = 造下游(['抛']);
      舱壁调用(c, 炸, 0.016);
      let 抛了 = null;
      try {
        const r = 舱壁调用(c, 炸, 0.016);
        expect(r.值).toBe(42);
      } catch (e) {
        抛了 = e;
      }
      expect(抛了, '熔断期间又把异常抛出来了').toBe(null);
    });

    it('没有声明降级值时交 undefined —— 但**不许把异常当降级值交出去**', () => {
      const c = 建舱壁('x', { 失败阈值: 1, 冷却秒: 10 });
      const 炸 = 造下游(['抛']);
      舱壁调用(c, 炸, 0.016);
      const r = 舱壁调用(c, 炸, 0.016);
      expect(r.值).toBe(undefined);
      expect(r.错误).toBe(null);
    });
  });

  describe('③ 恢复：半开探测成功 ⇒ 回闭合；探测失败 ⇒ 重新打开且冷却重计', () => {
    it('探测成功 ⇒ 闭合，连续失败清零', () => {
      const c = 建舱壁('x', { 失败阈值: 1, 冷却秒: 1 });
      const 剧本 = 造下游(['抛', '好']);
      舱壁调用(c, 剧本, 0.016);
      expect(c.态).toBe(打开);
      const r = 舱壁调用(c, 剧本, 2); // 冷却走完 ⇒ 半开 ⇒ 探测
      expect(r.成).toBe(true);
      expect(r.值).toBe('好');
      expect(c.态).toBe(闭合);
      expect(c.连续失败).toBe(0);
      expect(c.熔断次数).toBe(1); // 只断过一次
    });

    it('探测失败 ⇒ 重新打开，冷却从头再计（不是接着上次剩的）', () => {
      const c = 建舱壁('x', { 失败阈值: 1, 冷却秒: 2 });
      const 炸 = 造下游(['抛', '抛']);
      舱壁调用(c, 炸, 0.016);
      舱壁调用(c, 炸, 2); // 冷却走完 ⇒ 探测 ⇒ 又炸
      expect(c.态).toBe(打开);
      expect(c.剩余冷却).toBeCloseTo(2, 6); // 从头再计
      expect(c.熔断次数).toBe(2);
      expect(炸.账.次数).toBe(2); // 探测是真的调了下游
    });

    it('失败阈值 >1 时，半开里一次失败就重新打开（不必再攒阈值）', () => {
      const c = 建舱壁('x', { 失败阈值: 5, 冷却秒: 1 });
      const 炸 = 造下游(['抛']);
      for (let i = 0; i < 5; i++) 舱壁调用(c, 炸, 0.016);
      expect(c.态).toBe(打开);
      expect(c.连续失败).toBe(5);
      舱壁调用(c, 炸, 2); // 探测失败
      expect(c.态).toBe(打开);
      expect(c.熔断次数).toBe(2);
    });
  });

  describe('④ 注册表（服务注册与发现语义）', () => {
    it('被跑过一次就在名册里；名册双向 —— 跑过的都登记、登记的都跑过', () => {
      const 组 = 建舱壁组();
      expect(组.名册()).toEqual([]);
      组.跑('甲', () => 1, 0.016);
      组.跑('乙', () => 2, 0.016);
      const 名册 = 组.名册();
      expect(名册.map((c) => c.名).sort()).toEqual(['乙', '甲']);
      expect(名册.every((c) => c.调用数 === 1)).toBe(true);
    });

    it('同一个名字第二次跑不重开一条（名字重复不许改账）', () => {
      const 组 = 建舱壁组();
      组.跑('甲', () => 1, 0.016);
      组.跑('甲', () => 2, 0.016);
      expect(组.名册().length).toBe(1);
      expect(组.名册()[0].调用数).toBe(2);
    });

    it('健康判据：坏舱壁在名单里，健康为假；全好了才真', () => {
      const 组 = 建舱壁组({ 失败阈值: 1, 冷却秒: 5 });
      expect(组.健康()).toBe(true);
      const 炸 = 造下游(['抛']);
      组.跑('甲', 炸, 0.016);
      expect(组.健康()).toBe(false);
      expect(组.坏舱壁()).toEqual(['甲']);
      // "全好了才真"这半句以前只有标题没有量：推过冷却、让它成功一次，判据必须翻回真。
      // 翻篇靠的是**清最近错误**，不是抹历史账 —— 失败数与熔断次数照旧留着。
      const 好 = 造下游(['返1']);
      组.跑('甲', 好, 5.1);
      expect(组.健康()).toBe(true);
      expect(组.坏舱壁()).toEqual([]);
      const 账 = 组.名册()[0];
      expect(账).toMatchObject({ 态: 闭合, 连续失败: 0, 最近错误: null, 失败数: 1, 熔断次数: 1 });
    });

    it('读数口是唯一的：舱壁账给出名/态/计数，错误摘要可读', () => {
      const c = 建舱壁('甲', { 失败阈值: 1, 冷却秒: 1 });
      const 炸 = 造下游(['抛']);
      舱壁调用(c, 炸, 0.016);
      const 账 = 舱壁账(c);
      expect(账.名).toBe('甲');
      expect(账.态).toBe(打开);
      expect(账.失败数).toBe(1);
      expect(账.熔断次数).toBe(1);
      expect(String(账.最近错误)).toContain('第 1 次调用炸了');
    });

    it('建舱壁时脏参数当场抛（名字空 / 阈值 0 / 冷却负数）', () => {
      expect(() => 建舱壁('')).toThrow();
      expect(() => 建舱壁('x', { 失败阈值: 0 })).toThrow();
      expect(() => 建舱壁('x', { 冷却秒: -1 })).toThrow();
    });
  });

  describe('⑤ 接线：主循环里的子系统调用不许再有裸奔的', () => {
    const 源文 = readFileSync(join(ROOT, 'src/core/Game.js'), 'utf8').replace(/\r\n/g, '\n');

    /** 取一个方法的函数体（按**行尾**切，避免跨行锚点在 CRLF 上静默 no-op —— B161 的病根） */
    const 取体 = (方法) => {
      const 起 = 源文.indexOf(`\n  ${方法}() {`);
      const 止 = 源文.indexOf('\n  }\n', 起);
      return { 起, 止, 体: 源文.slice(起, 止) };
    };
    const 更新 = 取体('update');
    const 渲染 = 取体('render');
    const 起 = 更新.起;
    const 止 = 更新.止;
    const 体 = 更新.体;

    /**
     * 抠掉一行里 `走舱壁(…)` 的**整段**（按括号配平）—— 段里的调用算"在舱壁里"，不算裸奔。
     * 段跨行时（本仓有跨行的 `走舱壁(this, 'player', …)`），本行剩下的部分连同未闭合的段一起吃掉。
     */
    const 抠掉舱壁 = (行) => {
      let 出 = '';
      let i = 0;
      for (;;) {
        const at = 行.indexOf('走舱壁(', i);
        if (at < 0) { 出 += 行.slice(i); break; }
        出 += 行.slice(i, at);
        let 深 = 0;
        let j = at + '走舱壁'.length; // 指向 '('
        for (; j < 行.length; j++) {
          if (行[j] === '(') 深++;
          else if (行[j] === ')') { 深--; if (深 === 0) { j++; break; } }
        }
        i = j;
      }
      return 出;
    };

    /**
     * 把调用点**之前**的字归一成"这条语句还剩什么"：
     * 去掉控制流头（`if (…)` / `for (…)` / `while (…)`）与分隔符。
     * 什么都不剩 ⇒ 调用点就是这条语句本身 ⇒ 写侧。
     */
    const 抠掉控制头 = (前) => 前
      .replace(/^\s*(if|else\s+if|for|while)\s*\([^()]*\)\s*/, '')
      .replace(/^[{};\s]+/, '')
      .replace(/[{};\s]+$/, '');

    /**
     * 扫一个函数体里的**裸奔写侧调用**。
     *
     * 口径：**整条语句**形式的 `this.…(` 调用才算写侧（结果不被消费）——
     * 写侧必须进舱壁：它一炸就把这一帧 update() 的后半截一起带走。
     *
     * **读侧**（结果被消费，嵌在表达式里）**不进舱壁**，理由写在这里：
     * 降级值是 `undefined`，拿它去算 dt 就是 NaN，NaN 会顺着这一帧淌遍所有子系统 ——
     * 那比"这一帧不算"坏得多。读侧炸了由**帧级兜底**接住：这一帧不算，画面照渲染，下一帧再来。
     *
     * 匹配**不锚行首**：`if (x) this.y.update();` 也是裸奔。
     * 名字**不设 ASCII 限制**：旧正则的 `\w` 只认 ASCII，于是把子系统属性写成中文名
     * （`this.我的界面.update(dt)`）就能整条滑过去 —— 那不是"换个写法"，是绕过舱壁。
     */
    const 找裸奔 = (函数体, 豁免表 = new Map()) => {
      const 裸奔 = [];
      for (const 行 of 函数体.split('\n')) {
        const 余 = 抠掉舱壁(行.replace(/\/\/.*$/, ''));
        for (const m of 余.matchAll(/this\.[^\s(.)]+(?:\??\.[^\s(.)]+)*\s*\(/g)) {
          const 文本 = m[0].trim();
          if ([...豁免表.keys()].some((k) => 文本.startsWith(k))) continue;
          // 是不是**整条语句**？把调用点之前的字去掉控制流头（`if (…)`）与分隔符，
          // 什么都不剩 ⇒ 它就是这条语句本身 ⇒ 写侧 ⇒ 必须在舱壁里。
          const 前 = 抠掉控制头(余.slice(0, m.index));
          if (前 !== '') continue; // 读侧：结果被消费，豁免（理由见上面的注释）
          裸奔.push(文本);
        }
      }
      return 裸奔;
    };

    /** 唯一的豁免：时钟为什么必须留在舱壁外面 */
    const 豁免 = new Map([
      ['this.time.tick(', '时钟是这一帧的地基：它的 rawDt 决定其余所有 dt，也决定舱壁自己的冷却计时；包进去等于"地基坏了却假装还站在地上"。'],
      ['this.追踪?.开帧(', '追踪器是**仪器**，不是子系统：它量的就是舱壁这条路上的耗时（span = 舱壁调用）。把它包进舱壁就 circular 了 —— 舱壁坏时追踪跟着坏，而追踪器量舱壁、舱壁又量追踪器。它只做三件事（开帧 / 记 span / 收帧），都不碰玩法状态；它自己炸了由**帧级兜底**接住（同一层时钟也是这么兜的）。'],
    ]);

    it('update() 的函数体找得到（尺子不许量空）', () => {
      expect(起).toBeGreaterThan(0);
      expect(止).toBeGreaterThan(起);
      expect(体.length).toBeGreaterThan(3000);
    });

    it('update() 里每一条子系统调用都走舱壁', () => {
      const 裸奔 = 找裸奔(体, 豁免);
      expect(裸奔, `这些子系统调用没走舱壁 —— 一处抛异常就掀整帧：\n${裸奔.join('\n')}`).toEqual([]);
    });

    it('render() 里每一条调用也都走舱壁 —— 渲染器自己炸了不许把画面冻住', () => {
      // 渲染管线是**最后**一环：它每帧都炸的话，后面的舱壁再健康也画不出东西，一样是冻结。
      // 这条门禁在切片1 的初版里漏了：render() 里两处裸调用没人管（缝是后补的，不是天生的）。
      expect(渲染.止, 'render() 的函数体找不到了？').toBeGreaterThan(渲染.起);
      expect(渲染.体.length).toBeGreaterThan(100);
      const 裸奔 = 找裸奔(渲染.体);
      expect(裸奔, `渲染路径上的调用没走舱壁 —— 渲染器炸了画面就永久冻结：\n${裸奔.join('\n')}`).toEqual([]);
    });

    it('豁免不白给：写清为什么、且此刻真的还豁免着（时钟没被偷偷包进去）', () => {
      for (const [前缀, 理由] of 豁免) {
        expect(理由.length, `「${前缀}」的豁免没写为什么`).toBeGreaterThan(0);
        const 命中 = [...体.split('\n')].map((l) => l.trim()).filter((l) => l.startsWith(前缀));
        expect(命中.length, `「${前缀}」的豁免白给了：源码里已经没有这一行`).toBeGreaterThan(0);
        for (const h of 命中) {
          expect(h.includes('走舱壁('), `时钟被包进舱壁了 —— 豁免作废`).toBe(false);
        }
      }
    });

    it('舱壁数站得住（分母）：接线的子系统在 50 条以上', () => {
      const 次数 = [...源文.matchAll(/走舱壁\(this, '([^']+)'/g)].map((m) => m[1]);
      expect(次数.length).toBeGreaterThan(50);
      expect(new Set(次数).size, '舱壁名重名 —— 两条子系统共用一条舱壁，账会串').toBe(次数.length);
    });

    it('渲染路径那三条也在名册里（渲染器不是"舱壁之外的东西"）', () => {
      const 名册 = [...源文.matchAll(/走舱壁\(this, '([^']+)'/g)].map((m) => m[1]);
      for (const 名 of ['rendererInfo', 'composer', 'labelRenderer']) {
        expect(名册, `名册里没有「${名}」⇒ 渲染路径上留了裸奔`).toContain(名);
      }
    });

    it('帧循环有两层兜底：update 抛了也照渲染', () => {
      expect(源文).toMatch(/try \{\s*this\.update\(\); \} catch \(err\) \{ this\._帧级兜底\('update', err\); \}/);
      expect(源文).toMatch(/try \{\s*this\.render\(\); \} catch \(err\) \{ this\._帧级兜底\('render', err\); \}/);
    });

    it('包装器不许是 Game 的方法 —— 每帧普查的逐子系统耗时全靠这条撑着', () => {
      // 普查的站点规则是"`this.…(…)` 形式的调用点"，记账规则是"根调用记自己的耗时、
      // 嵌套调用只记次数"。包装器若是**方法**，它自己就是站点 ⇒ 那一格吞掉全部子系统的
      // 耗时，里面的 `hud.update` / `world.update` 全变成 0ms —— 普查存在的理由整个没了
      // （实测 `.tmp-census-sim.mjs`：方法版「走舱壁 5.49ms / hud.update 0ms」，
      //  自由函数版「hud.update 3.01ms / world.update 2.01ms」）。
      expect(源文, '走舱壁 又变回 Game 的方法了 ⇒ 普查的逐子系统耗时全丢').not.toMatch(/走舱壁\s*\(\s*名\s*,\s*fn\s*\)\s*\{/);
      expect(源文).toMatch(/function 走舱壁\(游戏, 名, fn\)/);

      // 更硬的一条：普查看不见它 ⇒ 名册里不许有「走舱壁」这一族。
      const 站 = 扫站点(String(Game.prototype.update));
      expect(站.length, '扫不出站点 —— update() 的函数体没读到？').toBeGreaterThan(50);
      expect(站.map((s) => s.键), '普查名册里出现了「走舱壁」⇒ 它又被当成子系统了')
        .not.toContain('走舱壁');
      for (const 族 of ['world.update', 'hud.update', 'enemyManager.update', 'weather.update', 'loot.update']) {
        expect(站.map((s) => s.键), `名册里没有「${族}」这一族`).toContain(族);
      }
    });

    it('反向控制：把一条子系统调用改回裸奔，同一把尺子必须点名它', () => {
      // 夹具是字面的，不随源码演进 —— 量的就是"尺子还认得裸奔吗"。
      // 第三行是**中文属性名**：旧正则的 `\w` 只认 ASCII，那一行旧尺子根本看不见。
      // 第四行是**渲染路径**：初版门禁只扫 update()，渲染那两处裸奔整条滑过去。
      // 第五行是**控制流头后面**的裸奔：`if (x) this.y.update();` 旧尺子只看行首，看不见。
      // 第六行是**读侧**：结果被消费（旧帧里 `const dt = … * this.combatCamera.getTimeScale()`），
      //   按口径豁免 —— 降级值是 undefined，拿它算 dt 就是 NaN，NaN 会淌遍这一帧所有子系统。
      const 假体 = [
        '    走舱壁(this, \'甲\', () => this.a.update(dt));',
        '    this.b.update(dt);',
        '    this.我的界面.update(dt);',
        '    this.composer.render();',
        '    if (this.c.open) this.d.update(dt);',
        '    const dt = rawDt * this.combatCamera.getTimeScale();',
      ].join('\n');
      const 裸奔 = 找裸奔(假体);
      expect(裸奔).toEqual(['this.b.update(', 'this.我的界面.update(', 'this.composer.render(', 'this.d.update(']);
    });
  });
});
