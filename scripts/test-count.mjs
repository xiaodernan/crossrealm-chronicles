/**
 * 全量测试的**分母对账**（W-F3 切片1 的副产物）。
 *
 * ## 为什么需要它
 *
 * 2026-11-11 的实测：同一份代码连跑三次全量，`vitest` 给出的分母是
 * **6203 / 6127 / 6114**，而 `--reporter=json` 给出 **6203**；再跑一次，
 * JSON 也掉到 **6085** —— 少的恰好是 `tests/material-surfaces.test.js` 那 118 例
 * （它单独跑 118/118 全绿）。也就是说：**测试没红，但有一整个文件没跑，而汇总行
 * 看不出来**。
 *
 * 这正是本仓 §8 里那句"分母随工作区漂，读的人就没法判断红绿是不是同一件事"的
 * 另一种形态：分母不再随草稿目录漂，而是**偶尔整个文件消失**，屏幕上只剩一个
 * 更小的绿灯。汇总行不会骗人 —— 它只是没有把"少了一个文件"当作失败。
 *
 * ## 它做什么
 *
 * 跑一次全量（JSON 报告），然后把报告里的文件集合与 `tests/*.test.js` 的磁盘集合
 * **双向对账**：少跑了哪个文件、多报了哪个文件，都点名；再核对用例总数。
 * 任何一边对不上就以 1 退出。
 *
 * ## 用法
 *
 *   npm run test:verify
 *
 * 这不是"又一个测试"：跑在测试**外面**的东西才看得见"有测试没被跑"。
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const 根 = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const 报告目录 = join(根, '.tmp-vitest-run');
const 报告路径 = join(报告目录, 'report-verify.json');

/** 磁盘上的测试文件（与 `vite.config.js` 的 include 同口径：`tests/` 顶层） */
function 磁盘文件() {
  return readdirSync(join(根, 'tests'))
    .filter((f) => f.endsWith('.test.js') || f.endsWith('.spec.js'))
    .map((f) => `tests/${f}`)
    .sort();
}

function 归一(p) {
  return p.replace(/\\/g, '/').replace(/^.*?3a大作\//, '');
}

function main() {
  if (!existsSync(报告目录)) mkdirSync(报告目录, { recursive: true });
  // 与 `npm test` 同一个环境口径：临时目录落在仓内（本机 fs shim 对系统临时目录会 EPERM）
  const env = { ...process.env, TMPDIR: 报告目录, TMP: 报告目录, TEMP: 报告目录 };
  const r = spawnSync(
    process.execPath,
    [join(根, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--reporter=json', `--outputFile=${报告路径}`],
    { cwd: 根, env, stdio: 'inherit' },
  );

  if (!existsSync(报告路径)) {
    console.error('\n[分母对账] 没拿到 JSON 报告 —— vitest 没跑起来（上面的输出是原因）');
    process.exit(2);
  }
  const 报告 = JSON.parse(readFileSync(报告路径, 'utf8'));
  const 跑了 = 报告.testResults.map((f) => 归一(f.name)).sort();
  const 该跑 = 磁盘文件();

  const 少跑 = 该跑.filter((f) => !跑了.includes(f));
  const 多报 = 跑了.filter((f) => !该跑.includes(f));

  console.log('\n[分母对账]');
  console.log(`  磁盘 ${该跑.length} 个文件 / 报告 ${跑了.length} 个文件`);
  console.log(`  用例 ${报告.numTotalTests}（通过 ${报告.numPassedTests}，失败 ${报告.numFailedTests}）`);

  let 坏 = false;
  if (少跑.length) {
    坏 = true;
    console.error(`  ✗ 有 ${少跑.length} 个文件**在磁盘上但没跑**：`);
    for (const f of 少跑) console.error(`      ${f}`);
    console.error('    这不是"测试变少了"，是汇总行没把"少跑一个文件"当失败 —— 重跑或单独跑它。');
  }
  if (多报.length) {
    坏 = true;
    console.error(`  ✗ 有 ${多报.length} 个文件被报告了但不在 tests/ 里：`);
    for (const f of 多报) console.error(`      ${f}`);
  }
  if (报告.numFailedTests > 0) 坏 = true;

  const vitest退出 = r.status ?? 1;
  if (坏 || vitest退出 !== 0) {
    console.error(`\n[分母对账] 未过（vitest 退出码 ${vitest退出}）`);
    process.exit(1);
  }
  console.log('  ✓ 分母与磁盘一致，全绿');
}

main();
