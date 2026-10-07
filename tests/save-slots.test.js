/**
 * 多存档槽的数据层 —— W-D3 切片2。
 *
 * 以前只有一把钥匙（`SAVE_KEYS[0].key`），存一次盖一次：想开新周目就得毁档。
 * 槽 0 沿用旧键（老玩家的档不用搬家、开机自动读档一字不改），槽 1/2 带后缀；
 * 槽位越界**当场抛**而不是静默绕回 —— 静默绕回的后果是"存槽二把槽一覆盖了"。
 * 槽位选择的面板是切片3 的事，这一片只把编址、隔离、元数据读数做对。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SaveSystem, slotKey, SAVE_SLOTS } from '../src/game/SaveSystem.js';
import { SAVE_KEYS, CURRENT_VERSION } from '../src/game/SaveMigrations.js';
import { SaveValidator } from '../src/game/SaveValidator.js';
import { QuestSystem } from '../src/game/QuestSystem.js';


const ROOT = process.cwd();

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
  globalThis.document = {
    createElement: () => ({ click() {}, set href(v) {}, get href() { return ''; } }),
  };
  globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  globalThis.Blob = class {};
});

beforeEach(() => localStorage._store.clear());

/** 与 save-field-parity 同一形状的最小宿主：少一格都会在 applyData 里哑火（B63 一族） */
function makeHost(souls = 10) {
  return {
    dialog: { toasts: [], toast(t) { this.toasts.push(t); } },
    player: {
      position: { x: 1, y: 2, z: 3 },
      yaw: 0.5, pitch: 0.2,
      combat: { hp: 100, maxHp: 118, stamina: 50 },
      teleport() {},
    },
    stats: {
      data: { bag: [], level: 1, souls },
      toJSON() { return { ...this.data }; },
      fromJSON(d) { this.data = { ...this.data, ...d }; },
      pushToConsumers() {},
    },
    quests: new QuestSystem({ toast() {} }),
    spells: { mana: 100 },
    settings: { data: {}, applyToGame() {} },
    weaponSkills: { unlocked: new Set(), toJSON: () => ({ unlocked: [] }), fromJSON() {} },
    restPointEnhancer: {
      discovered: new Set(),
      toJSON() { return { discovered: [...this.discovered] }; },
      fromJSON(d) { this.discovered = new Set(d?.discovered ?? []); },
    },
  };
}

describe('槽位编址（W-D3 切片2）', () => {
  it('槽 0 就是旧键 —— 老玩家的档不搬家，开机自动读档路径一字不改', () => {
    expect(slotKey(0)).toBe(SAVE_KEYS[0].key);
    expect(slotKey(1)).toBe(`${SAVE_KEYS[0].key}_slot1`);
    expect(slotKey(2)).toBe(`${SAVE_KEYS[0].key}_slot2`);
    expect(SAVE_SLOTS).toBe(3);
  });

  it('越界 / 非整数的槽位当场抛（静默绕回 = 覆盖别人的档）', () => {
    for (const 坏 of [3, -1, 1.5, '1', null, undefined]) {
      expect(() => slotKey(坏), `slotKey(${String(坏)}) 该红`).toThrow(/槽位/);
    }
  });
});

describe('三槽互不串档', () => {
  it('三槽各存各的，读回谁的档就回到谁的世界', () => {
    const A = makeHost(111);
    const B = makeHost(222);
    const C = makeHost(333);
    for (const [host, slot] of [[A, 0], [B, 1], [C, 2]]) {
      expect(SaveValidator.validate(SaveSystem.toData(host))).toEqual([]);
      expect(SaveSystem.save(host, slot), `槽${slot} 存盘被拒`).toBe(true);
    }
    // 落盘在三个不同的键上
    expect(localStorage._store.size).toBe(3);

    const 读回 = (slot) => {
      const g = makeHost(0);
      expect(SaveSystem.load(g, slot), `槽${slot} 读档失败`).toBe(true);
      return g;
    };
    expect(读回(0).stats.data.souls).toBe(111);
    expect(读回(1).stats.data.souls).toBe(222);
    expect(读回(2).stats.data.souls).toBe(333);
  });

  it('空槽读档安静地 false，不抛错也不 toast', () => {
    const g = makeHost();
    expect(SaveSystem.load(g, 1)).toBe(false);
    expect(g.dialog.toasts).toEqual([]);
  });

  it('存副槽 toast 带槽号，主槽保持原话（老玩家看到的世界没变）', () => {
    const g = makeHost();
    SaveSystem.save(g, 0);
    SaveSystem.save(g, 2);
    expect(g.dialog.toasts).toEqual(['进度已保存', '进度已保存 · 槽3']);
  });
});

describe('槽位列表与兼容', () => {
  it('listSlots：三行、exists / version / time 齐全，空槽 exists:false', () => {
    const g = makeHost(55);
    SaveSystem.save(g, 0);
    const slots = SaveSystem.listSlots();
    expect(slots.map((s) => s.slot)).toEqual([0, 1, 2]);
    expect(slots[0]).toMatchObject({ exists: true, version: CURRENT_VERSION });
    expect(typeof slots[0].time).toBe('number');
    expect(slots[1].exists).toBe(false);
    expect(slots[1].version).toBeNull();
  });

  it('坏档在列表里是 corrupt:true，不做迁移也不碰游戏状态', () => {
    localStorage.setItem(slotKey(1), '{"version":7,');
    const slots = SaveSystem.listSlots();
    expect(slots[1].exists).toBe(true);
    expect(slots[1].corrupt).toBe(true);
    expect(slots[1].version).toBeNull();
  });

  it('旧档直接写在旧键上，默认 load() 读得回（单槽时代的行为没变）', () => {
    const g = makeHost(77);
    localStorage.setItem(SAVE_KEYS[0].key, JSON.stringify(SaveSystem.toData(g)));
    const 新 = makeHost(0);
    expect(SaveSystem.load(新)).toBe(true);
    expect(新.stats.data.souls).toBe(77);
  });

  it('源码门禁：localStorage.setItem 的裸 KEY 直写只剩"槽0 迁移落回"那一处（新写入一律经 slotKey）', () => {
    const 源码 = readFileSync(join(ROOT, 'src/game/SaveSystem.js'), 'utf8')
      .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const 直写 = [...源码.matchAll(/localStorage\.setItem\(KEY\b/g)];
    expect(直写.length, '裸 KEY 直写不止迁移落回那一处 —— 新写入必须走 slotKey').toBeLessThanOrEqual(1);
    expect(源码).toContain('slotKey(slot)');
  });
});
