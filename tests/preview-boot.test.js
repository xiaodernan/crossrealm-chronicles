/**
 * Preview-boot 门禁测试——生产构建在浏览器里能不能开机这件事的本机哨兵。
 *
 * 单测只管两件事，真浏览器真跑的腿是 `npm run preview:boot`：
 *   ① 脚本能被解析（`node --check`）——页内驱动整段包在模板字符串里，
 *      注释里出现一个反引号就会提前截断它，而此前所有腿都只把脚本当**文本**读；
 *   ② 接线腿：脚本 import 了 CDP 真源（cdp-channel）、收尾 taskkill 整棵树、
 *      package.json 的 `preview:boot` 指向这个脚本。
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const 脚本路径 = join(ROOT, 'scripts', 'preview-boot.mjs');
const 源文 = readFileSync(脚本路径, 'utf8');

describe('preview-boot：接线腿（脚本真能解析、真接 CDP 真源、入口真指向它）', () => {
  it('脚本通过 node --check', () => {
    expect(() => execFileSync(process.execPath, ['--check', 脚本路径], { stdio: 'pipe' }))
      .not.toThrow();
  });

  it('脚本 import CDP 真源，不许自己再抄一份管道', () => {
    expect(源文).toMatch(/import\s*\{[^}]*开通道[^}]*\}\s*from\s*'\.\/cdp-channel\.mjs'/);
    expect(源文).not.toMatch(/const pending = new Map/);
  });

  it('收尾 taskkill 拔整棵树（只 kill 主进程会留下 renderer 钉住口和目录）', () => {
    expect(源文).toMatch(/spawnSync\('taskkill', \['\/PID', String\(子进程\.pid\), '\/T', '\/F'\]/);
    expect(源文.indexOf('spawnSync'), '拔树排在删临时目录之前')
      .toBeLessThan(源文.indexOf('rmSync(profileDir'));
  });

  it('package.json 的 preview:boot 指到这个脚本', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['preview:boot']).toBe('node scripts/preview-boot.mjs');
  });

  it('就绪信号写在脚本里：loading 藏起 + start-btn 在 = OK；别把 DEV 的 __game 当就绪', () => {
    expect(源文).toContain("loading?.classList.contains('hidden')");
    expect(源文).not.toMatch(/!!window\.__game/);
  });
});
