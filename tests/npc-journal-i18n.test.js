/**
 * NPC 名与日志条目标题/正文双表化（W-D2 切片25）。
 *
 * ## 为什么要有这道门禁
 *
 * 切片21–24 收掉了 POI 对话、交互提示、任务指路、Boss 名册，但**人名与日志条目**
 * 这一族还是裸中文或"键没展开"：
 *
 * ① `world/NPCManager.js` 的 `NPC_DATA` 三个 `name` 是裸中文，而它的三个消费点
 *    （对话框说话人 / 日志条目标题 / 交互提示参数）全都假定"拿到的是显示名"；
 * ② `game/StoryJournal.js` 的 `dungeon-cleared` / `enemy-defeated` 两条日志回调里
 *    标题与正文是裸中文字面量，`def.name` 是键却没 `t()`，Boss 名走的是名册的
 *    `name` / `shortName` **旧字段**（切片24 之后名册给的是键）；
 * ③ `game/PopCultureEchoSystem.js` 把 `echo.desc`（**键**）直接当正文写进日志。
 *
 * 日志是**快照出口**：`HUD.renderJournal` 把 `d.title` / `d.text` 原样插进 innerHTML，
 * 不过 `t()`。所以"存进去的必须是定稿"，展开只能发生在写进去那一刻。
 *
 * 腿：
 * 1. 结构腿：NPC_DATA 三格的 name 都是双表键（附反向控制）。
 * 2. 钉文案腿：5 个新键的中英原值逐字钉死。
 * 3. 行为腿：三个 NPC 真走 `talk()`，对话框说话人与日志标题都是展开名。
 * 4. 行为腿：`dungeon-cleared` / `enemy-defeated` 两条日志回调，中英两语出展开句。
 * 5. 行为腿：回声解锁写进日志的正文是展开句，不是键名。
 * 6. 静态腿：三个文件不许再出现中文串字面量。
 * 7. 接线腿：五个"该包 t() 却没包"的点逐个钉形状（附反向控制）。
 * 8. 新键不孤儿 + 键数腿 + 反向控制。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { NPCManager, NPC_DATA } from '../src/world/NPCManager.js';
import { StoryJournal } from '../src/game/StoryJournal.js';
import { PopCultureEchoSystem } from '../src/game/PopCultureEchoSystem.js';
import { bossById } from '../src/content/bossRoster.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { setLanguage } from '../src/engine/i18n.js';
import { offAll } from '../src/engine/EventBus.js';

const 读 = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const NPC源码 = 读('src/world/NPCManager.js');
const 日志源码 = 读('src/game/StoryJournal.js');
const 回声源码 = 读('src/game/PopCultureEchoSystem.js');
const 玩家源码 = 读('src/player/PlayerController.js');

/** 本片新建的 5 个键 → [中文原值, 英文原值]（改文案必须来改这里） */
const PIN = {
  journal_dungeon_generic_name: ['地下城', 'Unknown Dungeon'],
  journal_dungeon_cleared_fmt: ['${name}已征服', '${name} conquered'],
  journal_dungeon_cleared_text: ['迷宫守钥者倒下，位面之门再次闭合。你带走的不只是战利品，还有被埋藏的记忆。', 'The keywarden falls and the plane gate seals once more. You leave with more than loot - you carry the buried memories.'],
  journal_boss_defeated_fmt: ['击败 ${name}', 'Defeated ${name}'],
  journal_boss_defeated_text: ['又一道位面枷锁被斩断。锚点的脉动在你胸口回响。', 'Another planar shackle is cut. The pulse of the anchor echoes in your chest.'],
};
const NEW_KEYS = Object.keys(PIN);

/** 与 `engine/i18n.js` 的 interpolate 同一条式子 */
const 展开 = (模板, 参数) => 模板.replace(/\$\{(\w+)\}/g, (_, k) => 参数[k] ?? '');

const 含汉 = /[\u4e00-\u9fff]/;
const 串字面量 = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

/** 扫一份源码里的中文串字面量（注释行与中文标识符都不算） */
function 扫中文串字面量(源码) {
  const 违例 = [];
  源码.split('\n').forEach((line, i) => {
    const 行 = line.trim();
    if (行.startsWith('//') || 行.startsWith('*') || 行.startsWith('/*')) return;
    for (const m of line.matchAll(串字面量)) {
      const 串 = m[1] ?? m[2] ?? m[3] ?? '';
      if (含汉.test(串)) 违例.push((i + 1) + ': ' + 串.slice(0, 60));
    }
  });
  return 违例;
}

/** window / CustomEvent 替身：EventBus 的底层就是这两个 */
const handlers = new Map();
function 装窗() {
  handlers.clear();
  globalThis.window = {
    addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); },
    removeEventListener(type, fn) { handlers.get(type)?.delete(fn); },
    dispatchEvent(event) { handlers.get(event.type)?.forEach((fn) => fn(event)); return true; },
  };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
}
const 派发 = (type, detail) => globalThis.window.dispatchEvent(new globalThis.CustomEvent(type, { detail }));

afterEach(() => {
  offAll('game/StoryJournal');
  offAll('game/PopCultureEchoSystem');
  delete globalThis.window;
  delete globalThis.CustomEvent;
});

/** 真造一个 NPCManager（走生产同一条 `build()`），接住对话框与日志 */
function 造Npc层() {
  装窗();
  const shown = [];
  const entries = [];
  const mgr = new NPCManager(
    { add() {} },
    { getGroundHeight: () => 0 },
    { show: (title, text) => shown.push({ title, text }) },
    { quests: { chapter: 1 }, storyJournal: { add: (e) => entries.push(e) } },
  );
  return { mgr, shown, entries };
}

describe('NPC 名与日志条目双表化（W-D2 切片25）', () => {
  it('结构腿：NPC_DATA 三格的 name 都是双表键', () => {
    expect(NPC_DATA.length, 'NPC 不是三个 —— 这一条会空转').toBe(3);
    for (const npc of NPC_DATA) {
      expect(STRINGS_ZH[npc.name], `中文表里没有 ${npc.id} 的名字键 ${npc.name}`).toBeTypeOf('string');
      expect(STRINGS_EN[npc.name], `英文表里没有 ${npc.id} 的名字键 ${npc.name}`).toBeTypeOf('string');
    }
  });

  it('结构腿反向控制：改回中文必须被点名（防恒绿）', () => {
    const 假 = ['位面流浪者', '守墓人', 'echo_wizard_school_desc'];
    // 假键里只有 `echo_wizard_school_desc` 是真键 —— 过滤器必须精确地把两个中文点出来
    const 假键 = 假.filter((k) => STRINGS_ZH[k] === undefined);
    expect(假键).toEqual(['位面流浪者', '守墓人']);
  });

  it('钉文案腿：5 个新键的中英原值逐字钉死', () => {
    for (const [键, [中, 英]] of Object.entries(PIN)) {
      expect(STRINGS_ZH[键], `中文表里没有 ${键}`).toBe(中);
      expect(STRINGS_EN[键], `英文表里没有 ${键}`).toBe(英);
    }
    expect(NEW_KEYS.length, '新键数对不上 —— 切片范围变了？').toBe(5);
  });

  it('行为腿：三个 NPC 真走 talk()，对话框说话人与日志标题都是展开名', () => {
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      const { mgr, shown, entries } = 造Npc层();
      for (const npc of mgr.npcs) mgr.talk(npc);
      expect(shown, '对话框没被调三次').toHaveLength(3);
      expect(entries, '日志没写三条').toHaveLength(3);
      const 表 = lang === 'zh' ? STRINGS_ZH : STRINGS_EN;
      mgr.npcs.forEach((npc, i) => {
        expect(shown[i].title, `${npc.id}(${lang}) 对话框说话人`).toBe(表[npc.name]);
        expect(entries[i].title, `${npc.id}(${lang}) 日志条目标题`).toBe(表[npc.name]);
        expect(shown[i].title, `${npc.id}(${lang}) 说话人是键名`).not.toContain('[MISSING:');
      });
    }
  });

  it('行为腿：副本清空日志的标题带展开后的副本名，正文走双表', () => {
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      装窗();
      const j = new StoryJournal({
        quests: { chapter: 2 },
        dungeons: { dungeons: new Map([['crypt', { def: { id: 'crypt', name: 'dungeon_ruin_crypt_name' } }]]) },
      });
      j.setupListeners();
      派发('dungeon-cleared', { id: 'crypt' });
      expect(j.entries, '副本清空没写日志').toHaveLength(1);
      const 表 = lang === 'zh' ? STRINGS_ZH : STRINGS_EN;
      expect(j.entries[0].title).toBe(展开(表.journal_dungeon_cleared_fmt, { name: 表.dungeon_ruin_crypt_name }));
      expect(j.entries[0].text).toBe(表.journal_dungeon_cleared_text);
      expect(j.entries[0].title).not.toContain('[MISSING:');
    }
  });

  it('行为腿：副本定义查不到时退回通用副本名，而不是把 undefined 拼进标题', () => {
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      装窗();
      const j = new StoryJournal({ quests: { chapter: 2 }, dungeons: { dungeons: new Map() } });
      j.setupListeners();
      派发('dungeon-cleared', { id: '查无此副本' });
      const 表 = lang === 'zh' ? STRINGS_ZH : STRINGS_EN;
      expect(j.entries[0].title).toBe(展开(表.journal_dungeon_cleared_fmt, { name: 表.journal_dungeon_generic_name }));
      expect(j.entries[0].title).not.toContain('undefined');
    }
  });

  it('行为腿：Boss 击败日志用名册的短名键展开，野生 Boss 退回事件负载里的定稿名', () => {
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      装窗();
      const j = new StoryJournal({ quests: { chapter: 3 }, dungeons: null });
      j.setupListeners();
      const 表 = lang === 'zh' ? STRINGS_ZH : STRINGS_EN;
      // 名册里有短名的（archmagus）
      派发('enemy-defeated', { type: 'boss', bossId: 'archmagus', name: '大奥术师·萨尔林' });
      // 名册里没有的（野生 Boss）
      派发('enemy-defeated', { type: 'boss', bossId: 'wild-thing', name: '荒野巨兽' });
      // 副本 Boss 被 isDungeonBossId 挡掉，不该进这一族
      派发('enemy-defeated', { type: 'boss', bossId: 'dungeon-crypt', name: '迷宫守钥者' });
      // `add()` 是 unshift ⇒ 最新的在最前面
      expect(j.entries.map((e) => e.title)).toEqual([
        展开(表.journal_boss_defeated_fmt, { name: '荒野巨兽' }),
        展开(表.journal_boss_defeated_fmt, { name: 表[bossById('archmagus').shortNameKey] }),
      ]);
      expect(j.entries[0].text).toBe(表.journal_boss_defeated_text);
      j.entries.forEach((e) => expect(e.title).not.toContain('[MISSING:'));
    }
  });

  it('行为腿：回声解锁写进日志的正文是展开句，不是键名', () => {
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      装窗();
      const 日志 = [];
      const sys = new PopCultureEchoSystem({
        dialog: { toast() {} },
        storyJournal: { add: (e) => 日志.push(e) },
        quests: { chapter: 1 },
      });
      sys.tryUnlock('discovery:magic-castle');
      expect(日志, '回声解锁没写日志').toHaveLength(1);
      const 表 = lang === 'zh' ? STRINGS_ZH : STRINGS_EN;
      expect(日志[0].text).toBe(表.echo_wizard_school_desc);
      expect(日志[0].text).not.toContain('[MISSING:');
      expect(日志[0].text).not.toContain('echo_');
    }
  });

  it('静态腿：三个文件不许再出现中文串字面量', () => {
    expect(扫中文串字面量(NPC源码), 'NPCManager 里还有裸中文').toEqual([]);
    expect(扫中文串字面量(日志源码), 'StoryJournal 里还有裸中文').toEqual([]);
    expect(扫中文串字面量(回声源码), 'PopCultureEchoSystem 里还有裸中文').toEqual([]);
    expect(扫中文串字面量(玩家源码), 'PlayerController 里还有裸中文').toEqual([]);
  });

  it('静态腿反向控制：人造源码必须被点名（防扫描恒绿）', () => {
    const 人造 = [
      "const a = '\u5f00\u542f\u5b9d\u7bb1';",
      'const b = `\u4e0e ${x} \u4ea4\u8c08`;',
      "const c = t('prompt_chest_open', { interact });",
      '// \u8fd9\u662f\u4e00\u884c\u4e2d\u6587\u6ce8\u91ca',
      '/* \u5757\u6ce8\u91ca\u4e5f\u662f\u4e2d\u6587 */',
    ].join('\n');
    expect(扫中文串字面量(人造)).toEqual(['1: \u5f00\u542f\u5b9d\u7bb1', '2: \u4e0e ${x} \u4ea4\u8c08']);
  });

  it('接线腿：五个该包 t() 的点逐个钉形状', () => {
    const 行含 = (源码, 片段, 必须) => {
      const 行 = 源码.split('\n').find((l) => l.includes(片段)) ?? '';
      expect(行, `找不到含 "${片段}" 的那一行`).not.toBe('');
      expect(行, `那一行没有把该交出去的交给 t(): ${行.trim()}`).toContain(必须);
      return 行;
    };
    行含(NPC源码, 'this.dialog.show(', 't(npc.name)');
    行含(NPC源码, 'title: ', 't(npc.name)');
    行含(日志源码, 'journal_dungeon_cleared_fmt', "t('journal_dungeon_cleared_fmt'");
    行含(日志源码, 'journal_boss_defeated_fmt', "t('journal_boss_defeated_fmt'");
    行含(回声源码, 'text: ', 't(echo.desc)');
    行含(玩家源码, 'prompt_rest_npc_fmt', 't(rn.name)');
    行含(玩家源码, 'prompt_npc_talk_fmt', 't(npc.name)');
  });

  it('接线腿反向控制：把 t() 摘掉必须被点名（防恒绿）', () => {
    const 摘掉 = (源码, 从, 到) => 源码.split('\n').map((l) => (l.includes(从) ? l.replace(从, 到) : l)).join('\n');
    const 旧npc = 摘掉(NPC源码, 'this.dialog.show(t(npc.name), line);', 'this.dialog.show(npc.name, line);');
    const 旧行 = 旧npc.split('\n').find((l) => l.includes('this.dialog.show('));
    expect(旧行.includes('t(npc.name)'), '人造的旧写法必须被点名').toBe(false);
    const 旧回声 = 摘掉(回声源码, 'text: t(echo.desc),', 'text: echo.desc,');
    const 旧回声行 = 旧回声.split('\n').find((l) => l.trim().startsWith('text: '));
    expect(旧回声行.includes('t(echo.desc)'), '人造的旧写法必须被点名').toBe(false);
  });

  it('新键不孤儿：5 个新键都在源文件里被引用', () => {
    const 没人用 = NEW_KEYS.filter((k) =>
      !日志源码.includes("'" + k + "'") && !NPC源码.includes("'" + k + "'"));
    expect(没人用, '这些新键建了却没人引用（死键）').toEqual([]);
  });

  it('键数腿：5 个新键的文案在两表里最多两个键', () => {
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of NEW_KEYS) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('反向控制：不在表里的假键必须被点名（防钉文案腿恒绿）', () => {
    const 假 = ['journal_\u6839\u672c\u4e0d\u5b58\u5728_xyz', 'journal_\u4e5f\u4e0d\u5b58\u5728_abc'];
    const 缺 = 假.filter((k) => STRINGS_ZH[k] === undefined || STRINGS_EN[k] === undefined);
    expect(缺).toEqual(假);
  });
});