import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 管理页（炉边盘）的数据真位（W-Z517 · 2026-11-23）
 *
 * ## 这一门为什么存在
 * 需求九要的是"用真实数据、看全体用户状态、给下一步措施"。炉边盘已经在做对的事：
 * 合成 KPI 与实测卡片分列、实测卡指名 JSON 产物。但盘点抓到三笔**页面上正在说、代码不背书**的账：
 * 1. 卡片文案写「SYNTHETIC（seed=20261117）」，而 `data/synthetic.json` 与
 *    `scripts/admin-synthetic.mjs` 的种子都是 **20261115** —— 20261117 是**另一个脚本**
 *    （`simulate-players.mjs`）的种子。一句话把两把不同的种子混成了同一把。
 * 2. 三条真在发的事件（`path_draw` / `reader_mirror_unlock` / `chapter_complete`）不在页面的
 *    `known` 名册里 —— 玩家做了这些事，管理页**看不见**，而页面读起来像"都在这"。
 * 3. `known` 是手抄名册。手抄的名册只会过期（B172/B175 同一课），所以这里改成
 *    **从 src/ 现推**发出全集，再与名册双向对账。
 *
 * ## 形状（读代码的人需要先知道这个）
 * 本地遥测的发出有两种写法：`localTelemetry.record('name'` 与
 * `(window.__crossrealmTelemetry)?.record?.('name'`。只认前一种会漏掉一半名册——
 * 而漏掉的那一半正是这次的病。正则两种都吃，另有一条腿盯着"扫到空集"。
 */

const html = readFileSync(join(process.cwd(), 'docs', 'admin', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function jsFilesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFilesUnder(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** 从 src/ 现推"本地遥测在发哪些事件"。 */
function emittedEvents() {
  const found = new Set();
  for (const file of jsFilesUnder(join(process.cwd(), 'src'))) {
    const s = readFileSync(file, 'utf8');
    for (const m of s.matchAll(/\.record\??\.?\(\s*'([a-z_][a-z0-9_]*)'/g)) found.add(m[1]);
    for (const m of s.matchAll(/recordTelemetry\(\s*'([a-z_][a-z0-9_]*)'/g)) found.add(m[1]);
  }
  return [...found].sort();
}

const KNOWN = (() => {
  const m = html.match(/const known = \[([^\]]*)\]/);
  expect(m, 'admin/index.html 里找不到 known 名册 —— 名册换了形状，这条门要先跟着改').toBeTruthy();
  return [...m[1].matchAll(/'([a-z_][a-z0-9_]*)'/g)].map((x) => x[1]);
})();

const LABEL_KEYS = (() => {
  const m = html.match(/const labelKey = \{[^}]*\}/);
  expect(m, '找不到 labelKey 表').toBeTruthy();
  return Object.fromEntries([...m[0].matchAll(/([a-z_][a-z0-9_]*): '(lt_[a-z0-9_]+)'/g)].map((x) => [x[1], x[2]]));
})();

describe('管理页的事件名册 ↔ 代码发出全集（双向）', () => {
  const universe = emittedEvents();

  it('发出全集扫得到东西（扫到空集就会一路绿灯）', () => {
    expect(universe.length, 'src/ 里一个本地遥测事件都没扫到 —— 是形状变了，不是"没有事件"').toBeGreaterThanOrEqual(15);
  });

  it('每一条在发的事件都在管理页名册上（发而不可见 = 管理页少了一块真实状态）', () => {
    const invisible = universe.filter((e) => !KNOWN.includes(e));
    expect(invisible, `这些事件真的在发，但管理页不显示：${invisible.join(' / ')}`).toEqual([]);
  });

  it('名册上每一条都真的有人在发（登记了没人发，页面就永远显示一个假的 0）', () => {
    const ghost = KNOWN.filter((e) => !universe.includes(e));
    expect(ghost, `名册里有 ${ghost.join(' / ')}，但 src/ 里没有任何一处发它`).toEqual([]);
  });

  it('名册不重号，每一格都有 labelKey，且标签 zh/en 各一条、非空', () => {
    expect(KNOWN.filter((v, i) => KNOWN.indexOf(v) !== i), 'known 名册重号').toEqual([]);
    const noKey = KNOWN.filter((e) => !LABEL_KEYS[e]);
    expect(noKey, `这些事件没有 labelKey：${noKey.join(' / ')}`).toEqual([]);
    const defs = [...html.matchAll(/(lt_[a-z0-9_]+): '([^']*)'/g)];
    const bad = KNOWN.map((e) => LABEL_KEYS[e]).filter((k) => {
      const hits = defs.filter((d) => d[1] === k);
      return hits.length !== 2 || hits.some((d) => !d[2].trim());
    });
    expect(bad, `标签必须 zh/en 各一条且非空，这些不对：${bad.join(' / ')}`).toEqual([]);
  });

  it('反面证据：从名册里抽掉一条真事件，对账必须点名（不是恒绿）', () => {
    const sample = universe[0];
    const broken = KNOWN.filter((e) => e !== sample);
    expect(broken.includes(sample), '夹具没真的抽掉那条').toBe(false);
    expect(universe.filter((e) => !broken.includes(e))).toContain(sample);
  });
});

describe('种子的账只准有一处真源', () => {
  const synthetic = JSON.parse(readFileSync(join(process.cwd(), 'docs', 'admin', 'data', 'synthetic.json'), 'utf8'));
  const generator = readFileSync(join(process.cwd(), 'scripts', 'admin-synthetic.mjs'), 'utf8');

  it('data/synthetic.json 的 seed 与生成器默认值一致', () => {
    const m = generator.match(/ADMIN_SEED[^0-9]*(\d{8})/);
    expect(m, '生成器里读不到默认种子 —— 这半边的真源换了位置').toBeTruthy();
    expect(synthetic.seed, 'JSON 的种子与生成器不一致：页面上任何一句"种子是 X"都会跟着变假')
      .toBe(Number(m[1]));
  });

  it('页面里不许再出现指代合成面板的种子字面量（改指 JSON 字段）', () => {
    expect(html).not.toMatch(/SYNTHETIC（seed=/);
    expect(html).not.toMatch(/SYNTHETIC \(seed=/);
    const offenders = html.split('\n').filter((l) => l.includes('20261117')).filter((l) => !l.includes('simulate-players'));
    expect(offenders, `20261117 只属于 simulate-players 那一把种子；这些行把它安给了合成面板：\n${offenders.join('\n')}`).toEqual([]);
  });

  it('页脚给出的合成种子与 JSON 同一枚（页脚是给人看的那一处，不许另说一套）', () => {
    expect(html).toContain(`seed=${synthetic.seed}`);
  });
});
