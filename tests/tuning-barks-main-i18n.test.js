/**
 * 部位标签 / 战斗 bark / main.js 启动文案进双表（W-D2 切片41）。
 *
 * ## 这一片解决什么
 *
 * ① `content/tuning.js` 的 `PARTS.head.label`（值「弱点」）经 Hurtbox 透传进
 *    `Resolution.hitSuffix`，拼在伤害飘字后面 — 英文玩家打头看到的是中文后缀。
 * ② `game/PopCultureCombatBarks.js` 的 12 句致敬 bark 是裸中文 — 击败敌人随机播出的
 *    整句 toast 对英文玩家是中文。
 * ③ `main.js` 三句启动期文案（指针锁定提示 / file: 协议提示 / 初始化失败）也是裸中文，
 *    且播出时机早于 `new Game()`（SettingsManager 还没构造，语言尚未应用）。
 *
 * ## 机制
 *
 * - `PARTS.head.label` 存键 `part_label_head`，`hitSuffix` 里 `t(hit.part.label)` 展开
 *   （与 `SUMMON.name` → `enemy_name_summon` 同款模式，切片16s）。
 * - bark 池子改存 12 枚 `bark_pop_*` 键，播出点 `t(list[...])`。
 * - main.js 三句：指针锁定复用既有键 `dialog_click_to_lock`（同文不建第二键，
 *   且它此前零消费方）；另两句新开 `boot_error_direct_open` / `boot_error_init_failed_fmt`
 *   （后者带 `${message}` 插值）。
 * - `SettingsManager` 新增导出 `storedLanguage()`：只读存储里的语言这一格
 *   （v2 `{version, values.language}` 与 v1 扁平均认），脏值/异常回 null；
 *   `main.js` 的 `boot()` 最前面 `setLanguage(storedLanguage() ?? 'zh')`，
 *   让早于 Game 构造的错误路径也按玩家选的语言报。
 *
 * ## 用例分六层
 * ① 钉文案腿：15 个新键 + 1 枚复用键的中英原值逐字钉死；
 * ② 键登记腿：键数 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415，两表对齐，复用不新开同文键，新键不孤儿，池子归属钉死；
 * ③ 静态腿：tuning.js（PARTS 键化 + ENEMY_MOVES 28 个招式名文档字段精确集合）、
 *    PopCultureCombatBarks.js 与 main.js 字符串字面量清零（console.* 诊断按切片37 口径豁免）、
 *    Resolution.js 的 t() 锚点；
 * ④ 行为腿（zh）：hitSuffix 头部后缀、12 句 bark 逐池逐句播出、storedLanguage 存储形态、
 *    boot 两键展开；
 * ⑤ 行为腿（en）：同两条链路英文播出，不夹 [MISSING:] 与中文；
 * ⑥ 反面证据：尺子自证 + 插值双腿 + 无参时模板原样返回。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { attachPopCultureCombatBarks, COMBAT_BARKS_POP } from '../src/game/PopCultureCombatBarks.js';
import { ZONE_IDS } from '../src/content/ZoneIdentity.js';
import { hitSuffix } from '../src/combat/Resolution.js';
import { storedLanguage } from '../src/core/SettingsManager.js';
import { emit } from '../src/engine/EventBus.js';
import { installWindowShim } from './helpers/enemyHarness.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { setLanguage, t } from '../src/engine/i18n.js';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');

/** 15 个新键：键 → [中文原值, 英文原值] */
const NEW_KEYS = {
  part_label_head: ['弱点', 'Weak point'],
  bark_pop_magic_candles: ['悬浮蜡烛被剑气吹歪 — 像某所学院的夜巡被打扰。', "Floating candles tilt in the blade wind — some academy's night patrol, interrupted."],
  bark_pop_magic_forest: ['禁林树影里闪过银光 — 护念？还是魂火萤？', "A silver glint darts through the Forbidden Forest's shadows — a Patronus? Or soul-fire?"],
  bark_pop_space_hourglass: ['米勒沙漏的沙子落得太快 — 这一刀可能已是七年后的回声。', "The sand in Miller's hourglass falls too fast — this slash may be an echo from seven years on."],
  bark_pop_space_dock: ['对接舱金属环在远处旋转 — 别在这里恋战太久。', 'Docking-ring gantries turn in the distance — do not linger here too long.'],
  bark_pop_void_spores: ['红色孢子粘在刀锋上 — 逆相界的风从裂口渗出。', 'Red spores cling to the blade — the wind of the inverted realm seeps from the rift.'],
  bark_pop_void_clocktower: ['远处钟塔无声地指向 11:06 — 天花板感觉更远了。', 'The distant clocktower silently points to 11:06 — the ceiling feels farther away.'],
  bark_pop_fantasy_mirror: ['沙龙镜墙裂镜一闪 — 倒影比你快半拍。', 'A cracked mirror flashes along the salon wall — the reflection is half a beat faster than you.'],
  bark_pop_fantasy_duel: ['正午决斗圈的 chalk 线被踩乱 — 太阳不会等你。', 'The chalk line of the noon duel circle is scuffed — the sun will not wait for you.'],
  bark_pop_abyss_cellar: ['禁酒窖门缝漏光 — 幽冥帮派在远处谈关税。', 'Light leaks under the speakeasy cellar door — specter gangs haggle over tariffs in the distance.'],
  bark_pop_abyss_docks: ['码头货箱碰撞 — 魂火走私线仍通。', 'Crates crash on the docks — the soul-fire smuggling line is still open.'],
  bark_pop_scifi_jumpgate: ['跃迁门蓝光脉动 — 这一刀可能已是错相循环的第一秒。', 'The jump gate pulses blue — this slash may be the first second of a skewed cycle.'],
  bark_pop_scifi_ai: ['休眠 AI 核心嗡鸣：「任务未完成。」', 'A dormant AI core hums: "Objective incomplete."'],
  boot_error_direct_open: ['不能直接双击打开 HTML。\n请在项目目录运行 npm run dev，然后访问 http://localhost:5173', 'Do not open this HTML file directly.\nRun npm run dev in the project directory, then visit http://localhost:5173'],
  boot_error_init_failed_fmt: ['游戏初始化失败：${message}\n请按 F12 查看控制台详情。', 'Game initialization failed: ${message}\nPress F12 for console details.'],
};

/** 复用的既有键（不新开同文键）：键 → [中文原值, 英文原值] */
const REUSED = {
  dialog_click_to_lock: ['请点击画面中央再次锁定鼠标', 'Click center of screen to lock mouse'],
};

/** 池子归属：区域 id → [第一句键, 第二句键]（space_scifi 池同样由 ZONE_IDS.SPACE 触发） */
const BARK_POOL = {
  [ZONE_IDS.MAGIC]: ['bark_pop_magic_candles', 'bark_pop_magic_forest'],
  [ZONE_IDS.SPACE]: ['bark_pop_space_hourglass', 'bark_pop_space_dock'],
  [ZONE_IDS.VOID]: ['bark_pop_void_spores', 'bark_pop_void_clocktower'],
  [ZONE_IDS.FANTASY]: ['bark_pop_fantasy_mirror', 'bark_pop_fantasy_duel'],
  [ZONE_IDS.ABYSS]: ['bark_pop_abyss_cellar', 'bark_pop_abyss_docks'],
};

/** ENEMY_MOVES 的招式名是**文档字段**（src 无消费方，只测试读）— 精确集合钉死，
 *  新加招式名必须来这里点名（键化会造一批死键，违反死键纪律） */
const MOVE_NAMES = [
  '横扫', '突刺', '重劈', '崩地', '三连刺', '虚能弹', '俯冲', '格挡', '召唤', '相位突袭',
  '蓄力炮击', '嚎叫引援', '裂隙', '盾击', '践踏冲撞', '旋舞', '扇形齐射', '破阵冲撞',
  '圣光爆', '圣洁冲击', '晨曦旋舞', '幽灵缠身', '潜行标记', '潜行扑杀', '圣印灼场',
  '信标灼场', '阵型打击', '战术扫描',
];

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

/** console.* 的首参是**开发诊断**（切片37 口径：玩家在游戏里看不到控制台），不算玩家可见 */
const 是console诊断 = (src, start) => /console\.\w+\s*\(\s*$/.test(src.slice(0, start));

const 中文字面量 = (src) => 字符串字面量(src)
  .filter((sp) => !是console诊断(src, sp.start))
  .map((sp) => 文案部分(src, sp))
  .filter((text) => /[\u4e00-\u9fff]/.test(text));

/* ------------------------------------------------------------------
 * 环境桩
 * ------------------------------------------------------------------ */

beforeAll(() => {
  installWindowShim();
});

beforeEach(() => {
  setLanguage('zh');
});

/** 播一句 bark：stub Math.random 强制命中并选到指定句（返回 toast 的第一个参数） */
function playBark(zoneId, pickIdx, zoneRoll = 0.1) {
  const host = { world: { zoneId }, dialog: { toast: (...a) => host.toasts.push(a) }, toasts: [] };
  const detach = attachPopCultureCombatBarks(host);
  const spy = vi.spyOn(Math, 'random');
  spy.mockReturnValueOnce(zoneRoll);                    // barkKeyForZone 的 roll 形参（默认实参每次调用都求值）
  spy.mockReturnValueOnce(0.1);                         // 命中判定：0.1 <= 0.22
  spy.mockReturnValueOnce(pickIdx === 0 ? 0.1 : 0.6);   // 选句
  emit('enemy-defeated');
  spy.mockRestore();
  detach.dispose();
  return host.toasts[0]?.[0];
}

/* ------------------------------------------------------------------
 * ① 钉文案腿
 * ------------------------------------------------------------------ */

describe('① 钉文案腿：15 新键 + 1 复用键的中英原值', () => {
  it('15 个新键逐字钉死', () => {
    for (const [k, [zh, en]] of Object.entries(NEW_KEYS)) {
      expect(STRINGS_ZH[k], k + ' 中文').toBe(zh);
      expect(STRINGS_EN[k], k + ' 英文').toBe(en);
    }
  });

  it('复用键原值未动（dialog_click_to_lock）', () => {
    for (const [k, [zh, en]] of Object.entries(REUSED)) {
      expect(STRINGS_ZH[k], k + ' 中文').toBe(zh);
      expect(STRINGS_EN[k], k + ' 英文').toBe(en);
    }
  });
});

/* ------------------------------------------------------------------
 * ② 键登记腿
 * ------------------------------------------------------------------ */

describe('② 键登记腿：键数、对齐、复用、不孤儿', () => {
  it('键数 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415，两表对齐', () => {
    expect(ZH_KEYS.length).toBe(2415);
    expect(EN_KEYS.length).toBe(2415);
    expect([...ZH_KEYS].sort()).toEqual([...EN_KEYS].sort());
  });

  it('15 个新键两表都在场', () => {
    for (const k of Object.keys(NEW_KEYS)) {
      expect(ZH_KEYS, k).toContain(k);
      expect(EN_KEYS, k).toContain(k);
    }
  });

  it('复用键不新建同文键：那句中/英文在全表各只出现一次', () => {
    expect(读('src/content/strings.zh.js').split(REUSED.dialog_click_to_lock[0]).length - 1).toBe(1);
    expect(读('src/content/strings.en.js').split(REUSED.dialog_click_to_lock[1]).length - 1).toBe(1);
  });

  it('新键不孤儿：15 键都在四个源码文件里被引用', () => {
    const src = ['src/content/tuning.js', 'src/combat/Resolution.js', 'src/game/PopCultureCombatBarks.js', 'src/main.js']
      .map(读).join('\n');
    for (const k of Object.keys(NEW_KEYS)) expect(src, k + ' 建了键没人用').toContain(k);
  });

  it('池子归属逐池钉死（COMBAT_BARKS_POP 与 BARK_POOL 一致）', () => {
    for (const [zone, keys] of Object.entries(BARK_POOL)) {
      expect(COMBAT_BARKS_POP[zone], zone).toEqual(keys);
    }
    expect(COMBAT_BARKS_POP.space_scifi).toEqual(['bark_pop_scifi_jumpgate', 'bark_pop_scifi_ai']);
  });
});

/* ------------------------------------------------------------------
 * ③ 静态腿
 * ------------------------------------------------------------------ */

describe('③ 静态腿：四个源码文件的字面量与锚点', () => {
  it('tuning.js：PARTS.head.label 是键，PARTS 块无中文字面量', () => {
    const src = 读('src/content/tuning.js');
    const parts = src.slice(src.indexOf('export const PARTS'), src.indexOf('export const BODY_PLANS'));
    expect(parts).toContain("label: 'part_label_head'");
    expect(中文字面量(parts)).toEqual([]);
  });

  it('tuning.js：ENEMY_MOVES 的 28 个招式名仍是文档字段（精确集合，新增要来这里点名）', () => {
    const src = 读('src/content/tuning.js');
    const block = src.slice(src.indexOf('export const ENEMY_MOVES'), src.indexOf('export const SUMMON'));
    const names = [...block.matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
    expect([...names].sort()).toEqual([...MOVE_NAMES].sort());
  });

  it('PopCultureCombatBarks.js：字符串字面量零中文（池子里只剩键）', () => {
    expect(中文字面量(读('src/game/PopCultureCombatBarks.js'))).toEqual([]);
  });

  it('main.js：字符串字面量零中文 + 早读与三处 t() 锚点在场', () => {
    const src = 读('src/main.js');
    expect(中文字面量(src)).toEqual([]);
    expect(src).toContain("setLanguage(storedLanguage() ?? 'zh')");
    expect(src).toContain("t('dialog_click_to_lock')");
    expect(src).toContain("t('boot_error_direct_open')");
    expect(src).toContain("t('boot_error_init_failed_fmt'");
  });

  it('Resolution.js：part.label 经 t() 展开', () => {
    expect(读('src/combat/Resolution.js')).toContain('t(hit.part.label)');
  });
});

/* ------------------------------------------------------------------
 * ④ 行为腿（中文）
 * ------------------------------------------------------------------ */

describe('④ 行为腿（zh）：飘字后缀、12 句 bark、storedLanguage、boot 键', () => {
  it('hitSuffix：头部命中输出「弱点」，与格挡/会心拼接', () => {
    expect(hitSuffix({ part: { label: 'part_label_head' } })).toBe('弱点');
    expect(hitSuffix({ blocked: true, part: { label: 'part_label_head' }, crit: true })).toBe('格挡弱点会心');
  });

  it('12 句 bark 逐池逐句中文播出（stub Math.random 强制命中）', () => {
    for (const [zone, [k0, k1]] of Object.entries(BARK_POOL)) {
      // 荒原两套气质：space 池要 roll > 0.5 才选中（barkKeyForZone 的另一分支是 space_scifi）
      const roll = zone === ZONE_IDS.SPACE ? 0.6 : 0.1;
      expect(playBark(zone, 0, roll), zone + ' 第一句').toBe(STRINGS_ZH[k0]);
      expect(playBark(zone, 1, roll), zone + ' 第二句').toBe(STRINGS_ZH[k1]);
    }
    expect(playBark(ZONE_IDS.SPACE, 0, 0.1)).toBe(STRINGS_ZH.bark_pop_scifi_jumpgate);
    expect(playBark(ZONE_IDS.SPACE, 1, 0.1)).toBe(STRINGS_ZH.bark_pop_scifi_ai);
  });

  describe('storedLanguage：boot 早读的存储形态', () => {
    afterEach(() => {
      delete globalThis.localStorage;
    });

    const stub = (raw) => {
      globalThis.localStorage = { getItem: (k) => (k === 'crossrealm_settings' ? raw : null) };
    };

    it('v2 形状：{version, values.language}', () => {
      stub(JSON.stringify({ version: 2, values: { language: 'en' } }));
      expect(storedLanguage()).toBe('en');
    });

    it('v1 扁平形状（认识键搬进 values，language 认得）', () => {
      stub(JSON.stringify({ language: 'en', masterVolume: 0.5 }));
      expect(storedLanguage()).toBe('en');
    });

    it('中文存储读出来还是 zh', () => {
      stub(JSON.stringify({ version: 2, values: { language: 'zh' } }));
      expect(storedLanguage()).toBe('zh');
    });

    it('脏值回落 null（调用方回落 zh）', () => {
      stub(JSON.stringify({ version: 2, values: { language: 'fr' } }));
      expect(storedLanguage()).toBeNull();
    });

    it('坏 JSON 回落 null', () => {
      stub('{oops');
      expect(storedLanguage()).toBeNull();
    });

    it('localStorage 抛异常也回落 null（隐私模式）', () => {
      globalThis.localStorage = { getItem: () => { throw new Error('SecurityError'); } };
      expect(storedLanguage()).toBeNull();
    });
  });

  it('boot 两键中文展开（file: 协议整句 / 初始化失败插值）', () => {
    expect(t('boot_error_direct_open')).toBe(NEW_KEYS.boot_error_direct_open[0]);
    expect(t('boot_error_init_failed_fmt', { message: 'boom' })).toBe('游戏初始化失败：boom\n请按 F12 查看控制台详情。');
  });
});

/* ------------------------------------------------------------------
 * ⑤ 行为腿（英文）
 * ------------------------------------------------------------------ */

describe('⑤ 行为腿（en）：同两条链路英文播出，不夹 [MISSING:] 与中文', () => {
  it('hitSuffix 头部后缀英文', () => {
    setLanguage('en');
    expect(hitSuffix({ part: { label: 'part_label_head' } })).toBe('Weak point');
    expect(hitSuffix({ blocked: true, part: { label: 'part_label_head' }, crit: true })).toBe('BlockWeak pointCritical');
  });

  it('12 句 bark 逐池逐句英文播出', () => {
    setLanguage('en');
    for (const [zone, [k0, k1]] of Object.entries(BARK_POOL)) {
      const roll = zone === ZONE_IDS.SPACE ? 0.6 : 0.1;
      const a = playBark(zone, 0, roll);
      const b = playBark(zone, 1, roll);
      expect(a, zone + ' 第一句').toBe(STRINGS_EN[k0]);
      expect(b, zone + ' 第二句').toBe(STRINGS_EN[k1]);
      for (const v of [a, b]) {
        expect(v).not.toContain('[MISSING:');
        expect(v).not.toMatch(/[\u4e00-\u9fff]/);
      }
    }
    expect(playBark(ZONE_IDS.SPACE, 0, 0.1)).toBe(STRINGS_EN.bark_pop_scifi_jumpgate);
    expect(playBark(ZONE_IDS.SPACE, 1, 0.1)).toBe(STRINGS_EN.bark_pop_scifi_ai);
  });

  it('storedLanguage 与 boot 键英文展开', () => {
    setLanguage('en');
    globalThis.localStorage = { getItem: (k) => (k === 'crossrealm_settings' ? JSON.stringify({ version: 2, values: { language: 'en' } }) : null) };
    expect(storedLanguage()).toBe('en');
    delete globalThis.localStorage;
    expect(t('boot_error_direct_open')).toBe(NEW_KEYS.boot_error_direct_open[1]);
    expect(t('boot_error_init_failed_fmt', { message: 'boom' })).toBe('Game initialization failed: boom\nPress F12 for console details.');
  });
});

/* ------------------------------------------------------------------
 * ⑥ 反面证据
 * ------------------------------------------------------------------ */

describe('⑥ 反面证据：尺子自证与插值双腿', () => {
  it('尺子自证：喂一段假源码 — 认字符串、剔注释、剔插值、不认标识符', () => {
    const 假源码 = [
      "const a = '真火咒';",
      '// 行注释里的玄冰刺不算',
      '/* 块注释里的引力坍缩也不算 */',
      'const b = `模板 ${x} 结尾`;',
      'const 标识符中文 = 1;',
      "console.warn('控制台诊断中文不算玩家可见');",
    ].join('\n');
    expect(中文字面量(假源码)).toEqual(["'真火咒'", '`模板  结尾`']);
  });

  it('插值双腿：boot_error_init_failed_fmt 的 message 中英两语落位', () => {
    expect(t('boot_error_init_failed_fmt', { message: 'x' })).toBe('游戏初始化失败：x\n请按 F12 查看控制台详情。');
    setLanguage('en');
    expect(t('boot_error_init_failed_fmt', { message: 'x' })).toBe('Game initialization failed: x\nPress F12 for console details.');
    setLanguage('zh');
  });

  it('无参时模板原样返回（漏传参数会原样漏出 ${...}，所以调用点必须带参）', () => {
    expect(t('boot_error_init_failed_fmt')).toBe('游戏初始化失败：${message}\n请按 F12 查看控制台详情。');
    setLanguage('en');
    expect(t('boot_error_init_failed_fmt')).toBe('Game initialization failed: ${message}\nPress F12 for console details.');
    setLanguage('zh');
  });
});
