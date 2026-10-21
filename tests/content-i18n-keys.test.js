/**
 * 内容表里的**键字段**必须在中英两表都登记（W-E3 切片10）。
 *
 * ## 为什么要有这道门禁
 *
 * 切片10 往主线里插了三步 ⇒ 顺手加了 9 个文案键 ⇒ **其中 9 个当时根本没写进表**，
 * 而**全套测试一路绿灯** —— 因为既有那道 i18n 门禁只扫两处：
 * `t('…')` 调用与壳页的 `data-i18n` 属性。
 *
 * 而**内容表**（`objectives.js` / `sideQuests.js` / `dungeons.js` / `enemies.js`）里的
 * 键是**字段值**（`title: 'obj_xxx_title'`）—— 既不是 `t()` 调用，也不是 HTML 属性
 * ⇒ **两处都扫不到** ⇒ 缺一个键，玩家的界面上就会出现 `[MISSING: …]`，
 * 而**没有任何一道门禁会红**。
 *
 * ## 口径
 *
 * **显式列出每张表的"键字段"** —— 不靠"长得像键"来猜：内容层里还有 55 个长得像键的
 * 字面量（CG 画廊的 id、遭遇池的 id……），猜的话全是假阳性。
 * 每张表的那些字段的**每一个值**都必须在中英两表里登记 ⇒ 缺一个当场点名。
 */
import { describe, it, expect } from 'vitest';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { OBJECTIVES } from '../src/content/objectives.js';
import { SIDE_QUESTS_ALL } from '../src/content/sideQuests.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { ENEMY_ROSTER } from '../src/content/enemies.js';

const ZH = new Set(ZH_KEYS);
const EN = new Set(EN_KEYS);

/** 内容表 → 那些字段的值是 i18n 键 */
const 表 = [
  {
    名: 'OBJECTIVES（主线目标）',
    行: OBJECTIVES,
    字段: ['title', 'desc', 'journal'],
    嵌套: ['waypoint.label'],
  },
  { 名: 'SIDE_QUESTS_ALL（支线）', 行: SIDE_QUESTS_ALL, 字段: ['title', 'desc', 'journal'] },
  { 名: 'DUNGEON_DEFS（副本）', 行: DUNGEON_DEFS, 字段: ['name', 'mapLabel'] },
  { 名: 'ENEMY_ROSTER（敌人名册）', 行: Object.values(ENEMY_ROSTER), 字段: ['name'] },
];

/** 取一行里那些字段的值（`waypoint.label` 这种嵌套路径也认） */
function 键值(行, 路径) {
  if (!路径.includes('.')) return 行?.[路径];
  let v = 行;
  for (const 段 of 路径.split('.')) {
    if (v === null || v === undefined) return undefined;
    v = v[段];
  }
  return v;
}

/** 一张表里所有"该登记却没登记"的键（逐条点名） */
function 未登记的(行们, 字段, 嵌套 = []) {
  const 缺 = [];
  for (const 行 of 行们) {
    for (const f of [...字段, ...嵌套]) {
      const v = 键值(行, f);
      if (typeof v !== 'string' || v === '') continue;
      if (!ZH.has(v)) 缺.push(`中文表没有 "${v}"（${f}）`);
      if (!EN.has(v)) 缺.push(`英文表没有 "${v}"（${f}）`);
    }
  }
  return [...new Set(缺)];
}

describe('① 内容表里的键字段都登记在表里', () => {
  for (const t of 表) {
    it(`${t.名}：每个键字段的值都在中英两表里（缺一个 = 玩家界面出现 [MISSING: ]）`, () => {
      const 缺 = 未登记的(t.行, t.字段, t.嵌套 ?? []);
      expect(缺, `${t.名} 里有键没登记`).toEqual([]);
    });
  }
});

describe('② 这道门禁会咬（反向控制）', () => {
  it('混一个假键进去，门禁必须点名它（防"扫描永远返回空"）', () => {
    const 假的行 = [{ id: 'x', title: 'obj_根本不存在_xyz', desc: 'obj_也不存在_abc', journal: 'obj_更不存在_def' }];
    const 缺 = 未登记的(假的行, ['title', 'desc', 'journal']);
    expect(缺.length, '假键没被点名').toBe(6);
    expect(缺.some((l) => l.includes('obj_根本不存在_xyz'))).toBe(true);
    expect(缺.some((l) => l.includes('英文表没有'))).toBe(true);
  });

  it('真表上跑一遍是空的（反向控制的对照组：不是"扫描恒红"）', () => {
    expect(未登记的(OBJECTIVES, ['title', 'desc', 'journal'], ['waypoint.label'])).toEqual([]);
  });
});

describe('③ 两张表逐键对齐（键字段这一层）', () => {
  it('中文表与英文表的键名集合完全一致', () => {
    const 只在中文 = [...ZH].filter((k) => !EN.has(k));
    const 只在英文 = [...EN].filter((k) => !ZH.has(k));
    expect(只在中文, '这些键只在中文表里').toEqual([]);
    expect(只在英文, '这些键只在英文表里').toEqual([]);
  });

  it('两张表的键集合大小一致（防空转）', () => {
    expect(ZH.size).toBeGreaterThan(500);
    expect(ZH.size).toBe(EN.size);
  });

  it('两张表里都没有空串（空文案 = 界面上那一格是空的）', () => {
    const 中文空 = [...ZH].filter((k) => typeof STRINGS_ZH[k] !== 'string' || STRINGS_ZH[k].trim() === '');
    expect(中文空, '这些键的中文文案是空的').toEqual([]);
    const 英文空 = [...EN].filter((k) => typeof STRINGS_EN[k] !== 'string' || STRINGS_EN[k].trim() === '');
    expect(英文空, '这些键的英文文案是空的').toEqual([]);
  });
});
