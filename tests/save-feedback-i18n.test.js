/**
 * 存读反馈族进双表（W-D2 切片37）。
 *
 * ## 这一片解决什么
 *
 * `SaveSystem` 的存 / 读 / 导入 / 导出 / 坏档隔离 / 迁移通知整条反馈链全是裸中文
 * 字面量：`进度已保存` / `进度已保存 · 槽N` / `存档已加载` / `保存被拒绝：…` /
 * `存档 X 已损坏（…）…` / `旧存档 vX 已迁移到 vY（跨 N 跳）` / `已导出 …` ……
 * 英文玩家每存一次档就看到一排中文。双表里 `save_success` / `load_success` /
 * `save_failed` 三枚键早就建好却没人引用（死键），本片把它们复活成 SaveSystem
 * 实际播出的那句（原值从未露面），其余 16 条新开。
 *
 * ## 机制
 *
 * 所有 toast / report 改为 `t(键, 参数)` 在播出那一刻展开。`report()` 同时喂
 * console.warn 与 toast 的形状不变（仍是"一句话两处出口"）。坏档隔离那句里的
 * `${key}:corrupt` 是存储键名不是文案，留在模板里由 `${key}` 两处插值带上。
 *
 * 边界（本片不做、下片做）：`保存被拒绝：${issue}` 与 `…读取失败：${reason}` 里
 * 的 issue / reason 来自 `SaveValidator` 与 `SaveMigrations` 的诊断消息，仍是
 * 中文 —— 插值点已按参数接好，切片38 把诊断消息本身进双表即闭环，无需返工。
 *
 * ## 用例分六层
 * ① 钉文案腿：3 枚复活键 + 16 个新键的中英原值逐字钉死；
 * ② 键登记腿：十六个新键两表都在场，键数 2307 → 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2416 → 2418 → 2411（W-E3 切片25：副本行入口抄本除名，带走 7 枚孤儿 wp_label_* 键）→ 2423 → 2433，不孤儿、同文案最多两键；
 * ③ 静态腿：SaveSystem.js 中文字面量只剩 slotKey 那条 throw 诊断（精确钉死）；
 * ④ 行为腿（zh）：真跑 save / load / quarantine / 迁移 / 导出 / 导入全链路；
 * ⑤ 行为腿（en）：同一条链路英文播出，且不夹 [MISSING:] 与键名；
 * ⑥ 反面证据：尺子自证 + 插值双腿 + 登记处无关性自证。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SaveSystem, slotKey } from '../src/game/SaveSystem.js';
import { SAVE_KEYS } from '../src/game/SaveMigrations.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { setLanguage, t } from '../src/engine/i18n.js';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');

/** 16 个新键：键 → [中文原值, 英文原值] */
const NEW_KEYS = {
  save_success_slot_fmt: ['进度已保存 · 槽${slot}', 'Progress saved · Slot ${slot}'],
  save_rejected_fmt: ['保存被拒绝：${issue}', 'Save rejected: ${issue}'],
  save_corrupt_fmt: ['存档 ${key} 已损坏（${reason}），原文件转移到 ${key}:corrupt',
    'Save ${key} is corrupt (${reason}); the original file was moved to ${key}:corrupt'],
  save_corrupt_unquarantined_fmt: ['存档 ${key} 损坏且无法隔离：${message}',
    'Save ${key} is corrupt and could not be quarantined: ${message}'],
  save_migrated_fmt: ['旧存档 v${from} 已迁移到 v${to}（跨 ${jumps} 跳）', 'Old save v${from} migrated to v${to} (${jumps} jumps)'],
  save_validation_failed: ['存档校验未通过', 'Save validation failed'],
  save_apply_validation_failed_fmt: ['存档校验未通过，已跳过加载：${issue}', 'Validation failed, loading skipped: ${issue}'],
  save_json_parse_failed_fmt: ['JSON 无法解析：${message}', 'JSON parse failed: ${message}'],
  save_parse_fallback: ['解析失败', 'parse failed'],
  save_migrate_failed_fmt: ['迁移失败：${message}', 'Migration failed: ${message}'],
  save_storage_unavailable_fmt: ['无法访问浏览器存储：${message}', 'Cannot access browser storage: ${message}'],
  save_read_failed_fmt: ['${key} 读取失败：${reason}', 'Failed to read ${key}: ${reason}'],
  save_exported_fmt: ['已导出 ${filename}', 'Exported ${filename}'],
  save_imported: ['存档已导入并写入浏览器', 'Save imported and written to browser storage'],
  save_import_failed_fmt: ['导入失败：${reason}', 'Import failed: ${reason}'],
  save_import_read_failed_fmt: ['导入失败：文件读取错误（${message}）', 'Import failed: file read error (${message})'],
};

/** 3 枚复活的死键：键 → [中文原值, 英文原值]（改前是从未露面的 '游戏已保存' 等） */
const REVIVED = {
  save_success: ['进度已保存', 'Progress saved'],
  load_success: ['存档已加载', 'Save loaded'],
  save_failed: ['保存失败：${name} ${message}', 'Save failed: ${name} ${message}'],
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
 * 环境桩（与 save-slots.test.js 同款：最小 localStorage / window / URL / FileReader）
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

/** 与 save-slots.test.js 同一形状的最小宿主：少一格都会在 applyData 里哑火（B63 一族） */
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

describe('① 钉文案腿：3 枚复活键 + 16 个新键的中英原值逐字钉死', () => {
  it('十六个新键', () => {
    for (const [key, [zh, en]] of Object.entries(NEW_KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('三枚复活键（原值是从未露面的「游戏已保存 / 游戏已加载 / 保存失败」）', () => {
    for (const [key, [zh, en]] of Object.entries(REVIVED)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('带占位的键中英占位符一致（slot / issue / key / reason / message / from / to / jumps / filename / name）', () => {
    for (const key of [...Object.keys(NEW_KEYS), ...Object.keys(REVIVED)]) {
      const 占位 = (s) => [...s.matchAll(/\$\{(\w+)(?:\|[^}]*)?\}/g)].map((m) => m[1]).sort();
      expect(占位(STRINGS_EN[key]), `${key} 中英占位符不一致`).toEqual(占位(STRINGS_ZH[key]));
    }
  });
});

/* ------------------------------------------------------------------ *
 * ② 键登记腿
 * ------------------------------------------------------------------ */

describe('② 键登记：十六个新键两表都在场，键数 2307 → 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2416 → 2418 → 2411 → 2423 → 2433', () => {
  it('十六个新键中英两表一个不缺', () => {
    const zh = new Set(ZH_KEYS);
    const en = new Set(EN_KEYS);
    for (const key of Object.keys(NEW_KEYS)) {
      expect(zh.has(key), `中文表缺 ${key}`).toBe(true);
      expect(en.has(key), `英文表缺 ${key}`).toBe(true);
    }
  });

  it('键数 2307 → 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2416 → 2418 → 2411 → 2423 → 2433，两表逐键对齐', () => {
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
    expect(ZH_KEYS.length, '键数不是 2433 —— 双表被别处改过').toBe(2433);
  });

  it('新键不孤儿：每个新键都在 SaveSystem.js 里被引用（死键计数只减不增）', () => {
    const ss = 读('src/game/SaveSystem.js');
    for (const key of Object.keys(NEW_KEYS)) {
      expect(ss.includes(key), `${key} 建了却没人引用（死键）`).toBe(true);
    }
  });

  it('三枚死键同片复活：save_success / load_success / save_failed 都以 t() 出场', () => {
    const ss = 读('src/game/SaveSystem.js');
    expect(ss).toContain("t('save_success')");
    expect(ss).toContain("t('load_success')");
    expect(ss).toContain("t('save_failed', {");
  });

  it('新键与复活键的文案在两表里都最多两个键（同文案写三遍就是命名族失控）', () => {
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of [...Object.keys(NEW_KEYS), ...Object.keys(REVIVED)]) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * ③ 静态腿
 * ------------------------------------------------------------------ */

describe('③ 静态腿：SaveSystem.js 的玩家可见中文字面量清零', () => {
  it('只剩 slotKey 那条 throw 诊断（开发者向，精确钉死 —— 再出现任何新的都会红）', () => {
    expect(中文字面量(读('src/game/SaveSystem.js')))
      .toEqual(['`SaveSystem: 槽位必须是 0.. 的整数，收到 "" —— 静默落到别的键就是覆盖别人的档`']);
  });

  it('没有直书中文的 toast / report 调用（全部走 t()）', () => {
    const ss = 读('src/game/SaveSystem.js');
    expect(ss).not.toMatch(/toast\('[^']*[\u4e00-\u9fff]/);
    expect(ss).not.toMatch(/report\(game, `[^`]*[\u4e00-\u9fff]/);
    // 分母守卫：toast 与 report 的调用点都还在（防"一条都没扫到"）
    expect(ss.match(/dialog\?\.toast\(/g)?.length ?? 0, '一处 toast 调用都没扫到').toBeGreaterThan(4);
    expect(ss.match(/report\(game,/g)?.length ?? 0, '一处 report 调用都没扫到').toBeGreaterThan(4);
  });
});

/* ------------------------------------------------------------------ *
 * ④ 行为腿（中文）
 * ------------------------------------------------------------------ */

describe('④ 行为腿（zh）：存读全链路的 toast 都是展开句', () => {
  it('保存：槽 0 与副槽各说各的话', () => {
    const g0 = makeHost();
    expect(SaveSystem.save(g0, 0)).toBe(true);
    expect(g0.dialog.toasts).toEqual(['进度已保存']);
    const g2 = makeHost();
    expect(SaveSystem.save(g2, 2)).toBe(true);
    expect(g2.dialog.toasts).toEqual(['进度已保存 · 槽3']);
  });

  it('拒绝保存：结构不合法的档不落盘，toast 带上校验器的第一条 issue', () => {
    const g = makeHost();
    g.player.yaw = undefined;
    expect(SaveSystem.save(g, 0)).toBe(false);
    expect(localStorage._store.size).toBe(0);
    expect(g.dialog.toasts).toEqual(['保存被拒绝：player.yaw 必须是有限数']);
  });

  it('坏档隔离：改名保留 + 一句人话', () => {
    const g = makeHost();
    SaveSystem.quarantine(g, 'crossrealm_save_v18', 'raw', new Error('boom'));
    expect(g.dialog.toasts).toEqual(['存档 crossrealm_save_v18 已损坏（boom），原文件转移到 crossrealm_save_v18:corrupt']);
    expect(localStorage.getItem('crossrealm_save_v18:corrupt')).toBe('raw');
  });

  it('读不到浏览器存储：一句话说清楚，不吞', () => {
    const g = makeHost();
    const 原 = localStorage.getItem;
    localStorage.getItem = () => { throw new Error('denied'); };
    try {
      expect(SaveSystem.load(g, 1)).toBe(false);
    } finally {
      localStorage.getItem = 原;
    }
    expect(g.dialog.toasts).toEqual(['无法访问浏览器存储：denied']);
  });

  it('坏档读档：先隔离再报"读取失败"，两句都带键', () => {
    const g = makeHost();
    localStorage.setItem(slotKey(1), 'not json');
    expect(SaveSystem.load(g, 1)).toBe(false);
    expect(g.dialog.toasts[0]).toMatch(/^存档 crossrealm_save_v18_slot1 已损坏（/);
    expect(g.dialog.toasts[1]).toMatch(/^crossrealm_save_v18_slot1 读取失败：JSON 无法解析：/);
  });

  it('旧档迁移：先报迁移跳数，再报加载成功', () => {
    const g = makeHost(10);
    expect(SaveSystem.save(g, 0)).toBe(true);
    const raw = localStorage.getItem(SAVE_KEYS[0].key);
    localStorage.setItem(SAVE_KEYS[0].key, JSON.stringify({ ...JSON.parse(raw), version: 17 }));
    const g2 = makeHost(0);
    expect(SaveSystem.load(g2, 0)).toBe(true);
    expect(g2.dialog.toasts).toEqual(['旧存档 v17 已迁移到 v18（跨 1 跳）', '存档已加载']);
  });

  it('导出 / 导入：文件名与导入结果都是展开句', async () => {
    const g = makeHost();
    expect(SaveSystem.save(g, 0)).toBe(true);
    const raw = localStorage.getItem(SAVE_KEYS[0].key);
    SaveSystem.exportFile(g, 0);
    expect(g.dialog.toasts).toEqual(['进度已保存', `已导出 ${SAVE_KEYS[0].key}.json`]);
    const g2 = makeHost(0);
    expect(await SaveSystem.importFile(g2, { text: raw }, 2)).toBe(true);
    expect(g2.dialog.toasts).toContain('存档已导入并写入浏览器');
  });

  it('导入失败两条路：内容不合法 / 文件读不动', async () => {
    const g = makeHost();
    expect(await SaveSystem.importFile(g, { text: 'not json' }, 2)).toBe(false);
    expect(g.dialog.toasts[0]).toMatch(/^导入失败：JSON 无法解析：/);
    const g2 = makeHost();
    expect(await SaveSystem.importFile(g2, { fail: true }, 2)).toBe(false);
    expect(g2.dialog.toasts).toEqual(['导入失败：文件读取错误（boom）']);
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ 行为腿（英文）
 * ------------------------------------------------------------------ */

describe('⑤ 行为腿（en）：同一条链路英文播出，不夹 [MISSING:] 与键名', () => {
  it('保存 / 槽位 / 坏档 / 迁移 / 导出 / 导入全部英文', async () => {
    setLanguage('en');
    const g0 = makeHost();
    expect(SaveSystem.save(g0, 0)).toBe(true);
    expect(g0.dialog.toasts).toEqual(['Progress saved']);
    const g2 = makeHost();
    expect(SaveSystem.save(g2, 2)).toBe(true);
    expect(g2.dialog.toasts).toEqual(['Progress saved · Slot 3']);

    const gq = makeHost();
    SaveSystem.quarantine(gq, 'crossrealm_save_v18', 'raw', new Error('boom'));
    expect(gq.dialog.toasts).toEqual(['Save crossrealm_save_v18 is corrupt (boom); the original file was moved to crossrealm_save_v18:corrupt']);

    const gm = makeHost(10);
    expect(SaveSystem.save(gm, 0)).toBe(true);
    const raw = localStorage.getItem(SAVE_KEYS[0].key);
    localStorage.setItem(SAVE_KEYS[0].key, JSON.stringify({ ...JSON.parse(raw), version: 17 }));
    const gm2 = makeHost(0);
    expect(SaveSystem.load(gm2, 0)).toBe(true);
    expect(gm2.dialog.toasts).toEqual(['Old save v17 migrated to v18 (1 jumps)', 'Save loaded']);

    const ge = makeHost();
    expect(SaveSystem.save(ge, 0)).toBe(true);
    SaveSystem.exportFile(ge, 0);
    expect(ge.dialog.toasts).toEqual(['Progress saved', `Exported ${SAVE_KEYS[0].key}.json`]);

    const gi = makeHost(0);
    expect(await SaveSystem.importFile(gi, { text: raw }, 2)).toBe(true);
    expect(gi.dialog.toasts).toContain('Save imported and written to browser storage');

    for (const toast of [...g0.dialog.toasts, ...g2.dialog.toasts, ...gq.dialog.toasts, ...gm2.dialog.toasts, ...ge.dialog.toasts, ...gi.dialog.toasts]) {
      expect(toast).not.toContain('[MISSING:');
      expect(toast).not.toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('拒绝与读取失败的模板是英文的（issue / reason 正文归切片38，插值点已留好）', () => {
    setLanguage('en');
    const g = makeHost();
    g.player.yaw = undefined;
    expect(SaveSystem.save(g, 0)).toBe(false);
    expect(g.dialog.toasts[0]).toMatch(/^Save rejected: /);
    const g2 = makeHost();
    localStorage.setItem(slotKey(1), 'not json');
    expect(SaveSystem.load(g2, 1)).toBe(false);
    expect(g2.dialog.toasts[1]).toMatch(/^Failed to read crossrealm_save_v18_slot1: /);
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

  it('坏档那句的两个 ${key} 都被插上（原文件转移到的那半句不是漏网的中文）', () => {
    setLanguage('zh');
    expect(t('save_corrupt_fmt', { key: 'K', reason: 'R' }))
      .toBe('存档 K 已损坏（R），原文件转移到 K:corrupt');
    setLanguage('en');
    expect(t('save_corrupt_fmt', { key: 'K', reason: 'R' }))
      .toBe('Save K is corrupt (R); the original file was moved to K:corrupt');
    setLanguage('zh');
  });

  it('迁移那句的 from / to / jumps 三个占位都落位', () => {
    setLanguage('zh');
    expect(t('save_migrated_fmt', { from: 3, to: 18, jumps: 15 })).toBe('旧存档 v3 已迁移到 v18（跨 15 跳）');
    setLanguage('en');
    expect(t('save_migrated_fmt', { from: 3, to: 18, jumps: 15 })).toBe('Old save v3 migrated to v18 (15 jumps)');
    setLanguage('zh');
  });
});