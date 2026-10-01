/**
 * `dungeon-` 前缀的唯一真源（W-B1 切片4）。
 *
 * ## 这一片要修的是什么
 *
 * 副本 Boss 的 id 是 `dungeon-<副本 id>` **动态拼**出来的，于是"这个 bossId 是不是副本 Boss"
 * 与"从它反解出副本 id"这两件事，全仓有**四处**要问（音频选曲、故事日志、上下文教学、阶段演出），
 * 而修前每一处都自己写：
 *
 *     if (bossId?.startsWith('dungeon-')) { const dungeonId = bossId.replace('dungeon-', ''); … }
 *
 * —— `BossPhaseDirector` 里那三处还**逐字相同**。加上 `bossRoster.js` 里那个常量，
 * 前缀一共被抄了**五份**。前缀改名（或将来加第二类动态 Boss）时，抄错的那一处不会报错，
 * 只是那座副本的 Boss **静默地**没有开场白 / 阶段台词 / 击破台词 / 自己的 BGM。
 * 与 B36 / B45 / B73 同族：**稳定身份靠人肉复制，而复制错了不报错**。
 *
 * ## 修法
 *
 * 谓词与反向解析都放到**前缀常量所在的那个文件**（`content/bossRoster.js` 出 `isDungeonBossId`、
 * `content/bossDialogue.js` 出 `dungeonIdOf`，两者都只读 `DUNGEON_BOSS_PREFIX`），
 * 四处消费点改成调它们。**"抄错的可能"因此从五处降到零处** —— 这一片买的不是行数，是这件事。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DUNGEON_BOSS_PREFIX, isDungeonBossId, isKnownBossId } from '../src/content/bossRoster.js';
import { dungeonIdOf, getDungeonBossId } from '../src/content/bossDialogue.js';

const SRC = join(process.cwd(), 'src');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.js') ? [full] : [];
  });
}

/** 只剥注释：这里要找的正是**代码里的**字符串字面量，注释里提到它是允许的（那是说明） */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('谓词与反向解析：边界都在这一处说清', () => {
  it('`isDungeonBossId`：认得副本 Boss，不认世界 Boss / 空后缀 / 非字符串', () => {
    expect(isDungeonBossId('dungeon-ruin-crypt')).toBe(true);
    expect(isDungeonBossId('dungeon-')).toBe(false);        // 空后缀不是一座副本
    expect(isDungeonBossId('shadow-warden')).toBe(false);
    expect(isDungeonBossId('')).toBe(false);
    expect(isDungeonBossId(null)).toBe(false);
    expect(isDungeonBossId(undefined)).toBe(false);
    expect(isDungeonBossId(123)).toBe(false);
  });

  it('`dungeonIdOf`：解出副本 id，认不出给 `null`（不是空串）', () => {
    expect(dungeonIdOf('dungeon-ruin-crypt')).toBe('ruin-crypt');
    expect(dungeonIdOf('dungeon-')).toBe(null);
    expect(dungeonIdOf('archmagus')).toBe(null);
    expect(dungeonIdOf(null)).toBe(null);
    expect(dungeonIdOf(123)).toBe(null);
  });

  it('两者一致：`dungeonIdOf` 认出的，`isDungeonBossId` 一定也认', () => {
    for (const id of ['dungeon-a', 'dungeon-', 'x', '', null, 7, 'dungeon-0']) {
      expect(isDungeonBossId(id), String(id)).toBe(dungeonIdOf(id) !== null);
    }
  });

  it('往返：`dungeonIdOf(getDungeonBossId(x))` 回到 x（五座副本 id 各走一遍）', () => {
    for (const id of ['ruin-crypt', 'forbidden-library', 'five-dim-rift', 'forest-shrine', 'hub-catacombs']) {
      expect(dungeonIdOf(getDungeonBossId(id))).toBe(id);
    }
  });

  it('`isKnownBossId` 复用了谓词，没有第二份同样的判断', () => {
    expect(isKnownBossId('dungeon-ruin-crypt')).toBe(true);
    expect(isKnownBossId('dungeon-')).toBe(false);
    expect(isKnownBossId('shadow-warden')).toBe(true);
    const src = stripComments(readFileSync(join(SRC, 'content/bossRoster.js'), 'utf8'));
    // `isKnownBossId` 里不该再出现一份手写的 startsWith 判断
    const fn = src.slice(src.indexOf('export function isKnownBossId'));
    expect(fn).toMatch(/isDungeonBossId\(id\)/);
    expect(fn.slice(0, fn.indexOf('}'))).not.toMatch(/startsWith\(/);
  });
});

describe('真源唯一：代码里不许再出现 `dungeon-` 字面量', () => {
  const LITERAL = /'dungeon-'|"dungeon-"/;

  it('扫描集自证：能扫到 src/ 下的文件（扫不到就会一路绿灯）', () => {
    expect(walk(SRC).length).toBeGreaterThan(100);
  });

  it('除真源文件外，`src/` 里没有一处 `dungeon-` 字面量', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      const rel = file.slice(SRC.length + 1).replace(/\\/g, '/');
      if (rel === 'content/bossRoster.js') continue;      // 真源就在这里，它必须写着那个串
      const code = stripComments(readFileSync(file, 'utf8'));
      if (LITERAL.test(code)) offenders.push(rel);
    }
    expect(offenders, `这些文件又抄了一份前缀：${offenders.join(', ')}`).toEqual([]);
  });

  it('门禁自证：把前缀改成另一个串，真源与谓词一起跟着走（消费点不用动）', () => {
    // 不是去改常量，而是证明"消费点只依赖谓词"：谓词由常量算出，换常量就换行为
    expect(DUNGEON_BOSS_PREFIX).toBe('dungeon-');
    expect(isDungeonBossId(DUNGEON_BOSS_PREFIX + 'x')).toBe(true);
    expect(isDungeonBossId('dungeon-x')).toBe(isDungeonBossId(DUNGEON_BOSS_PREFIX + 'x'));
  });

  it('门禁自证：这条断言不是白过的（塞一份字面量进假源码，正则会命中）', () => {
    expect(LITERAL.test(stripComments("if (id.startsWith('dungeon-')) {}"))).toBe(true);
    expect(LITERAL.test(stripComments("// 说明：以前写的是 startsWith('dungeon-')"))).toBe(false);
  });
});

describe('四个消费点都改用了谓词（接线见证）', () => {
  const SITES = [
    'audio/AudioManager.js',
    'game/StoryJournal.js',
    'ui/ContextualTutorial.js',
    'ui/BossPhaseDirector.js',
  ];

  it('每一处都 import 了 `isDungeonBossId` 或 `dungeonIdOf`，且真的在调', () => {
    for (const rel of SITES) {
      const src = readFileSync(join(SRC, rel), 'utf8');
      expect(src, `${rel} 没 import`).toMatch(/import \{[^}]*(isDungeonBossId|dungeonIdOf)[^}]*\}/);
      expect(src, `${rel} import 了但没调`).toMatch(/(isDungeonBossId|dungeonIdOf)\(/);
    }
  });

  it('阶段演出那三处（开场 / 阶段 / 击破）都走 `dungeonIdOf`', () => {
    const src = stripComments(readFileSync(join(SRC, 'ui/BossPhaseDirector.js'), 'utf8'));
    const calls = src.match(/dungeonIdOf\(/g) ?? [];
    expect(calls.length, '三处应当各调一次').toBe(3);
  });
});
