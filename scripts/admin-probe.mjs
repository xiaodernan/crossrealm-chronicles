import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { 开通道, Chrome的话 } from './cdp-channel.mjs';
import { 管理页探针越线 } from './harness-readings.mjs';

const ROOT = process.cwd();
const REPORT = join(ROOT, 'docs', 'admin', 'data', 'admin-browser-probe.json');
const SCREENSHOT = join(ROOT, '.tmp-admin-probe.png');
const EXPECTED_EVENTS = 20;
const EXPECTED_MEASURED = 42;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  expected: { localEvents: EXPECTED_EVENTS, measuredCards: EXPECTED_MEASURED },
  scenarios: {},
  failures: [],
};

const failures = [];
let vite;
let chrome;
let profileDir;
let ws;
let channel;
let interceptionMode = 'normal';
const 通道 = { 执行上下文: 0, 加载完成: 0 };
const 浏览器输出 = [];
const dev输出 = [];
const capture = { console: [], network: [] };

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.unref();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

function findChrome() {
  return [
    process.env.CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean).find((path) => existsSync(path));
}

function killTree(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === 'win32') {
      const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      if (result.status !== 0) child.kill();
    } else child.kill();
  } catch { /* already gone */ }
}

function cleanup() {
  killTree(chrome);
  killTree(vite);
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* already gone */ }
}
process.on('exit', cleanup);

async function waitForHttp(url, tries = 80) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch { /* not listening yet */ }
    await sleep(500);
  }
  return false;
}

async function readCdpPort(timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const text = 浏览器输出.join('');
    const match = text.match(/DevTools listening on ws:\/\/[^\s]+:(\d+)\/[^\s]+/);
    if (match) return Number(match[1]);
    if (Date.now() >= deadline) {
      throw new Error(`Chrome 没有报出 CDP 口。它自己的话：\n - ${Chrome的话(浏览器输出)}`);
    }
    await sleep(250);
  }
}

async function waitFor(expression, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await channel.evalJs(expression)) return;
    } catch { /* navigation can replace the execution context */ }
    if (Date.now() >= deadline) {
      const state = await channel.evalJs(`({ ready: document.readyState, href: location.href, unlocked: dashboard?.classList.contains('unlocked'), events: document.querySelectorAll('#localEventsGrid .kpi').length, fallback: document.querySelectorAll('#kpiGrid > .panel').length, console: window.__probeConsole ?? [] })`).catch(() => null);
      throw new Error(`${label} ${timeoutMs}ms 内没有成立；页面状态 ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }
}

async function navigate(url) {
  const loads = 通道.加载完成;
  await channel.send('Page.navigate', { url });
  await waitFor(`document.readyState === 'complete' && location.href === ${JSON.stringify(url)}`, '页面加载');
  if (通道.加载完成 <= loads) throw new Error('页面已到 complete，但 Page.loadEventFired 没有增长');
}

const measureExpression = `(() => {
  const dashboard = document.getElementById('dashboard');
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  };
  const cards = [...dashboard.querySelectorAll('.kpi')].filter(visible).map((el) => {
    const r = el.getBoundingClientRect();
    return { label: el.querySelector('.kpi-label')?.textContent?.trim() ?? '', x: r.x, y: r.y, right: r.right, bottom: r.bottom };
  });
  const overlaps = [];
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const a = cards[i], b = cards[j];
      const w = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      if (w > 1 && h > 1) overlaps.push([a.label, b.label, +w.toFixed(1), +h.toFixed(1)]);
    }
  }
  const text = dashboard.textContent ?? '';
  const cjkSamples = [...dashboard.querySelectorAll('*')].flatMap((el) => [...el.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE && /[\\u3400-\\u9fff]/.test(node.textContent))
    .map((node) => ({ tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 60), text: node.textContent.trim().replace(/\\s+/g, ' ').slice(0, 160) }))).slice(0, 16);
  const overflowOffenders = [...dashboard.querySelectorAll('*')].filter(visible).map((el) => {
    const r = el.getBoundingClientRect();
    return { tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 60), left: +r.left.toFixed(1), right: +r.right.toFixed(1), width: +r.width.toFixed(1), text: (el.textContent ?? '').trim().replace(/\\s+/g, ' ').slice(0, 80) };
  }).filter((r) => r.right > innerWidth + 1 || r.left < -1).slice(0, 16);
  return {
    viewport: [innerWidth, innerHeight],
    gateVisible: visible(document.getElementById('gate')),
    dashboardUnlocked: dashboard.classList.contains('unlocked'),
    localEventTiles: document.querySelectorAll('#localEventsGrid .kpi').length,
    localEventLabels: [...document.querySelectorAll('#localEventsGrid .kpi-label')].map((el) => el.textContent.trim()),
    localEventValues: [...document.querySelectorAll('#localEventsGrid .kpi-value')].map((el) => Number(el.textContent.trim())),
    measuredCards: document.querySelectorAll('#measuredPanel .kpi').length,
    kpiTiles: document.querySelectorAll('#kpiGrid .kpi').length,
    kpiFallback: document.querySelectorAll('#kpiGrid > .panel').length > 0,
    pageOverflow: document.documentElement.scrollWidth > innerWidth,
    overflowOffenders,
    cardOverlaps: overlaps.slice(0, 12),
    cjkCount: (text.match(/[\\u3400-\\u9fff]/g) ?? []).length,
    cjkSamples,
    suspiciousTokens: /NaN|undefined/.test(text),
    lang: document.documentElement.lang,
  };
})()`;

async function measure(name) {
  const reading = await channel.evalJs(measureExpression);
  reading.exceptions = channel.异常.splice(0);
  reading.consoleErrors = capture.console.splice(0);
  reading.networkErrors = capture.network.splice(0);
  const screenshot = await channel.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (screenshot.result?.data) writeFileSync(SCREENSHOT.replace('.png', `-${name}.png`), Buffer.from(screenshot.result.data, 'base64'));
  report.scenarios[name] = reading;
  console.log(`${name}: local=${reading.localEventTiles} measured=${reading.measuredCards} kpi=${reading.kpiTiles} fallback=${reading.kpiFallback} consoleErrors=${reading.consoleErrors.length}`);
  return reading;
}

try {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.stdout.on('data', (chunk) => dev输出.push(String(chunk)));
  vite.stderr.on('data', (chunk) => dev输出.push(String(chunk)));

  const chromePath = findChrome();
  if (!chromePath) throw new Error('找不到 Chrome；用 CHROME 环境变量指定');
  profileDir = join(tmpdir(), `admin-probe-${Date.now()}`);
  chrome = spawn(chromePath, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  chrome.stdout.on('data', (chunk) => 浏览器输出.push(String(chunk)));
  chrome.stderr.on('data', (chunk) => 浏览器输出.push(String(chunk)));

  if (!await waitForHttp(`${origin}/docs/admin/index.html`)) {
    throw new Error(`Vite 40 秒内没有就绪。它自己的话：\n - ${dev输出.join('').slice(-1200)}`);
  }
  const cdpPort = await readCdpPort();
  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome 没有交出 page target');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      capture.console.push({ text: String(message.params?.args?.[0]?.value ?? message.params?.args?.[0]?.description ?? 'console.error') });
    }
    if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
      const entry = message.params.entry;
      capture.network.push({ text: entry.text, url: entry.url ?? '' });
    }
    if (message.method === 'Fetch.requestPaused' && channel) {
      const { requestId, request } = message.params;
      const url = request.url;
      if (url.includes('/api/telemetry/summary-rollup')) {
        channel.send('Fetch.fulfillRequest', {
          requestId, responseCode: 200,
          responseHeaders: [{ name: 'content-type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify({ enabled: false })).toString('base64'),
        }).catch(() => {});
      } else if (interceptionMode === 'synthetic-failure' && url.includes('data/synthetic.json')) {
        channel.send('Fetch.fulfillRequest', {
          requestId, responseCode: 503,
          responseHeaders: [{ name: 'content-type', value: 'application/json' }],
          body: Buffer.from('{}').toString('base64'),
        }).catch(() => {});
      } else channel.send('Fetch.continueRequest', { requestId }).catch(() => {});
    }
  });

  channel = 开通道({ ws, 名义: 'admin-probe', 通道, 浏览器输出, 每请求毫秒: 15000 });
  await channel.send('Runtime.enable');
  await channel.send('Page.enable');
  await channel.send('Log.enable');
  await channel.send('Network.enable');
  await channel.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await channel.send('Fetch.enable', { patterns: [
    { urlPattern: '*/api/telemetry/summary-rollup', requestStage: 'Request' },
    { urlPattern: '*synthetic.json*', requestStage: 'Request' },
  ] });
  await channel.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    try {
      if (sessionStorage.getItem('__adminProbeSeeded') === '1') return;
      sessionStorage.setItem('__adminProbeSeeded', '1');
      localStorage.removeItem('crossrealm_admin_unlocked');
      localStorage.setItem('crossrealm_admin_lang', 'zh');
      const t = '2026-11-24T00:00:00.000Z';
      localStorage.setItem('crossrealm_telemetry_v1', JSON.stringify([
        { event: 'game_start', t }, { event: 'game_start', t }, { event: 'session_end', t },
        { event: 'guide_asked', t }, { event: 'path_draw', t }, { event: 'unknown_future_event', t },
      ]));
    } catch (_) {}
  })()` });

  const url = `${origin}/docs/admin/index.html`;
  await navigate(url);
  await waitFor("typeof unlock !== 'undefined' && typeof PASSWORD !== 'undefined'", '管理页脚本初始化');
  await channel.evalJs(`(() => { pwd.value = 'wrong'; unlock.click(); return true; })()`);
  const wrong = await channel.evalJs(`(() => ({ rejected: err.textContent.length > 0, locked: !dashboard.classList.contains('unlocked') }))()`);
  await channel.evalJs(`(() => { pwd.value = PASSWORD; unlock.click(); return true; })()`);
  await waitFor(`window.__adminLoaded && document.querySelectorAll('#localEventsGrid .kpi').length === ${EXPECTED_EVENTS} && document.querySelectorAll('#kpiGrid .kpi').length === 12`, '口令解锁与正常渲染');
  const normal = await measure('normal');
  normal.wrongPasswordRejected = wrong.rejected;
  normal.wrongDashboardLocked = wrong.locked;

  await channel.evalJs(`document.querySelector('[data-lang-btn="en"]').click()`);
  await measure('english');
  await channel.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(100);
  await measure('mobile');

  interceptionMode = 'synthetic-failure';
  capture.console.length = 0;
  capture.network.length = 0;
  await channel.evalJs(`(() => { window.__adminData = undefined; window.__adminLoaded = false; showDashboard(); return true; })()`);
  await waitFor(`document.querySelectorAll('#localEventsGrid .kpi').length === ${EXPECTED_EVENTS} && document.querySelectorAll('#kpiGrid > .panel').length === 1`, '合成数据故障注入与降级');
  await measure('fallback');

} catch (error) {
  failures.push(error?.message ?? String(error));
  console.error('admin-probe 失败：', error);
} finally {
  try { ws?.close(); } catch { /* already gone */ }
  cleanup();
}

failures.push(...管理页探针越线(report));
report.failures = failures;
report.ok = failures.length === 0;
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error(`admin-probe: ${failures.length} 项失败\n - ${failures.join('\n - ')}`);
  process.exitCode = 1;
} else {
  console.log(`admin-probe: 四轮全绿；报告 ${REPORT}`);
  process.exitCode = 0;
}
