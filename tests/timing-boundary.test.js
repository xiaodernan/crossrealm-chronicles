import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 门禁：游戏逻辑计时必须走主循环（B39）。
 *
 * 为什么值得单独立一条用例：
 * 这条规矩第一次是靠人肉排查 28 处 `setTimeout` 落地的，只要没人钉住，
 * 下一次随手写的 `setTimeout` 就会让它慢慢退化回去 —— 而它的症状
 * （暂停时提示照跳、hitstop 期间横幅照弹、系统 dispose 后回调打到失效对象上）
 * 又都很难在功能测试里被发现。
 *
 * 允许的例外只有两类，且必须写明理由：
 * 1. `src/audio/**` —— 音序是"给 Web Audio 调度时间"的领域问题，
 *    与游戏世界的时间缩放无关，暂停时由 `AudioManager` 自行挂起；
 * 2. 注释里出现的 `setTimeout`（说明性文字）。
 */

const SRC = join(process.cwd(), 'src');

/** 允许保留 setTimeout 的目录（相对 src/） */
const ALLOWED_DIRS = ['audio'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** 剥离行注释、块注释与字符串字面量，只留下真正的代码 */
function stripNonCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

describe('游戏逻辑计时门禁（B39）', () => {
  const files = walk(SRC);

  it('src/ 下除 audio/ 外不得出现 setTimeout / setInterval', () => {
    const offenders = [];
    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      if (ALLOWED_DIRS.some((d) => rel.startsWith(`${d}/`))) continue;
      const code = stripNonCode(readFileSync(file, 'utf8'));
      // setInterval 没有任何例外：定时器比 setTimeout 更难撤销
      if (/\bsetInterval\s*\(/.test(code) || /\bsetTimeout\s*\(/.test(code)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('裁决器本身反过来必须能被主循环推进（engine/Scheduler.js 无 DOM/定时器依赖）', () => {
    const code = stripNonCode(readFileSync(join(SRC, 'engine/Scheduler.js'), 'utf8'));
    expect(code).not.toMatch(/\bsetTimeout\s*\(/);
    expect(code).not.toMatch(/\bsetInterval\s*\(/);
    expect(code).not.toMatch(/requestAnimationFrame/);
    expect(code).not.toMatch(/\bdocument\b/);
    expect(code).not.toMatch(/\bwindow\b/);
  });

  it('主循环确实每帧推进调度器（否则调度器只是个好看的空壳）', () => {
    const game = readFileSync(join(SRC, 'core/Game.js'), 'utf8');
    expect(game).toMatch(/scheduler\.update\(/);
    expect(game).toMatch(/from '\.\.\/engine\/Scheduler\.js'/);
  });

  it('调度器用 rawDt 推进：不受 hitstop / 慢动作影响', () => {
    const game = readFileSync(join(SRC, 'core/Game.js'), 'utf8');
    const line = game.split('\n').find((l) => l.includes('scheduler.update('));
    expect(line).toBeTruthy();
    // 必须是 rawDt（本帧真实时长），不是被 timeScale 缩过的 dt
    expect(line).toMatch(/scheduler\.update\(rawDt\)/);
  });
});
