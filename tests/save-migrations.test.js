import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrate, MIGRATIONS, SAVE_KEYS, SaveVersionError } from '../src/game/SaveMigrations.js';
import { SaveValidator, CURRENT_VERSION } from '../src/game/SaveValidator.js';
import { SaveSystem } from '../src/game/SaveSystem.js';
import v4 from '../tests/save_v4_fixture.json';

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

  it('v4 档能升到 v5 并通过校验', () => {
    const { data, from, applied } = migrate(clone(v4));
    expect([from, applied]).toEqual([4, [4]]);
    expect(data.version).toBe(CURRENT_VERSION);
    expect(SaveValidator.validate(data)).toEqual([]);
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
    expect([from, data.version, applied]).toEqual([0, CURRENT_VERSION, [1, 2, 3, 4]]);
    expect(SaveValidator.validate(data)).toEqual([]);
  });

  it('迁移幂等：v5 再走一次不改动任何字段', () => {
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
  stats: { fromJSON() {}, applyToCombat() {}, toJSON: () => ({}) },
  quests: { stats: {}, syncProgress() {}, notifyUpdate() {} },
  spells: {},
  settings: { data: {}, applyToGame() {} },
  weaponSkills: { unlocked: new Set(['a', 'b']), fromJSON() {} },
});

describe('SaveSystem.ingest 的失败路径（不静默吞异常）', () => {
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
