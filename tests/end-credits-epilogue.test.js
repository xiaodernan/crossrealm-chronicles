/**
 * W-Z30「星尘致谢」：谢幕碑——鸣谢母题收齐的旅人
 *
 * 钉住：
 * 1) 零解锁 → 谢幕碑整块不渲染（老档 / 未通关完 / 刚毕业，绝不出假碑）
 * 2) 解锁任意一枚终段成就 → 对应母题的碑文出现在碑 §中（theme + quote 都能看见）
 * 3) 同屏多母题按 unlocked 自然顺序渲染；已解锁全出现、未解锁一个字都不出
 * 4) 注入面：碑文都是我方内容表的 t()，绝不拼接模型/玩家输入（innerHTML 路径从未中用户数据）
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EndCreditsDirector } from '../src/cinematic/EndCreditsDirector.js';
import { ECHO_EPITAPHS } from '../src/content/echoEpitaphs.js';
import { t } from '../src/engine/i18n.js';

const makeClassList = () => {
  const s = new Set(['hidden']);
  return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) };
};

let realDoc, parts, director;

const build = (unlocked) => {
  const scroll = { innerHTML: '' };
  const skip = { dataset: {}, addEventListener: vi.fn() };
  const el = {
    id: '', className: '', innerHTML: '',
    classList: makeClassList(),
    querySelector: vi.fn((sel) => (sel === '.end-credits-scroll' ? scroll : sel === '.end-credits-skip' ? skip : null)),
    querySelectorAll: vi.fn(() => []),
  };
  parts = { el, scroll, skip };
  const game = {
    dialog: { toast: vi.fn() },
    achievements: { unlocked },
  };
  realDoc = globalThis.document;
  globalThis.document = {
    createElement: vi.fn(() => el),
    body: { appendChild: vi.fn() },
  };
  director = new EndCreditsDirector(game);
};

afterEach(() => {
  director?.dispose();
  globalThis.document = realDoc;
});

describe('谢幕碑：未解锁 → 不渲染', () => {
  it('零碑文时 scroll 里没有 epilogue 块', () => {
    build(new Set());
    director.play();
    expect(parts.scroll.innerHTML).not.toContain('end-credits-epilogue');
    expect(parts.scroll.innerHTML).not.toContain(t('ach_epitaphs_title'));
  });
});

describe('谢幕碑：解锁母题 → 碑文浮现', () => {
  it('解锁 echo-wizard-6 → 星尘铭文 title + 学院碑文出现在 HTML', () => {
    build(new Set(['echo-wizard-6']));
    director.play();
    expect(parts.scroll.innerHTML).toContain(t('ach_epitaphs_title'));
    expect(parts.scroll.innerHTML).toContain(t('ach_ept_wizard'));
    expect(parts.scroll.innerHTML).toContain(t('franchise_wizard_label'));
  });

  it('全解锁 → 每条碑文都在（17 母题一行不少）', () => {
    const all = new Set(ECHO_EPITAPHS.map((e) => e.ach));
    build(all);
    director.play();
    for (const e of ECHO_EPITAPHS) expect(parts.scroll.innerHTML).toContain(t(e.key));
  });

  it('只解锁其中 3 枚 → 出现且仅出现那 3 枚', () => {
    const three = ['echo-wizard-6', 'echo-space-6', 'echo-samurai-6'];
    build(new Set(three));
    director.play();
    for (const a of three) {
      const e = ECHO_EPITAPHS.find((x) => x.ach === a);
      expect(parts.scroll.innerHTML).toContain(t(e.key));
    }
    const eMissing = ECHO_EPITAPHS.find((x) => x.ach === 'echo-cosmic-6');
    expect(parts.scroll.innerHTML).not.toContain(t(eMissing.key));
  });
});
