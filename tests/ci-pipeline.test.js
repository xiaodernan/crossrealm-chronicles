/**
 * 门禁咬住门禁 —— CI 工作流不许静默烂掉（W-D4 切片1）。
 *
 * 完成定义的三条门禁（lint → test → build）现在跑在 GitHub Actions 上。
 * 工作流文件没有测试盯着时会以三种方式静默腐烂：action 名字升版后写错、
 * 门禁步骤被人顺手删一步、`npm ci` 退回 `npm install`（锁文件从此形同虚设）。
 * 这里按结构断言把工作流钉住 —— YAML 的语义由 GitHub 自己负责，这里只钉
 * "这份文件在、它确实在跑那三条门禁、顺序没换、Node 锁在与开发机一致的大版本"。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const WORKFLOW = join(ROOT, '.github', 'workflows', 'ci.yml');

describe('CI 工作流（W-D4 切片1）', () => {
  const 源文 = existsSync(WORKFLOW) ? readFileSync(WORKFLOW, 'utf8') : '';

  it('工作流文件在（删掉 CI 就等于把完成定义的最后一道岗撤了）', () => {
    expect(existsSync(WORKFLOW), `${WORKFLOW} 不存在 —— CI 没了`).toBe(true);
  });

  it('push 与 PR 都会触发（只挂一边 = 合并前的检查形同虚设）', () => {
    expect(源文).toMatch(/^on:/m);
    expect(源文).toMatch(/push:/);
    expect(源文).toMatch(/pull_request:/);
    expect(源文).toMatch(/branches: \[main\]/);
  });

  it('三条门禁按完成定义的顺序跑：lint → test → build，一步不许少', () => {
    const 步序 = ['npm run lint', 'npm run test', 'npm run build'].map((cmd) => 源文.indexOf(cmd));
    expect(步序.every((i) => i >= 0), `缺步骤：${['lint', 'test', 'build'].filter((_, i) => 步序[i] < 0).join('/')}`).toBe(true);
    expect(步序[0]).toBeLessThan(步序[1]);
    expect(步序[1]).toBeLessThan(步序[2]);
  });

  it('安装走 npm ci（锁文件是唯一真源），Node 锁 24，跑在与开发机一致的 windows 上', () => {
    expect(源文).toMatch(/run: npm ci/);
    expect(源文).not.toMatch(/npm install/);
    expect(源文).toMatch(/node-version: 24/);
    expect(源文).toMatch(/runs-on: windows-latest/);
  });

  it('并发组在：同一分支的旧跑批要被取消，不排队烧时间', () => {
    expect(源文).toMatch(/concurrency:/);
    expect(源文).toMatch(/cancel-in-progress: true/);
  });
});
