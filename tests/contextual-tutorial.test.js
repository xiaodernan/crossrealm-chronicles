/**
 * 情境教程门禁 —— 钉 `ui/ContextualTutorial.js` 的 **去重 / 持久化 / 队列 / 播出 / 重置**。
 *
 * 情境提示只在"第一次"弹：`seen` 集合（落 localStorage）记住已弹过的 id，重复触发直接忽略；
 * 多条同时来则排队，`_drain` 一次播一条。几条"写错不抛、只静默重复弹/丢提示"的不变量：
 * - **去重**：同一 id 触发两次，队列里只会有一条（第二次被 seen 挡下）。
 * - **持久化**：触发即把 id 写进 localStorage（下次启动 `constructor` 读回）。
 * - **读回**：`constructor` 从 localStorage 恢复 seen；已看过的 id 不再入队。
 * - **队列**：忙时再触发只入队（不并发播）。
 * - **播出**：`_drain` 用 `scheduler.after` 定时，到点才 `dialog.show(t(title,params), keyText(t(text,params)))`
 *   —— 模板到播出那一刻才展开（排队期间可能改过键位）。
 * - `reset()` 清空 seen 与 localStorage。
 *
 * EventBus 监听在构造期注册，`afterEach` 用 `dispose()` 结清。两枚变异探针走真代码路径。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduler } from '../src/engine/Scheduler.js';
import { t } from '../src/engine/i18n.js';
import { keyText } from '../src/ui/keyHints.js';
import { ContextualTutorial } from '../src/ui/ContextualTutorial.js';

const STORAGE_KEY = 'crossrealm_contextual_tips';

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _store: store,
  };
}

let realLS, realDoc, storage, game, tutorial;

beforeEach(() => {
  scheduler.clearAll();
  storage = makeStorage();
  game = { dialog: { show: vi.fn() }, quests: { chapter: 1 } };
  realLS = globalThis.localStorage;
  realDoc = globalThis.document;
  globalThis.localStorage = storage;
  globalThis.document = {
    getElementById: vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  };
});

afterEach(() => {
  tutorial?.dispose();
  tutorial = null;
  globalThis.localStorage = realLS;
  globalThis.document = realDoc;
});

describe('ContextualTutorial 去重与持久化', () => {
  it('同一 id 触发两次只入队一条（第二次被 seen 挡下）', () => {
    tutorial = new ContextualTutorial(game);
    tutorial.trigger('t1', 'tip_title', 'tip_text');
    tutorial.trigger('t1', 'tip_title', 'tip_text'); // 应被忽略
    expect(tutorial.queue.length).toBe(0); // 第一条已 shift 去播，第二条不该再入队
    expect(tutorial.seen.has('t1')).toBe(true);
  });

  it('触发即把 id 写进 localStorage', () => {
    tutorial = new ContextualTutorial(game);
    tutorial.trigger('t1', 'tip_title', 'tip_text');
    expect(JSON.parse(storage.getItem(STORAGE_KEY))).toEqual(['t1']);
  });

  it('constructor 从 localStorage 恢复 seen：已看过的 id 不再入队', () => {
    globalThis.localStorage = makeStorage({ [STORAGE_KEY]: JSON.stringify(['t1']) });
    tutorial = new ContextualTutorial(game);
    expect(tutorial.seen.has('t1')).toBe(true);
    tutorial.trigger('t1', 'tip_title', 'tip_text');
    expect(tutorial.queue.length).toBe(0);
  });
});

describe('ContextualTutorial 队列与播出', () => {
  it('忙时再触发只入队，不并发播', () => {
    tutorial = new ContextualTutorial(game);
    tutorial.trigger('a', 'tip_title', 'tip_text'); // 立即 _drain 播第一条（busy=true）
    tutorial.trigger('b', 'tip_title', 'tip_text'); // 忙 → 只入队
    expect(tutorial.queue.length).toBe(1);
    expect(tutorial.queue[0].title).toBe('tip_title');
  });

  it('_drain 到点才播出：dialog.show(t(title,params), keyText(t(text,params)))', () => {
    tutorial = new ContextualTutorial(game);
    tutorial.trigger('a', 'tip_title', 'tip_text', 0);
    expect(game.dialog.show).not.toHaveBeenCalled(); // 还没到点
    scheduler.update(0); // 0 延迟 → 立即到期
    expect(game.dialog.show).toHaveBeenCalledWith(
      t('tip_title', {}),
      keyText(t('tip_text', {}))
    );
  });
});

describe('ContextualTutorial reset', () => {
  it('清空 seen 与 localStorage', () => {
    tutorial = new ContextualTutorial(game);
    tutorial.trigger('t1', 'tip_title', 'tip_text');
    tutorial.reset();
    expect(tutorial.seen.size).toBe(0);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
});
