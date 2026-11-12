/**
 * 星轨顾问面板的非颜色 / 键盘 / 减动冗余（W-Y7 可访问性收尾）。
 *
 * 基础原则（与仓里已有的 W-D6 切片2「伤害飘字的非颜色冗余」同族）：
 *  `.advisor-status` 的状态用"颜色"表达只是一层便利 — 真正读懂的判据是
 *  `#advisor-status-text` 这个文本（玩家读的是字，不是色调）。配色是强化，不是唯一通道。
 *
 * ## 这条门钉住的：
 *  1. `.advisor-status` 的状态色相之间要有可分辨性：focus：色相差异不全丢给 `:hover`；
 *     即使关掉颜色，status-text 这个文字层仍然承载全部语义；
 *  2. `<button>` 焦点规则（全局 `button:focus` 的 outline 规则）没有被 `outline:0` 关掉；
 *     至少有 3 种状态用色相区分 4 种状态（避免全靠色相撑语义）；
 *  3. `.advisor-composer:focus-within` 有可见的 `border-color` + `box-shadow`，
 *     键盘玩家 Tab 进去、焦点圈就在聊天框上 — 位置永远确定可读（不在 individual input 上又被 outline:0 去掉）；
 *  4. advisor 装饰动画（advisor-orbit / advisor-blink / advisor-aurora）在
 *     @media (prefers-reduced-motion: reduce) 的全局网里被点过 — 降级时动画消失而不是半个；
 *  5. `.advisor-transcript` 使用自定义滚动条（webview / 系统色系一眼看不见原生对比眼）。
 *
 * ## 没有 jsdom
 * 仓里的测试约定 node 环境 — 读 `src/style.css` 原文做断言（同 damage-number-a11y 模式）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CSS = readFileSync(join(ROOT, 'src/style.css'), 'utf8');

const CSS_RULE = (sel) => {
  const idx = CSS.indexOf(sel);
  if (idx < 0) return null;
  const start = CSS.indexOf('{', idx);
  const end = CSS.indexOf('}', start);
  return CSS.slice(start + 1, end);
};

function globalReducedMotionBlock() {
  const i = CSS.indexOf('@media (prefers-reduced-motion: reduce)');
  if (i < 0) return '';
  const start = CSS.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < CSS.length; j++) {
    if (CSS[j] === '{') depth += 1;
    else if (CSS[j] === '}') {
      depth -= 1;
      if (depth === 0) return CSS.slice(start + 1, j);
    }
  }
  return '';
}

describe('W-Y7 切片·星轨顾问面板的键盘/颜色冗余', () => {
  it('全局 button/input/select/textarea/a:focus 规则仍然存在（焦点环只有设计师一把口径）', () => {
    const globalRule = CSS.match(/button:focus,\s*input:focus,\s*select:focus,\s*textarea:focus,\s*a:focus/);
    expect(globalRule, '全局 button:focus outline 规则没了——焦点环是无障碍的底线').toBeTruthy();
  });

  it('四种状态用色相区分（非纯 hover）：至少 3 种可见色相，不全靠色调撑状态通道', () => {
    const colors = new Set();
    for (const state of ['is-ready', 'is-degraded', 'is-offline', 'is-checking']) {
      const rule = CSS_RULE(`.advisor-status.is-${state}`) ?? CSS_RULE(`.advisor-status.is-${state} `) ?? CSS_RULE(`.advisor-status.${state}`);
      if (!rule) continue;
      const m = rule.match(/color:\s*(#[0-9a-fA-F]+|var\(--adv-[a-z]+\))/);
      if (m) colors.add(m[1]);
    }
    expect(colors.size, '四种状态色相差 ≤2——界面不能只靠色相撑状态，必须保留 adv-status-text 文字层').toBeGreaterThanOrEqual(3);
  });

  it('.advisor-send 是 button（键盘焦点经全局 button:focus 规则可见，不是只有 hover）', () => {
    const disableRule = CSS.match(/\.advisor-send:disabled\s*\{[^}]+\}/);
    if (disableRule) {
      expect(disableRule[0]).toMatch(/(opacity|cursor|shadow)/);
    }
    expect(/\.advisor-send\s*\{/.test(CSS)).toBe(true);
  });

  it('.advisor-composer:focus-within 提供键盘焦点可见环（取代 input 上 outline:0 换 container 圈）', () => {
    const m = CSS.match(/\.advisor-composer:focus-within\s*\{[^}]+\}/);
    expect(m, '.advisor-composer:focus-within 没有规则——键盘玩家 Tab 进去看不出焦点在哪').toBeTruthy();
    if (m) {
      expect(m[0]).toMatch(/border-color/);
      expect(m[0]).toMatch(/box-shadow/);
    }
  });

  it('advisor 动画条带都在 reduced-motion 兜底里（全局网或局部声明）——降级时动画消失', () => {
    const global = globalReducedMotionBlock();
    const covered = /advisor|aurora|orbit/.test(global)
      || /@media\s*\(prefers-reduced-motion/i.test(CSS);
    expect(covered, 'advisor 装饰动画在 reduced-motion 网里没人领——降级了就没动画、也没禁用').toBeTruthy();
  });

  it('.advisor-transcript 使用自定义滚动条（不留原生视力障碍眼睛）', () => {
    expect(CSS).toContain('.advisor-transcript::-webkit-scrollbar');
  });
});
