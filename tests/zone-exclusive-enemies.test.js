/**
 * 主线与**位面独占敌人**的覆盖（W-E3 切片21）。
 *
 * ## 这一片补的是什么
 *
 * 位面有自己的**独占敌人**（带位面前缀的那种：`gloom_*` / `radiant_*`）——
 * 它们是那位面的身份：幽暗林地的迷雾与哨卫、圣域的金甲与灼场。
 *
 * 而主线走完一整段故事时，**那些身份一个都没露**：
 * 幽暗林地只走了守夜人（`gloom_warden`）⇒ 怨影 / 掠行兽 / 哨卫都只在野外与副本里；
 * 圣域只走了爬兽（`radiant_crawler`）⇒ 骑士 / 舞者 / 圣印者同样只在野外与副本里。
 *
 * ⇒ 这一片把**每一位面带前缀的独占敌人**都接进主线（各三步"清剿"），
 * 并用这道门禁钉住：**前缀独占敌人少一类 ⇒ 门禁当场红**。
 *
 * ## 口径
 *
 * **"位面独占"= 敌人 id 带位面前缀**（`gloom_` / `radiant_`）——
 * 不靠"哪一区产的"去反推（那是几何反推，位面半径大幅重叠 ⇒ 反推不可靠），
 * 也不靠手抄名单（那正是"两份真相"）⇒ **从敌人名册的前缀直接推**。
 */
import { describe, it, expect } from 'vitest';
import { MAINLINE } from '../src/content/objectives.js';
import { ENEMY_ROSTER } from '../src/content/enemies.js';

/** 带前缀的位面独占敌人（`gloom_*` / `radiant_*`） */
const 独占 = Object.keys(ENEMY_ROSTER).filter((id) => /^(gloom|radiant)_/.test(id));

describe('① 位面独占敌人全部进了主线', () => {
  it('名册里确实有这一族（口径没空转）', () => {
    expect(独占.length, '名册里没有带位面前缀的独占敌人 ⇒ 口径本身失效了').toBeGreaterThan(4);
  });

  it('每一类独占敌人，主线都有一步在清它', () => {
    const 主线清的 = new Set(MAINLINE.map((r) => r.enemyType).filter(Boolean));
    const 漏的 = 独占.filter((id) => !主线清的.has(id));
    expect(漏的, '这些位面独占敌人主线一步都没清 ⇒ 那位面的身份在主线里露不出来').toEqual([]);
  });

  it('主线指向的每一种独占敌人，都有一步是**清剿**（不是别的段落）', () => {
    for (const row of MAINLINE) {
      if (!row.enemyType || !独占.includes(row.enemyType)) continue;
      expect(row.type, `步 "${row.id}" 清的是位面独占敌人，却不是清剿步`).toBe('kills');
      expect(row.target, `步 "${row.id}" 的清剿数量不是正数`).toBeGreaterThan(0);
      expect(row.chapter, `步 "${row.id}" 没有标章节`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('② 主线的每一步都指得到真的敌人', () => {
  it('主线清的那些敌人都在名册里（写错一个字母 ⇒ 那一步永远打不完）', () => {
    const 名册 = Object.keys(ENEMY_ROSTER);
    const 认不出的 = MAINLINE.map((r) => r.enemyType).filter(Boolean).filter((id) => !名册.includes(id));
    expect(认不出的).toEqual([]);
  });

  it('主线清的每一种敌人都真的**存在**（不是"清一遍不会遇到的东西"）', () => {
    // 独占敌人必须在**野外出生点**里（副本里出现的不算数 —— 主线清剿步指的路点是野外）
    const 出生 = readFileSync('src/content/enemySpawns.js', 'utf8');
    for (const id of 独占) {
      expect(出生, `${id} 在野外没有任何出生点 ⇒ 主线那一步无处可打`).toContain(`type: '${id}'`);
    }
  });
});

import { readFileSync } from 'node:fs';
