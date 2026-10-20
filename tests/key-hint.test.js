/**
 * 显示这一侧的唯一真源（W-A7 切片6）。
 *
 * 切片5 让"哪个动作按哪枚键"只剩一张生效表，但那说的是**输入**。玩家看得见的话
 * 是另一半：HUD 写 `F`、教程写"F 弹反"、交互条写 `[E]` —— 把弹反改绑到 Y 之后，
 * 输入按新键走，屏幕上却同时留着一整片旧键名，界面从此说谎。
 *
 * 所以这一片要盯的是：键名**只能问**，不能抄。抄回来的字符串可以当场比对，
 * 也可以被下一段改掉生效表 —— 只有"现问"的那一处会跟着改口。
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  KEY_ACTIONS, buildBindingTables, factoryKeybindings, setKeybindTable,
  padCellSource, padOutletsFor,
} from '../src/content/keybinds.js';
import { UI_ACTIONS, UI_HOTKEYS, setHotkeyTable } from '../src/content/hotkeys.js';
import {
  KEY_LABELS, MOUSE_LABELS, keyLabel, mouseLabel, padSourceLabel,
} from '../src/content/keyLabels.js';
import {
  hintDevice, keyHint, keyStamp, keyText, keyTextCacheSize, refreshKeyText,
  setHintDevice, setHintPadOutlets,
} from '../src/content/keyHints.js';
import { INPUT_DEVICE_KINDS } from '../src/engine/InputDevice.js';
import { scheduler } from '../src/engine/Scheduler.js';
import { Tutorial } from '../src/ui/Tutorial.js';
import { ContextualTutorial } from '../src/ui/ContextualTutorial.js';
import { DeathHintDirector } from '../src/game/DeathHintDirector.js';

// 只给"播出时展开"那三条用：这三个类各自登记一个事件/读一次本地存储
beforeAll(() => {
  globalThis.window = { addEventListener() {}, dispatchEvent: () => true };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  // 对话框关闭按钮：情境教程播出后会往它上面挂续播回调
  globalThis.document = { getElementById: () => null };
});

// 生效表是模块级全局：泄漏会让后面的用例莫名其妙地红
afterEach(() => {
  setKeybindTable(factoryKeybindings());
  setHotkeyTable(UI_HOTKEYS.map((e) => ({ ...e })));
  setHintDevice(null);
  setHintPadOutlets(null);
});

describe('键码 → 显示名', () => {
  it('字母与数字键去掉 `Key`/`Digit` 前缀', () => {
    expect(keyLabel('KeyF')).toBe('F');
    expect(keyLabel('Digit3')).toBe('3');
  });

  it('修饰键与功能键说人话（不是 `ControlLeft`）', () => {
    expect(keyLabel('Escape')).toBe('Esc');
    expect(keyLabel('Space')).toBe('空格');
    expect(keyLabel('ControlRight')).toBe('右 Ctrl');
    expect(keyLabel('ArrowUp')).toBe('↑');
  });

  it('没登记过的键码原样显示 —— 空白比难读更糟', () => {
    expect(keyLabel('Numpad5')).toBe('Numpad5');
  });

  it('鼠标出口有名字（轻击/重击出厂就绑在鼠标上）', () => {
    expect(mouseLabel('left')).toBe('鼠标左键');
    expect(mouseLabel('right')).toBe('鼠标右键');
    expect(Object.keys(MOUSE_LABELS)).toEqual(['left', 'right']);
  });

  it('`KEY_LABELS` 里的键码都是合法 `code` 形状（写错的键码永远不会命中）', () => {
    for (const code of Object.keys(KEY_LABELS)) expect(code).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
  });
});

describe('keyHint：动作名 → 当前该按什么', () => {
  it('游戏键动作问游戏键表', () => {
    expect(keyHint('parry')).toBe('F');
    expect(keyHint('interact')).toBe('E');
  });

  it('UI 热键动作问热键表 —— 它不在 `KEY_BINDINGS` 里', () => {
    expect(keyHint('journal')).toBe('J');
    expect(keyHint('escape')).toBe('Esc');
    expect(KEY_ACTIONS).not.toContain('journal');
  });

  it('只绑鼠标的动作给鼠标字样', () => {
    expect(keyHint('attackLight')).toBe('鼠标左键');
  });

  it('两张表都不认识的动作返回 null（由 `keyText` 决定要不要抛）', () => {
    expect(keyHint('summonDragon')).toBe(null);
  });
});

describe('keyText：文案里的键名占位', () => {
  it('只替换 `{动作}`，其余一个字都不动', () => {
    expect(keyText('{parry} 弹反，{journal} 看日志')).toBe('F 弹反，J 看日志');
    expect(keyText('没有键名的句子')).toBe('没有键名的句子');
  });

  it('四枚移动键连着写就是 WASD（出厂布局）', () => {
    expect(keyText('{moveUp}{moveLeft}{moveDown}{moveRight}')).toBe('WASD');
  });

  it('数字范围写法各占一枚动作', () => {
    expect(keyText('[按住 {spell1}~{spell4}]')).toBe('[按住 1~4]');
  });

  it('占位写错字当场红 —— 不能让玩家看见 `{pray}`', () => {
    expect(() => keyText('按 {pray} 祈祷')).toThrow(/不是任何已登记的动作/);
    expect(() => keyText('按 {PARRY} 弹反')).toThrow(/不是任何已登记的动作/);
  });

  it('改绑游戏键之后，同一句文案跟着改口（缓存按轮次作废）', () => {
    expect(keyText('{parry} 弹反')).toBe('F 弹反');
    const { keyTable } = buildBindingTables({ parry: 'KeyI' }, UI_HOTKEYS);
    setKeybindTable(keyTable);
    expect(keyText('{parry} 弹反')).toBe('I 弹反');
  });

  it('改绑 UI 热键同样作废旧缓存（两张表各有各的轮次）', () => {
    expect(keyText('按 {journal} 打开日志')).toBe('按 J 打开日志');
    const { hotkeyTable } = buildBindingTables({ journal: 'KeyB' }, UI_HOTKEYS);
    setHotkeyTable(hotkeyTable);
    expect(keyText('按 {journal} 打开日志')).toBe('按 B 打开日志');
  });

  it('动态模板再多也不会把缓存撑爆（有上界）', () => {
    for (let i = 0; i < 400; i++) keyText(`迷宫 ${i} 房 · 按 {interact} 离开`);
    expect(keyTextCacheSize()).toBeLessThanOrEqual(128);
    expect(keyText('按 {interact} 离开')).toBe('按 E 离开');
  });
});

describe('refreshKeyText：整片容器按生效表重算', () => {
  /** 没有 jsdom，所以喂一个只认这两种选择器的假根节点 */
  const fakeRoot = (nodes) => ({
    querySelectorAll: (sel) => nodes.filter((n) => n.sel === sel),
  });

  it('`data-keys` 是键位格子：多枚键以 ` / ` 相连', () => {
    const cell = { sel: '[data-keys]', dataset: { keys: 'spell1 spell2 spell3' }, textContent: '' };
    refreshKeyText(fakeRoot([cell]));
    expect(cell.textContent).toBe('1 / 2 / 3');
  });

  it('`data-ktext` 是整句文案：`{动作}` 就地展开', () => {
    const line = { sel: '[data-ktext]', dataset: { ktext: '左下角或按 {autoPlay}' }, textContent: '' };
    refreshKeyText(fakeRoot([line]));
    expect(line.textContent).toBe('左下角或按 N');
  });

  it('重算之后改过绑定的界面会显示新键（构造期拼好的 DOM 不会冻在出厂键上）', () => {
    const cell = { sel: '[data-keys]', dataset: { keys: 'parry' }, textContent: '' };
    refreshKeyText(fakeRoot([cell]));
    expect(cell.textContent).toBe('F');
    setKeybindTable(buildBindingTables({ parry: 'KeyI' }, UI_HOTKEYS).keyTable);
    refreshKeyText(fakeRoot([cell]));
    expect(cell.textContent).toBe('I');
  });

  it('两种声明混在一个容器里也各自处理', () => {
    const a = { sel: '[data-keys]', dataset: { keys: 'save load' }, textContent: '' };
    const b = { sel: '[data-ktext]', dataset: { ktext: '{escape} 停止' }, textContent: '' };
    refreshKeyText(fakeRoot([a, b]));
    expect([a.textContent, b.textContent]).toEqual(['P / L', 'Esc 停止']);
  });

  it('空容器什么都不做（不炸）', () => {
    expect(() => refreshKeyText(fakeRoot([]))).not.toThrow();
  });
});

describe('存模板、播的时候才展开（建得早的界面不会冻在出厂键上）', () => {
  /** 三个类各自只要一个能收文案的对话框：`toast` 与 `show` 都往同一个袋子里放 */
  const fakeDialog = (bag) => ({
    toast: (text) => bag.push(text),
    show: (_title, text) => bag.push(text),
  });

  it('教程第一步播出时按当时的生效表展开，而不是构造时那一份', () => {
    const toasts = [];
    new Tutorial(fakeDialog(toasts));
    setKeybindTable(buildBindingTables({ moveUp: 'KeyZ' }, UI_HOTKEYS).keyTable);
    for (let i = 0; i < 60 && !toasts.length; i++) scheduler.update(0.1);
    expect(toasts[0]).toBe('欢迎来到《跨界纪元》。点击画面锁定鼠标，ZASD 移动。');
    scheduler.clear('tutorial-intro');
  });

  it('倒下提示在复活那一刻展开（HINTS 是模块级常量，展开晚了才不会说谎）', () => {
    const toasts = [];
    const d = new DeathHintDirector({ dialog: fakeDialog(toasts), quests: { chapter: 1 } });
    setKeybindTable(buildBindingTables({ interact: 'KeyC' }, UI_HOTKEYS).keyTable);
    d.onRespawn();
    expect(toasts[0]).toBe('提示 · 营火 C 可回满生命；J 日志有 Boss 攻略与流派说明。');
  });

  it('情境教程排队期间改绑，播出时跟到新键', () => {
    const shown = [];
    const c = new ContextualTutorial({ dialog: fakeDialog(shown) });
    // W-D2 切片16g：`trigger()` 收的是**文案键**（数据层只存键）——
    // 模板与展开的时机没变：仍是"触发时只存模板，播出时才展开"，
    // 所以排队期间改绑，播出时跟到新键。
    c.trigger('probe', 'guide_title_complete', 'guide_hint_dungeon_exit');
    setKeybindTable(buildBindingTables({ interact: 'KeyC' }, UI_HOTKEYS).keyTable);
    scheduler.update(0.5);
    expect(shown).toEqual(['▶ 守钥者已倒 — 出口环 C 离开']);
    scheduler.clear('contextual-tip');
  });
});

describe('动作覆盖：两张表的动作名都能被 `keyHint` 问出来', () => {
  it('`KEY_ACTIONS` 全部有显示名（重映射界面列得出来的，文案里就该问得到）', () => {
    for (const action of KEY_ACTIONS) expect(keyHint(action), action).toBeTruthy();
  });

  it('`UI_ACTIONS` 全部有显示名', () => {
    for (const action of UI_ACTIONS) expect(keyHint(action), action).toBeTruthy();
  });
});

/**
 * 提示出口要知道"现在这一手是哪套输入"（W-A7 切片33）。
 *
 * 切片6 把键名出口收成一处，切片29 记下了"最近一次被按动的是哪一侧"，但两者没接上：
 * 手柄玩家走到营火前，屏幕上写着"按 E"，而手柄表里 `interact` 早就有出口（切片31）。
 * 这一片把那本账接到出口上，规矩三条、用例逐条钉：
 * 1. **手柄侧真有出口**的动作才改口（`spell2` 没有手柄格，照旧说键盘）；
 * 2. 按钮格说按钮名、摇杆格说两个入口、冒充热键的格子一起并列；
 * 3. 换手与改绑一样会让旧文案变成假话 —— 缓存必须跟着作废。
 */
describe('这一手是哪套输入：手柄玩家的提示改说手柄那一格', () => {
  /** 生效手柄表接进提示出口（与 `Game.rebuildHotkeys` 同一条路：表在，取值函数就在） */
  const wire = (padOverrides = {}, uiPadOverrides = {}) => {
    const { padTable, uiPadTable } = buildBindingTables({}, UI_HOTKEYS, padOverrides, uiPadOverrides);
    setHintPadOutlets((action) => padOutletsFor(padTable, uiPadTable, action));
    return { padTable, uiPadTable };
  };

  it('没接线时手柄侧退回键盘那一套（改绑那一处还没跑到时的样子）', () => {
    setHintPadOutlets(null);
    setHintDevice('gamepad');
    expect(keyHint('interact')).toBe('E');
  });

  it('拼错的输入侧要抛：拼错的后果是永远退回键盘那一套，而它不会报错', () => {
    expect(() => setHintDevice('gamePad')).toThrow(/未知的输入侧/);
    expect(() => setHintDevice('touch')).toThrow(/未知的输入侧/);
    expect(setHintDevice(null)).toBe(null);
    expect(hintDevice()).toBe(null);
  });

  /**
   * 名单在两边各有一份（`content/` 不许向上 import，所以 `keyHints.js` 抄了一份），
   * 分家的口子由这一条焊住：引擎那边加一侧而这里没跟上，提示会静默退回键盘那一套。
   */
  it('引擎那份名单逐个喂得进来（两边各一份，靠用例对齐）', () => {
    for (const kind of INPUT_DEVICE_KINDS) expect(setHintDevice(kind), kind).toBe(kind);
    expect(() => setHintDevice(null)).not.toThrow();
  });

  it('手柄侧：`interact` 说右摇杆按下（切片31 补的那一格）', () => {
    wire();
    setHintDevice('gamepad');
    expect(hintDevice()).toBe('gamepad');
    expect(keyHint('interact')).toBe('右摇杆按下');
  });

  it('按钮格说按钮名、摇杆格说两个入口（`padStickLabel` 存在的理由）', () => {
    wire();
    setHintDevice('gamepad');
    expect(keyHint('spell1')).toBe('LT');
    expect(keyHint('attackLight')).toBe('RB');
    expect(keyHint('moveUp')).toBe('左摇杆 ↑ + 十字键 ↑');
  });

  it('冒充 UI 热键的格子一起收：`escape` 今天有三个主人，并列说', () => {
    wire();
    setHintDevice('gamepad');
    expect(keyHint('escape')).toBe('Start / B');
    expect(keyHint('uiUp')).toBe('左摇杆 ↑ + 十字键 ↑');
  });

  it('手柄侧没有出口的动作照旧说键盘 —— 手柄玩家未必没有键盘，什么都不说比说别的更糟', () => {
    wire();
    setHintDevice('gamepad');
    expect(keyHint('spell2')).toBe('2');
    expect(keyHint('fastTravel')).toBe('T');
    expect(keyHint('journal')).toBe('J');
  });

  it('键盘 / 鼠标 / 还没动过：一个字都不变', () => {
    wire();
    for (const kind of [null, 'keyboard', 'mouse']) {
      setHintDevice(kind);
      expect(keyHint('interact'), String(kind)).toBe('E');
      expect(keyHint('attackLight'), String(kind)).toBe('鼠标左键');
      expect(keyText('{spell1} 法术'), String(kind)).toBe('1 法术');
    }
  });

  it('换手之后同一句文案跟着改口，改回来又换回去（缓存按轮次作废）', () => {
    wire();
    expect(keyText('[{interact}] 休息')).toBe('[E] 休息');
    setHintDevice('gamepad');
    expect(keyText('[{interact}] 休息')).toBe('[右摇杆按下] 休息');
    setHintDevice('keyboard');
    expect(keyText('[{interact}] 休息')).toBe('[E] 休息');
  });

  it('`keyStamp` 把设备算进去（画布缓存那条链：改手不换图 = 图上还是旧键名）', () => {
    wire();
    setHintDevice('keyboard');
    const keyboardStamp = keyStamp();
    setHintDevice('gamepad');
    expect(keyStamp()).not.toBe(keyboardStamp);
    setHintDevice('keyboard');
    expect(keyStamp()).toBe(keyboardStamp);
  });

  it('改绑跟着走：`interact` 搬去 LB 之后，手柄侧的提示也说 LB', () => {
    wire({ interact: 'leftBumper', lockOn: 'rightStick' });
    setHintDevice('gamepad');
    expect(keyHint('interact')).toBe('LB');
  });

  it('每个游戏键动作的手柄出口都问得出来，名单不抄：`padOutletsFor` 逐表推', () => {
    const { padTable, uiPadTable } = wire();
    for (const action of KEY_ACTIONS) {
      for (const cell of padOutletsFor(padTable, uiPadTable, action)) {
        expect(padSourceLabel(padCellSource(cell)), action).toBeTruthy();
      }
    }
    expect(padOutletsFor(padTable, uiPadTable, 'spell2')).toEqual([]);
  });

  it('`padCellSource` 只认两种形状，认不出来返回 null（说不出口的格子不许编个名字）', () => {
    expect(padCellSource({ button: 'a' })).toEqual({ kind: 'button', name: 'a' });
    expect(padCellSource({ axes: [0, 1], dir: 'up' })).toEqual({ kind: 'stick', dir: 'up' });
    expect(padCellSource({ hotkey: 'escape' })).toBe(null);
    expect(padCellSource(null)).toBe(null);
    expect(padSourceLabel({ kind: '摇杆' })).toBe(null);
    expect(padSourceLabel(null)).toBe(null);
  });

  /**
   * 唯一转述点的**行为侧**（切片34）。
   *
   * 上面那几条都是直接调 `setHintDevice`，而生产里没有人这样调它 —— 真正喂它的是
   * `HUD.refreshKeyHints()`。只测模块就是在测我自己的写法：把 `HUD` 里那一句删掉，
   * 模块用例照常全绿，玩家屏幕上却永远写着键盘键名（`tests/input-device.test.js` 那条
   * 静态扫描会红，但静态红只说"字形没了"，说不出"玩家看到什么"）。
   *
   * 所以这里跑**真方法 + 真设备账**，格子用假 DOM 记账：`refreshKeyHints()` 是
   * "先同步出口、再重算声明式那批"，两件事的顺序反过来就得到"出口是新手、格子是旧键名"。
   */
  it('走真 `HUD.refreshKeyHints()`：出口跟着换手，声明式那批格子也当场按新手改口', async () => {
    const { HUD } = await import('../src/ui/HUD.js');
    const { InputDevice } = await import('../src/engine/InputDevice.js');
    wire();
    const cell = { dataset: { keys: 'interact' }, textContent: '' };
    const prevDoc = globalThis.document;
    globalThis.document = {
      getElementById: () => null,
      querySelectorAll: (sel) => (sel === '[data-keys]' ? [cell] : []),
    };
    const d = new InputDevice();
    const hud = { game: { inputDevice: d } };
    try {
      refreshKeyText(globalThis.document);
      expect(cell.textContent, '还没动过：格子说键盘那一套').toBe('E');

      d.note('gamepad');
      HUD.prototype.refreshKeyHints.call(hud);
      expect(hintDevice(), '换手要写进出口（生产里只有 HUD 那一处会写）').toBe('gamepad');
      expect(cell.textContent, '重算要按新手那一套重写：先同步再重算，顺序反了这格还是旧键名').toBe('右摇杆按下');

      d.note('keyboard');
      HUD.prototype.refreshKeyHints.call(hud);
      expect(cell.textContent).toBe('E');

      d.note('gamepad');
      d.reset();
      HUD.prototype.refreshKeyHints.call(hud);
      expect(hintDevice(), '回到"还没动过"也是变化：提示要收回键盘那一套').toBe(null);
      expect(cell.textContent).toBe('E');
    } finally {
      globalThis.document = prevDoc;
    }
  });
});
