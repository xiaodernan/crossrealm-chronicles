/**
 * 色盲模式的门禁（W-D6 切片3）。
 *
 * ## 这一片解决什么
 * W-D6 切片1 立了 `content/semanticColors.js`：键是语义、值是"某档下用什么颜色"，
 * 还带 `glyph` / `label` 两样非颜色冗余。但那一张表**没有消费者** ——
 * 设置项里没有任何可访问性开关，玩家切不了档，切了也没有任何东西会变。
 * 切片3 把它接上：设置项 → 运行时当前档 → 掉落层的档位色。
 *
 * ## 用例分七层
 * ① **名册与回落**：四档齐、每档有给人看的名字、`normalizeColorVision` 对脏值回落出厂不抛；
 * ② **出厂档零变更**：默认档下四档稀有度的色值与**迁移前的冻结值**逐格相同
 *     （"接上色盲模式"与"没接"逐字节相同，这条不靠记忆）；
 * ③ **运行时所有者**：`setColorVision` / `getColorVisionMode` / `resetColorVision` 的形状，
 *     以及"代码里写死的语义名当场抛"与"存储脏档回落"两条路分开；
 * ④ **消费者真的按档取色**：`rarityTint` 在四个档下给出四枚不同的色值，
 *     且每一枚都等于 `semanticColor(语义键, 该档)`（不是另抄的一份）；
 * ⑤ **LootSystem 真的在读当前档**：同一个稀有度在四个档下掉出四枚环色，
 *     且**换档会重涂场上已有的掉落**（半生效比不生效更难查）；
 * ⑥ **设置接线**：`DEFAULTS` 有那一格、`applyToGame` 推进运行时、脏档不抛、
 *     假 DOM 真点面板、写入口全仓只有 `SettingsManager.applyToGame` 一处、
 *     壳页那格 select 与两张 strings 表的键都在场；
 * ⑦ **反面证据**：尺子自己要被量过（"回落"与"不回落"各喂一个，喂坏的那个要报）。
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLOR_MODES, COLOR_VISION_LABELS, DEFAULT_COLOR_MODE, SEMANTIC_IDS,
  normalizeColorVision, semanticColor,
} from '../src/content/semanticColors.js';
import {
  colorOf, colorVisionOptions, getColorVisionMode, rarityTint, resetColorVision, setColorVision,
} from '../src/game/ColorVision.js';
import { GEAR_RARITY, GEAR_RARITY_DISPLAY, gearRarityDisplay } from '../src/content/gear.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import { SettingsPanel } from '../src/ui/SettingsPanel.js';
import { LootSystem } from '../src/game/LootSystem.js';

const ROOT = process.cwd();

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

afterEach(() => { resetColorVision(); });

/** 迁移前在役的四个稀有度色值（冻结读数，不是从当前代码里读出来的） */
const FROZEN_BEFORE = { common: 0xbfc7d1, uncommon: 0x63d97a, rare: 0x4ea8ff, epic: 0xc77bff };

const 假场景 = () => ({ add() {}, remove() {} });
const mkLoot = () => new LootSystem(假场景(), { addSouls() {} }, null, { rng: () => 0 });

/* ------------------------------------------------------------------ *
 * ① 名册与回落
 * ------------------------------------------------------------------ */

describe('① 名册：四档、每档有给人看的名字、脏值回落出厂', () => {
  it('四档齐，且 default 是第一个（出厂档排在最前面，面板第一项就是它）', () => {
    expect(COLOR_MODES).toEqual(['default', 'deuteranopia', 'protanopia', 'tritanopia']);
    expect(DEFAULT_COLOR_MODE).toBe('default');
    expect(COLOR_MODES[0]).toBe(DEFAULT_COLOR_MODE);
  });

  it('每一档都有一个非空的、不等于 id 的人话名', () => {
    for (const id of COLOR_MODES) {
      const label = COLOR_VISION_LABELS[id];
      expect(label, `${id} 没有名字 —— 面板上是一格空白`).toBeTruthy();
      expect(label.trim()).not.toBe('');
      expect(label).not.toBe(id);
    }
    // 反向：名册里没有多余的档（多一个就是永远选不到的假选项）
    expect(Object.keys(COLOR_VISION_LABELS).sort()).toEqual([...COLOR_MODES].sort());
  });

  it('normalizeColorVision：认得的原样返回，认不出的回落出厂（不抛）', () => {
    for (const id of COLOR_MODES) expect(normalizeColorVision(id)).toBe(id);
    for (const bad of ['monochrome', '', null, undefined, 3, 'DEFAULT', 'Default']) {
      expect(normalizeColorVision(bad), `脏值 ${JSON.stringify(bad)} 该回落出厂`).toBe(DEFAULT_COLOR_MODE);
    }
  });
});

/* ------------------------------------------------------------------ *
 * ② 出厂档零变更
 * ------------------------------------------------------------------ */

describe('② 出厂档零变更：默认档与迁移前逐格相同', () => {
  it('四档稀有度的默认色值就是迁移前在役的那四枚', () => {
    for (const [rarity, want] of Object.entries(FROZEN_BEFORE)) {
      expect(gearRarityDisplay(rarity).tint, `${rarity} 的默认色值变了`).toBe(want);
    }
  });

  it('默认档快照 GEAR_RARITY_DISPLAY 与带档位的入口在 default 下逐格相同', () => {
    for (const r of GEAR_RARITY) {
      expect(gearRarityDisplay(r.id)).toEqual(GEAR_RARITY_DISPLAY[r.id]);
    }
  });

  it('出厂档下 rarityTint 读的就是快照那一枚（没接色盲模式与接了对玩家逐字节相同）', () => {
    for (const r of GEAR_RARITY) expect(rarityTint(r.id)).toBe(GEAR_RARITY_DISPLAY[r.id].tint);
  });
});

/* ------------------------------------------------------------------ *
 * ③ 运行时所有者
 * ------------------------------------------------------------------ */

describe('③ 运行时所有者：模块级当前档，两条路分开', () => {
  it('出厂就是 default，reset 回得来', () => {
    expect(getColorVisionMode()).toBe(DEFAULT_COLOR_MODE);
    expect(setColorVision('tritanopia')).toBe('tritanopia');
    expect(getColorVisionMode()).toBe('tritanopia');
    expect(resetColorVision()).toBe(DEFAULT_COLOR_MODE);
    expect(getColorVisionMode()).toBe(DEFAULT_COLOR_MODE);
  });

  it('换档改变读数的前提是那一档真的与默认档不同色（否则开关空转）', () => {
    setColorVision('deuteranopia');
    for (const id of SEMANTIC_IDS) {
      expect(colorOf(id), `${id}@deuteranopia 与默认档同色 —— 这个档位是空转的`).not.toBe(semanticColor(id, 'default'));
    }
  });

  it('代码里写死的语义名当场抛（静默 undefined 会变成"那东西没颜色"）', () => {
    expect(() => colorOf('hostile')).toThrow(/未知的语义色/);
    expect(() => colorOf('hostile')).toThrow(/danger/);
  });

  it('选项名单从名册现推，且 id 与名字一一对上', () => {
    expect(colorVisionOptions().map((o) => o.id)).toEqual([...COLOR_MODES]);
    expect(colorVisionOptions().map((o) => o.label)).toEqual(COLOR_MODES.map((m) => COLOR_VISION_LABELS[m]));
  });
});

/* ------------------------------------------------------------------ *
 * ④ 消费者按档取色
 * ------------------------------------------------------------------ */

describe('④ rarityTint：四个档四枚色，每一枚都等于色板上那一格', () => {
  it('每个稀有度在四个档下给出四枚互不相同的色值', () => {
    for (const r of GEAR_RARITY) {
      const seen = new Set();
      for (const mode of COLOR_MODES) {
        setColorVision(mode);
        seen.add(rarityTint(r.id));
      }
      expect(seen.size, `${r.id} 在四个档下没有四枚不同的色`).toBe(COLOR_MODES.length);
    }
  });

  it('每一枚都等于 semanticColor(语义键, 该档)（不是另抄的一份表）', () => {
    for (const r of GEAR_RARITY) {
      for (const mode of COLOR_MODES) {
        setColorVision(mode);
        expect(rarityTint(r.id)).toBe(semanticColor(`rarity-${r.id}`, mode));
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ LootSystem 真的在读当前档
 * ------------------------------------------------------------------ */

describe('⑤ LootSystem：环色跟当前档走，换档重涂场上已有的掉落', () => {
  it('同一个稀有度在四个档下掉出四枚不同的环色', () => {
    const loot = mkLoot();
    const seen = new Map();
      for (const mode of COLOR_MODES) {
      setColorVision(mode);
      const d = loot.spawnGear({ x: 0, y: 0, z: 0 }, { base: 'tide-charm', rarity: 'epic', affixes: [] });
      const hex = d.ring.material.color.getHex();
      seen.set(mode, hex);
      expect(hex, `${mode} 档下 epic 的环色不是表上那一枚`).toBe(gearRarityDisplay('epic', mode).tint);
    }
    expect(new Set(seen.values()).size).toBe(COLOR_MODES.length);
  });

  it('换档会重涂场上已有的掉落（新掉落是新色、旧掉落不能还是旧色）', () => {
    const loot = mkLoot();
    const d = loot.spawnGear({ x: 0, y: 0, z: 0 }, { base: 'tide-charm', rarity: 'epic', affixes: [] });
    const 出厂色 = d.ring.material.color.getHex();
    expect(出厂色).toBe(gearRarityDisplay('epic', 'default').tint);

    setColorVision('deuteranopia');
    // 不跑 update：这时候旧的实现（只在 _spawn 里上色）会留着出厂色
    loot.update(1 / 60, { x: 999, y: 0, z: 999 });
    expect(d.ring.material.color.getHex(), '换档后场上掉落没有重涂').toBe(gearRarityDisplay('epic', 'deuteranopia').tint);
    // 三件套一起走：本体、环、光柱，漏一件就是"一半变了另一半没变"
    expect(d.mesh.material.color.getHex()).toBe(gearRarityDisplay('epic', 'deuteranopia').tint);
    expect(d.beam.material.color.getHex()).toBe(gearRarityDisplay('epic', 'deuteranopia').tint);
    // 魂的掉落也跟着换（它不是档位色，但重涂路径是同一条）
    const 魂 = loot._spawn({ x: 1, y: 0, z: 1 }, { souls: 1, gear: null });
    expect(魂.ring.material.color.getHex()).toBe(0x44ddff);
    loot.update(1 / 60, { x: 999, y: 0, z: 999 });
    expect(魂.ring.material.color.getHex(), '魂的环被档位色污染了').toBe(0x44ddff);
  });

  it('同档位不重涂（每帧白刷四份 setHex 也是浪费，但更重要的是别把别人刚改的颜色刷回去）', () => {
    const loot = mkLoot();
    const d = loot.spawnGear({ x: 0, y: 0, z: 0 }, { base: 'tide-charm', rarity: 'epic', affixes: [] });
    let 上色次数 = 0;
    const 原 = d.mesh.material.color.setHex.bind(d.mesh.material.color);
    d.mesh.material.color.setHex = (v) => { 上色次数 += 1; return 原(v); };
    for (let i = 0; i < 10; i++) loot.update(1 / 60, { x: 999, y: 0, z: 999 });
    expect(上色次数, '同一档位下每帧都在重涂').toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * ⑥ 设置接线
 * ------------------------------------------------------------------ */

describe('⑥ 设置接线：面板从名册现推、写入口只有 applyToGame 一处（W-D6 切片3）', () => {
  const 假设置 = (colorVision = DEFAULT_COLOR_MODE) => {
    const mgr = new SettingsManager();
    mgr.data = { ...mgr.data, colorVision };
    mgr.save = () => {};
    return mgr;
  };
  const 假game = () => ({ audio: null, renderer: null, composer: null });

  it('DEFAULTS 里有 colorVision 一格，出厂就是 default', () => {
    const mgr = new SettingsManager();
    expect(mgr.defaults.colorVision, 'DEFAULTS 里没有 colorVision 一格 —— 读档永远拿不到它')
      .toBe(DEFAULT_COLOR_MODE);
    expect(mgr.get('colorVision')).toBe(DEFAULT_COLOR_MODE);
  });

  it('applyToGame 把存档里的档位推进运行时（写入口只有这一处）', () => {
    假设置('protanopia').applyToGame(假game());
    expect(getColorVisionMode()).toBe('protanopia');
    expect(colorOf('danger')).toBe(semanticColor('danger', 'protanopia'));
  });

  it('存储里的脏档回落出厂，不抛（一行手改的 localStorage 不该炸开机）', () => {
    expect(() => 假设置('monochrome').applyToGame(假game())).not.toThrow();
    expect(getColorVisionMode()).toBe(DEFAULT_COLOR_MODE);
  });

  it('面板：选项从 colorVisionOptions() 现推，change 走 set + applyToGame（假 DOM 真点）', () => {
    const ORIGINAL_DOC = globalThis.document;
    const opts = [];
    const sel = {
      value: DEFAULT_COLOR_MODE,
      listeners: {},
      appendChild: (o) => opts.push(o),
      addEventListener: (type, fn) => { (sel.listeners[type] ??= []).push(fn); },
      dispatchEvent: (e) => { sel.listeners[e.type]?.forEach((fn) => fn({ target: sel })); return true; },
    };
    globalThis.document = {
      getElementById: (id) => (id === 'set-colorvision' ? sel : null),
      createElement: () => ({}),
    };
    try {
      const settings = 假设置();
      const game = { settings };
      new SettingsPanel(game);
      expect(opts.map((o) => o.value), '选项不是从名册现推的 —— 面板抄了第二份名单')
        .toEqual([...COLOR_MODES]);
      expect(opts.map((o) => o.textContent))
        .toEqual(COLOR_MODES.map((m) => COLOR_VISION_LABELS[m]));
      expect(sel.value, '面板没回显当前档').toBe(DEFAULT_COLOR_MODE);
      sel.value = 'tritanopia';
      sel.dispatchEvent({ type: 'change' });
      expect(settings.get('colorVision'), 'change 没有写进设置').toBe('tritanopia');
      expect(getColorVisionMode(), 'change 没有落地到运行时').toBe('tritanopia');
    } finally {
      globalThis.document = ORIGINAL_DOC;
    }
  });

  it('写入口全仓只有 SettingsManager 一处（`setColorVision(` 的调用点计数）', () => {
    const srcDir = join(ROOT, 'src');
    const walk = (dir, out = []) => {
      for (const n of readdirSync(dir)) {
        const full = join(dir, n);
        if (statSync(full).isDirectory()) walk(full, out);
        // 反斜杠归一后再比：Windows 上 join 出来的是 `\`，直接 endsWith('game/…') 一个都排不掉
        else if (n.endsWith('.js') && !full.replace(/\\/g, '/').endsWith('game/ColorVision.js')) out.push(full);
      }
      return out;
    };
    const 调用点 = [];
    for (const file of walk(srcDir)) {
      const text = readFileSync(file, 'utf8');
      for (const line of text.split('\n')) {
        // 左边界防 `resetColorVision(` 的子串误命中；import 行不算调用点
        if (/(?<![A-Za-z])setColorVision\(/.test(line) && !line.includes('import ')) {
          调用点.push(`${file.slice(srcDir.length + 1).replace(/\\/g, '/')}: ${line.trim()}`);
        }
      }
    }
    expect(调用点, 'setColorVision 的调用点不是恰好一处 —— 换档有多条路可走').toHaveLength(1);
    expect(调用点[0]).toContain('core/SettingsManager.js');
  });

  it('壳页与文案：index.html 有那格 select，两张 strings 表都有键', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('id="set-colorvision"');
    expect(html).toContain('data-i18n="settings_colorvision"');
    const zh = readFileSync(join(ROOT, 'src', 'content', 'strings.zh.js'), 'utf8');
    const en = readFileSync(join(ROOT, 'src', 'content', 'strings.en.js'), 'utf8');
    expect(zh).toContain('settings_colorvision:');
    expect(en).toContain('settings_colorvision:');
  });
});

/* ------------------------------------------------------------------ *
 * ⑦ 反面证据
 * ------------------------------------------------------------------ */

describe('⑦ 反面证据：尺子自己要被量过', () => {
  it('"这一档与默认档同色"这句话能被人造坏表复现（②③ 两条不是永真）', () => {
    const 同色档 = (t) => COLOR_MODES.filter((m) => m !== 'default' && t[m] === t.default);
    expect(同色档({ default: 1, deuteranopia: 1, protanopia: 2, tritanopia: 3 })).toEqual(['deuteranopia']);
    expect(同色档({ default: 1, deuteranopia: 2, protanopia: 3, tritanopia: 4 })).toEqual([]);
  });

  it('回落叶子认得出"合法档位"与"脏值"的差别（喂一个真的脏值）', () => {
    expect(normalizeColorVision('deuteranopia')).toBe('deuteranopia');
    expect(normalizeColorVision('DEUTERANOPIA')).toBe(DEFAULT_COLOR_MODE);
  });
});



