import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { audit, cardRows } from '../scripts/admin-measured-audit.mjs';

/**
 * 实测卡的来源账（W-Z518 · 2026-11-23）
 *
 * ## 这一门为什么存在
 * 炉边盘的 `#measuredPanel` 有 42 张 `meas_l*` 卡，标题都写着"实测"。今天扫出来的真数是：
 * **20 张点得出一个在场的来源文件，22 张点不出** —— 那 22 张上的数字，玩家和管理者都无从查起，
 * 只能相信当初写卡片的人没抄错。这正是需求九最怕的形状：一张看起来全是真数据的页面，
 * 实际上有一半的格子是**不可核对的真话**。
 *
 * ## 为什么是"名单只准变小"而不是"当场全红"
 * 一次把 22 张卡都补上来源是不诚实的快（每张都要回到它自己的产物去对字段），
 * 而把这条门设成"必须 0 张无来源"会让它上线第一天就红着被 @ts-ignore 掉。
 * 于是按本仓调色板残留钉板同一形状：**今天测到的 22 张逐条登记，新增一张就点名，
 * 少一张必须同时把名单改小**（名单变小而代码没改，说明扫描器坏了，也要红）。
 *
 * ## 断链比无来源更糟
 * 卡片指着一个**已经不存在**的产物文件，读的人会以为"这是可查的"。所以 `brokenRefs` 必须恒空，
 * 这一条不给名单。
 */

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
    expect(JSON.stringify(s2.brokenRefs)).toContain('nope-provenance-check.json');
  });

  it('反面证据：抹掉某一张卡唯一的来源，它必须落进无来源名单', () => {
    // 挑一张**只有**一个来源的卡：抹掉那一处之后它必须变成无来源。
    // 挑多来源的卡不行——抹掉一处还剩一处，判不出变化，那条腿就成了装饰。
    const single = cardRows(html).find((r) => r.refs.length === 1);
    expect(single, '找不到只点一个来源的卡 —— 卡片文本形状变了，这条腿要重设计').toBeTruthy();
    const stripped = html.split(single.refs[0]).join('那一摞产物（来源名已被抹掉）');
    expect(stripped, '夹具没真的改动文本').not.toBe(html);
    expect(audit(stripped).unbacked, `抹掉 ${single.id} 唯一的来源之后它仍不算无来源`)
      .toContain(single.id);
  });
});
