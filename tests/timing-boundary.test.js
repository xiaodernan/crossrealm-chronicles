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

  /*
   * ── rAF 白名单（修 B43）──
   *
   * `setTimeout` 归零之后，"绕过主循环的时间"还剩另一条路：自己 `requestAnimationFrame` 递归。
   * 它的病和硬编码 dt 是同一个 —— 寿命按**帧数**走而不是按秒走，144Hz 下特效提前谢幕，
   * 且完全不听 hitstop / 暂停。`ExecutionEffects` 的三条循环与 `WeatherSystem` 的雨滴涟漪
   * 就是这么写的，已经全部改成主循环 dt（见 `tests/effect-timing.test.js`）。
   *
   * 这里留 4 个例外，每个都必须自带 `rAF-EXCEPTION` 标记：
   * `core/Game.js` 是主循环本身；另外三处是"给 CSS 过渡制造一次绘制间隔"，
   * 量的是浏览器的一次绘制，不是游戏世界的时间。
   * 要求成对出现（名单里有 + 代码里有标记）是为堵住两条退化路径：
   * 悄悄新增一处 rAF，以及把标记注释删掉而代码留着。
   */
  const RAF_ALLOWLIST = {
    'core/Game.js': '主循环本身',
    'ui/Dialog.js': 'toast 的 CSS 过渡需要一次绘制间隔',
    'effects/ExecutionSkipBurst.js': '跳过横幅的淡出需要一次绘制间隔',
    'cinematic/CombatCameraDirector.js': '闪光层的淡出需要一次绘制间隔',
  };
  const MARKER = 'rAF-EXCEPTION';

  it('src/ 内除白名单 4 处外没有 requestAnimationFrame', () => {
    const offenders = [];
    const found = new Set();
    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      const code = stripNonCode(readFileSync(file, 'utf8'));
      const n = (code.match(/\brequestAnimationFrame\s*\(/g) ?? []).length;
      if (!n) continue;
      found.add(rel);
      if (!(rel in RAF_ALLOWLIST)) offenders.push(`${rel}（${n} 处，未登记）`);
      else if (!readFileSync(file, 'utf8').includes(MARKER)) offenders.push(`${rel}（在名单里，但缺 ${MARKER} 标记）`);
    }
    expect(offenders).toEqual([]);
    // 名单也不能养僵尸条目：登记了却已经没有 rAF 的文件必须从名单里删掉
    expect([...found].sort()).toEqual(Object.keys(RAF_ALLOWLIST).sort());
  });

  /**
   * 白名单里那三处"绘制间隔"必须只 rAF 一次。
   * 递归回来就是 B43 的原始形态：一条自建的时间轴。
   */
  it('白名单里的绘制间隔例外没有递归自己', () => {
    for (const rel of Object.keys(RAF_ALLOWLIST)) {
      if (rel === 'core/Game.js') continue; // 主循环当然递归
      const code = stripNonCode(readFileSync(join(SRC, rel), 'utf8'));
      const calls = (code.match(/\brequestAnimationFrame\s*\(/g) ?? []).length;
      expect(calls, `${rel} 出现 ${calls} 次 rAF，例外应当是一次`).toBe(1);
    }
  });

  /*
   * 落点顺序也是语义的一部分：`scheduler.update(rawDt)` 在 `canPlay` 那道暂停门控
   * **之前**，所以游戏内暂停时 UI 与演出的延时照常到期（它们量的是真实观看时间），
   * 而"不偷偷跑完"靠的是后台标签页里 rAF 停摆。这条规矩若被反着挪一行，
   * 症状是"打开背包时任务提示全部冻结"—— 没人会为此写功能测试，所以在这里钉住。
   */
  it('调度器的推进点在暂停门控之前（UI 节奏量的是真实时间）', () => {
    const lines = readFileSync(join(SRC, 'core/Game.js'), 'utf8').split('\n');
    const sched = lines.findIndex((l) => l.includes('scheduler.update('));
    const gate = lines.findIndex((l, i) => i > sched && l.includes('const canPlay'));
    expect(sched).toBeGreaterThanOrEqual(0);
    expect(gate).toBeGreaterThan(sched);
  });
});
