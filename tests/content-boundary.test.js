import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 回归门禁：简历联动子系统（工程栈 / 足球面板）不得再进入游戏代码 */
const FORBIDDEN = [
  'DevStack', 'devstack', 'FootballPanel', 'KafkaEventHub', 'RedisCacheDirector',
  'RedisStructuresDirector', 'SentinelDirector', 'RagAgentAssistant',
  'SeckillLuaDirector', 'CronTaskDirector', 'ResumeBootstrapDirector',
  'SeataTransactionDirector', 'WebSocketDirector', 'DevStackLiveBridge',
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('内容边界', () => {
  it('src/ 内不含工程栈与足球面板引用', () => {
    const offenders = [];
    for (const file of walk(fileURLToPath(new URL('../src', import.meta.url)))) {
      const text = readFileSync(file, 'utf8');
      for (const token of FORBIDDEN) {
        if (text.includes(token)) offenders.push(`${file}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
