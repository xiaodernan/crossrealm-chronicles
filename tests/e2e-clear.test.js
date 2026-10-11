/**
 * 无头 E2E 自动通关的门禁 —— W-D4 切片3。
 *
 * `npm run e2e` 起真游戏、驱动 `startFullDemo()` 把整条主线走一遍。这条门禁守两样：
 *
 * ① **预算表不许被放松**（与 `tests/perf-smoke.test.js` 同一把尺）：把 `maxFrames` 调大
 *    或把 `requireCompleted` 关掉，门禁就变成了"跑完就算过"的摆设；
 * ② **那三个让读数可信的装置不许被拆掉** —— 固定步长、手工推帧、动态端口。
 *    它们看着像实现细节，其实是"这条门禁说的话算不算数"的全部依据：
 *    拆掉固定步长 → 读数随机器快慢漂；改回 rAF → 无头页被饿死，读的是节流不是游戏；
 *    改回写死端口 → 连跑两次必有一次红（实测过）。拆掉"通关断言"更是直接静默通过。
 *
 * 这里按**结构**断言（源码里有那几行），因为脚本跑一次要几十秒、要起浏览器 ——
 * 把它塞进 `npm test` 会让整个套件慢一个量级，那正是 W-D4 把它单列成 `npm run e2e` 的理由。
 * 真读数由 `npm run e2e` 出（实测：5160 帧 / 86 秒模拟 / questIndex=32 / 主线 33 步 / 0 异常，
 * 连跑三次逐帧相同）。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_BUDGETS } from '../scripts/e2e-budgets.mjs';

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'e2e-clear.mjs');
const 源文 = existsSync(SCRIPT) ? readFileSync(SCRIPT, 'utf8') : '';

/**
 * 四条判据写成函数 —— 这样它们能同时喂给真源码（必须全过）与一份**人造坏脚本**（必须全挂）。
 * 不这么写的话，"判据永远返回 true"与"源码真的没问题"在读数上一模一样。
 */
const 判据 = {
  固定步长在: (s) => s.includes('window.__game.clock.getDelta = () => 1 / 60'),
  // 比的是**两条语句**的先后（不是整份源码里两个词的位置）：头注里两个词都出现过，
  // 拿全文 indexOf 比会拿注释当代码 —— 第一版就这么红的。
  先换步长再起跑: (s) => {
    const 补丁 = s.indexOf('window.__game.clock.getDelta = () => 1 / 60');
    const 起跑 = s.indexOf('qa.startFullDemo()');
    return 补丁 >= 0 && 起跑 >= 0 && 补丁 < 起跑;
  },
  手工推帧: (s) => s.includes('window.__game.update()'),
  不用rAF: (s) => !s.includes('requestAnimationFrame'),
  端口动态: (s) => s.includes('freePort') && !/const (VITE|CDP)_PORT = \d/.test(s),
  通关断言在: (s) => s.includes('requireCompleted'),
  失败退出码在: (s) => s.includes('process.exit(failures)'),
  失败信息可排查: (s) => s.includes('主线没走完') && s.includes('questIndex=') && s.includes('耗尽预算'),
};

describe('无头 E2E 自动通关（W-D4 切片3）', () => {
  it('脚本在，npm script 接上了（没接线的门禁只有写它的人会跑）', () => {
    expect(existsSync(SCRIPT), 'scripts/e2e-clear.mjs 不在了').toBe(true);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.e2e, 'package.json 里没有 "e2e" 脚本').toBe('node scripts/e2e-clear.mjs');
  });

  it('预算表按值钉死：只许收紧，不许放松（实测 5160 帧 / 86 秒模拟，见脚本头注）', () => {
    expect(E2E_BUDGETS.maxFrames, '推帧预算被放松（实测 5160，门禁值 12000）').toBeLessThanOrEqual(12000);
    expect(E2E_BUDGETS.exceptions).toBe(0);
    expect(E2E_BUDGETS.requireCompleted, '关掉"必须通关"这条，门禁就废了').toBe(true);
    expect(E2E_BUDGETS.minMainlineSteps, '分母守卫被放松（实测主线 33 步）').toBeGreaterThanOrEqual(30);
    // 每一项都得是正数 —— 写成 0，门禁就在空转
    expect(E2E_BUDGETS.maxFrames).toBeGreaterThan(0);
    expect(E2E_BUDGETS.minMainlineSteps).toBeGreaterThan(0);
  });

  it('三个让读数可信的装置都在（固定步长 / 手工推帧 / 动态端口）', () => {
    expect(判据.固定步长在(源文), '固定步长那一步不见了 —— 读数不再可复现').toBe(true);
    expect(判据.先换步长再起跑(源文), '先起跑后换步长 —— 前几步仍按真实 dt 走').toBe(true);
    expect(判据.手工推帧(源文), '推帧那一句不见了').toBe(true);
    expect(判据.不用rAF(源文), '用了 rAF —— 无头页的帧由合成器供给，那种读数量的是节流不是游戏').toBe(true);
    expect(判据.端口动态(源文), '端口又写死了 —— 上一轮 Chrome 没退干净时连跑两次必红').toBe(true);
  });

  it('不许静默通过：通关断言与失败退出码都在，且失败信息点得出卡在哪一步', () => {
    expect(判据.通关断言在(源文), '通关断言不见了 —— 那样"跑完就算过"').toBe(true);
    expect(判据.失败退出码在(源文), '失败退出码不见了').toBe(true);
    // 只报一句"没通过"等于把排查成本推给下一个人：必须带上"走到第几步 / 第几章"
    expect(判据.失败信息可排查(源文), '失败信息里看不出卡在哪一步').toBe(true);
  });

  it('判据与执行分家：可执行脚本不许导出东西，判据在无副作用的表里', () => {
    // 这一条防的是本文件自己踩过的坑：一开始 `E2E_BUDGETS` 定义在 `e2e-clear.mjs` 里，
    // 于是 `import` 它 = 在 `npm test` 里真起一个浏览器把 E2E 跑一遍（实测 151 秒，
    // 外加一条 `process.exit unexpectedly called`）。`perf-smoke.mjs` 至今是这个形状。
    expect(源文, 'e2e-clear.mjs 又导出了东西 —— 下一个人会 import 它，然后单测里跑起浏览器')
      .not.toMatch(/^export /m);
    expect(existsSync(join(ROOT, 'scripts', 'e2e-budgets.mjs')), '预算表模块不在了').toBe(true);
  });

  it('反向控制：同一批判据喂给人造坏脚本，必须全部报错（自证判据不是空转）', () => {
    // 三处坏：拆掉固定步长、改回 rAF、端口写死、并把"必须通关"关掉
    const 坏 = 源文
      .replace('window.__game.clock.getDelta = () => 1 / 60; true', '')
      .replace('window.__game.update()', 'requestAnimationFrame(() => window.__game.update())')
      .replace('const VITE_PORT = await freePort();', 'const VITE_PORT = 5322;')
      .replace('requireCompleted: true', 'requireCompleted: false');
    expect(判据.固定步长在(坏), '拆掉固定步长却仍判为"在"').toBe(false);
    expect(判据.先换步长再起跑(坏), '拆掉固定步长却仍判为"顺序对"').toBe(false);
    expect(判据.不用rAF(坏), '改回 rAF 却仍判为"没用"').toBe(false);
    expect(判据.端口动态(坏), '端口写死却仍判为"动态"').toBe(false);
    // 预算表那两条是**按值**判的，坏脚本改的是源码文本，所以另拿一份改过的值来验
    expect({ ...E2E_BUDGETS, requireCompleted: false }.requireCompleted, '关掉通关断言却仍判为真').toBe(false);
  });
});
