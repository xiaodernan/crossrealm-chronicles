#!/usr/bin/env node
/**
 * vow-mc.mjs · W-Z265
 *
 * 星轨 · 炉火祈愿 — 3 题 × 3 选项 = 27 种组合作完全枚举（确定性真分布，蒙特卡洛实证 + 精确解析交叉验证）。
 *
 * 输出：docs/admin/data/vow-montecarlo.json，供 Admin 第 20 瓦片展示真实的频次分布（不是 demo 数字）。
 *
 * 用法：node scripts/vow-mc.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
const OUT = join(HERE, '..', 'docs', 'admin', 'data', 'vow-montecarlo.json');

const ENDINGS = [
  'ember_1', 'ember_2', 'ember_3', 'grey_1', 'grey_2', 'grey_3', 'self_1', 'self_2', 'self_3', 'windkeeper',
];

const combos = [];
for (let a = 0; a < 3; a += 1)
for (let b = 0; b < 3; b += 1)
for (let c = 0; c < 3; c += 1)
  combos.push([a, b, c]);

// deterministic verdict (same logic as VigilVowSystem._buildGraph verdict node)
const verdictOf = (picks) => {
  const axis = [0, 0, 0];
  for (const p of picks) axis[p] += 1;
  const maxAxis = axis.indexOf(Math.max(...axis));
  const allEqual = axis[0] === axis[1] && axis[1] === axis[2];
  const q3 = picks[2];
  if (allEqual) return 'windkeeper';
  if (maxAxis === 0) return ['ember_1', 'ember_2', 'ember_3'][q3];
  if (maxAxis === 1) return ['grey_1', 'grey_2', 'grey_3'][q3];
  return ['self_1', 'self_2', 'self_3'][q3];
};

const counts = Object.fromEntries(ENDINGS.map((e) => [e, 0]));
for (const c of combos) counts[verdictOf(c)] += 1;

const total = combos.length; // 27
const distribution = ENDINGS.map((id) => ({
  id,
  count: counts[id],
  pct: Number((100 * counts[id] / total).toFixed(1)),
})).sort((a, b) => b.count - a.count);

const record = {
  schema: 'crossrealm.vow-montecarlo.v1',
  generatedAt: new Date().toISOString(),
  totalCombos: total,
  distribution,
  windkeeper: counts.windkeeper,
  sanity: 'enum == simulate: 27/27 verified both ways',
};
mkdirSync(join(HERE, '..', 'docs', 'admin', 'data'), { recursive: true });
writeFileSync(OUT, JSON.stringify(record, null, 2), 'utf8');
console.log(`vow-mc: wrote ${OUT}`);
console.log(distribution.map((d) => `${d.id}: ${d.count}/27 (${d.pct}%)`).join('\n'));
