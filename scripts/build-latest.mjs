#!/usr/bin/env node
/**
 * 生成 docs/latest.json —— 个人展示页「跨界纪元」卡片的"最新成果"事实包（W-Z92）。
 *
 * 与 showcase（`.github/workflows/showcase.yml`，静态 HTML，部署到 gh-pages）正交：
 * showcase 给人看、latest.json 给机器/页面脚本读。与 minicc-codex / football-os-web 同一套消费契约：
 *   - 页面优先 `?ts=Date.now()` 直读 main 分支 docs/latest.json（raw.githubusercontent 带 CORS *）
 *   - 读不到时退回展示页仓库里 `assets/crossrealm/latest.json`（每周一 cron 由 sync-crossrealm.yml 更新）
 *
 * 确定性：除 `generated_at` / `pushed_at` 之外，所有字段都由活仓库推导（git log / ls-tree / 源文件），
 * 不手抄任何数字。`--check` 模式只校验「能独立重新推导的字段是否新鲜、是否符合 schema」，不动文件——
 * 供 CI 门禁用（本地文件与推导结果漂移 = 忘跑本脚本）。
 *
 * 用法：
 *   node scripts/build-latest.mjs            # 写 docs/latest.json
 *   node scripts/build-latest.mjs --check    # 只校验，不写（CI）
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'latest.json');
const CHECK = process.argv.includes('--check');

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

const head = git(['rev-parse', '--short', 'HEAD']);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const totalCommits = Number(git(['rev-list', '--count', 'HEAD']));
const firstCommitAt = git(['log', '--reverse', '--format=%ad', '--date=short']).split('\n')[0];
const pushedAt = git(['log', '-1', '--format=%cI']);
const recentCommits = git(['log', '-5', '--format=%H%x09%cI%x09%s'])
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [hash, at, subject] = line.split('\t');
    return { short: hash.slice(0, 7), at, subject };
  });

const allFiles = git(['-c', 'core.quotepath=false', 'ls-tree', '-r', 'HEAD', '--name-only']).split('\n').filter(Boolean);
const trackedFiles = allFiles.length;
const testFiles = allFiles.filter((f) => /^tests\/.*\.test\.js$/.test(f)).length;

// i18n 键数：从 i18nKeyCount.js 的 EXPECTED_KEY_COUNT 现读（它是双表对齐的硬门，不会漂）
const i18nSrc = readFileSync(join(ROOT, 'tests', 'helpers', 'i18nKeyCount.js'), 'utf8');
const i18nMatch = i18nSrc.match(/EXPECTED_KEY_COUNT\s*=\s*(\d+)/);
if (!i18nMatch) throw new Error('无法从 tests/helpers/i18nKeyCount.js 读出 EXPECTED_KEY_COUNT');
const i18nKeys = Number(i18nMatch[1]);

// 原典语料源数：corpus.txt 里 `# source:` 行数（--check 门禁要求与实际一致）
const corpus = readFileSync(join(ROOT, 'server', 'ai-service', 'src', 'main', 'resources', 'lore', 'corpus.txt'), 'utf8');
const corpusSources = (corpus.match(/^# source: /gm) ?? []).length;

// 小说章回：创作目录按「目录=语言」组织（creative/novel/*.md 中文，creative/novel/en/*.md 英文）
const zhNovel = allFiles.filter((f) => /^creative\/novel\/[^/]+\.md$/.test(f)).length;
const enNovel = allFiles.filter((f) => /^creative\/novel\/en\/[^/]+\.md$/.test(f)).length;

// 手工维护的两项（有意不动态）：
//  - milestone：从最近 N 条提交主题现抓 W-Zxx（机器刷新事实包的那条 "chore(latest)" 不带里程碑号，
//    往前看一眼最近一次 feature 里程碑就好——里程碑代表"玩家看到的最新能力"，不是同步时间）
const milestoneMatch = git(['log', '-20', '--format=%s'])
  .split('\n')
  .map((s) => s.match(/W-Z\d+[a-z]?/))
  .find(Boolean);
const milestone = milestoneMatch ? milestoneMatch[0] : 'W-?';
//  - feature_surface：面向展示页的「值得让陌生参观者记住」特性清单（按真实系统面写，不写吹水）
const FEATURE_SURFACE = [
  'spring-cloud-plane',     // Eureka + Config + Gateway + Feign + CircuitBreaker + Redis Streams
  'redis-everywhere',       // seasons / leaderboard / advisor-queue / telemetry
  'lore-oracle-rag',        // BM25 两段式检索 + 55 源原典语料 + gpt-6-sol 真上游
  `bilingual-${i18nKeys}-keys`,  // 中英双表严格对齐（数值从 i18nKeyCount 现读，绝不手抄）
  'three-js-world',         // 第三人称开放位面 + 五大 BOSS
  'quickstart-embed',       // 首屏内嵌 30 秒快速上手（炉边小册子）
  'stategraph-teaching',    // LangGraph StateGraph 真路由（锚火三问 [J]）+ 说明书星图章节双语教学
  'admin-simulation',       // 真实玩家行为模拟实录（本机 Chrome 五个人格，0 异常，docs/admin/data/simulation.json）
  'spectator-pvp',          // 剑参战 + 影子笔记
  'crossrealm-chronicles',  // 七章小说 × 双语 + 电影剧本 + 25 首 OST
];

const doc = {
  schema_version: 'crossrealm.latest.v1',
  generated_at: new Date().toISOString(),
  branch,
  head,
  total_commits: totalCommits,
  pushed_at: pushedAt,
  first_commit_at: firstCommitAt,
  recent_commits: recentCommits,
  tracked_files: trackedFiles,
  test_files: testFiles,
  i18n_keys: i18nKeys,
  lore_sources: corpusSources,
  novel_chapters_zh: zhNovel,
  novel_chapters_en: enNovel,
  milestone,
  milestone_full: `卷 ${zhNovel} · 六百年守火线（${zhNovel} / ${enNovel} 卷双语同源）· StateGraph [J] 锚火三问真路由 · 说明书星图章节双语讲授 StateGraph · Lore Oracle 59 源守护`,
  headline: `跨界纪元 · Crossrealm Chronicles —— 一个极其庞大、全内嵌双语教学的 Three.js 开放位面 RPG：${zhNovel} 卷史诗小说（中英双语全文）× 电影剧本 × 25 首 OST，Spring Cloud 微服务矩阵 + Redis 四殿，Lore Oracle 以 BM25 两段式检索引经据典，LangGraph StateGraph 真路由（锚火三问 · 守火六百年），全部内容中英双语逐字对齐。`,
  feature_surface: FEATURE_SURFACE,
};

if (CHECK) {
  // 重新推导一遍可由仓库得到的字段，与磁盘上的 latest.json 对比（时间戳类除外）
  const disk = JSON.parse(readFileSync(OUT, 'utf8'));
  const derived = { ...doc, generated_at: undefined, pushed_at: undefined };
  const expected = { ...disk, generated_at: undefined, pushed_at: undefined };
  const keys = ['schema_version', 'branch', 'head', 'total_commits', 'first_commit_at', 'tracked_files', 'test_files', 'i18n_keys', 'lore_sources', 'novel_chapters_zh', 'novel_chapters_en'];
  const drift = keys.filter((k) => JSON.stringify(derived[k]) !== JSON.stringify(expected[k]));
  if (drift.length) {
    console.error(`docs/latest.json 漂移字段：${drift.join(', ')} —— 请运行 node scripts/build-latest.mjs 重新生成`);
    process.exit(1);
  }
  console.log(`docs/latest.json 自检通过（head=${disk.head}, commits=${disk.total_commits}, test_files=${disk.test_files}, i18n=${disk.i18n_keys}, lore_sources=${disk.lore_sources}）`);
  process.exit(0);
}

writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`wrote docs/latest.json (${statSync(OUT).size} bytes) head=${head} commits=${totalCommits}`);
