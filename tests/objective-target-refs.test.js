/**
 * 主线目标引用的闭包 —— 那些 id **必须真有生产者**（W-B1 切片7）。
 *
 * ## 这一片防的是什么
 *
 * 主线的一步读的是**一个具体的 id**（"摸一下世界之锚" / "和位面流浪者说话"）。
 * 那个 id 要是**没有人生产**（没有那个 POI、没有那次 `discovery` 派发、没有那位 NPC），
 * 这一步就**永远过不去** ⇒ 主线在那一格断掉 ⇒ **游戏通不了**。
 *
 * 而它**一句错都不报**：`objectiveDone` 对认不出的东西返回 `false`，
 * `conditionHolds` 对认不出的条件名也返回 `false` —— 那是**故意**的保守，
 * 可它同时意味着"卡住"这件事**没人查**。
 *
 * ## 分工（判据与执行分家）
 *
 * - **判据**（`src/content/objectiveTargets.js`，纯函数）：给定三份生产者名单，
 *   回答"每一行的引用有没有落空"。
 * - **执行**（本文件，Node 侧）：真造一个世界拿 POI 名单、扫 `src/` 拿 `discovery`
 *   派发点与 NPC 名单。
 *
 * 之所以要分家：三份生产者都在**世界层**（POI / `discovery` 事件 / NPC 定义），
 * 而 `content/` **不许向上够**（`tests/content-boundary.test.js` 钉着）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { OBJECTIVES } from '../src/content/objectives.js';
import { ECHOES } from '../src/content/echoes.js';
import { checkObjectiveTargets, checkEchoTriggers } from '../src/content/questTargets.js';
import { WorldManager } from '../src/world/WorldManager.js';
import { attachPopCultureZones } from '../src/world/PopCultureZoneEnhancer.js';

const ROOT = process.cwd();

function srcFiles(dir = 'src', out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) srcFiles(rel, out);
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}
const 读 = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const 全源码 = srcFiles().map(读).join('\n');

/** `discovery` 事件派发过的 id（世界层的派发点） */
const 发现id = new Set(
  [...全源码.matchAll(/CustomEvent\(\s*'discovery'\s*,\s*\{\s*detail:\s*\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]),
);

/**
 * `pop-culture-echo` 事件的 trigger 键（`echo:*`）—— **两个派发形状**：
 * - `fireEcho(game, 'echo:xxx')`：世界层的派发点（致敬层的那些回声）
 * - `tryUnlock('echo:xxx')`：系统层的**派生**解锁（`echo:full-resonance` 是
 *   "全部回声都共鸣了" —— 它没有派发点，由 `PopCultureEchoSystem.tryUnlock` 的
 *   `stats.percent >= 100` 分支自己放出来）
 */
const 回声触发 = new Set([
  ...[...全源码.matchAll(/fireEcho\(\s*[^,]+,\s*'(echo:[^']+)'/g)].map((m) => m[1]),
  ...[...全源码.matchAll(/tryUnlock\(\s*'(echo:[^']+)'/g)].map((m) => m[1]),
]);

/** NPC 名单：`NPCManager.js` 的 `NPC_DATA` 块里的 `id` */
function npcIds() {
  const src = 读('src/world/NPCManager.js');
  const i = src.indexOf('const NPC_DATA = [');
  if (i < 0) return new Set();
  const j = src.indexOf('];', i);
  const 块 = src.slice(i, j);
  return new Set([...块.matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]));
}

/** 真的造一个世界，拿注册过的 POI id */
function poiIds() {
  const handlers = new Map();
  globalThis.window = {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    dispatchEvent(event) { handlers.get(event.type)?.forEach((fn) => fn(event)); return true; },
  };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const scene = new THREE.Scene();
  const dialog = { show() {}, toast() {} };
  const world = new WorldManager(scene, dialog);
  world.build();
  // 致敬层也接上 —— 它自己加了一整族 POI（`attachPopCultureZones`），漏了它
  // 这份名单就不是"世界里注册过的全部 POI"
  attachPopCultureZones({ world, dialog, scene });
  const ids = new Set();
  for (const z of world.zones ?? []) for (const p of z.pois ?? []) ids.add(p.id);
  delete globalThis.window;
  delete globalThis.CustomEvent;
  return ids;
}

const 生产者 = () => ({ poiIds: poiIds(), discoveryIds: 发现id, npcIds: npcIds(), echoTriggers: 回声触发 });

describe('① 主线引用的 id 都有生产者', () => {
  it('每一行的 targetId 都落在真世界里（POI / discovery 派发点 / NPC）', () => {
    const p = 生产者();
    const errs = checkObjectiveTargets(OBJECTIVES, p);
    expect(errs, `主线引用闭包破了：\n${errs.join('\n')}`).toEqual([]);
  });

  it('扫描集自证：真的扫到了东西（扫到空集就会一路绿灯）', () => {
    const p = 生产者();
    expect(p.poiIds.size, '一个 POI 都没扫到').toBeGreaterThan(20);
    expect(p.discoveryIds.size, '一个 discovery 派发点都没扫到').toBeGreaterThan(5);
    expect(p.npcIds.size, '一个 NPC 都没扫到').toBeGreaterThan(0);
  });

  it('主线里确实有 interact / discovery / npc 这三族（判据不是空转）', () => {
    const 族 = new Set(OBJECTIVES.map((o) => o.type));
    expect(族.has('interact')).toBe(true);
    expect(族.has('discovery')).toBe(true);
    expect(族.has('npc')).toBe(true);
  });
});

describe('② 门禁会咬：三条变异臂', () => {
  it('变异臂①：把一个 targetId 改成不存在的 ⇒ 门禁红，并点名那一行', () => {
    const 假 = OBJECTIVES.map((o) => (o.id === 'anchor' ? { ...o, targetId: 'no-such-thing' } : o));
    const errs = checkObjectiveTargets(假, 生产者());
    expect(errs.length, '门禁没咬住一个不存在的 targetId').toBeGreaterThan(0);
    expect(errs.join('\n')).toMatch(/anchor/);
    expect(errs.join('\n')).toMatch(/no-such-thing/);
  });

  it('变异臂②：把一个 npc 的 targetId 改掉 ⇒ 门禁红（NPC 那族单独核）', () => {
    const 假 = OBJECTIVES.map((o) => (o.type === 'npc' ? { ...o, targetId: 'no-such-npc' } : o));
    const errs = checkObjectiveTargets(假, 生产者());
    expect(errs.length, '门禁没咬住一个不存在的 NPC').toBeGreaterThan(0);
    expect(errs.join('\n')).toMatch(/不是任何一位 NPC/);
  });

  it('变异臂③：把生产者名单清空 ⇒ 每一行都被点名（不是只报第一个）', () => {
    const 空 = { poiIds: new Set(), discoveryIds: new Set(), npcIds: new Set() };
    const errs = checkObjectiveTargets(OBJECTIVES, 空);
    const 族 = OBJECTIVES.filter((o) => o.type === 'interact' || o.type === 'discovery' || o.type === 'npc');
    expect(errs.length, '不是每一行都被点名').toBe(族.length);
  });
});

describe('③ 次元回声的 trigger 也都有派发点', () => {
  it('每一条回声的 trigger 都有对应的派发点（否则它永远不解锁）', () => {
    const errs = checkEchoTriggers(ECHOES, 生产者());
    expect(errs, `回声 trigger 闭包破了：\n${errs.join('\n')}`).toEqual([]);
  });

  it('扫描集自证：`fireEcho` 的派发点真的扫到了（扫到空集就会一路绿灯）', () => {
    expect(回声触发.size, '一个 fireEcho 派发点都没扫到').toBeGreaterThan(20);
  });

  it('变异臂④：把一个回声的 trigger 改成没人派发 ⇒ 门禁红，并点名那一条', () => {
    const 假 = ECHOES.map((e) => (e.id === 'echo-one-ring' ? { ...e, trigger: 'discovery:no-such-id' } : e));
    const errs = checkEchoTriggers(假, 生产者());
    expect(errs.length, '门禁没咬住一个没人派发的 trigger').toBeGreaterThan(0);
    expect(errs.join('\n')).toMatch(/echo-one-ring/);
    expect(errs.join('\n')).toMatch(/no-such-id/);
  });

  it('变异臂⑤：trigger 的形状不认识 ⇒ 门禁红（不是静默不解锁）', () => {
    const 假 = ECHOES.map((e) => (e.id === 'echo-one-ring' ? { ...e, trigger: 'whatever:xxx' } : e));
    const errs = checkEchoTriggers(假, 生产者());
    expect(errs.length, '门禁没咬住一个形状不认识的 trigger').toBeGreaterThan(0);
    expect(errs.join('\n')).toMatch(/形状不认识/);
  });
});
