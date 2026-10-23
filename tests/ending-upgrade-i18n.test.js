/**
 * 结局对话 / 片尾字幕 / 升级面板剩余玩家可见中文双表化（W-D2 切片26）。
 *
 * ## 为什么要有这道门禁
 *
 * 切片21–25 一片片收掉了 POI 对话、交互提示、任务指路、Boss 名册、NPC 名与日志条目，
 * 但**通关那一刻**整段还是裸中文：`Game.setupEvents` 的 `game-completed` 回调
 * `dialog.show('无尽行者', 'Chapter 5 完成。…')`、`EndCreditsDirector` 的整张字幕表、
 * 以及升级面板技能页签/lore 页签里那几个小标签。英文玩家打到终局，看到的是
 * 一整屏中文 —— 而这是玩家**最不容易错过**的一屏。
 *
 * 顺带收掉两处"项目名单里写死的东西"：
 * - 字幕里 `J 日志 · CG 画廊 · …` 的 `J` 是**硬编码键位**（改拖之后它就是一句谎言），
 *   改成 `{journal}` 占位符，由 `keyText()` 在播放那一刻现问生效表；
 * - 跳过按钮的 `data-ktext` 从构造期写死改成每次 `play()` 重设 —— 它是属性，
 *   构造期写死的话切语言之后再放一遍仍是旧语言。
 *
 * 腿：
 * 1. 结构腿：CREDITS 每一行（非空）都是双表键。
 * 2. 钉文案腿：19 个新键的中英原值逐字钉死。
 * 3. 行为腿：`EndCreditsDirector.play()` 真跑，中英两语字幕无 `[MISSING:]`、
 *    `{journal}` 展开成键名、跳过按钮是展开句。
 * 4. 行为腿：`UpgradePanel` 的技能标签与 lore 页签中英两语无 `[MISSING:]`，
 *    英文下不夹中文。
 * 5. 静态腿：三个文件不许再出现中文串字面量（附反向控制）。
 * 6. 接线腿：七个"该包 t() 却没包"的点逐个钉形状（附反向控制）。
 * 7. 新键不孤儿 + 键数腿 + 反向控制。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { EndCreditsDirector } from '../src/cinematic/EndCreditsDirector.js';
import { UpgradePanel } from '../src/ui/UpgradePanel.js';
import { makeMarkupDom } from './helpers/fakeMarkupDom.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { setLanguage } from '../src/engine/i18n.js';
import { factoryKeybindings, setKeybindTable } from '../src/content/keybinds.js';
import { UI_HOTKEYS, setHotkeyTable } from '../src/content/hotkeys.js';
import { WeaponSkillTree } from '../src/game/WeaponSkillTree.js';
import { offAll } from '../src/engine/EventBus.js';

const 读 = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const Game源码 = 读('src/core/Game.js');
const Credits源码 = 读('src/cinematic/EndCreditsDirector.js');
const Panel源码 = 读('src/ui/UpgradePanel.js');

/** 本片新建的 19 个键 → [中文原值, 英文原值]（改文案必须来改这里） */
const PIN = {
  ending_dialog_text: ['Chapter 5 完成。你斩裂混沌，成为真正的位面行者。\n\n五区贯通、六位 Boss 倒下，这段旅程到此为止——愿下次重逢时，这个世界更加辽阔。',
    'Chapter 5 complete. You cut through chaos and became a true Plane Wanderer.\n\nFive realms joined, six Bosses fallen - the journey ends here. May the world be wider when we meet again.'],
  toast_keybind_invalid: ['键位配置无效，已恢复默认键位', 'Invalid keybind config - defaults restored'],
  credits_line_title: ['跨界纪元 · Crossrealm Chronicles', 'Crossrealm Chronicles'],
  credits_line_engine: ['浏览器 Demo — Vite + Three.js', 'Browser Demo - Vite + Three.js'],
  credits_line_flavor: ['你斩裂混沌，成为位面行者。', 'You cut through chaos and became the Plane Wanderer.'],
  credits_line_thanks: ['感谢游玩', 'Thanks for playing'],
  credits_line_features: ['{journal} 日志 · CG 画廊 · 秘典 · 成就', '{journal} Journal · CG Gallery · Codex · Achievements'],
  credits_line_systems: ['营火 NPC · Boss 再战 · 战斗风格', 'Campfire NPCs · Boss rematch · Combat styles'],
  credits_line_fin: ['— fin —', '— fin —'],
  credits_toast: ['Chapter 5 完成 — 滚动字幕', 'Chapter 5 complete - rolling credits'],
  upgrade_lore_intro_a: ['营火不仅是休息点 — 位面行者的剑与杖在此与', "The campfire is more than a resting place - the Plane Wanderer's sword and staff resonate here with "],
  upgrade_lore_intro_strong: ['剧情', 'the Narrative'],
  upgrade_lore_intro_b: ['共鸣。击败 Boss、推进章节、收集叙事碎片，都会解锁新技能。', '. Defeat Bosses, advance chapters and gather narrative fragments to unlock new skills.'],
  upgrade_lore_status_fmt: ['当前 Chapter ${chapter} · 叙事碎片 ${fragments} 条 · 叙事技能 ${owned}/${total}', 'Chapter ${chapter} · ${fragments} narrative fragments · narrative skills ${owned}/${total}'],
  upgrade_skill_tag_narrative_owned: ['叙事✓', 'Narrative ✓'],
  upgrade_skill_tag_narrative_locked: ['击败 Boss 解锁', 'Defeat a Boss to unlock'],
  upgrade_skill_cost_fmt: ['${cost}点', '${cost} pts'],
  upgrade_skill_lock_boss: ['需击败 Boss', 'Defeat the Boss first'],
  upgrade_skill_lock_chapter_fmt: ['需 Chapter ${chapter}', 'Requires Chapter ${chapter}'],
};
const NEW_KEYS = Object.keys(PIN);

const 含汉 = /[\u4e00-\u9fff]/;
const 串字面量 = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

/** 去掉行尾注释（引号状态外的 `//` 之后全剩下）—— 不去的话，注释里的引号会被当成串字面量 */
function 去行尾注释(line) {
  let q = null;
  for (let i = 0; i < line.length - 1; i++) {
    const c = line[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

/** 扫一份源码里的中文串字面量（注释行与中文标识符都不算） */
function 扫中文串字面量(源码) {
  const 违例 = [];
  源码.split('\n').forEach((raw, i) => {
    const 行 = raw.trim();
    if (行.startsWith('//') || 行.startsWith('*') || 行.startsWith('/*')) return;
    const line = 去行尾注释(raw);
    for (const m of line.matchAll(串字面量)) {
      const 串 = m[1] ?? m[2] ?? m[3] ?? '';
      if (含汉.test(串)) 违例.push((i + 1) + ': ' + 串.slice(0, 60));
    }
  });
  return 违例;
}

/** 从源码里现抠 CREDITS 表（不手抄清单） */
function 读字幕表(源码) {
  const m = 源码.match(/const CREDITS = \[([\s\S]*?)\n\];/);
  expect(m, '源码里找不到 CREDITS 表').not.toBeNull();
  return m[1].split('\n').map((l) => (l.match(/^\s*'([^']*)',\s*$/) ?? [])[1])
    .filter((v) => v !== undefined);
}

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

afterEach(() => {
  offAll('cinematic/EndCreditsDirector');
  delete globalThis.window;
  delete globalThis.CustomEvent;
  delete globalThis.document;
});

describe('结局对话 / 片尾字幕 / 升级面板双表化（W-D2 切片26）', () => {
  it('结构腿：CREDITS 每一行（含空行占位）都是双表键或空串', () => {
    const 行 = 读字幕表(Credits源码);
    expect(行.length, '字幕行数不对 —— 空行也是布局，不许被过滤掉').toBe(11);
    for (const k of 行) {
      if (k === '') continue;
      expect(STRINGS_ZH[k], `中文表里没有字幕键 ${k}`).toBeTypeOf('string');
      expect(STRINGS_EN[k], `英文表里没有字幕键 ${k}`).toBeTypeOf('string');
    }
  });

  it('结构腿反向控制：把一行改回中文必须被点名（防恒绿）', () => {
    const 假 = 读字幕表(Credits源码).map((k) => (k === 'credits_line_thanks' ? '感谢游玩' : k));
    const 假键 = 假.filter((k) => k !== '' && STRINGS_ZH[k] === undefined);
    expect(假键, '改回中文的那一行必须是双表里没有的值').toEqual(['感谢游玩']);
  });

  it('钉文案腿：19 个新键的中英原值逐字钉死', () => {
    for (const [键, [中, 英]] of Object.entries(PIN)) {
      expect(STRINGS_ZH[键], `中文表里没有 ${键}`).toBe(中);
      expect(STRINGS_EN[键], `英文表里没有 ${键}`).toBe(英);
    }
    expect(NEW_KEYS.length, '新键数对不上 —— 切片范围变了？').toBe(19);
  });

  it('行为腿：片尾字幕真播一遍，中英两语都出展开句、{journal} 换成当前键名', () => {
    setKeybindTable(factoryKeybindings());
    setHotkeyTable(UI_HOTKEYS.map((e) => ({ ...e })));
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      装窗();
      const doc = makeMarkupDom();
      globalThis.document = doc;
      const toasts = [];
      const dir = new EndCreditsDirector({ dialog: { toast: (s) => toasts.push(s) } });
      dir.play();
      const 表 = lang === 'zh' ? STRINGS_ZH : STRINGS_EN;
      const 行 = 读字幕表(Credits源码);
      const 期望 = 行.map((l) => (l === '' ? '' : `<p>${表[l].replace('{journal}', 'J')}</p>`)).join('');
      const scroll = dir.el.querySelector('.end-credits-scroll');
      expect(scroll.innerHTML, `${lang} 字幕正文`).not.toContain('[MISSING:');
      // `{journal}` 已被 keyText 换成本机键名（默认表里就是 J）；逐行比对上
      const 出行 = scroll.innerHTML.match(/<p>([^<]*)<\/p>/g) ?? [];
      const 期望行 = 期望.match(/<p>([^<]*)<\/p>/g) ?? [];
      expect(出行, `${lang} 字幕行数`).toHaveLength(期望行.length);
      expect(出行.filter((s) => s.includes('credits_')), `${lang} 字幕里还有键名`).toEqual([]);
      // 跳过按钮：data-ktext 每次 play() 重设，且被 refreshKeyText 展开
      const skip = dir.el.querySelector('.end-credits-skip');
      expect(skip.dataset.ktext, `${lang} 跳过按钮的模板`).toBe(表.cg_caption_void_skip);
      expect(skip.textContent, `${lang} 跳过按钮`).not.toContain('{escape}');
      expect(skip.textContent, `${lang} 跳过按钮`).not.toContain('[MISSING:');
      expect(toasts, `${lang} 通关 toast`).toEqual([表.credits_toast]);
    }
  });

  it('行为腿：升级面板技能标签与 lore 页签中英两语都出展开句', () => {
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      const doc = makeMarkupDom();
      globalThis.document = doc;
      const ws = new WeaponSkillTree({}, { toast() {} }, null);
      const panel = Object.create(UpgradePanel.prototype);
      panel.game = { quests: { chapter: 3 }, storyJournal: { getCounts: () => ({ fragment: 2 }) } };

      const host = doc.createElement('div');
      host.id = 'upgrade-skills-section';
      doc.hosts['upgrade-skills-section'] = host;
      const body = doc.createElement('div');
      body.id = 'upgrade-lore-body';
      doc.hosts['upgrade-lore-body'] = body;

      expect(() => panel.renderLore(ws), 'renderLore 抛异常了').not.toThrow();
      const lore = body.innerHTML;
      expect(lore, `${lang} lore 页签`).not.toContain('[MISSING:');
      expect(lore).not.toContain('upgrade_lore_');
      expect(lore).not.toContain('undefined');
      // 英文下不许夹中文（中文下这句本来就有 `Chapter`，不拿它当判据）
      if (lang === 'en') expect(lore).not.toMatch(含汉);

      // 技能页签：叙事根的标签（未解锁 = "击败 Boss 解锁"）与带 cost 的那一格
      panel.panel = host;
      for (const b of ['sword', 'staff', 'realm']) {
        const el = doc.createElement('div');
        el.attrs['data-skill-branch'] = b;
        host.appendChild(el);
        expect(() => panel.renderSkills(b, ws), `renderSkills(${b}) 抛异常了`).not.toThrow();
        expect(el.innerHTML, `${lang} ${b} 技能页签`).not.toContain('[MISSING:');
        expect(el.innerHTML).not.toContain('upgrade_skill_');
        if (lang === 'en') expect(el.innerHTML).not.toMatch(含汉);
      }
    }
  });

  it('静态腿：三个文件不许再出现中文串字面量', () => {
    expect(扫中文串字面量(Game源码), 'core/Game.js 里还有裸中文').toEqual([]);
    expect(扫中文串字面量(Credits源码), 'EndCreditsDirector 里还有裸中文').toEqual([]);
    expect(扫中文串字面量(Panel源码), 'UpgradePanel 里还有裸中文').toEqual([]);
  });

  it('静态腿反向控制：人造源码必须被点名（防扫描恒绿）', () => {
    const 人造 = [
      "const a = '\u611f\u8c22\u73a9\u5bb6';",
      'const b = `\u5f53\u524d Chapter ${ch}`;',
      "const c = t('credits_line_thanks');",
      '// \u8fd9\u662f\u4e00\u884c\u4e2d\u6587\u6ce8\u91ca',
    ].join('\n');
    expect(扫中文串字面量(人造)).toEqual(['1: \u611f\u8c22\u73a9\u5bb6', '2: \u5f53\u524d Chapter ${ch}']);
  });

  it('接线腿：七个该包 t() 的点逐个钉形状', () => {
    const 行含 = (源码, 片段, 必须) => {
      const 行 = 源码.split('\n').find((l) => l.includes(片段)) ?? '';
      expect(行, `找不到含 "${片段}" 的那一行`).not.toBe('');
      expect(行, `那一行没有把该交出去的交给 t(): ${行.trim()}`).toContain(必须);
    };
    行含(Game源码, "this.dialog.show(", "t('obj_infinity_title')");
    行含(Game源码, 'ending_dialog_text', "t('ending_dialog_text')");
    行含(Game源码, 'this.dialog?.toast(', "t('toast_keybind_invalid')");
    行含(Credits源码, 'scroll.innerHTML = CREDITS.map', 'keyText(t(l))');
    行含(Credits源码, 'skip.dataset.ktext', "t('cg_caption_void_skip')");
    行含(Credits源码, 'this.game.dialog?.toast(', "t('credits_toast')");
    行含(Panel源码, 'upgrade-rest-name', "t('upgrade_rest_default')");
    行含(Panel源码, 'lore-intro', "t('upgrade_lore_intro_a')");
    行含(Panel源码, 'upgrade_lore_status_fmt', "t('upgrade_lore_status_fmt'");
    行含(Panel源码, 's.grant.boss ?', "t('upgrade_skill_lock_boss')");
  });

  it('接线腿反向控制：把 t() 摘掉必须被点名（防恒绿）', () => {
    const 摘掉 = (源码, 从, 到) => 源码.split('\n').map((l) => (l.includes(从) ? l.replace(从, 到) : l)).join('\n');
    const 旧对话 = 摘掉(Game源码, "t('ending_dialog_text')", "'ending_dialog_text'");
    const 旧行 = 旧对话.split('\n').find((l) => l.includes('this.dialog.show('));
    expect(旧行.includes("t('ending_dialog_text')"), '人造的旧写法必须被点名').toBe(false);
    const 旧字幕 = 摘掉(Credits源码, 'keyText(t(l))', 'l');
    const 旧字幕行 = 旧字幕.split('\n').find((l) => l.includes('scroll.innerHTML'));
    expect(旧字幕行.includes('keyText(t(l))'), '人造的旧写法必须被点名').toBe(false);
  });

  it('新键不孤儿：19 个新键都在三个源文件里被引用', () => {
    const 没人用 = NEW_KEYS.filter((k) =>
      !Game源码.includes("'" + k + "'") && !Credits源码.includes("'" + k + "'") && !Panel源码.includes("'" + k + "'"));
    expect(没人用, '这些新键建了却没人引用（死键）').toEqual([]);
  });

  it('键数腿：19 个新键的文案在两表里最多两个键', () => {
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of NEW_KEYS) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('复用的三把键确实在表里（防"复用"变成"指向空气"）', () => {
    for (const k of ['obj_infinity_title', 'upgrade_rest_default', 'cg_caption_void_skip']) {
      expect(STRINGS_ZH[k], `中文表里没有 ${k}`).toBeTypeOf('string');
      expect(STRINGS_EN[k], `英文表里没有 ${k}`).toBeTypeOf('string');
    }
    expect(Game源码).toContain("t('obj_infinity_title')");
    expect(Panel源码).toContain("t('upgrade_rest_default')");
    expect(Credits源码).toContain("t('cg_caption_void_skip')");
  });

  it('反向控制：不在表里的假键必须被点名（防钉文案腿恒绿）', () => {
    const 假 = ['credits_\u6839\u672c\u4e0d\u5b58\u5728_xyz', 'upgrade_\u4e5f\u4e0d\u5b58\u5728_abc'];
    const 缺 = 假.filter((k) => STRINGS_ZH[k] === undefined || STRINGS_EN[k] === undefined);
    expect(缺).toEqual(假);
  });
});