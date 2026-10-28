import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrate, MIGRATIONS, SAVE_KEYS, SaveVersionError } from '../src/game/SaveMigrations.js';
import { SaveValidator, CURRENT_VERSION } from '../src/game/SaveValidator.js';
import { SaveSystem } from '../src/game/SaveSystem.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { MAINLINE, OBJECTIVES } from '../src/content/objectives.js';
import { installWindowShim } from './helpers/enemyHarness.js';
import v4 from '../tests/save_v4_fixture.json';
import v5 from '../tests/save_v5_fixture.json';

/** SaveSystem 通过 window 事件与 localStorage 落地，node 环境下补最小实现 */
beforeAll(() => {
  const store = new Map();
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() { return true; },
  };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _store: store,
  };
});

beforeEach(() => localStorage._store.clear());

const clone = (o) => structuredClone(o);

describe('存档迁移链', () => {
  it('SAVE_KEYS 首项就是当前写入版本', () => {
    expect(SAVE_KEYS[0].version).toBe(CURRENT_VERSION);
  });

  it('每一跳都有登记（新增版本时必须补函数，否则这里先红）', () => {
    for (let v = 1; v < CURRENT_VERSION; v++) expect(MIGRATIONS[v], `v${v}`).toBeTypeOf('function');
  });

  it('v4 档一路升到当前版本（v4 → v5 → v6 → v7 → v8 → v9 → v10 → v11 → v12 → v13 → v14 → v15 → v16 → v17 → v18 → v19）并通过校验', () => {
    const { data, from, applied } = migrate(clone(v4));
    expect([from, applied]).toEqual([4, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]]);
    expect(data.version).toBe(CURRENT_VERSION);
    expect(SaveValidator.validate(data)).toEqual([]);
  });

  it('v5 档走 v6、v7、v8、v9、v10、v11、v12、v13、v14、v15、v16、v17、v18、v19 十四跳：补出空的 stats.bag、restPointEnhancer、quests.stats.decisions 与 quests.stats.objectiveFlags，其余字段一个都不动', () => {
    const legacy = clone(v5);
    const snapshot = clone(v5);
    const { from, data, applied } = migrate(legacy);
    expect([from, applied]).toEqual([5, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]]);
    expect(data.version).toBe(CURRENT_VERSION);
    expect(data.stats.bag).toEqual([]);
    // 迁移只该多出 bag 与 restPointEnhancer 这两格：别处被顺手改写 = 这一跳在偷偷做别的事
    const { bag: _newlyAdded, ...rest } = data.stats;
    expect(rest).toEqual(snapshot.stats);
    // v15 → v16 那一跳还补了 `quests.stats.decisions`（抉择那一格是**账** ⇒ 必须落盘 ⇒
    // 老档缺它 ⇒ 这一跳补一个空数组；"其余字段一个都不动"要把它也算进"这一跳该补的"）
    const { decisions: _决策, objectiveFlags: _旗标 } = data.quests.stats;
    expect(_决策, 'v15 → v16 那一跳没有补出 decisions').toEqual([]);
    expect(_旗标, 'v17 → v18 那一跳没有补出 objectiveFlags').toEqual({});
    const { restPointEnhancer: _新补的, stats: { bag: _bag, ...没有bag的stats }, ...restRoot } = data;
    // 把这一跳补的那几格去掉之后，其余字段一个都不动
    const 去掉decisions = (o) => { const { decisions: _d, objectiveFlags: _f, ...r } = o; return r; };
    expect({
      ...restRoot,
      quests: { ...data.quests, stats: 去掉decisions(data.quests.stats) },
      stats: 没有bag的stats,
    }).toEqual({
      ...snapshot,
      quests: { ...snapshot.quests, stats: 去掉decisions(snapshot.quests.stats) },
      version: CURRENT_VERSION,
    });
    expect(_新补的).toEqual({ discovered: [] });
    expect(SaveValidator.validate(data)).toEqual([]);
  });

  it('v14 → v15：主线加两步"装备"，两个插点各自往后挪（老档落回同一步）', () => {
    // 造一份 **v14** 的档（v4 一路升到 v14，不走 v15 那一跳）
    const 造v14 = () => {
      const d = MIGRATIONS[13](MIGRATIONS[12](MIGRATIONS[11](MIGRATIONS[10](MIGRATIONS[9](MIGRATIONS[8](MIGRATIONS[7](MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4)))))))))));
      d.version = 14;
      return d;
    };
    const 落点 = (index) => {
      const d = 造v14();
      d.quests.index = index;
      // **只跑这一跳**（链条整体是另一条用例的事）—— 混着量就分不清是哪一跳挪的。
      // 这一跳**不改版本号**（改版本号的是 migrate 那条循环）⇒ 只量下标。
      const data = MIGRATIONS[14](d);
      return data.quests.index;
    };
    // 两个插点是 20 / 31（**旧序列**口径）
    expect(落点(0)).toBe(0);
    expect(落点(19)).toBe(19);
    expect(落点(20)).toBe(21);
    expect(落点(30)).toBe(31);
    expect(落点(31)).toBe(33);
    // 越界的下标也照偏移（无妨：读档侧按上限夹住，落在同一格）
    expect(落点(999)).toBe(1001);
    // 不是整数的下标不参与偏移（它本来就不是位置）
    expect(落点('abc')).toBe('abc');
  });

  it('v15 → v16：主线加一步"抉择"，插点往后挪 + 补出抉择那一格', () => {
    // 造一份 **v15** 的档（v4 一路升到 v15，不走 v16 那一跳）
    const 造v15 = () => {
      const d = MIGRATIONS[14](MIGRATIONS[13](MIGRATIONS[12](MIGRATIONS[11](MIGRATIONS[10](MIGRATIONS[9](MIGRATIONS[8](MIGRATIONS[7](MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4))))))))))));
      d.version = 15;
      return d;
    };
    const 落点 = (index) => {
      const d = 造v15();
      d.quests.index = index;
      // **只跑这一跳**（链条整体是另一条用例的事）—— 混着量就分不清是哪一跳挪的。
      const data = MIGRATIONS[15](d);
      return data.quests.index;
    };
    // 插点是 40（**旧序列**口径：在 `true-end` 之前）
    expect(落点(0)).toBe(0);
    expect(落点(39)).toBe(39);
    expect(落点(40)).toBe(41);
    // 越界的下标也照偏移（无妨：读档侧按上限夹住，落在同一格）
    expect(落点(999)).toBe(1000);
    // 不是整数的下标不参与偏移（它本来就不是位置）
    expect(落点('abc')).toBe('abc');
  });

  it('v15 → v16：老档缺抉择那一格 ⇒ 这一跳补一个空数组（不是"缺失就当默认值凑合读"）', () => {
    const d = MIGRATIONS[14](MIGRATIONS[13](MIGRATIONS[12](MIGRATIONS[11](MIGRATIONS[10](MIGRATIONS[9](MIGRATIONS[8](MIGRATIONS[7](MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4))))))))))));
    d.version = 15;
    expect(d.quests.stats.decisions, 'v15 那一档本来就不该有这一格').toBeUndefined();
    const after = MIGRATIONS[15](d);
    expect(after.quests.stats.decisions, '这一跳没有补出抉择那一格').toEqual([]);
    // 老档的玩家没做过任何抉择（那一步在老版本里根本不存在）⇒ 补的是空的。
    // 后面还有 v17 → v18（补旗标账本）才到当前版本 ⇒ 整链走完再校验
    const { data: 到当前 } = migrate({ ...after, version: 16 });
    expect(SaveValidator.validate(到当前)).toEqual([]);
    expect(到当前.quests.stats.decisions).toEqual([]);
  });

  it('v16 → v17：主线加六步"清剿"，两处插点各三个（老档落回同一步）', () => {
    // 造一份 **v16** 的档（v4 一路升到 v16，不走 v17 那一跳）
    const 造v16 = () => {
      const d = MIGRATIONS[15](MIGRATIONS[14](MIGRATIONS[13](MIGRATIONS[12](MIGRATIONS[11](MIGRATIONS[10](MIGRATIONS[9](MIGRATIONS[8](MIGRATIONS[7](MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4)))))))))))));
      d.version = 16;
      return d;
    };
    const 落点 = (index) => {
      const d = 造v16();
      d.quests.index = index;
      const data = MIGRATIONS[16](d);
      return data.quests.index;
    };
    // 插点是 49 与 53（**旧序列**口径，每处三步连续 ⇒ 三个插点落在同一处）
    expect(落点(0)).toBe(0);
    expect(落点(48)).toBe(48);
    expect(落点(49)).toBe(52);
    expect(落点(52)).toBe(55);
    expect(落点(53)).toBe(59);
    expect(落点(54)).toBe(60);
    expect(落点(55)).toBe(61);
    // 越界的下标也照偏移（无妨：读档侧按上限夹住，落在同一格）
    expect(落点(999)).toBe(1005);
    // 不是整数的下标不参与偏移（它本来就不是位置）
    expect(落点('abc')).toBe('abc');
  });

  it('v17 → v18：主线旗标入档 —— 按 questIndex 重放走完的那些步（不插行，index 原样不动）', () => {
    // 造一份 **v17** 的档（v4 一路升到 v17，不走 v18 那一跳）
    const 造v17 = () => {
      const d = MIGRATIONS[16](MIGRATIONS[15](MIGRATIONS[14](MIGRATIONS[13](MIGRATIONS[12](MIGRATIONS[11](MIGRATIONS[10](MIGRATIONS[9](MIGRATIONS[8](MIGRATIONS[7](MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4))))))))))))));
      d.version = 17;
      return d;
    };
    /** 重放口径（与迁移同源）：停在当前步**之前**（它还没完成）；通关档整表走完 */
    const 期望旗标 = (index) => {
      const flags = {};
      const 停在 = index >= MAINLINE.length ? null : MAINLINE[index]?.id;
      for (const row of OBJECTIVES) {
        if (row.id === 停在) break;
        for (const [flag, value] of Object.entries(row.flags ?? {})) flags[flag] = value;
      }
      return flags;
    };
    const 跑 = (index) => {
      const d = 造v17();
      expect(d.quests.stats.objectiveFlags, 'v17 那一档本来就不该有这一格').toBeUndefined();
      d.quests.index = index;
      return MIGRATIONS[17](d);
    };
    // 开头：一步没走 ⇒ 一格旗标都不该亮
    expect(跑(0).quests.stats.objectiveFlags).toEqual({});
    expect(跑(0).quests.index, '这一跳不插行 ⇒ 下标原样不动').toBe(0);
    // 中段几个落点：与"走到那儿时该点亮的一切"逐格相同
    for (const index of [1, 3, 7, 20, 33, 48]) {
      expect(跑(index).quests.stats.objectiveFlags, `落点 ${index}`).toEqual(期望旗标(index));
    }
    // 跨章节门的落点：门控行的 flags 也点亮（`chaos-core` 的 requires 等的就是 chapter4Done）
    const 门后 = MAINLINE.findIndex((r) => r.id === 'chaos-core');
    expect(跑(门后).quests.stats.objectiveFlags.chapter4Done).toBe(true);
    // 当前步自己的旗标不点亮 —— 它还没完成（`hasChaosCore` 是 chaos-core 自己的 flags）
    expect(跑(门后).quests.stats.objectiveFlags.hasChaosCore).toBeUndefined();
    // 通关档（index 越界）：整表点亮，含最后一行
    const 通关 = 跑(999);
    expect(通关.quests.stats.objectiveFlags).toEqual(期望旗标(MAINLINE.length));
    expect(通关.quests.stats.objectiveFlags.gameCompleted).toBe(true);
    // 不是整数的下标不重放（读档侧按 0 落点继续，旗标也该是空的）
    const 坏 = 造v17();
    坏.quests.index = 'abc';
    expect(MIGRATIONS[17](坏).quests.stats.objectiveFlags).toEqual({});
    // 整链走完通过校验（v18 的 fixture 形状就是这一跳补出来的形状）
    const { data } = migrate(造v17());
    expect(data.version).toBe(CURRENT_VERSION);
    expect(SaveValidator.validate(data)).toEqual([]);
  });

  it('v18 → v19：主线加长一步（名册上的第十座），插点 61 ⇒ ≥61 的下标各往后挪一格（不插行的那一跳是 v17 → v18）', () => {
    // 造一份 **v18** 的档（v4 一路升到 v18，不走 v19 那一跳）
    const 造v18 = () => {
      const d = MIGRATIONS[17](MIGRATIONS[16](MIGRATIONS[15](MIGRATIONS[14](MIGRATIONS[13](MIGRATIONS[12](MIGRATIONS[11](MIGRATIONS[10](MIGRATIONS[9](MIGRATIONS[8](MIGRATIONS[7](MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4)))))))))))))));
      d.version = 18;
      return d;
    };
    const 落点 = (index) => {
      const d = 造v18();
      d.quests.index = index;
      // **只跑这一跳** —— 混着量就分不清是哪一跳挪的；版本号由 `migrate` 那条循环负责
      return MIGRATIONS[18](d).quests.index;
    };
    // 插点是 61（**旧序列**口径）：旧 61 是 `infinity`（摸世界之锚），新步插在它之前
    expect(落点(0)).toBe(0);
    expect(落点(59)).toBe(59);
    expect(落点(60), '旧序列的 chests-all（60）在插点之前，该原地不动').toBe(60);
    expect(落点(61), '旧序列的 infinity（61）该往后挪一格').toBe(62);
    // 通关档：旧序列长度 62 ⇒ 新的 63 = `MAINLINE.length`，仍然读作"通关"，不许退回到锚点那一步
    expect(落点(62)).toBe(63);
    expect(落点(62), '通关档迁移后没有正好落在新的主线长度上 ⇒ 老档读进来会变成"还差最后一步"')
      .toBe(MAINLINE.length);
    expect(落点(999)).toBe(1000);
    expect(落点('abc'), '不是整数的下标不参与偏移（它本来就不是位置）').toBe('abc');
    // 这一跳**不改存档形状**：除 `quests.index` 之外一个字段都不动
    const d = 造v18();
    d.quests.index = 61;
    const 前 = clone(d);
    const 后 = MIGRATIONS[18](d);
    expect({ ...后, quests: { ...后.quests, index: 前.quests.index } },
      '这一跳除了下标还动了别的字段 ⇒ 它在偷偷做别的事').toEqual(前);
    expect(后.quests.index, '迁移没把下标写回原对象（返回的是同一份档）').toBe(62);
  });

  it('v13 → v14：主线再加三步，三个插点各自往后挪（老档落回同一步）', () => {
    // 造一份 **v13** 的档（v4 一路升到 v13，不走 v14 那一跳）
    const 造v13 = () => {
      const d = MIGRATIONS[12](MIGRATIONS[11](MIGRATIONS[10](MIGRATIONS[9](MIGRATIONS[8](MIGRATIONS[7](MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4))))))))));
      d.version = 13;
      return d;
    };
    const 落点 = (index) => {
      const d = 造v13();
      d.quests.index = index;
      // **只跑这一跳**（链条整体是另一条用例的事）—— 混着量就分不清是哪一跳挪的。
      // 这一跳**不改版本号**（改版本号的是 migrate 那条循环）⇒ 只量下标。
      const data = MIGRATIONS[13](d);
      return data.quests.index;
    };
    // 三个插点是 14 / 25 / 44（**旧序列**口径）
    expect(落点(0)).toBe(0);
    expect(落点(13)).toBe(13);
    expect(落点(14)).toBe(15);
    expect(落点(24)).toBe(25);
    expect(落点(25)).toBe(27);
    expect(落点(44)).toBe(47);
    // 越界的下标也照偏移（无妨：读档侧按上限夹住，落在同一格）
    expect(落点(999)).toBe(1002);
    // 不是整数的下标不参与偏移（它本来就不是位置）
    expect(落点('abc')).toBe('abc');
  });

  it('v12 → v13：主线加三步"别的种类"的段落，三个插点各自往后挪（老档落回同一步）', () => {
    // 造一份 **v12** 的档（v4 一路升到 v12，不走 v13 那一跳）
    const 造v12 = () => {
      const d = MIGRATIONS[11](MIGRATIONS[10](MIGRATIONS[9](MIGRATIONS[8](MIGRATIONS[7](MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4)))))))))
      d.version = 12;
      return d;
    };
    const 落点 = (index) => {
      const d = 造v12();
      d.quests.index = index;
      // **只跑这一跳**（链条整体是另一条用例的事）—— 混着量就分不清是哪一跳挪的。
      // 这一跳**不改版本号**（改版本号的是 migrate 那条循环）⇒ 只量下标。
      const data = MIGRATIONS[12](d);
      return data.quests.index;
    };
    // 三个插点是 6 / 45 / 46（**旧序列**口径）
    expect(落点(0)).toBe(0);
    expect(落点(5)).toBe(5);
    expect(落点(6)).toBe(7);
    expect(落点(44)).toBe(45);
    expect(落点(45)).toBe(47);
    expect(落点(46)).toBe(49);
    // 越界的下标也照偏移（无妨：读档侧按上限夹住，落在同一格）
    expect(落点(999)).toBe(1002);
    // 不是整数的下标不参与偏移（它本来就不是位置）
    expect(落点('abc')).toBe('abc');
  });

  it('v11 → v12：主线加五步"发现"，五个插点各自往后挪（老档落回同一步）', () => {
    // 造一份 **v11** 的档（v4 一路升到 v11，不走 v12 那一跳）
    const 造v11 = () => {
      const d = MIGRATIONS[10](MIGRATIONS[9](MIGRATIONS[8](MIGRATIONS[7](MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4))))))));
      d.version = 11;
      return d;
    };
    const 落点 = (index) => {
      const d = 造v11();
      d.quests.index = index;
      // **只跑这一跳**（链条整体是另一条用例的事）—— 混着量就分不清是哪一跳挪的。
      // 这一跳**不改版本号**（改版本号的是 migrate 那条循环）⇒ 只量下标。
      const data = MIGRATIONS[11](d);
      return data.quests.index;
    };
    // 五个插点是 5 / 16 / 22 / 38 / 40（**旧序列**口径）
    expect(落点(0)).toBe(0);
    expect(落点(4)).toBe(4);
    expect(落点(5)).toBe(6);
    expect(落点(15)).toBe(16);
    expect(落点(16)).toBe(18);
    expect(落点(22)).toBe(25);
    expect(落点(38)).toBe(42);
    expect(落点(40)).toBe(45);
    // 越界的下标也照偏移（无妨：读档侧按上限夹住，落在同一格）
    expect(落点(999)).toBe(1004);
    // 不是整数的下标不参与偏移（它本来就不是位置）
    expect(落点('abc')).toBe('abc');
  });

  it('v10 → v11：主线把剩下四座副本也走一遍，四个插点各自往后挪（老档落回同一步）', () => {
    // 造一份 **v10** 的档（v4 一路升到 v10，不走 v11 那一跳）
    const 造v10 = () => {
      const d = MIGRATIONS[9](MIGRATIONS[8](MIGRATIONS[7](MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4)))))));
      d.version = 10;
      return d;
    };
    const 落点 = (index) => {
      const d = 造v10();
      d.quests.index = index;
      // **只跑这一跳**（链条整体是另一条用例的事）—— 混着量就分不清是哪一跳挪的。
      // 这一跳**不改版本号**（改版本号的是 migrate 那条循环）⇒ 只量下标。
      const data = MIGRATIONS[10](d);
      return data.quests.index;
    };
    // 四个插点是 2 / 10 / 35 / 36（**旧序列**口径）：每个插点之前的旧下标不动，之后的各挪一位
    expect(落点(0)).toBe(0);
    expect(落点(1)).toBe(1);
    expect(落点(2)).toBe(3);
    expect(落点(9)).toBe(10);
    expect(落点(10)).toBe(12);
    expect(落点(34)).toBe(36);
    expect(落点(35)).toBe(38);
    expect(落点(36)).toBe(40);
    // 越界的下标也照偏移（无妨：读档侧按上限夹住，落在同一格）
    expect(落点(999)).toBe(1003);
    // 不是整数的下标不参与偏移（它本来就不是位置）
    expect(落点('abc')).toBe('abc');
  });

  it('v9 → v10：主线走进两座非试炼副本，两处插点各自往后挪（老档落回同一步）', () => {
    // 造一份 **v9** 的档（v4 一路升到 v9，不走 v10 那一跳）
    const 造v9 = () => {
      const d = MIGRATIONS[8](MIGRATIONS[7](MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4))))));
      d.version = 9;
      return d;
    };
    const 落点 = (index) => {
      const d = 造v9();
      d.quests.index = index;
      // **只跑这一跳**（链条整体是另一条用例的事）—— 混着量就分不清是哪一跳挪的。
      // 这一跳**不改版本号**（改版本号的是 migrate 那条循环）⇒ 只量下标。
      const data = MIGRATIONS[9](d);
      return data.quests.index;
    };
    // 两处插点是 27 / 33（**旧序列**口径）：每个插点之前的旧下标不动，之后的各挪一位
    expect(落点(0)).toBe(0);
    expect(落点(26)).toBe(26);
    expect(落点(27)).toBe(28);
    expect(落点(32)).toBe(33);
    expect(落点(33)).toBe(35);
    expect(落点(34)).toBe(36);
    // 越界的下标也照偏移（无妨：读档侧按上限夹住，落在同一格）
    expect(落点(999)).toBe(1001);
    // 不是整数的下标不参与偏移（它本来就不是位置）
    expect(落点('abc')).toBe('abc');
  });

it('v8 → v9：主线再长三步，三处插入点各自往后挪（老档落回同一步）', () => {
    // 造一份 **v8** 的档（v4 一路升到 v8，不走 v9 那一跳）
    const 造v8 = () => {
      const d = MIGRATIONS[7](MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4)))));
      d.version = 8;
      return d;
    };
    const 落点 = (index) => {
      const d = 造v8();
      d.quests.index = index;
      // **只跑这一跳**（链条整体是另一条用例的事）—— 混着量就分不清是哪一跳挪的。
      // 这一跳**不改版本号**（改版本号的是 `migrate` 那条循环）⇒ 只量下标。
      const data = MIGRATIONS[8](d);
      return data.quests.index;
    };
    // 三处插点是 13 / 25 / 29（**旧序列**口径）：每个插点之前的旧下标不动，之后的各挪一位
    expect(落点(0)).toBe(0);
    expect(落点(12)).toBe(12);
    expect(落点(13)).toBe(14);
    expect(落点(24)).toBe(25);
    expect(落点(25)).toBe(27);
    expect(落点(29)).toBe(32);
    expect(落点(30)).toBe(33);
    // 越界的下标也照偏移（无妨：读档侧按上限夹住，落在同一格）
    expect(落点(999)).toBe(1002);
    // 不是整数的下标不参与偏移（它本来就不是位置）
    expect(落点('abc')).toBe('abc');
  });

  it('v7 → v8：主线加长一步，下标 ≥24 的全部 +1（老档落回同一步）', () => {
    // 造一份 **v7** 的档（v4 一路升到 v7，不走 v8 那一跳）
    const 造v7 = () => {
      const d = MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4))));
      d.version = 7;
      return d;
    };
    const 落点 = (index) => {
      const d = 造v7();
      d.quests.index = index;
      // **只跑这一跳**（链条整体是另一条用例的事）—— 混着量就分不清是哪一跳挪的。
      // 这一跳**不改版本号**（改版本号的是 `migrate` 那条循环）⇒ 只量下标。
      const data = MIGRATIONS[7](d);
      return data.quests.index;
    };
    // 插入点之前不动
    expect(落点(0)).toBe(0);
    expect(落点(23)).toBe(23);
    // 插入点及其之后全部 +1（老档的 24 号位是 `void-boss`，改后 24 号位是新插的 `void-casket`）
    expect(落点(24)).toBe(25);
    expect(落点(31)).toBe(32);
    // 本来就无效的下标：偏移不偏移**落在同一格**（读档侧按上限夹住）⇒ 无妨
    expect(落点(999)).toBe(1000);
    // 不是整数的下标不参与偏移（它本来就不是位置）
    expect(落点('abc')).toBe('abc');
  });

  it('v7 → v8 之后整份档仍能通过校验（迁移只改下标，不动别的）', () => {
    const d = MIGRATIONS[6](MIGRATIONS[5](MIGRATIONS[4](clone(v4))));
    d.version = 7;
    d.quests.index = 24;
    const 迁移后 = migrate(d);
    expect(SaveValidator.validate(迁移后.data)).toEqual([]);
    // 整条链跑 ⇒ 24 先被 v7→v8 挪到 25，再被 v8→v9 挪两次（13 / 25 两个插点都过了）⇒ 27，
    // 接着被 v9→v10 挪一次（27 那个插点）⇒ 28，被 v10→v11 挪两次（2 / 10）⇒ 30，
    // 被 v11→v12 挪三次（5 / 16 / 22）⇒ 33，被 v12→v13 挪一次（6）⇒ 34，
    // 被 v13→v14 挪两次（14 / 25 两个插点都过了）⇒ 36，
    // 最后被 v14→v15 挪两次（20 / 31 两个插点都过了）⇒ 38
    expect(迁移后.data.quests.index).toBe(38);
  });

  it('v4 缺少的朝向角按初始值补齐，已有值原样保留', () => {
    expect(migrate(clone(v4)).data.player).toMatchObject({ yaw: Math.PI, pitch: 0.38 });
    const kept = clone(v4);
    kept.player.yaw = 0.7;
    kept.player.pitch = 0.2;
    expect(migrate(kept).data.player).toMatchObject({ yaw: 0.7, pitch: 0.2 });
  });

  it('派生字段 skillsUnlocked 在迁移中被剔除', () => {
    const legacy = clone(v4);
    legacy.quests.stats.skillsUnlocked = 9;
    expect('skillsUnlocked' in migrate(legacy).data.quests.stats).toBe(false);
  });

  it('无版本号的历史档按 v1 起跳，最终仍可通过校验', () => {
    const legacy = clone(v4);
    delete legacy.version;
    const { data, from, applied } = migrate(legacy);
    expect([from, data.version, applied]).toEqual([0, CURRENT_VERSION, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]]);
    expect(SaveValidator.validate(data)).toEqual([]);
  });

  it('迁移幂等：升到当前版本后再走一次不改动任何字段', () => {
    const once = migrate(clone(v4)).data;
    const twice = migrate(clone(once));
    expect(twice.applied).toEqual([]);
    expect(twice.data).toEqual(once);
  });

  it('高于本构建的版本直接拒绝，不改写数据', () => {
    const future = clone(v4);
    future.version = CURRENT_VERSION + 1;
    const snapshot = clone(future);
    expect(() => migrate(future)).toThrow(SaveVersionError);
    expect(future).toEqual(snapshot);
  });

  it('漏登记某一跳时明确报错，而不是静默跳过字段', () => {
    const step = MIGRATIONS[4];
    delete MIGRATIONS[4];
    try {
      expect(() => migrate(clone(v4))).toThrow(/缺少 v4 → v5/);
    } finally {
      MIGRATIONS[4] = step;
    }
  });
});

/** applyData 需要的最小宿主：只实现它真正调用的接口 */
const makeGameStub = () => ({
  dialog: { toasts: [], toast(t) { this.toasts.push(t); } },
  player: {
    combat: {},
    teleport(x, y, z, opts) { this.landed = { x, y, z, ...opts }; },
  },
  stats: { fromJSON() {}, pushToConsumers() {}, toJSON: () => ({}) },
  // `quests` 用**真的** `QuestSystem`：以前这里是一份手抄的最小壳，
  // 于是 `applyData` 换调用点（切片4 改走 `quests.restoreFromSave`）时，这份壳只是让测试炸一下 ——
  // 而"壳比生产少一格"正是 B63 那一族的病根（见 game-field-contract 的口径）
  quests: new QuestSystem({ toast() {} }),
  spells: {},
  settings: { data: {}, applyToGame() {} },
  weaponSkills: { unlocked: new Set(['a', 'b']), fromJSON() {} },
});

describe('SaveSystem.ingest 的失败路径（不静默吞异常）', () => {
  beforeAll(() => installWindowShim());
  const game = { dialog: { toasts: [], toast(t) { this.toasts.push(t); } } };

  it('v4 档一路走通：迁移 → 校验 → 应用，朝向角与派生字段都正确', () => {
    const legacy = clone(v4);
    legacy.quests.stats.skillsUnlocked = 9;
    const target = makeGameStub();
    const r = SaveSystem.ingest(target, JSON.stringify(legacy), { sourceKey: 'crossrealm_save_v4' });
    expect([r.ok, r.migrated, r.from, r.data.version]).toEqual([true, true, 4, CURRENT_VERSION]);
    expect(target.player.landed).toMatchObject({ yaw: Math.PI, pitch: 0.38 });
    expect(target.quests.stats.skillsUnlocked).toBe(2);
  });

  it('坏 JSON 被隔离到 :corrupt，原文保留且不删除键之外的数据', () => {
    localStorage.setItem('crossrealm_save_v5', '{"version":5,');
    const r = SaveSystem.ingest(game, '{"version":5,', { sourceKey: 'crossrealm_save_v5' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/JSON/);
    expect(localStorage.getItem('crossrealm_save_v5')).toBeNull();
    expect(localStorage.getItem('crossrealm_save_v5:corrupt')).toBe('{"version":5,');
    expect(game.dialog.toasts.join(' ')).toMatch(/已损坏/);
  });

  it('版本过高时只提示，绝不隔离或改写存档', () => {
    const future = clone(v4);
    future.version = CURRENT_VERSION + 2;
    const raw = JSON.stringify(future);
    localStorage.setItem('crossrealm_save_v5', raw);
    const r = SaveSystem.ingest(game, raw, { sourceKey: 'crossrealm_save_v5' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/高于当前构建/);
    expect(localStorage.getItem('crossrealm_save_v5')).toBe(raw);
    expect(localStorage.getItem('crossrealm_save_v5:corrupt')).toBeNull();
  });

  it('校验不通过的档不会进入应用阶段', () => {
    const broken = clone(v4);
    delete broken.quests;
    const r = SaveSystem.ingest(game, JSON.stringify(broken), { sourceKey: 'crossrealm_save_v4' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('存档校验未通过');
  });
});
