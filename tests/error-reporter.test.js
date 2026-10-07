/**
 * 运行时错误收集（W-D5 切片2）
 *
 * ## 三条纪律，每一条都能单独写坏
 * 1. **不吞异常** —— `error` 的处理器不返回 `true`、`unhandledrejection` 不调
 *    `preventDefault()`。吞掉的话控制台不再打印、默认行为也停了，等于用一个
 *    "错误收集器"把错误藏起来。这一层是本片最要紧的一条。
 * 2. **不无限增长** —— 环形上限 + 同指纹去重（只累加 count）。一个每帧抛的错
 *    否则会在几秒内刷满缓冲，真正的第一现场被挤出去。
 * 3. **装得上也卸得掉** —— `install()` 幂等、`uninstall()` 真解绑。
 *
 * ## 用例分八层
 * ① 捕获两种来源；② 不吞；③ 去重与计数；④ 环形上限与 dropped；
 * ⑤ 装/卸与幂等；⑥ 报告形状；⑦ 事件名登记 + 派发出口；⑧ 栈裁剪与 sink 出口。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createErrorReporter, MAX_ERRORS, MAX_STACK_LINES, ERROR_EVENT_NAME, errorEventRegistered,
} from '../src/engine/errorReporter.js';
import { GAME_EVENTS } from '../src/engine/events.js';

const SRC = join(process.cwd(), 'src');
/** 剥注释：不然说明文字里的 `install()` 会被当成调用 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => { const i = l.indexOf('//'); return i >= 0 ? l.slice(0, i) : l; }).join('\n');

/** 假事件宿主：能装、能卸、能点名派发、能数绑定了几份 */
function makeTarget() {
  const handlers = new Map();
  return {
    addEventListener(n, h) {
      if (!handlers.has(n)) handlers.set(n, []);
      handlers.get(n).push(h);
    },
    removeEventListener(n, h) {
      const arr = handlers.get(n) ?? [];
      const i = arr.indexOf(h);
      if (i >= 0) arr.splice(i, 1);
    },
    fire(n, ev) { for (const h of [...(handlers.get(n) ?? [])]) h(ev); },
    boundCount(n) { return (handlers.get(n) ?? []).length; },
  };
}

const errEvent = (msg, extra = {}) => ({
  message: msg, filename: 'src/a.js', lineno: 10, colno: 5,
  error: Object.assign(new Error(msg), { stack: `Error: ${msg}\n  at a\n  at b` }),
  ...extra,
});

let dispatched;
const mk = (over = {}) => createErrorReporter({
  target: makeTarget(),
  now: () => 1000,
  dispatch: (detail) => { dispatched.push(detail); },
  ...over,
});

beforeEach(() => { dispatched = []; });

describe('运行时错误收集（W-D5 切片2）', () => {
  describe('① 捕获两种来源', () => {
    it('error 事件：message / 位置 / 栈都收下来', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install();
      t.fire('error', errEvent('boom'));
      const [e] = rep.getErrors();
      expect(e.kind).toBe('error');
      expect(e.message).toBe('boom');
      expect(e.source).toBe('src/a.js');
      expect(e.line).toBe(10);
      expect(e.column).toBe(5);
      expect(e.stack).toContain('Error: boom');
      expect(e.count).toBe(1);
    });

    it('unhandledrejection：reason 是 Error / 字符串 / 对象三种都收得下', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install();
      t.fire('unhandledrejection', { reason: new Error('拒绝一') });
      t.fire('unhandledrejection', { reason: '拒绝二' });
      t.fire('unhandledrejection', { reason: { code: 42 } });
      const msgs = rep.getErrors().map((e) => e.message);
      expect(msgs).toEqual(['拒绝一', '拒绝二', '{"code":42}']);
      expect(rep.getErrors().every((e) => e.kind === 'unhandledrejection')).toBe(true);
    });

    it('没有 error 对象的 error 事件也收得下（拿 message 兜底）', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install();
      t.fire('error', { message: '只有消息' });
      expect(rep.getErrors()[0].message).toBe('只有消息');
      expect(rep.getErrors()[0].stack).toBe(null);
    });
  });

  describe('② 不吞异常（本片最要紧的一条）', () => {
    it('error 处理器不叫停事件，也不返回 true（行为 + 结构两条）', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install();
      const called = [];
      t.fire('error', {
        ...errEvent('x'),
        preventDefault: () => called.push('preventDefault'),
        stopPropagation: () => called.push('stopPropagation'),
      });
      expect(called, '不许对事件叫停').toEqual([]);
      expect(rep.size()).toBe(1);

      // 结构那一条：`addEventListener` 的返回值本来就被忽略（只有 `window.onerror = fn`
      // 的返回值才有意义），所以"吞不吞"在行为层测不出来 —— 但 `return true` 这行字是
      // "打算吞掉"的信号，也会在某天换成 `window.onerror` 时真的生效。钉住它。
      const src = stripComments(readFileSync(join(SRC, 'engine', 'errorReporter.js'), 'utf8'));
      expect(src, 'onError 里不许出现 return true').not.toMatch(/return\s+true/);
    });

    it('unhandledrejection 不调 preventDefault', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install();
      let prevented = false;
      t.fire('unhandledrejection', {
        reason: new Error('x'),
        preventDefault() { prevented = true; },
      });
      expect(prevented).toBe(false);
      expect(rep.size()).toBe(1);
    });
  });

  describe('③ 去重与计数', () => {
    it('同一处错误重复出现只占一个槽位、只累加 count', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install();
      for (let i = 0; i < 5; i++) t.fire('error', errEvent('每帧都抛'));
      expect(rep.size()).toBe(1);
      expect(rep.getErrors()[0].count).toBe(5);
    });

    it('消息相同但位置不同 → 两条', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install();
      t.fire('error', errEvent('同名', { lineno: 1 }));
      t.fire('error', errEvent('同名', { lineno: 2 }));
      expect(rep.size()).toBe(2);
    });

    it('去重的键含 kind —— 同消息的 error 与 rejection 是两条', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install();
      t.fire('error', errEvent('同消息'));
      t.fire('unhandledrejection', { reason: new Error('同消息') });
      expect(rep.size()).toBe(2);
    });
  });

  describe('④ 环形上限与 dropped', () => {
    it('超上限丢最旧的，并记 dropped', () => {
      const t = makeTarget();
      const rep = mk({ target: t, limit: 3 });
      rep.install();
      for (let i = 1; i <= 5; i++) t.fire('error', errEvent(`第${i}条`, { lineno: i }));
      expect(rep.size()).toBe(3);
      expect(rep.getDropped()).toBe(2);
      // 留下的是最新的三条
      expect(rep.getErrors().map((e) => e.message)).toEqual(['第3条', '第4条', '第5条']);
    });

    it('默认上限是 50', () => {
      expect(MAX_ERRORS).toBe(50);
    });

    it('去重发生在入队之前 —— 刷屏的错误不会把缓冲挤空', () => {
      const t = makeTarget();
      const rep = mk({ target: t, limit: 3 });
      rep.install();
      for (let i = 0; i < 100; i++) t.fire('error', errEvent('刷屏'));
      t.fire('error', errEvent('别的', { lineno: 99 }));
      expect(rep.size()).toBe(2);       // 刷屏那条只占一格
      expect(rep.getDropped()).toBe(0); // 一条都没被丢
    });
  });

  describe('⑤ 装/卸与幂等', () => {
    it('install 幂等：装两次只绑一份', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install(); rep.install();
      expect(t.boundCount('error')).toBe(1);
      expect(t.boundCount('unhandledrejection')).toBe(1);
      expect(rep.installed).toBe(true);
    });

    it('uninstall 真解绑，之后不再记录', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install();
      t.fire('error', errEvent('一'));
      rep.uninstall();
      expect(t.boundCount('error')).toBe(0);
      expect(rep.installed).toBe(false);
      t.fire('error', errEvent('二'));
      expect(rep.size()).toBe(1);
    });

    it('uninstall 幂等、没装过也能卸', () => {
      const rep = mk();
      expect(() => { rep.uninstall(); rep.uninstall(); }).not.toThrow();
      expect(rep.installed).toBe(false);
    });

    it('没有 addEventListener 的宿主不会炸（装上但绑不了）', () => {
      const rep = createErrorReporter({ target: {}, dispatch: () => {} });
      expect(() => rep.install()).not.toThrow();
      expect(rep.installed).toBe(true);
    });
  });

  describe('⑥ 报告形状', () => {
    it('空账本有话说', () => {
      expect(mk().toReport()).toMatch(/没有捕获到/);
    });

    it('报告含种类 / 次数 / 位置 / 栈', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install();
      t.fire('error', errEvent('炸了'));
      t.fire('error', errEvent('炸了'));
      const text = rep.toReport();
      expect(text).toMatch(/运行时错误 1 种/);
      expect(text).toMatch(/\[error\] ×2 炸了/);
      expect(text).toMatch(/src\/a\.js:10:5/);
    });

    it('有 dropped 时报告里说得出来', () => {
      const t = makeTarget();
      const rep = mk({ target: t, limit: 1 });
      rep.install();
      t.fire('error', errEvent('一', { lineno: 1 }));
      t.fire('error', errEvent('二', { lineno: 2 }));
      expect(rep.toReport()).toMatch(/另有 1 条因超出缓冲被丢弃/);
    });
  });

  describe('⑦ 事件名登记与派发出口', () => {
    it('error-captured 登记在 GAME_EVENTS 里（引擎启动时会校验未登记的名字）', () => {
      // 名字必须是 kebab-case：登记表那条门禁只放行 `[a-z0-9-]`（冒号会被判红）
      expect(ERROR_EVENT_NAME).toBe('error-captured');
      expect(errorEventRegistered()).toBe(true);
      expect(GAME_EVENTS['error-captured']).toBeTruthy();
    });

    it('新错误派发一次事件；重复出现的只累加不重派', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install();
      t.fire('error', errEvent('一'));
      t.fire('error', errEvent('一'));
      t.fire('error', errEvent('二', { lineno: 2 }));
      expect(dispatched.length).toBe(2);
      expect(dispatched[0]).toMatchObject({ kind: 'error', message: '一', count: 1 });
    });
  });

  describe('⑨ 接线：Game.js 真的装上了（不然就是造了个没人用的东西）', () => {
    const gameSrc = () => stripComments(readFileSync(join(SRC, 'core', 'Game.js'), 'utf8'));

    it('Game.js import 了 createErrorReporter、建了实例、调了 install()', () => {
      const src = gameSrc();
      expect(src, '要 import').toMatch(/import \{[^}]*createErrorReporter[^}]*\} from '\.\.\/engine\/errorReporter\.js'/);
      expect(src, '要建实例').toMatch(/createErrorReporter\(/);
      expect(src, '要装上').toMatch(/errorReporter\.install\(\)/);
    });

    it('反面证据：那把尺子量得出"只 import 不 install"与"只 record 不装"', () => {
      const 尺子 = (s) => ({
        imported: /import \{[^}]*createErrorReporter[^}]*\} from '\.\.\/engine\/errorReporter\.js'/.test(s),
        installed: /errorReporter\.install\(\)/.test(s),
      });
      expect(尺子("import { createErrorReporter } from '../engine/errorReporter.js';")).toEqual({ imported: true, installed: false });
      expect(尺子('this.errorReporter.install();')).toEqual({ imported: false, installed: true });
    });
  });

  describe('⑧ 栈裁剪与 sink 出口', () => {
    it('长栈只留 MAX_STACK_LINES 行', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install();
      const long = Array.from({ length: 40 }, (_, i) => `  at frame${i}`).join('\n');
      t.fire('error', { message: '深栈', error: { message: '深栈', stack: long } });
      const e = rep.getErrors()[0];
      expect(e.stack.split('\n').length).toBe(MAX_STACK_LINES);
    });

    it('setSink 之后每条都被送到出口；置 null 之后不再送', () => {
      const t = makeTarget();
      const rep = mk({ target: t });
      rep.install();
      const seen = [];
      rep.setSink((e) => seen.push(e.message));
      t.fire('error', errEvent('一'));
      t.fire('error', errEvent('一')); // 去重的那条也送（计数变了）
      t.fire('error', errEvent('二', { lineno: 2 }));
      expect(seen).toEqual(['一', '一', '二']);
      rep.setSink(null);
      t.fire('error', errEvent('三', { lineno: 3 }));
      expect(seen.length).toBe(3);
    });

    it('setSink 传非函数等于关掉出口', () => {
      const rep = mk();
      rep.setSink('不是函数');
      expect(() => rep.record({ kind: 'error', message: 'x' })).not.toThrow();
    });
  });
});
