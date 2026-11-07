/**
 * 走查门禁测试（ui-walkthrough）—— 判据 `走查越线` 与脚本接线一钉到底。
 *
 * 这一门是为"真浏览器量出来的横向溢出 / y 挤叠"设的：假 DOM 量不到 layout，
 * 所以真浏览器是**唯一**的量尺，这里钉两件事：
 *   ① 判据的判（合成读数喂正反两面，毫秒级，不开浏览器）；
 *   ② 脚本的接线（语法过 `node --check`；import 了判据与 CDP 真源；package.json 指过去）。
 * 真浏览器真跑的腿是 `npm run walkthrough:ui`（本机 / CI 跑，不在单测里开浏览器）。
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { 走查越线 } from '../scripts/harness-readings.mjs';

const ROOT = process.cwd();
const 脚本路径 = join(ROOT, 'scripts', 'ui-walkthrough.mjs');
const 源文 = readFileSync(脚本路径, 'utf8');

/** 一格全绿的组合（x 轴没越界、页面没撑宽、hud 挤叠为 0） */
const 绿格 = (over = {}) => ({
  label: 'HUD', viewport: '390x844', lang: 'en', scale: 'large',
  页溢出: false, 越界: [],
  hud挤叠: { hudStatsBottom: 187, questPanelTop: 192, overlap: 0 },
  ...over,
});

describe('走查越线：三种红各判一件事', () => {
  it('空组合 = 没量，不是全绿（fail-closed）', () => {
    expect(走查越线({})).toHaveLength(1);
    expect(走查越线({ 组合: [] })).toHaveLength(1);
    expect(走查越线(null)).toHaveLength(1);
  });

  it('全绿 = 空 × 组合数', () => {
    expect(走查越线({ 组合: [绿格(), 绿格({ label: '说明书', viewport: '360x640', lang: 'zh', scale: 'medium' })] }))
      .toEqual([]);
  });

  it('① 页面级横向溢出 ⇒ 红，话里带是哪一格', () => {
    const 红 = 走查越线({ 组合: [绿格({ 页溢出: true })] });
    expect(红).toHaveLength(1);
    expect(红[0]).toContain('390x844');
    expect(红[0]).toContain('en');
    expect(红[0]).toContain('large');
    expect(红[0]).toContain('HUD');
  });

  it('② 可见元素越出视口 ⇒ 红，话里带 id / tag / 区间；最多列三个', () => {
    const 元素 = (id, right) => ({
      tag: 'DIV', id, cls: 'stat-item', right, left: right - 100, w: 100, text: 'Sample',
    });
    const 红 = 走查越线({ 组合: [绿格({ 越界: [元素('a', 401), 元素('b', 402), 元素('c', 403), 元素('d', 404), 元素('e', 405)] })] });
    expect(红).toHaveLength(1);
    expect(红[0]).toContain('5 个可见元素');
    expect(红[0]).toContain('id=a');
    expect(红[0]).toContain('id=b');
    expect(红[0]).toContain('id=c');
    expect(红[0]).not.toContain('id=d');
    expect(红[0]).toContain('共 5 个');
  });

  it('② 边界：非零越界数也算数，1 个就报', () => {
    const 红 = 走查越线({ 组合: [绿格({ 越界: [{ tag: 'BUTTON', id: 'help-close', cls: '', right: 522.3, left: 182.3, w: 340, text: 'Close' }] })] });
    expect(红).toHaveLength(1);
    expect(红[0]).toContain('help-close');
    expect(红[0]).toContain('522.3');
  });

  it('③ y 挤叠 > 0 ⇒ 红，话里带压多少 px 与两侧读数', () => {
    const 红 = 走查越线({ 组合: [绿格({ hud挤叠: { hudStatsBottom: 187, questPanelTop: 90, overlap: 97 } })] });
    expect(红).toHaveLength(1);
    expect(红[0]).toContain('97px');
    expect(红[0]).toContain('187');
    expect(红[0]).toContain('90');
  });

  it('③ 边界：overlap 恰好 0 ⇒ 绿；hud挤叠 缺格 / overlap 非数 ⇒ 绿而不炸', () => {
    expect(走查越线({ 组合: [绿格({ hud挤叠: { hudStatsBottom: 187, questPanelTop: 192, overlap: 0 } })] })).toEqual([]);
    expect(走查越线({ 组合: [绿格({ hud挤叠: null })] })).toEqual([]);
    expect(走查越线({ 组合: [绿格({ hud挤叠: { overlap: undefined } })] })).toEqual([]);
    expect(走查越线({ 组合: [绿格({ hud挤叠: { overlap: NaN } })] })).toEqual([]);
  });

  it('三格混一组：哪格坏哪格红，没坏的格子不连座', () => {
    const 红 = 走查越线({
      组合: [
        绿格({ label: '甲', 越界: [{ tag: 'DIV', id: 'x', cls: '', right: 500, left: 400, w: 100 }] }),
        绿格({ label: '乙' }),
        绿格({ label: '丙', 页溢出: true }),
      ],
    });
    expect(红).toHaveLength(2);
    expect(红[0]).toContain('甲');
    expect(红[1]).toContain('丙');
    expect(红.every((l) => !l.includes('乙'))).toBe(true);
  });
});

describe('ui-walkthrough：接线腿（脚本真调判据、语法真过得了、入口真指向它）', () => {
  it('脚本通过 node --check', () => {
    // 页内驱动整段包在模板字符串里：注释里出现一个反引号就会提前截断它，
    // 而此前所有腿都只把脚本当**文本**读 —— 没有解析腿 = 那条教训没搬过来
    expect(() => execFileSync(process.execPath, ['--check', 脚本路径], { stdio: 'pipe' }))
      .not.toThrow();
  });

  it('脚本 import 判据与 CDP 真源（不许自己再抄一份管道）', () => {
    expect(源文).toMatch(/import\s*\{[^}]*走查越线[^}]*\}\s*from\s*'\.\/harness-readings\.mjs'/);
    expect(源文).toMatch(/import\s*\{[^}]*开通道[^}]*\}\s*from\s*'\.\/cdp-channel\.mjs'/);
    expect(源文).not.toMatch(/const pending = new Map/);
  });

  it('脚本收尾拔整棵树（只 kill 主进程会留下 renderer 钉住口）', () => {
    expect(源文).toMatch(/spawnSync\('taskkill', \['\/PID', String\(子进程\.pid\), '\/T', '\/F'\]/);
    expect(源文.indexOf('spawnSync'), '拔树排在删临时目录之后').toBeLessThan(源文.indexOf('rmSync(profileDir'));
  });

  it('package.json 的 walkthrough:ui 指到这个脚本', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['walkthrough:ui']).toBe('node scripts/ui-walkthrough.mjs');
  });
});
