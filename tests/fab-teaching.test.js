import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z497 主界面两个 FAB 的悬停/读屏教学：autoplay 此前既无 title 也无 aria（零教学），
 * advisor 只有 aria。两者都挂上 data-i18n-title / data-i18n-aria 指向现成键。
 */
describe('主界面 FAB 教学说明（W-Z497）', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  it('autoplay FAB 带 aria + title 教学，指向已登记键', () => {
    const m = html.match(/<button[^>]*id="autoplay-fab"[^>]*>/);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/data-i18n-aria="qa_btn_autoplay"/);
    expect(m[0]).toMatch(/data-i18n-title="qa_btn_autoplay"/);
  });

  it('advisor FAB 除 aria 外补上 title 教学', () => {
    const m = html.match(/<button[^>]*id="advisor-fab"[^>]*>/s);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/data-i18n-aria="advisor_fab_aria"/);
    expect(m[0]).toMatch(/data-i18n-title="advisor_fab_aria"/);
  });

  it('i18n 引擎走查 data-i18n-title（.engine 源码含该属性处理）', () => {
    const src = readFileSync(join(process.cwd(), 'src/engine/i18n.js'), 'utf8');
    expect(src).toMatch(/\[data-i18n-title\]/);
    expect(src).toMatch(/getAttribute\('data-i18n-title'\)/);
  });
});