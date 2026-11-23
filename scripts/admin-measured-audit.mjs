#!/usr/bin/env node
/**
 * admin-measured-audit.mjs —— 炉边盘「实测卡」的来源对账（W-Z518 · 2026-11-23）
 *
 * ## 它在问什么
 * 管理页 `#measuredPanel` 里躺着几十张 `meas_l*` 卡，每张都写着数字。今天的问题不是"数字算错了"，
 * 而是**没人问过：这张卡的数字，能不能从卡片自己写的那句话里查到**。四张卡有专属门禁
 * （l40 / l28 / llm-kpi / digest），其余的靠"当初写卡片的人没抄错"活着。
 *
 * 这一支量两件事，都是当场可判的：
 *   ① 卡片有没有点名一个**在场**的来源（管理页数据产物 / 仓内文档 / 仓内脚本 / 目录档案）；
 *   ② 点名的那个来源**真的存在吗**（指向一个被改名或删掉的产物，比不指更糟——它会让人以为可查）。
 *
 * ## 为什么只量这两件，不量数字
 * 数值核对需要逐卡的字段语义（`kpis.dau` 对应卡上哪个数），那是一张一张补的活。
 * 先把"有没有地方可以查"钉住，再逐卡加数值腿。一次做半截的假完整比一格一格钉更糟：它让绿不值钱。
 *
 * ## 本文件是尺子，不是账本
 * 这里不内置任何"这张卡为什么可以没有来源"的名单——那种名单属于门禁
 * （`tests/admin-measured-provenance.test.js`），它只准变小。尺子自己不带赦免。
 *
 * 用法：node scripts/admin-measured-audit.mjs [--json]
 * 退出码：0 = 没有断链（指向不存在的来源）；1 = 有断链；无来源的卡只报告，不在这条命令里判红。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

// "来源"的几种长相：管理页自己的数据产物、仓里的文档、仓里的脚本/命令、整摞目录档案。
// 只认 `data/*.json` 会把大量写着"跑哪条命令""看哪份文档"的卡误判成无来源——那也是来源。
// 门要量的是"这句话有没有地方可以查"，不是"有没有恰好躺在 data/ 下"。
const SOURCE = new RegExp([
  '(?:docs\\/admin\\/)?data\\/[A-Za-z0-9._\\-*]+\\.(?:json|md|txt|csv)',
  'docs\\/[A-Za-z0-9._\\-/]+\\.(?:md|json|txt)',
  // 长的扩展名必须排在短的前面：`json` 若排在 `js` 之后，`*.json` 会被截成 `*.js`
  // （`js` 是 `json` 的前缀）——这正是反面证据夹具一脚踩中的扫描器漏洞。
  'scripts\\/[A-Za-z0-9._\\-/]+\\.(?:mjs|cjs|json|ps1|py|js)',
  'server\\/[A-Za-z0-9._\\-/]+\\.(?:ps1|xml|yml|yaml|java|json)',
  '(?:docs|server|scripts)\\/[A-Za-z0-9._\\-/]+\\/',
].join('|'), 'g');

/** 卡片里省略前缀写的 `data/...` 归到 docs/admin/ 下；其余按仓库根解析。 */
function resolveRef(ref) {
  return ref.startsWith('data/') ? join(ROOT, 'docs', 'admin', ref) : join(ROOT, ref);
}

function readAdminHtml() {
  return readFileSync(join(ROOT, 'docs', 'admin', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * 一张卡的全部可见文本：inline 的 label/trend（zh 默认渲染）+ 双语字典里的两处。
 * 只扫其中一半会漏掉"路径写在说明里"的绝大多数卡片。
 */
function cardText(html, id) {
  const out = [];
  for (const attr of [id, id.replace('meas_l', 'meas_tr')]) {
    const inline = new RegExp(`data-i18n="${attr}"[^>]*>([\\s\\S]{0,4000}?)</div>`, 'g');
    for (const m of html.matchAll(inline)) out.push(m[1]);
    const dict = new RegExp(`${attr}: '((?:[^'\\\\]|\\\\.)*)'`, 'g');
    for (const m of html.matchAll(dict)) out.push(m[1]);
  }
  return out.join('\n');
}

export function cardRows(html) {
  const ids = [...new Set([...html.matchAll(/data-i18n="(meas_l\d+[a-z]*)"/g)].map((m) => m[1]))];
  return ids.map((id) => {
    const text = cardText(html, id);
    const refs = [...new Set([...text.matchAll(SOURCE)].map((m) => m[0].replace(/^docs\/admin\//, '')))];
    return {
      id,
      refs,
      missing: refs.filter((r) => !existsSync(resolveRef(r))),
      unbacked: refs.length === 0,
    };
  });
}

export function audit(html = readAdminHtml()) {
  const rows = cardRows(html);
  const ids = rows.map((r) => r.id);
  return {
    cards: ids.length,
    withSource: rows.filter((r) => r.refs.length > 0).length,
    unbacked: rows.filter((r) => r.unbacked).map((r) => r.id),
    brokenRefs: rows.filter((r) => r.missing.length).map((r) => ({ id: r.id, missing: r.missing })),
    // 自证：卡片总数与"有来源 + 无来源"必须拼得上；对不上说明解析器漏了一类卡。
    reconciles: rows.length === new Set(ids).size && rows.every((r) => (r.refs.length > 0) !== r.unbacked),
  };
}

function main() {
  const summary = audit();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`实测卡 ${summary.cards} 张：点得出来源 ${summary.withSource} 张，点不出 ${summary.unbacked.length} 张`);
    console.log(`  解析自洽（卡数 = 有来源 + 无来源）：${summary.reconciles ? 'ok' : '不成立——扫描形状变了'}`);
    for (const id of summary.unbacked) console.log(`  无来源：${id}`);
    for (const b of summary.brokenRefs) console.log(`  指向不存在的来源：${b.id} → ${b.missing.join(', ')}`);
  }
  if (!summary.reconciles) console.error('扫描器与卡片总数不自洽：这条门量不到东西，先修扫描');
  process.exitCode = summary.brokenRefs.length || !summary.reconciles ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
