/**
 * W-Z27「星尘微行」：世界地图上的在线微行者接线门禁
 *
 * 钉住：
 * 1) WorldMapPanel 渲染游侠的代码只读 presenceTracker.wanderers()，不直接碰内部字段，自身游侠不重复画出（ownId 跳过）
 * 2) 徽章 legend 只在 count>0 或 ready 时成行（HTML 模板条件注入）
 * 3) i18n 双表有 world_map_legend_presence_fmt 两键，且文案带 ${count}
 * 4) presenceTracker 提供公共 wanderers() 方法（不直接读内部字段）
 * 5) draw() 的游侠区只画 isRevealed 的格子（与 BOSS/副本同一条纪律）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

const ROOT = process.cwd();
const PANEL = readFileSync(join(ROOT, 'src/ui/WorldMapPanel.js'), 'utf8');
const TRACKER = readFileSync(join(ROOT, 'src/online/presenceTracker.js'), 'utf8');

describe('wanderers() 公共口径', () => {
  it('presenceTracker 暴露 wanderers()，不直接暴露 _wanderers 给渲染层', () => {
    expect(TRACKER).toMatch(/wanderers\(\)\s*\{/);
    expect(PANEL).toContain('presenceTracker.wanderers()');
    expect(PANEL).not.toContain('presenceTracker._wanderers');
  });
});

describe('WorldMapPanel 星尘层画法', () => {
  it('不画自身游侠（地图白点已代表玩家）', () => {
    expect(PANEL).toContain('resolvePresenceId');
    expect(PANEL).toContain('if (w.id === ownId) continue');
  });

  it('游侠只落在已探索区域（isRevealed 门槛）', () => {
    expect(PANEL).toMatch(/for \(const w of presenceTracker\.wanderers\(\)\)[\s\S]{0,500}isRevealed\(wx, wz\)/);
  });

  it('使用 NORMALIZED_WORLD_EXTENT 反推世界坐标（不另抄 900）', () => {
    expect(PANEL).toContain('NORMALIZED_WORLD_EXTENT');
    expect(PANEL).not.toMatch(/w\.x \* 900\b/);
  });
});

describe('图例徽章', () => {
  it('存在 presenceRow 条件注入（count>0 或 ready 才上图）', () => {
    expect(PANEL).toContain('const presenceRow =');
    expect(PANEL).toMatch(/if \(!ready && count <= 0\) return ''/);
    expect(PANEL).toContain('world_map_legend_presence_fmt');
  });

  it('.dot.presence 徽章样式已登记', () => {
    const css = readFileSync(join(ROOT, 'src/style.css'), 'utf8');
    expect(css).toContain('.wm-legend-row .dot.presence');
  });
});

describe('双表文案键存在且带 ${count}', () => {
  it('zh / en 两键齐备样式一致', () => {
    const zh = STRINGS_ZH.world_map_legend_presence_fmt;
    const en = STRINGS_EN.world_map_legend_presence_fmt;
    expect(typeof zh).toBe('string');
    expect(typeof en).toBe('string');
    expect(zh).toContain('${count}');
    expect(en).toContain('${count}');
    expect(new Set(ZH_KEYS).has('world_map_legend_presence_fmt')).toBe(true);
    expect(new Set(EN_KEYS).has('world_map_legend_presence_fmt')).toBe(true);
  });
});
