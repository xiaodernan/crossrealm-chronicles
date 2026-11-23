import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 实测卡的来源账（W-Z518 · 2026-11-23）
 *
 * ## 这一门为什么存在
 * 炉边盘的 `#measuredPanel` 有 42 张 `meas_l*` 卡，标题都写着"实测"。W-Z518 首扫真数是：
 * **20 张点得出一个在场的来源文件，22 张点不出** —— 那 22 张上的数字，玩家和管理者都无从查起，
 * 只能相信当初写卡片的人没抄错。这正是需求九最怕的形状：一张看起来全是真数据的页面，
 * 实际上有一半的格子是**不可核对的真话**。
 *
 * ## 为什么是"名单只准变小"而不是"当场全红"
 * 一次把 22 张卡都补上来源是不诚实的快（每张都要回到它自己的产物去对字段），
 * 而把这条门设成"必须 0 张无来源"会让它上线第一天就红着被 @ts-ignore 掉。
 * 于是按本仓调色板残留钉板同一形状：今天测到的 22 张逐条登记，新增一张就点名，
 * 少一张必须同时把名单改小（名单变小而代码没改，说明扫描器坏了，也要红）。
 *
 * ## 断链比无来源更糟
 * 卡片指着一个**已经不存在**的产物文件，读的人会以为"这是可查的"。所以 `brokenRefs` 必须恒空，
 * 这一条不给名单。
 *
 * ## 尺子为何内联
 * `scripts/admin-measured-audit.mjs` 是同一把尺的 CLI 版。这里把十几行扫描逻辑内联而不是
 * `import` 那个 `.mjs`：CI 的 Vite 对 `scripts/` 下脚本的 SSR 变换曾在导入点报
 * `Invalid or unexpected token`（本机复现不出）。判据自己拿住尺子，少一条环境依赖。
 */

const ROOT = process.cwd();
const SOURCE = new RegExp([
  '(?:docs\\/admin\\/)?data\\/[A-Za-z0-9._\\-*]+\\.(?:json|md|txt|csv)',
  'docs\\/[A-Za-z0-9._\\-/]+\\.(?:md|json|txt)',
  'scripts\\/[A-Za-z0-9._\\-/]+\\.(?:mjs|cjs|json|ps1|py|js)',
  'server\\/[A-Za-z0-9._\\-/]+\\.(?:ps1|xml|yml|yaml|java|json)',
  '(?:docs|server|scripts)\\/[A-Za-z0-9._\\-/]+\\/',
].join('|'), 'g');

function resolveRef(ref) {
  return ref.startsWith('data/') ? join(ROOT, 'docs', 'admin', ref) : join(ROOT, ref);
}

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

function cardRows(html) {
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

function audit(html) {
  const rows = cardRows(html);
  const ids = rows.map((r) => r.id);
  return {
    cards: ids.length,
    withSource: rows.filter((r) => r.refs.length > 0).length,
    unbacked: rows.filter((r) => r.unbacked).map((r) => r.id),
    brokenRefs: rows.filter((r) => r.missing.length).map((r) => ({ id: r.id, missing: r.missing })),
    reconciles: rows.length === new Set(ids).size && rows.every((r) => (r.refs.length > 0) !== r.unbacked),
  };
}

const html = readFileSync(join(process.cwd(), 'docs', 'admin', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const summary = audit(html);

/** 2026-11-23 实测基线（`node scripts/admin-measured-audit.mjs`）。只准变小。 */
const BASELINE_UNBACKED = [
  'meas_l1', 'meas_l2', 'meas_l3', 'meas_l4', 'meas_l5', 'meas_l6', 'meas_l7', 'meas_l8',
  'meas_l9', 'meas_l10', 'meas_l11', 'meas_l12', 'meas_l13', 'meas_l14', 'meas_l15', 'meas_l16',
  'meas_l17', 'meas_l30', 'meas_l34', 'meas_l35', 'meas_l36', 'meas_l37',
].sort();

describe('实测卡的来源对账', () => {
  it('扫描器自洽：卡数 = 有来源 + 无来源，且两者互斥', () => {
    expect(summary.reconciles, `解析漏了卡或判重了：${JSON.stringify(summary)}`).toBe(true);
    expect(summary.cards).toBeGreaterThanOrEqual(40);
    expect(summary.withSource + summary.unbacked.length).toBe(summary.cards);
  });

  it('没有任何一张卡指着不存在的来源（断链比不指更坏：它让人以为可查）', () => {
    expect(summary.brokenRefs, `这些卡指向了不在场的文件：${JSON.stringify(summary.brokenRefs)}`).toEqual([]);
  });

  it('无来源名单与基线逐条相等：新增要点名，变小要当场把名单改小', () => {
    const now = [...summary.unbacked].sort();
    const added = now.filter((id) => !BASELINE_UNBACKED.includes(id));
    const removed = BASELINE_UNBACKED.filter((id) => !now.includes(id));
    expect(added, `这些新卡没有点名任何可查的来源：${added.join(' / ')}`).toEqual([]);
    expect(removed, `这几张卡已经有来源了，把 BASELINE_UNBACKED 改小（名单不许只进不出）：${removed.join(' / ')}`).toEqual([]);
  });

  it('反面证据：把一张卡的来源改指一个不存在的文件，必须被判成断链（不是恒绿）', () => {
    const withRef = cardRows(html).find((r) => r.refs.length >= 1);
    expect(withRef, '一张有来源的卡都没找到 —— 扫描形状变了').toBeTruthy();
    const bogus = withRef.refs[0].replace(/[^/]+$/, 'nope-provenance-check.json');
    const brokenHtml = html.split(withRef.refs[0]).join(bogus);
    expect(brokenHtml, '夹具没真的改动文本').not.toBe(html);
    const s2 = audit(brokenHtml);
    expect(s2.brokenRefs.map((b) => b.id), `改指不存在的文件仍然判得过：${bogus}`).toContain(withRef.id);
    const missing = s2.brokenRefs
      .filter((b) => b.id === withRef.id)
      .flatMap((b) => b.missing);
    expect(missing.some((path) => path.includes('nope-provenance-check')), `断链腿没有交回实际缺失路径：${JSON.stringify(s2.brokenRefs)}`).toBe(true);
  });

  it('反面证据：抹掉某一张卡唯一的来源，它必须落进无来源名单', () => {
    const single = cardRows(html).find((r) => r.refs.length === 1);
    expect(single, '找不到只点一个来源的卡 —— 卡片文本形状变了，这条腿要重设计').toBeTruthy();
    const stripped = html.split(single.refs[0]).join('那一摞产物（来源名已被抹掉）');
    expect(stripped, '夹具没真的改动文本').not.toBe(html);
    expect(audit(stripped).unbacked, `抹掉 ${single.id} 唯一的来源之后它仍不算无来源`)
      .toContain(single.id);
  });
});
