/**
 * 星轨成就质检（W-Z5 切片2）— dev-time：把成就名册全部交给真实大模型做「判语贴地/时代一致/语气」核查。
 * 与 echo-qa.mjs 同一套纪律：
 *   - 工具只产报告，不替人改文案；人（或后续片）复核之后才动内容层；
 *   - LLM_API_KEY 只从环境变量进；无 key → exit(1)（离线/CI 安全，真实外呼只发生在显式带 key 的联调）；
 *   - 输出 stdout 或第二个参数（报告不必入库）。
 *
 * 运行：LLM_API_KEY=… node scripts/ach-qa.mjs [batchSize] [out.md]
 * 注意：achievement title 本就该短促有力（一锤定音），描述该像年鉴里的一行——
 * 判官范畴：可读性 / 语境一致（性别中立、不编造剧情细节）/ 时代一致 / 文案语气质量；
 * 不判「创意好不好」。
 */
import fs from 'fs';
import { ACHIEVEMENTS_EXTRA, ACHIEVEMENTS_POP_CULTURE } from '../src/content/achievements.js';
import { ACHIEVEMENTS } from '../src/game/AchievementSystem.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';

const BASE = (process.env.LLM_BASE_URL ?? 'https://wkapi.pro/v1').replace(/\/+$/, '');
const KEY = process.env.LLM_API_KEY;
const MODEL = process.env.LLM_MODEL ?? 'gpt-6-sol';
const BATCH = Math.max(1, Number(process.argv[2] ?? 10) || 10);
const outPath = process.argv[3] ?? null;

if (!KEY) {
  console.error('ERROR: LLM_API_KEY not set.');
  process.exit(1);
}

const GAME_ACHIEVEMENT_MAIN = [
  { id: 'first-blood', title: STRINGS_ZH['ach_first_blood_title'], desc: STRINGS_ZH['ach_first_blood_desc'] },
  { id: 'parry-master', title: STRINGS_ZH['ach_parry_master_title'], desc: STRINGS_ZH['ach_parry_master_desc'] },
  { id: 'boss-trio', title: STRINGS_ZH['ach_boss_trio_title'], desc: STRINGS_ZH['ach_boss_trio_desc'] },
  { id: 'dungeon-clear', title: STRINGS_ZH['ach_dungeon_clear_title'], desc: STRINGS_ZH['ach_dungeon_clear_desc'] },
  { id: 'charged-10', title: STRINGS_ZH['ach_charged_10_title'], desc: STRINGS_ZH['ach_charged_10_desc'] },
  { id: 'void-slayer', title: STRINGS_ZH['ach_void_slayer_title'], desc: STRINGS_ZH['ach_void_slayer_desc'] },
  { id: 'chaos-lord', title: STRINGS_ZH['ach_chaos_lord_title'], desc: STRINGS_ZH['ach_chaos_lord_desc'] },
  { id: 'skill-master', title: STRINGS_ZH['ach_skill_master_title'], desc: STRINGS_ZH['ach_skill_master_desc'] },
  { id: 'combo-6', title: STRINGS_ZH['ach_combo_6_title'], desc: STRINGS_ZH['ach_combo_6_desc'] },
  { id: 'explorer', title: STRINGS_ZH['ach_explorer_title'], desc: STRINGS_ZH['ach_explorer_desc'] },
  { id: 'lore-scholar', title: STRINGS_ZH['ach_lore_scholar_title'], desc: STRINGS_ZH['ach_lore_scholar_desc'] },
  { id: 'journal-keeper', title: STRINGS_ZH['ach_journal_keeper_title'], desc: STRINGS_ZH['ach_journal_keeper_desc'] },
];

const corpus = [
  ...GAME_ACHIEVEMENT_MAIN.map((a) => ({ ...a, source: 'main' })),
  ...ACHIEVEMENTS_EXTRA.map((a) => ({ id: a.id, title: STRINGS_ZH[a.title], desc: STRINGS_ZH[a.desc], source: 'extra' })),
  ...ACHIEVEMENTS_POP_CULTURE.map((a) => ({ id: a.id, title: STRINGS_ZH[a.title], desc: STRINGS_ZH[a.desc], source: 'pop-culture' })),
];

const SYSTEM = `你是《跨界纪元》成就文案的审稿人。判断每一条成就的 title/desc 是否作为一条**游戏成就**成立。

title 应当：
1) 短、硬、像一块牌子上的字（≤10 字）；
2) 从触发结果里提取精神（不是把事件复述一遍）；
3) 不带时代错误标识（现代网络口语、梗、emoji）。

desc 应当：
1) 一句话说完，比 title 长、比文本段短；
2) 用「你」或无主语，不编造具体情节细节；
3) 与母题/成就id 对得上（半英文的 key 碎片、半截句子、明显缺字，属于 bad）。

评判口径：ok = 入册无须动；warn = 可打磨但语气未变质；bad = 明显错位 / 残字 / 半截 key / 语意残缺。
不判创意好坏，不重写文案。
返回且只返回 JSON 数组（不要 markdown 围栏，不要解释）：
{"id":"<原样 id>","verdict":"ok|warn|bad","issues":["≤30 字的中文问题描述"]}
— ok 时 issues 为空数组；warn=有可商榷之处；bad=确凿错位/残句。

## 游戏机制笔记（判读上下文，别判错方向）
- **Boss 再战链（rematch-*）**：击败 Boss 后出现"再战"锚点，可反复重挑战刷最速；每次再战留一枚「信标」。
  rematch-3「信标猎人」收集的是再战累积的三枚信标——不指"重打某一个 Boss 三次"，
  title 只对应"信标"这一物件，所以不必复述某个 Boss 名。
- **位面试炼（trial-*）**：分层 Boss 连战，层数决定词缀与奖励，HUD 有实时刷怪波次。
- **星轨赛季（season）**：周期换季，ember / tide / gloom / radiant 之一的词缀，赛季徽章进 HUD。
- **次元回声（echo-*）**：四大母题（中洲世界 / 赛博深渊 / 武士残响 / 深空孔径）向母本的致敬 POI，触发即解锁。
- **主线（main）**：118 步推进，章节贯穿 Hub → 灰白森林 → 魔法遗境 → 空间站 → 破碎时线。
- 成就三大来源：main=主线链 · extra=支线/额外挑战 · pop-culture=位面致敬链。
- title 的"牌面表义"允许复用母大纲用词（如"猎人""行者""征服者"）而不必复述触发逻辑。
- desc 允许画外音——不求交代"怎么做"，只求语气像年鉴一行。
`;

async function askBatch(items) {
  const user = `以下是 ${items.length} 条成就（id/来源/称号/描述）：\n` +
    items.map((a, i) => `${i + 1}. id=${a.id} | 来源=${a.source} | 「${a.title}」\n   ${a.desc}`).join('\n');
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      max_tokens: 1536,
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const sse = await res.text();
  let content = '', usage = null;
  for (const rawLine of sse.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) continue;
    const dataLine = line.slice(5).trim();
    if (dataLine === '[DONE]') continue;
    try {
      const j = JSON.parse(dataLine);
      content += j.choices?.[0]?.delta?.content ?? '';
      if (j.usage) usage = j.usage;
    } catch { /* 单行坏 JSON 跳过 */ }
  }
  const details = usage?.prompt_tokens_details ?? usage?.input_token_details ?? {};
  const cached = details.cached_tokens ?? usage?.cached_tokens ?? null;
  usageTotals.prompt += usage?.prompt_tokens ?? 0;
  usageTotals.completion += usage?.completion_tokens ?? 0;
  usageTotals.cached += cached ?? 0;
  usageTotals.callsWithUsage += usage ? 1 : 0;
  process.stderr.write(`  usage: prompt=${usage?.prompt_tokens ?? '?'} completion=${usage?.completion_tokens ?? '?'} cached=${cached ?? '?'}\n`);
  const lo = content.indexOf('[');
  const hi = content.lastIndexOf(']');
  if (lo < 0 || hi < 0) throw new Error(`batch ${items[0]?.id}..: 模型未返回 JSON 数组`);
  return JSON.parse(content.slice(lo, hi + 1));
}

const usageTotals = { prompt: 0, completion: 0, cached: 0, callsWithUsage: 0 };
const results = [];
let calls = 0;
let upstreamAttempts = 0;
for (let i = 0; i < corpus.length; i += BATCH) {
  const batch = corpus.slice(i, i + BATCH);
  process.stderr.write(`ach-qa: batch ${Math.floor(i / BATCH) + 1} (${batch[0].id} .. ${batch[batch.length - 1].id})…\n`);
  let parsed = null;
  for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
    try {
      upstreamAttempts += 1;
      parsed = await askBatch(batch);
      calls += 1;
    } catch (e) {
      if (attempt === 1) {
        process.stderr.write('  batch failed (will retry once): ' + (e?.message ?? e) + '\n');
        continue;
      }
      // 一批失败不带走整轮：记为 error 条目，人审时手动重判
      console.error('batch failed twice:', e?.message ?? e);
      parsed = batch.map((b) => ({ id: b.id, verdict: 'error', issues: [String(e?.message ?? e).slice(0, 60)] }));
    }
  }
  const byId = new Map((parsed ?? []).map((r) => [r.id, r]));
  for (const item of batch) {
    const hit = byId.get(item.id);
    results.push({ ...item, verdict: hit?.verdict ?? 'error', issues: Array.isArray(hit?.issues) ? hit.issues : [] });
  }
}

const counts = { ok: 0, warn: 0, bad: 0, error: 0 };
for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;

const lines = [];
lines.push('# 星轨成就质检（W-Z5 切片2）— 成就名册');
lines.push('');
lines.push(`- 扫描：${results.length} 条 / ${calls} 次上游调用（batch=${BATCH}）/ 模型：${MODEL}`);
lines.push(`- 结论：ok ${counts.ok}　warn ${counts.warn}　**bad ${counts.bad}**　error ${counts.error}`);
lines.push('');
const section = (title, rows) => {
  lines.push(`## ${title}（${rows.length}）`);
  lines.push('');
  if (!rows.length) { lines.push('（无）'); lines.push(''); return; }
  for (const r of rows) {
    lines.push(`### ${r.id} — ${r.verdict} [${r.source}]`);
    lines.push(`- 「${r.title}」`);
    lines.push(`- ${r.desc}`);
    for (const issue of r.issues) lines.push(`- ⚠ ${issue}`);
    lines.push('');
  }
};
section('bad（确凿错位/残句，人工复核后改内容层）', results.filter((r) => r.verdict === 'bad'));
section('warn（可商榷，人工决断）', results.filter((r) => r.verdict === 'warn'));
section('error（本批未能解析，需人工重判）', results.filter((r) => r.verdict === 'error'));
section('ok（抽查即可）', results.filter((r) => r.verdict === 'ok'));

lines.push('');
lines.push(`- 上游用量合计：prompt=${usageTotals.prompt} completion=${usageTotals.completion} cached=${usageTotals.cached} cachedRatio=${usageTotals.prompt > 0 ? (usageTotals.cached * 100 / usageTotals.prompt).toFixed(1) + '%' : 'n/a'} （${usageTotals.callsWithUsage}/${upstreamAttempts} 次上报用量）`);

const md = lines.join('\n') + '\n';
if (outPath) {
  fs.writeFileSync(outPath, md, 'utf8');
  console.log('wrote', outPath);
} else {
  console.log(md);
}
