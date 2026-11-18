#!/usr/bin/env node
/**
 * 2026-11-18 W-Z355：MEASURED 漏斗——从真实遥测快照里挤出 honest 漏斗读数。
 *
 * 为什么存在：Admin 首屏 KPI 全是 SYNTHETIC（seed=20261117 确定性演示）——
 * 852/620 的事件里 51% 只有演示价值。真正 MEASURED（verify 冒烟 + EmberLane/Oracle 实测 +
 * stress-load 洪测亲手写进落账）只有三类 human-adjacent-by-design 事件：
 *   · boss_kill   —— 任何走到 Boss 那一站的玩家（本地 verify 的 boss 探针 × 实际玩家，不区分）
 *   · canon_open  —— 打开了《余响集》原典（同上）
 *   · smoke       —— 冒烟探针（可信但低信噪比）
 * 其余全是合成探针（loadtest / stress-probe），不应当混账。
 *
 * 输出 `docs/admin/data/measured-funnel.json`——Admin KPI 卡（meas_l24 / tr24）懒加载它。
 * 诚实边界写在文件里：每一行“firstScherKpi=XXX/Y→% 说明”都写清楚公式，不外推、不伪造。
 *
 * 真实留存（cohort signal）现阶段窗口只有 3 天数据，无法计算真 D1/D3/D7/D14——只能说
 * “能看到 smoke 由 12→25→26=一天内反复压测留眼皮、需要生产端真接入才能做分群”。
 * 这里不做任何伪分群推断；Admin 页把这一行禁语。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'docs/admin/data/telemetry-summary.json');
const OUT = resolve(ROOT, 'docs/admin/data/measured-funnel.json');

const s = JSON.parse(readFileSync(SRC, 'utf8'));
const t = s.totals ?? {};
const bks = Number(t.boss_kill ?? 0);
const cOpen = Number(t.canon_open ?? 0);
const smoke = Number(t.smoke ?? 0);
const loadtest = Number(t.loadtest ?? 0);
const stress = Number(t['stress-probe'] ?? 0);
const total = Number(s.total ?? bks + cOpen + smoke + loadtest + stress);

const humanAdjacent = bks + cOpen;
const probeNoise = loadtest + stress;
const firehoseRatio = total > 0 ? (probeNoise / total) : 0;

const bossKillShare = total > 0 ? (bks / total) : 0;
const canonShare = total > 0 ? (cOpen / total) : 0;
const canonPerKill = bks > 0 ? (cOpen / bks) : null;
// 严格语义：這個比代表“每 Boss 被击杀多少次会有一名玩家打开典籍”——不是 retention，不是 conversion。
// 不提供任何外推。

const payload = {
  generated: new Date().toISOString(),
  source: SRC,
  fromSnapshot: { generated: s.generated ?? null, source: s.source ?? null },
  note: 'MEASURED（本机 compose 落账事件 · verify 冒烟 + stress-load 洪测 + Ember/Oracle 实测亲手写）——admin 首屏其他卡 = SYNTHETIC（seed=20261117），这是 admin 里唯一和真实玩家行为链沾边的一条。不做留存分群推断——只有约 3 天窗口，伪分群等于撒谎。',
  windowDays: s.windowDays ?? 14,
  totals: { bossKill: bks, canonOpen: cOpen, smoke, loadtest, stressProbe: stress, total },
  derived: {
    bossKillShare: +bossKillShare.toFixed(4),
    canonOpenShare: +canonShare.toFixed(4),
    humanAdjacentShare: total > 0 ? +(humanAdjacent / total).toFixed(4) : 0,
    firehoseNoiseRatio: +firehoseRatio.toFixed(4),
    canonOpenPerBossKill: canonPerKill === null ? null : +canonPerKill.toFixed(4),
  },
  interpretation: {
    bossKillLine: `Boss 击杀 ${(bossKillShare * 100).toFixed(2)}%（boss_kill=${bks} · MEASURED）`,
    canonLine: `典籍开启 ${(canonShare * 100).toFixed(2)}%（canon_open=${cOpen} · MEASURED）`,
    ratioLine: `≈ ${canonPerKill === null ? 'n/a' : canonPerKill.toFixed(4)}「开典籍」/「Boss 击杀」——MEASURED，非外推，没有 D1/D3/D7 retention 分群（只有 3 天窗口，伪分群等于撒谎）`,
    note: `probe 火线占比 ${(firehoseRatio * 100).toFixed(2)}%（loadtest ${loadtest} + stress-probe ${stress} = ${probeNoise} / ${total}）；真正与玩家行为相邻段 = boss_kill ${bks} + canon_open ${cOpen} = ${humanAdjacent} 事件（${(humanAdjacent / total * 100).toFixed(2)}%）。任何「留存曲线」在这组窗口上都是造假，不做承诺。`,
  },
};
writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log('wrote %s: total=%d · humanAdjacent=%d · firehose=%s · bossKill=%s · canon=%s',
  OUT, total, humanAdjacent, firehoseRatio.toFixed(4), bossKillShare.toFixed(4), canonShare.toFixed(4));
