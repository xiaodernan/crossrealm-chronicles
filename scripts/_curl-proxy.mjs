/**
 * curl 出口（`LLM_PROXY_URL=http://127.0.0.1:7897`）——本机 API 请求必经 Clash 节点才出得去。
 *
 * ## 为什么要写这个
 *
 * 早期实现 `_clash-proxy.mjs` 是自写的 CONNECT + TLS 裸写栈。2026-11-17 复测时发现它稳定失败：
 * Clash CONNECT 握手成功、TLS 建链成功，上游却先于 `\r\n\r\n` 到达 `end`，
 * 所有 probe 拿到「Clash 隧道：响应没有头部」——同一进程、同一代理用 curl 实测 HTTP 200 + 完整 usage。
 * Node 裸 HTTP 栈（没有 ALPN、没有与上游谈定的 keep-alive 策略、没有对 Clash 回声 CONNECT 200 的容错）
 * 在这个网关面前不可靠。
 *
 * 修法：不再自己实现 TLS，而是把 curl 当「网络层」调用（execFileSync）。
 * curl 与上游的兼容性由它自己负责（含 keep-alive / ALPN / HTTP 版本协商），
 * 我们只负责请求体与响应体的 JSON/SSE 解析。
 *
 * 口径：
 * - `LLM_PROXY_URL` 未设置 → 默认 `http://127.0.0.1:7897`（本机 Clash Verge 混合端口）；
 *   设为 `direct` 则不走代理（仅用于不锁端点的自测）。
 * - 仅支持 http://host:port 代理；不做 PAC/SOCKS——够用且逼真实形。
 * - 不缓存；不复用连接；每个请求一次 CONNECT——probe 就是给「第一次冷启 → 第二次热命中」测的。
 * - 密钥只从调用方传入，永不打印；body 写临时文件由调用方清理，绝不落仓库。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const REPO_ROOT_ENV = (() => {
  try {
    for (const line of readFileSync(join(REPO_ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && m[1].trim() === 'LLM_PROXY_URL') return m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* 没有 .env */ }
  return undefined;
})();

export const proxyRaw = () => {
  if (process.env.LLM_PROXY_URL) return process.env.LLM_PROXY_URL;
  if (REPO_ROOT_ENV) return REPO_ROOT_ENV;
  return 'http://127.0.0.1:7897';
};
export const proxyIsSet = () => Boolean(proxyRaw()) && proxyRaw() !== 'direct';
export const proxyInfo = () => (proxyRaw() === 'direct' ? 'direct' : proxyRaw());

/**
 * 调一次上游。
 * @param {{ url: string, method?: string, headers?: object, body: string, timeoutMs?: number }} args
 * @returns {{ status: number, headers: object, body: string, timeTotal: number, error?: string }}
 *   status = curl 报的 HTTP 码；curl 失败返回 status:0 与 error 字段。
 */
export function curlFetch({ url, method = 'POST', headers = {}, body, timeoutMs = 120000 }) {
  const dir = mkdtempSync(join(tmpdir(), 'crossrealm-curl-'));
  const bodyFile = join(dir, 'body.json');
  const outFile = join(dir, 'resp.txt');
  writeFileSync(bodyFile, body);
  const raw = proxyRaw();
  const proxyArgs = raw && raw !== 'direct' ? ['-x', raw] : [];
  const args = [
    ...proxyArgs,
    '-sS', '-m', String(Math.ceil(timeoutMs / 1000)),
    '-o', outFile,
    '-w', '%{http_code} %{time_total}',
    '-X', method,
    ...Object.entries(headers).flatMap(([k, v]) => ['-H', `${k}: ${v}`]),
    '--data-binary', `@${bodyFile}`,
    url,
  ];
  let out = '';
  let error = null;
  try {
    out = execFileSync('curl.exe', args, { encoding: 'utf8', timeout: timeoutMs + 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    error = String(e.stderr ?? e.message ?? e).slice(0, 300);
  }
  let bodyText = '';
  try { bodyText = readFileSync(outFile, 'utf8'); } catch { /* 无响应体 */ }
  rmSync(dir, { recursive: true, force: true });
  const m = out.match(/^(\d{3})\s+([\d.]+)/);
  if (error || !m) {
    return { status: 0, headers: {}, body: bodyText, timeTotal: 0, error: error ?? `curl 输出无法解析: ${out.slice(0, 120)}` };
  }
  return { status: Number(m[1]), headers: {}, body: bodyText, timeTotal: Number(m[2]) };
}

/** 常用请求封装：JSON POST（完整 body buffer + status）。 */
export async function curlJsonPost(url, headers, bodyObj, timeoutMs = 120000) {
  return curlFetch({
    url,
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(bodyObj),
    timeoutMs,
  });
}
