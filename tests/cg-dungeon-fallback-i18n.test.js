/**
 * CG 画廊成就 toast 与副本守钥者兜底文案进双表（W-D2 切片40）。
 *
 * ## 这一片解决什么
 *
 * ① `CgGalleryAchievements` 的两句全收集奖励 toast（`CG 收集过半 · +10 魂火` /
 * `CG 全收集！· +30 魂火`）是裸中文字面量 —— 英文玩家拿到全收集奖励时看到中文。
 * ② `DungeonManager._spawnRoomEnemies` 的 Boss 开场对话框兜底（`迷宫守钥者` /
 * `击败守钥者以打开出口。`）同样是裸中文 —— 九座副本里四座的 id 不在 `BOSS_LORE`
 * 里，走的就是这条兜底，英文玩家进那四座副本看到的是中文开场白。
 *
 * ## 机制
 *
 * 成就 toast 改 `t(键, { souls })`（魂火数从调用点的常量进参数，不焊死在文案里）；
 * 守钥者兜底名复用既有键 `boss_name_dungeon_warden`（值就是「迷宫守钥者」，
 * `bossRoster.bossNameKeyOf` 同款，不新开第二枚同文键），兜底正文新开
 * `dungeon_boss_fallback_text`。有 `BOSS_LORE` 条目的五座副本走的仍是原键化路径。
 *
 * ## 用例分六层
 * ① 钉文案腿：3 个新键 + 1 枚复用键的中英原值逐字钉死；
 * ② 键登记腿：3 键两表都在场，键数 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415，不孤儿、复用不新开、同文案最多两键；
 * ③ 静态腿：CgGalleryAchievements.js 与 DungeonManager.js 的中文字面量清零；
 * ④ 行为腿（zh）：真跑 cg-unlocked 全收集两档 + 九座副本逐一进场抓 dialog.show；
 * ⑤ 行为腿（en）：同两条链路英文播出，不夹 [MISSING:] 与键名；
 * ⑥ 反面证据：尺子自证 + 插值双腿 + 无参时模板原样返回。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CgGalleryAchievements } from '../src/game/CgGalleryAchievements.js';
import { DungeonManager } from '../src/world/DungeonManager.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { BOSS_LORE } from '../src/game/LoreFragments.js';
import { emit } from '../src/engine/EventBus.js';
import { makeManager, makeScene, installWindowShim } from './helpers/enemyHarness.js';
import { keyText } from '../src/ui/keyHints.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { setLanguage, t } from '../src/engine/i18n.js';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');

/** 3 个新键：键 → [中文原值, 英文原值] */
const NEW_KEYS = {
  cg_achieve_half_fmt: ['CG 收集过半 · +${souls} 魂火', 'CG collection halfway · +${souls} soulfire'],
  cg_achieve_full_fmt: ['CG 全收集！· +${souls} 魂火', 'CG gallery complete! · +${souls} soulfire'],
  dungeon_boss_fallback_text: ['击败守钥者以打开出口。', 'Defeat the keykeeper to open the exit.'],
};

/** 复用的既有键（不新开同文键）：键 → [中文原值, 英文原值] */
const REUSED = {
  boss_name_dungeon_warden: ['迷宫守钥者', 'Maze Keywarden'],
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
 * 环境桩
 * ------------------------------------------------------------------ */

beforeAll(() => {
  installWindowShim();
});

beforeEach(() => {
  setLanguage('zh');
});

/** 成就侧最小宿主：toast / addSouls 记账，cgGallery 的 percent 可调 */
function makeAchHost(percent) {
  const host = {
    toasts: [],
    soulsAdded: [],
    cgGallery: { getStats: () => ({ percent }) },
    stats: { addSouls(n) { host.soulsAdded.push(n); } },
    dialog: { toast(msg) { host.toasts.push(msg); } },
  };
  return host;
}

/**
 * 九座副本逐一进场，把每座 **Boss 开场对话框**的 (标题, 正文) 收回来。
 *
 * 每座副本会弹两次 dialog：先进副本名（enter 的那句），再是守钥者开场 —— 
 *  Boss 开场永远在后（出生发生在进场之后），取每座的最后一条。
 */
function collectBossDialogs() {
  const perDungeon = [];
  const dm = new DungeonManager(makeScene(), { getGroundHeight: () => 0 },
    { show(title, text) { perDungeon[perDungeon.length - 1].push({ title, text }); }, toast() {} },
    makeManager(), null);
  const player = { position: new THREE.Vector3(), teleport(x, y, z) { this.position.set(x, y, z); } };
  for (const def of DUNGEON_DEFS) {
    perDungeon.push([]);
    const dungeon = dm.dungeons.get(def.id);
    dm.enter(dungeon, player);
    const arena = dungeon.layout.rooms.find((r) => r.isBossArena);
    player.teleport(def.origin.x + arena.x, 0, def.origin.z + arena.z);
    dm.updatePlayerRoom(player.position);
    dm.abandonRun();
  }
  dm.dispose?.();
  return perDungeon.map((list) => list[list.length - 1]);
}
/* ------------------------------------------------------------------ *
 * ① 钉文案腿
 * ------------------------------------------------------------------ */

describe('① 钉文案腿：3 个新键 + 1 枚复用键的中英原值逐字钉死', () => {
  it('3 个新键', () => {
    for (const [key, [zh, en]] of Object.entries(NEW_KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('复用键 boss_name_dungeon_warden 原值未动（兜底名与名册同源）', () => {
    for (const [key, [zh, en]] of Object.entries(REUSED)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('fmt 键中英占位符一致（souls）', () => {
    for (const key of Object.keys(NEW_KEYS)) {
      const 占位 = (s) => [...s.matchAll(/\$\{(\w+)(?:\|[^}]*)?\}/g)].map((m) => m[1]).sort();
      expect(占位(STRINGS_EN[key]), `${key} 中英占位符不一致`).toEqual(占位(STRINGS_ZH[key]));
    }
  });
});

/* ------------------------------------------------------------------ *
 * ② 键登记腿
 * ------------------------------------------------------------------ */

describe('② 键登记：3 个新键两表都在场，键数 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415', () => {
  it('3 个新键中英两表一个不缺', () => {
    const zh = new Set(ZH_KEYS);
    const en = new Set(EN_KEYS);
    for (const key of Object.keys(NEW_KEYS)) {
      expect(zh.has(key), `中文表缺 ${key}`).toBe(true);
      expect(en.has(key), `英文表缺 ${key}`).toBe(true);
    }
  });

  it('键数 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415，两表逐键对齐', () => {
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
    expect(ZH_KEYS.length, '键数不是 2415 —— 双表被别处改过').toBe(2415);
  });

  it('新键不孤儿：cg_achieve_* 在 CgGalleryAchievements.js、dungeon_boss_fallback_text 在 DungeonManager.js', () => {
    const cga = 读('src/game/CgGalleryAchievements.js');
    const dm = 读('src/world/DungeonManager.js');
    for (const key of Object.keys(NEW_KEYS)) {
      const home = key.startsWith('cg_achieve_') ? cga : dm;
      expect(home.includes(key), `${key} 建了却没人引用（死键）`).toBe(true);
    }
  });

  it('兜底名复用而非新开：DungeonManager 引用 boss_name_dungeon_warden，双表里该文案不超过两键', () => {
    expect(读('src/world/DungeonManager.js')).toContain("t('boss_name_dungeon_warden')");
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of [...Object.keys(NEW_KEYS), ...Object.keys(REUSED)]) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * ③ 静态腿
 * ------------------------------------------------------------------ */

describe('③ 静态腿：两个源文件的中文字面量清零', () => {
  it('CgGalleryAchievements.js 中文字面量清零', () => {
    expect(中文字面量(读('src/game/CgGalleryAchievements.js'))).toEqual([]);
  });

  it('DungeonManager.js 中文字面量清零（残留只有「守钥者 / 进入语」等标识符与注释）', () => {
    expect(中文字面量(读('src/world/DungeonManager.js'))).toEqual([]);
  });
});
/* ------------------------------------------------------------------ *
 * ④ 行为腿（中文）
 * ------------------------------------------------------------------ */

describe('④ 行为腿（zh）：成就 toast 与守钥者兜底对话框都是展开句', () => {
  it('CG 收集过半：toast 中文原句 + 正好发 10 魂火', () => {
    const host = makeAchHost(50);
    const ach = new CgGalleryAchievements(host);
    emit('cg-unlocked');
    expect(host.toasts).toEqual(['CG 收集过半 · +10 魂火']);
    expect(host.soulsAdded).toEqual([10]);
    ach.dispose();
  });

  it('CG 全收集：过半与全收两档一起触发（percent 100 同时满足两档）', () => {
    const host = makeAchHost(100);
    const ach = new CgGalleryAchievements(host);
    emit('cg-unlocked');
    expect(host.toasts).toEqual(['CG 收集过半 · +10 魂火', 'CG 全收集！· +30 魂火']);
    expect(host.soulsAdded).toEqual([10, 30]);
    ach.dispose();
  });

  it('每档只发一次（重复解锁不重复到账）', () => {
    const host = makeAchHost(100);
    const ach = new CgGalleryAchievements(host);
    emit('cg-unlocked');
    emit('cg-unlocked');
    expect(host.soulsAdded).toEqual([10, 30]);
    expect(host.toasts).toEqual(['CG 收集过半 · +10 魂火', 'CG 全收集！· +30 魂火']);
    ach.dispose();
  });

  it('九座副本逐一进场：五座走 BOSS_LORE 键化路径，四座走守钥者兜底', () => {
    const dialogs = collectBossDialogs();
    expect(dialogs.length, '九座副本应有九场 Boss 开场').toBe(DUNGEON_DEFS.length);
    const 有Lore的 = DUNGEON_DEFS.filter((d) => BOSS_LORE[d.id]);
    const 没Lore的 = DUNGEON_DEFS.filter((d) => !BOSS_LORE[d.id]);
    expect(有Lore的.length, 'BOSS_LORE 覆盖的副本数变了').toBe(5);
    expect(没Lore的.length, '走兜底的副本数变了').toBe(4);
    DUNGEON_DEFS.forEach((def, i) => {
      const lore = BOSS_LORE[def.id];
      if (lore) {
        expect(dialogs[i].title, `${def.id} 应走 BOSS_LORE 标题键`).toBe(keyText(t(lore.title)));
        expect(dialogs[i].text, `${def.id} 应走 BOSS_LORE 正文键`).toBe(keyText(t(lore.text)));
      } else {
        expect(dialogs[i].title, `${def.id} 应走守钥者兜底名`).toBe('迷宫守钥者');
        expect(dialogs[i].text, `${def.id} 应走守钥者兜底正文`).toBe('击败守钥者以打开出口。');
      }
    });
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ 行为腿（英文）
 * ------------------------------------------------------------------ */

describe('⑤ 行为腿（en）：同两条链路英文播出，不夹 [MISSING:] 与键名', () => {
  it('成就 toast 全英文', () => {
    setLanguage('en');
    const host = makeAchHost(100);
    const ach = new CgGalleryAchievements(host);
    emit('cg-unlocked');
    expect(host.toasts).toEqual(['CG collection halfway · +10 soulfire', 'CG gallery complete! · +30 soulfire']);
    ach.dispose();
  });

  it('守钥者兜底对话框全英文（有 Lore 的五座也一起换语言）', () => {
    setLanguage('en');
    const dialogs = collectBossDialogs();
    DUNGEON_DEFS.forEach((def, i) => {
      const lore = BOSS_LORE[def.id];
      if (lore) {
        expect(dialogs[i].title, `${def.id} 英文应走 BOSS_LORE 标题键`).toBe(keyText(t(lore.title)));
        expect(dialogs[i].text, `${def.id} 英文应走 BOSS_LORE 正文键`).toBe(keyText(t(lore.text)));
      } else {
        expect(dialogs[i].title, `${def.id} 英文兜底名`).toBe('Maze Keywarden');
        expect(dialogs[i].text, `${def.id} 英文兜底正文`).toBe('Defeat the keykeeper to open the exit.');
      }
      for (const v of [dialogs[i].title, dialogs[i].text]) {
        expect(v).not.toContain('[MISSING:');
        expect(v).not.toMatch(/[\u4e00-\u9fff]/);
      }
    });
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

  it('插值双腿：两句成就 toast 的 souls 中英两语落位', () => {
    setLanguage('zh');
    expect(t('cg_achieve_half_fmt', { souls: 10 })).toBe('CG 收集过半 · +10 魂火');
    expect(t('cg_achieve_full_fmt', { souls: 30 })).toBe('CG 全收集！· +30 魂火');
    setLanguage('en');
    expect(t('cg_achieve_half_fmt', { souls: 10 })).toBe('CG collection halfway · +10 soulfire');
    expect(t('cg_achieve_full_fmt', { souls: 30 })).toBe('CG gallery complete! · +30 soulfire');
    setLanguage('zh');
  });

  it('无参时模板原样返回（t 的既定行为：漏传参数会原样漏出 ${...}，所以调用点必须带参）', () => {
    setLanguage('zh');
    expect(t('cg_achieve_half_fmt')).toBe('CG 收集过半 · +${souls} 魂火');
    setLanguage('en');
    expect(t('cg_achieve_full_fmt')).toBe('CG gallery complete! · +${souls} soulfire');
    setLanguage('zh');
  });
});