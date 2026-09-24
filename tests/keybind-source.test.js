/**
 * 键位出口的唯一真源（W-A7 切片5）。
 *
 * 这一片要修的病灶：**同一条动作有两个真源**。切片1 的手柄表自己抄了一份
 * `code: 'KeyF'`，键盘侧的消费者又硬编码 `keys['KeyF']` —— 于是"把弹反改绑到 G 键"
 * 这件事在系统里没有唯一答案，而且两个真源漂移时**不会报错**，只会有一半输入失灵。
 * 这与 B36（中文显示名判定）、B45（POI id 回退）是同一类：稳定身份靠人肉复制。
 *
 * 用例的重点因此是"还有没有第二份"，而不只是"能不能改绑"。
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import {
  GAMEPAD_BINDINGS, KEY_ACTIONS, KEY_BINDINGS, KEY_ACTION_LABELS, PAD_ACTIONS,
  assertKeybindings, assertCodesDisjoint, bindingFor, buildBindingTables, codeFor, factoryKeybindings, mouseFor,
  anyDown, codesFor, partitionOverrides, resolveKeybindings, setKeybindTable,
} from '../src/content/keybinds.js';
import { UI_HOTKEYS, UI_ACTIONS } from '../src/content/hotkeys.js';
import { CombatController } from '../src/combat/CombatController.js';
import { SpellSystem } from '../src/combat/SpellSystem.js';
import { createHurtbox } from '../src/combat/Hurtbox.js';
import { TimeController } from '../src/engine/Time.js';

beforeAll(() => {
  const handlers = new Map();
  globalThis.window = {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    dispatchEvent(event) {
      handlers.get(event.type)?.forEach((fn) => fn(event));
      return true;
    },
  };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
});

// 每个用例之后把模块级生效表放回出厂：它是全局状态，泄漏会让后面的用例莫名其妙地红
afterEach(() => setKeybindTable(factoryKeybindings()));

describe('出口的唯一真源', () => {
  it('`KEY_BINDINGS` 与 `KEY_ACTIONS` 一一对应：不多不少', () => {
    expect(Object.keys(KEY_BINDINGS).sort()).toEqual([...KEY_ACTIONS].sort());
  });

  it('每格恰好一个出口，且键名不重复（按一次办两件事要在加载期红）', () => {
    expect(() => assertKeybindings(KEY_BINDINGS)).not.toThrow();
    const codes = Object.values(KEY_BINDINGS).filter((e) => e.code).map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('手柄表不再自己抄一份出口 —— 这是本切片要消灭的第二真源', () => {
    for (const [name, e] of Object.entries(GAMEPAD_BINDINGS)) {
      expect(e.code, `${name} 仍抄了 code`).toBeUndefined();
      expect(e.mouse, `${name} 仍抄了 mouse`).toBeUndefined();
    }
  });

  it('每个手柄动作都能被解析成某个出口（游戏键，或它冒充的热键）', () => {
    for (const [name, e] of Object.entries(GAMEPAD_BINDINGS)) {
      if (e.hotkey) {
        expect(UI_ACTIONS, `${name} 冒充的热键动作不存在`).toContain(e.hotkey);
      } else {
        expect(KEY_ACTIONS, `${name} 不是游戏键也没声明 hotkey`).toContain(e.action);
        expect(bindingFor(e.action), `${name} 解析不出出口`).toBeTruthy();
      }
    }
  });

  it('`PAD_ACTIONS` 里没有孤儿：每个手柄动作都真的在表里', () => {
    expect(Object.keys(GAMEPAD_BINDINGS).sort()).toEqual([...PAD_ACTIONS].sort());
  });
});

describe('codeFor / mouseFor', () => {
  it('出厂状态下读到的就是出厂键位', () => {
    expect(codeFor('parry')).toBe('KeyF');
    expect(codeFor('spell3')).toBe('Digit3');
    expect(codeFor('interact')).toBe('KeyE');
    expect(mouseFor('attackLight')).toBe('left');
    expect(mouseFor('attackHeavy')).toBe('right');
  });

  it('只绑鼠标的动作 `codeFor` 返回 null，反之亦然（不拿一个假键码糊弄调用方）', () => {
    expect(codeFor('attackLight')).toBe(null);
    expect(mouseFor('parry')).toBe(null);
  });

  it('换表之后立刻生效，且不改动出厂常量', () => {
    const before = KEY_BINDINGS.parry.code;
    setKeybindTable(resolveKeybindings(KEY_BINDINGS, { parry: 'KeyG' }));
    expect(codeFor('parry')).toBe('KeyG');
    expect(KEY_BINDINGS.parry.code).toBe(before);   // 常量是全仓的"出厂设定"
  });

  it('复位只要换回出厂表', () => {
    setKeybindTable(resolveKeybindings(KEY_BINDINGS, { parry: 'KeyG' }));
    setKeybindTable(factoryKeybindings());
    expect(codeFor('parry')).toBe('KeyF');
  });

  it('未知动作解析成 null 而不是抛（消费者在热路径上问它，不该炸）', () => {
    expect(codeFor('guildRaid')).toBe(null);
    expect(bindingFor('guildRaid')).toBe(null);
  });
});

describe('覆盖包按两张表分流', () => {
  it('UI 热键动作与游戏键动作各归各家', () => {
    const { hotkeys, keys, stray } = partitionOverrides(
      { journal: 'KeyB', parry: 'KeyG', escape: 'F1' },
      UI_ACTIONS,
    );
    expect(hotkeys).toEqual({ journal: 'KeyB', escape: 'F1' });
    expect(keys).toEqual({ parry: 'KeyG' });
    expect(stray).toEqual([]);
  });

  it('两张表都不认识的动作进 `stray` —— 调用方拿它判"配置坏了"，不静默丢掉', () => {
    const { hotkeys, keys, stray } = partitionOverrides(
      { parry: 'KeyG', guildRaid: 'KeyK' },
      UI_ACTIONS,
    );
    expect(hotkeys).toEqual({});
    expect(keys).toEqual({ parry: 'KeyG' });
    expect(stray).toEqual(['guildRaid']);
  });

  it('空覆盖包与 undefined 都不炸', () => {
    expect(partitionOverrides(undefined, UI_ACTIONS)).toEqual({ hotkeys: {}, keys: {}, stray: [] });
    expect(partitionOverrides({}, UI_ACTIONS)).toEqual({ hotkeys: {}, keys: {}, stray: [] });
  });

  it('两张动作表本身不重叠（重叠会让分流说不清该给谁）', () => {
    const overlap = UI_ACTIONS.filter((a) => KEY_ACTIONS.includes(a));
    expect(overlap).toEqual([]);
  });
});

describe('跨表撞键：两张表各自合法不等于合起来合法', () => {
  it('出厂状态下两张表互不抢占', () => {
    expect(() => assertCodesDisjoint(UI_HOTKEYS, KEY_BINDINGS)).not.toThrow();
  });

  it('把 UI 热键改绑到游戏键占用的物理键 —— 单表校验放过，跨表校验必须咬住', () => {
    // 游戏键 `parry` 出厂是 KeyF；热键表里没有任何一格用 F，所以面板旧校验会放行，
    // 结果玩家按一下 F 同时开日志和弹反。这一条就是本切片顺手补上的真缺口。
    expect(() => buildBindingTables({ journal: 'KeyF' }, UI_HOTKEYS)).toThrow(/同时被/);
  });

  it('反向同理：把游戏键改绑到 UI 热键已占用的键也要红', () => {
    expect(() => buildBindingTables({ parry: 'KeyJ' }, UI_HOTKEYS)).toThrow(/同时被/);
  });

  it('别名也进跨表校验（借一枚已属于热键的键当等价键同样是抢）', () => {
    const table = { ...factoryKeybindings(), sprint: { code: 'ShiftLeft', aliases: ['KeyJ'] } };
    expect(() => assertCodesDisjoint(UI_HOTKEYS, table)).toThrow(/同时被/);
  });

  it('一枚没人用的键仍然可用（跨表校验不是"什么都别改"）', () => {
    expect(() => buildBindingTables({ swapWeapon: 'KeyB', journal: 'KeyB' }, UI_HOTKEYS)).toThrow(/同时被/);
    expect(() => buildBindingTables({ swapWeapon: 'KeyB' }, UI_HOTKEYS)).not.toThrow();
    expect(() => buildBindingTables({}, UI_HOTKEYS)).not.toThrow();
  });

  it('两张表都不认识的动作抛，而不是悄悄丢掉那一格', () => {
    expect(() => buildBindingTables({ guildRaid: 'KeyK' }, UI_HOTKEYS)).toThrow(/两张表都不认识/);
  });

  it('合法的跨表改动通过，并返回两张可用的表', () => {
    const { hotkeyTable, keyTable } = buildBindingTables({ journal: 'KeyB' }, UI_HOTKEYS);
    expect(hotkeyTable.find((e) => e.action === 'journal').code).toBe('KeyB');
    expect(keyTable.parry.code).toBe('KeyF');    // 出厂键位没被动过
  });
});

describe('消费者真的问表（改绑真的改到行为）', () => {
  const makeEnemy = (parriable) => ({
    name: 'e', position: new THREE.Vector3(0, 0, -2), alive: true,
    maxPosture: 60, posture: 0, hits: [],
    hurtbox: createHurtbox('soldier'),
    distanceTo(p) { return Math.hypot(p.x - this.position.x, p.z - this.position.z); },
    takeDamage() { return false; }, applyKnockback() {}, clearTelegraph() {},
    hurtBaseY: () => 0, facingYaw: () => 0, getDefense: () => 0, getResist: () => 0,
    isStaggered: () => false, isParriable: () => parriable, forceStagger() {},
  });

  const makeCombat = (enemies) => {
    const player = {
      scene: new THREE.Group(),
      mesh: { getObjectByName: () => null },
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(),
      yaw: 0, characterModel: null,
      getCombatForwardXZ: () => new THREE.Vector3(0, 0, -1),
      _dashVelocity: new THREE.Vector3(), _dashRemaining: 0,
      applyDash() {}, teleport() {},
    };
    const manager = {
      enemies,
      getAliveEnemies: () => enemies.filter((e) => e.alive),
      setLockTarget() {},
    };
    const noop = () => {};
    const combat = new CombatController(
      player, manager, { toast: noop }, null,
      { swingLight: noop, swingHeavy: noop, hit: noop, heavyHit: noop, dodge: noop, parry: noop, blockClink: noop },
      null,
    );
    combat.setTimeController(new TimeController());
    return combat;
  };

  /** 法术系统：槽 4 是 buff（只改 `transformTimer`），槽 1 是蓄力起手（只改 `chargeSlot`） */
  const makeSpells = () => {
    const noop = () => {};
    const player = {
      position: new THREE.Vector3(0, 0, 0),
      combat: null,                       // 不限制施法时机
      getForwardXZ: () => new THREE.Vector3(0, 0, -1),
    };
    return new SpellSystem(new THREE.Group(), player, { getAliveEnemies: () => [] },
      null, null, { spellCast: noop, hit: noop, heavyHit: noop }, null);
  };

  it('弹反：改绑到 G 之后按 F 无效、按 G 有效', () => {
    const enemy = makeEnemy(true);
    const combat = makeCombat([enemy]);
    setKeybindTable(resolveKeybindings(KEY_BINDINGS, { parry: 'KeyG' }));

    // 按出厂键 F：消费者问的是表，所以这一下不该响
    combat.update(1 / 60, { KeyF: true });
    expect(combat.riposteWindow).toBe(0);

    // 按新键 G：响
    const keys = { KeyG: true };
    combat.update(1 / 60, keys);
    expect(combat.riposteWindow).toBeGreaterThan(0);
  });

  it('法术四：改绑之后出厂键不响、新键真的放出"大圣化身"', () => {
    setKeybindTable(resolveKeybindings(KEY_BINDINGS, { spell4: 'KeyZ' }));
    const spells = makeSpells();
    spells.update(1 / 60, { Digit4: true });
    expect(spells.transformTimer).toBe(0);          // 出口已经不在这把键上
    spells.update(1 / 60, { KeyZ: true });
    expect(spells.transformTimer).toBeGreaterThan(0);   // 施法真的发生
  });

  it('蓄力法术走同一张表：改绑 `spell1` 之后只有新键起蓄力', () => {
    setKeybindTable(resolveKeybindings(KEY_BINDINGS, { spell1: 'KeyC' }));
    const spells = makeSpells();
    spells.update(1 / 60, { Digit1: true });
    expect(spells.chargeSlot).toBe(null);
    spells.update(1 / 60, { KeyC: true });
    expect(spells.chargeSlot).toBe(1);
  });

  it('轻击出厂走鼠标：点左键出一刀', () => {
    const combat = makeCombat([]);
    combat.mouseDown.left = true;
    combat.update(1 / 60, {});
    expect(combat.state).toBe('light');
  });

  it('同时按住左右 Ctrl 只请求一次翻滚：边沿账本不许短路', () => {
    const combat = makeCombat([]);
    const seen = [];
    combat.bufferAction = (a) => { seen.push(a); };
    const keys = { ControlLeft: true, ControlRight: true };
    for (let i = 0; i < 6; i++) combat.update(1 / 60, keys);
    // `codes[0] || codes[1]` 会在左键那一帧吃掉右键的账本，下一帧右键被当成"刚按下"再滚一次
    expect(seen.filter((a) => a === 'roll')).toHaveLength(1);
  });

  it('把轻击改绑到键盘键：左键不出刀、新键出刀，且没被认领的锁存不残留', () => {
    setKeybindTable(resolveKeybindings(KEY_BINDINGS, { attackLight: 'KeyG' }));
    const combat = makeCombat([]);
    combat.mouseDown.left = true;
    combat.update(1 / 60, {});
    expect(combat.state).not.toBe('light');
    // 残留的锁存会在玩家把动作绑回鼠标的那一刻凭空补一刀
    expect(combat.mouseDown.left).toBe(false);
    combat.update(1 / 60, { KeyG: true });
    expect(combat.state).toBe('light');
  });
});

describe('静态门禁：消费者里不许再有第二份键位', () => {
  const SRC = join(process.cwd(), 'src');

  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const full = join(dir, n);
    if (statSync(full).isDirectory()) return walk(full);
    return n.endsWith('.js') ? [full] : [];
  });

  /** 剥注释与字符串，只看真正的代码 */
  const stripNonCode = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');

  it('除键位表自身外，`keys[...]` 里不许再出现硬编码的键盘码', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      const rel = file.slice(SRC.length + 1).replace(/\\/g, '/');
      // 表自身（keybinds/hotkeys）与桥的注释里会提到键名，那是文档不是判定
      if (rel === 'content/keybinds.js' || rel === 'content/hotkeys.js') continue;
      const code = stripNonCode(readFileSync(file, 'utf8'));
      for (const m of code.match(/keys\[[^\]]*\]/g) ?? []) {
        if (/'[A-Za-z]/.test(m) || /"[A-Za-z]/.test(m)) offenders.push(`${rel}: ${m}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('消费者一律经 `codeFor` 拿出口（按动作名问，而不是按物理键）', () => {
    const expected = {
      'player/PlayerController.js': ["codeFor('moveUp')", "codeFor('jump')", "codeFor('interact')", "anyDown(keys, 'sprint')"],
      'combat/CombatController.js': ["codeFor('lockOn')", "_pressedAny(keys, 'parry')", "_pressedAny(keys, 'roll')"],
      'combat/SpellSystem.js': ["codeFor('spell4')"],
      'combat/WeaponSystem.js': ["codeFor('swapWeapon')"],
      'game/FastTravelSystem.js': ["codeFor('fastTravel')"],
    };
    for (const [rel, needles] of Object.entries(expected)) {
      const src = readFileSync(join(SRC, rel), 'utf8');
      for (const needle of needles) {
        expect(src.includes(needle), `${rel} 缺少 ${needle}`).toBe(true);
      }
    }
  });

  it('`_pressed(keys, \'...\')` 里只许出现动作名 —— 键码字面量绕过 `keys[...]` 的扫描，是同一类第二真源', () => {
    // 注意：这里**只剥注释、不剥字符串** —— 上一版用 stripNonCode 把字符串也抹平了，
    // 于是扫描器看到的永远是 `_pressedAny(keys, '')`，一条都咬不住（门禁自己坏了）。
    const stripComments = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const call = /_pressed(?:Any)?\(\s*[A-Za-z_$][\w$]*\s*,\s*'([^']*)'\s*\)/g;
    const offenders = [];
    for (const file of walk(SRC)) {
      const rel = file.slice(SRC.length + 1).replace(/\\/g, '/');
      const code = stripComments(readFileSync(file, 'utf8'));
      let m;
      while ((m = call.exec(code))) {
        if (KEY_ACTIONS.includes(m[1])) continue;
        offenders.push(`${rel}: _pressed(..., '${m[1]}')`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('门禁自证：把一处动作名换回键码，扫描器必须咬得住', () => {
    const stripComments = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const call = /_pressed(?:Any)?\(\s*[A-Za-z_$][\w$]*\s*,\s*'([^']*)'\s*\)/g;
    const sample = stripComments("if (this._pressedAny(keys, 'ControlLeft')) {}");
    const hit = call.exec(sample);
    expect(hit?.[1]).toBe('ControlLeft');
    expect(KEY_ACTIONS.includes(hit[1])).toBe(false);   // 键码 → 会被记成越界
  });

  it('等价键（左右 Ctrl / 左右 Shift）由表声明，消费者不许自己写 `keys[a] || keys[b]`', () => {
    expect(KEY_BINDINGS.roll.aliases).toEqual(['ControlRight']);
    expect(KEY_BINDINGS.sprint.aliases).toEqual(['ShiftRight']);
    expect(codesFor('roll')).toEqual(['ControlLeft', 'ControlRight']);
    expect(codesFor('parry')).toEqual(['KeyF']);
    // 别名一起参与撞键校验：借别处已用的键当别名，加载期就红
    expect(() => resolveKeybindings(KEY_BINDINGS, { parry: 'ShiftLeft' })).toThrow(/已被前面的动作占用/);
    expect(anyDown({ ControlRight: true }, 'roll')).toBe(true);
    expect(anyDown({ ControlRight: true }, 'parry')).toBe(false);
  });

  it('手柄表里不许出现任何键码字面量（`Escape` 那种也不行）', () => {
    const src = readFileSync(join(SRC, 'content/keybinds.js'), 'utf8');
    const table = src.slice(src.indexOf('export const GAMEPAD_BINDINGS'), src.indexOf('const DPAD_BUTTON'));
    expect(table).not.toMatch(/\bcode\s*:/);
    expect(table).not.toMatch(/\bmouse\s*:/);
  });

  it('鼠标出口也在表上：消费者读 `mouseFor(动作)`，不许再点名字读 `mouseDown.left`', () => {
    const src = readFileSync(join(SRC, 'combat/CombatController.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(src).toMatch(/mouseFor\('attackLight'\)/);
    expect(src).toMatch(/mouseFor\('attackHeavy'\)/);
    // 点名字的读法一旦出现就是第二真源（清锁存走设备名遍历，见那段循环）
    expect(src).not.toMatch(/mouseDown\.(left|right)/);
    expect(src).toMatch(/for \(const device of MOUSE_LATCHES\)/);
  });

  it('面板与游戏走同一条校验、同一批动作名（"战斗键位可重映射"要在界面上也成立）', () => {
    const src = readFileSync(join(SRC, 'ui/SettingsPanel.js'), 'utf8');
    // 面板预览必须走合并校验：只校验热键那半张表就能写出跨表抢键
    // （第三参 `this._padOverrides()`：手柄那半张表的现状也要一起判，见切片9）
    expect(src).toMatch(/buildBindingTables\(overrides, UI_HOTKEYS, this\._padOverrides\(\)\)/);
    expect(src).not.toMatch(/applyHotkeyOverrides\(/);
    // 游戏键也要列出来给人改，否则这一片只是源码层面的自娱自乐
    expect(src).toMatch(/keybindTable/);
    expect(src).toMatch(/KEY_ACTION_LABELS/);
  });

  it('每个游戏键动作都有中文显示名：少一行，面板就是一格空白', () => {
    for (const action of Object.keys(KEY_BINDINGS)) {
      expect(KEY_ACTION_LABELS[action], `${action} 没有显示名`).toBeTruthy();
    }
    expect(Object.keys(KEY_ACTION_LABELS).sort()).toEqual([...KEY_ACTIONS].sort());
  });
});
