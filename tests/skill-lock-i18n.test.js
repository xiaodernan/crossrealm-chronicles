/**
 * 技能锁因文案进双表（W-D2 切片43）。
 *
 * ## 这一片解决什么
 *
 * `game/StoryWeaponSkills.js` 的 `getStoryLockReason` 是"这一格现在为什么不能加点"的
 * 唯一判定：13 条分支各返回一句中文（`需 Chapter 4` / `需 1 条叙事碎片 (0/1)` /
 * `需施放法术 8 次 (3/8)` … `需击败对应 Boss`）。`ui/UpgradePanel.js` 把它原样写进
 * `<em class="skill-lock">` —— 玩家可见，英文界面下却原样留在中文。
 *
 * ## 机制
 *
 * 13 条模板全部搬进双表：11 枚新键 `skill_lock_*_fmt`（带进度参数），章节与
 * "击败 Boss"两条**复用**营火升级面板既有的两枚键（`upgrade_skill_lock_chapter_fmt` /
 * `upgrade_skill_lock_boss` —— 同文不建第二键；后者中文由"需击败对应 Boss"对齐为
 * "需击败 Boss"，值仍被 ending-upgrade-i18n 门禁钉着）。其余 11 句**中文逐字节未动**，
 * 既有按中文匹配的用例原样绿；④ 用 13 条原值正向钉死这个兼容。
 *
 * 插值里的 id 由切片45 的四支解析器翻成显示名：Boss / 区域 / 击杀类型 / 效果四族
 * 查得到的翻成人话（"需击败 1 次 大奥术师·萨尔林 (0/1)" / "需击败 20 只 影之战士 (0/20)"），
 * 查不到的原样退回 id。支线 / 物品 / 成就 / 旗标四族仍是裸 id —— 支线与物品唯一引用处的
 * id 不在任何表里（做了就是死代码），旗标没有 id 宇宙；成就族自切片49 起有了 id 宇宙
 * （`champion-of-hub` 已入成就表），显示名解析器留到支线族接驳后与支线一起补。切片47 把 s-combo 的
 * `normal` 修成名册里的 `soldier` 之后，锁因表里已无名册外击杀类型（回退路径由 ⑦ 腿单测）。
 *
 * ## 用例分七层
 * ① 钉文案腿：16 个新键的中英原值逐字钉死；
 * ② 键登记腿：键数 2388 → 2399 → 2404 → 2406 → 2409 → 2411，两表对齐，同文不建第二键，新键不孤儿；
 * ③ 静态腿：13 个调用点锚定、复用两键不新开、文件里再无中文字面量；
 * ④ 行为腿（zh）：14 种 lock 形状各造一条读数，等于改后中文；
 * ⑤ 行为腿（en）：同一批读数英文播出；
 * ⑥ 反面证据：尺子自证 + 任何分支都不出 [MISSING:]；
 * ⑦ 解析腿：四族 id → 显示名，映射表双向对齐、逐族正反向、句子真的用上了解析。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bossLabel, enemyLabel, effectLabel, getStoryLockReason, zoneLabel } from '../src/game/StoryWeaponSkills.js';
import { SKILL_EFFECT_KEYS, SKILL_EFFECT_LABEL_KEYS } from '../src/content/skillTrees.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { setLanguage } from '../src/engine/i18n.js';
import { installWindowShim } from './helpers/enemyHarness.js';

installWindowShim();

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');

/** 切片43 的 11 个模板键：键 → [中文原值, 英文原值] */
const TEMPLATE_KEYS = {
  skill_lock_fragments_fmt: ['需 ${need} 条叙事碎片 (${have}/${need})', 'Requires ${need} lore fragments (${have}/${need})'],
  skill_lock_spellcasts_fmt: ['需施放法术 ${need} 次 (${have}/${need})', 'Cast spells ${need} times (${have}/${need})'],
  skill_lock_kills_fmt: ['需击败 ${count} 只 ${type} (${have}/${count})', 'Defeat ${count} ${type} (${have}/${count})'],
  skill_lock_skilluses_fmt: ['需使用 ${count} 次 ${skill} (${have}/${count})', 'Use ${skill} ${count} times (${have}/${count})'],
  skill_lock_bosskills_fmt: ['需击败 ${count} 次 ${boss} (${have}/${count})', 'Defeat ${boss} ${count} times (${have}/${count})'],
  skill_lock_quest_fmt: ['需完成 ${count} 次支线 ${quest} (${have}/${count})', 'Complete side quest ${quest} ${count} times (${have}/${count})'],
  skill_lock_item_fmt: ['需收集 ${count} 个 ${item} (${have}/${count})', 'Collect ${count} ${item} (${have}/${count})'],
  skill_lock_achievement_fmt: ['需解锁 ${count} 次成就 ${achievement} (${have}/${count})', 'Unlock achievement ${achievement} ${count} times (${have}/${count})'],
  skill_lock_zone_fmt: ['需到达 ${count} 次区域 ${zone} (${have}/${count})', 'Reach zone ${zone} ${count} times (${have}/${count})'],
  skill_lock_flag_fmt: ['需触发 ${count} 次剧情 ${flag} (${have}/${count})', 'Trigger story flag ${flag} ${count} times (${have}/${count})'],
  skill_lock_level_fmt: ['需 Lv.${need} (当前 Lv.${have})', 'Requires Lv.${need} (current Lv.${have})'],
};

/** 切片45 的 5 个效果名键：键 → [中文原值, 英文原值] */
const LABEL_KEYS = {
  skill_effect_melee: ['近战', 'Melee'],
  skill_effect_combo: ['连击', 'Combo'],
  skill_effect_riposte: ['处决与弹反', 'Riposte'],
  skill_effect_finisher: ['终结技', 'Finisher'],
  skill_effect_charge: ['蓄力', 'Charge'],
};

/** 本门禁登记的新键 = 切片43 的 11 个模板键 + 切片45 的 5 个效果名键 */
const NEW_KEYS = { ...TEMPLATE_KEYS, ...LABEL_KEYS };

/** 13 种 lock 形状：节点 → 夹具改动 → 改前原句（zh）/ 改后英文 */
const LOCK_CASES = [
  { id: 'm-transform', why: '章节', patch: { chapter: 1 }, zh: '需 Chapter 4', en: 'Requires Chapter 4' },
  { id: 's-combo', why: '叙事碎片', patch: { chapter: 2, fragment: 0 }, zh: '需 1 条叙事碎片 (0/1)', en: 'Requires 1 lore fragments (0/1)' },
  { id: 'm-mana', why: '施法次数', patch: { chapter: 2, spellCasts: 3 }, zh: '需施放法术 8 次 (3/8)', en: 'Cast spells 8 times (3/8)' },
  { id: 'm-pierce', why: '击杀数', patch: {}, zh: '需击败 5 只 精英·虚空骑士 (0/5)', en: 'Defeat 5 Elite · Void Knight (0/5)' },
  { id: 's-tempo', why: '技能使用', patch: {}, zh: '需使用 30 次 连击 (0/30)', en: 'Use Combo 30 times (0/30)' },
  { id: 's-realmedge', why: 'Boss 击杀', patch: {}, zh: '需击败 1 次 大奥术师·萨尔林 (0/1)', en: 'Defeat Archmagus Saloran 1 times (0/1)' },
  { id: 'r-quest-master', why: '支线完成', patch: {}, zh: '需完成 1 次支线 side-lost-scholar (0/1)', en: 'Complete side quest side-lost-scholar 1 times (0/1)' },
  { id: 'r-relic-hunter', why: '物品收集', patch: {}, zh: '需收集 3 个 void-resonance-shard (0/3)', en: 'Collect 3 void-resonance-shard (0/3)' },
  { id: 's-champion', why: '成就解锁', patch: {}, zh: '需解锁 1 次成就 champion-of-hub (0/1)', en: 'Unlock achievement champion-of-hub 1 times (0/1)' },
  { id: 'm-wanderer', why: '区域到达', patch: {}, zh: '需到达 1 次区域 破碎时线 (0/1)', en: 'Reach zone Broken Timeline 1 times (0/1)' },
  { id: 's-combo', why: '击杀数', patch: { chapter: 2, fragment: 1 }, zh: '需击败 20 只 影之战士 (0/20)', en: 'Defeat 20 Shadow Warrior (0/20)' },
  { id: 'r-archivist', why: '剧情旗标', patch: {}, zh: '需触发 1 次剧情 void-chronicle-read (0/1)', en: 'Trigger story flag void-chronicle-read 1 times (0/1)' },
  { id: 's-apotheosis', why: '等级', patch: { level: 10 }, zh: '需 Lv.12 (当前 Lv.10)', en: 'Requires Lv.12 (current Lv.10)' },
  { id: 's-riposte', why: 'Boss 未击败', patch: { chapter: 5 }, zh: '需击败 Boss', en: 'Defeat the Boss first' },
];

/** 默认全满足、只留空账本；`bossDefeated` 给 0 而不是 {} —— {} 是真值，会把"没打过"扮成"打过" */
function game(patch = {}) {
  const { chapter = 5, level = 99, spellCasts = 99, fragment = 99 } = patch;
  return {
    quests: {
      chapter,
      stats: {
        level, spellCasts,
        kills: {}, skillUses: {}, bossDefeated: 0, boss3Defeated: 1, questsCompleted: {},
        itemsCollected: {}, achievementsUnlocked: {}, zonesReached: {}, storyFlags: {},
      },
    },
    storyJournal: { getCounts: () => ({ fragment }), addSilent() {} },
  };
}

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

beforeEach(() => {
  setLanguage('zh');
});

/* ------------------------------------------------------------------
 * ① 钉文案腿
 * ------------------------------------------------------------------ */

describe('① 钉文案腿：11 个新键的中英原值', () => {
  it('逐字钉死', () => {
    for (const [k, [zh, en]] of Object.entries(NEW_KEYS)) {
      expect(STRINGS_ZH[k], k + ' 中文').toBe(zh);
      expect(STRINGS_EN[k], k + ' 英文').toBe(en);
    }
  });

  it('复用的两枚旧键原值没动（ending-upgrade 门禁钉的那两格）', () => {
    expect(STRINGS_ZH.upgrade_skill_lock_chapter_fmt).toBe('需 Chapter ${chapter}');
    expect(STRINGS_EN.upgrade_skill_lock_chapter_fmt).toBe('Requires Chapter ${chapter}');
    expect(STRINGS_ZH.upgrade_skill_lock_boss).toBe('需击败 Boss');
    expect(STRINGS_EN.upgrade_skill_lock_boss).toBe('Defeat the Boss first');
  });
});

/* ------------------------------------------------------------------
 * ② 键登记腿
 * ------------------------------------------------------------------ */

describe('② 键登记腿：键数、对齐、同文、不孤儿', () => {
  it('键数 2388 → 2399 → 2404 → 2406 → 2409 → 2411，两表对齐', () => {
    expect(ZH_KEYS.length).toBe(2411);
    expect(EN_KEYS.length).toBe(2411);
    expect([...ZH_KEYS].sort()).toEqual([...EN_KEYS].sort());
  });

  it('16 个新键两表都在场', () => {
    for (const k of Object.keys(NEW_KEYS)) {
      expect(ZH_KEYS, k).toContain(k);
      expect(EN_KEYS, k).toContain(k);
    }
  });

  it('同文不建第二键：每个中文原值只做一个键的值', () => {
    const zhSrc = 读('src/content/strings.zh.js');
    const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const [k, [zh]] of Object.entries(NEW_KEYS)) {
      const 作为键值 = (zhSrc.match(new RegExp("^  [a-z0-9_]+: '" + esc(zh) + "',$", 'gm')) || []).length;
      expect(作为键值, k + ' 的中文值被第二个键使用').toBe(1);
    }
  });

  it('新键不孤儿：11 个模板键在 StoryWeaponSkills.js 里，5 个效果名键在 skillTrees.js 的映射表里', () => {
    const src = 读('src/game/StoryWeaponSkills.js');
    for (const k of Object.keys(TEMPLATE_KEYS)) expect(src, k + ' 建了键没人用').toContain(k);
    const st = 读('src/content/skillTrees.js');
    for (const k of Object.keys(LABEL_KEYS)) expect(st, k + ' 建了键没人用').toContain(k);
  });
});

/* ------------------------------------------------------------------
 * ③ 静态腿
 * ------------------------------------------------------------------ */

describe('③ 静态腿：调用点锚定、复用不新开、文件中文字面量清零', () => {
  const SWS = 读('src/game/StoryWeaponSkills.js');

  it('11 个模板键各有一个 t() 调用点', () => {
    for (const k of Object.keys(TEMPLATE_KEYS)) {
      expect(SWS, k + ' 没有调用点').toContain("t('" + k + "'");
    }
  });

  it('5 个效果名键不走 t() 字面量：它们住在映射表里，由 effectLabel 展开', () => {
    for (const k of Object.keys(LABEL_KEYS)) {
      expect(SWS, k + ' 不该以 t() 字面量出现').not.toContain("t('" + k + "'");
    }
    expect(SWS).toContain('const key = SKILL_EFFECT_LABEL_KEYS[effect];');
  });

  it('章节与 Boss 两条复用旧键，没有为它们新开格子', () => {
    expect(SWS).toContain("t('upgrade_skill_lock_chapter_fmt', { chapter: lock.chapter })");
    expect(SWS).toContain("return t('upgrade_skill_lock_boss');");
    expect(ZH_KEYS).not.toContain('skill_lock_chapter');
    expect(ZH_KEYS).not.toContain('skill_lock_boss');
  });

  it('import 走 engine/i18n（game 层允许向上够 engine）', () => {
    expect(SWS).toContain("import { t } from '../engine/i18n.js';");
  });

  it('StoryWeaponSkills.js 里再无中文字面量（注释里的中文不算文案）', () => {
    expect(中文字面量(SWS)).toEqual([]);
  });

  it('UpgradePanel 的显示路径没动：lock 原样进 <em class="skill-lock">', () => {
    expect(读('src/ui/UpgradePanel.js')).toContain('<em class="skill-lock">');
  });
});

/* ------------------------------------------------------------------
 * ④ 行为腿（zh）
 * ------------------------------------------------------------------ */

describe('④ 行为腿（zh）：14 种 lock 形状逐字节等于改后中文', () => {
  for (const c of LOCK_CASES) {
    it(c.why + '：' + c.id, () => {
      expect(getStoryLockReason(game(c.patch), c.id)).toBe(c.zh);
    });
  }

  it('全都满足时返回 null（没有东西拦着）', () => {
    expect(getStoryLockReason(game(), 'm-transform')).toBeNull();
    expect(getStoryLockReason(game(), 's-apotheosis')).toBeNull();
  });
});

/* ------------------------------------------------------------------
 * ⑤ 行为腿（en）
 * ------------------------------------------------------------------ */

describe('⑤ 行为腿（en）：同一批读数英文播出', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  for (const c of LOCK_CASES) {
    it(c.why + '：' + c.id, () => {
      expect(getStoryLockReason(game(c.patch), c.id)).toBe(c.en);
    });
  }

  it('英文下也没有 [MISSING:]（键两表都在场）', () => {
    for (const c of LOCK_CASES) {
      expect(getStoryLockReason(game(c.patch), c.id)).not.toContain('[MISSING:');
    }
  });
});

/* ------------------------------------------------------------------
 * ⑥ 反面证据
 * ------------------------------------------------------------------ */

describe('⑥ 反面证据：尺子自证', () => {
  it('扫得到的都算文案：字符串 / 模板算，注释不算', () => {
    const 假源码 = [
      "const a = '字';",
      '// 行注释里的字不算',
      '/* 块注释里的字也不算 */',
      'const b = `模板 ${x} 结尾`;',
    ].join('\n');
    expect(中文字面量(假源码)).toEqual(["'字'", '`模板  结尾`']);
  });
});

/* ------------------------------------------------------------------
 * ⑦ 解析腿（W-D2 切片45）：id → 显示名
 * ------------------------------------------------------------------ */

describe('⑦ 解析腿：四族 id 翻成显示名，翻不出来原样退回', () => {
  beforeEach(() => {
    setLanguage('zh');
  });

  it('SKILL_EFFECT_LABEL_KEYS 与 SKILL_EFFECT_KEYS 双向对齐（一种效果一句人话）', () => {
    expect(Object.keys(SKILL_EFFECT_LABEL_KEYS).sort()).toEqual([...SKILL_EFFECT_KEYS].sort());
  });

  it('映射表每一格的值都在中英两表登记（缺一个 = 锁因里出 [MISSING:]）', () => {
    for (const [effect, key] of Object.entries(SKILL_EFFECT_LABEL_KEYS)) {
      expect(ZH_KEYS, effect + ' → ' + key + ' 中文表没登记').toContain(key);
      expect(EN_KEYS, effect + ' → ' + key + ' 英文表没登记').toContain(key);
    }
  });

  it('Boss：名册里的翻显示名，副本 Boss 走守钥者，认不出的原样退回', () => {
    expect(bossLabel('archmagus')).toBe('大奥术师·萨尔林');
    expect(bossLabel('shadow-warden')).toBe('影界守护者');
    expect(bossLabel('dungeon-any')).toBe('迷宫守钥者');
    expect(bossLabel('no-such-boss')).toBe('no-such-boss');
    expect(bossLabel(undefined)).toBe(undefined);
  });

  it('区域：登记过的区翻显示名，认不出的原样退回', () => {
    expect(zoneLabel('void')).toBe('破碎时线');
    expect(zoneLabel('hub')).toBe(STRINGS_ZH.zone_name_hub);
    expect(zoneLabel('nowhere')).toBe('nowhere');
  });

  it('敌人：名册里的翻显示名，名册外（normal / boss）原样退回', () => {
    expect(enemyLabel('elite')).toBe('精英·虚空骑士');
    expect(enemyLabel('soldier')).toBe(STRINGS_ZH.enemy_name_soldier);
    expect(enemyLabel('normal')).toBe('normal');
    expect(enemyLabel('boss')).toBe('boss');
  });

  it('效果：九种效果都翻得出人话，表外效果原样退回', () => {
    for (const [effect, key] of Object.entries(SKILL_EFFECT_LABEL_KEYS)) {
      expect(effectLabel(effect), effect + ' 翻不出来').toBe(STRINGS_ZH[key]);
    }
    expect(effectLabel('no-such-effect')).toBe('no-such-effect');
  });

  it('四条锁因分支真的把解析结果传进了插值（解析了却没用是最常见的假装修）', () => {
    const SWS = 读('src/game/StoryWeaponSkills.js');
    expect(SWS).toContain("type: enemyLabel(type)");
    expect(SWS).toContain("skill: effectLabel(skill)");
    expect(SWS).toContain("boss: bossLabel(bossId)");
    expect(SWS).toContain("zone: zoneLabel(zoneId)");
  });

  it('尺子自证：空串 / 非字符串也走回退，不抛', () => {
    expect(bossLabel('')).toBe('');
    expect(zoneLabel(undefined)).toBe(undefined);
    expect(enemyLabel(undefined)).toBe(undefined);
    expect(effectLabel(null)).toBe(null);
  });
});
