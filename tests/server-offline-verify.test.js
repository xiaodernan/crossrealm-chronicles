import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z519 离线总开关上线后，server CI 的 advisor queue 探针曾连红：
 * 它硬断言 dead-letter reason 必须是 not-configured，而总开关关掉后是 llm-disabled。
 * 两种都是「确定性离线死亡」的正当原因，探针不该挑一种。这里钉住探针认两种。
 */
const script = readFileSync(
  join(process.cwd(), 'server', 'scripts', 'verify-redis-advisor-queue.ps1'), 'utf8');

describe('server advisor queue 探针认离线 reason', () => {
  it('dead-letter reason 同时接受 not-configured 与 llm-disabled', () => {
    expect(script, '探针仍在硬断言单一 reason').toMatch(/not-configured\|llm-disabled/);
  });

  it('反向控制：只认一种写法的旧断言必须被这条门拒绝', () => {
    const sample = 'if (-not ($dl -match \'"reason":"not-configured"\')) { exit 1 }';
    expect(sample).not.toMatch(/not-configured\|llm-disabled/);
  });

  it('探针仍禁止回显玩家问题与密钥（离线改动没有放宽隐私门）', () => {
    expect(script).toMatch(/echoed the player question back/);
    expect(script).toMatch(/leaks an api key/);
  });
});
