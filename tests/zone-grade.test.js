/**
 * 区域色彩分级门禁（W-C4 切片4）—— 与 zone-fog.test.js / aa-policy.test.js 同一套口径。
 *
 * ## 这份门禁钉的是什么
 * 分级是 composer 链上第一个插在 OutputPass **之前**的 pass（线性空间铁律的
 * 正面案例）。机制片交付：冻结表 -> zoneGradeOf（认不出当场抛）-> ColorGrade
 * 控制器（指数平滑唯一写者）-> Game.js 接线。
 *
 * - **调参档逐区钉死**（切片7）：每格三数用**本地字面量**钉在这里 —— 改表必须连
 *   本文件一起改，改这里也必须连真页面验收一起做；枢纽与兜底保持中性锚；
 * - **合理带宽**：三数落在"看得出来但不越界"的区间，越界先过真页面再改带宽；
 * - **浮点积分不取整**：blendGrade 中途取整会让收敛末段卡死（ZoneFog 的教训）；
 * - **uniforms 写权限归控制器**：Game.js 只许驱动 update，不许摸 uniforms。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { ZONE_IDS } from '../src/content/ZoneIdentity.js';
import { ColorGrade } from '../src/effects/ColorGrade.js';
import {
  WARMTH_GAIN, LUMA_WEIGHTS, NEUTRAL_GRADE, ZONE_GRADE, zoneGradeOf, blendGrade,
} from '../src/content/zoneGrade.js';

// 过渡用例需要一个"非中性"的目标 —— mock 只覆写 zoneGradeOf 的 fantasy 档，
// 其余（名册 / blendGrade / 中性表）全部走真实现。
vi.mock('../src/content/zoneGrade.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    zoneGradeOf: (zoneId) => (zoneId === 'fantasy'
      ? { saturation: 0.8, contrast: 1.2, warmth: 0.5 }
      : actual.zoneGradeOf(zoneId)),
  };
});

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/** 剥掉注释：不然说明文字里的接线词会被当成接线（同 aa-policy / composer-chain） */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((ln) => { const i = ln.indexOf('//'); return i >= 0 ? ln.slice(0, i) : ln; }).join('\n');

describe('名册（content/zoneGrade.js）', () => {
  it('覆盖 ZONE_IDS 全成员 —— 新区注册进 ZoneIdentity 就必须回答自己的分级', () => {
    expect(Object.keys(ZONE_GRADE).sort()).toEqual(Object.values(ZONE_IDS).sort());
    expect(Object.isFrozen(ZONE_GRADE)).toBe(true);
  });

  /**
   * 切片7 调参落定的三数 —— **本地字面量**，不从表里读：
   * 与表逐格对账，任何一格被静默改动当场红；有意调整时先过真页面验收，
   * 再把这里（与表）一起改。每格的"为什么"写在 content/zoneGrade.js 的表注上。
   */
  const TUNED = {
    hub: { saturation: 1, contrast: 1, warmth: 0 },
    unknown: { saturation: 1, contrast: 1, warmth: 0 },
    fantasy: { saturation: 1.05, contrast: 1.04, warmth: -0.15 },
    magic: { saturation: 1.15, contrast: 1.06, warmth: -0.3 },
    space: { saturation: 1.1, contrast: 1.12, warmth: -0.45 },
    void: { saturation: 0.85, contrast: 1.05, warmth: -0.35 },
    abyss: { saturation: 1.12, contrast: 1.1, warmth: 0.45 },
    gloom: { saturation: 0.9, contrast: 1.03, warmth: -0.4 },
    radiant: { saturation: 1.1, contrast: 1.0, warmth: 0.6 },
    corridor: { saturation: 0.97, contrast: 1.0, warmth: -0.1 },
  };

  it('切片7 调参档逐区钉死：任何一格被静默改动当场红（有意调整须连真页面验收一起做）', () => {
    for (const [zoneId, grade] of Object.entries(ZONE_GRADE)) {
      expect(grade, zoneId).toEqual(TUNED[zoneId]);
      expect(Object.isFrozen(grade), zoneId).toBe(true);
    }
  });

  it('调参带宽：三数落在"看得出来但不越界"的区间 —— 越界的先过真页面再改带宽', () => {
    for (const [zoneId, grade] of Object.entries(ZONE_GRADE)) {
      expect(grade.saturation, `${zoneId}.saturation`).toBeGreaterThanOrEqual(0.8);
      expect(grade.saturation, `${zoneId}.saturation`).toBeLessThanOrEqual(1.2);
      expect(grade.contrast, `${zoneId}.contrast`).toBeGreaterThanOrEqual(0.95);
      expect(grade.contrast, `${zoneId}.contrast`).toBeLessThanOrEqual(1.15);
      expect(grade.warmth, `${zoneId}.warmth`).toBeGreaterThanOrEqual(-0.6);
      expect(grade.warmth, `${zoneId}.warmth`).toBeLessThanOrEqual(0.6);
    }
  });

  it('锚点：枢纽与兜底保持中性 —— 第一屏与"没认出来的地方"不做风格化', () => {
    expect(ZONE_GRADE[ZONE_IDS.HUB]).toEqual(NEUTRAL_GRADE);
    expect(ZONE_GRADE[ZONE_IDS.UNKNOWN]).toEqual(NEUTRAL_GRADE);
  });

  it('算式常量与 shader 一一对应：WARMTH_GAIN / LUMA_WEIGHTS 冻结且出现在 ColorGrade 的 shader 里', () => {
    expect(WARMTH_GAIN).toBe(0.08);
    expect(LUMA_WEIGHTS).toEqual([0.2126, 0.7152, 0.0722]);
    const gradeSrc = readFileSync(join(SRC, 'effects/ColorGrade.js'), 'utf-8');
    expect(gradeSrc).toContain('WARMTH_GAIN');
    expect(gradeSrc).toContain('LUMA_WEIGHTS');
  });

  it('zoneGradeOf：登记档原样返回，认不出当场抛（说得出有哪些档）', () => {
    // hub 走真实现分支 —— 引用同一（返回表内对象本身，不复制）
    expect(zoneGradeOf(ZONE_IDS.HUB)).toBe(ZONE_GRADE[ZONE_IDS.HUB]);
    // fantasy 被本文件的 mock 覆写成非中性档（为过渡用例服务），跳过；
    // 其余成员走真实现，值与表一致
    for (const zoneId of Object.values(ZONE_IDS)) {
      if (zoneId === 'fantasy') continue;
      expect(zoneGradeOf(zoneId)).toEqual(ZONE_GRADE[zoneId]);
    }
    expect(() => zoneGradeOf('neverland')).toThrow(/neverland/);
    expect(() => zoneGradeOf('neverland')).toThrow(/hub/);
  });
});

describe('blendGrade（过渡数学）', () => {
  const from = { saturation: 1, contrast: 1, warmth: 0 };
  const to = { saturation: 0.8, contrast: 1.2, warmth: 0.5 };

  it('k=0 不动、k=1 全到', () => {
    expect(blendGrade(from, to, 0)).toEqual(from);
    expect(blendGrade(from, to, 1)).toEqual(to);
  });

  it('k=0.25 走四分之一 —— 三通道各自线性', () => {
    const mid = blendGrade(from, to, 0.25);
    expect(mid.saturation).toBeCloseTo(0.95, 12);
    expect(mid.contrast).toBeCloseTo(1.05, 12);
    expect(mid.warmth).toBeCloseTo(0.125, 12);
  });

  it('返回浮点不取整 —— 中途取整会让指数平滑的收敛末段卡死（ZoneFog 的教训）', () => {
    const tiny = blendGrade({ saturation: 0.8000001, contrast: 1.2, warmth: 0.5 }, to, 0.1);
    expect(tiny.saturation).not.toBe(0.8);
    expect(Number.isInteger(tiny.warmth)).toBe(false);
  });
});

describe('ColorGrade 控制器（effects/ColorGrade.js）', () => {
  it('出厂中性：构造后 pass.uniforms 全恒等值 —— 画面逐像素不变', () => {
    const g = new ColorGrade();
    expect(g.pass.uniforms.uSaturation.value).toBe(1);
    expect(g.pass.uniforms.uContrast.value).toBe(1);
    expect(g.pass.uniforms.uWarmth.value).toBe(0);
  });

  it('同区幂等：中性区每帧更新后仍是 1/1/0（exp 平滑下恒等式不动）', () => {
    const g = new ColorGrade();
    for (let i = 0; i < 60; i += 1) g.update(1 / 60, ZONE_IDS.HUB);
    expect(g.pass.uniforms.uSaturation.value).toBe(1);
    expect(g.pass.uniforms.uWarmth.value).toBe(0);
  });

  it('换区不瞬变：一帧后落在旧值与目标之间，uniforms 跟随运行值', () => {
    const g = new ColorGrade();
    const snap = g.update(1 / 60, 'fantasy');   // mock：0.8 / 1.2 / 0.5
    expect(snap.saturation).toBeLessThan(1);
    expect(snap.saturation).toBeGreaterThan(0.8);
    expect(g.pass.uniforms.uSaturation.value).toBe(snap.saturation);
    expect(g.pass.uniforms.uWarmth.value).toBeGreaterThan(0);
  });

  it('10 秒收敛：600 帧后距离目标 ≤ 1e-3 —— 指数平滑的进度由真实时间决定', () => {
    const g = new ColorGrade();
    for (let i = 0; i < 600; i += 1) g.update(1 / 60, 'fantasy');
    expect(Math.abs(g.pass.uniforms.uSaturation.value - 0.8)).toBeLessThan(1e-3);
    expect(Math.abs(g.pass.uniforms.uContrast.value - 1.2)).toBeLessThan(1e-3);
    expect(Math.abs(g.pass.uniforms.uWarmth.value - 0.5)).toBeLessThan(1e-3);
  });
});



describe('Game.js 接线扫描', () => {
  const gameSrc = () => stripComments(readFileSync(join(SRC, 'core/Game.js'), 'utf-8'));

  it('import + 构造 + addPass + 每帧驱动，一样不缺', () => {
    const src = gameSrc();
    expect(src).toMatch(/import\s*\{\s*ColorGrade\s*\}\s*from\s*'\.\.\/effects\/ColorGrade\.js'/);
    expect(src).toContain('this.colorGrade = new ColorGrade()');
    expect(src).toContain('this.composer.addPass(this.colorGrade.pass)');
    expect(src).toMatch(/this\.colorGrade\.update\(dt,\s*this\.world\.zoneId\)/);
  });

  it('uniforms 写权限归控制器：Game.js 不许直接摸 uSaturation/uContrast/uWarmth', () => {
    expect(gameSrc()).not.toMatch(/u(Saturation|Contrast|Warmth)/);
  });

  it('本文件不许被试图绕过表直写 pass 参数的写法污染', () => {
    const gradeSrc = stripComments(readFileSync(join(SRC, 'effects/ColorGrade.js'), 'utf-8'));
    expect(gradeSrc).toContain('this._current = blendGrade(this._current, target, k)');
    // uniforms 只允许在 update 内由 _current 落值，不许从别处写
    const writes = [...gradeSrc.matchAll(/pass\.uniforms\.u(\w+)\.value\s*=/g)].map((m) => m[1]);
    expect(writes).toEqual(['Saturation', 'Contrast', 'Warmth']);
  });
});
