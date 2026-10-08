/**
 * 治疗飘字（W-D6 切片5）
 *
 * ## 改前是什么样
 * `DAMAGE_KINDS.heal` 自切片2 起**一个调用点都没有**：`restore`（`dungeon-supply` 事件入口）
 * 与 `restHeal`（快速旅行/休息）都只改数值。玩家吃下一口补给，屏幕上一个数字都不弹，
 * 只能靠血条跳一下猜自己回了多少 —— 而战斗中血条正在被别的信息抢注意力。
 *
 * ## 这一片加的
 * 两个入口在"真的回了血"时弹一枚 `heal` 飘字：颜色取 `safe` 语义（跟着色盲档变），
 * 另外还有 `+` 前缀与单独字号（切片2 已铺好），所以关掉颜色也读得出"这是治疗、不是伤害"。
 *
 * ## 用例分七层
 * ① `cssColorOf` 与 `semanticColor` 同源同算式，只是形状不同（数 / 串）；
 * ② `restore` 真的回血时弹一枚，种类与颜色都对；
 * ③ 边界：满血再吃不弹、只回精力不回血不弹、超上限的部分不算；
 * ④ `restHeal` 同理（不满才弹，弹的是差值）；
 * ⑤ 换色盲档后治疗色**跟着变**（不是只在出厂档好看）；
 * ⑥ 调用点唯一：`cssColorOf('safe')` 在 CombatController 里只有一处；
 * ⑦ 反面证据：那把"数颜色调用点"的尺子自己要被量过。
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { CombatController } from '../src/combat/CombatController.js';
import { DAMAGE_KINDS, damageKindOf } from '../src/combat/DamageNumbers.js';
import { cssColorOf, setColorVision, resetColorVision } from '../src/game/ColorVision.js';
import { COLOR_MODES, semanticColor } from '../src/content/semanticColors.js';

const ROOT = process.cwd();

/** CombatController 通过 window 事件对外广播，node 环境下补一个最小派发器（同 combat.test.js） */
beforeAll(() => {
  const handlers = new Map();
  globalThis.window = {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    dispatchEvent(event) {
      handlers.get(event.type)?.forEach((fn) => fn(event));
      return true;
    },
  };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
});

/** 每次用例后回出厂档：色觉档是模块级的，漏一次复位就会污染后面的用例 */
afterEach(() => { resetColorVision(); });

const makePlayer = () => ({
  scene: new THREE.Group(),
  position: new THREE.Vector3(0, 0, 0),
  getCombatForwardXZ: () => new THREE.Vector3(0, 0, -1),
});

/** 记录型 damageNumbers 替身：只记调用，不建 DOM */
const recorder = () => {
  const calls = [];
  return { calls, spawn(position, text, color, kind) { calls.push({ position, text, color, kind }); return null; } };
};

const makeCombat = (damageNumbers) => new CombatController(
  makePlayer(),
  { enemies: [], getAliveEnemies: () => [] },
  { toast() {} },
  damageNumbers,
  null,
  null,
);

describe('治疗飘字（W-D6 切片5）', () => {
  describe('① cssColorOf 与 colorOf 同源', () => {
    it('同一个语义同一个档，串是数的十六进制化', () => {
      for (const mode of COLOR_MODES) {
        expect(cssColorOf('safe', mode)).toBe(`#${semanticColor('safe', mode).toString(16).padStart(6, '0')}`);
      }
    });

    it('认不出的语义一样抛（不许静默给个颜色）', () => {
      expect(() => cssColorOf('nope')).toThrow(/未知的语义色/);
      expect(() => semanticColor('nope')).toThrow(/未知的语义色/);
    });

    it('四个档真的给出四个不同的串（对 safe 而言）', () => {
      const set = new Set(COLOR_MODES.map((m) => cssColorOf('safe', m)));
      expect(set.size).toBe(COLOR_MODES.length);
    });
  });

  describe('② restore 真的回血时弹一枚', () => {
    it('弹一次，文本是回血量，种类是 heal，颜色是 safe', () => {
      const dn = recorder();
      const combat = makeCombat(dn);
      combat.hp = 40;
      combat.restore({ hp: 30 });
      expect(dn.calls).toHaveLength(1);
      expect(dn.calls[0].text).toBe('30');
      expect(dn.calls[0].kind).toBe('heal');
      expect(dn.calls[0].color).toBe(cssColorOf('safe'));
      // 文本真的带上 `+` 前缀（非颜色冗余那一半）
      expect(`${damageKindOf('heal').prefix}${dn.calls[0].text}`).toBe('+30');
    });

    it('弹在玩家身上（不是某个敌人）', () => {
      const dn = recorder();
      const combat = makeCombat(dn);
      combat.hp = 10;
      combat.restore({ hp: 5 });
      expect(dn.calls[0].position).toBe(combat.player.position);
    });
  });

  describe('③ 边界', () => {
    it('满血再吃不弹', () => {
      const dn = recorder();
      const combat = makeCombat(dn);
      combat.hp = combat.maxHp;
      combat.restore({ hp: 50 });
      expect(dn.calls).toHaveLength(0);
    });

    it('只回精力不回血，不弹', () => {
      const dn = recorder();
      const combat = makeCombat(dn);
      combat.hp = 60;
      combat.restore({ stamina: 40 });
      expect(dn.calls).toHaveLength(0);
      expect(combat.stamina).toBe(100);   // 精力照回，只是不说话
    });

    it('超上限的部分不算进飘字', () => {
      const dn = recorder();
      const combat = makeCombat(dn);
      combat.hp = 90;
      combat.restore({ hp: 50 });
      expect(combat.hp).toBe(100);
      expect(dn.calls).toHaveLength(1);
      expect(dn.calls[0].text).toBe('10');   // 不是 50
    });

    it('没有 damageNumbers 也不炸（可选依赖的老规矩）', () => {
      const combat = makeCombat(null);
      combat.hp = 50;
      expect(() => combat.restore({ hp: 10 })).not.toThrow();
    });
  });

  describe('④ restHeal 同理', () => {
    it('不满时弹一个满额差值', () => {
      const dn = recorder();
      const combat = makeCombat(dn);
      combat.hp = 25;
      combat.restHeal();
      expect(dn.calls).toHaveLength(1);
      expect(dn.calls[0].text).toBe('75');
      expect(dn.calls[0].kind).toBe('heal');
    });

    it('满血时不弹', () => {
      const dn = recorder();
      const combat = makeCombat(dn);
      combat.restHeal();
      expect(dn.calls).toHaveLength(0);
    });
  });

  describe('⑤ 换色盲档后治疗色跟着变', () => {
    it('protanopia 下弹出来的颜色不是出厂档那枚', () => {
      const dn = recorder();
      const combat = makeCombat(dn);
      combat.hp = 10;
      setColorVision('protanopia');
      combat.restore({ hp: 10 });
      expect(dn.calls).toHaveLength(1);
      expect(dn.calls[0].color).toBe(cssColorOf('safe', 'protanopia'));
      expect(dn.calls[0].color).not.toBe(cssColorOf('safe', 'default'));
    });

    it('同一局里换档，下一枚就是新色', () => {
      const dn = recorder();
      const combat = makeCombat(dn);
      combat.hp = 10;
      combat.restore({ hp: 5 });
      combat.hp = 10;
      setColorVision('tritanopia');
      combat.restore({ hp: 5 });
      expect(dn.calls.map((c) => c.color)).toEqual([
        cssColorOf('safe', 'default'),
        cssColorOf('safe', 'tritanopia'),
      ]);
    });
  });

  describe('⑥ 调用点唯一', () => {
    it('CombatController 里只有一处 cssColorOf(safe)', () => {
      const src = readFileSync(join(ROOT, 'src', 'combat', 'CombatController.js'), 'utf8');
      const hits = src.match(/cssColorOf\(\s*'safe'\s*\)/g) ?? [];
      expect(hits).toHaveLength(1);
    });

    it('heal 种类终于有调用点了（不再是切片2 留下的死种类）', () => {
      const src = readFileSync(join(ROOT, 'src', 'combat', 'CombatController.js'), 'utf8');
      expect(src).toMatch(/,\s*'heal'\s*\)/);
    });

    it('heal 的种类定义仍然带着 + 前缀（冗余没被顺手删掉）', () => {
      expect(DAMAGE_KINDS.heal.prefix).toBe('+');
      expect(DAMAGE_KINDS.heal.cls).toBeTruthy();
    });
  });

  describe('⑦ 反面证据：数调用点的那把尺子自己要被量过', () => {
    const countOf = (text, needle) => (text.match(needle) ?? []).length;

    it('认得出一处、两处、零处', () => {
      expect(countOf('a(); b();', /a\(\)/g)).toBe(1);
      expect(countOf('a(); a();', /a\(\)/g)).toBe(2);
      expect(countOf('a(); b();', /z\(\)/g)).toBe(0);
    });

    it('容许参数里有空格（否则换个格式就假红）', () => {
      expect(countOf("cssColorOf( 'safe' );", /cssColorOf\(\s*'safe'\s*\)/g)).toBe(1);
    });
  });
});