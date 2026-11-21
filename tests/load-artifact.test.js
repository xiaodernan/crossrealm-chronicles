import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z492 压测产物 schema —— 确认真 MEASURED 数据落盘且诚实标注（不是演示数字）。
 */
describe('压测产物 crossrealm-load-2026-11-21（W-Z492）', () => {
  const d = JSON.parse(readFileSync(join(process.cwd(), 'docs/admin/data/crossrealm-load-2026-11-21.json'), 'utf8'));

  it('schema 与双路径实测齐全', () => {
    expect(d.schema).toBe('crossrealm.load-probe.v1');
    expect(d.measured.direct.rps).toBeGreaterThan(0);
    expect(d.measured.gateway.rps).toBeGreaterThan(0);
    expect(d.measured.direct.p99Ms).toBeGreaterThan(0);
    expect(d.measured.gateway.p99Ms).toBeGreaterThan(0);
  });

  it('诚实标注：429 是限流器工作而非崩溃，宿主机争用单列', () => {
    const joined = d.honestReading.join(' ');
    expect(joined).toMatch(/429/);
    expect(joined).toMatch(/限流|rate.?limit/i);
    expect(joined).toMatch(/rabbitmq|宿主|host/i);
  });

  it('含可复现命令', () => {
    expect(d.reproduce).toMatch(/load-test\.mjs/);
    expect(d.reproduce).toMatch(/docker compose up/);
  });
});