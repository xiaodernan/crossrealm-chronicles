// 门禁：过导出决断（2026-10-23）第二族 —— 五个"零外部 import 的 export"收成模块内私有后，
// 不得再被 export，且各自的行为腿必须还活着。
//
// 第一族（三例"活函数 + 死 export 关键字"）见 dead-export-privatized.test.js。这一族是
// **数据与常量**：一次性全仓扫描（git grep 确认 src + tests + scripts 零 import）发现的五处
// 挂着 `export` 却没有任何外部读者的符号。`export` 一个没人用的符号 = 假 API 面 ——
// 下一个人会以为它是契约的一部分，照着它写代码，而它随时可以被"顺手删掉"或"顺手改名"，
// 两种改动都没有任何一处会红。
//   - ZoneIdentity.GLOOM_ZONE / RADIANT_ZONE：真出口是 zoneDescriptor(id)（对本模块可见、
//     对外是同一份对象）；描述对象与实例的双源对齐由 tests/zone-identity.test.js 钉住。
//   - zoneAmbience.DEFAULT_AMBIENCE_KEY / AMBIENCE_KIND_PARAMS：只在本文件内被读。
//   - WorldAmbientEvents.AMBIENT_JOURNAL_TITLE：只在本文件用一次（氛围条目进日志时的标题）。
//
// 同一次扫描里的**对照臂**：JournalTabRegistry.JOURNAL_EXTRA_TABS 有真实消费者
// （tests/journal-tab-registry.test.js）—— 判为活导出，留在出口不动。
// 所以这条门禁两头都要证：符号不再导出（假 API 面不回潮），行为还在（私有化没把行为带走）。
import { describe, it, expect } from 'vitest';
import * as zoneIdentity from '../src/content/ZoneIdentity.js';
import * as zoneAmbience from '../src/content/zoneAmbience.js';
import * as worldAmbientEvents from '../src/game/WorldAmbientEvents.js';
import * as journalTabs from '../src/ui/JournalTabRegistry.js';

describe('过导出决断：五个零外部 import 的符号收成模块内私有', () => {
  it('ZoneIdentity 的 GLOOM_ZONE / RADIANT_ZONE 不再导出', () => {
    expect(zoneIdentity.GLOOM_ZONE).toBeUndefined();
    expect(zoneIdentity.RADIANT_ZONE).toBeUndefined();
  });

  it('zoneAmbience 的 DEFAULT_AMBIENCE_KEY / AMBIENCE_KIND_PARAMS 不再导出', () => {
    expect(zoneAmbience.DEFAULT_AMBIENCE_KEY).toBeUndefined();
    expect(zoneAmbience.AMBIENCE_KIND_PARAMS).toBeUndefined();
  });

  it('WorldAmbientEvents 的 AMBIENT_JOURNAL_TITLE 不再导出', () => {
    expect(worldAmbientEvents.AMBIENT_JOURNAL_TITLE).toBeUndefined();
  });

  it('对照臂：JOURNAL_EXTRA_TABS 仍在导出（它有真实消费者，不是假 API 面）', () => {
    expect(journalTabs.JOURNAL_EXTRA_TABS).toBeTruthy();
    expect(Object.keys(journalTabs.JOURNAL_EXTRA_TABS).length).toBeGreaterThan(0);
  });

  it('行为腿：zoneDescriptor 仍是那两座区的真出口（坐标 / 半径 / 冻结都在）', () => {
    expect(typeof zoneIdentity.zoneDescriptor).toBe('function');
    const gloom = zoneIdentity.zoneDescriptor('gloom');
    expect(gloom.center).toEqual({ x: 180, y: 0, z: 100 });
    expect(gloom.radius).toBe(160);
    expect(Object.isFrozen(gloom)).toBe(true);
    const radiant = zoneIdentity.zoneDescriptor('radiant');
    expect(radiant.center).toEqual({ x: -180, y: 0, z: -160 });
    expect(radiant.radius).toBe(150);
  });

  it('行为腿：ambienceOf 认不出的区仍回落 wild 池（私有化的兜底键还在干活）', () => {
    expect(typeof zoneAmbience.ambienceOf).toBe('function');
    expect(zoneAmbience.ambienceOf('没人登记过区')).toBe(zoneAmbience.ZONE_AMBIENCE.wild);
    expect(zoneAmbience.ambienceOf(undefined)).toBe(zoneAmbience.ZONE_AMBIENCE.wild);
  });

  it('行为腿：assertZoneAmbience() 加载期自检不抛（私有化的参数表没搬走校验）', () => {
    expect(typeof zoneAmbience.assertZoneAmbience).toBe('function');
    expect(() => zoneAmbience.assertZoneAmbience()).not.toThrow();
  });

  it('分母自证：四个模块都真的被 import 了（上面那些 undefined 不是 import 失败）', () => {
    // 控制臂：同一次 import 里，仍然导出的符号必须读得到 —— 否则"全 undefined"
    // 会被误判成"私有化成功"（模块没加载成功时也是一片 undefined）。
    expect(zoneIdentity.HUB_ZONE).toBeTruthy();
    expect(zoneAmbience.ZONE_AMBIENCE).toBeTruthy();
    expect(worldAmbientEvents.WorldAmbientEvents).toBeTruthy();
    expect(journalTabs.mergeJournalCategories).toBeTruthy();
  });
});