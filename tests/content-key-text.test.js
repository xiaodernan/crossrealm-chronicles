/**
 * 成段内容文案的键名是**现问生效表**的（W-B2 切片4）。
 *
 * 切片6（W-A7）把界面那侧改成"键名问表"之后，账本里还剩 45 笔在**内容文案**里：
 * 说明书七章正文、营火六座树的台词与选项。它们不是界面模板，而是数据表里的成段中文 ——
 * 结果是同一条事实在两个地方各说一遍：玩家在设置面板把弹反改成 `Y`，
 * HUD 立刻说 `Y`，说明书却还写着"F — 弹反"。这不是排版问题，是界面在说谎。
 *
 * 这一片立的规矩有两条，本文件一条条钉：
 * 1. **表里只留动作名**（`{parry}`），键名一段都不抄进数据；
 * 2. **每一个显示出口都展开**（`keyText`）—— 只展开正文不展开选项，玩家就看到半句真话半段花括号。
 *
 * 与"存进下游的那一份"的分工也在这里钉：营火对话的台词会被 NPC 气泡与营火记忆**存下来**，
 * 那些界面不认识占位，所以 `RestDialogue` 在离开自己那张表之前就把键名展开完（快照语义）。
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { factoryKeybindings, setKeybindTable, buildBindingTables } from '../src/content/keybinds.js';
import { UI_HOTKEYS, setHotkeyTable } from '../src/content/hotkeys.js';
import { REST_DIALOGUES } from '../src/content/restDialogues.js';
import { HelpManual } from '../src/ui/HelpManual.js';
import { RestDialogue } from '../src/game/RestDialogue.js';
import { fakeDoc, fakePanel, fakeItem, fakeBox } from './helpers/fakePanelDom.js';

beforeAll(() => {
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
});

/** 生效表是模块级全局：泄漏会让后面的用例莫名其妙地红 */
afterEach(() => {
  setKeybindTable(factoryKeybindings());
  setHotkeyTable(UI_HOTKEYS.map((e) => ({ ...e })));
  globalThis.window = undefined;
});

/** 玩家那侧的改绑入口：一份覆盖包 → 两张生效表（与 `Game.rebuildHotkeys` 同一条路） */
function rebind(overrides) {
  const { hotkeyTable, keyTable } = buildBindingTables(overrides, UI_HOTKEYS, {}, {});
  setHotkeyTable(hotkeyTable);
  setKeybindTable(keyTable);
}

/* ------------------------------------------------------------- 说明书 */

/** 说明书要的四格宿主：面板、章节清单、正文、关闭键（`index.html` 里就是这四格） */
function mountManual() {
  const close = fakeItem('help-close');
  const navButtons = [fakeItem('sec-start'), fakeItem('sec-combat')];
  [close, ...navButtons].forEach((el) => { el.doc = null; });
  const panel = fakePanel([close, ...navButtons], { setActive() {} }, 'help-manual');
  const nav = fakeBox('help-nav');
  nav.querySelectorAll = () => navButtons;
  const body = fakeBox('help-body');
  const doc = fakeDoc({
    'help-manual': panel.host, 'help-nav': nav, 'help-body': body,
    'help-close': close, 'pause-manual': fakeItem('pause-manual'),
  });
  globalThis.document = doc;
  const manual = new HelpManual({ pauseMenu: { panel: null } });
  return { manual, body, nav };
}

describe('说明书正文：键名从生效表来', () => {
  it('出厂键位下，正文里一个花括号都不留（占位没被展开就是漏在渲染那一处）', () => {
    const { manual, body } = mountManual();
    manual.show();
    expect(body.innerHTML).toContain('<pre class="help-text">');
    expect(body.innerHTML).not.toMatch(/\{[a-zA-Z]/);
    expect(body.innerHTML).toContain('WASD 移动，左 Shift 冲刺');   // `{sprint}` → 出厂那枚（与设置面板同一写法）
  });

  it('战斗章节说得出弹反、翻滚、法术在哪枚键上（这一章是玩家改绑最常动的那几格）', () => {
    const { manual, body } = mountManual();
    manual.show();
    manual.showSection('combat');
    expect(body.innerHTML).toContain('F — 弹反');
    expect(body.innerHTML).toContain('Ctrl — 闪避');
    expect(body.innerHTML).toContain('1–4 — 法术');
  });

  it('改绑之后开着的那一页当场改口：正文与章节清单一起重算', () => {
    const { manual, body, nav } = mountManual();
    manual.show();
    manual.showSection('combat');
    rebind({ parry: 'KeyI', roll: 'KeyJ', escape: 'KeyC', journal: 'KeyO' });
    manual.refreshKeyHints();
    expect(body.innerHTML).toContain('I — 弹反');
    expect(body.innerHTML).toContain('J — 闪避');
    expect(body.innerHTML).not.toContain('F — 弹反');
    // 出厂那张表的字面动作名不该出现在正文里（说明书没有 `{parry}` 这种残留，也没有旧的 F）
    expect(nav.innerHTML).not.toMatch(/\{[a-zA-Z]/);
  });

  it('没开着的时候不重画：下一次 show() 用的就是新表（所以不必给关着的面板留一份账）', () => {
    const { manual, body } = mountManual();
    manual.show();
    manual.showSection('start');
    const before = body.innerHTML;
    manual.hide();
    rebind({ journal: 'KeyO' });
    manual.refreshKeyHints();
    expect(body.innerHTML).toBe(before);                            // 关着 → 一行都不动
    manual.show();
    expect(body.innerHTML).toContain('按 O 打开任务日志');            // 打开才现问生效表
  });

  it('账本清掉的这四十五章不许悄悄回来：正文里再出现死键名就红', () => {
    const { manual, body } = mountManual();
    for (const id of ['start', 'combat', 'world', 'dungeons', 'bosses', 'autoplay', 'perf-hud']) {
      manual.showSection(id);
      // 展开之后仍然是"F"这种写法的地方只剩 `WASD` 那条（四键连写，账本里记着）
      expect(body.innerHTML, `${id} 章里有没走占位的键名`).not.toMatch(/(?:按\s|[—–]\s)(?:Esc|F2|F3|F10)\b/);
    }
  });
});

/* --------------------------------------------------------- 营火对话 */

/** 假 window：`RestDialogue` 发对话事件用（NPC 气泡与营火记忆就是这两个下游） */
function listeningWindow() {
  const events = [];
  globalThis.window = {
    addEventListener() {},
    dispatchEvent: (e) => { events.push(e); return true; },
  };
  return events;
}

function campfire() {
  const shown = [];
  const journaled = [];
  const game = {
    quests: { chapter: 5 },
    audio: {},
    dialog: { showChoices: (title, html, choices, meta) => shown.push({ title, html, choices, meta }), toast: () => {} },
    storyJournal: { add: (e) => journaled.push(e) },
  };
  const rd = new RestDialogue(game);
  rd.activeRest = { id: 'hub', name: '枢纽营火' };
  return { rd, shown, journaled };
}

describe('营火台词与选项：出这张表之前就把键名展开', () => {
  it('台词里的 `{interact}` 在出厂键位下显示成 E', () => {
    const { rd, shown } = campfire();
    listeningWindow();
    rd._showNode(REST_DIALOGUES.hub, 'rematch');
    expect(shown).toHaveLength(1);
    expect(shown[0].html).toContain('按 E 召唤');
    expect(shown[0].html).not.toMatch(/\{[a-zA-Z]/);
  });

  it('关键词高亮没被这一片弄坏（`**再战**` 仍然是一个 <strong>）', () => {
    const { rd, shown } = campfire();
    listeningWindow();
    rd._showNode(REST_DIALOGUES.hub, 'rematch');
    expect(shown[0].html).toContain('<strong class="dialog-kw">再战</strong>');
  });

  it('选项标签与台词一起展开：漏一处就是半句真话半段花括号', () => {
    const { rd, shown } = campfire();
    listeningWindow();
    rd.activeRest = { id: 'void', name: '破碎时线营火' };
    rd._showNode(REST_DIALOGUES.void, 'start');
    const labels = shown[0].choices.map((c) => c.label);
    expect(labels).toContain('Esc 跳过演出？');
    expect(labels.join(' ')).not.toMatch(/\{[a-zA-Z]/);
  });

  it('存进日志的那一份也是展开后的（下游面板不认识占位）', () => {
    const { rd, journaled } = campfire();
    listeningWindow();
    rd._showNode(REST_DIALOGUES.hub, 'rematch');
    const entry = journaled.find((e) => e.id === 'rest-hub-rematch');
    expect(entry.text).toBe('已击败 Boss 的信标可 E 再战。');
    expect(entry.id).toBe('rest-hub-rematch');                     // id 不参与展开
  });

  it('事件里的 `linePreview`（NPC 气泡读的那一格）同样不含占位', () => {
    const { rd } = campfire();
    const events = listeningWindow();
    rd._showNode(REST_DIALOGUES.hub, 'rematch');
    const node = events.find((e) => e.type === 'rest-dialogue-node');
    expect(node.detail.linePreview).toContain('按 E 召唤');
    expect(node.detail.linePreview).not.toMatch(/\{[a-zA-Z]/);
  });

  it('改绑之后新读的台词跟着改口', () => {
    const { rd, shown } = campfire();
    listeningWindow();
    rebind({ interact: 'KeyB', escape: 'KeyC' });
    rd._showNode(REST_DIALOGUES.hub, 'rematch');
    expect(shown[0].html).toContain('按 B 召唤');
    rd.activeRest = { id: 'void', name: '破碎时线营火' };
    rd._showNode(REST_DIALOGUES.void, 'start');
    expect(shown[1].choices.map((c) => c.label)).toContain('C 跳过演出？');
  });

  it('营火那句"按 N 自动通关"也是问出来的（这一条写在运行时里，不在表里）', () => {
    const { rd, shown } = campfire();
    listeningWindow();
    rebind({ autoPlay: 'KeyB' });
    rd.game.quests = { chapter: 5, current: null };
    rd._showNode(REST_DIALOGUES.hub, 'quest');
    expect(shown[0].html).toContain('按 B 自动通关');
  });
});
