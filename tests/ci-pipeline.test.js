/**
 * 门禁咬住门禁 —— CI 工作流不许静默烂掉（W-D4 切片1；第四步于 W-D5 切片3 接上）。
 *
 * 完成定义的三条门禁（lint → test → build）现在跑在 GitHub Actions 上，其后跟第四步
 * `npm run size`（首屏体积）。工作流文件没有测试盯着时会以四种方式静默腐烂：
 * action 名字升版后写错、门禁步骤被人顺手删一步、`npm ci` 退回 `npm install`
 * （锁文件从此形同虚设）、以及**新加的步骤插错位置**。
 * 这里按结构断言把工作流钉住 —— YAML 的语义由 GitHub 自己负责，这里只钉
 * "这份文件在、它确实在跑那几条门禁、顺序没换、Node 锁在与开发机一致的大版本"。
 *
 * 第四步的顺序不是风格问题：`npm run size` 读的是 `dist/index.html` 与它直接引用的产物，
 * 插在 build 之前会以"缺文件按失败算"当场红（W-D5 切片1 的防假绿之一），
 * 而那是一条与体积无关的假红 —— 假红会让人开始怀疑门禁，比没有门禁更糟。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const WORKFLOW = join(ROOT, '.github', 'workflows', 'ci.yml');

describe('CI 工作流（W-D4 切片1；W-D5 切片3 加第四步）', () => {
  const 源文 = existsSync(WORKFLOW) ? readFileSync(WORKFLOW, 'utf8') : '';
  // 注释里也会提到命令名（本片的头注就写了"`npm run size` 必须在 build 之后"），
  // 拿原文 `indexOf` 会把说明当成步骤 —— 顺序断言必须只看真代码。
  const 代码 = 源文.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

  it('工作流文件在（删掉 CI 就等于把完成定义的最后一道岗撤了）', () => {
    expect(existsSync(WORKFLOW), `${WORKFLOW} 不存在 —— CI 没了`).toBe(true);
  });

  it('push 与 PR 都会触发（只挂一边 = 合并前的检查形同虚设）', () => {
    expect(源文).toMatch(/^on:/m);
    expect(源文).toMatch(/push:/);
    expect(源文).toMatch(/pull_request:/);
    expect(源文).toMatch(/branches: \[main\]/);
  });

  it('门禁按完成定义的顺序跑：lint → test → build → size，一步不许少', () => {
    const 命令 = ['npm run lint', 'npm run test', 'npm run build', 'npm run size'];
    const 步序 = 命令.map((cmd) => 代码.indexOf(cmd));
    expect(
      步序.every((i) => i >= 0),
      `缺步骤：${['lint', 'test', 'build', 'size'].filter((_, i) => 步序[i] < 0).join('/')}`
    ).toBe(true);
    for (let i = 1; i < 步序.length; i++) {
      expect(步序[i - 1], `${命令[i - 1]} 必须排在 ${命令[i]} 之前`).toBeLessThan(步序[i]);
    }
  });

  it('第四步是体积门禁且必须落在 build 之后（否则 dist 还没生成，量出来是假红）', () => {
    expect(代码, 'size 步骤不见了 —— W-D5 切片3 接上的那道岗被撤了').toMatch(/run: npm run size/);
    const 步 = [...代码.matchAll(/^\s*- name: (.+)$/gm)].map((m) => m[1]);
    const iBuild = 步.findIndex((n) => /^Build$/i.test(n));
    const iSize = 步.findIndex((n) => /Size|size/.test(n));
    expect(iBuild, '没找到 Build 步骤').toBeGreaterThanOrEqual(0);
    expect(iSize, '没找到体积门禁那一步').toBeGreaterThan(iBuild);
  });

  it('安装走 npm ci（锁文件是唯一真源），Node 锁 24，跑在与开发机一致的 windows 上', () => {
    expect(代码).toMatch(/run: npm ci/);
    expect(代码).not.toMatch(/npm install/);
    expect(代码).toMatch(/node-version: 24/);
    expect(代码).toMatch(/runs-on: windows-latest/);
  });

  it('并发组在：同一分支的旧跑批要被取消，不排队烧时间', () => {
    expect(源文).toMatch(/concurrency:/);
    expect(源文).toMatch(/cancel-in-progress: true/);
  });
});

