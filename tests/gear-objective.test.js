/**
 * 「装备」步（W-E3 切片17）—— 主线第一次要求玩家**动装备**的那一类段落。
 *
 * ## 这一片要钉住的是三件事
 *
 * ① **判据只有一处**：`objectiveDone(def, stats)` 的 `case 'gear'` ⇒
 *    那一格（`stats.gearSlots`）由 `stats-changed` 推来（`PlayerStats.toJSON()` 里带着 `gear`）
 *    ⇒ **不需要新事件、也不改存档形状**。
 * ② **那一格是**读数**（不落盘）**：`STAT_READINGS` 里有 `gearSlots` ⇒
 *    存档里**没有**这一格 ⇒ 读档后由 `stats-changed` 再推一次（以生产方为准，不抄磁盘）
 *    ⇒ 迁移链那一跳只挪主线下标，不补字段。
 * ③ **槽位写错当场红**：注册表那一格是 `enum`（`GEAR_SLOTS`）⇒ 写一个不存在的槽位名
 *    在开机那一刻就被拦下。
 */
import { describe, it, expect } from 'vitest';
import {
  OBJECTIVE_TYPES, emptyStats, objectiveDone, applyStatEvent, statsToJSON, statsFromJSON, STAT_READINGS,
} from '../src/content/objectives.js';
import { GEAR_SLOTS } from '../src/content/gear.js';
import { MAINLINE } from '../src/content/objectives.js';

const 装备步 = MAINLINE.filter((r) => r.type === 'gear');

describe('① 步型与判据', () => {
  it('`gear` 在步型名单里', () => {
    expect(OBJECTIVE_TYPES).toContain('gear');
  });

  it('主线上的「装备」步引用的槽位都是真槽位', () => {
    expect(装备步.length, '主线一步「装备」都没有').toBeGreaterThan(0);
    for (const row of 装备步) {
      expect(GEAR_SLOTS, `步 "${row.id}" 写了一个不存在的槽位 "${row.gearSlot}"`).toContain(row.gearSlot);
    }
  });

  it('没装备 ⇒ 不算完成；装备了那一格 ⇒ 算完成', () => {
    const row = 装备步[0];
    const stats = emptyStats();
    expect(objectiveDone(row, stats), '还没装备就算完成了').toBe(false);
    applyStatEvent(stats, 'stats-changed', { gear: { [row.gearSlot]: { base: 'ash-charm' } } });
    expect(objectiveDone(row, stats), '装备了却没算完成').toBe(true);
  });

  it('装备的是**别的**槽位 ⇒ 这一格不算完成', () => {
    const row = 装备步[0];
    const 别的槽 = GEAR_SLOTS.find((s) => s !== row.gearSlot);
    const stats = emptyStats();
    applyStatEvent(stats, 'stats-changed', { gear: { [别的槽]: { base: 'ash-charm' } } });
    expect(objectiveDone(row, stats), '装的是别的槽位却算完成了').toBe(false);
  });
});

describe('② 那一格是**读数**（不落盘）', () => {
  it('`gearSlots` 在读数名单里 ⇒ 存档里没有它', () => {
    expect(STAT_READINGS).toContain('gearSlots');
  });

  it('存档往返之后那一格不在盘上（读档后由 `stats-changed` 再推一次）', () => {
    const stats = emptyStats();
    applyStatEvent(stats, 'stats-changed', { gear: { charm: { base: 'ash-charm' } } });
    expect(stats.gearSlots, '读数没被推过来').toEqual(['charm']);
    const 落盘 = statsToJSON(stats);
    expect('gearSlots' in 落盘, '读数落盘了 ⇒ 它就不是读数').toBe(false);
    // 读档：那一格回到空（没有装备就是没有）
    const 读回 = statsFromJSON(落盘);
    expect(读回.gearSlots, '读档后那一格不是空的').toEqual([]);
  });

  it('`stats-changed` 里没有 `gear` 那一格时，读数保持原样（不写成空）', () => {
    const stats = emptyStats();
    applyStatEvent(stats, 'stats-changed', { gear: { charm: { base: 'ash-charm' } } });
    applyStatEvent(stats, 'stats-changed', { level: 3 });
    expect(stats.gearSlots, '一次没有 gear 的推送把读数清空了').toEqual(['charm']);
    expect(stats.level).toBe(3);
  });
});

describe('③ 这一族的判据在**全仓只有一份**', () => {
  it('`objectiveDone` 之外没有第二处装备判据（换句话说：没有地方自己数装备）', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
    const 命中 = [];
    for (const f of walk(join(process.cwd(), 'src'))) {
      if (!f.endsWith('.js')) continue;
      // `content/objectives.js` 是**这一格的主人**（声明 + 推 + 判都在它一处）⇒ 不扫它
      const 相对 = f.slice(process.cwd().length + 1).replace(/\\/g, '/');
      if (相对 === 'src/content/objectives.js') continue;
      // 只看**非注释**代码（注释里提到这一格不算"自己算了一遍"）
      const 代码 = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(/\r?\n/)
        .map((l) => l.replace(/\/\/.*$/, ''))
        .join('\n');
      for (const l of 代码.split('\n')) {
        if (/gearSlots/.test(l)) 命中.push(`${相对}: ${l.trim().slice(0, 90)}`);
      }
    }
    expect(命中, '装备读数在别处被自己算了一遍 ⇒ 判据就有两份').toEqual([]);
  });
});
