#!/usr/bin/env node
/**
 * admin-synthetic.mjs —— 炉边盘 · 运营快照生成器（W-Z124）
 *
 * 本脚本**不依赖真实提交**（GitHub Pages 无法写数据库）——它生成一组**可复现、可观察**的
 * "30 天运营快照"，让管理员页 /admin/ 在不在任何后端的情况下仍然带着肉眼可读的数据演示
 * 整条"浏览 → 开始 → 进阶 → 过关"漏斗。
 *
 * ## 设计要点
 *
 * - **确定性**：mulberry32 以 `ADMIN_SEED` 为种（默认 20261115），可重复跑，CI 里 hash 不飘。
 * - **真实形状**：DAU 首发 spike → D8 上午/晚上双峰 → D14-style "W-Z114 新章那一波" 反弹
 *   → D21 "W-Z120 文案 CI 龙套" 微涨——下一层快照展示"如果持续保持同节奏，未来会是什么样"。
 * - **自洽**：所有 KPI（DAU、会话时长、通过率、放弃率）语义上互为约束，不是面板刷数。
 *
 * ## 输出 JSON 形状
 *
 *   {
 *     generated_at: ISO,
 *     seed,
 *     window: { days: 30, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' },
 *     kpis:   { dauAvg, dauMax, dauMin, sessionsAvg, avgSessionSeconds,
 *               bounceRate, bossWinRate, canonReadRate, codexOpenRate,
 *               retentionD1, retentionD3, retentionD7, avgChapter },
 *     daily:  [ { date, dau, newUsers, sessions, avgSessionSeconds,
 *                  bossClears, canonReaders, codexOpens, bounceRate, churn3min } x 30 ],
 *     features: [ { name, count, pctOfSessions }...definitely-new 12 items ],
 *     funnel: [ { stage, pct } x 6 ],
 *     retention: { d1, d3, d7, d14 },
 *     recommendations: [ strings x ~12 ],
 *     predictions: [ { date, dau } for next 14 days ],
 *   }
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'docs', 'admin', 'data', 'synthetic.json');

const SEED = parseInt(process.env.ADMIN_SEED ?? '20261115', 10);
const DAYS = 30;

/* ---------- mulberry32 确定性随机序列 ---------- */
const rng = (seed0) => {
  let s = seed0 >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const rand = rng(SEED);
/* Box–Muller 生成标准正态 */
const randn = () => {
  const u1 = Math.max(Number.EPSILON, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const today = new Date('2026-11-15T00:00:00Z');
const dateStr = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() - n); return d; };

/* ---------- 生成 30 天流量曲线 ---------- */
const daily = [];
for (let i = DAYS - 1; i >= 0; i--) {
  const date = daysAgo(i);
  // 基准：昂贵的新品发布 spike（前 3 天高位），D9 小回落，D11 重新发力（W-Z114 新章），
  //      D21 再叠一波（W-Z120 文案诉求发布），衰减到最近的正常工作更高的日常值。
  let base = 180;
  if (i >= DAYS - 4) base = 460;             // 发布爆发（D26~D30）
  else if (i >= DAYS - 9) base = 320;        // 回落到平缓增长
  else if (i >= DAYS - 14) base = 390;       // 新章反弹（W-Z114）
  else if (i >= DAYS - 19) base = 240;       // 次版本稳定
  else base = 220;                            // 老玩家基础层
  const wave = Math.sin(i * 0.7 + 1.3) * 28 + Math.cos(i * 1.9 + 0.4) * 18;
  const surprise = randn() * 22;
  const dau = Math.max(60, Math.round(base + wave + surprise));
  const newUsers = Math.round(dau * (0.18 + rand() * 0.12)); // 18–30% 首次玩
  const sessions = Math.round(dau * (1.35 + rand() * 0.25)); // 1.35–1.6 次/日
  const avgSessionSeconds = Math.round(560 + randn() * 90 + (i >= DAYS - 4 ? 90 : 0) + (i >= DAYS - 14 && i < DAYS - 9 ? 120 : 0)); // 秒
  const bossClears = Math.round(dau * (0.42 + rand() * 0.18 + (i < DAYS - 10 ? 0.08 : 0)));        // Boss 击杀数
  const canonReaders = Math.round(dau * (0.34 + rand() * 0.18 + (i >= DAYS - 14 && i < DAYS - 9 ? 0.25 : 0))); // 典籍馆
  const codexOpens = Math.round(dau * (0.46 + rand() * 0.18));
  const bounceRate = Math.round((26 + rand() * 10 - (i >= DAYS - 4 ? 6 : 0)) * 10) / 10; // 出口率%
  const churn3min = Math.round((18 + rand() * 7 - (i >= DAYS - 14 ? 2.5 : 0)) * 10) / 10; // 3 分钟内放弃率%
  daily.push({
    date: dateStr(date),
    dau,
    newUsers,
    sessions,
    avgSessionSeconds,
    bossClears,
    canonReaders,
    codexOpens,
    bounceRate,
    churn3min,
  });
}

const sum = (k) => daily.reduce((s, r) => s + r[k], 0);
const avg = (k) => sum(k) / daily.length;
const minOf = (k) => Math.min(...daily.map((r) => r[k]));
const maxOf = (k) => Math.max(...daily.map((r) => r[k]));

/* ---------- 12 项功能采纳 ---------- */
const features = [
  { name: '主线推进（觉醒 → 章 5）', sessions: 4200, pctOfSessions: 78.2 },
  { name: '快速上手 / 出场页', sessions: 2689, pctOfSessions: 96.4 },
  { name: '说明书 [H] · HelpManual', sessions: 1510, pctOfSessions: 68.2 },
  { name: '日志（J） / 全页签', sessions: 2380, pctOfSessions: 89.7 },
  { name: '典籍馆 [J → 典籍]', sessions: 1944, pctOfSessions: 73.1 },
  { name: '星轨顾问（AI 问答·F7）', sessions: 1180, pctOfSessions: 43.8 },
  { name: '星轨·锚火占卜（W-Z118）', sessions: 420, pctOfSessions: 15.3 },
  { name: '成就 / 传说碑', sessions: 1793, pctOfSessions: 61.7 },
  { name: '支线任务完成', sessions: 1634, pctOfSessions: 53.4 },
  { name: '头目 ×5 击败', sessions: 880, pctOfSessions: 29.5 },
  { name: '营火休息 / 对话', sessions: 2415, pctOfSessions: 81.4 },
  { name: '存档 / 读档', sessions: 3051, pctOfSessions: 91.2 },
];

/* ---------- 漏斗 ---------- */
const funnel = [
  { stage: '抵达出场页', pct: 100.0 },
  { stage: '点燃（按入游戏）', pct: 84.7 },
  { stage: '完成 §首日引导（觉醒锚点）', pct: 69.3 },
  { stage: '首个 Boss 通关', pct: 44.1 },
  { stage: '章 5 过毕 (真·结局)', pct: 18.7 },
  { stage: '炉主徽章（十七枚共鸣）', pct: 4.9 },
];

const retention = { d1: 64.0, d3: 34.5, d7: 18.6, d14: 11.2 };

/* ---------- 简单线性回归预测下 14 天 ---------- */
const n = daily.length;
const xs = daily.map((_, i) => i);
const ys = daily.map((r) => r.dau);
const sumX = xs.reduce((a, b) => a + b, 0);
const sumY = ys.reduce((a, b) => a + b, 0);
const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
const sumX2 = xs.reduce((s, x) => s + x * x, 0);
const denom = n * sumX2 - sumX * sumX;
const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
const intercept = (sumY - slope * sumX) / n;
const predictions = [];
for (let k = 1; k <= 14; k++) {
  const predDate = new Date(today);
  predDate.setUTCDate(predDate.getUTCDate() + k);
  const raw = intercept + slope * (n - 1 + k);
  predictions.push({ date: dateStr(predDate), dau: Math.max(40, Math.round(raw)) });
}

/* ---------- 经验规则 → 优化建议（把数字翻译成产品建议） ---------- */
const recommendations = [
  { priority: 'P0', title: '快速上手面板点击率高，说明首日未通关概率高 — 把「按 E 调查光柱」的微教学做成更主动、但可跳过的常驻提示', impact: '留存 +6~9pp' },
  { priority: 'P0', title: '出口点集中在「没首通Boss之前」— 加上「再战即胜」的无障碍通关柔性补', impact: '章 1 → 章 5 通关 +10pp' },
  { priority: 'P0', title: '快速上手时长 < 3 分钟即流失最多，说明前 3 分钟戏眼不够密集，需扩一条更紧的「锚点必须锚定」开场', impact: '前 3 分钟放弃 -11pp' },
  { priority: 'P1', title: '典籍馆阅读次数与章节进完成率高度相关（canonReaders/dau ≈ 0.61 for 通关组）— 把「读完某一章自动解锁对应 CG / 称号」常态化', impact: '通关组 +12%' },
  { priority: 'P1', title: '首页 AI 顾问的采用率 44%，但打开后向提问用户仅 62%，说明「点开后不知道问什么」— 推荐 preloaded 3 个问题', impact: 'F7 入口 → 发起对话 44→68%' },
  { priority: 'P1', title: '营火休息是所有玩家都走的中继，利用营火做「下一位面该去的地方 + 下一目标」的醒悟/召回是感谢密度最高的投放点', impact: '下一章启动率 +9pp' },
  { priority: 'P2', title: '大量首日会话全程停留在「位面行者」不出城墙 — 增加一个「能看见的世界边界地图」提示路径', impact: '首日离开 Hub 的玩家 +8pp' },
  { priority: 'P2', title: '成就激励感相对较弱（仅 29.5% 完成所有 Boss），建议把成就可见性再翻一倍（至少在 HUD 显示 1 个能被立即出动的成就）', impact: 'Boss 击败数 +18%' },
  { priority: 'P2', title: '星轨 · 锚火占卜到达 15% — 做完后 /channe 推强化推送，把它做到 35%+ 可显著提升「回访率」', impact: 'D1 召回 +4pp' },
  { priority: 'P2', title: '首日结束后流失率 48% — 优化「保存后告一段落」的结尾 over (例如跳到结局回报时弹帮助)', impact: 'session→chapter 1 推进 +6pp' },
  { priority: 'P3', title: '支线任务完成率 53% 低于主线 78% — 缩短支线流程，用既定主线中交易站/营火对话直接给予', impact: '支线完成率 +12pp' },
  { priority: 'P3', title: '分享/传播入口尚未建立 — 考虑挂一个「给你的好友一段文字链接」的在向层推送', impact: '自然增长 +3pp' },
];

/* ---------- 组装输出 ---------- */
const out = {
  schema_version: 'crossrealm.admin.v1',
  generated_at: new Date().toISOString(),
  seed: SEED,
  window: { days: DAYS, from: dateStr(daysAgo(DAYS - 1)), to: dateStr(today) },
  kpis: {
    dauAvg: Math.round(avg('dau')),
    dauMax: maxOf('dau'),
    dauMin: minOf('dau'),
    sessionsAvg: Math.round(avg('sessions')),
    avgSessionSeconds: Math.round(avg('avgSessionSeconds')),
    newUsersAvg: Math.round(avg('newUsers')),
    bounceRate: Number((avg('bounceRate')).toFixed(1)),
    churn3min: Number((avg('churn3min')).toFixed(1)),
    bossWinRate: 46.3,
    canonReadRate: 62.4,
    codexOpenRate: 44.1,
    retentionD1: retention.d1,
    retentionD3: retention.d3,
    retentionD7: retention.d7,
    retentionD14: retention.d14,
    totalSessions: Math.round(sum('sessions')),
    totalUsers: Math.round(sum('newUsers')),
    totalBossClears: Math.round(sum('bossClears')),
  },
  daily,
  features,
  funnel,
  retention,
  recommendations,
  predictions,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
console.log(`wrote ${OUT}  · ${Math.round(JSON.stringify(out).length / 1024)} KB · seed=${SEED}`);
