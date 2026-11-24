import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 全仓 workflow 的 run 块缩进门禁（W-Z522 泛化）。
 *
 * W-Z522 真故障：pages.yml 四条 cp 掉了缩进 → YAML 解析失败 → 三次部署 0 秒红，
 * 而 CI 的 Test 门只跑 JS，照样全绿。同类错误可以发生在任何 workflow 的任何 run 块，
 * 所以不能只守 pages.yml 一个文件——把判据铺到整个 .github/workflows/。
 */
const wfDir = join(process.cwd(), '.github', 'workflows');
const files = readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f));

/** 找出「命令行的缩进 <= 它上面最近那个 run: 的缩进」——那就是从块里掉出来了 */
function fallenOutCommands(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)run:\s*\|?\s*/);
    if (!m) continue;
    const runIndent = m[1].length;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const ind = line.match(/^(\s*)/)[1].length;
      if (ind <= runIndent) {
        if (/^\s*(cp |mkdir |echo |node |npm |pwsh |git |cat |mv |rm |set -|python |java )/.test(line)) {
          out.push(`L${j + 1}: "${line.trim().slice(0, 70)}" (indent ${ind} <= run ${runIndent})`);
        }
        break;
      }
    }
  }
  return out;
}

describe('全仓 GitHub Actions workflow 的 run 块缩进', () => {
  it('至少扫到 5 个 workflow（防空转）', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it('任何 workflow 的 run 块里都不许有掉出缩进的命令行', () => {
    const bad = [];
    for (const f of files) {
      const src = readFileSync(join(wfDir, f), 'utf8');
      for (const issue of fallenOutCommands(src)) bad.push(`${f} ${issue}`);
    }
    expect(bad, `这些命令行从 run 块里掉出来了：\n${bad.join('\n')}`).toEqual([]);
  });

  it('反向控制：把一条命令去缩进后必须被判红（证明判据不是恒绿）', () => {
    const sample = [
      'jobs:',
      '  deploy:',
      '    steps:',
      '      - name: Assemble',
      '        run: |',
      '          cp a b',
      '      cp c d',   // 掉出来了
      '      - name: Next',
      '        run: echo hi',
    ].join('\n');
    expect(fallenOutCommands(sample)).toContainEqual(
      expect.stringContaining('cp c d'),
    );
    const good = sample.replace('      cp c d', '          cp c d');
    expect(fallenOutCommands(good)).toEqual([]);
  });
});
