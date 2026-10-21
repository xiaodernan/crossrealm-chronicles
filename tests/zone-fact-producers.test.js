/**
 * 位面事实闭包 —— 分区支线读的那四样，各自在**那一座区**里有没有生产者（W-B12 切片5）。
 *
 * ## 这一片防的是什么
 *
 * 分区支线（`side-zone-<区>` / `side-wisp-<区>`）的判据只读四样位面事实，
 * 而这四样的生产者分住在四张表里（萤火 / 营火 / 火牌 / 门口插画）。
 * **上一层的闭包**（W-B3 切片6/7）核的是"判据读的那一格**还在不在**"，
 * 这一层核的是更靠下的一格：**"那一格在这一座区里有没有人写"**。
 *
 * ## 病根（这一片实测出来的，不是推出来的）
 *
 * 漂浮魂火出生点表原先住在 `world/SoulWispManager.js`（**纯数据写在逻辑文件里**），
 * 而它**只有 hub / fantasy / magic / space / void / abyss 六档** ——
 * **gloom 与 radiant 一枚都没有**（那两座区是 W-B9 切片1 后加的，萤火表没跟着长）。
 * 分区支线却覆盖全部七座真实位面，于是 `side-wisp-gloom` 与 `side-wisp-radiant`
 * 的判据（`soulWisps.collectedInZone(zone) >= 2`）**永远是 0 >= 2** ——
 * 玩家看到进度条上**两个永远填不满的空格**，而没有任何报错、没有任何日志。
 *
 * 表搬进内容层之后，这件事才**可查** —— 这一层就是查它的那道门。
 */
import { describe, it, expect } from 'vitest';
import { WISP_SPOTS } from '../src/content/wispSpots.js';
import { checkZoneFactProducers, WISPS_PER_ZONE } from '../src/content/zoneFacts.js';
import { SIDE_QUESTS_ZONE } from '../src/content/sideQuests.js';
import { REST_POINT_NAMES } from '../src/content/restPointNames.js';
import { REST_DIALOGUE_CG } from '../src/content/dialogueCgPresets.js';
import { ZONE_IDS, ZONE_ORDER } from '../src/content/ZoneIdentity.js';
import { SoulWispManager } from '../src/world/SoulWispManager.js';
import { checkContent } from '../src/content/registry.js';
import { installWindowShim } from './helpers/enemyHarness.js';

describe('① 真表闭包成立', () => {
  it('凡有分区支线的位面，四样事实都有生产者', () => {
    const errs = checkZoneFactProducers();
    expect(errs, `位面事实闭包破了：\n${errs.join('\n')}`).toEqual([]);
  });

  it('注册表真的接上了这道闭包（不是只被那条用例自己调用）', () => {
    const errs = checkContent().filter((e) => /漂浮魂火|没有营火|:start/.test(e));
    expect(errs, `注册表没接上位面事实闭包：\n${errs.join('\n')}`).toEqual([]);
  });

  it('每位面的萤火都够"收齐两枚"（分区支线的硬门槛）', () => {
    const 位面 = [...new Set(SIDE_QUESTS_ZONE.map((q) => q.zone))];
    expect(位面.length, '分区支线一位面都没覆盖').toBe(ZONE_ORDER.length);
    for (const zone of 位面) {
      const n = WISP_SPOTS.filter((s) => s.zone === zone).length;
      expect(n, `位面 "${zone}" 只有 ${n} 枚萤火 —— "拾遗一座"要收齐 ${WISPS_PER_ZONE} 枚`).toBeGreaterThanOrEqual(WISPS_PER_ZONE);
    }
  });
});

describe('② 回归证据：gloom / radiant 那两条支线现在做得完', () => {
  /** 造一个真的 `SoulWispManager`（走真出生点表） */
  const 造魂火管理器 = () => {
    installWindowShim();
    return new SoulWispManager(
      { add: () => {} }, { getGroundHeight: () => 0 }, { addSouls: () => {} }, { toast: () => {} }, {},
    );
  };

  it('gloom 与 radiant 各有 ≥2 枚萤火（改前各 0 枚 ⇒ 那两条支线永远做不完）', () => {
    for (const zone of [ZONE_IDS.GLOOM, ZONE_IDS.RADIANT]) {
      const n = WISP_SPOTS.filter((s) => s.zone === zone).length;
      expect(n, `位面 "${zone}" 的萤火还是 ${n} 枚 —— 那条支线仍然永远做不完`).toBeGreaterThanOrEqual(WISPS_PER_ZONE);
    }
  });

  it('端到端：把那两枚收进存档后，"拾遗一座"的那一格真的够两枚', () => {
    const mgr = 造魂火管理器();
    const ids = WISP_SPOTS.filter((s) => s.zone === ZONE_IDS.GLOOM).map((s) => s.id);
    expect(ids.length).toBeGreaterThanOrEqual(WISPS_PER_ZONE);
    mgr.fromJSON(ids);
    expect(mgr.collectedInZone(ZONE_IDS.GLOOM), 'gloom 收齐两枚后那一格仍是 0')
      .toBeGreaterThanOrEqual(WISPS_PER_ZONE);
    // radiant 同理
    const mgr2 = 造魂火管理器();
    const ids2 = WISP_SPOTS.filter((s) => s.zone === ZONE_IDS.RADIANT).map((s) => s.id);
    mgr2.fromJSON(ids2);
    expect(mgr2.collectedInZone(ZONE_IDS.RADIANT)).toBeGreaterThanOrEqual(WISPS_PER_ZONE);
  });
});

describe('③ 门禁会咬：三条变异臂', () => {
  it('变异臂①：某一位面少一枚萤火 ⇒ 门禁红，并点名那位面', () => {
    const 少一枚 = WISP_SPOTS.filter((s) => s.id !== 'wisp-gloom2');
    const errs = checkZoneFactProducers(SIDE_QUESTS_ZONE, { 萤火表: 少一枚 });
    expect(errs.length, '门禁没咬住"那位面只剩一枚萤火"').toBeGreaterThan(0);
    expect(errs.join('\n')).toMatch(/gloom/);
    expect(errs.join('\n')).toMatch(/只有 1 枚漂浮魂火/);
  });

  it('变异臂②：某一位面的营火不在 ⇒ 门禁红，并点名那位面', () => {
    const 少营火 = { ...REST_POINT_NAMES };
    delete 少营火[ZONE_IDS.RADIANT];
    const errs = checkZoneFactProducers(SIDE_QUESTS_ZONE, { 营火表: 少营火 });
    expect(errs.length, '门禁没咬住"那位面没有营火"').toBeGreaterThan(0);
    expect(errs.join('\n')).toMatch(/radiant/);
    expect(errs.join('\n')).toMatch(/没有营火/);
  });

  it('变异臂③：某一位面的门口插画不在 ⇒ 门禁红，并点名那位面', () => {
    const 少插画 = { ...REST_DIALOGUE_CG };
    delete 少插画[`${ZONE_IDS.GLOOM}:start`];
    const errs = checkZoneFactProducers(SIDE_QUESTS_ZONE, { 插画表: 少插画 });
    expect(errs.length, '门禁没咬住"那位面没有门口插画"').toBeGreaterThan(0);
    expect(errs.join('\n')).toMatch(/gloom/);
    expect(errs.join('\n')).toMatch(/:start/);
  });

  it('变异臂④：把整张萤火表清空 ⇒ 七座位面全被点名（不是只报第一个）', () => {
    const errs = checkZoneFactProducers(SIDE_QUESTS_ZONE, { 萤火表: [] });
    const 点名 = errs.filter((e) => e.includes('漂浮魂火'));
    expect(点名.length, '不是每一位面都被点名').toBe(ZONE_ORDER.length);
  });
});
