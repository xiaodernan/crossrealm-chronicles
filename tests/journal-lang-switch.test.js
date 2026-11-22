import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z511 日志抽屉是 JS 整块现算（页签/标题/清单都不走 data-i18n），
 * 换语言时若它正开着必须重绘，否则中英切换后仍是上一语界面（浏览器实测复现）。
 */
describe('语言切换重绘日志抽屉（W-Z511）', () => {
  const sm = readFileSync(join(process.cwd(), 'src/core/SettingsManager.js'), 'utf8');
  const hud = readFileSync(join(process.cwd(), 'src/ui/HUD.js'), 'utf8');

  it('applyToGame 在日志开着时调用 updateJournal', () => {
    expect(sm).toContain('journalPanel');
    expect(sm).toContain("classList.contains('hidden')");
    expect(sm).toContain('updateJournal?.()');
  });

  it('HUD.updateJournal 走 preserveFocus 重绘（焦点不丢）', () => {
    expect(hud).toMatch(/updateJournal\(\)\s*\{\s*preserveFocus\(this\.journalPanel,\s*\(\)\s*=>\s*this\.renderJournal\(\)\)/);
  });

  it('renderJournal 的页签名走 t(label) 而非硬编码', () => {
    expect(hud).toContain('${t(label)}');
  });
});