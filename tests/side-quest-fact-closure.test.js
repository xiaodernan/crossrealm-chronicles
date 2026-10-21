/**
 * 支线判据的事实闭包（W-B3 切片7）—— 支线读的那一格也要有生产者。
 *
 * ## 这一片防的是什么
 *
 * 支线判据是 `check: (game) => boolean`，读的是**活的 `game` 对象**上的事实 ——
 * `g.soulWisps?.collected?.size`、`game.campfireMemory?.getStats()?.zones`。
 * 注册表能核"这条支线在不在名单里"，核不了"**它读的那一格还在不在**"。
 *
 * 症状具体到玩家身上：某个字段被改名 ⇒ `?.` 把 `undefined` 吞掉 ⇒ 判据永远 `false` ⇒
 * **那条支线永远完成不了**，而玩家看到的是进度条上的一个空格，没有任何报错。
 *
 * ## 分工（判据与执行分家）
 *
 * - **判据**（`src/content/sideQuestFacts.js`，纯函数、可在浏览器里跑）：把一段源码里
 *   "从 `game` 上读了哪些事实"抠出来（含**别名**解析与**集合访问器**白名单）。
 * - **执行**（本文件，Node 侧）：读 `src/core/Game.js` 认出每个系统是谁、属主文件是哪一份，
 *   再到属主文件里核那个字段名**真的存在**。
 *
 * ## 为什么属主文件要**逐层**定位
 *
 * 只核"这个名字在全仓 `src/` 里还出现过"太松 —— 别的类里有个同名的字段就会蒙混过关。
 * 真正要核的是"**这个系统**上还有没有这一格"，所以链路是：
 * `game.<系统>` ⇒ `Game` 里 `this.<系统> = new <类>` ⇒ `<类>` 的 import 路径 ⇒ 属主文件。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sideQuestFactsFromSource, FACT_ACCESSORS } from '../src/content/sideQuestFacts.js';
import { SIDE_QUESTS_ALL } from '../src/content/sideQuests.js';
import {
  STAT_EVENTS, STAT_READINGS, BOSS_STAT_KEYS, emptyStats,
} from '../src/content/objectives.js';

const ROOT = process.cwd();
const 读 = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** 剥掉注释与字符串 —— 门禁只看**代码**（注释里提一句字段名不算"那一格还在"） */
const 剥注释 = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const GAME_SRC = 读('src/core/Game.js');
const SQ_SRC = 读('src/content/sideQuests.js');

/** `Game` 上真实存在的子系统：`this.<name> = ... new <Class>(` */
function gameSystems(gameSrc) {
  const out = new Map();
  for (const m of gameSrc.matchAll(
    /this\.([A-Za-z_$][\w$]*)\s*=\s*(?:this\._adopt\([^,]*,\s*)?new\s+([A-Za-z_$][\w$]*)/g,
  )) out.set(m[1], m[2]);
  return out;
}

/** 类名 ⇒ 源文件路径（从 `Game.js` 的 import 语句取 —— 那儿就写着路径） */
function classFiles(gameSrc) {
  const out = new Map();
  for (const m of gameSrc.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    for (const 名 of m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
      if (!out.has(名)) out.set(名, m[2]);
    }
  }
  return out;
}

const 转义 = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 支线判据的事实闭包检查。
 *
 * ## 属主的两种（2026-10-21 加的第二种）
 *
 * 判据读的一格要么是**某个系统自己的字段**（`game.soulWisps.collected` —— 生产者在
 * `SoulWispManager` 那个文件里），要么是**任务账上的那一格**
 * （`game.quests.stats.zoneKills` —— 生产者在**账本的记账表** `content/objectives.js`
 * 的 `STAT_EVENTS` 里，而 `QuestSystem` 只是**持有**那本账：`this.stats = emptyStats()`）。
 *
 * 早先只认第一种 ⇒ 凡是读任务账的支线都被误报成"那一格没人写"。现在按**那一格是不是
 * 账本格**分流：账本格去账本那张表里核（`emptyStats()` 的形状 + `STAT_EVENTS` 的写入），
 * 其余仍在属主文件里核。
 *
 * @param {string} sqSrc 支线判据所在模块的源码
 * @param {string} gameSrc `Game` 的源码
 * @returns {string[]} 错误清单（空数组 = 闭包成立）
 */
function checkSideQuestFacts(sqSrc, gameSrc) {
  const errs = [];
  const 系统 = gameSystems(gameSrc);
  const 类文件 = classFiles(gameSrc);
  const { 根, 事实 } = sideQuestFactsFromSource(sqSrc);
  const 账本格 = new Set(Object.keys(emptyStats()));
  const 账本写入 = 账本生产者();

  for (const r of [...根].sort()) {
    const 类 = 系统.get(r);
    if (!类) {
      errs.push(`支线判据读的系统 "game.${r}" 不在 Game 上 —— 判据永远读到 undefined，`
        + '读它的那条支线永远完成不了');
      continue;
    }
    const rel = 类文件.get(类);
    if (!rel) {
      errs.push(`Game 上的 "game.${r}"（${类}）找不到它的源文件 —— 无法核对它读的那一格`);
      continue;
    }
    const 属主 = 剥注释(读(join('src/core', rel)));
    for (const 叶 of [...(事实.get(r) ?? [])].sort()) {
      if (账本格.has(叶)) {
        // 账本上的那一格：生产者是**账本的记账表**（`content/objectives.js` 的 `STAT_EVENTS`）
        if (!账本写入.has(叶)) {
          errs.push(`支线判据读的账本格 "game.${r}.stats.${叶}" 没有人写 —— `
            + '账本的记账表（`content/objectives.js` 的 `STAT_EVENTS`）里没有它，读它的那条支线永远完成不了');
        }
        continue;
      }
      const re = new RegExp(`(?<![\\w$])${转义(叶)}(?![\\w$])`);
      if (!re.test(属主)) {
        errs.push(`支线判据读的 "game.${r}.${叶}" 在属主 ${类}（${rel}）里找不到 —— `
          + '那一格没人写或已被改名，读它的那条支线永远完成不了');
      }
    }
  }
  return errs;
}

/**
 * 账本上**有人写**的那些格 —— 从记账函数的源码里抠（与 `src/content/questFacts.js`
 * 同一套口径：事实是**推导**出来的，不是手抄一份名单）。
 */
function 账本生产者() {
  const 出 = new Set();
  for (const fn of Object.values(STAT_EVENTS)) {
    for (const m of fn.toString().matchAll(/(?<![\w$.])s\.([A-Za-z_$][\w$]*)/g)) 出.add(m[1]);
  }
  for (const k of Object.values(BOSS_STAT_KEYS)) 出.add(k);
  for (const k of STAT_READINGS) 出.add(k);
  return 出;
}

describe('① 真表闭包成立', () => {
  it('支线判据读的事实都有生产者（系统存在 + 那一格在属主文件里）', () => {
    const errs = checkSideQuestFacts(SQ_SRC, GAME_SRC);
    expect(errs, `支线判据闭包破了：\n${errs.join('\n')}`).toEqual([]);
  });

  it('抠出来的事实不是空集（门禁在空集上恒真 —— 那等于没门禁）', () => {
    const { 根, 事实 } = sideQuestFactsFromSource(SQ_SRC);
    expect(根.size, '一个系统都没抠出来').toBeGreaterThan(5);
    let 叶总数 = 0;
    for (const v of 事实.values()) 叶总数 += v.size;
    expect(叶总数, '一个事实都没抠出来').toBeGreaterThan(10);
  });

  it('集合访问器不算事实（`size` / `has` 是 Set 自带的，不是谁写的字段）', () => {
    const { 事实 } = sideQuestFactsFromSource(SQ_SRC);
    for (const [根, 叶集] of 事实) {
      for (const 叶 of 叶集) {
        expect(FACT_ACCESSORS.has(叶), `"${根}.${叶}" 是集合访问器，不该被算成一个事实`).toBe(false);
      }
    }
  });

  it('别名解析生效了（`const sys = game.popCulture` 之后的 `sys.getEntries` 也要算）', () => {
    const { 事实, 别名 } = sideQuestFactsFromSource(SQ_SRC);
    expect(别名.get('sys'), '别名没解析出来').toBe('popCulture');
    expect(事实.get('popCulture')?.has('getEntries'), '别名上的方法读取漏了').toBe(true);
  });

  it('支线名单本身是完整的一份（门禁核的是这 31 条）', () => {
    expect(SIDE_QUESTS_ALL.length).toBeGreaterThanOrEqual(30);
  });
});

describe('② 门禁会咬：两条变异臂', () => {
  it('变异臂①：把一个事实改名 ⇒ 门禁红，且点名那一格', () => {
    const 变异 = SQ_SRC.replace('collected?.size', 'collectedRenamed?.size');
    expect(变异, '变异没生效 —— 被替换的字符串在源码里不存在').not.toBe(SQ_SRC);
    const errs = checkSideQuestFacts(变异, GAME_SRC);
    expect(errs.length, '门禁没咬住一个改名的字段').toBeGreaterThan(0);
    expect(errs.join('\n')).toMatch(/collectedRenamed/);
  });

  it('变异臂②：把一个系统改名 ⇒ 门禁红，且点名那个系统', () => {
    const 变异 = SQ_SRC.replace('game.popCulture', 'game.popCultureRenamed');
    expect(变异).not.toBe(SQ_SRC);
    const errs = checkSideQuestFacts(变异, GAME_SRC);
    expect(errs.length, '门禁没咬住一个改名的系统').toBeGreaterThan(0);
    expect(errs.join('\n')).toMatch(/popCultureRenamed/);
    expect(errs.join('\n')).toMatch(/不在 Game 上/);
  });

  it('变异臂③：删掉 Game 上的那个系统 ⇒ 门禁红（反向：生产方没了）', () => {
    const 变异 = GAME_SRC.replace(/this\.popCulture\s*=\s*/, 'this.popCultureGone = ');
    expect(变异).not.toBe(GAME_SRC);
    const errs = checkSideQuestFacts(SQ_SRC, 变异);
    expect(errs.length, '门禁没咬住一个被摘掉的系统').toBeGreaterThan(0);
    expect(errs.join('\n')).toMatch(/popCulture/);
  });

  it('变异臂④：账本上那一格没人写 ⇒ 门禁红（账本格那一支）', () => {
    // 账本格（`game.quests.stats.zoneKills`）的生产者在**账本的记账表**里 ——
    // 这一支与"属主文件里找那一格"是两条路，删掉记账函数就是让那一格没人写。
    const 备份 = STAT_EVENTS['enemy-defeated'];
    STAT_EVENTS['enemy-defeated'] = (s, d) => {
      if (d.type !== 'boss') s.kills[d.type] = (s.kills[d.type] ?? 0) + 1;
    };
    try {
      const errs = checkSideQuestFacts(SQ_SRC, GAME_SRC);
      expect(errs.length, '门禁没咬住一个没人写的账本格').toBeGreaterThan(0);
      expect(errs.join('\n')).toMatch(/zoneKills/);
      expect(errs.join('\n')).toMatch(/账本格/);
    } finally {
      STAT_EVENTS['enemy-defeated'] = 备份;
    }
  });
});
