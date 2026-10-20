/**
 * 性能冒烟门禁的门禁 —— W-D4 切片2（切片3 把判据搬进无副作用模块）。
 *
 * `npm run perf` 起真游戏推真帧，量逻辑价（update）与全帧价。预算表是它红绿的唯一依据，
 * 而"把预算改松"和"把脚本删了"是同一种静默腐烂 —— 这里直接 **import 预算表**按值断言：
 * 数值只能比这里的上限更严，不能更松；接线（npm script）也钉住。
 *
 * **注意 import 的是 `perf-budgets.mjs` 而不是 `perf-smoke.mjs`**：后者"导入即执行"
 * （顶层起 vite 与 Chrome），import 它等于在 `npm test` 里跑一遍性能冒烟 ——
 * 那是全量套件里那条 `Error: process.exit unexpectedly called with "0"`
 * （源自 `scripts/perf-smoke.mjs`）的来历。下面有一条判据钉住这个分家。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PERF_BUDGETS } from '../scripts/perf-budgets.mjs';

const ROOT = process.cwd();
const 脚本源 = existsSync(join(ROOT, 'scripts', 'perf-smoke.mjs'))
  ? readFileSync(join(ROOT, 'scripts', 'perf-smoke.mjs'), 'utf8') : '';

/**
 * **结构化**预算表（值不是数，是一张表）—— 它们各有自己的门禁。
 *
 * 写这张名单的原因是：W-C2 切片4 把 `drawCalls` 挂进预算表之后，本文件那条
 * "每一项都得是正数"的循环当场红了（`actual value must be number or bigint, received "object"`）。
 * 当时有两条路：① 放宽循环，把对象当数字放过（**假绿**：多挂一张没门禁的表也绿）；
 * ② 显式登记结构化表，并要求**登记的名字与实际的结构化键一一对应**。
 * 选 ②：加一张新表却不写它的门禁 ⇒ 当场红（下面那条反面腿）。
 */
const 结构化预算表 = ['drawCalls'];

describe('性能冒烟（W-D4 切片2）', () => {
  it('脚本在，npm script 接上了（没接线的门禁只有写它的人会跑）', () => {
    expect(existsSync(join(ROOT, 'scripts', 'perf-smoke.mjs')), 'perf-smoke.mjs 不在了').toBe(true);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.perf, 'package.json 里没有 "perf" 脚本').toBe('node scripts/perf-smoke.mjs');
  });

  it('判据与执行分家：可执行脚本不许导出东西（导出 = 有人会 import 它 = 单测里跑起浏览器）', () => {
    expect(脚本源, 'perf-smoke.mjs 又导出了东西').not.toMatch(/^export /m);
    expect(脚本源, 'perf-smoke.mjs 没有从无副作用的表里取预算').toContain("from './perf-budgets.mjs'");
    expect(existsSync(join(ROOT, 'scripts', 'perf-budgets.mjs')), '预算表模块不在了').toBe(true);
  });

  it('预算表按值钉死：只许收紧，不许放松（基线实测 2026-10-07，见脚本头注）', () => {
    expect(PERF_BUDGETS.updateAvgMs, 'update 平均预算被放松（基线 ~7ms，门禁值 40）').toBeLessThanOrEqual(40);
    expect(PERF_BUDGETS.updateP95Ms, 'update p95 预算被放松（基线 ~10ms，门禁值 80）').toBeLessThanOrEqual(80);
    expect(PERF_BUDGETS.frameAvgMs, '全帧预算被放松（软渲染基线 ~150ms，灾难护栏 600）').toBeLessThanOrEqual(600);
    expect(PERF_BUDGETS.heapMb, '堆预算被放松（实测 ~77MB，护栏 1200）').toBeLessThanOrEqual(1200);
    expect(PERF_BUDGETS.exceptions).toBe(0);
    // 每一项都得是正数 —— 预算格写成 0 或负数，门禁就在空转
    for (const [k, v] of Object.entries(PERF_BUDGETS)) {
      if (k === 'exceptions') continue;
      if (结构化预算表.includes(k)) {
        // 结构化表不在这里按值量（它有自己的门禁），但它得**真的是一张表**
        expect(v, `结构化预算 "${k}" 不是一张表`).toBeTypeOf('object');
        expect(v, `结构化预算 "${k}" 是空的`).not.toBeNull();
        continue;
      }
      expect(v, `预算 "${k}" 不是正数`).toBeGreaterThan(0);
    }
  });

  it('反面：结构化预算表必须逐个登记（多挂一张没门禁的表不许绿）', () => {
    // 名单是"哪些表另有门禁"的**唯一**答案：实际结构化键与名单不一致 ⇒ 当场红。
    // 少了它，上面那条循环会把一张没人验的表默默放过去 —— 那正是"假绿"的样子。
    const 实际 = Object.entries(PERF_BUDGETS)
      .filter(([, v]) => typeof v === 'object' && v !== null)
      .map(([k]) => k)
      .sort();
    expect(实际, '有结构化预算表没有登记（或登记了不存在的表）').toEqual([...结构化预算表].sort());
  });

  it('量的是"推帧"而不是真实 rAF（无头合成器会饿死 rAF，那种读数是节流不是性能）', () => {
    const 源码 = readFileSync(join(ROOT, 'scripts', 'perf-smoke.mjs'), 'utf8');
    expect(源码).toContain('window.__game.update()');
    expect(源码).toContain('window.__game.render()');
  });

  it('开跑前先确认两个口是空的 —— 占口的外来进程会让这一轮读到**别人的**页面', () => {
    /**
     * 2026-10-20 连着两轮假红：一轮"Chrome CDP 口没起来"、一轮"游戏 30 秒内没起来"，
     * 代码没动过。查下来是上一轮泄漏的无头 Chrome 还占着 9424 —— Chrome 发现口被占时
     * **不报错，只是不开这个口**，而 `waitForHttp` 探到的是**任何**在该口上应答的进程。
     * 最坏的一种是探通了别人的浏览器/别人的 vite，于是"游戏没起来"红在一次根本没被改过的
     * 代码上（跟 `--host 127.0.0.1` 那条是同一族：红的原因必须当场可归，不能靠人猜）。
     */
    expect(脚本源, '脚本没有开跑前的占口检查').toMatch(/async function 口被占/);
    expect(脚本源, '占口检查没有报出口号').toMatch(/拒绝开跑：这两个口不是空的/);
    // 两个口都得查：只查 CDP 等于放任外来 vite 把读数换成另一个工作树的构建
    expect(脚本源, '占口检查漏了 dev 口').toMatch(/\['dev 口 \(vite\)', VITE_PORT\]/);
    expect(脚本源, '占口检查漏了 CDP 口').toMatch(/\['CDP 口 \(Chrome\)', CDP_PORT\]/);
    // **顺序**：拒必须在任何 spawn 之前 —— 先起后查等于已经污染了
    expect(脚本源.indexOf('拒绝开跑'), '找不到占口拒').toBeGreaterThan(0);
    expect(脚本源.indexOf('拒绝开跑'), '占口检查排在 vite 起口之后，等于没查').toBeLessThan(脚本源.indexOf('const vite = spawn('));
    expect(脚本源.indexOf('拒绝开跑'), '占口检查排在 Chrome 起口之后，等于没查').toBeLessThan(脚本源.indexOf('const chrome = spawn('));
    /**
     * 占法要分两种，否则**自己人**也会被拒：`taskkill /F` 之后上一轮的 Chrome 关掉 socket
     * 还要一点时间，那期间连得上但答不出话（2026-10-20 连跑两轮实测撞上，第二轮红）。
     * 应答得了的是别人的进程（等多久都不是我的）⇒ 立即拒；答不出话的是正在断气的自己人
     * ⇒ 给一个**有上限**的等待窗口，过点仍占着照样拒 —— 不设上限就是给 CI 埋一个挂住的路径。
     */
    expect(脚本源, '占口检查没有区分"应答的别人"与"正在断气的自己人"').toMatch(/if \(!\/不答话\/\.test\(由\)\) return 由;/);
    expect(脚本源, '给断气的口的等待没有上限（CI 会挂住而不是红）').toMatch(/等了 \$\{Math\.round\(等待毫秒 \/ 1000\)\} 秒仍在听/);
    expect(脚本源, '等待窗口不是有界循环').toMatch(/if \(Date\.now\(\) >= 截止\) return/);
  });

  it('页面里抛的那句话要原样带出来（截 JSON 会正好切掉异常自己的话）', () => {
    // 第一次真跑红在 draw call 腿，但日志只有 `{"exceptionId":1,...` 300 字 —— 责任落不到那条拒上。
    expect(脚本源, '页面异常没有取 description（异常原话）').toMatch(/exception\?\.description/);
    expect(脚本源, '页面异常没有带行号').toMatch(/页面内抛错 @/);
  });

  it('收尾拔的是自己那棵树（Windows 上 kill() 只终止一个 PID，Chrome 子进程把口占住）', () => {
    /**
     * 2026-10-20 实测：`npm run perf` 跑完并返回 0 之后，它起的无头 Chrome 仍然 LISTENING 9424
     * —— `child.kill()` 只打主进程，crashpad / renderer / utility 那些子进程把它钉住不走。
     * 于是**下一轮**连到上一轮的浏览器上，红成"游戏 30 秒内没起来"。
     * 所以钉三件事：① 用 `taskkill /T /F`（整棵树），② 只吃本次 spawn 的 PID（不许按进程名搜，
     * 那会打到别人并行跑的 Chrome 上），③ 先拔树再删临时 profile（否则删不动，静默留着）。
     */
    expect(脚本源, '收尾没有用 taskkill 整棵树（/T /F）').toMatch(/spawnSync\('taskkill', \['\/PID', String\(子进程\.pid\), '\/T', '\/F'\]/);
    expect(脚本源, '还在用裸 kill() 收 Chrome').not.toMatch(/try \{ chrome\.kill\(\); \} catch/);
    expect(脚本源, '还在用裸 kill() 收 vite').not.toMatch(/try \{ vite\.kill\(\); \} catch/);
    expect(脚本源.indexOf('spawnSync'), '拔树排在删临时目录之后：目录被浏览器钉着删不动').toBeLessThan(脚本源.indexOf('rmSync(profileDir'));
    // PID 只能来自本次 spawn（按名字搜进程会杀到别人的浏览器）
    expect(脚本源, '按进程名搜杀（会打到别人的 Chrome 上）').not.toMatch(/taskkill[^;]*\/IM\b/);
  });
});
