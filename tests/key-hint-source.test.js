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

  it('换生效表的那一处同时喂给三消费者：热键镜像、游戏键表、HUD 重算', () => {
    const game = FILES.find((f) => f.name === 'core/Game.js').source;
    for (const call of ['setHotkeyTable(hotkeyTable)', 'setKeybindTable(keyTable)', 'refreshKeyHints?.()']) {
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
    'ui/HUD.js': ['refreshKeyText(document)', 'refreshKeyText(this.zonePanel)', 'data-ktext="按 {zonePanel} 关闭"'],
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
    'game/QuestSystem.js': ['keyText('],
    'ui/SettingsPanel.js': ["from '../content/keyLabels.js'"],
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
});

/**
 * 只许变小的账本：这些地方仍把键名写死在内容里。
 * 它们大多是**成段的内容文案**（说明书、营火对话、世界低语、区域介绍），
 * 一次性塞进本片会把"界面改成问表"和"内容数据化"两件事搅在一起 ——
 * 后者是 W-B1 的闸门。数量口径见 `key-prose` 正则，动它就要连同这里一起改。
 */
const LEDGER = {
  'ui/HelpManual.js': 23,
  'ui/HelpManualExtras.js': 8,
  'game/RestDialogueExtras.js': 8,
  'game/RestDialogue.js': 4,
  'game/RestDialogueExtras2.js': 4,
  'game/LoreCodexRegistry.js': 3,
  'player/DemoRunner.js': 3,
  'game/LoreFragments.js': 2,
  'game/WorldAmbientCatalog.js': 2,
  'cinematic/CinematicManager.js': 1,
  'game/PopCultureHomageRegistry.js': 1,
  'game/QuestSystem.js': 1,
  'game/SideQuestRegistry.js': 1,
  'game/StoryDirector.js': 1,
  'world/zones/FantasyZone.js': 1,
  'world/zones/VoidZone.js': 1,
  'main.js': 1,
  'style.css': 1,
  'ui/WorldMapPanel.js': 1,
  // W-B1 切片1：CG 预设表从 ui/ 搬进 content/，字幕里那句 'Esc 跳过' 跟着搬了过来。
  // 它是**画在 canvas 上的文本**，吃不到 `data-keys` 那套（那是 DOM 的），
  // 所以本切片只如实记账；随 W-B1 的文案数据化一起改成问 `keyHint('escape')`。
  'content/dialogueCgPresets.js': 1,
};

const LIT = /`(?:\\.|[^`\\])*`|'(?:\\.|[^'\n])*'|"(?:\\.|[^"\n])*"/g;
const KEY_PROSE = new RegExp([
  '\\b(?:Esc|F2|F12|Tab|Ctrl|Shift|WASD)\\b',
  '按\\s*[\\[【(]?\\s*[A-Z0-9]\\b',
  '长按\\s*[\\[【(]?\\s*[0-9]\\b',
  '[\\[【(]\\s*[A-Z]\\s*[\\]】)]\\s*(?:关闭|离开|阅读|打开|开始|跳过|可)',
  '[（(]\\s*[A-Z]\\s+(?:切换|关闭|也可|锁定)',
  '(?<![A-Za-z/])[A-Z](?:/[A-Z])*\\s*[—–-]\\s*\\S',
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

  /** 正文（去掉标签与注释）+ 会显示给人的属性；`data-keys` 随标签一起消失 */
  const proseRuns = (src) => [
    ...src.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '\n').split('\n'),
    ...[...src.matchAll(/\b(?:title|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]),
  ];
  const hardcoded = (src) => proseRuns(src).filter((line) => TRIGGER.test(line) && LABEL.test(line));

  it('带操作字样的句子或属性里没有硬编码键名', () => {
    expect(hardcoded(html)).toEqual([]);
  });

  it('这条扫描咬得住：把一处声明改回死键名立刻红', () => {
    // 防的是"空跑门禁"（正则一坏就永远通过）—— 用真文件的一行来验
    const reverted = html.replace('<span data-keys="minimap"></span>', 'M');
    expect(hardcoded(reverted).length).toBeGreaterThan(0);
    expect(hardcoded(reverted).join('\n')).toContain('切换');
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
