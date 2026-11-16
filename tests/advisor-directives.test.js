/**
 * W-Z286 · 星轨顾问的指引协议 —— 模型提名的目的地必须变成真按钮，不可信文本只进 textContent。
 *
 * 钉住四件事：
 *  ① 白名单与日志页签 registry 同源、且两表都有真文案（中文不混英文、英文不混中文以外的不可预期字符）；
 *  ② 协议标记 `⟦guide:slug⟧` 只认白名单，none / 未知 slug 净删除，且总数上限 3、去重；
 *  ③ 正式通道优先，降级通道（别名 substring）兜底，两条都不会把可见的协议文本漏给玩家；
 *  ④ 解析结果按出现顺序落盘——顺序是稳定的，按钮不会乱跳。
 */
import { describe, it, expect } from 'vitest';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { JOURNAL_EXTRA_TABS } from '../src/ui/JournalTabRegistry.js';
import {
  DIRECTIVE_TABS,
  stripAdvisorDirectives,
  parseAdvisorDirectives,
  aliasFallbackDirectives,
  resolveAdvisorDirectives,
} from '../src/content/advisorDirectives.js';

const slugKeys = Object.keys(DIRECTIVE_TABS);

describe('指引协议 · 白名单', () => {
  it('每一格都存在于日志页签 registry，且中英两表都有活文案', () => {
    expect(slugKeys.length).toBeGreaterThan(10);
    for (const slug of slugKeys) {
      expect(JOURNAL_EXTRA_TABS[slug], `registry 缺 ${slug}`).toBeTruthy();
      expect(JOURNAL_EXTRA_TABS[slug], `文案键漂移：${slug}`).toBe(DIRECTIVE_TABS[slug]);
      expect(STRINGS_ZH[JOURNAL_EXTRA_TABS[slug]], `zh 缺 ${slug}`).toBeTruthy();
      expect(STRINGS_EN[JOURNAL_EXTRA_TABS[slug]], `en 缺 ${slug}`).toBeTruthy();
    }
  });

  it('白名单里不存在通用导航词（starpath / 星轨）这种会误伤别处的别名', () => {
    const labels = slugKeys.map((s) => STRINGS_ZH[JOURNAL_EXTRA_TABS[s]]);
    expect(labels.every((l) => !/^星轨$/.test(l.trim()))).toBe(true);
  });
});

describe('指引协议 · 正式通道（parseAdvisorDirectives / stripAdvisorDirectives）', () => {
  it('只认白名单，none 视为零提名', () => {
    expect(parseAdvisorDirectives('答案⟦guide:canon⟧').slugs).toEqual(['canon']);
    expect(parseAdvisorDirectives('答案⟦guide:none⟧').slugs).toEqual([]);
    expect(parseAdvisorDirectives('答案⟦guide:palace⟧').slugs).toEqual([]);
    expect(parseAdvisorDirectives('meto palace⟦guide:pass⟧ and canon⟦guide:canon⟧').slugs).toEqual(['pass', 'canon']);
  });

  it('总数上限 3，去重', () => {
    expect(parseAdvisorDirectives('a⟦guide:canon⟧b⟦guide:vigil⟧c⟦guide:pass⟧d⟦guide:flame⟧').slugs)
      .toEqual(['canon', 'vigil', 'pass']);
    expect(parseAdvisorDirectives('a⟦guide:canon⟧b⟦guide:canon⟧c⟦guide:canon⟧').slugs).toEqual(['canon']);
  });

  it('可见文本里绝不残留协议标记', () => {
    const out = stripAdvisorDirectives('好，你去典籍馆看\n\n⟦guide:canon⟧ 答案是这样。⟦guide:none⟧');
    expect(out).not.toMatch(/⟦guide:/);
    expect(out).toContain('你去典籍馆看');
    expect(out).toContain('答案是这样。');
  });

  it('空串 / 纯标记也不炸', () => {
    expect(stripAdvisorDirectives('')).toBe('');
    expect(stripAdvisorDirectives('⟦guide:canon⟧')).toBe('');
    expect(parseAdvisorDirectives('').slugs).toEqual([]);
    expect(parseAdvisorDirectives(null).slugs).toEqual([]);
  });
});

describe('指引协议 · 降级通道（别名 substring）与总解析', () => {
  const zhLabel = (slug) => STRINGS_ZH[JOURNAL_EXTRA_TABS[slug]];
  const enLabel = (slug) => STRINGS_EN[JOURNAL_EXTRA_TABS[slug]];

  it('中文正文提到「典籍馆」即指向 canon；提到「炉火的交棒」即指向 pass', () => {
    expect(aliasFallbackDirectives('你去典籍馆翻翻那一篇再说。', zhLabel)).toContain('canon');
    expect(aliasFallbackDirectives('这七百年的最后一课——炉火的交棒——你接不住', zhLabel)).toContain('pass');
  });

  it('英文正文 same matching（大小写不敏感）', () => {
    expect(aliasFallbackDirectives('Open the Codex · the Canon before anything else.', enLabel)).toContain('codex');
  });

  it('过短别名（如 \'·\' 切出小于 2 字符的段）不参与匹配', () => {
    expect(aliasFallbackDirectives('·', zhLabel)).toEqual([]);
  });

  it('正式通道优先：正文提到「典籍馆」但标记写的是 vigil —— 按 vigil 走', () => {
    const text = '去典籍馆里翻翻吧——答案在第 131 卷。⟦guide:vigil⟧';
    expect(resolveAdvisorDirectives(text, zhLabel)).toEqual(['vigil']);
  });

  it('总解析：无正式标记时按别名兜底；都没有就是零提名（不是零容错）', () => {
    expect(resolveAdvisorDirectives('风吹过院子——你可以回家了。', zhLabel)).toEqual([]);
    expect(resolveAdvisorDirectives('去典籍馆看⟦guide:canon⟧', zhLabel)).toEqual(['canon']);
  });

  it('出现顺序稳定：按文中出现顺序输出（按钮位置不跳）', () => {
    const text = '先去营火记忆⟦guide:memory⟧，再去炉火的交棒⟦guide:pass⟧';
    expect(resolveAdvisorDirectives(text, zhLabel)).toEqual(['memory', 'pass']);
  });
});
