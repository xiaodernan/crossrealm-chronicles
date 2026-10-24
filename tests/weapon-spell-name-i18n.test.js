/**
 * 武器 / 法术名字族进双表（W-D2 切片35）。
 *
 * ## 这一片解决什么
 *
 * `bossRoster` 立下"数据层同存 `name`（中文原值，登记处）+ `nameKey`（文案键）"的范式之后，
 * 战斗侧还有两族名字是裸中文：
 *
 * - `WeaponSystem.WEAPONS` 两格 `name`（位面长剑 / 奥术法杖）。`weapon_switch` 的 toast
 *   模板过了 `t()`，掺进去的 `name` 是裸中文 ⇒ 英文玩家看到 "Switched weapon: 位面长剑"；
 *   `weapon-changed` 载荷带的也是 `name`，HUD 的武器显示格直接把它写进 DOM；
 * - `SpellSystem.SPELLS` 四格 `name`（真火咒 / 玄冰刺 / 引力坍缩 / 大圣化身）。
 *   `spell-cast` 载荷带 `name`（两个消费者都只读 `charged`，低危）；`castTransform` 的
 *   化身提示整句是裸中文，经 `spell-toast` 直达 toast。
 *
 * 另有两处同族在 HUD 模板里：武器显示格的出厂文案 `⚔ 位面长剑`、法术快捷栏四格的
 * `真火 / 玄冰 / 引力 / 化身` —— 双表里 `hud_weapon_default` 与 `hud_spell_1..4` 五枚键
 * 早就建好却没人引用（死键），本片接上（`hud_weapon_default` 的英文笔误同片修掉）。
 *
 * ## 机制
 *
 * 数据层两格各加 `nameKey`（`name` 留作中文注册值，门禁钉住）；载荷改带键不带字，
 * 显示侧 `t()` 现展开。HUD 的武器格因此多一条重算路径：`refreshLabels()`（换语言那条路
 * `applyToGame → hud.refreshKeyHints` 本来就会调到它）按 `game.weapons` 现算一次 ——
 * `applyTranslations` 只会把它涂回默认武器。顺带把读档路径从"直接写 current"换成
 * `setCurrent()`，HUD 那一格才跟着存档改口（改前读档后它留着旧武器的名字）。
 *
 * ## 用例分七层
 * ① 钉文案腿：7 个新键 + 5 个接线既有键的中英原值逐字钉死；
 * ② 键登记腿：十二个键两表都在场，键数 2297 → 2304 → 2307 → 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415，新键文案不超两键、不孤儿；
 * ③ 数据腿：两张私有表每格都有 nameKey 且指向新键，name 中文注册值原样保留；
 * ④ 武器行为腿：真构造 WeaponSystem，toast 与事件载荷都是展开句 / 键（中英两语）；
 * ⑤ 法术行为腿：真构造 SpellSystem，spell-cast 载荷带键、化身 toast 是展开句；
 * ⑥ HUD 腿：模板接线 + 事件驱动 + 换语言重算（中英两语），旧形状载荷再也动不了那一格；
 * ⑦ 静态腿与反面证据：两个战斗文件的中文字面量只剩注册值、事件登记处同步、尺子自证。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { WeaponSystem } from '../src/combat/WeaponSystem.js';
import { SpellSystem } from '../src/combat/SpellSystem.js';
import { HUD } from '../src/ui/HUD.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { setLanguage, applyTranslations } from '../src/engine/i18n.js';
import { makeMarkupDom, node } from './helpers/fakeMarkupDom.js';
import { offAll } from '../src/engine/EventBus.js';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');

/** 7 个新键：键 → [中文原值, 英文原值] */
const NEW_KEYS = {
  weapon_name_sword: ['位面长剑', 'Plane Longsword'],
  weapon_name_staff: ['奥术法杖', 'Arcane Staff'],
  spell_name_fire: ['真火咒', 'True Flame'],
  spell_name_ice: ['玄冰刺', 'Frost Spike'],
  spell_name_gravity: ['引力坍缩', 'Gravity Collapse'],
  spell_name_transform: ['大圣化身', 'Great Sage Avatar'],
  spell_transform_toast: ['${name} — 伤害与移速大幅提升', '${name} — greatly increased damage and move speed'],
};

/** 本片接线的 5 个既有键（建了没人引用的死键；英文笔误同片修掉） */
const WIRED = {
  hud_weapon_default: ['⚔ 位面长剑', '⚔ Plane Longsword'],
  hud_spell_1: ['真火', 'True Fire'],
  hud_spell_2: ['玄冰', 'Xuan Ice'],
  hud_spell_3: ['引力', 'Gravity'],
  hud_spell_4: ['化身', 'Avatar'],
};

/** 极简词法扫描：只取字符串/模板字面量的区间（标识符里的中文是仓库惯例，不当文案） */
function 字符串字面量(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const nx = src[i + 1];
    if (c === '/' && nx === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && nx === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1; i += 2; continue; }
    if (c === "'" || c === '"') {
      const q = c; const start = i; i += 1;
      while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i += 1; break; } if (src[i] === '\n') break; i += 1; }
      out.push({ start, end: i, tpl: false }); continue;
    }
    if (c === '`') {
      const start = i; i += 1;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') { i += 1; break; }
        if (src[i] === '$' && src[i + 1] === '{') { i += 2; continue; }
        i += 1;
      }
      out.push({ start, end: i, tpl: true }); continue;
    }
    i += 1;
  }
  return out;
}

/** 模板串里 ${...} 是插值（标识符 / 表达式），不是文案 —— 剔掉再判中文 */
const 文案部分 = (src, s) => (s.tpl ? src.slice(s.start, s.end).replace(/\$\{[^}]*\}/g, '') : src.slice(s.start, s.end));

const 中文字面量 = (src) => 字符串字面量(src)
  .map((s) => 文案部分(src, s))
  .filter((text) => /[\u4e00-\u9fff]/.test(text));

/** 收一条 window 事件；返回 [读数, 收尾函数] */
const 收事件 = (name) => {
  const seen = [];
  const fn = (e) => seen.push(e.detail);
  window.addEventListener(name, fn);
  return [seen, () => window.removeEventListener(name, fn)];
};

/* ------------------------------------------------------------------ *
 * ① 钉文案腿
 * ------------------------------------------------------------------ */

describe('① 钉文案腿：7 个新键 + 5 个接线既有键的中英原值逐字钉死', () => {
  it('七个新键的中英原值一个字都没变', () => {
    for (const [key, [zh, en]] of Object.entries(NEW_KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('五个接线既有键的原值钉住（hud_weapon_default 的英文笔误已修）', () => {
    for (const [key, [zh, en]] of Object.entries(WIRED)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('新键的占位符与 zh/en 一致（只有化身 toast 带 ${name}）', () => {
    expect(STRINGS_ZH.spell_transform_toast).toContain('${name}');
    expect(STRINGS_EN.spell_transform_toast).toContain('${name}');
    for (const key of Object.keys(NEW_KEYS)) {
      if (key === 'spell_transform_toast') continue;
      expect(STRINGS_ZH[key], `${key} 不该有占位符`).not.toContain('${');
      expect(STRINGS_EN[key], `${key} 不该有占位符`).not.toContain('${');
    }
  });
});

/* ------------------------------------------------------------------ *
 * ② 键登记腿
 * ------------------------------------------------------------------ */

describe('② 键登记：十二个键两表都在场，键数 2297 → 2304 → 2307 → 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415', () => {
  it('七个新键中英两表一个不缺', () => {
    const zh = new Set(ZH_KEYS);
    const en = new Set(EN_KEYS);
    for (const key of Object.keys(NEW_KEYS)) {
      expect(zh.has(key), `中文表缺 ${key}`).toBe(true);
      expect(en.has(key), `英文表缺 ${key}`).toBe(true);
    }
  });

  it('键数 2297 → 2304 → 2307 → 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415，两表逐键对齐', () => {
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
    expect(ZH_KEYS.length, '键数不是 2415 —— 双表被别处改过').toBe(2415);
  });

  it('新键不孤儿：每个新键都在 src 里被引用（死键计数只减不增）', () => {
    const 源 = [
      读('src/combat/WeaponSystem.js'),
      读('src/combat/SpellSystem.js'),
      读('src/ui/HUD.js'),
      读('src/engine/events.js'),
    ];
    for (const key of [...Object.keys(NEW_KEYS), ...Object.keys(WIRED)]) {
      expect(源.some((s) => s.includes(key)), `${key} 建了却没人引用（死键）`).toBe(true);
    }
  });

  it('新键与接线键的文案在两表里都最多两个键（同文案写三遍就是命名族失控）', () => {
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of [...Object.keys(NEW_KEYS), ...Object.keys(WIRED)]) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * ③ 数据腿
 * ------------------------------------------------------------------ */

describe('③ 数据腿：两张私有表每格都有文案键', () => {
  const WS = 读('src/combat/WeaponSystem.js');
  const SS = 读('src/combat/SpellSystem.js');

  it('WEAPONS 两格：nameKey 与中文注册值 name 同在', () => {
    expect(WS).toMatch(/sword: \{\s*id: 'sword',\s*name: '位面长剑',\s*nameKey: 'weapon_name_sword',/);
    expect(WS).toMatch(/staff: \{\s*id: 'staff',\s*name: '奥术法杖',\s*nameKey: 'weapon_name_staff',/);
  });

  it('SPELLS 四格：nameKey 与中文注册值 name 同在', () => {
    expect(SS).toMatch(/1: \{ id: 'fire', nameKey: 'spell_name_fire', name: '真火咒'/);
    expect(SS).toMatch(/2: \{ id: 'ice', nameKey: 'spell_name_ice', name: '玄冰刺'/);
    expect(SS).toMatch(/3: \{ id: 'gravity', nameKey: 'spell_name_gravity', name: '引力坍缩'/);
    expect(SS).toMatch(/4: \{ id: 'transform', nameKey: 'spell_name_transform', name: '大圣化身'/);
  });

  it('weapon_switch 的 toast 把 t(nameKey) 递进模板，而不是裸 name', () => {
    expect(WS).toContain("t('weapon_switch', { name: t(this.weapon.nameKey) })");
    expect(WS).not.toContain("t('weapon_switch', { name: this.weapon.name })");
  });
});

/* ------------------------------------------------------------------ *
 * ④ 武器行为腿
 * ------------------------------------------------------------------ */

describe('④ 武器行为腿：真构造 WeaponSystem', () => {
  const mkWeapons = () => {
    const toasts = [];
    const player = {
      mesh: { getObjectByName: () => null },
      characterModel: { boneOf: () => null, modelRoot: new THREE.Group() },
      modelReady: Promise.resolve(),
    };
    const ws = new WeaponSystem(player, { toast: (m) => toasts.push(m) }, { weaponSwitch() {} });
    return { ws, toasts };
  };

  it('中文：切换武器的 toast 是展开句，载荷带键不带字', async () => {
    setLanguage('zh');
    const { ws, toasts } = mkWeapons();
    const [seen, 收尾] = 收事件('weapon-changed');
    ws.toggle();
    expect(toasts).toEqual(['切换武器：奥术法杖']);
    expect(seen).toEqual([{ weapon: 'staff', nameKey: 'weapon_name_staff' }]);
    expect(seen[0]).not.toHaveProperty('name');
    收尾();
    await ws.mountReady;
    ws.dispose();
  });

  it('英文：toast 与载荷都不夹中文', async () => {
    setLanguage('en');
    const { ws, toasts } = mkWeapons();
    const [seen, 收尾] = 收事件('weapon-changed');
    ws.toggle();
    expect(toasts).toEqual(['Switched weapon: Arcane Staff']);
    expect(seen).toEqual([{ weapon: 'staff', nameKey: 'weapon_name_staff' }]);
    for (const text of [...toasts, seen[0].nameKey]) {
      expect(text).not.toMatch(/[\u4e00-\u9fff]/);
    }
    收尾();
    await ws.mountReady;
    ws.dispose();
    setLanguage('zh');
  });

  it('setCurrent：读档落位不弹 toast，但派发事件；表外 id 不动', async () => {
    setLanguage('zh');
    const { ws, toasts } = mkWeapons();
    const [seen, 收尾] = 收事件('weapon-changed');
    ws.setCurrent('staff');
    expect(toasts, '读档不该播「切换武器」').toEqual([]);
    expect(seen).toEqual([{ weapon: 'staff', nameKey: 'weapon_name_staff' }]);
    ws.setCurrent('bogus');
    expect(seen, '表外 id 不该派发').toHaveLength(1);
    expect(ws.current).toBe('staff');
    ws.setCurrent('staff');
    expect(seen, '同一把武器重复落位不该派发').toHaveLength(1);
    收尾();
    await ws.mountReady;
    ws.dispose();
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ 法术行为腿
 * ------------------------------------------------------------------ */

describe('⑤ 法术行为腿：真构造 SpellSystem', () => {
  const mkSpells = () => {
    const player = {
      combat: { isBusy: () => false },
      getCombatForwardXZ: () => new THREE.Vector3(0, 0, 1),
      position: new THREE.Vector3(0, 0, 0),
    };
    const manager = { getAliveEnemies: () => [] };
    return new SpellSystem(new THREE.Group(), player, manager, null, null, { spellCast() {} }, null);
  };

  it('spell-cast 载荷带 nameKey，不再带裸中文 name', () => {
    setLanguage('zh');
    const spells = mkSpells();
    const [seen, 收尾] = 收事件('spell-cast');
    expect(spells.cast(1)).toBe(true);
    expect(seen).toEqual([{ id: 'fire', nameKey: 'spell_name_fire', charged: false }]);
    expect(seen[0]).not.toHaveProperty('name');
    收尾();
    spells.dispose();
  });

  it('化身 toast：整句走双表，名字由插值填入（中英两语）', () => {
    const 期望 = {
      zh: '大圣化身 — 伤害与移速大幅提升',
      en: 'Great Sage Avatar — greatly increased damage and move speed',
    };
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      const spells = mkSpells();
      const [seen, 收尾] = 收事件('spell-toast');
      spells.cast(4);
      expect(seen, `${lang}: 化身 toast`).toEqual([{ message: 期望[lang] }]);
      expect(seen[0].message).not.toContain('[MISSING:');
      收尾();
      spells.dispose();
    }
    setLanguage('zh');
  });
});

/* ------------------------------------------------------------------ *
 * ⑥ HUD 腿
 * ------------------------------------------------------------------ */

describe('⑥ HUD 腿：模板接线、事件驱动与换语言重算', () => {
  const HUD源码 = 读('src/ui/HUD.js');

  function fakeStorage() {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(k, String(v)); },
      removeItem: (k) => { map.delete(k); },
    };
  }

  function bootDoc() {
    const doc = makeMarkupDom();
    const html = node('html', doc);
    html.style.setProperty = (name, value) => { html.style[name] = value; };
    html.appendChild(doc.body);
    doc.documentElement = html;
    for (const id of ['hud', 'minimap-wrap', 'minimap', 'zone-panel', 'zone-banner', 'journal-panel', 'pause-journal']) {
      const el = node(id === 'minimap' ? 'canvas' : 'div', doc);
      el.id = id;
      doc.body.appendChild(el);
      doc.hosts[id] = el;
    }
    doc.getElementById = (id) => doc.hosts[id] ?? doc.body.querySelectorAll(`#${id}`)[0] ?? null;
    doc.querySelectorAll = (sel) => doc.body.querySelectorAll(sel);
    doc.querySelector = (sel) => doc.body.querySelector(sel);
    return doc;
  }

  /** 与生产同序：HUD 先建（ weapons 尚未出生），SettingsManager.applyToGame 后落地 */
  const bootGame = () => ({
    inputDevice: { current: () => null },
    dialog: { toast: () => {} },
    quests: {
      notifyUpdate() {
        window.dispatchEvent(new CustomEvent('quest-updated', {
          detail: { chapter: 2, current: { title: 'obj_anchor_title', progress: '0/1' } },
        }));
      },
      getProgressText: () => '0/1',
    },
    weapons: { current: 'staff', weapon: { nameKey: 'weapon_name_staff' } },
  });

  beforeAll(() => {
    globalThis.localStorage = fakeStorage();
    setLanguage('zh');
  });

  afterAll(() => {
    offAll('ui/HUD');
    delete globalThis.document;
    delete globalThis.localStorage;
    setLanguage('zh');
  });

  it('结构腿：武器格与四格法术名都挂 data-i18n，载荷处理器走 _renderWeaponDisplay', () => {
    expect(HUD源码).toContain('id="weapon-display" data-i18n="hud_weapon_default"');
    for (const n of [1, 2, 3, 4]) {
      expect(HUD源码, `第 ${n} 格法术名没挂 data-i18n`).toContain(`<span class="spell-name" data-i18n="hud_spell_${n}">`);
    }
    expect(HUD源码).not.toContain('<span class="spell-name">真火</span>');
    expect(HUD源码).toMatch(/on\('weapon-changed'[\s\S]*?_renderWeaponDisplay\(e\.detail\.weapon, e\.detail\.nameKey\)/);
    expect(HUD源码).toContain('_renderWeaponDisplay(weapon, nameKey) {');
    // 换语言重算的那一行在 refreshLabels 里（applyTranslations 之后由 refreshKeyHints 调到）
    const body = /refreshLabels\(\) \{([\s\S]*?)\n {2}\}/.exec(HUD源码)?.[1] ?? '';
    expect(body, 'refreshLabels 里没有武器格重算').toContain('_renderWeaponDisplay(w.current, w.weapon.nameKey)');
  });

  it('行为腿：中文开机，武器格与四格法术名都是原值', () => {
    setLanguage('zh');
    const doc = bootDoc();
    globalThis.document = doc;
    const hud = new HUD(bootGame());
    applyTranslations(doc);
    expect(doc.getElementById('weapon-display').textContent).toBe('⚔ 位面长剑');
    expect(doc.querySelectorAll('.spell-name').map((el) => el.textContent)).toEqual(['真火', '玄冰', '引力', '化身']);
    hud.dispose?.();
  });

  it('事件腿：载荷带键就按当前语言展开；旧形状（裸 name）再也动不了那一格', () => {
    setLanguage('en');
    const doc = bootDoc();
    globalThis.document = doc;
    const hud = new HUD(bootGame());
    applyTranslations(doc);
    window.dispatchEvent(new CustomEvent('weapon-changed', {
      detail: { weapon: 'staff', nameKey: 'weapon_name_staff' },
    }));
    expect(doc.getElementById('weapon-display').textContent).toBe('✦ Arcane Staff');
    // 反向控制：迁移前的载荷形状（name 裸中文）必须不再改动这一格
    window.dispatchEvent(new CustomEvent('weapon-changed', {
      detail: { weapon: 'sword', name: '位面长剑' },
    }));
    expect(doc.getElementById('weapon-display').textContent).toBe('✦ Arcane Staff');
    hud.dispose?.();
    setLanguage('zh');
  });

  it('换语言腿：applyTranslations 之后，武器格按当前武器重算（不是默认武器）', () => {
    setLanguage('zh');
    const doc = bootDoc();
    globalThis.document = doc;
    const hud = new HUD(bootGame());
    applyTranslations(doc);
    expect(doc.getElementById('weapon-display').textContent).toBe('⚔ 位面长剑');
    // 换语言：SettingsManager.applyToGame 的那三步（setLanguage + applyTranslations + hud 刷新）
    setLanguage('en');
    applyTranslations(doc);
    hud.refreshKeyHints();
    expect(doc.getElementById('weapon-display').textContent, '换语言后武器格被涂回默认武器').toBe('✦ Arcane Staff');
    expect(doc.querySelectorAll('.spell-name').map((el) => el.textContent)).toEqual(['True Fire', 'Xuan Ice', 'Gravity', 'Avatar']);
    hud.dispose?.();
    setLanguage('zh');
  });
});

/* ------------------------------------------------------------------ *
 * ⑦ 静态腿与反面证据
 * ------------------------------------------------------------------ */

describe('⑦ 静态腿与反面证据', () => {
  it('两个战斗文件的中文字面量只剩注册值（name 原值，逐个点名）', () => {
    expect(中文字面量(读('src/combat/WeaponSystem.js')).sort())
      .toEqual(["'位面长剑'", "'奥术法杖'"]);
    expect(中文字面量(读('src/combat/SpellSystem.js')).sort())
      .toEqual(["'大圣化身'", "'引力坍缩'", "'玄冰刺'", "'真火咒'"]);
  });

  it('尺子自证：喂一段假源码 —— 认字符串、剔注释、剔插值、不认标识符', () => {
    const 假源码 = [
      "const a = '真火咒';",
      '// 行注释里的玄冰刺不算',
      '/* 块注释里的引力坍缩也不算 */',
      'const b = `模板 ${x} 结尾`;',
      'const 标识符中文 = 1;',
    ].join('\n');
    expect(中文字面量(假源码)).toEqual(["'真火咒'", '`模板  结尾`']);
  });

  it('事件登记处同步：两个载荷都从 name 改成 nameKey', () => {
    const ev = 读('src/engine/events.js');
    expect(ev).toContain("payload: '{ id, nameKey, charged }',");
    expect(ev).toContain("payload: '{ weapon, nameKey }',");
    expect(ev).not.toContain("payload: '{ id, name, charged }',");
    expect(ev).not.toContain("payload: '{ weapon, name }',");
    // 分母守卫：登记表里确实有一大批 payload 行（防"一条都没扫到"）
    expect(ev.match(/payload: '/g).length, '一条 payload 都没扫到，扫描坏了').toBeGreaterThan(20);
  });

  it('读档走 setCurrent：HUD 的武器格跟着存档改口', () => {
    const save = 读('src/game/SaveSystem.js');
    expect(save).toContain('game.weapons.setCurrent(data.weapon)');
    expect(save, '又回到直接写 current 了 —— 那一格不会再收到 weapon-changed').not.toContain('game.weapons.current = data.weapon;');
  });
});