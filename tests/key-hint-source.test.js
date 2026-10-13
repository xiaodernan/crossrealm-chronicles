/**
 * 文案里的键名只能问表，不能抄（W-A7 切片6 的静态门禁）。
 *
 * 这一片的病灶不是"改不了键"，而是**改完键之后界面没说真话**：同一条动作在
 * HUD、教程、交互条、说明书里各写一遍，改绑只改到输入那一半。
 * 所以门禁盯三件事：
 * 1. 文案里出现的 `{动作}` 必须是两张表登记过的动作 —— 写错字要在扫描期就红，
 *    而不是等玩家打开面板看见一句"按 {pray} 祈祷"；
 * 2. `keyText` 吃的一定是静态字面量 —— 动态拼出来的模板每次都不同，缓存形同虚设；
 * 3. 还写着死键名的地方逐文件记账，只许变小不许变大（内容文案那一批留给后续切片）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { KEY_ACTIONS, KEY_BINDINGS } from '../src/content/keybinds.js';
import { UI_ACTIONS, UI_HOTKEYS } from '../src/content/hotkeys.js';
import { keyLabel, mouseLabel } from '../src/content/keyLabels.js';
import { keyText, refreshKeyText } from '../src/content/keyHints.js';
// 内容表本体（W-B2 切片4 起，它们的成段文案里带 `{动作}` 占位）
import { REST_DIALOGUES } from '../src/content/restDialogues.js';
import { HELP_SECTIONS_EXTRA } from '../src/content/helpManual.js';
// 切片5 新迁的成段文案：占位住在数据里，源码扫不到，只能导入真表跑真展开
import { LORE_FRAGMENTS_POP, NPC_LINES_POP, ZONE_EVENTS_POP } from '../src/content/ambientLore.js';
import { ECHOES } from '../src/content/echoes.js';
import { REST_DIALOGUE_CG, REST_DIALOGUE_CG_EXTRA, REST_DIALOGUE_CG_POP } from '../src/content/dialogueCgPresets.js';
import { LORE_CODEX } from '../src/game/LoreCodexRegistry.js';
import {
  BOSS_LORE, CHAPTER_INTROS, DUNGEON_ENTER_LINES, LORE_FRAGMENTS, NPC_CHAPTER_LINES, ZONE_STORY_HOOKS,
} from '../src/game/LoreFragments.js';
import { SIDE_QUESTS_ALL } from '../src/content/sideQuests.js';
import { ZONE_EVENTS_EXTRA } from '../src/game/WorldAmbientCatalog.js';
import { MAINLINE } from '../src/content/objectives.js';

const SRC = join(process.cwd(), 'src');

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const full = join(dir, n);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.(js|css)$/.test(n) ? [full] : [];
});

const rel = (file) => file.slice(SRC.length + 1).replace(/\\/g, '/');

const FILES = walk(SRC).map((f) => ({ path: f, name: rel(f), source: readFileSync(f, 'utf8') }));

const KNOWN = new Set([...KEY_ACTIONS, ...UI_ACTIONS]);
const TOKEN = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/** 三处声明键名占位的地方：`keyText('…')`、`data-ktext="…"`、`data-keys="…"` */
const DECL = [
  /keyText\(\s*'([^']*)'/g,
  /data-ktext="([^"]*)"/g,
  /data-keys="([^"]*)"/g,
];

describe('`{动作}` 占位必须是登记过的动作', () => {
  it('整仓扫一遍：没有一处占位写的是不存在的动作', () => {
    const offenders = [];
    for (const { name, source } of FILES) {
      if (name === 'content/keyHints.js') continue; // 这里写的是文档示例
      for (const re of DECL) {
        for (const m of source.matchAll(re)) {
          const decl = m[1];
          // `data-keys` 里是空格分隔的动作名（不带花括号），另两处是 `{动作}` 占位
          const tokens = re === DECL[2]
            ? decl.trim().split(/\s+/)
            : [...decl.matchAll(TOKEN)].map((t) => t[1]);
          for (const action of tokens) {
            if (!KNOWN.has(action)) offenders.push(`${name}: ${decl} -> {${action}}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('占位确实写在文案里（一条都没有就是扫描本身坏了）', () => {
    const count = FILES.reduce(
      (n, { source }) => n + [...source.matchAll(DECL[0])].length
        + [...source.matchAll(DECL[1])].length
        + [...source.matchAll(DECL[2])].length,
      0,
    );
    expect(count).toBeGreaterThan(30);
  });
});

describe('开机那一步真的跑得通（W-D1 切片2 回归：HUD 把统计格写成了键名占位）', () => {
  /**
   * `Game.rebuildHotkeys()` → `hud.refreshKeyHints()` → `refreshKeyText(document)` 是**开机路径**。
   * 静态扫描管"占位写得对不对"，这一组管"真展开会不会抛"：2026-10-11 的事故是 HUD 的
   * 统计格被写成 `data-ktext="魂 {souls} · Lv.{level}"` —— `{souls}` 不是动作，
   * `keyText` 当场抛 "不是任何已登记的动作"，玩家看到的是**游戏初始化失败**。
   * 静态扫描当时被白名单压红了（TEMPLATE_VARS），于是绿灯照着一个开不了机的仓库。
   */
  const bootTemplates = () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    const hud = FILES.find((f) => f.name === 'ui/HUD.js')?.source ?? '';
    return [html, hud].flatMap((src) => [...src.matchAll(/data-ktext="([^"]*)"/g)].map((m) => m[1]));
  };

  /** 极简宿主：只实现 refreshKeyText 认的那两个选择器 */
  const rootOf = (els) => ({ querySelectorAll: (sel) => (sel === '[data-ktext]' ? els : []) });

  it('HUD 与壳页的每一条 data-ktext 都能真的展开，不抛', () => {
    const templates = bootTemplates();
    expect(templates.length, '一条都没抓到，抓取本身坏了').toBeGreaterThan(10);
    const els = templates.map((ktext) => ({ dataset: { ktext }, textContent: '' }));
    expect(() => refreshKeyText(rootOf(els))).not.toThrow();
    // 展开之后没有一条还是空的：空 = 那一格压根没被写到（等于开机时是白的）
    expect(els.filter((el) => el.textContent === '').map((el) => el.dataset.ktext), '这几条没写进去').toEqual([]);
  });

  it('反向控制：写错字的占位当场抛（"不抛"不是因为分支根本没走）', () => {
    const el = { dataset: { ktext: '按 {pray} 弹反' }, textContent: '' };
    expect(() => refreshKeyText(rootOf([el]))).toThrow(/不是任何已登记的动作/);
  });
});

describe('`keyText` 只吃静态字面量', () => {
  it('没有一处把模板串直接喂给 `keyText`（动态模板会绕开缓存上界）', () => {
    const offenders = FILES
      .filter(({ source }) => /keyText\(\s*`/.test(source))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it('带插值的句子只在参数外面拼：keyText 的参数与 ${} 不同一段', () => {
    // 形如 `${keyText('（{lockOn} 切换）')}` 是允许的；`${keyText(`…`)}` 由上一条拦下
    const offenders = FILES
      .filter(({ source }) => /\$\{[^}]*keyText\(/.test(source) && /keyText\(\s*`/.test(source))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});

describe('声明了占位的界面必须有人刷它', () => {
  it('用了 `data-keys` / `data-ktext` 的文件也调用了 `refreshKeyText(...)`', () => {
    const offenders = FILES
      .filter(({ name, source }) => name !== 'content/keyHints.js'
        && /data-(keys|ktext)=/.test(source)
        && !/refreshKeyText\(/.test(source))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  /**
   * 换手与改绑是同一类变化（切片33）：声明式那批（HUD 键位行、起始屏、小地图标题）
   * 只在改动时重算，所以"设备变了"也必须把重算叫起来 —— 少了这一句，纯手柄玩家
   * 读到的仍是键盘键名，而屏幕上没有任何一处看起来是错的。
   */
  it('换手也要重算声明式那批：设备一变，键名文案跟着改口', () => {
    const hud = FILES.find((f) => f.name === 'ui/HUD.js').source;
    const body = /updateInputDevice\(\) \{([\s\S]*?)\n {2}\}/.exec(hud)?.[1] ?? '';
    expect(body, 'HUD 里找不到 updateInputDevice 的方法体（门禁自己坏了）').toContain('_inputDeviceShown');
    expect(body, '换手之后没人重算声明式那批键名').toContain('this.refreshKeyHints();');
  });

  it('换生效表的那一处同时喂给五消费者：热键镜像、游戏键表、手柄出口、HUD 重算、说明书重算', () => {
    const game = FILES.find((f) => f.name === 'core/Game.js').source;
    for (const call of [
      'setHotkeyTable(hotkeyTable)', 'setKeybindTable(keyTable)',
      // 切片33：手柄出口交出去的是**取值函数**而不是快照（表在 `this` 上，改绑之后自己跟上）
      'setHintPadOutlets(',
      'hud?.refreshKeyHints?.()', 'helpManual?.refreshKeyHints?.()',
    ]) {
      expect(game, `改绑之后没人 ${call}`).toContain(call);
    }
  });
});

/**
 * 已迁移的界面逐个点名：问表调用必须在，退回字面量当场红。
 * 这些字符串是**调用形状**而不是文案内容 —— 改措辞不碰这里，改回硬编码才碰。
 */
describe('迁移点点名：这些界面的键名是问出来的，不是抄的', () => {
  const CALLED = {
    'player/PlayerController.js': ["keyText('[{interact}]')", "keyText('({cameraMode} 切换)')"],
    'ui/HUD.js': ['refreshKeyText(document)', 'refreshKeyText(this.zonePanel)', 'data-i18n="hud_journal_close_hint"'],
    'ui/QuestAssistant.js': ['refreshKeyText(this._panel)'],
    'player/PlayerAutoPlay.js': ['refreshKeyText(this.overlay)'],
    'cinematic/EndCreditsDirector.js': ['refreshKeyText(this.el)'],
    'ui/Tutorial.js': ['keyText(step.text)'],
    'ui/ContextualTutorial.js': ['keyText(text)'],
    'game/DeathHintDirector.js': ['keyText(HINTS.find'],
    'ui/GameGuidePanel.js': ['keyText('],
    'ui/WorldMapPanel.js': ['keyText('],
    'ui/DungeonJournalTab.js': ['keyText('],
    'combat/CombatController.js': ["keyText('（{lockOn} 切换）')"],
    'game/FastTravelSystem.js': ["keyText('快速旅行已解锁 — 在营火按 {fastTravel}')"],
    'cinematic/CombatCinematicSkip.js': ["keyText('按 {escape} 可跳过战斗演出')"],
    'ui/SettingsPanel.js': ["from '../content/keyLabels.js'"],
    // W-B2 切片4：成段的内容文案也走同一条链 —— 但**每一个显示出口**都要过，
    // 漏一处就是把字面的 `{parry}` 摆到玩家面前（说明书有正文与章节清单两处）
    'ui/HelpManual.js': ['keyText(sec.body)', 'keyText(s.title)', 'refreshKeyHints()'],
    // W-B4 切片2：这里原本还点名 `keyText(tree.title)` —— 那一格随对话树的抄本一起删了，
    // 标题现在是营火名（`this.activeRest.name`），名字里没有 `{动作}` 占位；
    // 展开仍由 `Dialog` 那一道口径负责（下面 `'ui/Dialog.js': ['keyText(title)', …]` 盯着的就是它）
    'game/RestDialogue.js': ['keyText(node.text)', 'keyText(c.label)'],
    // W-B2 切片5：剩下的都是"文案离开自己模块之前必须落定稿"的出口 ——
    // 对话框（20+ 调用方共用这一处）、日志卡片（快照存进去就再也不回头展开）、
    // 画布（图片有缓存，改绑不缓存就是旧键名）、CSS `content`（DOM 声明够不到，只能换成节点）
    'ui/Dialog.js': ['keyText(title)', 'keyText(text)', 'keyText(c.label)', 'keyText(message)'],
    'world/NPCManager.js': ['keyText(pool[idx])'],
    'game/QuestSystem.js': ['keyText(q.desc)'],
    'ui/LoreCodexJournalTab.js': ['keyText(e.text)', 'refreshKeyText(panelEl)'],
    'ui/PopCultureJournalTab.js': ['keyText(e.desc)', 'refreshKeyText(panelEl)'],
    'ui/SideQuestJournalTab.js': ['keyText(q.desc)', 'refreshKeyText(panelEl)'],
    'ui/AchievementsJournalTab.js': ['refreshKeyText(panelEl)'],
    'ui/CampfireMemoryJournalTab.js': ['refreshKeyText(panelEl)'],
    'ui/CgJournalTab.js': ['refreshKeyText(panelEl)'],
    'ui/WeaponSkillJournalTab.js': ['refreshKeyText(panelEl)'],
    'player/DemoRunner.js': ['refreshKeyText(this.overlay)'],
    'game/CombatTutorialDirector.js': ['refreshKeyText(this._hint)'],
    'ui/DialogCGRenderer.js': ['_syncKeyStamp()', 'keyText(caption', "keyText('{parry} 弹反')"],
  };

  it('每一处都还在原地问表', () => {
    const missing = [];
    for (const [name, calls] of Object.entries(CALLED)) {
      const source = FILES.find((f) => f.name === name)?.source;
      if (source === undefined) {
        missing.push(`${name}: 文件不在了（迁移点请一起删）`);
        continue;
      }
      for (const call of calls) if (!source.includes(call)) missing.push(`${name}: 少了 ${call}`);
    }
    expect(missing).toEqual([]);
  });

  /**
   * 同一条调用形状在一个文件里出现两次时，上面的 `includes` 只看得见"有没有"，看不见"少了一处" ——
   * 变异探针 M5（把 `getProgressText` 的 `default:` 分支退回 `q.desc`）当场 0 例红就是证据。
   * 所以这类"一条链上的并列分支"要点名次数。
   */
  const COUNTED = {
    'game/QuestSystem.js': [['keyText(q.desc)', 2]],
  };
  it('并列分支按次数点名：少一处问表也是红', () => {
    const wrong = [];
    for (const [name, pairs] of Object.entries(COUNTED)) {
      const source = FILES.find((f) => f.name === name)?.source ?? '';
      for (const [shape, n] of pairs) {
        const got = source.split(shape).length - 1;
        if (got !== n) wrong.push(`${name}: ${shape} 应有 ${n} 处，实际 ${got} 处`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

/**
 * 内容表里的 `{动作}` 占位：拿真表跑真展开（W-B2 切片4）。
 *
 * 上面几条扫的是**源码里的字符串**，而营火对话与说明书的文案住在数据表里 ——
 * `text: "按 {escap} 跳过"` 这种写错一个字母的占位源码扫不出来（它不写在 `keyText('…')` 里），
 * 运行期的后果却是"玩家走到那一格，对话框直接抛"。所以这里改成导入真表、走真函数：
 * 每一条字符串都过一遍 `keyText`，错名当场红，展开之后一个花括号都不许留。
 */
describe('内容表的 `{动作}` 占位：真表跑真展开', () => {
  const stringsOf = (node, out = []) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach((v) => stringsOf(v, out));
    else if (node && typeof node === 'object') Object.values(node).forEach((v) => stringsOf(v, out));
    return out;
  };
  const TABLES = {
    restDialogues: REST_DIALOGUES,
    helpSectionsExtra: HELP_SECTIONS_EXTRA,
    loreCodex: LORE_CODEX,
    sideQuests: SIDE_QUESTS_ALL,
    echoes: ECHOES,
    quests: MAINLINE,
    npcChapterLines: NPC_CHAPTER_LINES,
    bossLore: BOSS_LORE,
    chapterIntros: CHAPTER_INTROS,
    dungeonEnterLines: DUNGEON_ENTER_LINES,
    loreFragments: LORE_FRAGMENTS,
    zoneStoryHooks: ZONE_STORY_HOOKS,
    zoneEventsExtra: ZONE_EVENTS_EXTRA,
    zoneEventsPop: ZONE_EVENTS_POP,
    npcLinesPop: NPC_LINES_POP,
    loreFragmentsPop: LORE_FRAGMENTS_POP,
    dialogueCg: [REST_DIALOGUE_CG, REST_DIALOGUE_CG_EXTRA, REST_DIALOGUE_CG_POP],
  };
  const STRINGS = Object.entries(TABLES).flatMap(([table, node]) => stringsOf(node).map((s) => `${table}: ${s}`));

  it('扫描真跑得起来：每张表都交得出文案，带占位的总数够多', () => {
    /*
     * 逐表钉一条"这张表真的走进了扫描"：`stringsOf(undefined)` 返回空数组，所以
     * 一张表被改名、删掉或 import 写错时，这里的 `STRINGS` 只是少了几条 ——
     * 只看总数（切片4 那版本）照样绿，而那几张有占位的表就此没人查过。
     * W-B3 切片3 就把 `QuestSystem` 里那份主线抄本删了：这条当时确实一点没红。
     */
    const silent = Object.entries(TABLES)
      .filter(([, node]) => stringsOf(node).length === 0)
      .map(([name]) => name);
    expect(silent, '这些表一条文案都没交出来（多半是 import 断了）').toEqual([]);
    const withToken = STRINGS.filter((s) => /\{[A-Za-z][A-Za-z0-9]*\}/.test(s));
    expect(withToken.length).toBeGreaterThanOrEqual(46);
  });

  it('每个占位都是登记过的动作，展开后不留花括号', () => {
    const bad = [];
    for (const labeled of STRINGS) {
      const s = labeled.slice(labeled.indexOf(': ') + 2);
      let out;
      try {
        out = keyText(s);
      } catch (e) {
        bad.push(`${s} -> ${e.message}`);
        continue;
      }
      if (/\{[A-Za-z]/.test(out)) bad.push(`${s} -> 展开后还剩花括号：${out}`);
    }
    expect(bad).toEqual([]);
  });

  it('反向控制：占位写错一个字母会抛，不是静默把 `{escap}` 显示给玩家', () => {
    // 上面那条能过可能是因为 `keyText` 根本不认花括号 —— 这里钉住"它确实会拦"
    expect(() => keyText('按 {escap} 跳过演出')).toThrow(/不是任何已登记的动作/);
  });
});

/**
 * 只许变小的账本：这些地方仍把键名写死在内容里。
 * 它们大多是**成段的内容文案**（说明书、营火对话、世界低语、区域介绍），
 * 一次性塞进本片会把"界面改成问表"和"内容数据化"两件事搅在一起 ——
 * 后者是 W-B1 的闸门。数量口径见 `key-prose` 正则，动它就要连同这里一起改。
 */
const LEDGER = {
  // `WASD 移动`：四个动作连写成一-cluster，`keyHint` 只答"某一个动作按哪枚键"，
  // 占位化会把它写成 `W 移动`（少三枚键）或 `{moveUp}{moveLeft}{moveDown}{moveRight}`（一串没人读的字符）。
  // 这条留到"移动方式能整组改绑"再说，今天它是**四键连写的老写法**（同 `index.html` 门禁里那条）。
  'ui/HelpManual.js': 1,
  // `请按 F12 查看控制台详情`：开机失败那一条错误里指的是**浏览器**的开发者工具，
  // 不是任何一张表里的动作 —— 它没有可改绑的入口，也就没有"改绑之后说谎"这件事。
  'main.js': 1,
  // `自定义路点 Shift+点击`：这里说的是浏览器原生 `e.shiftKey`（`ui/WorldMapPanel.js` 读的就是它），
  // **不是任何一张表里的动作**。占位化它会显示成改绑后的那枚键，而行为仍然只认 Shift —— 那是假话。
  // 真要还这笔债，得先给"修饰键"登记成可改绑的动作，那是输入侧的事，不是文案侧的。
  'ui/WorldMapPanel.js': 1,
  // W-B2 切片3：文案搬进 content/ 之后账本跟着换名字，总数一处没变（68 → 68，逐文件实测）；
  // 切片4 把说明书与营火对话的 45 笔改成 `{动作}` 占位（68 → 23）；
  // 切片5 清完剩下的内容键名，并把"界面上每一句键名都问表"那条更严的尺子立成门禁（见下面 `LABEL_PROSE`）。
  // 这里只剩一条：营火里那句 `自定义路点 Shift+点击` 与上面 `ui/WorldMapPanel.js` 说的是同一件事。
  'content/restDialogues.js': 1,
};

const LIT = /`(?:\\.|[^`\\])*`|'(?:\\.|[^'\n])*'|"(?:\\.|[^"\n])*"/g;
const KEY_PROSE = new RegExp([
  '\\b(?:Esc|F2|F12|Tab|Ctrl|Shift|WASD)\\b',
  '按\\s*[\\[【(]?\\s*[A-Z0-9]\\b',
  '长按\\s*[\\[【(]?\\s*[0-9]\\b',
  '[\\[【(]\\s*[A-Z]\\s*[\\]】)]\\s*(?:关闭|离开|阅读|打开|开始|跳过|可)',
  '[（(]\\s*[A-Z]\\s+(?:切换|关闭|也可|锁定)',
  // 工单号（`W-A2` / `W-B1` / `W-D6`）不是键名 —— 这个形状与"K - 关闭"这类键位提示撞车，
  // 于是 `content/registry.js` 的 note 字段里那四个工单号被误报成"写死的键名"（W-B1 切片2 实测）。
  // 排除它而不是往台账里塞四条假账：台账记的是**玩家看得见的**写死键名，掺进工单号就没法读了。
  '(?<![A-Za-z/])(?!W-[A-Z]\\d)[A-Z](?:/[A-Z])*\\s*[—–-]\\s*\\S',
].join('|'), 'g');

const proseCount = ({ name, source }) => {
  if (name === 'style.css') return (source.match(KEY_PROSE) || []).length;
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return (code.match(LIT) || []).reduce((n, lit) => n + ((lit.match(KEY_PROSE) || []).length), 0);
};

describe('还写死键名的地方：逐文件记账，只许变小', () => {
  it('每个文件的数量都不高于账本', () => {
    const grew = FILES
      .map((f) => ({ name: f.name, n: proseCount(f) }))
      .filter(({ name, n }) => n > (LEDGER[name] ?? 0) && name !== 'content/keybinds.js'
        && name !== 'content/hotkeys.js' && name !== 'content/keyLabels.js' && name !== 'content/keyHints.js')
      .map(({ name, n }) => `${name}: ${n} > ${LEDGER[name] ?? 0}`);
    expect(grew).toEqual([]);
  });

  it('账本里的数字仍然对得上当前代码（清完一处就要把账本一起改小）', () => {
    const byName = new Map(FILES.map((f) => [f.name, proseCount(f)]));
    const stale = Object.entries(LEDGER)
      .filter(([name, n]) => (byName.get(name) ?? 0) !== n)
      .map(([name, n]) => `${name}: 记的 ${n}，实际 ${byName.get(name) ?? 0}`);
    expect(stale).toEqual([]);
  });
});

/**
 * 第二把尺子：不问"字样像不像键名"，直接问"两张表现在显示给人看的那些字样，
 * 有没有出现在操作说明的句式里"（W-B2 切片5）。
 *
 * 上面那把 `KEY_PROSE` 是按**形状**猜的（`按 X`、`Esc|Tab|Ctrl` 那批写死的名字、`X - 说明`），
 * 所以 `日志 [J] 里`、`击败后可 E 再战`、`J 键筛选`、`按住 1–4 蓄力` 这些它一条都不报 ——
 * 而它们和 `按 E` 是同一句谎话。这一把把尺子换成"两张表现在会说出口的键名"本身，
 * 于是新增一枚键位（比如给界面加一个 `.`）不用改正则，谎话自动进网。
 *
 * 判据仍然只在"操作说明"的四个位置上：`按/按住/长按 + 字样`、`可/后/前/再 + 字样`、
 * `[字样]`、`字样 + (关闭|跳过|切换|弹反|…)`。少了这个句式条件，`Endurance 号`、`Chapter 3`、
 * `toFixed(2)` 全会被牵连 —— 门禁一误报，人们就会把它关掉。
 */
describe('界面上说出的键名只能从两张表来（字样尺子）', () => {
  const SKIP = new Set([
    'content/keybinds.js', 'content/hotkeys.js', 'content/keyLabels.js', 'content/keyHints.js',
  ]);
  /** 反引号在热键表里确实是一格，但它同时是 JS 模板串的边界字符：拿它当字样会在每个模板字面量上误报 */
  const NOT_AS_LABEL = new Set(['`']);
  /** 单枚数字只在"按/长按"那一句式里认：`(2)` 是 `.toFixed(2)ms` 不是"按 (2)" */
  const DIGITS = new Set(['1', '2', '3', '4']);

  const FACTORY = [
    ...Object.values(KEY_BINDINGS).map((b) => (b.code ? keyLabel(b.code) : mouseLabel(b.mouse))),
    ...Object.values(KEY_BINDINGS).flatMap((b) => (b.aliases ?? []).map(keyLabel)),
    ...UI_HOTKEYS.map((e) => keyLabel(e.code)),
  ].filter((l) => l && !NOT_AS_LABEL.has(l));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const byLen = [...FACTORY].sort((a, b) => b.length - a.length).map(esc).join('|');
  const wordy = [...FACTORY].filter((l) => !DIGITS.has(l)).sort((a, b) => b.length - a.length).map(esc).join('|');
  const PATTERNS = [
    new RegExp(`(?:按|按住|长按)\\s*[\\[【(（]?\\s*(?:${byLen})(?![0-9A-Za-z])`, 'g'),
    new RegExp(`(?:可|后|前|再)\\s*[\\[【(（]?\\s*(?:${byLen})(?![0-9A-Za-z])`, 'g'),
    new RegExp(`[\\[【(（]\\s*(?:${wordy})\\s*[\\]】)）]`, 'g'),
    new RegExp(`(?:${byLen})(?![0-9A-Za-z])\\s*(?:关闭|离开|跳出|跳过|打开|退出|解除|切换|弹反|翻滚|锁定|闪避|拍照|蓄力|键|可)`, 'g'),
  ];

  const labelHits = (source) => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const out = [];
    for (const lit of code.matchAll(LIT)) {
      // 占位 `{journal}` 展开出来的字样是**问表得来的**，不算抄：先把占位挖掉再找
      const probe = lit[0].replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, '＿');
      for (const re of PATTERNS) for (const m of probe.matchAll(re)) out.push(m[0]);
    }
    return out;
  };
  const scanned = () => FILES.filter(({ name }) => !SKIP.has(name));

  it('一个都不许：内容文案里的键名全是 `{动作}` 占位', () => {
    const offenders = scanned()
      .flatMap(({ name, source }) => labelHits(source).map((hit) => `${name}: ${hit}`));
    expect(offenders).toEqual([]);
  });

  it('这条扫描咬得住：把一处字样改回死键名立刻红', () => {
    // 防的是"空跑门禁"（正则一坏就永远通过）—— 用真文件里的一格占位反向改回去验
    const codex = FILES.find((f) => f.name === 'game/LoreCodexRegistry.js').source;
    expect(labelHits(codex)).toEqual([]);
    // 半角裸写
    const reverted = codex.replace('{escape} 可跳过演出', 'Esc 可跳过演出');
    expect(reverted).not.toEqual(codex);
    expect(labelHits(reverted)).toContain('Esc 可');
    // 全角括号包裹 —— 旧正则的 `[\[【(]?` 不覆盖 `（`，此针专防那种漏网
    const revertedFull = codex.replace('{escape} 可跳过演出', '（Esc）可跳过演出');
    expect(revertedFull).not.toEqual(codex);
    expect(labelHits(revertedFull)).toContain('（Esc）');
  });

  it('尺子不缺齿：两张表里每一枚键名都真的进了正则', () => {
    // FACTORY 是照表拼出来的，拼错一个变量名就会静悄悄少一枚 —— 所以逐枚回查字样段本身。
    const all = new Set();
    for (const b of Object.values(KEY_BINDINGS)) {
      const label = b.code ? keyLabel(b.code) : mouseLabel(b.mouse);
      if (label) all.add(label);
      for (const a of b.aliases ?? []) all.add(keyLabel(a));
    }
    for (const e of UI_HOTKEYS) all.add(keyLabel(e.code));
    // 唯一的故意省略是反引号（模板串边界字符）：除它以外逐枚回查字样段本身。
    const missing = [...all].filter((l) => !NOT_AS_LABEL.has(l)
      && ![byLen, wordy].some((alt) => alt.includes(esc(l))));
    expect(missing).toEqual([]);
    expect([...all].filter((l) => NOT_AS_LABEL.has(l))).toEqual(['`']);
    expect(all.size).toBeGreaterThan(20);
    // 反向：表里没有的名字不该被当成抄来的键名（否则 `F9` 这类字面量会到处误报）
    expect(byLen).not.toContain(esc('F9'));
  });
});

/**
 * 壳页 `index.html` 也在这条链上（切片6 尾段补上的）。
 *
 * 小地图标题、暂停菜单那排提示、起始屏、"关闭 (G)" 这些按钮 —— 它们写在 HTML 里，
 * 上面几条扫 `src/` 的门禁一条都碰不到，改绑之后照样说出厂键。声明方式与 JS 侧一致：
 * 键名放在 `<span data-keys="动作">` 的空槽里（正文只留不带键名的词），
 * 由 `HUD.refreshKeyHints()` 在构造与每次改绑时展开 —— 它走的是整份 `document`，
 * 因为这些节点大多挂在 `#hud` 外面。
 */
describe('index.html 的键名也只能从表里来', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  /** 两张表现在会把哪些字样显示给人 —— 界面上出现键名的唯一来源 */
  const FACTORY_LABELS = new Set([
    ...Object.values(KEY_BINDINGS).flatMap((b) => [
      ...(b.code ? [keyLabel(b.code)] : []),
      ...(b.mouse ? [mouseLabel(b.mouse)] : []),
      ...(b.aliases ?? []).map(keyLabel),
    ]),
    ...UI_HOTKEYS.map((e) => keyLabel(e.code)),
    'WASD',                       // 四键连写的老写法：单独列，因为它过不了下面的单词边界
  ]);
  const LABEL = new RegExp(
    `(?<![0-9A-Za-z])(?:${[...FACTORY_LABELS]
      .sort((a, b) => b.length - a.length)
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')})(?![0-9A-Za-z])`,
  );
  /** 只有出现在"操作说明"句式里才算违规：`位面之魂`、`Bloom` 之类不该被牵连 */
  const TRIGGER = /切换|关闭|存档|读档|说明书|暂停|日志|移动|快捷存读|自动通关|打开|跳过|性能|锁定|弹反|翻滚|交互|冲刺|跳跃|视角/;

  /** 正文（去掉标签与注释）+ 会显示给人的属性；`data-keys` 随标签一起消失。
   *
   * 行内元素（span / strong / a / br…）**当空格**，块级元素才换行 —— 一句中文被
   * `data-i18n` 与 `data-keys` 拆成三四个 leaf span 时，仍是**同一句**（W-D2 切片5/6
   * 就是这么拆的：同一句里既翻译又要留键名槽）。早先一视同仁地按标签切，
   * "键名"与"关闭/切换"被切进不同的 run，扫描对这类句子当场失明 —— 反面控制
   * 连着咬松过两次（切片5 换针，换完切片6 一拆句又松），所以修的是扫描器。
   * 标签内部的正文本就为空的 `data-keys` 槽不会凭空产出键名 —— 只有把键名
   * **写成正文**的人才会被咬住，这正是要抓的那一种。 */
  const INLINE = new Set(['span', 'a', 'strong', 'em', 'b', 'i', 'code', 'small', 'sub', 'sup', 'br']);
  const proseRuns = (src) => [
    ...src
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/?([a-zA-Z][\w-]*)[^>]*>/g, (m, tag) => (INLINE.has(tag.toLowerCase()) ? ' ' : '\n'))
      .split('\n'),
    ...[...src.matchAll(/\b(?:title|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]),
  ];
  const hardcoded = (src) => proseRuns(src).filter((line) => TRIGGER.test(line) && LABEL.test(line));

  it('带操作字样的句子或属性里没有硬编码键名', () => {
    expect(hardcoded(html)).toEqual([]);
  });

  it('这条扫描咬得住：把一处声明改回死键名立刻红', () => {
    // 防的是"空跑门禁"（正则一坏就永远通过）—— 用真文件的行来验。
    // 两根针。暂停提示那根（Esc 关闭）一直咬得住；小地图那根（M 切换）当初正是被
    // "按标签一律换行"咬松的 —— W-D2 切片5 把那句拆成 data-i18n 与 data-keys 交错的
    // leaf span 之后，键名与"切换"落进不同的 run，这根针当场 0 违规 = 扫描失明。
    // 行内元素改当空格（见 proseRuns）之后它必须重新咬得住 —— 这里就是那次修复的回归判据。
    const cases = [
      ['<span data-keys="escape"></span>', 'Esc', '关闭'],
      ['<span data-keys="minimap"></span>', 'M', '切换'],
    ];
    for (const [needle, deadKey, word] of cases) {
      const reverted = html.replace(needle, deadKey);
      expect(hardcoded(reverted).length, `${needle} 换成死键名居然不红`).toBeGreaterThan(0);
      expect(hardcoded(reverted).join('\n'), `红出来的句子里没有" ${word} "`).toContain(word);
    }
  });

  it('声明里的动作名都在两张表里，且一条声明都没有就是扫描坏了', () => {
    const offenders = [];
    let declarations = 0;
    for (const re of DECL) {
      for (const m of html.matchAll(re)) {
        declarations++;
        const decl = m[1];
        const tokens = re === DECL[2]
          ? decl.trim().split(/\s+/)
          : [...decl.matchAll(TOKEN)].map((t) => t[1]);
        for (const action of tokens) {
          if (!KNOWN.has(action)) offenders.push(`${decl} -> {${action}}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    expect(declarations).toBeGreaterThan(8);
  });
});
