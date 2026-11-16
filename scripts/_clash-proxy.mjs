/**
 * Clash 代理通道（`LLM_PROXY_URL=http://127.0.0.1:7897`）——本机 API 请求必经 Clash 节点才出得去。
 *
 * ## 为什么要写这个
 *
 * Node 的全局 `fetch` **完全无视** `HTTP_PROXY` / `HTTPS_PROXY` 环境变量（2026-11-16 实测复核：仍是 403）。
 * 而项目里大部分 LLM 往返脚本都在走 `fetch(`${LLM_BASE_URL}/chat/completions`)`——逐个改调用点不现实。
 *
 * 这里换一个出口：用 `node:http` 直接起 CONNECT 隧道，TLS 握手后写裸 HTTP 请求。
 * 覆盖所有 `probe` 需要的形状：独立 body 限流 + 完整响应 buffer（不限制流）+ usage 截取。
 *
 * ## 口径
 *
 * - `LLM_PROXY_URL` 未设置 → 抛错（Node probe 门禁要求显式决定，不再 silently 直连 403）；
 *   设置 `LLM_PROXY_URL=direct` 才允许直连（只对不锁的端点有用）。
 * - 仅支持 `http://host:port` 代理（Clash 混合端口；不做 PAC/SOCKS——够用且逼真实形）。
 * - 不缓存；不复用连接；每个请求一条 CONNECT——probe 就是给「第一次冷启 → 第二次热命中」测的。
 */
import http from 'node:http';
import { connect } from 'node:net';
import tls from 'node:tls';

const PROXY_RAW = process.env.LLM_PROXY_URL;

export const proxyIsSet = () => Boolean(PROXY_RAW) && PROXY_RAW !== 'direct';
export const proxyInfo = () => (PROXY_RAW === 'direct' ? 'direct' : PROXY_RAW ?? 'unset');

function parseProxy(url) {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 80) };
}

/**
 * 在代理之上建立到目标主机的 TLS 隧道并发一条请求。
 * @param {{ url: string, method?: string, headers?: object, body: string, timeoutMs?: number }} args
 * @returns {Promise<{ status: number, headers: object, body: string }>}
 */
export function proxyFetch({ url, method = 'POST', headers = {}, body, timeoutMs = 60000 }) {
  if (!PROXY_RAW || PROXY_RAW === 'direct') {
    throw new Error('LLM_PROXY_URL 未设置或设为 direct——本机本 API 必须经 Clash 节点（HTTP 403）。设 LLM_PROXY_URL=http://127.0.0.1:7897 再来。');
  }
  const { host: proxyHost, port: proxyPort } = parseProxy(PROXY_RAW);
  const target = new URL(url);
  const targetHost = target.hostname;
  const targetPort = Number(target.port || 443);

  return new Promise((resolve, reject) => {
    const reqLine = `${method} ${target.pathname}${target.search} HTTP/1.1\r\n`;
    const connectReq = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`;
    const socket = connect({ host: proxyHost, port: proxyPort }, () => socket.write(connectReq));
    let stage = 'CONNECT';
    let buf = '';

    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error(`Clash 隧道超时（stage=${stage}，${timeoutMs}ms）`));
    });

    const finish = (status, respHeaders, respBody) => resolve({ status, headers: respHeaders, body: respBody });

    socket.once('error', (err) => reject(err));

    socket.on('data', (chunk) => {
      if (stage === 'CONNECT') {
        const s = chunk.toString('utf8');
        if (!s.includes('\r\n\r\n')) { buf += s; return; }
        const head = buf + s;
        const statusLine = head.split('\r\n')[0];
        if (!/^HTTP\/1\.[01] 200/.test(statusLine)) {
          reject(new Error(`Clash CONNECT 拒绝：${statusLine}`));
          return;
        }
        stage = 'TLS';
        const tlsSock = tls.connect({ socket, servername: targetHost }, () => {
          const payload = [
            reqLine,
            `Host: ${targetHost}\r\n`,
            `Connection: close\r\n`,
            ...Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`),
            `Content-Length: ${Buffer.byteLength(body)}\r\n`,
            '\r\n',
            body,
          ].join('');
          tlsSock.write(payload);
        });
        let raw = '';
        tlsSock.on('data', (c) => { raw += c; });
        tlsSock.on('error', reject);
        tlsSock.on('end', () => {
          const idx = raw.indexOf('\r\n\r\n');
          if (idx < 0) return reject(new Error('Clash 隧道：响应没有头部'));
          const headBlock = raw.slice(0, idx);
          const respBody = raw.slice(idx + 4);
          const lines = headBlock.split('\r\n');
          const status = Number(lines[0].split(' ')[1]);
          const respHeaders = {};
          for (const line of lines.slice(1)) {
            const i = line.indexOf(':');
            if (i > 0) respHeaders[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
          }
          finish(status, respHeaders, respBody);
        });
        return;
      }
    });
  });
}

/** 常用请求封装：JSON POST */
export async function proxyJsonPost(url, headers, bodyObj, timeoutMs = 60000) {
  const { status, body } = await proxyFetch({
    url,
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(bodyObj),
    timeoutMs,
  });
  return { status, body };
}
