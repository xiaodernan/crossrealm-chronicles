/**
 * 结尾字幕门禁 —— 钉 `cinematic/EndCreditsDirector.js`。
 *
 * 纯 DOM 耦合、此前零直接测试。几条"写错不抛、只静默不出字幕/关不掉"的不变量：
 * - `play()`：渲染每一条非空文案键为 `<p>`、去掉 hidden、toast 3000、跳过按钮写 data-ktext；
 *   **已激活时再 play 直接早退**（game-completed 可能重复触发，不该重放/重渲染）。
 * - `hide()`：加 hidden、active=false；跳过按钮点一下就走 hide。
 * - `trySkip()`：未激活返回 false 且不动；激活则隐藏并返回 true。
 * - `dispose()` 不抛（`offAll` 一次结清本文件的 EventBus 监听）。
 *
 * 用 stubDoc + classList + querySelector 夹具（沿用 rumble.test.js 做法）。
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { t } from '../src/engine/i18n.js';
import { EndCreditsDirector } from '../src/cinematic/EndCreditsDirector.js';

function makeClassList() {
  const s = new Set();
  return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) };
}

let realDoc, parts, game, director;

beforeEach(() => {
  const scroll = { innerHTML: '' };
  const skip = { dataset: {}, addEventListener: vi.fn() };
  const el = {
    id: '', className: '', innerHTML: '',
    classList: makeClassList(),
    querySelector: vi.fn((sel) => (sel === '.end-credits-scroll' ? scroll : sel === '.end-credits-skip' ? skip : null)),
    querySelectorAll: vi.fn(() => []), // refreshKeyText 走这里 → 空表即 no-op
  };
  parts = { el, scroll, skip };
  game = { dialog: { toast: vi.fn() } };

  realDoc = globalThis.document;
  globalThis.document = {
    createElement: vi.fn(() => el),
    body: { appendChild: vi.fn() },
  };
  director = new EndCreditsDirector(game);
});

afterEach(() => {
  director.dispose(); // 清掉本文件挂在 EventBus 上的监听
  globalThis.document = realDoc;
});

describe('EndCreditsDirector 构造', () => {
  it('建字幕条、挂 body、注册跳过按钮点击', () => {
    expect(globalThis.document.createElement).toHaveBeenCalledWith('div');
    expect(globalThis.document.body.appendChild).toHaveBeenCalledWith(parts.el);
    expect(parts.el.id).toBe('end-credits');
    expect(parts.skip.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
  });
});

describe('EndCreditsDirector play / hide', () => {
  it('play：非空行各渲染一个 <p>、去 hidden、toast 3000、写 data-ktext', () => {
    director.play();
    expect(director.active).toBe(true);
    expect(parts.el.classList.contains('hidden')).toBe(false);
    // CREDITS 有 7 条非空文案键（其余是空行，不产生 <p>）
    expect((parts.scroll.innerHTML.match(/<p>/g) ?? []).length).toBe(7);
    expect(parts.skip.dataset.ktext).toBe(t('cg_caption_void_skip'));
    expect(game.dialog.toast).toHaveBeenCalledWith(t('credits_toast'), 3000);
  });

  it('已激活时再 play 早退：不重渲染（保住已渲染内容）', () => {
    director.play();
    parts.scroll.innerHTML = 'MARKER';
    director.play(); // 应早退
    expect(parts.scroll.innerHTML).toBe('MARKER');
  });

  it('hide：加 hidden、active=false', () => {
    director.play();
    director.hide();
    expect(director.active).toBe(false);
    expect(parts.el.classList.contains('hidden')).toBe(true);
  });

  it('跳过按钮的点击处理器调 hide', () => {
    director.play();
    const clickHandler = parts.skip.addEventListener.mock.calls.find((c) => c[0] === 'click')[1];
    clickHandler();
    expect(director.active).toBe(false);
    expect(parts.el.classList.contains('hidden')).toBe(true);
  });
});

/**
 * 结局结算 · 个人最速横幅（W-G6 切片1）：
 * 有个人最速 → 字幕滚动的最后一块挂上"你的最速之战"（用时升序、boss 走名册）；
 * 没有 → 整块不渲染（老档/跳关档不受影响）。
 */
import { BossBestTimes } from '../src/game/BossBestTimes.js';

const mapStub = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe('EndCreditsDirector 个人最速横幅（W-G6）', () => {
  function playWithBest(entries) {
    const bossBestTimes = new BossBestTimes(mapStub());
    for (const [id, ms] of entries) bossBestTimes.consider(id, ms);
    game.bossBestTimes = bossBestTimes;
    director.play();
    return parts.scroll.innerHTML;
  }

  it('有个人最速 → 横幅出现，用时升序、boss 走名册', () => {
    const shadowName = t('boss_name_shadow');
    const mageName = t('boss_name_mage');
    const html = playWithBest([['archmagus', 90_000], ['shadow-warden', 60_000]]);
    expect(html).toContain(t('credits_best_title'));
    expect(html).toContain(shadowName);
    expect(html).toContain(mageName);
    expect(html).toContain('1:00');
    expect(html).toContain('1:30');
    expect(html.indexOf(shadowName)).toBeLessThan(html.indexOf(mageName));
  });

  it('没有个人最速 → 横幅整块不渲染', () => {
    game.bossBestTimes = new BossBestTimes(mapStub());
    director.play();
    expect(parts.scroll.innerHTML).not.toContain(t('credits_best_title'));
  });

  it('game.bossBestTimes 缺省 → 走单例，空账本也不抛、不渲染横幅', () => {
    director.play();   // game 里没有 bossBestTimes
    expect(parts.scroll.innerHTML).not.toContain(t('credits_best_title'));
  });
});

describe('EndCreditsDirector trySkip', () => {
  it('未激活 → false 且不动；激活 → true 且隐藏', () => {
    expect(director.trySkip()).toBe(false);
    expect(director.active).toBe(false);
    director.play();
    expect(director.trySkip()).toBe(true);
    expect(director.active).toBe(false);
    expect(parts.el.classList.contains('hidden')).toBe(true);
  });
});

describe('EndCreditsDirector dispose', () => {
  it('dispose 不抛', () => {
    expect(() => director.dispose()).not.toThrow();
  });
});
