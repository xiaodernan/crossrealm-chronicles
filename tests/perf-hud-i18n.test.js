/**
 * 性能 HUD 与泄漏 watchdog 标签进双表（W-D2 切片42）。
 *
 * ## 这一片解决什么
 *
 * `engine/PerfHUD.js`（F3 调试面板）的 `_lines()` 内建行与 `game/perfGauges.js` 的
 * 九条 gauge 全是中文 label — 英文开发者/玩家按出性能面板看到一排中文。
 *
 * ## 机制（与 PARTS.head.label 同款，但多一层约束）
 *
 * `label` **同时是 `stats().leaks` 的键**（`perf-gauges.test.js` 钉死的正是这些键），
 * 所以 label 不能改成键名 — 那等于改门禁的账本。做法：label 原样保留中文，
 * 新增可选 `key` 字段；显示层 `_render()` 改 `r.key ? t(r.key) : r.label`
 * （**无 key 时原样回落 label，不过 t()** —— 否则任意 `gauge('a', ...)` 都会渲染出
 * `[MISSING: a]`，这一臂在开发期真的红过）。`stats().leaks` 的键一字未动。
 *
 * ## 用例分六层
 * ① 钉文案腿：17 个新键的中英原值逐字钉死；
 * ② 键登记腿：键数 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414，两表对齐，同文不建第二键，新键不孤儿；
 * ③ 静态腿：PerfHUD.js 八个中文行与 perfGauges.js 九条 gauge 的 label/key 同行配对、
 *    `stats().leaks` 仍用 label、`_render()` 的回落锚点；
 * ④ 行为腿（zh）：两条链路渲染中文行名，leaks 键仍是中文；
 * ⑤ 行为腿（en）：同两条链路英文播出，leaks 键仍中文；
 * ⑥ 反面证据：尺子自证 + 无 key 回落 label（不出 [MISSING:]）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PerfHUD } from '../src/engine/PerfHUD.js';
import { PERF_GAUGES, registerPerfGauges } from '../src/game/perfGauges.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { setLanguage } from '../src/engine/i18n.js';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');

/** 17 个新键：键 → [中文原值, 英文原值] */
const NEW_KEYS = {
  perf_hud_frame_ms: ['帧耗时', 'Frame time'],
  perf_hud_peak_frame: ['峰值帧', 'Peak frame'],
  perf_hud_triangles: ['三角面', 'Triangles'],
  perf_hud_geometries: ['几何体', 'Geometries'],
  perf_hud_textures: ['纹理', 'Textures'],
  perf_hud_shaders: ['着色器', 'Shaders'],
  perf_hud_scene_nodes: ['场景节点', 'Scene nodes'],
  perf_hud_js_heap: ['JS 堆', 'JS heap'],
  gauge_alive_enemies: ['存活敌人', 'Alive enemies'],
  gauge_enemy_projectiles: ['敌方弹体', 'Enemy projectiles'],
  gauge_spell_effects: ['法术效果', 'Spell effects'],
  gauge_ground_hazards: ['地面危险区', 'Ground hazards'],
  gauge_damage_numbers: ['飘字', 'Damage numbers'],
  gauge_sparks: ['火花', 'Sparks'],
  gauge_loot_drops: ['掉落物', 'Loot drops'],
  gauge_loot_pool: ['掉落池', 'Loot pool'],
  gauge_void_echo_pool: ['残影池', 'Echo pool'],
};

/** PerfHUD._lines() 内建行：label（leaks 键，不许改）→ key（显示层文案键） */
const BUILTIN = {
  帧耗时: 'perf_hud_frame_ms',
  峰值帧: 'perf_hud_peak_frame',
  三角面: 'perf_hud_triangles',
  几何体: 'perf_hud_geometries',
  纹理: 'perf_hud_textures',
  着色器: 'perf_hud_shaders',
  场景节点: 'perf_hud_scene_nodes',
  'JS 堆': 'perf_hud_js_heap',
};

/** perfGauges 清单：label（leaks 键，不许改）→ key */
const GAUGES = {
  存活敌人: 'gauge_alive_enemies',
  敌方弹体: 'gauge_enemy_projectiles',
  法术效果: 'gauge_spell_effects',
  地面危险区: 'gauge_ground_hazards',
  飘字: 'gauge_damage_numbers',
  火花: 'gauge_sparks',
  掉落物: 'gauge_loot_drops',
  掉落池: 'gauge_loot_pool',
  残影池: 'gauge_void_echo_pool',
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

const 文案部分 = (src, s) => (s.tpl ? src.slice(s.start, s.end).replace(/\$\{[^}]*\}/g, '') : src.slice(s.start, s.end));

const 中文字面量 = (src) => 字符串字面量(src)
  .map((s) => 文案部分(src, s))
  .filter((text) => /[\u4e00-\u9fff]/.test(text));

/* ------------------------------------------------------------------
 * 夹具
 * ------------------------------------------------------------------ */

beforeEach(() => {
  setLanguage('zh');
});

/** 只给清单真正读到的那些字段（与 tests/perf-gauges.test.js 同款） */
function fakeGame(n = {}) {
  return {
    enemyManager: {
      getAliveEnemies: () => Array.from({ length: n.enemies ?? 0 }),
      hazards: { count: () => n.hazards ?? 0 },
    },
    projectiles: { count: () => n.projectiles ?? 0 },
    spells: { count: () => n.spells ?? 0 },
    damageNumbers: { activeCount: () => n.damageNumbers ?? 0 },
    combatFeedback: { activeCount: () => n.feedback ?? 0 },
    loot: { drops: Array.from({ length: n.loot ?? 0 }), pooled: () => n.lootPool ?? 0 },
    voidEcho: { pooled: () => n.echoPool ?? 0 },
  };
}

/** 一个不碰 DOM 的 HUD：`_render` 只往 `el.innerHTML` 写 */
function fakeHud() {
  const hud = new PerfHUD({ renderer: null, scene: null });
  hud.el = { innerHTML: '' };
  return hud;
}

const build = (game = fakeGame()) => registerPerfGauges(fakeHud(), game);

/** 带 renderer/scene 的 HUD：内建八行走这条 */
function builtinHud() {
  const hud = new PerfHUD({
    renderer: { info: { memory: { geometries: 1, textures: 2 }, render: { calls: 3, triangles: 4000 }, programs: [1] } },
    scene: { traverse(fn) { for (let i = 0; i < 7; i++) fn(); } },
  });
  hud.el = { innerHTML: '' };
  hud._render();
  return hud;
}

/* ------------------------------------------------------------------
 * ① 钉文案腿
 * ------------------------------------------------------------------ */

describe('① 钉文案腿：17 个新键的中英原值', () => {
  it('逐字钉死', () => {
    for (const [k, [zh, en]] of Object.entries(NEW_KEYS)) {
      expect(STRINGS_ZH[k], k + ' 中文').toBe(zh);
      expect(STRINGS_EN[k], k + ' 英文').toBe(en);
    }
  });
});

/* ------------------------------------------------------------------
 * ② 键登记腿
 * ------------------------------------------------------------------ */

describe('② 键登记腿：键数、对齐、同文、不孤儿', () => {
  it('键数 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414，两表对齐', () => {
    expect(ZH_KEYS.length).toBe(2414);
    expect(EN_KEYS.length).toBe(2414);
    expect([...ZH_KEYS].sort()).toEqual([...EN_KEYS].sort());
  });

  it('17 个新键两表都在场', () => {
    for (const k of Object.keys(NEW_KEYS)) {
      expect(ZH_KEYS, k).toContain(k);
      expect(EN_KEYS, k).toContain(k);
    }
  });

  it('同文不建第二键：每个中文原值只做一个键的值（正文里提到同一词是合法的）', () => {
    const zhSrc = 读('src/content/strings.zh.js');
    const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const [k, [zh]] of Object.entries(NEW_KEYS)) {
      const 作为键值 = (zhSrc.match(new RegExp("^  [a-z0-9_]+: '" + esc(zh) + "',$", 'gm')) || []).length;
      expect(作为键值, k + ' 的中文值被第二个键使用').toBe(1);
    }
  });

  it('新键不孤儿：17 键都在两个源文件里被引用', () => {
    const src = 读('src/engine/PerfHUD.js') + '\n' + 读('src/game/perfGauges.js');
    for (const k of Object.keys(NEW_KEYS)) expect(src, k + ' 建了键没人用').toContain(k);
  });
});

/* ------------------------------------------------------------------
 * ③ 静态腿
 * ------------------------------------------------------------------ */

describe('③ 静态腿：label/key 同行配对，leaks 键不动', () => {
  it('PerfHUD.js：八个中文内建行都与自己的 key 写在同一行', () => {
    const src = 读('src/engine/PerfHUD.js');
    for (const [label, key] of Object.entries(BUILTIN)) {
      expect(src, label + ' 与 ' + key + ' 没有同行配对').toContain("label: '" + label + "', key: '" + key + "'");
    }
  });

  it('perfGauges.js：九条 gauge 的 label 与 key 同行配对，label 一个没改', () => {
    const src = 读('src/game/perfGauges.js');
    for (const [label, key] of Object.entries(GAUGES)) {
      expect(src, label + ' 与 ' + key + ' 没有同行配对').toContain("label: '" + label + "', key: '" + key + "'");
    }
    expect(PERF_GAUGES.map((g) => g.label)).toEqual(Object.keys(GAUGES));
  });

  it('PerfHUD.js：stats().leaks 的键仍是 label，_render() 的回落锚点在场', () => {
    const src = 读('src/engine/PerfHUD.js');
    expect(src).toContain('out.leaks[g.label]');
    expect(src).toContain('r.key ? t(r.key) : r.label');
  });
});

/* ------------------------------------------------------------------
 * ④ 行为腿（中文）
 * ------------------------------------------------------------------ */

describe('④ 行为腿（zh）：渲染中文行名，leaks 键仍是中文', () => {
  it('九条 gauge 行渲染中文 label', () => {
    const hud = build(fakeGame({ enemies: 5 }));
    hud._render();
    for (const label of Object.keys(GAUGES)) expect(hud.el.innerHTML).toContain(label + ':');
  });

  it('内建八行渲染中文 label（stub performance.memory 补上 JS 堆行）', () => {
    const orig = globalThis.performance;
    globalThis.performance = { memory: { usedJSHeapSize: 1048576 } };
    try {
      const html = builtinHud().el.innerHTML;
      for (const label of Object.keys(BUILTIN)) expect(html, label + ' 中文行缺失').toContain(label + ':');
      expect(html).toContain('FPS:');
      expect(html).toContain('draw call:');
    } finally {
      globalThis.performance = orig;
    }
  });

  it('leaks 的键仍是中文 label（换语言不换账）', () => {
    const hud = build(fakeGame({ enemies: 5 }));
    const keys = Object.keys(hud.stats().leaks);
    for (const label of Object.keys(GAUGES)) expect(keys, label + ' 不在 leaks 账里').toContain(label);
  });
});

/* ------------------------------------------------------------------
 * ⑤ 行为腿（英文）
 * ------------------------------------------------------------------ */

describe('⑤ 行为腿（en）：渲染英文行名，leaks 键仍中文', () => {
  it('九条 gauge 行渲染英文 label', () => {
    setLanguage('en');
    const hud = build(fakeGame({ enemies: 5 }));
    hud._render();
    for (const [label, key] of Object.entries(GAUGES)) {
      expect(hud.el.innerHTML, label + ' 英文行缺失').toContain(NEW_KEYS[key][1] + ':');
      expect(hud.el.innerHTML).not.toContain(label + ':');
    }
  });

  it('内建八行渲染英文 label', () => {
    setLanguage('en');
    const orig = globalThis.performance;
    globalThis.performance = { memory: { usedJSHeapSize: 1048576 } };
    try {
      const html = builtinHud().el.innerHTML;
      for (const [label, key] of Object.entries(BUILTIN)) {
        expect(html, label + ' 英文行缺失').toContain(NEW_KEYS[key][1] + ':');
        expect(html).not.toContain(label + ':');
      }
    } finally {
      globalThis.performance = orig;
    }
  });

  it('en 下 leaks 的键仍是中文 label', () => {
    setLanguage('en');
    const hud = build(fakeGame({ enemies: 5 }));
    expect(Object.keys(hud.stats().leaks)).toEqual(Object.keys(GAUGES));
  });
});

/* ------------------------------------------------------------------
 * ⑥ 反面证据
 * ------------------------------------------------------------------ */

describe('⑥ 反面证据：尺子自证与无 key 回落', () => {
  it('尺子自证：喂一段假源码 — 认字符串、剔注释、剔插值、不认标识符', () => {
    const 假源码 = [
      "const a = '真火咒';",
      '// 行注释里的玄冰刺不算',
      '/* 块注释里的引力坍缩也不算 */',
      'const b = `模板 ${x} 结尾`;',
      'const 标识符中文 = 1;',
    ].join('\n');
    expect(中文字面量(假源码)).toEqual(["'真火咒'", '`模板  结尾`']);
  });

  it('无 key 的 gauge 原样回落 label，不过 t()（不出 [MISSING:]）', () => {
    const hud = fakeHud();
    hud.gauge('自定义行', () => 7);
    hud._render();
    expect(hud.el.innerHTML).toContain('自定义行: 7');
    expect(hud.el.innerHTML).not.toContain('[MISSING:');
  });

  it('两条链路的行在 zh 下都不夹 [MISSING:]', () => {
    const html = builtinHud().el.innerHTML;
    const html2 = build(fakeGame({ enemies: 5 })).el.innerHTML;
    expect(html).not.toContain('[MISSING:');
    expect(html2).not.toContain('[MISSING:');
  });
});
