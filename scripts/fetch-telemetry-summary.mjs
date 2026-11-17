#!/usr/bin/env node
/**
 * 2026-11-18 W-Z338：Admin「真·遥测快照」抓取器——把本机 compose 栈的
 * `GET /api/telemetry/summary-rollup` 原样落盘为 `docs/admin/data/telemetry-summary.json`。
 *
 * 为什么不直接 fetch host 的 28080：Docker Desktop 的 host 端口转发层（WSL2）今天反复
 * REJECT/ECONNREFUSED（curl HTTP 000），而 compose 网络内部的 `gateway:8080` 一切正常。
 * 本脚本优先走**容器网络内部**（alpine busybox wget 直连 gateway），抓不到再退 host curl。
 *
 * 数据口径：14 天窗口 · totals —— boss_kill / canon_open / loadtest / smoke / stress-probe 全部来自
 * 真实落盘事件；本机宿主机的所有探针（verify 冒烟、stress-load 洪测、cacheprobes）也都写在里面。
 * 密钥不涉及（只读端点）· 不落任何 PII · 文件随仓库提交，Pages 直链可读。
 *
 * 用法：node scripts/fetch-telemetry-summary.mjs
 */
import { execFileSync, execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/admin/data/telemetry-summary.json');
const ENDPOINT = process.env.TELEMETRY_SNAPSHOT_URL ?? 'http://gateway:8080/api/telemetry/summary-rollup';
const HOST_FALLBACK = process.env.TELEMETRY_SNAPSHOT_HOST ?? 'http://127.0.0.1:28080/api/telemetry/summary-rollup';

function dockerSnapshot(url) {
  const out = execFileSync('docker', ['run', '--rm', '--network', 'crossrealm-chronicles-server_default', 'alpine', 'wget', '-qO-', url], { encoding: 'utf8', timeout: 60000 });
  return out.trim();
}
function hostSnapshot(url) {
  return execFileSync('curl.exe', ['-sS', '--max-time', '20', url], { encoding: 'utf8', timeout: 30000 }).trim();
}

let body = null;
let via = null;
try { body = dockerSnapshot(ENDPOINT); via = `docker compose network (${ENDPOINT})`; }
catch (e) { console.error('fetch: 容器通道失败（%s）——退到 host 直连', String(e.message ?? e).slice(0, 120)); via = null; }
if (body === null) {
  try { body = hostSnapshot(HOST_FALLBACK); via = `host direct (${HOST_FALLBACK})`; }
  catch (e) { console.error('fetch: host 通道也失败（%s）', String(e.message ?? e).slice(0, 120)); process.exit(1); }
}

let parsed;
try { parsed = JSON.parse(body); }
catch { console.error('fetch: 响应不是 JSON：%s', body.slice(0, 160)); process.exit(1); }
if (parsed?.enabled !== true) {
  console.error('fetch: 遥测未启用（enabled !== true）——不写入 JSON');
  process.exit(1);
}

const payload = {
  generated: new Date().toISOString(),
  source: via,
  note: '本机 compose 栈实抓：docker compose -f server/docker-compose.yml up -d · docker run --network crossrealm-chronicles-server_default alpine wget -qO- http://gateway:8080/api/telemetry/summary-rollup',
  endpoint: '/api/telemetry/summary-rollup',
  real: true,
  windowDays: parsed.days ?? null,
  total: parsed.total ?? null,
  totals: parsed.totals ?? {},
  byDayAndType: parsed.byDayAndType ?? [],
};
writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
const t = parsed.totals ?? {};
console.log('fetch: wrote %s · via %s · total=%s · boss_kill=%s canon_open=%s loadtest=%s smoke=%s stress-probe=%s', OUT, via, parsed.total, t.boss_kill, t.canon_open, t.loadtest, t.smoke, t['stress-probe']);
