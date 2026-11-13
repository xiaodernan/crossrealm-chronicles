/**
 * W-Z26「星图微光」：PresenceTracker 订阅 / 快照 / 重连语义（无真 EventSource）
 *
 * 三件事钉住：
 * 1) 未启用在线 / 没得建联（EventSource 不存在）→ start() 返回 false，全程零连接尝试
 * 2) present 帧逐条入册（同 id 幂等覆盖），snapshot-end 才算 ready；count === 名单尺寸
 * 3) stop() 关掉连接、清空名单、ready 归 false；订阅者即时收到
 */
import { describe, expect, it, vi } from 'vitest';
import { PresenceTracker } from '../src/online/presenceTracker.js';

/** 可控的假 EventSource：手动开帧 / 手动 error / 观测 close；instances 记录全部建联实例 */
function fakeSource() {
  const FakeSource = class FakeSource {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      this.closed = false;
      FakeSource.instances.push(this);
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    fire(type, data) {
      if (this.closed) return;
      for (const fn of this.listeners.get(type) ?? []) {
        fn({ data: typeof data === 'string' ? data : JSON.stringify(data) });
      }
    }
    close() {
      this.closed = true;
    }
  };
  FakeSource.instances = [];
  return FakeSource;
}
function makeTracker(overrides = {}) {
  const Fake = fakeSource();
  const tracker = new PresenceTracker({
    isEnabled: () => true,
    streamUrl: () => 'http://localhost:8080/api/presence/world/stream',
    createSource: (url) => new Fake(url),
    ...overrides,
  });
  return { tracker, Fake };
}

describe('未启用 / 无法建联 → 静默关闭', () => {
  it('isEnabled=false：零连接尝试', () => {
    const tracker = new PresenceTracker({
      isEnabled: () => false,
      streamUrl: () => 'http://localhost:8080/api/presence/world/stream',
      createSource: vi.fn(),
    });
    expect(tracker.start()).toBe(false);
    expect(tracker.count()).toBe(0);
  });

  it('streamUrl 返回 null（非法频道/未启用）：不碰 createSource', () => {
    const create = vi.fn();
    const tracker = new PresenceTracker({
      isEnabled: () => true,
      streamUrl: () => null,
      createSource: create,
    });
    expect(tracker.start()).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('createSource 抛错（浏览器无 EventSource / CSP）→ false，不向上抛', () => {
    const tracker = new PresenceTracker({
      isEnabled: () => true,
      streamUrl: () => 'http://localhost:8080/api/presence/world/stream',
      createSource: () => { throw new ReferenceError('EventSource is not defined'); },
    });
    expect(tracker.start()).toBe(false);
    expect(tracker.count()).toBe(0);
  });
});

describe('快照与名单语义', () => {
  it('present 逐条入册，snapshot-end 才 ready；同 id 幂等覆盖', async () => {
    const { tracker, Fake } = makeTracker();
    expect(tracker.start()).toBe(true);
    const source = Fake.instances[0];

    source.fire('present', { id: 'a', name: 'A', hue: 10, x: 0.1, z: 0.2 });
    source.fire('present', { id: 'b', name: 'B', hue: 20, x: -0.5, z: 0.5 });
    expect(tracker.count()).toBe(2);
    expect(tracker.ready).toBe(false);

    source.fire('present', { id: 'a', name: 'A', hue: 99, x: 0.9, z: 0.9 });
    expect(tracker.count()).toBe(2, '同 id 幂等覆盖');

    source.fire('snapshot-end', '{}');
    expect(tracker.ready).toBe(true);
  });

  it('错误帧丢弃：坏 JSON / 空 id / 缺字段', () => {
    const { tracker, Fake } = makeTracker();
    tracker.start();
    const source = Fake.instances[0];
    source.fire('present', 'not json');
    source.fire('present', { name: 'no-id' });
    source.fire('present', { id: '' });
    expect(tracker.count()).toBe(0);
  });

  it('subscribe 立即以当前状态触发一次，退订后不再收到', () => {
    const { tracker, Fake } = makeTracker();
    tracker.start();
    const source = Fake.instances[0];
    const calls = [];
    const off = tracker.subscribe((count, ready) => calls.push([count, ready]));
    expect(calls[0]).toEqual([0, false]);

    source.fire('present', { id: 'x', hue: 1 });
    expect(calls.at(-1)).toEqual([1, false]);

    off();
    source.fire('present', { id: 'y', hue: 2 });
    expect(calls.at(-1)).toEqual([1, false]);
  });

  it('stop()：关连接、清名单、ready→false、订阅者各收到零', () => {
    const { tracker, Fake } = makeTracker();
    tracker.start();
    const source = Fake.instances[0];
    source.fire('present', { id: 'a', hue: 1 });
    source.fire('snapshot-end', '{}');
    const calls = [];
    tracker.subscribe((count, ready) => calls.push([count, ready]));
    calls.length = 0;

    tracker.stop();
    expect(source.closed).toBe(true);
    expect(tracker.count()).toBe(0);
    expect(tracker.ready).toBe(false);
    expect(calls.at(-1)).toEqual([0, false]);
  });
});
