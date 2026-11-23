import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { 管理页探针越线 } from '../scripts/harness-readings.mjs';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const html = read('docs/admin/index.html');
const probe = read('scripts/admin-probe.mjs');
const report = JSON.parse(read('docs/admin/data/admin-browser-probe.json'));
const i18nBlock = html.match(/const I18N = (\{[\s\S]*?\n\});/);
const I18N = new Function(`return (${i18nBlock[1]});`)();
const clone = () => JSON.parse(JSON.stringify(report));

function usedI18nKeys(source) {
  return [...new Set([...source.matchAll(/data-i18n(?:-html|-ph|-aria)?="([^"]+)"/g)].map((match) => match[1]))];
}

describe('管理页真机探针判据', () => {
  it('入库报告是真浏览器全绿读数，不是占位 artifact', () => {
    expect(report.schemaVersion).toBe(1);
    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
    expect(管理页探针越线(report)).toEqual([]);
    expect(Object.keys(report.scenarios).sort()).toEqual(['english', 'fallback', 'mobile', 'normal']);
    expect(report.scenarios.normal.viewport).toEqual([1440, 900]);
    expect(report.scenarios.mobile.viewport).toEqual([390, 844]);
  });

  it('空报告与缺轮次都 fail-closed', () => {
    expect(管理页探针越线(null).length).toBeGreaterThan(0);
    expect(管理页探针越线({}).length).toBeGreaterThan(0);
    const missing = clone();
    delete missing.scenarios.english;
    expect(管理页探针越线(missing).join('\n')).toContain('english');
  });

  it('反向控制：英文混入一个汉字必须红', () => {
    const bad = clone();
    bad.scenarios.english.cjkCount = 1;
    expect(管理页探针越线(bad).join('\n')).toContain('english-switch');
  });

  it('反向控制：窄屏溢出与卡片挤叠分别必须红', () => {
    const overflow = clone();
    overflow.scenarios.mobile.pageOverflow = true;
    expect(管理页探针越线(overflow).join('\n')).toContain('mobile-layout');
    const overlap = clone();
    overlap.scenarios.mobile.cardOverlaps = [['a', 'b', 2, 3]];
    expect(管理页探针越线(overlap).join('\n')).toContain('mobile-layout');
  });

  it('反向控制：事件数、实测卡数、错误口令与种子错位都必须红', () => {
    const cases = [
      ['normal', 'localEventTiles', 19, 'normal-events'],
      ['normal', 'measuredCards', 41, 'normal-measured'],
      ['normal', 'wrongPasswordRejected', false, 'wrong-password'],
    ];
    for (const [scenario, key, value, marker] of cases) {
      const bad = clone();
      bad.scenarios[scenario][key] = value;
      expect(管理页探针越线(bad).join('\n')).toContain(marker);
    }
    const seed = clone();
    seed.scenarios.normal.localEventValues[2] = 0;
    expect(管理页探针越线(seed).join('\n')).toContain('seeded-counts');
  });

  it('反向控制：故障轮只许保留那一条已分类的合成数据错误', () => {
    const missing = clone();
    missing.scenarios.fallback.consoleErrors = [];
    expect(管理页探针越线(missing).join('\n')).toContain('fallback-console');
    const extra = clone();
    extra.scenarios.fallback.consoleErrors.push({ text: 'unexpected runtime error' });
    expect(管理页探针越线(extra).join('\n')).toContain('fallback-console');
    const network = clone();
    network.scenarios.fallback.networkErrors.push({ url: '/unexpected.js' });
    expect(管理页探针越线(network).join('\n')).toContain('fallback-network');
    const missingNetwork = clone();
    missingNetwork.scenarios.fallback.networkErrors = [];
    expect(管理页探针越线(missingNetwork).join('\n')).toContain('fallback-network');
    const mixed = clone();
    mixed.scenarios.fallback.cjkCount = 1;
    expect(管理页探针越线(mixed).join('\n')).toContain('fallback-language');
  });
});

describe('管理页双语与响应式源门', () => {
  it('英文词典每个值都不含汉字', () => {
    const contaminated = Object.entries(I18N.en)
      .filter(([, value]) => /[\u3400-\u9fff]/.test(String(value)))
      .map(([key]) => key);
    expect(contaminated).toEqual([]);
  });

  it('页面用到的每个翻译键在中英两典都在场', () => {
    for (const key of usedI18nKeys(html)) {
      expect(I18N.zh[key], `zh 缺键 ${key}`).toBeTruthy();
      expect(I18N.en[key], `en 缺键 ${key}`).toBeTruthy();
    }
  });

  it('反向控制：把英文语言按钮改回汉字，词典纯度腿必须抓到', () => {
    const mutated = html.replace("lang_zh: 'ZH'", "lang_zh: '中'");
    expect(mutated).not.toBe(html);
    const block = mutated.match(/const I18N = (\{[\s\S]*?\n\});/);
    const dictionary = new Function(`return (${block[1]});`)();
    expect(Object.entries(dictionary.en).filter(([, value]) => /[\u3400-\u9fff]/.test(String(value))).map(([key]) => key))
      .toContain('lang_zh');
  });

  it('模拟与后端真值按语言重渲染，不把首调语言焊死', () => {
    const applyLang = html.match(/function applyLang\(lang\) \{([\s\S]*?)\n\}/)[1];
    expect(applyLang).toContain('renderSimulation()');
    expect(applyLang).toContain('renderLiveRollup()');
    expect(html).toContain('let simulationData = null;');
    expect(html).toContain('let liveRollupData = null;');
  });

  it('窄屏顶栏与事件网格用可收缩轨道，不靠隐藏内容消溢出', () => {
    expect(html).toMatch(/\.topbar\{[^}]*flex-wrap:wrap/);
    expect(html).toMatch(/#localEventsGrid\{grid-template-columns:repeat\(9,minmax\(0,1fr\)\)/);
    expect(html).toMatch(/#localEventsGrid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
    expect(html).toMatch(/@media \(max-width:600px\)/);
    expect(html).toMatch(/\.kpi\{[^}]*min-width:0/);
  });
});

describe('管理页探针接线', () => {
  it('执行器真调共用判据与 CDP 通道，并不硬杀进程', () => {
    expect(probe).toMatch(/import\s*\{\s*管理页探针越线\s*\}\s*from\s*'\.\/harness-readings\.mjs'/);
    expect(probe).toMatch(/import\s*\{[^}]*开通道[^}]*\}\s*from\s*'\.\/cdp-channel\.mjs'/);
    expect(probe).toContain('管理页探针越线(report)');
    expect(probe).toContain('process.exitCode');
    expect(probe).not.toMatch(/process\.exit\(/);
    expect(probe).toMatch(/spawnSync\('taskkill', \['\/PID', String\(child\.pid\), '\/T', '\/F'\]/);
  });

  it('种子、故障注入与加载同步都接在真浏览器上', () => {
    expect(probe).toContain("{ event: 'guide_asked', t }");
    expect(probe).toContain("interceptionMode = 'synthetic-failure'");
    expect(probe).toContain('responseCode: 503');
    expect(probe).toContain('Page.loadEventFired 没有增长');
    expect(probe).toContain('Page.captureScreenshot');
    expect(probe).toContain('--remote-debugging-port=0');
  });

  it('npm 与 CI 都运行这条真机门禁', () => {
    const pkg = JSON.parse(read('package.json'));
    const ci = read('.github/workflows/ci.yml');
    expect(pkg.scripts['probe:admin']).toBe('node scripts/admin-probe.mjs');
    expect(ci).toContain('run: npm run probe:admin');
    expect(ci).toContain('CHROME: ${{ steps.setup-chrome.outputs.chrome-path }}');
  });
});
