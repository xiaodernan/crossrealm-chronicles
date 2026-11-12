/**
 * AI Lore QA — dev-time 工具：把游戏里的回声/母题小段送 LLM 做中文一致性/史诗语气检查，
 * 输出供人工 review 的 markdown，绝不进入游戏运行时、绝不替人改文案。
 *
 * 用法：
 *   LLM_API_KEY=<key> LLM_BASE_URL=https://wkapi.pro/v1 LLM_MODEL=gpt-6-sol \
 *     node scripts/ai-lore-assist.mjs [n] [output.md]
 *
 * - 不传参时默认生成 3 段"回声描述"替代品并由人工挑选
 * - 输出 markdown 到 stdout 或指定路径
 * - 没有 LLM_API_KEY 时直接 exit(1)，不做任何网络调用（离线/CI 安全）
 */
import fs from 'fs';

const BASE = (process.env.LLM_BASE_URL ?? 'https://wkapi.pro/v1').replace(/\/$/, '');
const KEY = process.env.LLM_API_KEY;
const MODEL = process.env.LLM_MODEL ?? 'gpt-6-sol';
const N = Number(process.argv[2] ?? 3);
const outPath = process.argv[3] ?? null;

if (!KEY) {
  console.error('ERROR: LLM_API_KEY not set. This tool requires an explicit key — refusing to guess or fall back.');
  process.exit(1);
}

const FRANCHISES = [
  'wizard（魔法位面）', 'interstellar（星际位面）', 'upside（倒影位面）',
  'middle-earth（中洲）', 'family（黑帮位面）', 'cyber（赛博深渊）',
  'homecoming（返乡）', 'gloom（薄暮幽暗）', 'radiant（辉煌圣域）',
];

const SYSTEMTXT = `你是一个中文游戏文案的资深润色师。游戏叫《跨界纪元》，是史诗幻想题材。
返回 JSON 数组，每个元素只有一个 "echo" 字段（中文，40-80 字，史诗、克制、含蓄，不用现代口语，不用 emoji）。不要输出其他任何文字。`;

const userPrompt = `请为以下 ${N} 个母题各写一段"回声描述"短文本（每段仅描述视觉印象+氛围，不提游戏系统，40-80 字）：
${FRANCHISES.slice(0, N).map((f, i) => `${i + 1}. ${f}`).join('\n')}

返回格式：
[{"echo":"..."},{"echo":"..."}]`;

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 60_000);

try {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEMTXT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1024,
    }),
    signal: controller.signal,
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('ERROR: HTTP', res.status, body.slice(0, 500));
    process.exit(1);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  // 先尝试 JSON 数组
  let parsed = null;
  try { parsed = JSON.parse(content); } catch { parsed = null; }

  const header = `# AI Lore QA — 候选文案\n> 本次会话使用 base=${BASE} model=${MODEL}\n> 生成仅供人工 review；**不保证最终文案以此定稿**\n\n`;
  const body = parsed
    ? parsed.map((item, i) => `## 候选 ${i + 1}\n\n${item.echo ?? ''}\n`).join('\n')
    : `## 原始输出\n\n\`\`\`\n${content}\n\`\`\`\n`;

  const md = header + body + '\n';
  if (outPath) {
    fs.writeFileSync(outPath, md, 'utf8');
    console.log('wrote', outPath);
  } else {
    console.log(md);
  }
} finally {
  clearTimeout(timer);
}
