#!/usr/bin/env node
/**
 * 加载仓库根 .env 到进程环境，然后以 -Dai.live.test（部分 live 测试需要）
 * + Clash 混合端口（127.0.0.1:7897）透传执行 mvn 命令。
 * 用法：node scripts\_live-env.mjs test -Dtest=LoreOracleLiveIntegrationTest
 * （密钥不打印、不写入子进程命令行之外的地方。）
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = { ...process.env };
for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const argLine = '-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 '
  + '-Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897';
const args = ['-o', '-f', join(ROOT, 'server', 'pom.xml'), '-pl', 'ai-service', 'test', '-Dai.live.test=true',
  `-DargLine=${argLine}`, ...process.argv.slice(2)];
const r = spawnSync('mvn', args, { stdio: 'inherit', shell: true, env });
process.exit(r.status ?? 1);
