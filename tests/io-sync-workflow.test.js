import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * W-Z504 io 仓多个 sync cron 并行推送，纯 git push 会被非快进拒绝（实测 failure），
 * 每个会提交 master 的 sync 工作流都必须在 push 前 rebase。
 *
 * W-Z515 三处改动，都是这一门自己咬到自己之后加的：
 * - **路径不再写死在某一台机器上**。原来是 `D:\\xiaodernan.github.io\\...`，换一台就是 ENOENT，
 *   而这条门的价值恰恰在于它读的是**对面那个仓的真文件**。现在默认按"本仓旁边的兄弟目录"解析
 *   （这台机器上正是这个形状），别的位置用 `IO_REPO_PATH` 指；对面不在场时**如实跳过**并打出原因。
 * - **名册改成从对面目录现推**，不再是这里手抄的四条文件名。手抄的名册会过期：对面新加一条
 *   sync，本门一条都不会红，"每条 sync 都 rebase 过了"就变成抄写那天的真话（B172 同一族）。
 *   现在双向对账：漏登记要点名，登记了却找不到文件也要点名。
 * - **判据不再被注释骗过去**。第一版把发现条件放宽成"文本里有 `git push`"，结果抓到
 *   `sync-crossrealm.yml` 第 62 行那句注释「纯 git push 会被非快进拒绝」——它把行序判反了。
 *   现在只认**命令行**：行首（去缩进）是 `git push` / `git pull --rebase`，且不是注释行。
 *   注释里提到哪个命令不等于那一格执行了它。
 */

const ioRoot = process.env.IO_REPO_PATH ?? resolve(process.cwd(), '..', 'xiaodernan.github.io');
const wfDir = join(ioRoot, '.github', 'workflows');
const present = existsSync(wfDir);
if (!present) {
  console.info(`io-sync-workflow：对面仓不在场（${wfDir}），本门跳过 —— 用 IO_REPO_PATH 指向它才能真跑。`);
}

const isCmd = (line, verb) => !/^\s*#/.test(line) && new RegExp(`^\\s*${verb}\\b`).test(line);
const pushLine = (s) => s.split('\n').findIndex((l) => isCmd(l, 'git push'));
const rebaseLine = (s) => s.split('\n').findIndex((l) => isCmd(l, 'git pull --rebase'));

/** 从对面目录数出"会 push 的 sync 工作流"，不在这里抄名单。 */
const discoveredSyncs = present
  ? readdirSync(wfDir)
    .filter((f) => /^sync-.*\.ya?ml$/.test(f))
    .filter((f) => pushLine(readFileSync(join(wfDir, f), 'utf8')) >= 0)
    .sort()
  : [];

/** 这条门在册的账（对面多一条就得补登记，见上面的双向对账）。 */
const DECLARED = [
  'sync-career-os.yml',
  'sync-crossrealm.yml',
  'sync-gh-languages.yml',
  'sync-minicc.yml',
  'sync-nexus-platform.yml',
];

describe('io sync 工作流 rebase 门禁（W-Z504）', () => {
  it.skipIf(!present)('名册与对面目录双向对账（新加的 sync 不许没人管）', () => {
    const unregistered = discoveredSyncs.filter((f) => !DECLARED.includes(f));
    const missing = DECLARED.filter((f) => !discoveredSyncs.includes(f));
    expect(unregistered, `io 仓里有 ${unregistered.join(', ')} 会 push 却没登记进这条门`).toEqual([]);
    expect(missing, `登记了但对面找不到（或它已经不再 push）：${missing.join(', ')}`).toEqual([]);
  });

  for (const name of DECLARED) {
    it.skipIf(!present)(`${name} 在 git push 前先 git pull --rebase`, () => {
      const s = readFileSync(join(wfDir, name), 'utf8');
      const push = pushLine(s);
      const rebase = rebaseLine(s);
      expect(push, `${name} 里没有一条真的 git push 命令行`).toBeGreaterThanOrEqual(0);
      expect(rebase, `${name} 缺 git pull --rebase`).toBeGreaterThanOrEqual(0);
      expect(rebase, `${name} 的 rebase 排在 push 之后（第 ${rebase + 1} 行 vs 第 ${push + 1} 行）`).toBeLessThan(push);
    });
  }

  // 反面证据：这条门不是恒绿的 —— 把 rebase 那一行摘掉必须转红。
  it.skipIf(!present)('把 rebase 那一行摘掉，判定必须转红（而不是读不到就默认放行）', () => {
    const s = readFileSync(join(wfDir, 'sync-crossrealm.yml'), 'utf8');
    const stripped = s.replace(/\n[ \t]*git pull --rebase[^\n]*/, '');
    expect(stripped, '搜索串和对面文件脱钩了：这一下替换什么都没删掉').not.toBe(s);
    expect(rebaseLine(stripped), '摘掉之后仍然读得到 rebase —— 夹具没真的生效').toBe(-1);
    expect(pushLine(stripped)).toBeGreaterThanOrEqual(0);
  });

  it('名册本身非空（对面在场时读空了要红，不许空集一路绿灯）', () => {
    if (!present) return;
    expect(discoveredSyncs.length, '一条 sync 工作流都没数出来，这条门就没在量任何东西').toBeGreaterThan(0);
  });
});
