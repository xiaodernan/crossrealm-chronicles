/**
 * 英文表纯净门禁 —— 「英文模式无中文」的最后一道关。
 *
 * 用户明确要求：英文模式下全部统一英文，不许中英夹杂。
 * 实测（改前）：`strings.en.js` 有 4 处 `English · 中文` 并列——
 *   trilance_cast_cta / trilance_cast_done / trilance_aligned_title / trilance_staggered_title，
 * 玩家在英文模式的「三日曜盘」页签上会看到「起曜盘 / 本周曜盘已起 / 合帘 / 余响」。
 *
 * 钉住三件事：
 *  ① 英文表的**值**里不许出现 CJK 汉字；
 *  ② 英文表的值里不许出现中文标点（，。！？；：、（）【】「」）；
 *  ③ 反向控制：中文表必须有汉字（否则说明表被清空了、门禁会假绿）。
 *
 * 变异判据：往英文表塞回一处中文 → ①红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const EN = readFileSync('src/content/strings.en.js', 'utf8');
const ZH = readFileSync('src/content/strings.zh.js', 'utf8');

/**
 * 模板值里唯一允许出现汉字的键：典籍馆年表的**剧情提纲**。
 * 那一段讲的是「火 / 灶 / 守 / 记 / 炉火」这些汉字本身如何成为故事道具——
 * 把「墨鹮」「横桥。火等。」译成英文就等于把原文道具换掉，不是翻译而是改写。
 * 它是叙事引用，不是没翻的界面标签；其余模板一律纯英文。
 */
const ALLOW_TMPL_CJK = new Set(['hm_body_codex']);

/** 抽出「键: '值'」里的值（单引号字符串，够用：两表都是这个写法） */
const values = (src) => {
  const out = [];
  const re = /^\s*([a-z0-9_]+):\s*'((?:[^'\\]|\\.)*)'/gm;
  let m;
  while ((m = re.exec(src)) !== null) out.push([m[1], m[2]]);
  return out;
};

describe('英文表纯净（英文模式无中文）', () => {
  it('英文表的值里没有 CJK 汉字（单引号 + 反引号两种写法都扫）', () => {
    const bad = values(EN).filter(([, v]) => /[\u4e00-\u9fa5]/.test(v));
    expect(bad.map(([k]) => k), `英文表仍有中文：${bad.map(([k]) => k).join(', ')}`).toEqual([]);
    // 旧门只认 `key: '值'`，把反引号模板整段漏掉——五个说明书章节曾因此残留
    // 「炉火报讯台 / Fireside rumors」「典籍 / Lore」这类没翻的 UI 标签。
    const tmpl = [...EN.matchAll(/^\s*([a-z0-9_]+):\s*`([\s\S]*?)`,?\s*$/gm)]
      .filter((m) => !ALLOW_TMPL_CJK.has(m[1]));
    const badTmpl = tmpl.filter((m) => /[\u4e00-\u9fa5]/.test(m[2]));
    expect(badTmpl.map((m) => m[1]), `英文表模板值仍有中文：${badTmpl.map((m) => m[1]).join(', ')}`).toEqual([]);
  });

  it('英文表的值里没有中文标点', () => {
    const bad = values(EN).filter(([, v]) => /[，。！？；：、（）【】「」《》]/.test(v));
    expect(bad.map(([k]) => k)).toEqual([]);
  });

  it('反向控制：中文表确实有大量汉字（门禁不会因为表被清空而假绿）', () => {
    const withHan = values(ZH).filter(([, v]) => /[\u4e00-\u9fa5]/.test(v));
    expect(withHan.length).toBeGreaterThan(1000);
  });
});

describe('中文表纯净（中文模式无漏翻的英文短语）', () => {
  /**
   * 刻意保留英文原文的键 —— **每一条都要写明理由**，且必须已被
   * `zone-poi-dialogue-i18n.test.js` 的「钉文案腿」逐字钉住（= 有人显式审阅过）。
   * 目前只有一条：五维碑文引用的是《星际穿越》原句，碑文保留原文是设计，
   * 不是漏翻；同族其它 discovery 文案都是中文。
   */
  const KEEP_ENGLISH = new Set(['zone_disc_void_tablet_text']);

  it('中文表里没有「无中文 + 两个以上英文单词」的值（占位符模板与显式白名单除外）', () => {
    const bad = values(ZH).filter(([k, v]) => {
      if (KEEP_ENGLISH.has(k)) return false;
      if (/[\u4e00-\u9fa5]/.test(v)) return false;
      if (v.includes('${') || v.includes('{')) return false; // 占位符模板：真实值由调用方给
      const words = v.match(/[A-Za-z][A-Za-z'-]+/g) ?? [];
      return words.length >= 2;
    });
    expect(bad.map(([k, v]) => `${k}=${v}`), `疑似漏翻：${bad.map(([k]) => k).join(', ')}`).toEqual([]);
  });

  it('白名单不许悄悄膨胀：每条都必须有理由且被钉文案腿覆盖', () => {
    expect([...KEEP_ENGLISH]).toEqual(['zone_disc_void_tablet_text']);
    const pinFile = readFileSync('tests/zone-poi-dialogue-i18n.test.js', 'utf8');
    for (const k of KEEP_ENGLISH) {
      expect(pinFile.includes(k), `白名单键 ${k} 必须在钉文案腿里被显式审阅过`).toBe(true);
    }
  });

  it('反向控制：判据真能抓到多词英文（把一条塞进样本必须被识别）', () => {
    const sample = [['demo_key', 'Hidden Treasures'], ['ok_key', '隐藏的宝藏'], ['ph_key', '${a} · ${b}']];
    const bad = sample.filter(([k, v]) => {
      if (KEEP_ENGLISH.has(k)) return false;
      if (/[\u4e00-\u9fa5]/.test(v)) return false;
      if (v.includes('${') || v.includes('{')) return false;
      const words = v.match(/[A-Za-z][A-Za-z'-]+/g) ?? [];
      return words.length >= 2;
    });
    expect(bad.map(([k]) => k)).toEqual(['demo_key']);
  });
});
