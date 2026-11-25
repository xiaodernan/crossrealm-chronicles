import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z527：single-flight 测试里那条「跟随者延迟 <= 领队延迟」的墙上时钟断言曾让 server CI 偶发红
 * （run 45539379715，本机 8/8 绿）。合流的真凭据是 calls==1 / coalesced==7 / cached / 同一份答案，
 * 全都是结构读数；比较两条不同线程各自起算的墙上时钟不是判据，是噪声。
 */
const src = readFileSync(join(process.cwd(),
  'server/ai-service/src/test/java/com/crossrealm/chronicles/ai/LlmClientSingleFlightTest.java'), 'utf8');

describe('single-flight 并发测试不含调度相关的时序断言', () => {
  it('不再断言跟随者 latency <= 领队 latency', () => {
    expect(src).not.toMatch(/latencyMs\(\)\s*<=\s*leaderAnswer\.latencyMs\(\)/);
    expect(src).toContain('不再比较');
  });

  it('结构判据仍在（上游一次 / 合流 7 / 跟随者 cached / 同一份答案）', () => {
    for (const frag of ['assertEquals(1, transport.calls.get()', 'assertEquals(7L, view.get("coalesced"))',
      'a.cached()', 'a.answer()']) {
      expect(src, `缺了结构判据 ${frag}`).toContain(frag);
    }
  });

  it('跟随者等待耗时的下限断言保留（不是领队耗时 / 0）', () => {
    expect(src).toMatch(/a\.latencyMs\(\)\s*>=\s*30L/);
  });
});
