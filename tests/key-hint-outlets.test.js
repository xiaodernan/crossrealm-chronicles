/**
 * 显示出口一处不漏：文案在**离开自己模块之前**就得说完真话（W-B2 切片5）。
 *
 * 切片4 把说明书与营火对话改成问表之后，账本里剩下的那一类不再是"界面模板抄了键名"，
 * 而是**四类根本不会被 `data-ktext` 那套声明覆盖到的出口**：
 *
 * 1. 对话框（`ui/Dialog.js`）—— 二十几处调用方（区域介绍、迷宫进入、过场字幕、氛围低语…）
 *    共用它一个嘴。逐处包 `keyText` 等于把"会不会忘"复制二十几份；所以口径立在这里。
 * 2. 快照出口（`world/NPCManager.js`、`ui/LoreCodexJournalTab.js` 那些日志卡片）——
 *    文本会被存进日志/事件，下游不认识占位，回头翻的时候表已经换了，存进去的却是字面 `{journal}`。
 * 3. 画布（`ui/DialogCGRenderer.js`）—— 键名是**画进像素**的，DOM 声明够不到，
 *    而且图有缓存：只把 `keyText` 放进绘制里、不让缓存随改绑作废，玩家看到的仍是旧键名。
 * 4. CSS `content`（`src/style.css` 那句 ` · Esc 跳过`）—— 同理，改绑之后没有任何 JS 会重算它。
 *
 * 与静态门禁（`tests/key-hint-source.test.js`）的分工：那边钉"源码里没有死键名"，
 * 这一片钉**运行时真的把占位展开了**，并且带上两条反向控制 ——
 * 桩如果比生产多给一层（比如 `fillText` 其实没人调），用例就会假绿，所以每条都配一个"撤掉它就红"的读法。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { factoryKeybindings, setKeybindTable, buildBindingTables } from '../src/content/keybinds.js';
import { UI_HOTKEYS, setHotkeyTable } from '../src/content/hotkeys.js';
import { Dialog } from '../src/ui/Dialog.js';
import { NPCManager, npcLine } from '../src/world/NPCManager.js';
import { t } from '../src/engine/i18n.js';
import { STRING_KEYS } from '../src/content/strings.zh.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { DialogCGRenderer } from '../src/ui/DialogCGRenderer.js';
import { LORE_CODEX } from '../src/game/LoreCodexRegistry.js';
import { NPC_CHAPTER_LINES } from '../src/game/LoreFragments.js';

afterEach(() => {
  setKeybindTable(factoryKeybindings());
  setHotkeyTable(UI_HOTKEYS.map((e) => ({ ...e })));
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.requestAnimationFrame;
});

/** 玩家那侧的改绑入口：一份覆盖包 → 两张生效表（与 `Game.rebuildHotkeys` 同一条路） */
function rebind(overrides) {
  const { hotkeyTable, keyTable } = buildBindingTables(overrides, UI_HOTKEYS, {}, {});
  setHotkeyTable(hotkeyTable);
  setKeybindTable(keyTable);
}

/* --------------------------------------------------------- 1. 对话框 */

/** 一格元素：只实现 `Dialog` 用到的那几件事，**不给它任何额外字段**（多给就是替生产作弊） */
function el() {
  const node = {
    children: [], dataset: {}, classes: new Set(), _text: '', _html: '', clicks: 0,
    classList: {
      add: (c) => node.classes.add(c),
      remove: (c) => node.classes.delete(c),
      toggle: (c, on) => (on === undefined ? node.classes.has(c) ? node.classes.delete(c) : node.classes.add(c) : on ? node.classes.add(c) : node.classes.delete(c)),
      contains: (c) => node.classes.has(c),
    },
    addEventListener() {},
    appendChild(c) { node.children.push(c); return c; },
    querySelectorAll: (sel) => (sel === '.dialog-choice' ? node._buttons : []),
  };
  Object.defineProperty(node, 'textContent', {
    get: () => node._text,
    set: (v) => { node._text = String(v); },
  });
  Object.defineProperty(node, 'innerHTML', {
    get: () => node._html,
    set: (v) => {
      node._html = String(v);
      // 真浏览器会照 HTML 生成按钮：这里只按 `data-idx` 数出来，不给别的形状
      node._buttons = [...String(v).matchAll(/data-idx="(\d+)"/g)].map((m) => ({ dataset: { idx: m[1] }, addEventListener() {} }));
    },
  });
  return node;
}

const DIALOG_IDS = [
  'dialog-overlay', 'dialog-title', 'dialog-speaker', 'dialog-cg',
  'dialog-cg-img', 'dialog-text', 'dialog-choices', 'toast-container', 'dialog-close',
];

function mountDialog() {
  const hosts = Object.fromEntries(DIALOG_IDS.map((id) => [id, el()]));
  globalThis.document = {
    getElementById: (id) => hosts[id] ?? null,
    createElement: () => el(),
  };
  globalThis.requestAnimationFrame = () => 0;
  return { dialog: new Dialog(), hosts };
}

describe('对话框：占位在 `Dialog` 这一处落定稿', () => {
  it('`show` 的标题与正文都展开：出厂键位下 `{interact}` 说成 E', () => {
    const { dialog, hosts } = mountDialog();
    dialog.show('灰白森林', '按 {interact} 离开这里');
    expect(hosts['dialog-text']._text).toBe('按 E 离开这里');
    expect(hosts['dialog-title']._text).toBe('灰白森林');
  });

  it('改绑之后同一句话跟着改口（缓存按轮次作废，不是构造时那一份）', () => {
    const { dialog, hosts } = mountDialog();
    dialog.show('灰白森林', '按 {interact} 离开这里');
    rebind({ interact: 'F9' });
    dialog.show('灰白森林', '按 {interact} 离开这里');
    expect(hosts['dialog-text']._text).toBe('按 F9 离开这里');
  });

  it('选项标签与 toast 同样展开：漏一处就是半句真话半段花括号', () => {
    const { dialog, hosts } = mountDialog();
    dialog.showChoices('营火', '长按 {spell1} 蓄力', [{ label: '翻日志（{journal}）' }]);
    expect(hosts['dialog-text']._html).toBe('长按 1 蓄力');
    expect(hosts['dialog-choices']._html).toContain('翻日志（J）');
    dialog.toast('按 {escape} 退出观看');
    expect(hosts['toast-container'].children[0]._text).toBe('按 Esc 退出观看');
  });

  it('反向控制：`show` 摘掉展开，正文里就剩字面占位（这条不是在测 `keyText`）', () => {
    const { dialog, hosts } = mountDialog();
    // 与 `keyText` 无关的裸调用 —— 生产代码退回去就是这个样子
    hosts['dialog-text']._text = '按 {interact} 离开这里';
    expect(hosts['dialog-text']._text).toContain('{interact}');
    // 真走了 `show` 的那一条则一定不留花括号
    dialog.show('T', '按 {interact} 离开这里');
    expect(hosts['dialog-text']._text).not.toMatch(/\{[A-Za-z]/);
  });
});

/* ------------------------------------------------- 2. 快照出口（NPC / 任务） */

/** `talk` 只要这三样：dialog、game.storyJournal、window 事件；NPC 清单走真的 `build()`（假 scene/world） */
function mountNpcTalk() {
  const shown = [];
  const entries = [];
  const events = [];
  globalThis.window = { dispatchEvent: (evt) => events.push(evt) };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  const mgr = Object.create(NPCManager.prototype);
  mgr.scene = { add() {} };
  mgr.world = { getGroundHeight: () => 0 };
  mgr.dialog = { show: (title, text) => shown.push({ title, text }) };
  mgr.lineIndex = {};
  mgr.npcs = [];
  mgr.game = { quests: { chapter: 1 }, storyJournal: { add: (e) => entries.push(e) } };
  mgr.build();                      // 与生产同一条路：`lineIndex` 就是在这里被填成 0 的
  return { mgr, shown, entries, events };
}

describe('NPC 台词：对话框、日志条目、事件三份都是定稿', () => {
  /**
   * 池子里确实带占位的那一格（`{parry}` / `{roll}` 那一组，改绑最常动的几格）。
   *
   * W-D2 切片14 之后池子存的是**键**，所以占位要在**表里那一句**上找 —— `key` 是池子里那一格，
   * `text` 是 `t(key)` 展开出来的正文。两者都要带回去：一个用来定位，一个用来做反向读法。
   */
  const placeholderLine = () => {
    for (const [id, byChapter] of Object.entries(NPC_CHAPTER_LINES)) {
      for (const [chapter, lines] of Object.entries(byChapter)) {
        const idx = lines.findIndex((key) => /\{[a-z]/.test(t(key)));
        if (idx >= 0) return { id, chapter: Number(chapter), idx, key: lines[idx], text: t(lines[idx]) };
      }
    }
    throw new Error('NPC_CHAPTER_LINES 里没有带占位的台词了 —— 这一族用例失去意义，请一起删');
  };

  function talkOnce(overrides = {}) {
    const { mgr, shown, entries, events } = mountNpcTalk();
    const spec = placeholderLine();
    const npc = mgr.npcs.find((n) => n.id === spec.id);
    if (!npc) throw new Error(`NPC_DATA 里没有 ${spec.id}：台词表挂在没人认领的 id 上`);
    mgr.game.quests.chapter = spec.chapter;
    mgr.lineIndex[spec.id] = spec.idx;   // 走到那一句（生产里由玩家反复对话推进）
    mgr.talk(npc);
    return { spec, npc, shown, entries, events };
  }

  it('三份里一个花括号都不留，且三份是同一句话', () => {
    const { spec, npc, shown, entries, events } = talkOnce();
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe(npc.name);
    expect(shown[0].text).not.toMatch(/\{[A-Za-z]/);
    expect(entries[0].text).toBe(shown[0].text);
    expect(events[0].detail.line).toBe(shown[0].text);
    expect(events[0].type).toBe('npc-talk');
    // 反向读法：展开真的发生过 —— 表里那一句**至今**还带着占位，说出来的与它不同
    expect(spec.text).toMatch(/\{[a-z]/);
    expect(shown[0].text).not.toBe(spec.text);
  });

  it('改绑之后新读的那一句跟着改口，而已经存进日志的那一份**不**追改（快照语义）', () => {
    const { mgr, shown, entries } = mountNpcTalk();
    const scout = mgr.npcs.find((n) => n.id === 'elf-scout');
    mgr.game.quests.chapter = 1;
    mgr.talk(scout);
    const before = shown[0].text;
    rebind({ parry: 'F9', roll: 'F8' });
    mgr.talk(scout);
    const after = shown[1].text;
    expect(before).not.toBe(after);
    expect(after).toContain('F9');
    expect(entries[0].text).toBe(before);   // 存进去的定稿不该被后来的改绑重写
    expect(entries[1].text).toBe(after);
  });

  /**
   * B119：池子里装的是什么，必须只有一种答案。
   *
   * 切片12 把 `NPC_CHAPTER_LINES` 那段**成段正文**也送进 `t()`，于是有章节台词的 NPC 全在念
   * `[MISSING: 宝箱里的魂火能升级属性。]` —— 而对话框、日志、`npc-talk` 三处**同时**收到
   * 同一份坏字，上面那两条用例比的是"三处一样"所以全绿。切片14 把正文搬进双表、池子里只剩键，
   * 于是这条拆成一对：**结构腿**问"每一格是不是已登记的键"，**行为腿**问"念出来那一声对不对"。
   * 两条都自带分母守卫，空集不许绿成"干净"。
   */
  it('结构腿：章节池每一格都是**已登记的键**（正文一个都不许留在池子里）', () => {
    const 坏 = [];
    let 格数 = 0;
    for (const [id, byChapter] of Object.entries(NPC_CHAPTER_LINES)) {
      for (const [chapter, lines] of Object.entries(byChapter)) {
        for (const [i, key] of lines.entries()) {
          格数 += 1;
          if (typeof key !== 'string' || !STRING_KEYS.includes(key)) 坏.push(`${id} ch${chapter} #${i}: ${key}`);
        }
      }
    }
    expect(格数, '章节池空了 —— 这一族用例失去意义，请一起删').toBeGreaterThan(20);
    expect(坏, '这些格子里装的不是键（正文会被 t() 当键名查，回 [MISSING: …]）').toEqual([]);
  });

  it('行为腿：每一句台词都念得出来 —— 既不许是 `[MISSING: …]`，也不许是裸键（B119）', () => {
    const { mgr, shown } = mountNpcTalk();
    const 坏 = [];
    let 句数 = 0;
    for (const [id, byChapter] of Object.entries(NPC_CHAPTER_LINES)) {
      const npc = mgr.npcs.find((n) => n.id === id);
      if (!npc) throw new Error(`NPC_DATA 里没有 ${id}：台词表挂在没人认领的 id 上`);
      for (const [chapter, lines] of Object.entries(byChapter)) {
        for (let idx = 0; idx < lines.length; idx++) {
          mgr.game.quests.chapter = Number(chapter);
          mgr.lineIndex[id] = idx;      // 生产里由玩家反复对话推进
          mgr.talk(npc);
          句数 += 1;
          const said = shown[shown.length - 1].text;
          // 两种坏形状都要拦：缺键（t() 没换成文案）与**没换**（说了个裸键）。
          // 只查 `[MISSING` 的话，"`npcLine` 忘了过 `t()`"那一臂会静默放行 —— 图上写着
          // `npc_wanderer_c1_1`，不含 `[MISSING`，读数与"一切正常"一模一样。
          if (said.includes('[MISSING')) 坏.push(`${id} ch${chapter} #${idx}：${said}`);
          else if (said === lines[idx]) 坏.push(`${id} ch${chapter} #${idx}：念的是裸键 ${said}`);
        }
      }
    }
    expect(句数, '章节池空了 —— 这一族用例失去意义，请一起删').toBeGreaterThan(20);
    expect(坏, '这些台词没念出人话').toEqual([]);
  });

  /**
   * 反向控制：判据必须看得见改前那个形状 —— **把正文当键查**，`t()` 会把整句话当键名
   * 并回 `[MISSING: …]`。没有这一臂，"全都不带 `[MISSING`"与"这条链根本没跑"在读数上
   * 一模一样；也没有任何东西拦着下一个人再往池子里塞一句正文。
   */
  it('反向控制：把正文当键查必须念出 `[MISSING: …]`（改前的形状）', () => {
    const { text, key } = placeholderLine();
    expect(t(text), 't() 对整句正文竟然不报缺键 —— 这把尺子看不见 B119').toContain('[MISSING');
    expect(npcLine(text), '正文直接过 npcLine 竟然也能念出来').toContain('[MISSING');
    expect(npcLine(key), '键那一侧反而查不到').not.toContain('[MISSING');
  });
});

describe('任务进度文案：`getProgressText` 是唯一显示口，它得展开', () => {
  it('无任务时的助手提示说出的是生效键', () => {
    const qs = Object.create(QuestSystem.prototype);
    qs.questIndex = 9999;   // `current` 是只读 getter（按下标读 QUESTS），越界即"没有进行中任务"
    expect(qs.getAssistantHint()).toBe('全部通关。按 U 打开助手可重跑全流程演示。');
    rebind({ questTracker: 'F5' });
    expect(qs.getAssistantHint()).toBe('全部通关。按 F5 打开助手可重跑全流程演示。');
  });

  /**
   * `interact` 那一格：任务没完成时直接把 `desc` 说给玩家（`QuestAssistant` 与日志都走这一条）。
   * 现有十二条主线任务的 desc 里恰好没有占位，所以这条链今天"看着没事"——
   * 下一位内容作者往 desc 里写 `{interact}` 时，接住他的必须是这里，不是玩家的眼睛。
   */
  it('未完成的可交互任务：desc 里的占位在出口处展开', () => {
    const qs = Object.create(QuestSystem.prototype);
    qs.stats = { discoveries: new Set(), hits: 0, kills: {}, spellCasts: 0, chargedCasts: 0, chestsOpened: 0, npcTalked: new Set(), skillsUnlocked: 0, dungeonsCleared: new Set() };
    // W-D2 切片16j：`desc` 存的是**文案键** —— 展开发生在出口那一处（`t()` 换文案、
    // `keyText()` 换键名），所以这里给的是一个带 `{interact}` 占位的真键。
    Object.defineProperty(qs, 'current', {
      value: { id: 'touch-anchor', type: 'interact', targetId: 'world-anchor', desc: 'guide_hint_dungeon_exit' },
    });
    expect(qs.getProgressText()).toBe('▶ 守钥者已倒 — 出口环 E 离开');
    rebind({ interact: 'F9' });
    expect(qs.getProgressText()).toBe('▶ 守钥者已倒 — 出口环 F9 离开');
  });
});

/* ------------------------------------------------------- 3. 画布与它的缓存 */

/** 只记账 `fillText` 的 2D 上下文：其余方法一律空转，任何未实现属性都不会被当成"有值" */
function recordingCtx(drawn) {
  const store = { canvas: { width: 640, height: 360 } };
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== 'string') return undefined;
      if (/^create(Linear|Radial)Gradient$/.test(prop)) return () => ({ addColorStop() {} });
      if (prop === 'measureText') return () => ({ width: 8 });
      if (prop === 'fillText') return (text, x, y) => drawn.push({ text, x, y });
      return () => undefined;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function mountCg() {
  const drawn = [];
  const renderer = Object.create(DialogCGRenderer.prototype);
  renderer.ctx = recordingCtx(drawn);
  renderer.cache = new Map();
  renderer.canvas = { width: 640, height: 360, toDataURL: () => 'data:,' };
  return { renderer, drawn };
}

describe('营火 CG 图：键名画进像素，缓存要跟着改绑作废', () => {
  it('标题栏那句 `{escape} 跳过` 落笔时已经是 "Esc 跳过"', () => {
    const { renderer, drawn } = mountCg();
    renderer.render('void', 'skip');
    expect(drawn.map((d) => d.text)).toContain('Esc 跳过');
  });

  it('改绑之后再画一次：拿到的不是缓存里那张旧图（漏掉 `_syncKeyStamp` 就是这一条红）', () => {
    const { renderer, drawn } = mountCg();
    renderer.render('void', 'skip');
    rebind({ escape: 'F9' });
    renderer.render('void', 'skip');
    expect(drawn.map((d) => d.text)).toContain('F9 跳过');
  });

  it('没改绑时重复画**不**重画：作废机制不是每次 render 都清缓存', () => {
    const { renderer, drawn } = mountCg();
    renderer.render('void', 'skip');
    const first = drawn.length;
    expect(first).toBeGreaterThan(0);
    renderer.render('void', 'skip');
    expect(drawn.length).toBe(first);            // 命中缓存：一笔都没多画
    rebind({ escape: 'F9' });
    renderer.render('void', 'skip');
    expect(drawn.length).toBeGreaterThan(first); // 改绑作废了缓存：真的重画了一次
  });

  it('战斗教学那两格（弹反 / 锁定）也是问表的', () => {
    const { renderer, drawn } = mountCg();
    renderer.render('fantasy', 'tip');
    const texts = drawn.map((d) => d.text);
    expect(texts).toContain('F 弹反');
    expect(texts).toContain('Q 锁定');
    rebind({ parry: 'F9' });
    renderer.render('fantasy', 'tip');
    expect(drawn.map((d) => d.text)).toContain('F9 弹反');
  });
});

/* --------------------------------------------- 4. 秘典卡片：卡面文字走快照口 */

describe('位面秘典卡片：文本经对话框出口时不留占位', () => {
  it('表里带占位的那几条，出口展开得开（卡片与日志存的就是这一份）', () => {
    // W-D2 切片16w：秘典表的 `text` 存的是**文案键** —— 占位在展开后的那一句里，
    // 所以这里先 `t()` 展开再找占位（与运行时同源）。
    const withToken = LORE_CODEX.filter((e) => /\{[a-z]/.test(t(e.text ?? '')));
    expect(withToken.length).toBeGreaterThan(0);
    const { dialog, hosts } = mountDialog();
    const textEl = hosts['dialog-text'];
    for (const e of withToken) {
      dialog.show(t(e.title), t(e.text));
      expect(textEl._text, t(e.text)).not.toMatch(/\{[A-Za-z]/);
      expect(textEl._text).not.toBe(t(e.text));   // 反向读法：表里那一格确实还是占位
    }
  });
});
