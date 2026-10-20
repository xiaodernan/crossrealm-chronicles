/**
 * 叙事文案的数据层形状（W-D2 切片16c）。
 *
 * ## 为什么要有这一条
 *
 * 叙事文案（lore 碎片 / 副本 Boss 开场 / 章节导语 / 区域钩子 / 副本进入语）
 * 改前**全是裸中文** —— 切到英文语言时它们原样留在中文，而对话框里其它句子
 * 已经是英文：一屏两语，而**没有任何一处会报错**。
 *
 * 这一族（W-B45 / B36 / B119）与"忘加台词"是同一族病：数据与显示分家，
 * 门禁只看"表里有这一条"，回答不了"它是不是玩家会看到的那个字"。
 *
 * 这一条钉住四件事：
 * ① 四张表 + 支撑表的每个文案字段都是**已登记的键**（`t()` 不回 `[MISSING: …]`）；
 * ② **键即身份**：字段值不是文案本身 —— 断言的是"它是键的形状"，不是"它长得像中文"；
 * ③ **抄本绝迹**：`ZONE_STORY_HOOKS` 的 `journal` 只有一处读者
 *    （`game/StoryDirector.js`），改前那里自己手抄了六句 —— 抄本随本片一并删净；
 * ④ **反例控制**：一个没登记的键必须回 `[MISSING: …]`（证明解析路径是活的）。
 */
import { describe, it, expect } from 'vitest';
import { t } from '../src/engine/i18n.js';
import {
  LORE_FRAGMENTS,
  BOSS_LORE,
  CHAPTER_INTROS,
  ZONE_STORY_HOOKS,
  DUNGEON_ENTER_LINES,
  KEYWARDEN_CLEARED,
} from '../src/game/LoreFragments.js';
import { LORE_FRAGMENTS_POP, ZONE_EVENTS_POP } from '../src/content/ambientLore.js';

describe('叙事文案的数据层形状（W-D2 切片16c）', () => {
  it('反例控制：没登记的键必须回 [MISSING: …]（证明解析路径是活的）', () => {
    expect(t('boss_lore_does_not_exist_xyz')).toContain('[MISSING');
  });

  it('lore 碎片：每一段的 title / text 都是已登记的键', () => {
    const 坏 = [];
    for (const [i, l] of LORE_FRAGMENTS.entries()) {
      for (const 字段 of ['title', 'text']) {
        const 展开 = t(l[字段]);
        if (展开.startsWith('[MISSING:')) 坏.push(`LORE_FRAGMENTS[${i}].${字段} = ${l[字段]}`);
      }
    }
    expect(坏.join(' / '), '这些 lore 碎片的键没有登记在双表里 —— 玩家会看到 [MISSING: …]').toBe('');
  });

  it('致敬层 lore 碎片同样只存键（`LORE_FRAGMENTS_POP` 已并进上表）', () => {
    const 坏 = [];
    for (const [i, l] of LORE_FRAGMENTS_POP.entries()) {
      for (const 字段 of ['title', 'text']) {
        const 展开 = t(l[字段]);
        if (展开.startsWith('[MISSING:')) 坏.push(`LORE_FRAGMENTS_POP[${i}].${字段} = ${l[字段]}`);
      }
    }
    expect(坏.join(' / '), '这些致敬层碎片的键没有登记在双表里').toBe('');
  });

  it('副本 Boss 开场 / 章节导语 / 区域钩子 / 副本进入语 / 守钥者收束语：全是已登记的键', () => {
    const 坏 = [];
    for (const [id, v] of Object.entries(BOSS_LORE)) {
      for (const 字段 of ['title', 'text']) {
        if (t(v[字段]).startsWith('[MISSING:')) 坏.push(`BOSS_LORE.${id}.${字段} = ${v[字段]}`);
      }
    }
    for (const [ch, v] of Object.entries(CHAPTER_INTROS)) {
      for (const 字段 of ['title', 'text']) {
        if (t(v[字段]).startsWith('[MISSING:')) 坏.push(`CHAPTER_INTROS.${ch}.${字段} = ${v[字段]}`);
      }
    }
    for (const [zone, v] of Object.entries(ZONE_STORY_HOOKS)) {
      for (const 字段 of ['toast', 'journal']) {
        if (t(v[字段]).startsWith('[MISSING:')) 坏.push(`ZONE_STORY_HOOKS.${zone}.${字段} = ${v[字段]}`);
      }
    }
    for (const [id, key] of Object.entries(DUNGEON_ENTER_LINES)) {
      if (t(key).startsWith('[MISSING:')) 坏.push(`DUNGEON_ENTER_LINES.${id} = ${key}`);
    }
    for (const 字段 of ['title', 'text']) {
      if (t(KEYWARDEN_CLEARED[字段]).startsWith('[MISSING:')) 坏.push(`KEYWARDEN_CLEARED.${字段}`);
    }
    expect(坏.join(' / '), '这些叙事文案的键没有登记在双表里 —— 玩家会看到 [MISSING: …]').toBe('');
  });

  it('区域氛围事件：致敬层那 29 条也都是已登记的键', () => {
    const 坏 = [];
    for (const [zone, list] of Object.entries(ZONE_EVENTS_POP)) {
      for (const [i, e] of list.entries()) {
        if (t(e.text).startsWith('[MISSING:')) 坏.push(`ZONE_EVENTS_POP.${zone}[${i}] = ${e.text}`);
      }
    }
    expect(坏.join(' / '), '这些氛围事件��键没有登记在双表里').toBe('');
  });

  it('键即身份：字段值是键而不是文案本身（不含中文标点/汉字）', () => {
    // 判据不是"长得像不像键"，而是"展开之后是不是另一句话"——
    // 键本身展开后必然是**另一个字符串**（文案），文案本身展开后是**它自己**。
    const 坏 = [];
    const 检查 = (标签, 键) => {
      const 展开 = t(键);
      if (展开 === 键) 坏.push(`${标签} = ${键}`);
    };
    for (const [i, l] of LORE_FRAGMENTS.entries()) {
      检查(`LORE_FRAGMENTS[${i}].title`, l.title);
      检查(`LORE_FRAGMENTS[${i}].text`, l.text);
    }
    for (const [zone, list] of Object.entries(ZONE_EVENTS_POP)) {
      for (const [i, e] of list.entries()) 检查(`ZONE_EVENTS_POP.${zone}[${i}]`, e.text);
    }
    expect(坏.join(' / '), '这些字段存的是文案本身而不是键 —— 换语言时它们不会跟着变').toBe('');
  });

  it('抄本绝迹：区域钩子只有 `ZONE_STORY_HOOKS` 一处真源（StoryDirector 不再手抄）', async () => {
    const { readFileSync } = await import('fs');
    const 源码 = readFileSync(new URL('../src/game/StoryDirector.js', import.meta.url), 'utf8');
    // 改前 StoryDirector 自己抄了六句 journal（逐字等于 ZONE_STORY_HOOKS 的 journal）。
    // 现在它只从那张表读 —— 源码里不许再出现"区域 → 一句中文"的硬编码。
    const 手抄 = [...源码.matchAll(/journal:\s*'([^']*[一-龥][^']*)'/g)].map((m) => m[1]);
    expect(手抄.join(' / '), 'StoryDirector 里又出现了手抄的区域钩子文案 —— 抄本回来了').toBe('');
    // 反向：它必须真的读那张表
    expect(源码, 'StoryDirector 没有读 ZONE_STORY_HOOKS').toContain('ZONE_STORY_HOOKS');
  });
});
