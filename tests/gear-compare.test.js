/**
 * 装备属性行与对比门禁（W-E3 切片62）。
 *
 * 改前装备页只显示"稀有度·名字（词缀名）" —— 玩家看得到"誓约护符（铁誓 · 双牙）"，
 * 却看不到它到底给几点什么，更看不到背包里那件比身上这件强在哪。装备是 ARPG 的
 * 主要成长轴，这一格缺失让"穿哪件"只能靠猜。
 *
 * 这一片只做**读数**：把 `gearMods` 的账翻成一行行属性，并在背包那件上算与同槽
 * 已装备那件的差值。差值用文本符号 `(+1)` / `(-1)`，不靠颜色 —— 色觉档下也读得懂。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GEAR_STATS, GEAR_STAT_LABEL, gearStatLines, gearMods,
} from '../src/content/gear.js';
import { PlayerStats } from '../src/game/PlayerStats.js';
import { UpgradePanel } from '../src/ui/UpgradePanel.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

const 读 = (p) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

describe('装备属性行与对比（W-E3 切片62）', () => {
  it('顺序按 GEAR_STATS：底座 + 词缀一起算，只出非零项', () => {
    const a = { base: 'oath-charm', rarity: 'rare', affixes: ['iron-vow'] };
    expect(gearMods(a)).toEqual({ vigor: 3, endurance: 2 });
    const 行 = gearStatLines(a);
    expect(行.map((l) => l.stat)).toEqual(['vigor', 'endurance']);   // 不是对象键序，是名册序
    expect(行.map((l) => l.value)).toEqual([3, 2]);
    expect(行.every((l) => l.delta === null)).toBe(true);
    expect(行.map((l) => l.label)).toEqual(['活力', '耐力']);
  });

  it('对比：只在一侧出现的属性也要出行（穿上会失去的那一点必须看得见）', () => {
    const 新 = { base: 'oath-charm', rarity: 'rare', affixes: ['iron-vow'] };      // vigor 3 / endurance 2
    const 旧 = { base: 'tide-charm', rarity: 'uncommon', affixes: ['ember-edge'] }; // endurance 1 / strength 1
    const 行 = gearStatLines(新, { against: 旧 });
    expect(行.map((l) => [l.stat, l.value, l.delta])).toEqual([
      ['vigor', 3, 3],
      ['endurance', 2, 1],
      ['strength', 0, -1],
    ]);
    // 两个字面量都没变的那一格：行还在，但差值 0（面板据此不出括号）
    const 同 = { base: 'ash-charm', rarity: 'common', affixes: [] };
    expect(gearStatLines(同, { against: 同 }).map((l) => [l.stat, l.value, l.delta]))
      .toEqual([['vigor', 1, 0]]);
  });

  it('认不出的实例返回空数组，不抛（存档可被手写）', () => {
    for (const bad of [null, undefined, {}, { base: 'nope' }, { base: 'ash-charm' }]) {
      expect(gearStatLines(bad), `${JSON.stringify(bad)} 没返回空数组`).toEqual([]);
    }
  });

  it('属性名与双表对齐：五个属性各有一枚键、两表都有、彼此不重词', () => {
    expect(Object.keys(GEAR_STAT_LABEL).sort()).toEqual([...GEAR_STATS].sort());
    const 键 = GEAR_STATS.map((s) => GEAR_STAT_LABEL[s]);
    expect(new Set(键).size).toBe(键.length);
    for (const k of 键) {
      expect(STRINGS_ZH[k], `中文表缺 ${k}`).toBeTruthy();
      expect(STRINGS_EN[k], `英文表缺 ${k}`).toBeTruthy();
    }
  });

  it('真实账本：PlayerStats 换上之后，背包那件的对比读的是同一个槽', () => {
    const s = new PlayerStats();
    const 身上 = { base: 'ash-charm', rarity: 'common', affixes: [] };        // vigor 1
    const 包里 = { base: 'oath-charm', rarity: 'rare', affixes: ['iron-vow'] }; // vigor 3 / endurance 2
    s.equip('charm', 身上);
    expect(s.bagAdd(包里)).not.toBe(false);
    const 行 = gearStatLines(s.bag[0], { against: s.gear.charm });
    expect(行.map((l) => [l.stat, l.value, l.delta])).toEqual([
      ['vigor', 3, 2],
      ['endurance', 2, 2],
    ]);
  });

  it('面板与样式接线：属性行由 gearStatLines 现算，差值带文本符号', () => {
    const 面板 = 读('src/ui/UpgradePanel.js');
    expect(面板, '面板没有从 gearStatLines 取数').toContain('gearStatLines(inst');
    expect(面板, '背包那件没有按底座找同槽').toContain('baseOf(inst.base)?.slot');
    expect(面板, '差值没有渲染').toContain('gear-delta');
    expect(面板, 'l.delta > 0 ? \'+\' : \'\'').toContain("l.delta > 0 ? '+' : ''");
    expect(面板, '有可对比的装备时没有提示').toContain("t('gear_compare_vs_equipped')");
    const 样式 = 读('src/style.css');
    expect(样式).toContain('.gear-mods {');
    expect(样式).toContain('.gear-delta.down {');
  });
  it('面板真渲染：renderGear 把属性行与差值写进 DOM 字符串（不是只抄了源码形状）', () => {
    const stats = new PlayerStats();
    stats.equip('charm', { base: 'ash-charm', rarity: 'common', affixes: [] });
    stats.bagAdd({ base: 'oath-charm', rarity: 'rare', affixes: ['iron-vow'] });
    const els = {
      'gear-slots': { innerHTML: '', querySelectorAll: () => [] },
      'gear-bag': { innerHTML: '', querySelectorAll: () => [] },
      'gear-bag-count': { textContent: '' },
    };
    const 真 = globalThis.document;
    globalThis.document = { getElementById: (id) => els[id] ?? null };
    try {
      const panel = Object.create(UpgradePanel.prototype);
      panel.game = { stats };
      panel.renderGear();
      expect(els['gear-slots'].innerHTML).toContain('活力 +1');
      expect(els['gear-bag'].innerHTML).toContain('活力 +3');
      expect(els['gear-bag'].innerHTML).toContain('耐力 +2');
      // 差值真的算出来了（漏传 against 时这一条会红）
      expect(els['gear-bag'].innerHTML).toContain('(+2)');
      expect(els['gear-bag-count'].textContent).toBe(`${stats.bagCount}/${stats.bagCapacity}`);
    } finally { globalThis.document = 真; }
  });
});
