/**
 * UI 热键派发（W-A7 切片3）—— 把"只有键盘能开的菜单"改成键盘与手柄同源。
 *
 * 改前这些判断全写在 `Game.setupInput()` 的 `keydown` 分支里，于是有两件事必然发生：
 * 手柄按不动菜单（它不产生 `keydown`），以及**按住不放会连发**（浏览器重发 keydown，
 * 按住 Tab 就把区域面板抖成筛子）。这一片把派发挪到"每帧轮询 `keys` 的边沿"，
 * 顺带给 Escape 那条七层级联补上它一直缺的特征测试。
 *
 * 用例分三层：表本身（唯一性与 `Game.js` 的覆盖）、派发时机语义（边沿 / 阻塞 / 表外键）、
 * 级联顺序（每个分支谁先吃掉这一下）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UI_HOTKEYS, UI_ACTIONS, assertHotkeys } from '../src/content/hotkeys.js';
import { HotkeyRouter, escapeRoute } from '../src/ui/HotkeyRouter.js';

function mk(blocked = () => false) {
  const calls = [];
  const router = new HotkeyRouter({ table: UI_HOTKEYS, isBlocked: blocked, onAction: (a) => calls.push(a) });
  return { router, calls };
}

const srcOfGame = () => readFileSync(join(__dirname, '../src/core/Game.js'), 'utf8');

describe('热键表：一个键一个动作', () => {
  it('真表过校验，且动作清单与表严格等长', () => {
    expect(() => assertHotkeys()).not.toThrow();
    expect(UI_ACTIONS).toHaveLength(UI_HOTKEYS.length);
  });

  it('重复的 code 与重复的动作各自抛错（两种都是"按一次办两件事 / 说不清谁在派发"）', () => {
    expect(() => assertHotkeys([
      { code: 'KeyH', action: 'help' },
      { code: 'KeyH', action: 'journal' },
    ])).toThrow(/code 已被前面/);
    expect(() => assertHotkeys([
      { code: 'KeyH', action: 'help' },
      { code: 'KeyM', action: 'help' },
    ])).toThrow(/重复绑定/);
  });

  it('空 code 与缺动作名都是错表', () => {
    expect(() => assertHotkeys([{ code: '', action: 'help' }])).toThrow(/非空字符串/);
    expect(() => assertHotkeys([{ code: 'KeyQ' }])).toThrow(/缺 action/);
  });

  it('静态门禁：`Game.runHotkey` 覆盖表里全部动作，一个都不许漏', () => {
    const body = srcOfGame().match(/runHotkey\(action\)\s*\{[\s\S]*?\n\s{2}\}/);
    expect(body, '找不到 runHotkey 的函数体').toBeTruthy();
    const handled = [...body[0].matchAll(/case '([a-zA-Z]+)'/g)].map((m) => m[1]);
    expect([...UI_ACTIONS].sort()).toEqual([...handled].sort());
  });

  it('静态门禁：`keydown` 监听器只记键位，不许再写 `e.code ===`（分支加回去就是第二个派发真源）', () => {
    const listener = srcOfGame().match(/addEventListener\('keydown'[\s\S]*?\n\s{4}\}\)/);
    expect(listener, '找不到 keydown 监听器').toBeTruthy();
    expect(listener[0]).not.toMatch(/e\.code ===/);
    expect(listener[0]).toMatch(/this\.keys\[e\.code\] = true/);
    expect(listener[0]).toMatch(/this\.hotkeys\.onKeydown\(e\.code\)/);
  });
});

describe('派发语义：边沿、阻塞、表外键', () => {
  it('按下那一帧派发一次，按住五帧还是一次（改前会跟着浏览器重发连发五次）', () => {
    const { router, calls } = mk();
    const keys = {};
    keys.Tab = true;
    for (let i = 0; i < 5; i++) {
      router.poll(keys);
    }
    expect(calls).toEqual(['zonePanel']);
  });

  it('松开再按才算第二次', () => {
    const { router, calls } = mk();
    const keys = { KeyM: true };
    router.poll(keys);
    keys.KeyM = false;
    router.poll(keys);
    keys.KeyM = true;
    router.poll(keys);
    expect(calls).toEqual(['minimap', 'minimap']);
  });

  it('表外的键不派发：玩家的移动键不许被 UI 层吃掉', () => {
    const { router, calls } = mk();
    router.poll({ KeyW: true, Space: true, ControlLeft: true });
    expect(calls).toEqual([]);
  });

  it('阻塞时既不派发也不请求挡默认行为（焦点该还给浏览器）', () => {
    const { router, calls } = mk((code) => code === 'Tab');
    expect(router.onKeydown('Tab')).toBe(false);
    router.poll({ Tab: true });
    router.poll({});
    expect(calls).toEqual([]);
  });

  it('事件时没阻塞、轮询时已阻塞 → 这一下丢弃，而不是延后到解锁那一帧补发', () => {
    let blocked = false;
    const { router, calls } = mk(() => blocked);
    expect(router.onKeydown('KeyJ')).toBe(false);   // KeyJ 本就不挡默认行为，这里只验判据走了
    blocked = true;
    router.poll({ KeyJ: true });
    blocked = false;
    router.poll({ KeyJ: true });                   // 边沿已经用掉，不该补发
    expect(calls).toEqual([]);
  });

  it('preventDefault 只给声明过的键：KeyH/Tab/F2 挡，KeyM/Escape/未知键不挡', () => {
    const { router } = mk();
    expect(router.onKeydown('KeyH')).toBe(true);
    expect(router.onKeydown('Tab')).toBe(true);
    expect(router.onKeydown('F2')).toBe(true);
    expect(router.onKeydown('KeyM')).toBe(false);
    expect(router.onKeydown('Escape')).toBe(false);
    expect(router.onKeydown('KeyZ')).toBe(false);
  });

  it('键盘与手柄同路：只写 `keys`（没有任何事件）也能派发菜单动作', () => {
    const { router, calls } = mk();
    const keys = {};
    keys.Escape = true;      // 手柄的 Start 冒充的就是这一格
    router.poll(keys);
    expect(calls).toEqual(['escape']);
  });
});

describe('Escape 那七层级联：顺序就是产品决策', () => {
  const NONE = {
    endCreditsSkippable: false, combatCinematicSkippable: false, worldMapOpen: false,
    autoPlayActive: false, helpOpen: false, cinematicActive: false,
  };

  it('什么都没开着 → 暂停菜单', () => {
    expect(escapeRoute({ ...NONE })).toBe('pauseMenu');
  });

  it('每一层单独为真时各归其主', () => {
    expect(escapeRoute({ ...NONE, endCreditsSkippable: true })).toBe('endCredits');
    expect(escapeRoute({ ...NONE, combatCinematicSkippable: true })).toBe('combatCinematic');
    expect(escapeRoute({ ...NONE, worldMapOpen: true })).toBe('worldMap');
    expect(escapeRoute({ ...NONE, autoPlayActive: true })).toBe('autoPlay');
    expect(escapeRoute({ ...NONE, helpOpen: true })).toBe('help');
    expect(escapeRoute({ ...NONE, cinematicActive: true })).toBe('cinematic');
  });

  it('多层同时为真时按优先级逐层吃掉（整条阶梯一次验完）', () => {
    const order = ['endCredits', 'combatCinematic', 'worldMap', 'autoPlay', 'help', 'cinematic', 'pauseMenu'];
    const flags = ['endCreditsSkippable', 'combatCinematicSkippable', 'worldMapOpen', 'autoPlayActive', 'helpOpen', 'cinematicActive'];
    const state = {};
    for (const f of flags) state[f] = true;
    order.forEach((who, i) => {
      expect(escapeRoute(state)).toBe(who);
      if (flags[i]) state[flags[i]] = false;         // 让这一层不吃，才轮到下一层
    });
  });

  it('地图上开着自动演示：先关地图（它挡在最前面），而不是先停演示', () => {
    expect(escapeRoute({ ...NONE, worldMapOpen: true, autoPlayActive: true })).toBe('worldMap');
  });
});
