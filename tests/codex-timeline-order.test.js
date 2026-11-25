import { describe, it, expect } from 'vitest';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

/**
 * 典籍年表的新条目必须插在正文里、footer 之前。
 *
 * W-Z524 真 bug：第 292 行被追加到「想在游戏之外继续读？」footer **之后**，
 * 玩家在说明书里会看到它孤零零挂在最底下、脱离年表。生成器 `build-llm-prefix-v3.mjs`
 * 读的是源文件字面量所以前缀是对的，运行时字符串却是错的——静态与运行时分家的经典形状。
 */
describe('说明书典籍年表的条目顺序', () => {
  for (const [lang, body, footer] of [
    ['zh', STRINGS_ZH.hm_body_codex, '想在游戏之外继续读'],
    ['en', STRINGS_EN.hm_body_codex, 'Continue reading outside the game?'],
  ]) {
    it(`${lang} 最后一条年表在 footer 之前`, () => {
      const fi = body.indexOf(footer);
      const last = [...body.matchAll(/^\d+ · /gm)].pop();
      expect(last, '找不到年表条目').toBeTruthy();
      expect(fi, '找不到 footer').toBeGreaterThan(0);
      expect(last.index, `最后一条年表 ${last[0]} 跑到了 footer 之后`).toBeLessThan(fi);
    });
  }

  it('中英年表条目数一致且等于卷数 292', () => {
    const count = (s) => [...s.matchAll(/^\d+ · /gm)].length;
    expect(count(STRINGS_ZH.hm_body_codex)).toBe(292);
    expect(count(STRINGS_EN.hm_body_codex)).toBe(292);
  });
});
