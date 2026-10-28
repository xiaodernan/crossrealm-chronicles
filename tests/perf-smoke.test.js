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
import { draw读数问题, cpu读数问题, 覆盖问题, 解析CDP口, 页地址问题, 通道问题, 重载问题, DRAW列, CPU列 } from '../scripts/harness-readings.mjs';

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

  it('开跑前先确认 dev 口是空的 —— 占口的外来 vite 会让这一轮读到**另一个工作树的构建**', () => {
    /**
     * 2026-10-20 连着两轮假红：一轮"Chrome CDP 口没起来"、一轮"游戏 30 秒内没起来"，
     * 代码没动过。查下来是上一轮泄漏的无头 Chrome 还占着 9424 —— Chrome 发现口被占时
     * **不报错，只是不开这个口**，而 `waitForHttp` 探到的是**任何**在该口上应答的进程。
     * 最坏的一种是探通了别人的浏览器/别人的 vite，于是"游戏没起来"红在一次根本没被改过的
     * 代码上（跟 `--host 127.0.0.1` 那条是同一族：红的原因必须当场可归，不能靠人猜）。
     *
     * 切片6b 之后**只剩 dev 口要预检**：CDP 那一侧改由 Chrome 自己挑口（见下一条），
     * "撞口"与"连到别人浏览器"两种失败由构造消失。dev 口不能一起放手 —— 浏览器打开的
     * 就是 `http://127.0.0.1:5321/`，连到外来 vite 读到的是别人的构建，而那仍然会是一次**绿**的红。
     */
    expect(脚本源, '脚本没有开跑前的占口检查').toMatch(/async function 口被占/);
    expect(脚本源, '占口检查没有报出口号').toMatch(/拒绝开跑：dev 口不是空的/);
    expect(脚本源, 'dev 口不在预检名单里').toMatch(/\['dev 口 \(vite\)', VITE_PORT\]/);
    /**
     * 占法要分两种，否则**自己人**也会被拒：`taskkill /F` 之后上一轮的 vite 关掉 socket
     * 还要一点时间，那期间连得上但答不出话（2026-10-20 连跑两轮实测撞上，第二轮红）。
     * 应答得了的是别人的进程（等多久都不是我的）⇒ 立即拒；答不出话的是正在断气的自己人
     * ⇒ 给一个**有上限**的等待窗口，过点仍占着照样拒 —— 不设上限就是给 CI 埋一个挂住的路径。
     */
    expect(脚本源, '占口检查没有区分"应答的别人"与"正在断气的自己人"').toMatch(/if \(!\/不答话\/\.test\(由\)\) return 由;/);
    expect(脚本源, '给断气的口的等待没有上限（CI 会挂住而不是红）').toMatch(/等了 \$\{Math\.round\(等待毫秒 \/ 1000\)\} 秒仍在听/);
    expect(脚本源, '等待窗口不是有界循环').toMatch(/if \(Date\.now\(\) >= 截止\) return/);
    // **顺序**：拒必须在任何 spawn 之前 —— 先起后查等于已经污染了
    expect(脚本源.indexOf('拒绝开跑'), '找不到占口拒').toBeGreaterThan(0);
    expect(脚本源.indexOf('拒绝开跑'), '占口检查排在 vite 起口之后，等于没查').toBeLessThan(脚本源.indexOf('const vite = spawn('));
    expect(脚本源.indexOf('拒绝开跑'), '占口检查排在 Chrome 起口之后，等于没查').toBeLessThan(脚本源.indexOf('const chrome = spawn('));
  });

  it('CDP 口是 Chrome 自己报的（切片6b）—— 脚本不许再写死一个口去探', () => {
    /**
     * 2026-10-21 一天之内四次 `npm run perf` 红在 `Chrome CDP 口没起来`
     * （`.tmp-wc2s5/perf-r2.log`、`perf-r5.log`、`perf-r7.log`、`perf-nb2.log`，123~126 字节，
     * 退出码 2），代码一次没动。占口预检把这种红变**响**了，但变不**准**：
     * `--remote-debugging-port=9424` 撞口时 Chrome 只是不开这个口，脚本无法分辨
     * "我的浏览器没起来"与"我连到的是别人的浏览器"。后者最坏 —— 读数来自一台我们没起的机器。
     *
     * `=0` 让 Chrome 挑一个真空闲的口，再从**它自己的 stderr** 把口读回来：
     * 口的来源就是我 spawn 的那个进程，两个失败形状一起消失。
     */
    expect(脚本源, 'CDP 口不是交给 Chrome 挑的').toMatch(/const CDP_SPEC = 0;/);
    expect(脚本源, '启动参数里没有 --remote-debugging-port=0').toMatch(/`--remote-debugging-port=\$\{CDP_SPEC\}`/);
    // 写死的口不许回流 —— 只禁"赋值"这一个形状：上面那段历史说明里还得留着 9424 那句话，
    // 把尺子做成"全文不许出现 9424"会先把解释自己踩死（那种腿下一次是被删掉，不是被改对）
    expect(脚本源, '又写回了一个固定的 CDP 口').not.toMatch(/^(const|let|var) CDP_PORT\s*=/m);
    // 口必须从 stderr 读回来（不是探出来的）：两条管道都收，有的构建把 DevTools 行打到 stdout
    expect(脚本源, '没收 Chrome 的 stderr').toMatch(/chrome\.stderr\.on\('data'/);
    expect(脚本源, '没收 Chrome 的 stdout').toMatch(/chrome\.stdout\.on\('data'/);
    expect(脚本源, 'stdio 没开成 pipe（收不到 Chrome 的话）').toMatch(/\{ stdio: \['ignore', 'pipe', 'pipe'\] \}/);
    // 解析住在判据模块里，脚本只调用（判据与执行分家）
    expect(脚本源, '脚本没有 import 解析函数').toMatch(/import \{[^}]*解析CDP口[^}]*\} from '\.\/harness-readings\.mjs'/);
    expect(脚本源, '脚本没有真的调用解析函数').toMatch(/= 解析CDP口\(/);
    // 等待必须有上限，超时要带上 Chrome 原话（"CDP 口没起来"那种无信息的红就是本片要消灭的）
    const 体 = 脚本源.slice(脚本源.indexOf('async function 读CDP口'), 脚本源.indexOf('const cleanup ='));
    expect(体, '找不到读CDP口() 的函数体').toBeTruthy();
    expect(体, '读口没有有界等待（Chrome 起不来会挂住而不是红）').toMatch(/if \(Date\.now\(\) >= 截止\)/);
    expect(体, '读口失败时没把 Chrome 自己的话带出来').toMatch(/它自己的话/);
    // 后续所有 CDP 请求都必须用读回来的那个口
    expect(脚本源, '/json/list 还在用写死的口').toMatch(/127\.0\.0\.1:\$\{CDP口\}\/json\/list/);
    expect(脚本源, '脚本里还有对 CDP 口的 waitForHttp 探测').not.toMatch(/waitForHttp\([^)]*CDP/);
  });

  it('连到的那个页必须是本轮起的页，且事件通道真的在送东西', () => {
    /**
     * "口是从自己孩子的 stderr 读回来的"解决了机器归属，没解决**页归属**：
     * `/json/list` 里挑的是第一个 `type === 'page'`，同一台浏览器里可能有别人开的页。
     * 地址必须落在本进程的 vite 口上，否则十个站点量的是别人的构建。
     *
     * 第二格是 `exceptions` 那条预算的反面：它判的是"0 条"，而"通道一条都没送"与
     * "页面真的没抛"读出来是同一个 0 —— 没有正面见证，这一格可以在通道断了的情况下永远绿。
     *
     * **这两问都问判据模块，不问脚本里的字符串。** 上一版钉的是 `toMatch(/连到的页不是本进程的页/)`
     * 那种"那句话还在不在"的腿，电池臂 A4/A5 把 `if (条件)` 换成 `if (false)` 之后一条都不红 ——
     * 因为拒绝的话住在 if 的**身体**里，条件废了它照样在文件上（2026-10-22 电池：19 臂 2 作废，
     * 就是这两条）。搬进模块之后这里能喂真假两种输入，脚本那侧只钉"确实调用、确实抛"。
     */
    // —— 页归属（真输入必须绿，否则金路自己先红）
    expect(页地址问题('http://127.0.0.1:5199/', 5199), '本轮的页被判成了别人的页').toEqual([]);
    expect(页地址问题('http://127.0.0.1:5199/app.js', 5199), '带路径的本轮页被判成了别人的页').toEqual([]);
    // —— 端口是数字，前缀匹配没有边界：51990 那台服务的页必须咬住
    expect(页地址问题('http://127.0.0.1:51990/', 5199).join('\n'), '51990 的页蒙过了 5199（尾斜杠就是那道边界）')
      .toMatch(/不是本进程的页/);
    expect(页地址问题('http://127.0.0.1:5199', 5199).join('\n'), '光秃秃的 host:port 也算本进程的页')
      .toMatch(/不是本进程的页/);
    expect(页地址问题('about:blank', 5199).join('\n'), 'about:blank（导航还没落地）被判成了本进程的页')
      .toMatch(/不是本进程的页/);
    expect(页地址问题(undefined, 5199).join('\n'), 'location.href 读回来是 undefined 时没有点名')
      .toMatch(/location\.href=\(空\)/);

    // —— 通道自证：数的是"必然会来的东西"，不是"没看到坏东西"
    expect(通道问题({ 执行上下文: 2, 加载完成: 1 }), '真送过事件的通道被判成了断的').toEqual([]);
    expect(通道问题({ 执行上下文: 0, 加载完成: 0 }).join('\n'), '一条事件没送的通道被判成了没抛错')
      .toMatch(/一条事件都没送（执行上下文 0 条）/);
    expect(通道问题({ 执行上下文: NaN, 加载完成: 1 }).join('\n'), '执行上下文读到 NaN 也算送过东西')
      .toMatch(/一条事件都没送/);
    expect(通道问题(undefined).join('\n'), '通道对象压根没建出来时没有点名（会撞裸 TypeError）')
      .toMatch(/执行上下文 undefined 条/);

    // —— 脚本那侧：调用的是这两个判，且不合格就作废整轮
    expect(脚本源, '脚本没有 import 这两个判').toMatch(/import \{[^}]*页地址问题[^}]*通道问题[^}]*\} from '\.\/harness-readings\.mjs'/);
    expect(脚本源, '脚本没有真的问页归属').toMatch(/= 页地址问题\(页地址, VITE_PORT\)/);
    expect(脚本源, '脚本没有真的问通道').toMatch(/= 通道问题\(通道\)/);
    expect(脚本源, '页归属不合格没有作废（只算了一算就丢）').toMatch(/if \(页问\.length\) throw new Error\(/);
    expect(脚本源, '通道不合格没有作废（只算了一算就丢）').toMatch(/if \(通问\.length\) throw new Error\(/);
    expect(脚本源, '没有真的去页里读 location.href').toMatch(/evalJs\('location\.href'\)/);
    expect(脚本源, '/json/list 里没有 page 目标时没有拒（会先撞到一个裸 TypeError）').toMatch(/没有 page 目标/);
    expect(脚本源, '事件计数没有正面来源（谁数的 executionContextCreated）').toMatch(/Runtime\.executionContextCreated/);
    // 见证必须排在测量**之前**：量完三分钟才发现通道是断的，等于白跑
    expect(脚本源.indexOf('const 通问 = 通道问题(通道)'), '找不到通道见证').toBeGreaterThan(0);
    expect(脚本源.indexOf('const 通问 = 通道问题(通道)'), '通道见证排在站点测量之后').toBeLessThan(脚本源.indexOf("const 枢纽 = await 站('枢纽空载'"));
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

/**
 * ## 读数完整性（W-C2 切片6b，#165）
 *
 * 这一组的题眼不在"数好不好"，而在**"这一轮到底量到没量到"**。
 *
 * 预算表那几条判据全是 `x > 预算` 的形状，而 `NaN > 40` 是 false ——
 * "页面里那 240 帧的账根本没交回来"这一轮会**绿**。（2026-10-21 阴影普查在同一条腿上真撞过：
 * hub 那一站的 ms 腿抛错，整站名册差点一起丢掉；那次是我自己写的 try 吞的，
 * 而这把尺子吞的时候连一句红都不报。）draw call 那一腿也只有一条 `阴影 > 0`：
 * `整帧`/`本体` 读到 NaN、`tri` 读到 0、名册八站只交出七行，都照常往下走。
 *
 * 判据住在 `scripts/harness-readings.mjs`（无副作用，能被 import），所以下面每条反面控制都是
 * **真的把坏读数喂给生产判定**，而不是在本文件里再复刻一遍判断。
 * 另有一组"调用点"腿钉住脚本确实问了这三个判 —— 只 import 不调用，等于没有这条门禁。
 */
const 好draw = { 整帧: 278, 本体: 201, 阴影: 77, 三角面: 120000 };
const 好cpu = { frames: 240, updateAvgMs: 4.33, updateP95Ms: 6.2, frameAvgMs: 108.1 };
const 名单 = ['hub', 'fantasy', 'magic'];

describe('读数完整性（切片6b）：每一站每一列都得是数', () => {
  it('反面控制：一条好读数什么都不报（证明下面那些不是恒红）', () => {
    expect(draw读数问题('hub', 好draw), '好读数被 draw 腿判坏（这条门禁会永远红）').toEqual([]);
    expect(cpu读数问题('枢纽空载', 好cpu, 240), '好读数被 CPU 腿判坏').toEqual([]);
    expect(覆盖问题(名单, 名单.map((站) => ({ 站, ...好draw }))), '对得上的名册被判定缺站').toEqual([]);
  });

  it('阴影趟那句因果话还在判据里（搬进模块不许把话弄丢）', () => {
    // 修之前这一条拒写在脚本里；判据搬家之后，那句"两列分家就是假的"必须照旧出得来
    const 问 = draw读数问题('hub', { ...好draw, 阴影: 0, 本体: 好draw.整帧 });
    expect(问.join('\n'), '阴影趟读到 0 没有点名').toMatch(/阴影趟读到 0/);
    expect(问.join('\n')).toMatch(/关阴影没有减少任何 call/);
  });

  it('三列里任何一列读到 NaN / 小数 ⇒ 点名那一列（"这一趟没跑到"）', () => {
    // 这就是那一半个洞：NaN 不会被预算表的 `>` 抓住，只会被"是不是整数"抓住
    for (const 列 of DRAW列) {
      const 问 = draw读数问题('magic', { ...好draw, [列]: NaN });
      expect(问.join('\n'), `${列} 读到 NaN 没有点名`).toMatch(new RegExp(`"${列}" 列不是整数`));
      const 小 = draw读数问题('magic', { ...好draw, [列]: 12.5 });
      expect(小.join('\n'), `${列} 读到小数没有点名（info 只会给整数）`).toMatch(/不是整数/);
    }
    // 这一条**不是**在测"这值是不是 NaN"（那该用 `Number.isNaN`），它测的是那条洞的成因：
    // 预算表整个是 `x > 预算` 的形状，而 NaN 不参与大于 ⇒ "没量到"读出来就是"达标"。
    // `Number('…')` 就是那一页没交账时读回来的东西（undefined 走 `Number` 也是 NaN）。
    const 没交账 = Number(undefined);
    expect(没交账 > PERF_BUDGETS.frameAvgMs, '非数竟然过不了这条洞（前提变了，上面的判据要重看）').toBe(false);
  });

  it('整帧或本体读到 0 ⇒ "没量到"，不许当成达标', () => {
    expect(draw读数问题('void', { ...好draw, 整帧: 0, 本体: 0, 阴影: 0 }).join('\n')).toMatch(/0 不是"达标"/);
  });

  it('tri 读到 0 ⇒ 画了 call 却没画面（取账落在空场景上）', () => {
    expect(draw读数问题('abyss', { ...好draw, 三角面: 0 }).join('\n')).toMatch(/空场景/);
    expect(draw读数问题('abyss', { ...好draw, 三角面: NaN }).join('\n')).toMatch(/tri 读到 NaN/);
  });

  it('差值列不再等于两列之差 ⇒ 咬住"阴影改成第三趟取账"那种改法', () => {
    const 问 = draw读数问题('gloom', { ...好draw, 阴影: 30 });
    expect(问.join('\n'), '阴影 ≠ 整帧 − 本体 没有点名').toMatch(/不自洽/);
    // 控制臂：话术里的两个数必须来自被检查的那条，不是抄的
    expect(问.join('\n')).toMatch(/阴影 30 ≠ 整帧 278 − 本体 201/);
  });

  it('一站压根没交出来（undefined / 不是对象）⇒ 点名站点，而不是撞到一个裸 TypeError', () => {
    // evalJs 拿不到 returnByValue 的东西时返回 undefined；旧脚本会在 `r.阴影` 上炸成
    // "Cannot read properties of undefined" —— 那种红读不出"哪一站、为什么"
    expect(draw读数问题('radiant', undefined)[0]).toMatch(/站点 radiant 没交出读数对象/);
    expect(cpu读数问题('灰白森林', null, 240)[0]).toMatch(/站点 灰白森林 没交出 CPU 腿读数对象/);
  });

  it('CPU 腿：少一批计时 = 缺样，帧数不比对上（均值是在几个数上算的）', () => {
    const 问 = cpu读数问题('枢纽空载', { ...好cpu, frames: 180 }, 240);
    expect(问.join('\n'), '短批没有点名').toMatch(/交出 180 帧，应有 240 帧/);
    expect(问.join('\n')).toMatch(/缺样/);
    // 三列任何一列非有限正数都点名那一列，并把"为什么会绿"写在话里
    for (const 列 of CPU列) {
      expect(cpu读数问题('枢纽空载', { ...好cpu, [列]: NaN }, 240).join('\n'), `${列} 读到 NaN 没点名`)
        .toMatch(new RegExp(`"${列}" 读到 NaN`));
      expect(cpu读数问题('枢纽空载', { ...好cpu, [列]: 0 }, 240).join('\n'), `${列} 读到 0 没点名`)
        .toMatch(new RegExp(`"${列}" 读到 0`));
    }
  });

  it('名册覆盖：少一站 / 多一站 / 重一份 / 顺序漂，四种都各自点名', () => {
    const 好 = 名单.map((站) => ({ 站, ...好draw }));
    expect(覆盖问题(名单, 好)).toEqual([]);
    // 少一站：今天没有 continue，但把 for 改短、提前 break 都不会被任何**现有**判据抓住
    expect(覆盖问题(名单, 好.slice(0, 2)).join('\n')).toMatch(/名册里有这一站却没交出读数：magic/);
    expect(覆盖问题(名单, 好.slice(0, 2)).join('\n')).toMatch(/静默放开/);
    // 多一站：脚本自己发明了一站
    expect(覆盖问题(名单, [...好, { 站: 'nowhere', ...好draw }]).join('\n')).toMatch(/名册外的站点读数：nowhere/);
    // 重一份：逐站上限会被贴到错的那一份上
    expect(覆盖问题(名单, [...好, 好[0]]).join('\n')).toMatch(/同一站交出多份读数：hub/);
    // 顺序漂：三站都在但换了个次序
    expect(覆盖问题(名单, [好[1], 好[0], 好[2]]).join('\n')).toMatch(/站点顺序与名册不一致/);
  });

  it('脚本真的在问这四个判（调用点，不是词面）', () => {
    for (const [名, 尺] of [['draw读数问题', /const 问 = draw读数问题\(站id, r\);/],
      ['普查读数问题', /const 普问 = 普查读数问题\(站id, r\.普查, r\.冻结阴影\);/],
      ['cpu读数问题', /const 问 = cpu读数问题\(名字, r, 应有帧数\);/],
      ['覆盖问题', /const 覆盖 = 覆盖问题\(名册\.stationIds, draw读数\);/]]) {
      expect(脚本源, `脚本里没有 import ${名}`).toMatch(new RegExp(`import \\{[^}]*${名}[^}]*\\} from '\\./harness-readings\\.mjs'`));
      expect(脚本源, `脚本没有真的调用 ${名}（只剩 import 或注释不算）`).toMatch(尺);
    }
    // 不合格必须**抛**（读数作废），不许 push 进越线（越预算与没量到是两回事）
    expect(脚本源, 'draw 腿不合格被降级成越预算').toMatch(/站点 \$\{站id\} 的 draw call 腿不是一次测量/);
    expect(脚本源, '阴影普查对不上账被降级成越预算').toMatch(/站点 \$\{站id\} 的阴影普查对不上账/);
    expect(脚本源, 'CPU 腿不合格被降级成越预算').toMatch(/不是一次测量：\\n - ` \+ 问\.join/);
    expect(脚本源, '覆盖不全被降级成越预算').toMatch(/draw call 腿的站点覆盖不全/);
    // "应有帧数"必须由脚本里的批数×每批帧推出来，不许另抄一个 240
    expect(脚本源, '应有帧数不是从批数×每批帧推的').toMatch(/const 应有帧数 = 计时批数 \* 每批帧数;/);
    expect(脚本源, '页面里那句话的帧数没有跟着推导走').toMatch(/for \(let i = 0; i < \$\{每批帧数\}; i \+= 1\)/);
  });

  it('判据模块不许带副作用（它是给门禁 import 的那一半）', () => {
    /**
     * `perf-smoke.mjs` 是导入即执行的，所以判据搬出来后，这一半必须**真的**能被 import。
     * 一条 `spawn` 或 `process.exit` 就能让全量套件里跑起浏览器 —— 那是 W-D4 切片3
     * 立这条分家时要消灭的东西，别在搬家的时候把它请回来。
     */
    const 源 = readFileSync(join(ROOT, 'scripts', 'harness-readings.mjs'), 'utf8');
    // 尺子要咬"语句形状"，不要咬字面词：这个文件的说明里就得留着"起 vite 与 Chrome""process.exit"
    // 这类话（上面 9424 那条腿踩过一次）—— 只禁调用/赋值这个形状，否则下一次红会被改的是腿而不是代码。
    expect(源, '判据模块里出现了 spawn 调用').not.toMatch(/\bspawn(Sync)?\s*\(/);
    expect(源, '判据模块里出现了 process.exit 调用').not.toMatch(/^\s*process\.exit\(/m);
    expect(源, '判据模块里出现了 fetch 调用').not.toMatch(/\bfetch\s*\(/);
    expect(源, '判据模块自己 import 了 node 的执行侧依赖').not.toMatch(/^\s*import .*from '(node:)?(child_process|fs|path|os|net|http)'/m);
    expect(源, '判据模块里出现了裸的副作用 import（`import \'node:fs\';` 没有 from，上面那条咬不住）').not.toMatch(/^\s*import\s+['"]node:/m);
    expect(源, '判据模块里有顶层 await（import 它就会真的跑起来）').not.toMatch(/^\s*await /m);
  });

  it('解析 Chrome 的 DevTools 行：真话收、假话与越界的口一律拒', () => {
    // 真话（Chrome 实际会先打几行告警，所以整段里必须能把它揪出来）
    const 真 = [
      'Created TensorFlow Lite XNNPACK delegate for CPU.\n',
      'DevTools listening on ws://127.0.0.1:53417/devtools/browser/2f7c1a3e-8b7d-4a7a-9b3f-1f0e2c3d4e5f\n',
    ].join('');
    expect(解析CDP口(真)).toEqual({ 口: 53417, 浏览器ws: 'ws://127.0.0.1:53417/devtools/browser/2f7c1a3e-8b7d-4a7a-9b3f-1f0e2c3d4e5f' });
    // 假话与残缺：空、没有那一行、口不是 127.0.0.1、口越界
    expect(解析CDP口(''), '空话竟然解析出口').toBeNull();
    expect(解析CDP口('DevTools listening on ws://[::1]:53417/devtools/browser/abc'), '非 127.0.0.1 的口被收下').toBeNull();
    expect(解析CDP口('DevTools listening on ws://127.0.0.1:70000/devtools/browser/abc'), '越界的口被收下').toBeNull();
    expect(解析CDP口('DevTools listening on ws://127.0.0.1:53417/'), '没有 browser 段也算数').toBeNull();
    expect(解析CDP口(undefined), 'undefined 撞到一个裸 TypeError').toBeNull();
  });
});

/**
 * ## 这一轮从头到尾是同一个页吗（W-C2 切片6d，#167）
 *
 * 上面那些腿问的都是**测量开始之前**的事（口、页、通道）。剩下的洞在**测量中途**：
 * 这个工作树是并发会话共用的，谁往 `src/` 写一下，vite 就发一次全量重载 ——
 * `window.__game` 变回 undefined，最先红的是某一句 `evalJs` 的
 * `TypeError: Cannot read properties of undefined (reading 'player')`。
 * 那句红读起来像"代码坏了"，实际原因是"这一轮的量被换掉了"—— 归因记错地方，
 * 下一个人会去查一个没被改过的文件。更坏的是重载来得晚（最后一站之后）时**根本不红**：
 * 十个读数来自两个页，而它照样绿。
 *
 * 正面信号用 `Runtime.executionContextCreated` 的**条数**：本仓不起 worker、不挂 iframe，
 * 一次正常轮次里它不该动。它一动就是页被重建过（数的是必然会来的东西，不是"没看到坏东西"）。
 * 判据形状与 6b/6c 一致 —— 住在 `harness-readings.mjs`，正反两种输入都喂得进去；
 * 脚本那侧只钉"确实调用、不合格就作废、顺序对"。
 */
const 接腿 = {
  调了判据: (s) => /const 重问 = 重载问题\(基线上下文, 通道\.执行上下文\);/.test(s),
  // 作废必须是**抛出**：把它降级成"push 进越线"就把环境问题写成了越预算（退出码 1 = 代码坏了）
  不合格就作废: (s) => s.includes('if (重问.length) {') && s.includes('废.读数作废 = true;') && s.includes('throw 废;'),
  基线取在见证之后测量之前: (s) => {
    const 见 = s.indexOf('const 通问 = 通道问题(通道)');
    const 基 = s.indexOf('基线上下文 = 通道.执行上下文;');
    const 首站 = s.indexOf("const 枢纽 = await 站('枢纽空载'");
    return 见 >= 0 && 基 >= 0 && 首站 >= 0 && 见 < 基 && 基 < 首站;
  },
  作废在算越线之前: (s) => {
    const 作 = s.indexOf('const 重问 = 重载问题(');
    const 预 = s.indexOf('const 预算 = PERF_BUDGETS;');
    return 作 >= 0 && 预 >= 0 && 作 < 预;
  },
  归因在catch里: (s) => s.includes('if (!err?.读数作废) {')
    && s.includes('const 归因 = 重载问题(基线上下文, 通道.执行上下文);')
    && s.includes("console.error('perf-smoke 归因："),
  // 计数器**只能有一份，且声明在 try 外面**。多一份（试内再 const 一次）就把外层那个遮蔽了：
  // catch 里的 `通道.执行上下文` 永远是 0，归因那条从此只会沉默 —— 2026-10-22 搬 e2e-clear 时真错过一次。
  通道只有一份: (s) => (s.match(/^\s*const 通道 = /gm) ?? []).length === 1
    && (s.match(/^\s*let 基线上下文 = /gm) ?? []).length === 1
    && s.search(/^\s*const 通道 = /m) < s.indexOf('let failures = 0;'),
};

describe('中途重载（切片6d）：读数作废并点名，而不是报成页面内 TypeError', () => {
  it('反面控制：从头到尾同一个页，什么都不报', () => {
    expect(重载问题(2, 2), '页没被重建却被判作废（这条门禁会永远红）').toEqual([]);
    expect(重载问题(7, 7), '条数相同却被判作废').toEqual([]);
    // 还没取到基线 ⇒ 这一条不判。它是"作废已有读数"的判据，不是"见证存在"的判据
    //（后者归 `通道问题` 管）；并到一起会把开机阶段那些与重载无关的红记到这条上。
    expect(重载问题(null, 3), '还没取基线就把开机阶段的红报成重载').toEqual([]);
    // 0→0 也放行，尽管 0 条通道是断的 —— 那一问由 `通道问题` 在起跑前拒掉，这里不重复收口
    expect(重载问题(0, 0)).toEqual([]);
  });

  it('条数动过 ⇒ 点名动了多少、为什么动、并说清"这一轮不作数"', () => {
    const 问 = 重载问题(2, 5).join('\n');
    expect(问).toMatch(/执行上下文从 2 条变成 5 条/);
    expect(问, '差值必须是从喂进来的两个数推的（抄进话术里的数字会随基线烂掉）').toMatch(/差 3/);
    expect(问, '没点名最常见的原因：并发写入触发的 vite 全量重载').toMatch(/全量重载/);
    expect(问, '没说出结论：这一轮不作数').toMatch(/这一轮不作数/);
    // 条数**变少**同样是页被重建（新文档先把旧上下文销毁）—— 只防"变多"是半个判据
    expect(重载问题(5, 2).join('\n'), '条数减少被判成同一个页').toMatch(/从 5 条变成 2 条（差 -3）/);
  });

  it('基线或结束是一把手上空尺 ⇒ 点名尺子，不靠 NaN 的巧合红', () => {
    // 基线自己不是整数 = 这条判据被喂了个空尺（`NaN !== 0` 会让它"红"，但红的话是错的）
    expect(重载问题(NaN, 3).join('\n'), '基线是 NaN 时没有点名基线自己坏了').toMatch(/基线条数不是整数/);
    // 结束值来自事件计数器：字段改名或计数搬走 ⇒ undefined，差算成 NaN。
    // 这里要的是"说清是哪一头空了"，不是靠 NaN 恰好不等于 0 蒙一次红。
    expect(重载问题(2, undefined).join('\n'), '结束值读到 undefined 没有点名').toMatch(/变成 undefined 条/);
  });

  it('脚本真的问了这一判，且顺序对（基线在测量之前、作废在算越线之前）', () => {
    expect(脚本源, '脚本没有 import 重载问题').toMatch(/import \{[^}]*重载问题[^}]*\} from '\.\/harness-readings\.mjs'/);
    for (const [名, 尺] of Object.entries(接腿)) {
      expect(尺(脚本源), `接线腿"${名}"在真源码上不过`).toBe(true);
    }
    // 计数的正面来源：谁在数 executionContextCreated
    expect(脚本源, '没有人在数执行上下文条数（那这一判读的是两个常数）').toMatch(/通道\.执行上下文 \+= 1/);
  });

  it('反向控制：五处拆法各自被对应的腿抓住（自证这些腿不是空转）', () => {
    const 坏 = {
      不调判据: 脚本源.replace('const 重问 = 重载问题(基线上下文, 通道.执行上下文);', 'const 重问 = [];'),
      条件废掉: 脚本源.replace('if (重问.length) {', 'if (false) {'),
      基线不取: 脚本源.replace('  基线上下文 = 通道.执行上下文;', ''),
      归因删掉: 脚本源.replace('if (!err?.读数作废) {', 'if (false) {'),
      计数器遮蔽: 脚本源.replace('  const exceptions = [];', '  const exceptions = [];\n  const 通道 = { 执行上下文: 0, 加载完成: 0 };'),
    };
    expect(接腿.调了判据(坏.不调判据), '判据不调，腿却仍判为"调了"').toBe(false);
    expect(接腿.作废在算越线之前(坏.不调判据), '判据被换成常量，"作废排在越线之前"却仍判为真').toBe(false);
    expect(接腿.不合格就作废(坏.条件废掉), 'if 改成 if (false)，腿却仍判为"会抛"').toBe(false);
    expect(接腿.基线取在见证之后测量之前(坏.基线不取), '基线不取了，腿却仍判为"顺序对"').toBe(false);
    expect(接腿.归因在catch里(坏.归因删掉), '归因没了，腿却仍判为"在 catch 里"').toBe(false);
    expect(接腿.通道只有一份(坏.计数器遮蔽), 'try 内再 const 一次把外层遮蔽了，腿却仍判为"只有一份"').toBe(false);
    // 控制的控制：这五处每一处只坏在它自己那一格上（其余腿照过）——
    // 否则一条红能带倒五条，就说不清是哪只蝴蝶
    expect(接腿.不合格就作废(坏.不调判据), '不调判据那一处连累了别的腿').toBe(true);
    expect(接腿.归因在catch里(坏.条件废掉)).toBe(true);
    expect(接腿.调了判据(坏.归因删掉)).toBe(true);
    expect(接腿.调了判据(坏.计数器遮蔽)).toBe(true);
  });
});

