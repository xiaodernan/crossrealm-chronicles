import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 压测器自己的红绿灯（W-Z513 · 2026-11-23）
 *
 * ## 为什么钉这一门
 * `scripts/stress-load.mjs` 从前有默认目标 `http://localhost:8081`。那个端口在本机**不属于本项目**
 * ——账本里有实录（W-Z335 前后：`careeros-gateway` 占着 `127.0.0.1:8081`，批注写的是"误打会冲击他人业务"）。
 * 也就是说 `npm run stress` 不带参数时，发的是一轮打到邻居服务上的洪峰。
 * 第二件事更隐蔽：默认绕开网关 ⇒ 429 那一整条治理分支**从来没被压测器走过**，
 * 而它照样交回一个绿（容量是真的，治理面是没测的）。
 *
 * 这两条都不是"读一遍代码就能放心"的事，所以这里全部走**真子进程 + 真 HTTP 桩**：
 * 用法不对必须是退出码 2 且**一个请求都不许发**（发出去了才红就晚了）、
 * 端点连不上不许绿、429 洪峰在不带 `--accept-limited` 时必须判红（限流不是崩溃，但也不许当成没事）、
 * 带了就必须只按真失败判色。对照臂（全 200 ⇒ 绿）钉住"这门不是恒红"。
 *
 * 对照臂不是形式主义：`load-test.mjs` 那条"给了完整 URL 就该照常跑完"第一次跑就红，
 * 交出的是 `3221226505`（0xC0000409）—— 它跑完洪峰后用 `process.exit()` 硬退，而 Windows libuv
 * 在还有没关完的 fetch 句柄时会当场崩（同一课 `stress-load.mjs` 末尾早就记过）。改成
 * `process.exitCode` + 自然回落之后才是真的 0。也就是说：**一个会崩退的尺子，既不绿也不红，
 * 它只是消失**。
 */

const SCRIPT = join(process.cwd(), 'scripts', 'stress-load.mjs');
const LOAD_SCRIPT = join(process.cwd(), 'scripts', 'load-test.mjs');

let mode = 'ok';
let hits = 0;
let server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    hits += 1;
    req.resume();
    if (mode === 'limited') {
      res.writeHead(429, { 'content-type': 'application/json', 'X-RateLimit-Limit': '60' });
      res.end('{"error":"rate-limited","retryAfterMs":1000}');
      return;
    }
    if (mode === 'one500' && hits === 3) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"boom"}');
      return;
    }
    if (mode === 'replay' || mode === 'noreplay') {
      // 幂等台账的"接住了"只写在响应头里；第一笔本来就是落账，不是重放。
      const replayed = mode === 'replay' && hits > 1;
      res.writeHead(201, replayed
        ? { 'content-type': 'application/json', 'x-idempotent-replayed': 'true' }
        : { 'content-type': 'application/json' });
      res.end('{"id":1}');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"entries":[],"count":0}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const runOn = (script, args) => new Promise((resolve) => {
  const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { err += c; });
  child.on('close', (code) => resolve({ code, out, err }));
});

const run = (args) => runOn(SCRIPT, args);

const readBurst = (extra = []) => ['--target', base, '--scenario', 'readBurst', '--concurrency', '4', '--requests', '8', '--timeout', '1500', '--json', ...extra];

describe('stress-load 的 target 是一条命令，不是一个默认值', () => {
  it('缺 --target ⇒ 退出码 2，且一个请求都不许发出去', async () => {
    const before = hits;
    const { code, err } = await run(['--scenario', 'readBurst', '--requests', '2']);
    expect(code).toBe(2);
    expect(err).toContain('target');
    expect(hits - before, '缺 target 时不该有任何流量').toBe(0);
  }, 30000);

  it('target 少了 scheme ⇒ 退出码 2（形状错的命令不该交回一条"失败率 100%"的假故障）', async () => {
    const before = hits;
    const { code, err } = await run(['--target', 'localhost:8080', '--requests', '2']);
    expect(code).toBe(2);
    expect(err).toContain('完整 URL');
    expect(hits - before).toBe(0);
  }, 30000);

  it('DEFAULTS 里不许再住回一个默认目标（回来一次就是一次打邻居的风险）', () => {
    const src = readFileSync(SCRIPT, 'utf8').replace(/\r\n/g, '\n');
    const defaults = src.match(/const DEFAULTS = \{[\s\S]*?\n\};/);
    expect(defaults, '找不到 DEFAULTS 那块，这条腿量不到东西').toBeTruthy();
    expect(defaults[0]).not.toMatch(/target/);
    expect(src).toMatch(/opt\('target',\s*null\)/);
  });

  // CI 第一轮真跑就抓到的事：`smoke.ps1` 里的 `$repoRoot` 是 `server/`（脚本住在 server/scripts），
  // 拿它去拼 `scripts/stress-load.mjs` 得到的是 server/scripts/stress-load.mjs ⇒ node MODULE_NOT_FOUND
  // ⇒ "capacity burst produced no report"。锤住在**仓根**的 scripts/ 下，路径必须先上一层再拼。
  it('smoke 的两段压测必须从仓根拼这把锤，并且先确认它在场', () => {
    const smoke = readFileSync(join(process.cwd(), 'server', 'scripts', 'smoke.ps1'), 'utf8').replace(/\r\n/g, '\n');
    expect(smoke, 'smoke.ps1 没有把项目根往上一层再拼锤路径').toMatch(/Split-Path -Parent \$repoRoot/);
    expect(smoke, 'smoke.ps1 拼完不检查在不在场（不在场只会交回一句"没有报告"）').toMatch(/Test-Path \$stressScript/);
    expect(existsSync(SCRIPT), `仓根的锤丢了：${SCRIPT}`).toBe(true);
    // 反向：错误的那条路线确实不该存在，否则上面两条静态腿量不到这次的病形。
    expect(existsSync(join(process.cwd(), 'server', 'scripts', 'stress-load.mjs')),
      'server/scripts 下真有同名文件，那"拼错一层"就没人发现得了').toBe(false);
  });

  // 同族的第二把尺子：`load-test.mjs` 从前默认打 `http://localhost:8080`，而"标准 8080"
  // 在这台开发机上可能正被别的项目占着（smoke.ps1 头部记着这件事，本仓因此一律走 28xxx）。
  it('load-test.mjs 同样不许有默认目标：缺 target ⇒ 退出码 2 且零请求', async () => {
    const before = hits;
    const { code, err } = await runOn(LOAD_SCRIPT, [
      '--scenario=version', '--users=2', '--duration-ms=200',
    ]);
    expect(code).toBe(2);
    expect(err).toContain('target');
    expect(hits - before, '缺 target 时不该有任何流量').toBe(0);
  }, 30000);

  it('load-test.mjs 收到半截 URL（漏 scheme）也当场红，而不是发一轮注定失败的请求', async () => {
    const before = hits;
    const { code, err } = await runOn(LOAD_SCRIPT, [
      '--target=localhost:8080', '--scenario=version', '--users=2', '--duration-ms=200',
    ]);
    expect(code).toBe(2);
    expect(err).toContain('完整 URL');
    expect(hits - before).toBe(0);
  }, 30000);

  // 对照臂：给了完整 URL 就真的走得下去（这一条钉的是"上面两条红不是因为脚本本身跑不起来"）
  it('load-test.mjs 拿到完整 URL 后照常跑（不是把校验加严之后连能跑的路径一起打死）', async () => {
    const before = hits;
    const { code } = await runOn(LOAD_SCRIPT, [
      `--target=${base}`, '--scenario=version', '--users=2', '--duration-ms=300',
    ]);
    expect(code).toBe(0);
    expect(hits - before).toBeGreaterThan(0);
  }, 60000);
});

describe('读数判色不许两头骗', () => {
  it('端点连不上 ⇒ 红（不许把"零成功"报成绿）', async () => {
    const { code, out } = await run([
      '--target', 'http://127.0.0.1:1', '--scenario', 'readBurst',
      '--requests', '2', '--timeout', '400', '--json',
    ]);
    expect(code).toBe(1);
    expect(JSON.parse(out).ok).toBe(0);
  }, 30000);

  it('对照臂：全 200 ⇒ 绿', async () => {
    mode = 'ok';
    const { code, out } = await run(readBurst());
    expect(code, out).toBe(0);
    expect(JSON.parse(out).ok).toBe(8);
  }, 60000);

  it('全 429 不带 --accept-limited ⇒ 红（治理器在挡，但压测器不许把超额当没事）', async () => {
    mode = 'limited';
    const { code, out } = await run(readBurst());
    expect(code, out).toBe(1);
    const report = JSON.parse(out);
    expect(report.limited).toBe(8);
    expect(report.server).toBe(0);
  }, 60000);

  it('全 429 带 --accept-limited ⇒ 绿，且 limited / errRateNoLimited 两格都如实交回', async () => {
    mode = 'limited';
    const { code, out } = await run(readBurst(['--accept-limited']));
    expect(code, out).toBe(0);
    const report = JSON.parse(out);
    expect(report.limited).toBe(8);
    expect(report.errRateNoLimited).toBe(0);
    expect(report.errRate).toBe(1);
  }, 60000);

  it('夹一枚 500 ⇒ 红（`--accept-limited` 只赦 429/413，不赦 5xx）', async () => {
    mode = 'one500';
    hits = 0;
    const { code, out } = await run(readBurst(['--accept-limited']));
    expect(code, out).toBe(1);
    expect(JSON.parse(out).server).toBeGreaterThanOrEqual(1);
  }, 60000);
});

describe('idempotentReplay 量的是台账，不只是状态码', () => {
  // 必须是函数：`base` 在 `beforeAll` 里才有值，写成 describe 体的常量会在收集期就抄下空串。
  const replayArgs = () => ['--target', base, '--scenario', 'idempotentReplay', '--concurrency', '1', '--requests', '4', '--timeout', '1500', '--json'];

  it('台账一次都没重放 ⇒ 红（改前这一路交回的是绿：值算出来就丢，判据只看状态码）', async () => {
    mode = 'noreplay';
    hits = 0;
    const { code, out } = await run(replayArgs());
    expect(code, out).toBe(1);
    const report = JSON.parse(out);
    expect(report.replayed).toBe(0);
    expect(report.replayTargets).toBe(4);
    expect(report.replayNever).toBe(true);
  }, 60000);

  it('对照臂：首笔落账、其余三笔重放 ⇒ 绿，且重放数如实交回', async () => {
    mode = 'replay';
    hits = 0;
    const { code, out } = await run(replayArgs());
    expect(code, out).toBe(0);
    const report = JSON.parse(out);
    expect(report.replayed).toBe(3);
    expect(report.replayNever).toBe(false);
  }, 60000);
});
