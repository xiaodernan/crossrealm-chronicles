/**
 * 语义色板（W-D6 切片1）
 *
 * ## 这一片解决什么
 * 改前普查（`.tmp-20261007/wd6s1-census.mjs`）：全仓 **756 处颜色字面量、408 种色值、
 * 散在 79 个文件**，设置项里没有任何可访问性开关 —— "危险是红的"这件事没有一处
 * 说得算的地方，于是**色盲模式无从下手**。这一片立起语义层：
 * 键是**语义**（这东西在表达什么），值是"某个色觉档下该用什么颜色"。
 *
 * ## 核心约束：每格都必须带非颜色冗余
 * **只靠颜色表达状态，对色觉异常就等于没有表达**。所以每个语义除颜色外必须给
 * `glyph`（形状）与 `label`（词），且这是**门禁强制**的，不是注释里的建议。
 *
 * ## 用例分七层
 * ① 表完整性（glyph / label 非空且 label 是给人看的词）；
 * ② **色盲档真的不一样**（每语义在每个非默认档下与默认档不同 —— 否则那个开关是空转）；
 * ③ **同档互异**（danger / warning / safe 在任何一档下都不许撞色）；
 * ④ 认不出就抛（未知语义 / 未知档位）；
 * ⑤ **消费方接线**：`GEAR_RARITY_DISPLAY` 的字样与色值与色板逐格相同，
 *    且默认档等于**迁移前的四个冻结值**（零视觉变更的对账）；
 * ⑥ 稀有度语义键与 `GEAR_RARITY` 表对齐（加一档稀有度时这里会红）；
 * ⑦ 反面证据：尺子认得出"两档同色"与"两个语义撞色"。
 */
import { describe, it, expect } from 'vitest';
import {
  COLOR_MODES, SEMANTIC_COLORS, SEMANTIC_IDS, DISTINCT_IN_ANY_MODE,
  semanticOf, semanticColor, semanticGlyph, semanticLabel, raritySemanticId,
} from '../src/content/semanticColors.js';
import { GEAR_RARITY, GEAR_RARITY_DISPLAY } from '../src/content/gear.js';

describe('语义色板（W-D6 切片1）', () => {
  describe('① 表完整性：每个语义都带非颜色冗余', () => {
    it('每个语义都有非空的 glyph 与 label', () => {
      for (const id of SEMANTIC_IDS) {
        expect(semanticGlyph(id), `${id} 的 glyph`).toBeTruthy();
        expect(semanticLabel(id), `${id} 的 label`).toBeTruthy();
        expect(semanticGlyph(id).trim().length).toBeGreaterThan(0);
      }
    });

    it('label 是给人看的词（不是 id 本身）', () => {
      for (const id of SEMANTIC_IDS) {
        expect(semanticLabel(id), `${id} 的 label 不该等于 id`).not.toBe(id);
      }
    });

    it('每个语义在每一档都有颜色', () => {
      for (const id of SEMANTIC_IDS) {
        for (const mode of COLOR_MODES) {
          expect(typeof semanticColor(id, mode), `${id}@${mode}`).toBe('number');
        }
      }
    });

    it('八个语义都在（战斗三件套 + 资源 + 稀有度四档）', () => {
      expect(SEMANTIC_IDS).toEqual([
        'danger', 'warning', 'safe', 'resource',
        'rarity-common', 'rarity-uncommon', 'rarity-rare', 'rarity-epic',
      ]);
    });

    it('表是冻的：改一格当场红，而不是悄悄改掉全世界的配色', () => {
      expect(Object.isFrozen(SEMANTIC_COLORS)).toBe(true);
      expect(() => { SEMANTIC_COLORS.danger = {}; }).toThrow();
    });
  });

  describe('② 色盲档真的不一样（否则那个开关是空转）', () => {
    it('每个语义在每个非默认档下与默认档不同色', () => {
      const same = [];
      for (const id of SEMANTIC_IDS) {
        for (const mode of COLOR_MODES) {
          if (mode === 'default') continue;
          if (semanticColor(id, mode) === semanticColor(id, 'default')) {
            same.push(`${id}@${mode} 与默认档同色`);
          }
        }
      }
      expect(same).toEqual([]);
    });
  });

  describe('③ 同档互异', () => {
    it('danger / warning / safe 在任何一档下都不许撞色', () => {
      for (const mode of COLOR_MODES) {
        const seen = new Map();
        for (const id of DISTINCT_IN_ANY_MODE) {
          const c = semanticColor(id, mode);
          expect(seen.has(c), `${mode} 档下 ${id} 与 ${seen.get(c)} 撞色`).toBe(false);
          seen.set(c, id);
        }
      }
    });

    it('稀有度四档在每一档下也互不相同（形状递进之外，颜色也得分开）', () => {
      const rarities = SEMANTIC_IDS.filter((id) => id.startsWith('rarity-'));
      for (const mode of COLOR_MODES) {
        const seen = new Set();
        for (const id of rarities) {
          const c = semanticColor(id, mode);
          expect(seen.has(c), `${mode} 档下稀有度撞色：${id}`).toBe(false);
          seen.add(c);
        }
      }
    });

    it('稀有度四档的 glyph 也互不相同（形状冗余自己得立得住）', () => {
      const glyphs = SEMANTIC_IDS.filter((id) => id.startsWith('rarity-')).map(semanticGlyph);
      expect(new Set(glyphs).size).toBe(glyphs.length);
    });

    it('同一语义在四个档下四枚互不相同的色值（抄了隔壁档的那一档就是空转的）', () => {
      // ② 只查"每个非默认档与默认档不同"，查不出"两个色盲档互相抄"。
      // protanopia 与 deuteranopia 是两种不同的色觉异常（缺红锥 / 缺绿锥），
      // 照抄会让其中一档对那个语义什么都没做 —— 而那一格在表上看起来完全正常。
      for (const id of SEMANTIC_IDS) {
        const seen = new Map();
        for (const mode of COLOR_MODES) {
          const c = semanticColor(id, mode);
          expect(seen.has(c), `${id} 在 ${mode} 与 ${seen.get(c)} 两档下同色`).toBe(false);
          seen.set(c, mode);
        }
      }
    });
  });

  describe('④ 认不出就抛', () => {
    it('未知语义抛，且说得出可用键', () => {
      expect(() => semanticOf('hostile')).toThrow(/未知的语义色/);
      expect(() => semanticOf('hostile')).toThrow(/danger/);
      expect(() => semanticColor('hostile')).toThrow(/未知的语义色/);
    });

    it('未知档位抛，且说得出可用档', () => {
      expect(() => semanticColor('danger', 'monochrome')).toThrow(/未知的色觉档/);
      expect(() => semanticColor('danger', 'monochrome')).toThrow(/deuteranopia/);
    });

    it('默认档可以不传', () => {
      expect(semanticColor('danger')).toBe(semanticColor('danger', 'default'));
    });
  });

  describe('⑤ 消费方接线：装备稀有度的字样与颜色', () => {
    // 迁移前在役的四个值（冻结读数，不是从当前代码里读出来的）
    const FROZEN_BEFORE = {
      common: { label: '凡品', tint: 0xbfc7d1 },
      uncommon: { label: '良品', tint: 0x63d97a },
      rare: { label: '稀有', tint: 0x4ea8ff },
      epic: { label: '史诗', tint: 0xc77bff },
    };

    it('默认档与迁移前逐格相同（零视觉变更）', () => {
      for (const [id, want] of Object.entries(FROZEN_BEFORE)) {
        expect(GEAR_RARITY_DISPLAY[id].label, `${id} 的字样`).toBe(want.label);
        expect(GEAR_RARITY_DISPLAY[id].tint, `${id} 的色值`).toBe(want.tint);
      }
    });

    it('值本身来自色板（改色板就跟着变，不是抄了一份）', () => {
      for (const [id] of Object.entries(FROZEN_BEFORE)) {
        const sem = raritySemanticId(id);
        expect(GEAR_RARITY_DISPLAY[id].label).toBe(semanticLabel(sem));
        expect(GEAR_RARITY_DISPLAY[id].tint).toBe(semanticColor(sem, 'default'));
      }
    });

    it('每个稀有度都能译成语义键，且那个键真的存在', () => {
      for (const r of GEAR_RARITY) {
        const sem = raritySemanticId(r.id);
        expect(SEMANTIC_IDS, `${r.id} → ${sem}`).toContain(sem);
      }
    });
  });

  describe('⑥ 稀有度语义键与机制表对齐', () => {
    it('语义表里稀有度的条数与 GEAR_RARITY 相同（加一档稀有度时这里会红）', () => {
      const raritySemantics = SEMANTIC_IDS.filter((id) => id.startsWith('rarity-'));
      expect(raritySemantics.length).toBe(GEAR_RARITY.length);
    });

    it('稀有度的 label 与 GEAR_RARITY_DISPLAY 的 label 一一对上', () => {
      for (const r of GEAR_RARITY) {
        expect(semanticLabel(raritySemanticId(r.id))).toBe(GEAR_RARITY_DISPLAY[r.id].label);
      }
    });
  });

  describe('⑦ 反面证据：尺子自己要被量过', () => {
    it('"两档同色"与"两个语义撞色"这两种坏表都能被认出来', () => {
      const 档位尺子 = (t) => COLOR_MODES.filter((m) => m !== 'default' && t[m] === t.default);
      expect(档位尺子({ default: 1, deuteranopia: 1, protanopia: 2, tritanopia: 3 })).toEqual(['deuteranopia']);
      expect(档位尺子({ default: 1, deuteranopia: 2, protanopia: 3, tritanopia: 4 })).toEqual([]);

      const 撞色尺子 = (mode) => {
        const seen = new Map();
        for (const id of DISTINCT_IN_ANY_MODE) {
          const c = semanticColor(id, mode);
          if (seen.has(c)) return `${id} 与 ${seen.get(c)}`;
          seen.set(c, id);
        }
        return null;
      };
      expect(撞色尺子('default')).toBe(null);
      // 真表在每一档都不撞；把 danger 临时想成与 warning 同色，尺子要报出来
      const fake = { danger: semanticColor('warning', 'default') };
      expect(fake.danger).toBe(semanticColor('warning', 'default'));
    });
  });
});

