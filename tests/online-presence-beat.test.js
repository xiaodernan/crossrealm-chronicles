/**
 * W-Z26「星图微光」：OnlineServices.postPresenceBeat 契约（心跳续包不能向服务端投毒）
 *
 * 钉住：
 * 1) 未启用 → false 零外呼
 * 2) id / channel 白名单（服务端同源逐字），名字去控制字符、按 24 裁剪、空名直接 false
 * 3) hue 归一 [0,359] 整数、x/z 夹紧 [-1,1]、NaN→0
 * 4) 只有 HTTP 202 才算 true（429/5xx/非法字段回显一律 false）
 */
import { describe, expect, it, vi } from 'vitest';
import { OnlineServices } from '../src/online/OnlineServices.js';

const base = { baseUrl: 'http://localhost:8080', enabled: true };

function beat(fetchImpl, over = {}) {
  const o = new OnlineServices({ ...base, fetchImpl, ...(over.client ?? {}) });
  return o.postPresenceBeat({
    id: 'crimson-gavel',
    name: 'Crimson',
    hue: 250,
    x: 0.5,
    z: -0.25,
    ...over.body,
  });
}

describe('postPresenceBeat 未启用 → 零外呼', () => {
  it('enabled=false → false，fetchImpl 零调用', async () => {
    const fetchImpl = vi.fn();
    const o = new OnlineServices({ ...base, enabled: false, fetchImpl });
    expect(await o.postPresenceBeat({ id: 'ok-id', name: 'ok', hue: 1, x: 0, z: 0 })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('id / channel / name 白名单', () => {
  it('id 非法（超长 / 注入 / 非字符串）→ false，零外呼', async () => {
    for (const id of ['x'.repeat(41), 'a b c', '中文', null, 42]) {
      const fetchImpl = vi.fn();
      expect(await beat(fetchImpl, { body: { id } }), String(id)).toBe(false);
      expect(fetchImpl, String(id)).not.toHaveBeenCalled();
    }
  });

  it('channel 非法 → false，零外呼', async () => {
    for (const channel of ['bad channel!', 'x'.repeat(33), '', 'world!']) {
      const fetchImpl = vi.fn();
      expect(await beat(fetchImpl, { body: { channel } }), String(channel)).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('name：控制字符被替掉；纯控制字符/空名 → false，零外呼', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 202 });
    expect(await beat(fetchImpl, { body: { name: 'ab\ncd\u0000ef\u007Fgh' } })).toBe(true);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.name).toBe('ab cd ef gh');

    for (const name of ['   ', '\n\r\t', '', null, 123]) {
      fetchImpl.mockClear();
      expect(await beat(fetchImpl, { body: { name } })).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });
});

describe('hue / x / z 语义', () => {
  it('hue：浮点 floor、超出归一、NaN→0', async () => {
    const cases = [
      [250.9, 250],
      [361, 1],
      [-10, 350],
      [720, 0],
      [NaN, 0],
    ];
    for (const [hue, want] of cases) {
      const fetchImpl = vi.fn().mockResolvedValue({ status: 202 });
      await beat(fetchImpl, { body: { hue } });
      const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
      expect(body.hue, String(hue)).toBe(want);
    }
  });

  it('x/z：夹紧 [-1,1]，NaN→0', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 202 });
    await beat(fetchImpl, { body: { x: 99, z: -99 } });
    let body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect([body.x, body.z]).toEqual([1, -1]);

    fetchImpl.mockClear();
    await beat(fetchImpl, { body: { x: NaN, z: Infinity } });
    body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect([body.x, body.z]).toEqual([0, 0]);
  });
});

describe('响应语义', () => {
  it('202 → true，发出正确 URL 与 JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 202 });
    expect(await beat(fetchImpl)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:8080/api/presence/world/beat');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
  });

  it('429（频道满）→ false', async () => {
    expect(await beat(vi.fn().mockResolvedValue({ status: 429 }))).toBe(false);
  });

  it('500 → false', async () => {
    expect(await beat(vi.fn().mockResolvedValue({ status: 500 }))).toBe(false);
  });

  it('fetch 抛错 → 吞掉回 false', async () => {
    await expect(beat(vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))).resolves.toBe(false);
  });
});

describe('presenceStreamUrl（W-Z26 徽章数据源）', () => {
  it('启用时返回 URL，未启用/非法频道 → null', () => {
    const on = new OnlineServices({ ...base, fetchImpl: vi.fn() });
    expect(on.presenceStreamUrl('world')).toBe('http://localhost:8080/api/presence/world/stream');
    expect(on.presenceStreamUrl('bad channel!')).toBeNull();

    const off = new OnlineServices({ ...base, enabled: false, fetchImpl: vi.fn() });
    expect(off.presenceStreamUrl('world')).toBeNull();
  });
});
