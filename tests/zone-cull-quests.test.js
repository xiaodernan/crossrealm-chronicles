/**
 * 第三样位面事实：该位面的**清剿数**（W-B12 切片7）—— 每位面第三条专属支线。
 *
 * ## 这一片补的是什么
 *
 * 分区支线原先只读两对事实（歇脚与插画 / 萤火与火牌）—— 都是"**去过那里**"的证据。
 * 而"**你把那里清了一遍**"是另一种经历，它要一个**敌人**维度的持久化事实：
 * 任务账里的 `zoneKills`（按区位分）。
 *
 * ## 四条判据各有一种死法
 *
 * 1. **每位面恰好一条清剿支线** —— 少一条 = 那一座区没有"清剿"这件事可做。
 * 2. **判据读的是任务账那一格** —— 读错地方（读 `kills` 那本按类型分的账）就答错了题：
 *    "你在这座区清了多少只"与"你一共清了多少只 soldier"不是同一件事。
 * 3. **那一格真的有人写** —— 生产者是 `enemy-defeated` 事件里的 `zone`；没人写它，
 *    每条清剿支线都永远差最后一步。
 * 4. **区位记在**出生**那一刻** —— 问的是"这一区的原生敌人"，不是"它死的时候脚下是哪块地"
 *    （它可能追着玩家跑了很远）。而且那一次反推**本来就要算**（给成长档用的），
 *    复用它等于不多一次几何判断（`zoneIdAt` 的调用点被门禁钉着）。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SIDE_QUESTS_ZONE, SIDE_QUESTS_ALL } from '../src/content/sideQuests.js';
import { emptyStats, applyStatEvent, statsToJSON, statsFromJSON } from '../src/content/objectives.js';
import { ZONE_ORDER } from '../src/content/ZoneIdentity.js';
import { WorldManager } from '../src/world/WorldManager.js';
import { makeManager, installWindowShim } from './helpers/enemyHarness.js';

const 清剿支线 = SIDE_QUESTS_ZONE.filter((q) => q.id.startsWith('side-cull-'));

describe('① 每位面恰好一条清剿支线', () => {
  it('七座真实位面每一位都有一条（不多不少）', () => {
    expect(清剿支线.length, '清剿支线的条数与位面数对不上').toBe(ZONE_ORDER.length);
    for (const zone of ZONE_ORDER) {
      const n = 清剿支线.filter((q) => q.zone === zone).length;
      expect(n, `位面 "${zone}" 的清剿支线有 ${n} 条`).toBe(1);
    }
  });

  it('id 唯一且带区位前缀（玩家在日志里认得出它属于哪座区）', () => {
    for (const q of 清剿支线) {
      expect(q.id, `清剿支线 "${q.id}" 的 id 不带区位`).toBe(`side-cull-${q.zone}`);
    }
    expect(new Set(SIDE_QUESTS_ALL.map((q) => q.id)).size).toBe(SIDE_QUESTS_ALL.length);
  });

  it('奖励比同区前两族高（它是比那两族更费工夫的那一条）', () => {
    for (const q of 清剿支线) {
      // 只比**前两族**（歇脚与插画 / 萤火与火牌）—— W-E3 切片7 起同区还有第四族
      // （那位面的副本），那条比清剿**更**费工夫 ⇒ 它的奖励更高（见
      // `tests/side-quest-dungeon-family.test.js`）。这一条量的是"清剿比野外那两族费工夫"。
      const 同区前两族 = SIDE_QUESTS_ZONE.filter((x) => x.zone === q.zone
        && !x.id.startsWith('side-cull-') && !x.id.startsWith('side-dun-'));
      expect(同区前两族.length, `位面 "${q.zone}" 的前两族不在表里`).toBeGreaterThan(0);
      for (const 其他 of 同区前两族) {
        expect(q.reward, `清剿支线 "${q.id}" 的奖励 ${q.reward} 不比同区 "${其他.id}" 的 ${其他.reward} 高`).toBeGreaterThan(其他.reward);
      }
    }
  });
});

describe('② 判据读的是任务账里那一格', () => {
  const 幻想 = 清剿支线.find((q) => q.zone === 'fantasy');

  it('没清够就不算完成（门槛不是零）', () => {
    const game = { quests: { stats: { zoneKills: { fantasy: 0 } } } };
    expect(幻想.check(game)).toBe(false);
  });

  it('清够了才算完成', () => {
    const game = { quests: { stats: { zoneKills: { fantasy: 10 } } } };
    expect(幻想.check(game)).toBe(true);
  });

  it('别的区清得再多也不算这一条（它问的是"这一座区"）', () => {
    const game = { quests: { stats: { zoneKills: { magic: 99 } } } };
    expect(幻想.check(game)).toBe(false);
  });

  it('账本里没有这一格时读成 0（不是 NaN —— NaN 比较永远是假，症状会变成"永远差一点"）', () => {
    const game = { quests: { stats: {} } };
    expect(幻想.check(game)).toBe(false);
    expect(幻想.check({ quests: {} })).toBe(false);
  });
});

describe('③ 那一格真的有人写', () => {
  it('`enemy-defeated` 事件带着区位 ⇒ 账本按区位记一笔', () => {
    const stats = emptyStats();
    applyStatEvent(stats, 'enemy-defeated', { type: 'soldier', zone: 'fantasy' });
    expect(stats.zoneKills.fantasy, '区位没有进账').toBe(1);
    applyStatEvent(stats, 'enemy-defeated', { type: 'golem', zone: 'fantasy' });
    expect(stats.zoneKills.fantasy).toBe(2);
    applyStatEvent(stats, 'enemy-defeated', { type: 'golem', zone: 'magic' });
    expect(stats.zoneKills.magic, '别的区没有单独记').toBe(1);
    expect(stats.zoneKills.fantasy).toBe(2);
  });

  it('没有区位就不记（副本里的敌人出生在独立坐标空间，那里算出来的区没有意义）', () => {
    const stats = emptyStats();
    applyStatEvent(stats, 'enemy-defeated', { type: 'soldier' });
    expect(Object.keys(stats.zoneKills).length, '没有区位也记了一笔').toBe(0);
  });

  it('这一格在存档里往返不丢（读档后清剿数还在）', () => {
    const stats = emptyStats();
    applyStatEvent(stats, 'enemy-defeated', { type: 'soldier', zone: 'fantasy' });
    const 读回 = statsFromJSON(statsToJSON(stats));
    expect(读回.zoneKills.fantasy, '读档后清剿数丢了').toBe(1);
  });
});

describe('④ 区位记在出生那一刻', () => {
  /** 真世界：区位要按**真的**区反推（夹具那个空世界没有 `zones` ⇒ 一律落 corridor） */
  const 真世界 = () => {
    const handlers = new Map();
    globalThis.window = {
      addEventListener(type, fn) {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type).add(fn);
      },
      dispatchEvent(event) { handlers.get(event.type)?.forEach((fn) => fn(event)); return true; },
    };
    globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
    const world = new WorldManager(new THREE.Scene(), { show() {}, toast() {} });
    world.build();
    return world;
  };

  it('敌人出生时记下它属于哪一座区（反推只做一次）', () => {
    installWindowShim();
    const m = makeManager({ world: 真世界() });
    // 一枚灰白森林的出生点（坐标取自 `content/enemySpawns.js` 的真表）
    const e = m.spawnAt('soldier', -215, -20);
    expect(e.zone, '敌人没记住自己属于哪座区').toBe('fantasy');
  });

  it('副本坐标空间里的敌人不假装属于哪座真实位面', () => {
    installWindowShim();
    const m = makeManager({ world: 真世界() });
    const e = m.spawnAt('soldier', 5000, 5000);
    expect(ZONE_ORDER.includes(e.zone), `副本坐标算出了 "${e.zone}" —— 那不是一座真实位面`).toBe(false);
  });
});
