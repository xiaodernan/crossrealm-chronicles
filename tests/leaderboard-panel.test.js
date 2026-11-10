/**
 * 在线排行榜（W-X7）
 * —— 只读面板按钮：按下才拉一次、渲染行走 textContent；
 *    这里钉的是"格式化算式只在一处 + 面板接线还在 + 三键双表"。
 *
 * 服务端数据一律当不可信（不该出现在内联 HTML 里）——
 * formatLeaderboardEntry 的输出被面板放进 textContent（index.html 那一格也不含用户文本）。
 */
import { describe, expect, it } from 'vitest';
import { readSrc } from './helpers/srcText.js';
import { formatClearTimeMs, formatLeaderboardEntry } from '../src/online/leaderboardFormat.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';

const PANEL = readSrc('src/ui/SettingsPanel.js');
const INDEX_HTML = readSrc('index.html');

describe('formatClearTimeMs', () => {
  it('mm:ss under 1h, h:mm:ss above', () => {
    expect(formatClearTimeMs(123456)).toBe('2:03');
    expect(formatClearTimeMs(0)).toBe('0:00');
    expect(formatClearTimeMs(4830000)).toBe('1:20:30');
    expect(formatClearTimeMs(3599999)).toBe('59:59');
    expect(formatClearTimeMs(3600000)).toBe('1:00:00');
  });
  it('非有限数 → 空串（不幻觉一个时间）', () => {
    expect(formatClearTimeMs(NaN)).toBe('');
    expect(formatClearTimeMs(Infinity)).toBe('');
    expect(formatClearTimeMs(undefined)).toBe('');
  });
});

describe('formatLeaderboardEntry', () => {
  it('完整的一条 → #n · runner · bossId · ChN · mm:ss', () => {
    expect(formatLeaderboardEntry(
      { runner: '误入禁城的学者', bossId: 'shadow-warden', clearTimeMs: 123456, chapter: 5 }, 1))
      .toBe('#1 · 误入禁城的学者 · shadow-warden · Ch5 · 2:03');
  });
  it('缺格少格，rank 恒在；runner 缺回单个横线', () => {
    expect(formatLeaderboardEntry({ bossId: 'abyss-titan', clearTimeMs: 999 }, 7))
      .toBe('#7 · — · abyss-titan · 0:00');
    expect(formatLeaderboardEntry({}, 3)).toBe('#3 · —');
  });
  it('数据是种子榜的形状（顶层是 {maxLimit,count,items:[…]}，items 逐条同形）', () => {
    const seed = { runner: '缚霜直横檄的铁匠', bossId: 'void-chronarch', clearTimeMs: 6120000, chapter: 5 };
    const s = formatLeaderboardEntry(seed, 4);
    expect(s).toContain('#4 · 缚霜直横檄的铁匠');
    expect(s).toContain('Ch5');
    expect(s).toContain('1:42:00');
  });
});

describe('面板接线存在（删接线即红）', () => {
  it('index.html 里有按钮与列表挂载点', () => {
    expect(INDEX_HTML).toContain('id="set-online-lb"');
    expect(INDEX_HTML).toContain('id="set-online-lb-list"');
    expect(INDEX_HTML).toContain('data-i18n="settings_online_lb_btn"');
  });
  it('SettingsPanel 按下才拉一次、渲染行走 textContent', () => {
    expect(PANEL).toContain('set-online-lb');
    expect(PANEL).toContain('fetchLeaderboard(');
    expect(PANEL).toContain('formatLeaderboardEntry(');
    expect(PANEL).toContain('li.textContent');
    expect(PANEL).toContain('textContent = formatLeaderboardEntry');
  });
});

describe('zh/en 双表三键齐', () => {
  const keys = ['settings_online_lb_btn', 'settings_online_lb_unavailable', 'settings_online_lb_empty'];
  it('zh', () => { const set = new Set(ZH_KEYS); for (const k of keys) expect(set).toContain(k); });
  it('en', () => { const set = new Set(EN_KEYS); for (const k of keys) expect(set).toContain(k); });
});
