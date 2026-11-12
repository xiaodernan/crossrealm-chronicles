/**
 * W-Z3 设计令牌与动效分级 —— 静态门禁。
 *
 * 钉两件事：
 * ① `:root` 里必须定义一套语义令牌（时长档 / 缓动 / 层级 / 圆角 / 阴影 / 间距），
 *    不允许再出现"时长魔法数字四处飘"；
 * ② 文件末尾必须有一张**全局** reduced-motion 兜底网：把 `animation-duration`
 *    降到 0.001ms（让带 forwards 的功能性动效瞬间到终态、信息不丢），
 *    并对纯装饰元素直接 `animation: none`。这样任何未来新增的 animation 只要没写进
 *    `no-preference` 门，也不会对"减少动态"用户造成持续运动。
 *
 * 这不是又一个跑在浏览器里的测试——它读的是源 CSS 文本，守的是"设计系统不回潮"。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/style.css'), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));

describe('W-Z3 · 设计令牌', () => {
  const 必须令牌 = [
    '--dur-instant', '--dur-fast', '--dur-base', '--dur-slow', '--dur-cinematic',
    '--ease-out', '--ease-inout',
    '--z-hud', '--z-overlay', '--z-modal', '--z-advisor', '--z-toast', '--z-loading',
    '--r-sm', '--r-md', '--r-lg', '--r-pill',
    '--shadow-panel', '--space-1', '--space-2', '--space-3', '--space-4', '--space-5',
  ];
  for (const t of 必须令牌) {
    it(`令牌 ${t} 在 :root 里定义`, () => {
      expect(root).toContain(`${t}:`);
    });
  }

  it('时长档是单调升序，符合"档A<档B<档C"的语义', () => {
    const ms = (name) => {
      const m = root.match(new RegExp(`${name}:\\s*(\\d+)ms`));
      expect(m, name).toBeTruthy();
      return Number(m[1]);
    };
    expect(ms('--dur-instant')).toBeLessThan(ms('--dur-fast'));
    expect(ms('--dur-fast')).toBeLessThan(ms('--dur-base'));
    expect(ms('--dur-base')).toBeLessThan(ms('--dur-slow'));
    expect(ms('--dur-slow')).toBeLessThan(ms('--dur-cinematic'));
  });

  it('层级令牌从 HUD 到 loading 单调递增，避免互相穿透', () => {
    const z = (name) => {
      const m = root.match(new RegExp(`${name}:\\s*(\\d+)`));
      expect(m, name).toBeTruthy();
      return Number(m[1]);
    };
    expect(z('--z-hud')).toBeLessThan(z('--z-overlay'));
    expect(z('--z-overlay')).toBeLessThan(z('--z-modal'));
    expect(z('--z-modal')).toBeLessThan(z('--z-advisor'));
    expect(z('--z-advisor')).toBeLessThan(z('--z-toast'));
    expect(z('--z-toast')).toBeLessThan(z('--z-loading'));
  });
});

describe('W-Z3 · 全局 reduced-motion 兜底网', () => {
  it('存在一张覆盖 * 的 reduce 媒体查询', () => {
    const net = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(net).toContain('*, *::before, *::after');
    expect(net).toContain('animation-duration: 0.001ms !important');
    expect(net).toContain('animation-iteration-count: 1 !important');
    expect(net).toContain('transition-duration: 0.001ms !important');
  });

  it('纯装饰元素被显式 animation:none（档C·氛围），不依赖"瞬间到终态"', () => {
    const net = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(net).toContain('.advisor-aurora');
    expect(net).toContain('.cr-ember');
    expect(net).toContain('animation: none !important');
  });
});
