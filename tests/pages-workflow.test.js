import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pages 装配工作流的语法门禁。
 *
 * 抓到的真 bug（W-Z522）：一次提交里四条 `cp` 行被误删了缩进，
 * 从 `run: |` 的块里掉到 job 顶层 ⇒ YAML 直接解析失败，
 * 三次 push 的 Pages 部署全部 0 秒失败，展示页停在旧版本。
 * CI 的 Test 门只跑 JS，根本不解析 workflow YAML，所以全绿也照样坏。
 */
const wf = readFileSync(join(process.cwd(), '.github', 'workflows', 'pages.yml'), 'utf8').replace(/\r\n/g, '\n');

describe('Pages 工作流语法与装配', () => {
  it('每个 run: | 块里的命令行都比 run: 多缩进（不许掉到 job 顶层）', () => {
    const lines = wf.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*run:\s*\|\s*$/.test(lines[i])) continue;
      const runIndent = lines[i].match(/^(\s*)/)[1].length;
      // 块内容至少多两格；直到遇到同级或更浅的非空行（下一个 key）才结束
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j];
        if (!line.trim()) continue;
        const ind = line.match(/^(\s*)/)[1].length;
        if (ind <= runIndent) break;
        // 块内第一行若是命令，必须比 run: 缩进更深（这就是块内容的定义）
        expect(ind, `第 ${j + 1} 行「${line.trim().slice(0, 60)}」从 run 块里掉出来了`).toBeGreaterThan(runIndent);
      }
    }
  });

  it('upload 与 deploy 之间有 artifact 元数据静置步（W-Z525 部署竞态）', () => {
    // 真故障：artifact 上传日志有 ID、大小 15 MB、结论 success，但 deploy-pages 紧接着读时
    // 元数据还没传播完，报「No artifacts named github-pages were found」——不是没上传，是读太早。
    const up = wf.indexOf('actions/upload-pages-artifact');
    const down = wf.indexOf('actions/deploy-pages');
    expect(up, '找不到 upload 步').toBeGreaterThan(0);
    expect(down, '找不到 deploy 步').toBeGreaterThan(up);
    const between = wf.slice(up, down);
    expect(between, 'upload 与 deploy 之间没有静置步，部署会读到尚未传播的 artifact 元数据')
      .toMatch(/Let artifact metadata settle[\s\S]*sleep/);
  });

  it('装配步骤拷齐展示页与 admin 数据产物', () => {
    for (const p of [
      'creative/showcase.html _site/index.html',
      'docs/admin/data/telemetry-summary.json',
      'docs/admin/data/measured-funnel.json',
      'docs/latest.json _site/latest.json',
      'cp -r dist/. _site/game/',
    ]) expect(wf, `装配步骤缺了 ${p}`).toContain(p);
  });

  it('run 块里所有 cp 行的缩进与同块首行一致（反例：混进 6 格与 10 格两种）', () => {
    const lines = wf.split('\n');
    const inRun = new Set();
    let runIndent = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/^(\s*)run:\s*\|\s*$/);
      if (m) { runIndent = m[1].length; inRun.clear(); continue; }
      if (!line.trim()) continue;
      const ind = line.match(/^(\s*)/)[1].length;
      if (ind <= runIndent && !/^\s*run:/.test(line)) { inRun.clear(); continue; }
      if (/^\s*cp /.test(line)) inRun.add(ind);
    }
    expect(inRun.size, `cp 行缩进不一致：${[...inRun].join(', ')}`).toBeLessThanOrEqual(1);
  });
});
