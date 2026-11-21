import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z504 io 仓多个 sync cron 并行推送，纯 git push 会被非快进拒绝（实测 failure），
 * 每个会提交 master 的 sync 工作流都必须在 push 前 rebase。
 */
describe('io sync 工作流 rebase 门禁（W-Z504）', () => {
  const wfDir = 'D:\\xiaodernan.github.io\\.github\\workflows';
  const syncs = ['sync-crossrealm.yml', 'sync-minicc.yml', 'sync-nexus-platform.yml', 'sync-career-os.yml'];

  for (const name of syncs) {
    it(`${name} 在 git push 前先 git pull --rebase`, () => {
      const s = readFileSync(join(wfDir, name), 'utf8');
      expect(s, `${name} 没有 git push`).toMatch(/^\s*git push\s*$/m);
      const pushIdx = s.search(/^\s*git push\s*$/m);
      const rebaseIdx = s.indexOf('git pull --rebase');
      expect(rebaseIdx, `${name} 缺 rebase`).toBeGreaterThan(-1);
      expect(rebaseIdx, `${name} rebase 不在 push 前`).toBeLessThan(pushIdx);
    });
  }
});