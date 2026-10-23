/**
 * HUD 静态标签与提示族进双表（W-D2 切片27）。
 *
 * ## 为什么要有这道门禁
 *
 * 切片26 收掉了终局那一屏，但 HUD 自己身上还挂着一族裸中文：血条/精力/法力/架势
 * 四个常驻标签、 quest 标题、操作面板 23 个纯标签全是 `data-ktext="中文"` ——
 * 而 `refreshKeyText` 只做 `{动作}` 占位展开、**不过 `t()`**（`data-i18n` 与
 * `data-ktext` 都会写 textContent，历来不能共存）。英文玩家从开机第一秒起，
 * 屏幕常驻位置读到的就是中文。另有三句带 `{动作}` 的长提示（操作面板副标题 +
 * 底部两行）同理。
 *
 * 修法（承本仓两处先例：日志页签标题改 JS 展开、`data-i18n` 走 applyTranslations）：
 * - 23 个纯标签 → `data-i18n`（`applyTranslations` 接管，**换语言自动刷新**）；
 * - 3 句带占位的 → JS 侧 `keyText(t(键))`，由 `HUD.refreshLabels()` 在
 *   `refreshKeyHints()`（改绑路）与 `SettingsManager.applyToGame()`（换语言路）重算。
 *
 * 腿：
 * 1. 结构腿：HUD 模板每一条 data-i18n 都是双表键（自带分母守卫 + 反向控制）。
 * 2. 钉文案腿：23 个标签 + 3 句提示的中英原值逐字钉死（复用的键也钉）。
 * 3. 行为腿：真建 HUD，中英两语标签无 [MISSING:]、英文下不夹中文。
 * 4. 混合句腿：三句带占位的提示中英两语无 [MISSING:]、无残留花括号、含展开键名。
 * 5. 换语言腿：切英文后 data-i18n 格子与三句提示都跟着改口（这条是本片新拿到的）。
 * 6. 静态腿：HUD.js 不再有中文 data-ktext；其余七个文件同理。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeMarkupDom, node } from './helpers/fakeMarkupDom.js';
import { HUD } from '../src/ui/HUD.js';
import { setLanguage, applyTranslations } from '../src/engine/i18n.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { offAll } from '../src/engine/EventBus.js';

const 读 = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const HUD源码 = 读('src/ui/HUD.js');

/** 23 个纯标签：HUD 模板里的 data-i18n 键 → [中文原值, 英文原值] */
const LABELS = {
  hud_quest_label: ['当前任务', 'Current Quest'],
  hud_hp: ['生命', 'HP'],
  hud_stamina: ['精力', 'Stamina'],
  hud_mana: ['法力', 'Mana'],
  sem_label_posture: ['架势', 'Posture'],
  hud_controls_title: ['操作', 'Keybinds'],
  start_move: ['移动', 'Move'],
  kb_label_sprint: ['冲刺', 'Sprint'],
  kb_label_attack_light: ['轻击', 'Light Attack'],
  kb_label_attack_heavy: ['重击', 'Heavy Attack'],
  style_label_parry: ['弹反', 'Parry'],
  hud_ctrl_roll: ['闪避', 'Dodge'],
  kb_label_lock_on: ['锁定', 'Lock On'],
  hud_ctrl_spell: ['法术', 'Spells'],
  kb_label_interact: ['交互', 'Interact'],
  hud_ctrl_journal: ['日志/CG', 'Journal/CG'],
  hud_ctrl_photo: ['拍照', 'Photo'],
  hotkey_label_session_stats: ['本局统计', 'Session Stats'],
  hud_ctrl_assistant: ['助手', 'Assistant'],
  hud_ctrl_camera: ['视角', 'Camera'],
  hotkey_label_minimap: ['小地图', 'Minimap'],
  hud_ctrl_world_map: ['全图/路点', 'World Map'],
  hud_ctrl_save_load: ['存读', 'Save/Load'],
};

/** 三句带 {动作} 的提示：键 → [中文原值, 英文原值]（英文原值只钉关键词，占位由 keyText 展开） */
const MIXED = {
  hud_help_full: ['{help} 完整说明', '{help} Full Manual'],
  hud_hint_combat: ['{attackLight} 连击 · {attackHeavy} 重击/处决 · {parry} 弹反 · {skill} 位面斩 · {lockOn} 锁定 · {roll} 闪避',
    '{attackLight} Combo · {attackHeavy} Heavy/Execute · {parry} Parry · {skill} Planar Slash · {lockOn} Lock-on · {roll} Dodge'],
  hud_hint_system: ['{spell1}~{spell4} 法术 · {swapWeapon} 切换武器 · {fastTravel} 快速旅行 · {help} 说明书 · {escape} 暂停',
    '{spell1}~{spell4} Spells · {swapWeapon} Swap Weapon · {fastTravel} Fast Travel · {help} Manual · {escape} Pause'],
};

/** 本片另外收掉的六个文件（data-ktext / 裸中文整句） */
const OTHER_FILES = [
  'src/ui/CampfireMemoryJournalTab.js',
  'src/ui/CgJournalTab.js',
  'src/ui/WeaponSkillJournalTab.js',
  'src/ui/QuestAssistant.js',
  'src/player/DemoRunner.js',
  'src/player/PlayerAutoPlay.js',
  'src/game/CombatTutorialDirector.js',
];

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function bootDoc() {
  const doc = makeMarkupDom();
  const html = node('html', doc);
  html.style.setProperty = (name, value) => { html.style[name] = value; };
  html.appendChild(doc.body);
  doc.documentElement = html;
  for (const id of ['hud', 'minimap-wrap', 'minimap', 'zone-panel', 'zone-banner', 'journal-panel', 'pause-journal']) {
    const el = node(id === 'minimap' ? 'canvas' : 'div', doc);
    el.id = id;
    doc.body.appendChild(el);
    doc.hosts[id] = el;
  }
  doc.getElementById = (id) => doc.hosts[id] ?? doc.body.querySelectorAll(`#${id}`)[0] ?? null;
  doc.querySelectorAll = (sel) => doc.body.querySelectorAll(sel);
  doc.querySelector = (sel) => doc.body.querySelector(sel);
  return doc;
}

function bootGame() {
  return {
    inputDevice: { current: () => null },
    dialog: { toast: () => {} },
    quests: {
      notifyUpdate() {
        window.dispatchEvent(new CustomEvent('quest-updated', {
          detail: { chapter: 2, current: { title: 'obj_anchor_title', progress: '0/1' } },
        }));
      },
      getProgressText: () => '0/1',
    },
  };
}

describe('HUD 标签双表化（W-D2 切片27）', () => {
  const 含汉 = /[\u4e00-\u9fff]/;

  beforeAll(() => {
    globalThis.document = bootDoc();
    globalThis.localStorage = fakeStorage();
    // window 用全局夹具那一份（真 EventTarget 转发）：HUD 构造期会派 quest-updated
    setLanguage('zh');
  });

  afterAll(() => {
    offAll('ui/HUD');
    delete globalThis.document;
    delete globalThis.localStorage;
    setLanguage('zh');
  });

  it('结构腿：HUD 模板每一条 data-i18n 都是双表登记的键（自带分母守卫 + 反向控制）', () => {
    const decls = [...HUD源码.matchAll(/data-i18n="([^"]*)"/g)].map((m) => m[1]);
    expect(decls.length, '一条都没抓到，抓取本身坏了').toBeGreaterThan(20);
    const unregistered = decls.filter((k) => !(k in STRINGS_ZH) || !(k in STRINGS_EN));
    expect(unregistered, '这些标签没进双表：英文界面下它们会是中文原文').toEqual([]);
    // 反向控制：过滤器必须能点名没登记的键
    expect(['hud_hp', 'no_such_key_xyz'].filter((k) => !(k in STRINGS_ZH))).toEqual(['no_such_key_xyz']);
  });

  it('钉文案腿：23 个标签的中英原值逐字钉死（复用的键也钉，防"顺手改了口径"）', () => {
    for (const [key, [zh, en]] of Object.entries(LABELS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('钉文案腿：三句带占位提示的中英原值逐字钉死', () => {
    for (const [key, [zh, en]] of Object.entries(MIXED)) {
      expect(STRINGS_ZH[key]).toBe(zh);
      expect(STRINGS_EN[key]).toBe(en);
    }
  });

  it('行为腿：英文开机，HUD 常驻标签全是英文、不夹中文', () => {
    setLanguage('en');
    const doc = bootDoc();
    globalThis.document = doc;
    const hud = new HUD(bootGame());
    applyTranslations(doc);
    const texts = ['.quest-label', '.bar-label', '.panel-title'].flatMap((sel) =>
      doc.querySelectorAll(sel).map((el) => el.textContent));
    expect(texts.length, '标签一个都没渲染出来').toBeGreaterThan(5);
    for (const text of texts) {
      expect(text, `英文界面下夹中文: ${text}`).not.toMatch(含汉);
      expect(text).not.toContain('[MISSING:');
    }
    // 假 DOM 的选择器把".ctrl-item span"当单元素多条件（不支持后代组合器），
    // 所以先取格子再取格子里那个 span —— 与浏览器里 querySelectorAll 的结果一致
    const ctrl = doc.querySelectorAll('.ctrl-item')
      .flatMap((item) => item.children.filter((c) => c.tag === 'span').map((c) => c.textContent));
    expect(ctrl.length, '操作面板的标签一个都没渲染出来').toBeGreaterThan(15);
    for (const text of ctrl) {
      expect(text, `英文界面下夹中文: ${text}`).not.toMatch(含汉);
      expect(text).not.toContain('[MISSING:');
    }
    hud.dispose?.();
  });

  it('行为腿：中文开机，标签是原值（不是键名、不是空）', () => {
    setLanguage('zh');
    const doc = bootDoc();
    globalThis.document = doc;
    const hud = new HUD(bootGame());
    applyTranslations(doc);
    expect(doc.querySelector('.quest-label').textContent).toBe('当前任务');
    expect(doc.querySelector('.bar-label').textContent).toBe('生命');
    const ctrlZh = doc.querySelectorAll('.ctrl-item')
      .flatMap((item) => item.children.filter((c) => c.tag === 'span').map((c) => c.textContent));
    for (const text of ctrlZh) {
      expect(text).not.toBe('');
      expect(text).not.toContain('[MISSING:');
    }
    hud.dispose?.();
  });

  it('混合句腿：三句带 {动作} 的提示中英两语都展开、不留花括号', () => {
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      const doc = bootDoc();
      globalThis.document = doc;
      const hud = new HUD(bootGame());
      applyTranslations(doc);
      const hint = doc.getElementById('controls-hint');
      expect(hint.textContent, `${lang}: 占位没被展开`).not.toMatch(/\{/);
      expect(hint.textContent).not.toContain('[MISSING:');
      expect(doc.getElementById('controls-shortcut').textContent).not.toMatch(/\{|\[MISSING:/);
      hud.dispose?.();
    }
  });

  it('换语言腿：切英文后 data-i18n 格子与三句提示都跟着改口', () => {
    setLanguage('zh');
    const doc = bootDoc();
    globalThis.document = doc;
    const hud = new HUD(bootGame());
    applyTranslations(doc);
    expect(doc.querySelector('.quest-label').textContent).toBe('当前任务');
    // 换语言：SettingsManager.applyToGame 的那两行（setLanguage + applyTranslations + hud 刷新）
    setLanguage('en');
    applyTranslations(doc);
    expect(doc.querySelector('.quest-label').textContent, '换语言后 quest 标题没改口').toBe('Current Quest');
    expect(doc.querySelector('.bar-label').textContent).toBe('HP');
    // 三句 JS 现算的提示：走 refreshKeyHints → refreshLabels
    hud.refreshKeyHints();
    const hint = doc.getElementById('controls-hint');
    expect(hint.textContent).not.toMatch(含汉);
    expect(hint.textContent).not.toMatch(/\{/);
    hud.dispose?.();
    setLanguage('zh');
  });

  it('静态腿：HUD.js 与另外七个文件不再有中文 data-ktext', () => {
    const files = ['src/ui/HUD.js', ...OTHER_FILES];
    for (const f of files) {
      const src = 读(f);
      expect(src, `${f} 里还有裸中文 data-ktext`).not.toMatch(/data-ktext="[^"]*[\u4e00-\u9fff]/);
    }
  });

  it('接线腿：SettingsManager.applyToGame 里换语言后重算 HUD（静态钉形状）', () => {
    const src = 读('src/core/SettingsManager.js');
    expect(src, '换语言后没人重算 HUD 的三句提示').toMatch(/game\?\.hud\?\.refreshKeyHints\?\.\(\)/);
  });

  it('接线腿：HUD.refreshKeyHints 里调了 refreshLabels（反向控制：摘掉必须红）', () => {
    const body = /refreshKeyHints\(\) \{([\s\S]*?)\n {2}\}/.exec(HUD源码)?.[1] ?? '';
    expect(body, 'HUD 里找不到 refreshKeyHints 的方法体（门禁自己坏了）').toContain('refreshLabels();');
    expect(HUD源码, '找不到 refreshLabels 方法').toContain('refreshLabels() {');
  });

  it('键数腿：双表对齐且键数只增不减（2232 → 更多或持平）', () => {
    const zhKeys = Object.keys(STRINGS_ZH);
    const enKeys = Object.keys(STRINGS_EN);
    expect(zhKeys.length).toBe(enKeys.length);
    expect(zhKeys.length).toBeGreaterThanOrEqual(2232);
  });
});