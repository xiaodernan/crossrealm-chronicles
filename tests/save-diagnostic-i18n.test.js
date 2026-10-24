/**
 * 存档诊断消息进双表（W-D2 切片38）。
 *
 * ## 这一片解决什么
 *
 * `SaveValidator.validate` 的 23 条 issue 与 `SaveMigrations.migrate` 的 3 条
 * `SaveVersionError` 全是裸中文字面量。切片37 把 `保存被拒绝：${issue}` 与
 * `${key} 读取失败：${reason}` 的模板接好了参数，但插值进来的 issue / reason
 * 本身仍是中文 —— 英文玩家被拒绝存盘时看到的是 "Save rejected: player.yaw 必须
 * 是有限数" 这种中英杂交句。本片把诊断消息本身也送进双表，闭合这个插值口。
 *
 * ## 机制
 *
 * 23 处 `issues.push('…')` 改为 `issues.push(t(键, 参数))`，migrate 的 4 处
 * throw 同样改 `t()`。诊断在播出那一刻取当前语言展开，zh 玩家的可见文案逐字
 * 不变（save-validator.test.js 与 save-migrations.test.js 的中文断言原样通过）。
 *
 * ## 用例分六层
 * ① 钉文案腿：26 个新键的中英原值逐字钉死，fmt 键占位符中英一致；
 * ② 键登记腿：26 键两表都在场，键数 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415，不孤儿、同文案最多两键；
 * ③ 静态腿：SaveValidator.js 与 SaveMigrations.js 的中文字面量清零；
 * ④ 行为腿（zh）：真跑 validate / migrate / save / load 全链路；
 * ⑤ 行为腿（en）：同一条链路英文播出，切片37 留的插值口整句闭合；
 * ⑥ 反面证据：尺子自证 + 插值双腿 + 无参时模板原样返回。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SaveValidator, CURRENT_VERSION } from '../src/game/SaveValidator.js';
import { migrate, MIGRATIONS } from '../src/game/SaveMigrations.js';
import { SaveSystem, slotKey } from '../src/game/SaveSystem.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { setLanguage, t } from '../src/engine/i18n.js';
import v4 from '../tests/save_v4_fixture.json';
import v18 from '../tests/save_v18_fixture.json';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');

/** 26 个新键：键 → [中文原值, 英文原值] */
const NEW_KEYS = {
  save_issue_root_not_object: ['根节点必须是 JSON 对象', 'Root must be a JSON object'],
  save_issue_version_fmt: ['version 必须为 ${version}', 'version must be ${version}'],
  save_issue_missing_player: ['缺少 player 对象', 'Missing player object'],
  save_issue_player_missing_field_fmt: ['player 缺少字段: ${key}', 'player is missing field: ${key}'],
  save_issue_player_not_finite_fmt: ['player.${key} 必须是有限数', 'player.${key} must be a finite number'],
  save_issue_missing_quests: ['缺少 quests 对象', 'Missing quests object'],
  save_issue_quests_missing_index: ['quests 缺少 index', 'quests is missing index'],
  save_issue_quests_missing_stats: ['quests 缺少 stats', 'quests is missing stats'],
  save_issue_quest_stats_not_object: ['quests.stats 必须是对象', 'quests.stats must be an object'],
  save_issue_quest_stats_missing_fmt: ['quests.stats 缺少: ${key}', 'quests.stats is missing: ${key}'],
  save_issue_skills_unlocked_removed: ['quests.stats.skillsUnlocked 已在 v5 移除（派生值）', 'quests.stats.skillsUnlocked was removed in v5 (derived value)'],
  save_issue_quest_stats_missing_kills: ['quests.stats 缺少 kills', 'quests.stats is missing kills'],
  save_issue_kills_not_object: ['quests.stats.kills 必须是对象（非数字/数组）', 'quests.stats.kills must be an object (not a number/array)'],
  save_issue_objective_flags_not_object: ['quests.stats.objectiveFlags 必须是对象（旗标名 → 布尔）', 'quests.stats.objectiveFlags must be an object (flag name → boolean)'],
  save_issue_missing_stats: ['缺少 stats 对象', 'Missing stats object'],
  save_issue_bag_not_array: ['stats.bag 必须是数组', 'stats.bag must be an array'],
  save_issue_missing_rest_points: ['缺少 restPointEnhancer 对象', 'Missing restPointEnhancer object'],
  save_issue_discovered_not_array: ['restPointEnhancer.discovered 必须是数组', 'restPointEnhancer.discovered must be an array'],
  save_issue_discovered_non_string: ['restPointEnhancer.discovered 里出现了非字符串的 id', 'restPointEnhancer.discovered contains a non-string id'],
  save_issue_mana_not_finite: ['spells.mana 必须是有限数', 'spells.mana must be a finite number'],
  save_issue_missing_settings: ['缺少 settings 对象', 'Missing settings object'],
  save_issue_missing_weapon_skills: ['缺少 weaponSkills（双端 parity）', 'Missing weaponSkills (dual-end parity)'],
  save_issue_missing_fast_travel: ['缺少 fastTravel', 'Missing fastTravel'],
  save_migrate_root_not_object: ['存档根节点不是对象', 'Save root is not an object'],
  save_migrate_version_too_new_fmt: ['存档版本 v${from} 高于当前构建支持的 v${supported}', 'Save version v${from} is newer than this build supports (v${supported})'],
  save_migrate_missing_step_fmt: ['缺少 v${from} → v${to} 的迁移', 'Missing migration from v${from} to v${to}'],
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

/* ------------------------------------------------------------------ *
 * 环境桩（与 save-slots.test.js / save-feedback-i18n.test.js 同款）
 * ------------------------------------------------------------------ */

beforeAll(() => {
  const store = new Map();
  globalThis.window = { addEventListener() {}, dispatchEvent() { return true; } };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _store: store,
  };
  globalThis.document = {
    createElement: () => ({ click() {}, set href(v) {}, get href() { return ''; } }),
  };
  class StubURL extends globalThis.URL {
    static createObjectURL() { return 'blob:x'; }
    static revokeObjectURL() {}
  }
  globalThis.URL = StubURL;
  globalThis.Blob = class {};
  globalThis.FileReader = class {
    readAsText(file) {
      if (file.fail) { this.error = { message: 'boom' }; this.onerror(); return; }
      this.result = file.text;
      this.onload();
    }
  };
});

/** 与 save-slots.test.js 同一形状的最小宿主 */
function makeHost(souls = 10) {
  return {
    dialog: { toasts: [], toast(t) { this.toasts.push(t); } },
    player: {
      position: { x: 1, y: 2, z: 3 },
      yaw: 0.5, pitch: 0.2,
      combat: { hp: 100, maxHp: 118, stamina: 50 },
      teleport() {},
    },
    stats: {
      data: { bag: [], level: 1, souls },
      toJSON() { return { ...this.data }; },
      fromJSON(d) { this.data = { ...this.data, ...d }; },
      pushToConsumers() {},
    },
    quests: new QuestSystem({ toast() {} }),
    spells: { mana: 100 },
    settings: { data: {}, applyToGame() {} },
    weaponSkills: { unlocked: new Set(), toJSON: () => ({ unlocked: [] }), fromJSON() {} },
    restPointEnhancer: {
      discovered: new Set(),
      toJSON() { return { discovered: [...this.discovered] }; },
      fromJSON(d) { this.discovered = new Set(d?.discovered ?? []); },
    },
  };
}

beforeEach(() => {
  localStorage._store.clear();
  setLanguage('zh');
});
/* ------------------------------------------------------------------ *
 * ① 钉文案腿
 * ------------------------------------------------------------------ */

describe('① 钉文案腿：26 个新键的中英原值逐字钉死', () => {
  it('26 个新键', () => {
    for (const [key, [zh, en]] of Object.entries(NEW_KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('fmt 键中英占位符一致（version / key / from / to / supported）', () => {
    for (const key of Object.keys(NEW_KEYS)) {
      const 占位 = (s) => [...s.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(占位(STRINGS_EN[key]), `${key} 中英占位符不一致`).toEqual(占位(STRINGS_ZH[key]));
    }
  });
});

/* ------------------------------------------------------------------ *
 * ② 键登记腿
 * ------------------------------------------------------------------ */

describe('② 键登记：26 个新键两表都在场，键数 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415', () => {
  it('26 个新键中英两表一个不缺', () => {
    const zh = new Set(ZH_KEYS);
    const en = new Set(EN_KEYS);
    for (const key of Object.keys(NEW_KEYS)) {
      expect(zh.has(key), `中文表缺 ${key}`).toBe(true);
      expect(en.has(key), `英文表缺 ${key}`).toBe(true);
    }
  });

  it('键数 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415，两表逐键对齐', () => {
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
    expect(ZH_KEYS.length, '键数不是 2415 —— 双表被别处改过').toBe(2415);
  });

  it('新键不孤儿：save_issue_* 在 SaveValidator.js 被引用，save_migrate_* 在 SaveMigrations.js', () => {
    const sv = 读('src/game/SaveValidator.js');
    const sm = 读('src/game/SaveMigrations.js');
    for (const key of Object.keys(NEW_KEYS)) {
      const home = key.startsWith('save_migrate_') ? sm : sv;
      expect(home.includes(key), `${key} 建了却没人引用（死键）`).toBe(true);
    }
  });

  it('新键文案在两表里都最多两个键（同文案写三遍就是命名族失控）', () => {
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of Object.keys(NEW_KEYS)) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * ③ 静态腿
 * ------------------------------------------------------------------ */

describe('③ 静态腿：两个存档源文件的中文字面量清零', () => {
  it('SaveValidator.js 中文字面量清零（23 处 issue 全走 t()）', () => {
    expect(中文字面量(读('src/game/SaveValidator.js'))).toEqual([]);
  });

  it('SaveMigrations.js 中文字面量清零（残留只有「歇过 / 偏移后 / 落点 / 停在」等标识符）', () => {
    expect(中文字面量(读('src/game/SaveMigrations.js'))).toEqual([]);
  });

  it('没有直书中文的 issues.push / SaveVersionError（分母守卫：调用点都还在）', () => {
    const sv = 读('src/game/SaveValidator.js');
    expect(sv).not.toMatch(/issues\.push\((?!t\()/);
    expect(sv.match(/issues\.push\(t\(/g)?.length ?? 0, 'issues.push(t( 一处都没扫到').toBeGreaterThanOrEqual(23);
    const sm = 读('src/game/SaveMigrations.js');
    expect(sm).not.toMatch(/new SaveVersionError\((?!t\()/);
    expect(sm.match(/new SaveVersionError\(t\(/g)?.length ?? 0, 'new SaveVersionError(t( 一处都没扫到').toBeGreaterThanOrEqual(4);
  });
});
/* ------------------------------------------------------------------ *
 * ④ 行为腿（中文）
 * ------------------------------------------------------------------ */

describe('④ 行为腿（zh）：validate / migrate 的诊断与存读链路的 toast 都是展开句', () => {
  it('validate 的坏数据诊断：一批代表性中文原句一条不少', () => {
    const bad = structuredClone(v18);
    bad.version = 4;
    delete bad.player.yaw;
    delete bad.quests.stats.kills;
    delete bad.stats.bag;
    delete bad.restPointEnhancer.discovered;
    bad.quests.stats.skillsUnlocked = 3;
    delete bad.settings;
    delete bad.spells;
    delete bad.weaponSkills;
    delete bad.fastTravel;
    const issues = SaveValidator.validate(bad);
    expect(issues).toContain(`version 必须为 ${CURRENT_VERSION}`);
    expect(issues).toContain('player.yaw 必须是有限数');
    expect(issues).toContain('quests.stats 缺少 kills');
    expect(issues).toContain('quests.stats.skillsUnlocked 已在 v5 移除（派生值）');
    expect(issues).toContain('stats.bag 必须是数组');
    expect(issues).toContain('restPointEnhancer.discovered 必须是数组');
    expect(issues).toContain('spells.mana 必须是有限数');
    expect(issues).toContain('缺少 settings 对象');
    expect(issues).toContain('缺少 weaponSkills（双端 parity）');
    expect(issues).toContain('缺少 fastTravel');
  });

  it('validate 的 fmt 诊断：player 缺字段 / quests.stats 缺账本键', () => {
    const bad = structuredClone(v18);
    delete bad.player.hp;
    delete bad.quests.stats.npcTalked;
    const issues = SaveValidator.validate(bad);
    expect(issues).toContain('player 缺少字段: hp');
    expect(issues).toContain('quests.stats 缺少: npcTalked');
  });

  it('migrate：版本过高 / 根节点非对象 / 漏登记某一跳，三种报错都是中文原句', () => {
    expect(() => migrate({ version: CURRENT_VERSION + 1 }))
      .toThrow(`存档版本 v${CURRENT_VERSION + 1} 高于当前构建支持的 v${CURRENT_VERSION}`);
    expect(() => migrate(null)).toThrow('存档根节点不是对象');
    const step = MIGRATIONS[4];
    delete MIGRATIONS[4];
    try {
      expect(() => migrate(structuredClone(v4))).toThrow('缺少 v4 → v5 的迁移');
    } finally {
      MIGRATIONS[4] = step;
    }
  });

  it('闭环：SaveSystem.save 被拒绝时，toast 里的 issue 是中文原句', () => {
    const g = makeHost();
    g.player.yaw = undefined;
    expect(SaveSystem.save(g, 0)).toBe(false);
    expect(localStorage._store.size).toBe(0);
    expect(g.dialog.toasts).toEqual(['保存被拒绝：player.yaw 必须是有限数']);
  });

  it('闭环：SaveSystem.load 读到版本过高的档，"读取失败"的 reason 也是中文原句', () => {
    const g = makeHost();
    localStorage.setItem(slotKey(1), JSON.stringify({ ...v18, version: CURRENT_VERSION + 1 }));
    expect(SaveSystem.load(g, 1)).toBe(false);
    expect(g.dialog.toasts).toEqual([
      `crossrealm_save_v18_slot1 读取失败：存档版本 v${CURRENT_VERSION + 1} 高于当前构建支持的 v${CURRENT_VERSION}`,
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ 行为腿（英文）
 * ------------------------------------------------------------------ */

describe('⑤ 行为腿（en）：同一条链路英文播出，切片37 留的插值口整句闭合', () => {
  it('validate 的坏数据诊断：同一批坏数据全英文', () => {
    setLanguage('en');
    const bad = structuredClone(v18);
    bad.version = 4;
    delete bad.player.yaw;
    delete bad.quests.stats.kills;
    delete bad.stats.bag;
    delete bad.restPointEnhancer.discovered;
    bad.quests.stats.skillsUnlocked = 3;
    delete bad.settings;
    delete bad.spells;
    delete bad.weaponSkills;
    delete bad.fastTravel;
    const issues = SaveValidator.validate(bad);
    expect(issues).toContain(`version must be ${CURRENT_VERSION}`);
    expect(issues).toContain('player.yaw must be a finite number');
    expect(issues).toContain('quests.stats is missing kills');
    expect(issues).toContain('quests.stats.skillsUnlocked was removed in v5 (derived value)');
    expect(issues).toContain('stats.bag must be an array');
    expect(issues).toContain('restPointEnhancer.discovered must be an array');
    expect(issues).toContain('spells.mana must be a finite number');
    expect(issues).toContain('Missing settings object');
    expect(issues).toContain('Missing weaponSkills (dual-end parity)');
    expect(issues).toContain('Missing fastTravel');
  });

  it('migrate：同一批错误全英文', () => {
    setLanguage('en');
    expect(() => migrate({ version: CURRENT_VERSION + 1 }))
      .toThrow(`Save version v${CURRENT_VERSION + 1} is newer than this build supports (v${CURRENT_VERSION})`);
    expect(() => migrate(null)).toThrow('Save root is not an object');
  });

  it('闭环：Save rejected 与 Failed to read 整句英文，不夹 [MISSING:] 与键名', () => {
    setLanguage('en');
    const g = makeHost();
    g.player.yaw = undefined;
    expect(SaveSystem.save(g, 0)).toBe(false);
    expect(g.dialog.toasts).toEqual(['Save rejected: player.yaw must be a finite number']);

    const g2 = makeHost();
    localStorage.setItem(slotKey(1), JSON.stringify({ ...v18, version: CURRENT_VERSION + 1 }));
    expect(SaveSystem.load(g2, 1)).toBe(false);
    const toasts = [...g.dialog.toasts, ...g2.dialog.toasts];
    expect(toasts).toContain(`Failed to read crossrealm_save_v18_slot1: Save version v${CURRENT_VERSION + 1} is newer than this build supports (v${CURRENT_VERSION})`);
    for (const toast of toasts) {
      expect(toast).not.toContain('[MISSING:');
      expect(toast).not.toMatch(/^[a-z][a-z0-9_]*$/);
      expect(toast).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });
});
/* ------------------------------------------------------------------ *
 * ⑥ 反面证据
 * ------------------------------------------------------------------ */

describe('⑥ 反面证据：尺子自证与插值双腿', () => {
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

  it('插值双腿：五组 fmt 中英两语全部落位', () => {
    setLanguage('zh');
    expect(t('save_issue_version_fmt', { version: 18 })).toBe('version 必须为 18');
    expect(t('save_issue_player_missing_field_fmt', { key: 'hp' })).toBe('player 缺少字段: hp');
    expect(t('save_issue_player_not_finite_fmt', { key: 'yaw' })).toBe('player.yaw 必须是有限数');
    expect(t('save_issue_quest_stats_missing_fmt', { key: 'npcTalked' })).toBe('quests.stats 缺少: npcTalked');
    expect(t('save_migrate_version_too_new_fmt', { from: 19, supported: 18 })).toBe('存档版本 v19 高于当前构建支持的 v18');
    expect(t('save_migrate_missing_step_fmt', { from: 4, to: 5 })).toBe('缺少 v4 → v5 的迁移');
    setLanguage('en');
    expect(t('save_issue_version_fmt', { version: 18 })).toBe('version must be 18');
    expect(t('save_issue_player_missing_field_fmt', { key: 'hp' })).toBe('player is missing field: hp');
    expect(t('save_issue_player_not_finite_fmt', { key: 'yaw' })).toBe('player.yaw must be a finite number');
    expect(t('save_issue_quest_stats_missing_fmt', { key: 'npcTalked' })).toBe('quests.stats is missing: npcTalked');
    expect(t('save_migrate_version_too_new_fmt', { from: 19, supported: 18 })).toBe('Save version v19 is newer than this build supports (v18)');
    expect(t('save_migrate_missing_step_fmt', { from: 4, to: 5 })).toBe('Missing migration from v4 to v5');
    setLanguage('zh');
  });

  it('无参时模板原样返回（t 的既定行为：漏传参数会原样漏出 ${...}，所以调用点必须带参）', () => {
    setLanguage('zh');
    expect(t('save_issue_version_fmt')).toBe('version 必须为 ${version}');
    setLanguage('en');
    expect(t('save_migrate_missing_step_fmt')).toBe('Missing migration from v${from} to v${to}');
    setLanguage('zh');
  });
});