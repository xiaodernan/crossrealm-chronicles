/**
 * 说明书正文 i18n（W-D2 切片15）。
 *
 * 章节标题与正文原本是 `ui/HelpManual.js` 里的成段中文，连同 `{动作}` 占位一起写死。
 * 切片15 把它们搬进双表（`hm_title_*` / `hm_body_*`），数据表只留文案键，播出那一刻才
 * 走 `keyText(t(key))` 展开。门禁要钉住三件事：
 *  1. 数据表真的只存键、不存字面量（"界面改成问表"落到了数据层）；
 *  2. 每个键都能解析到真文案，且不会把键名或 `[MISSING` 摆给玩家；
 *  3. 解析路径是活的（反向控制：一个不存在的键必须回 `[MISSING`，否则"全绿"与"根本没跑"不可分）。
 */
import { describe, it, expect } from 'vitest';
import { t } from '../src/engine/i18n.js';
import { keyText } from '../src/content/keyHints.js';
import { SECTIONS } from '../src/ui/HelpManual.js';

describe('说明书正文 i18n（W-D2 切片15）', () => {
  it('章节总数够多（分母守卫：主 7 + 扩写 3 = 10）', () => {
    expect(SECTIONS.length).toBeGreaterThanOrEqual(10);
  });

  for (const sec of SECTIONS) {
    it(`章节 ${sec.id}：数据表只存键，不存字面量`, () => {
      expect(sec.title, `${sec.id}.title 应是文案键`).toMatch(/^hm_/);
      expect(sec.body, `${sec.id}.body 应是文案键`).toMatch(/^hm_/);
    });

    it(`章节 ${sec.id}：标题与正文都能解析到真文案（非 [MISSING、也不等于键名）`, () => {
      const title = t(sec.title);
      const body = t(sec.body);
      expect(title).not.toMatch(/^\[MISSING/);
      expect(title).not.toBe(sec.title);
      expect(title.length).toBeGreaterThan(0);
      expect(body).not.toMatch(/^\[MISSING/);
      expect(body).not.toBe(sec.body);
      expect(body.length).toBeGreaterThan(0);
    });

    it(`章节 ${sec.id}：播出那一刻展开后，正文不留 [MISSING、也不把键名摆出来`, () => {
      let rendered;
      expect(() => { rendered = keyText(t(sec.body)); }, '正文里的 {动作} 占位必须是登记过的动作').not.toThrow();
      expect(rendered).not.toMatch(/\[MISSING/);
      expect(rendered).not.toContain(sec.body); // 渲染结果不应还是那串键名
    });
  }

  it('反向控制：一个没登记的键必须回 [MISSING（证明解析路径是活的）', () => {
    expect(t('hm_body_does_not_exist_xyz')).toMatch(/^\[MISSING/);
  });

  it('内容完整性：几段关键正文渲染后仍能找到标志性字样', () => {
    const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
    expect(keyText(t(byId.start.body))).toContain('世界之锚');
    expect(keyText(t(byId.combat.body))).toContain('弹反');
    expect(keyText(t(byId['pop-culture'].body))).toContain('致敬');
  });
});
