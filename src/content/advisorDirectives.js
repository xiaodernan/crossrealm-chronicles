/**
 * 星轨顾问的「指引协议」—— 把模型的回答翻译成游戏里的一次真实跳转（W-Z286）。
 *
 * ## 为什么需要这一层
 *
 * 顾问此前只会「说」：回答完，玩家还是得自己找日志在哪、典籍在哪、占火在哪。
 * 协议让回答里自然地提到某个目的地时，把它变成一颗真按钮——点一下就落到那一格。
 * 这就是「大模型分析能力 → 界面状态流转」的最小闭环：模型定方向，客户端管落地，
 * 后端的 system prompt 负责许诺协议，前端的白名单负责不许它说瞎话。
 *
 * ## 双通道，缺一不可
 *
 * 1. **正式通道**：服务端 system prompt（`system-prompt.txt`）许诺的 `⟦guide:slug⟧` 标记。
 *    新 backend 部署后，模型会在回答末尾挂一个标记；客户端按白名单放行。
 * 2. **降级通道**：老 backend / 离线工时，模型不会挂标记——按 tab 的 zh/en 文案别名
 *    在回答正文里做 substring 命中（最多两处、去重、忽略「过短」的别名）。
 *    命中只决定「出不出一颗按钮」，不替玩家按下去。
 *
 * ## 红线
 *
 * - 不可信文本永远只进 `textContent`，按钮文案只从 i18n 表展开，slug 只从白名单进。
 * - 从不自动跳转；必须玩家点。「指」不等于「拉」，玩法节奏是设计的一部分。
 */
/**
 * 白名单：顾问合法指向的子页签。键直接写文案键（与 `JOURNAL_EXTRA_TABS` 同名同值——
 * content/ 层不允许 import ui/，那一层由 `chunk-core` 编译，指过去会把 `chunk-core`
 * 连到 `chunk-ui` 上（B37 那条"core 是叶子"）。同步由 `tests/advisor-directives.test.js`
 * 钉住：registry 里改键而这里不改，测试会红。
 */
export const DIRECTIVE_TABS = Object.freeze({
  canon: 'journal_tab_canon',
  codex: 'journal_tab_codex',
  flame: 'journal_tab_flame',
  trilance: 'journal_tab_trilance',
  path: 'journal_tab_path',
  vigil: 'journal_tab_vigil',
  pass: 'journal_tab_pass',
  ending: 'journal_tab_ending',
  memory: 'journal_tab_memory',
  bestiary: 'journal_tab_bestiary',
  legends: 'journal_tab_legends',
  season: 'journal_tab_season',
  trial: 'journal_tab_trial',
  side: 'journal_tab_side',
  skills: 'journal_tab_skills',
  echoes: 'journal_tab_echoes',
  dungeons: 'journal_tab_dungeons',
  cg: 'journal_tab_cg',
});

const SLUGS = new Set(Object.keys(DIRECTIVE_TABS));
const GUIDE_TOKEN = /⟦guide:([a-z][a-z-]*)⟧/g;
const MAX_DIRECTIVES = 3;

/** 剥掉正式通道的标记（无论白名单与否，都从正文里拿掉——玩家不该读到协议文本） */
export function stripAdvisorDirectives(text) {
  return String(text ?? '')
    .replace(GUIDE_TOKEN, '')
    .replace(/\s*\n{3,}|\n\s*\n/g, (m) => m.length > 2 ? '\n\n' : m)
    .trimEnd();
}

/**
 * 解析顾问回答里的落点。
 * @returns {{ slugs: string[] }} 至多 MAX_DIRECTIVES 个、去重、白名单内
 */
export function parseAdvisorDirectives(text) {
  const raw = String(text ?? '');
  const seen = new Set();
  let m;
  // 1) 正式通道：`⟦guide:slug⟧`
  GUIDE_TOKEN.lastIndex = 0;
  while ((m = GUIDE_TOKEN.exec(raw)) !== null) {
    const slug = m[1];
    if (SLUGS.has(slug)) seen.add(slug);
    if (seen.size >= MAX_DIRECTIVES) break;
  }
  return { slugs: [...seen] };
}

/**
 * 降级通道：按 tab 文案别名在正文里做 substring 命中（给老 backend 用）。
 * 别名 = 文案键展开后的 zh/en 正文 +「·」左右两段（去空白、长度 ≥ 2、过滤过于通用的词）。
 * @param {string} rawText 未清洗的模型回答
 * @param {(slug: string) => string} labelOf 取 tab 文案（测试里可注入）
 */
export function aliasFallbackDirectives(rawText, labelOf) {
  const body = String(rawText ?? '');
  const out = [];
  for (const slug of SLUGS) {
    if (out.length >= 2) break;
    const label = String(labelOf(slug) ?? '');
    const parts = label.split('·').map((p) => p.trim()).filter((p) => p.length >= 2);
    const cands = new Set([label.trim(), ...parts]);
    // 过滤通用到不该出按钮的词
    for (const bad of ['星轨', 'Starpath', 'starpath']) cands.delete(bad);
    const hit = [...cands].some((c) => c.length >= 2 && body.toLowerCase().includes(c.toLowerCase()));
    if (hit) out.push(slug);
  }
  return out;
}

/** 汇总：正式通道优先；为空再走降级通道 */
export function resolveAdvisorDirectives(rawText, labelOf) {
  const primary = parseAdvisorDirectives(rawText).slugs;
  if (primary.length) return primary;
  return aliasFallbackDirectives(rawText, labelOf);
}
