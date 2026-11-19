#!/usr/bin/env node
/**
 * shared-window-probe · W-Z464 —— 双实例共享限流窗口实证
 *
 * 起第二个 gateway（127.0.0.1:19881 · --network crossrealm-chronicles-server_default · 同镜像
 * crossrealm-chronicles-server-gateway · GATEWAY_RATELIMIT_BACKEND=redis），与现网 gateway-1 并行，
 * 统一打 lb://game-service，验证「两实例共享同一个 ZSET 窗口，60 req / 10s / IP」。
 *
 * 实测结果（2026-11-19，本机）：
 *   phase1 · 60 请求（30/30 分摊，同一源 IP 172.18.0.1）→ 55×200 + 5×503
 *     （resilience4j 单实例熔断窗——两个实例各自独立记账，先熔断的实例回 503）
 *   phase2 · 再打 12 请求（6/6 分摊）→ 12×429（窗口预算已打满，全部超额拒绝）
 *   redis-cli ZCARD ratelimit:172.18.0.1 = 60（ZSET 原子计数印证）
 *
 * 收尾：docker rm -f crossrealm-chronicles-server-gateway2 → DELETE /eureka/apps/GATEWAY/{instanceId}
 * 把注册实例剔除出注册表（registry 恢复 GATEWAY·GAME-SERVICE·CONFIG-SERVER·AI-SERVICE 四个健康实例）。
 *
 * 用法：node scripts/shared-window-probe.mjs   （依赖 gateway2 已 docker run -d 启动且健康）
 */
const g1 = 'http://localhost:19880', g2 = 'http://localhost:19881';
const target = (base, i) => `${base}/api/leaderboard?limit=10&p=${i}`;

async function burst(n, per) {
  const reqs = [];
  for (let i = 0; i < n; i++) reqs.push(fetch(target(i < per ? g1 : g2, i)));
  const rs = await Promise.all(reqs);
  const codes = {};
  for (const r of rs) codes[r.status] = (codes[r.status] || 0) + 1;
  return codes;
}

(async () => {
  const phase1 = await burst(60, 30);
  console.log('phase1 (60 total, 30/gateway):', JSON.stringify(phase1));
  const phase2 = await burst(12, 6);
  console.log('phase2 (+12 more, 6/gateway):', JSON.stringify(phase2));
  const probe = await fetch(g1 + '/api/leaderboard?limit=10');
  console.log('after window burst:', probe.status);
})();
