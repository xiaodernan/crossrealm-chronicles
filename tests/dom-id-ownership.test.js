/**
 * 全仓 DOM id 唯一性门禁（W-D1 切片4，关 B106）。
 *
 * ## 关的是什么
 * `index.html`（升级面板）与 HUD 模板（`buildHUD()` 注入 `#hud`）都写过
 * `id="skill-points-display"`。浏览器的 `getElementById` 取的是**树序第一个**，
 * 而 `#hud`（第 17 行）排在 `#upgrade-panel`（第 38 行）前面 —— 于是
 * `UpgradePanel.refresh()` 写的其实是 HUD 那一格，升级面板里那句
 * 「技能点 …」永远停在出厂的 0。**两个写者、两个节点、一个 id**，
 * 症状是"某个面板的数字不动"，而两处代码各自看起来都对。
 *
 * ## 为什么是静态扫描而不是构造一遍
 * 这个错位只在**两份来源**同时进文档时才发生：静态扫描直接把两份来源并排比，
 * 不需要为"把 index.html 塞进假文档"再造一套壳页桩（那份桩的漂移代价见
 * `fakeMarkupDom.js` 头注）。运行期那一半由 `tests/hud-boot.test.js` 覆盖
 * （HUD 自己那条刷新路径真的跑过）。
 *
 * ## 两条不许退化的读数
 * - 分母 floor（ids / files）：扫描器一旦写坏（返回空集），空集上"没有重复"是恒真的；
 * - 反面控制：把一条真 id 重塞一遍，检测器必须报出来 —— 证明红的判据真的在看。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
/** 带 `$` 的是插值模板（运行期才成形），不进这张账 —— 静态读不出它叫什么 */
const ID_RE = /id="([^"$]+)"/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

function collect() {
  const files = ['index.html', ...walk(join(ROOT, 'src'))];
  const entries = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(ID_RE)) {
      entries.push({ file: relative(ROOT, file).split(sep).join('/'), id: m[1] });
    }
  }
  return { entries, files };
}

/** 哪些 id 落在两处以上；检测器单拎出来，好让反面控制喂它假重复 */
function dupIds(entries) {
  const seen = new Map();
  for (const e of entries) {
    if (!seen.has(e.id)) seen.set(e.id, []);
    seen.get(e.id).push(e.file);
  }
  return [...seen.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([id, files]) => ({ id, files }));
}

describe('DOM id 一份一处（B106）', () => {
  const { entries, files } = collect();

  it('扫描器读得到足够的量（空集上"没有重复"是恒真的）', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(entries.length).toBeGreaterThan(150);
    expect(new Set(entries.map((e) => e.id)).size).toBeGreaterThan(120);
  });

  it('全仓 id 没有一个同时出现在两处', () => {
    expect(dupIds(entries)).toEqual([]);
  });

  it('技能点那两格各归各的：HUD 与升级面板不许共用一个 id', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const hud = readFileSync(join(ROOT, 'src', 'ui', 'HUD.js'), 'utf8');
    const panel = readFileSync(join(ROOT, 'src', 'ui', 'UpgradePanel.js'), 'utf8');

    // HUD 自己那一格（顶栏统计），壳页里不许再出现同一个 id
    expect(hud).toContain('id="skill-points-display"');
    expect(html).not.toContain('id="skill-points-display"');
    // 升级面板那一行有自己的一格，写者指的也正是它
    expect(html).toContain('id="upgrade-skill-points"');
    expect(panel).toContain("getElementById('upgrade-skill-points')");
    expect(panel).not.toContain("getElementById('skill-points-display')");
  });

  it('反面控制：同一份清单里重塞一条真 id，检测器必须报出来', () => {
    const seed = entries[Math.floor(entries.length / 2)];
    const hits = dupIds([...entries, { file: 'tests/__fake__.js', id: seed.id }]);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(seed.id);
    expect(hits[0].files).toContain('tests/__fake__.js');
  });
});
