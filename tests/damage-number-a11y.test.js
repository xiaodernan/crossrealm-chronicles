/**
 * 伤害飘字的非颜色冗余（W-D6 切片2）
 *
 * ## 改前是什么样
 * 暴击与普通伤害**只靠颜色区分** —— `hit.crit ? '#ff5566' : s.color`，两处调用点
 * （`combat/CombatController.js` 与 `combat/SpellSystem.js`）。对红绿色觉异常
 * 就等于没有区分：那两串数字看起来一模一样。
 *
 * ## 这一片加的
 * `spawn` 多一个 `kind` 参数（`normal` / `crit` / `heal` / `weak`），每种 kind 带两样
 * **颜色以外**的东西：CSS 类（拉开**字号**，见 `style.css` 的 `.dn-*`）与文本记号
 * （暴击 `!`、治疗 `+`）。于是"这一下是不是暴击"在关掉颜色之后仍然读得出来。
 *
 * ## 用例分七层
 * ① 种类表与"认不出就抛"；② 非颜色冗余真的存在（记号 + 类名互异）；
 * ③ **CSS 里的字号真的不同**（读 `src/style.css`，不是信注释）；
 * ④ `spawn` 把类名与记号落到 DOM 上；⑤ **池化不留残留**（这一层是本片最要紧的不变量）；
 * ⑥ 调用方真的传了 kind；⑦ 反面证据。
 *
 * ## 没有 jsdom
 * 仓里的测试环境是 node（既有惯例：`tests/key-hint.test.js` 喂一个只认两种选择器的假根节点），
 * 所以这里喂一个只认 `className` / `textContent` / `style` 的假 div。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import {
  DamageNumbers, DAMAGE_KINDS, DAMAGE_KIND_IDS, damageKindOf,
} from '../src/combat/DamageNumbers.js';

const ROOT = process.cwd();

/** 假 div：只认本片与 `CSS2DObject` 构造用到的几样（`setAttribute` 是它要的） */
const fakeDiv = () => ({
  className: '', textContent: '', style: {},
  setAttribute() {}, remove() {},
});

let created;
beforeEach(() => {
  created = [];
  globalThis.document = {
    createElement() { const d = fakeDiv(); created.push(d); return d; },
  };
});
afterEach(() => { delete globalThis.document; });

const mk = (cap = 4) => new DamageNumbers(new THREE.Scene(), cap);
const pos = () => new THREE.Vector3(0, 0, 0);

describe('伤害飘字的非颜色冗余（W-D6 切片2）', () => {
  describe('① 种类表与"认不出就抛"', () => {
    it('四种都在，每种都有 cls / prefix / suffix / label', () => {
      expect(DAMAGE_KIND_IDS).toEqual(['normal', 'crit', 'heal', 'weak']);
      for (const id of DAMAGE_KIND_IDS) {
        const k = DAMAGE_KINDS[id];
        expect(k.cls, `${id}.cls`).toBeTruthy();
        expect(typeof k.prefix).toBe('string');
        expect(typeof k.suffix).toBe('string');
        expect(k.label, `${id}.label`).toBeTruthy();
      }
    });

    it('认不出就抛，且说得出可用种类', () => {
      expect(() => damageKindOf('supercrit')).toThrow(/未知的飘字种类/);
      expect(() => damageKindOf('supercrit')).toThrow(/crit/);
      expect(() => mk().spawn(pos(), '42', '#fff', 'supercrit')).toThrow(/未知的飘字种类/);
    });

    it('表是冻的', () => {
      expect(Object.isFrozen(DAMAGE_KINDS)).toBe(true);
    });
  });

  describe('② 非颜色冗余真的存在', () => {
    it('暴击带 `!`、治疗带 `+`（文本记号）', () => {
      expect(DAMAGE_KINDS.crit.suffix).toBe('!');
      expect(DAMAGE_KINDS.heal.prefix).toBe('+');
    });

    it('四种的类名互不相同（字号档才拉得开）', () => {
      const clss = DAMAGE_KIND_IDS.map((id) => DAMAGE_KINDS[id].cls);
      expect(new Set(clss).size).toBe(clss.length);
    });

    it('至少有一种 kind 的记号是"有"的 —— 不许全空（那等于没有冗余）', () => {
      const marked = DAMAGE_KIND_IDS.filter((id) => DAMAGE_KINDS[id].prefix || DAMAGE_KINDS[id].suffix);
      expect(marked.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('③ CSS 里的字号真的不同（读文件，不是信注释）', () => {
    const css = readFileSync(join(ROOT, 'src', 'style.css'), 'utf8');
    const fontSizeOf = (selector) => {
      // 取该选择器块里的 font-size
      const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
      const m = css.match(re);
      if (!m) return null;
      const fs = m[1].match(/font-size:\s*([0-9.]+)px/);
      return fs ? Number(fs[1]) : null;
    };

    it('基类有字号，且三个带记号的档与基类不同', () => {
      const base = fontSizeOf('.damage-number');
      expect(base, '.damage-number 的 font-size').toBeTruthy();
      for (const id of ['crit', 'heal', 'weak']) {
        const fs = fontSizeOf(`.damage-number.${DAMAGE_KINDS[id].cls}`);
        expect(fs, `.${DAMAGE_KINDS[id].cls} 的 font-size`).toBeTruthy();
        expect(fs, `.${DAMAGE_KINDS[id].cls} 应当与基类不同字号`).not.toBe(base);
      }
    });

    it('暴击的字号**大于**基类（不是靠变小来区分）', () => {
      expect(fontSizeOf(`.damage-number.${DAMAGE_KINDS.crit.cls}`))
        .toBeGreaterThan(fontSizeOf('.damage-number'));
    });
  });

  describe('④ spawn 把类名与记号落到 DOM 上', () => {
    // 这一层一律 cap=1：`free.pop()` 取的是**最后**一条，池子大时 `created[0]` 根本没被用到
    // （第一版四条就是这么读错的 —— 读到的 div 上什么都没有）。
    it('普通伤害：基类 + 种类类，文本不带记号', () => {
      const dn = mk(1);
      dn.spawn(pos(), '42');
      const div = created[0];
      expect(div.className).toBe(`damage-number ${DAMAGE_KINDS.normal.cls}`);
      expect(div.textContent).toBe('42');
    });

    it('暴击：文本末尾多一个 `!`，类名换成 dn-crit', () => {
      const dn = mk(1);
      dn.spawn(pos(), '42', '#ff5566', 'crit');
      const div = created[0];
      expect(div.className).toContain(DAMAGE_KINDS.crit.cls);
      expect(div.textContent).toBe('42!');
    });

    it('治疗：文本前面多一个 `+`', () => {
      const dn = mk(1);
      dn.spawn(pos(), '30', '#63d97a', 'heal');
      expect(created[0].textContent).toBe('+30');
    });

    it('颜色仍然照传（颜色没被取消，只是不再是唯一的区分手段）', () => {
      const dn = mk(1);
      dn.spawn(pos(), '42', '#ff5566', 'crit');
      expect(created[0].style.color).toBe('#ff5566');
    });
  });

  describe('⑤ 池化不留残留（本片最要紧的不变量）', () => {
    it('先暴击再普通：第二条身上不许留着 dn-crit', () => {
      const dn = mk(1); // 只建一条 → 第二条必然复用第一条
      dn.spawn(pos(), '42', '#ff5566', 'crit');
      const first = created[0];
      expect(first.className).toContain('dn-crit');
      dn.spawn(pos(), '7');
      expect(first.className, '复用后类名要整体重设').toBe(`damage-number ${DAMAGE_KINDS.normal.cls}`);
      expect(first.className).not.toContain('dn-crit');
      expect(first.textContent, '复用后记号也要清掉').toBe('7');
    });

    it('先治疗再暴击：`+` 不许留在暴击那条上', () => {
      const dn = mk(1);
      dn.spawn(pos(), '30', '#63d97a', 'heal');
      const div = created[0];
      expect(div.textContent).toBe('+30');
      dn.spawn(pos(), '99', '#ff5566', 'crit');
      expect(div.textContent).toBe('99!');
    });

    it('往返四轮之后仍然干净', () => {
      const dn = mk(1);
      const div = created[0];
      for (const id of DAMAGE_KIND_IDS) {
        dn.spawn(pos(), '1', '#fff', id);
        expect(div.className).toBe(`damage-number ${DAMAGE_KINDS[id].cls}`);
      }
    });
  });

  describe('⑥ 调用方真的传了 kind', () => {
    it('CombatController 与 SpellSystem 的暴击分支都传 crit', () => {
      for (const rel of ['combat/CombatController.js', 'combat/SpellSystem.js']) {
        const src = readFileSync(join(ROOT, 'src', rel), 'utf8');
        expect(src, `${rel} 要传种类`).toMatch(/hit\.crit\s*\?\s*'crit'\s*:\s*'normal'/);
      }
    });
  });

  describe('⑦ 反面证据：尺子自己要被量过', () => {
    it('那把读 CSS 字号的尺子认得出"同字号"与"没写字号"', () => {
      const probe = (text, selector) => {
        const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
        const m = text.match(re);
        if (!m) return null;
        const fs = m[1].match(/font-size:\s*([0-9.]+)px/);
        return fs ? Number(fs[1]) : null;
      };
      const css = '.a { font-size: 14px; }\n.a.b { font-size: 14px; }\n.a.c { color: red; }';
      expect(probe(css, '.a')).toBe(14);
      expect(probe(css, '.a.b')).toBe(14);   // 同字号 → 能被读出来（门禁据此判红）
      expect(probe(css, '.a.c')).toBe(null); // 没写字号 → null（门禁据此判红）
      expect(probe(css, '.a.z')).toBe(null); // 没有这一块
    });
  });
});
