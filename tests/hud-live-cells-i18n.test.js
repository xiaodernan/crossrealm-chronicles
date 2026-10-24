/**
 * HUD 常驻格换语言重算（W-D2 切片36）。
 *
 * ## 这一片解决什么
 *
 * 切片16i 收了区名 / 副标题的"存键"，切片27 收了静态标签，但 HUD 还有一批常驻格是
 * "事件到来时把**展开后的文本**写进 DOM"：
 *
 * - `souls-display` / `discovery-count` / `skill-points-display` / `camera-mode-display`
 *   四格由 `stats-changed` / `journal-updated` / `skill-points-changed` /
 *   `camera-mode-changed` 的处理器直接 `t()` 后写 textContent；
 * - `boss-name` / `boss-phase` 两格由 `boss-health` 载荷里的 `name` 直接写
 *   （那是 Boss 构造期按**当时语言**展开好的文本）；
 * - `input-device-display` 一格问 `inputDeviceLabel()`，那张表是裸中文
 *   （`INPUT_DEVICE_LABELS = { keyboard: 键盘, … }`）；
 * - 位面渗漏的副标题覆盖层存的是 `t('hud_subtitle_planar_bleed', { zone })` 展开后的整句。
 *
 * 症状有两层：英文玩家开机后这些格子是中文；更隐蔽的是**换语言**时它们停留在旧语言 ——
 * 事件不会因为换了语言再派发一遍，`applyTranslations` 也只认 `data-i18n` 声明式格子。
 *
 * ## 机制
 *
 * 常驻格全部改成"存键 / 存快照 + 渲染函数"：事件处理器只记账，`_render*()` 在写 DOM 的
 * 那一刻 `t()` 现展开；`refreshLabels()` 末尾把每一格按快照重算一遍 —— 换语言那条路
 * （`SettingsManager.applyToGame → hud.refreshKeyHints → refreshLabels`）本来就会调到它。
 * 三个设备名进双表（`input_device_*`）；`boss-health` 载荷与 `realm-bleed` 的 zone
 * 改带文案键，HUD 侧现展开。
 *
 * ## 用例分七层
 * ① 钉文案腿：3 个新键 + 14 个复用键的中英原值逐字钉死；
 * ② 键登记腿：三个键两表都在场，键数 2304 → 2307 → 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404，不孤儿、同文案最多两键；
 * ③ 静态腿：HUD 模板六格出厂文案无中文、zone 两格挂 data-i18n、refreshLabels 六路重算
 *    齐场；InputDevice 无裸中文；Boss 载荷不带 name；事件登记处同步；
 * ④ Boss 行为腿：真生成 Boss，`boss-health` 载荷 = { hp, maxHp, phase, nameKey }；
 * ⑤ HUD 行为腿：中文开机，事件落到六格全是展开句，覆盖层可撤；
 * ⑥ 换语言腿（核心）：zh 落全套事件 → 切 en → 每格英文且不留中文；
 * ⑦ 反面证据：inputDeviceLabel 中英与未知侧、登记处断言、尺子自证、旧载荷形状失效。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HUD } from '../src/ui/HUD.js';
import { inputDeviceLabel } from '../src/engine/InputDevice.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { setLanguage, applyTranslations } from '../src/engine/i18n.js';
import { makeMarkupDom, node } from './helpers/fakeMarkupDom.js';
import { makeManager } from './helpers/enemyHarness.js';
import { offAll } from '../src/engine/EventBus.js';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');
const 含汉 = /[\u4e00-\u9fff]/;

/** 3 个新键：输入设备那一格的三个名字 */
const NEW_KEYS = {
  input_device_keyboard: ['键盘', 'Keyboard'],
  input_device_mouse: ['鼠标', 'Mouse'],
  input_device_gamepad: ['手柄', 'Gamepad'],
};

/** 本片接线 / 复用的既有键：键 → [中文原值, 英文原值] */
const WIRED = {
  hud_zone_name_default: ['交汇枢纽', 'Nexus'],
  hud_zone_subtitle_default: ['位面中心', 'Plane Center'],
  hud_souls_display_fmt: ['魂 ${souls} · Lv.${level}', 'Souls ${souls} · Lv.${level}'],
  hud_discovery_fmt: ['日志 ${count} · 碎片 ${fr}/8 · 地图 ${pct}%', 'Logs ${count} · Fragments ${fr}/8 · Map ${pct}%'],
  hud_skill_points_fmt: ['技能点 ${points}', 'Skill Points ${points}'],
  hud_camera_mode_first: ['第一人称', 'First Person'],
  hud_camera_mode_third: ['第三人称', 'Third Person'],
  hud_boss_phase_1: ['阶段 I', 'Phase I'],
  hud_boss_phase_2: ['阶段 II', 'Phase II'],
  hud_boss_phase_3: ['阶段 III', 'Phase III'],
  hud_subtitle_planar_bleed: ['位面渗漏 · ${zone}', 'Planar Bleed · ${zone}'],
  hud_subtitle_time_stop: ['⏳ 时停中 — 蓄力法术可打断', '⏳ Time Stop — charged spells can interrupt'],
  zone_name_magic: ['霍格沃兹遗境', 'Hogwarts Ruins'],
  zone_subtitle_magic: ['魔法位面 · 哈利波特', 'Magic Plane · Harry Potter'],
  boss_name_shadow: ['影界守护者', 'Shadow Warden'],
};

/** 极简词法扫描：只取字符串/模板字面量的区间（标识符里的中文是仓库惯例，不当文案） */
function 字符串字面量(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const nx = src[i + 1];
    if (c === '/' && nx === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && nx === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1; i += 2; continue; }
    if (c === "'" || c === '"') {
      const q = c; const start = i; i += 1;
      while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i += 1; break; } if (src[i] === '\n') break; i += 1; }
      out.push({ start, end: i, tpl: false }); continue;
    }
    if (c === '`') {
      const start = i; i += 1;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') { i += 1; break; }
        if (src[i] === '$' && src[i + 1] === '{') { i += 2; continue; }
        i += 1;
      }
      out.push({ start, end: i, tpl: true }); continue;
    }
    i += 1;
  }
  return out;
}

/** 模板串里 ${...} 是插值（标识符 / 表达式），不是文案 —— 剔掉再判中文 */
const 文案部分 = (src, s) => (s.tpl ? src.slice(s.start, s.end).replace(/\$\{[^}]*\}/g, '') : src.slice(s.start, s.end));

const 中文字面量 = (src) => 字符串字面量(src)
  .map((s) => 文案部分(src, s))
  .filter((text) => 含汉.test(text));

/** 魔法位面的区描述（键口径，与 ZoneIdentity 的 info 同形状） */
const MAGIC_ZONE = {
  id: 'magic',
  name: 'zone_name_magic',
  subtitle: 'zone_subtitle_magic',
  description: 'zone_desc_magic',
};

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

/** 与生产同序的最小 game；`withJournal` 打开日志 / 探索度计数桩 */
function bootGame(withJournal = false) {
  const game = {
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
  if (withJournal) {
    game.storyJournal = { entries: [{ id: 'a' }, { id: 'b' }], getCounts: () => ({ fragment: 3 }) };
    game.explorationMap = { getExploredPercent: () => 40 };
  }
  return game;
}

/** 一次"换了区、开了 Boss 战、渗漏了、日志动了"的完整事件流 */
const 全套事件 = () => {
  window.dispatchEvent(new CustomEvent('stats-changed', { detail: { souls: 5, level: 2 } }));
  window.dispatchEvent(new CustomEvent('skill-points-changed', { detail: { points: 3 } }));
  window.dispatchEvent(new CustomEvent('camera-mode-changed', { detail: { mode: 'first' } }));
  window.dispatchEvent(new CustomEvent('zone-changed', { detail: { zone: MAGIC_ZONE, zoneId: 'magic', initial: true } }));
  window.dispatchEvent(new CustomEvent('boss-start'));
  window.dispatchEvent(new CustomEvent('boss-health', { detail: { hp: 500, maxHp: 800, phase: 1, nameKey: 'boss_name_shadow' } }));
  window.dispatchEvent(new CustomEvent('realm-bleed', { detail: { zone: 'zone_name_magic', key: 'magic' } }));
  window.dispatchEvent(new CustomEvent('journal-updated'));
};

/* ------------------------------------------------------------------ *
 * ① 钉文案腿
 * ------------------------------------------------------------------ */

describe('① 钉文案腿：3 个新键 + 14 个复用键的中英原值逐字钉死', () => {
  it('三个设备名新键', () => {
    for (const [key, [zh, en]] of Object.entries(NEW_KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('十四个复用键（zone 两格 / 魂 / 发现 / 技能点 / 镜头 / Boss 三阶段 / 两条副标题 / magic 区 / Boss 名）', () => {
    for (const [key, [zh, en]] of Object.entries(WIRED)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('四个带占位的键中英占位符一致（{souls}/{level}/{count}/{fr}/{pct}/{points}/{zone}）', () => {
    for (const key of ['hud_souls_display_fmt', 'hud_discovery_fmt', 'hud_skill_points_fmt', 'hud_subtitle_planar_bleed']) {
      const 占位 = (s) => [...s.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(占位(STRINGS_EN[key]), `${key} 中英占位符不一致`).toEqual(占位(STRINGS_ZH[key]));
    }
  });
});

/* ------------------------------------------------------------------ *
 * ② 键登记腿
 * ------------------------------------------------------------------ */

describe('② 键登记：三个新键两表都在场，键数 2304 → 2307 → 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404', () => {
  it('三个新键中英两表一个不缺', () => {
    const zh = new Set(ZH_KEYS);
    const en = new Set(EN_KEYS);
    for (const key of Object.keys(NEW_KEYS)) {
      expect(zh.has(key), `中文表缺 ${key}`).toBe(true);
      expect(en.has(key), `英文表缺 ${key}`).toBe(true);
    }
  });

  it('键数 2304 → 2307 → 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404，两表逐键对齐', () => {
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
    expect(ZH_KEYS.length, '键数不是 2404 —— 双表被别处改过').toBe(2404);
  });

  it('新键不孤儿：每个新键都在 src 里被引用（死键计数只减不增）', () => {
    const 源 = [读('src/engine/InputDevice.js'), 读('src/ui/HUD.js'), 读('src/engine/events.js')];
    for (const key of Object.keys(NEW_KEYS)) {
      expect(源.some((s) => s.includes(key)), `${key} 建了却没人引用（死键）`).toBe(true);
    }
  });

  it('新键与接线键的文案在两表里都最多两个键（同文案写三遍就是命名族失控）', () => {
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of [...Object.keys(NEW_KEYS), ...Object.keys(WIRED)]) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * ③ 静态腿
 * ------------------------------------------------------------------ */

describe('③ 静态腿：模板六格无中文、InputDevice 退场、载荷与登记处同步', () => {
  const HUD源码 = 读('src/ui/HUD.js');

  it('六格常驻格的出厂文案不再是中文（模板里是空壳，等事件来填）', () => {
    for (const id of ['souls-display', 'discovery-count', 'skill-points-display', 'camera-mode-display', 'boss-name', 'boss-phase']) {
      const m = new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(HUD源码);
      expect(m, `模板里找不到 #${id}`).not.toBeNull();
      expect(m[1], `#${id} 的出厂文案还有中文`).not.toMatch(含汉);
    }
  });

  it('zone 两格挂 data-i18n（换语言由 applyTranslations 接管）', () => {
    expect(HUD源码).toContain('id="zone-name" data-i18n="hud_zone_name_default"');
    expect(HUD源码).toContain('id="zone-subtitle" data-i18n="hud_zone_subtitle_default"');
  });

  it('refreshLabels 里六格重算齐场（静态钉形状：少了哪路，换语言就少一格）', () => {
    const body = /refreshLabels\(\) \{([\s\S]*?)\n {2}\}/.exec(HUD源码)?.[1] ?? '';
    expect(body, 'HUD 里找不到 refreshLabels 的方法体（门禁自己坏了）').not.toBe('');
    for (const call of [
      'this._renderZone();',
      'this._renderSouls();',
      'this._renderSkillPoints();',
      'this._renderCameraMode();',
      'this._renderBoss();',
      'this._renderInputDevice();',
      'this.updateDiscoveryCount();',
    ]) {
      expect(body, `refreshLabels 里少了 ${call}`).toContain(call);
    }
  });

  it('InputDevice.js 字符串字面量里只剩一条开发者向诊断（设备名已进双表）', () => {
    // note() 对表外输入侧抛的那句是开发者诊断，不是玩家可见文案 —— 精确钉死它：
    // 以后再出现任何新的中文字面量（无论流向），这条都会红
    expect(中文字面量(读('src/engine/InputDevice.js')))
      .toEqual(['`未知的输入侧 ""：名单只有 `']);
  });

  it('Boss.js：nameKey 构造期算好、存字段、载荷带键不带字', () => {
    const boss = 读('src/combat/Boss.js');
    expect(boss).toContain('const nameKey = bossNameKeyOf(config.bossId ?? \'shadow-warden\');');
    expect(boss).toContain('this.nameKey = nameKey;');
    expect(boss).toContain('detail: { hp: this.hp, maxHp: this.maxHp, phase: this.phase, nameKey: this.nameKey }');
    expect(boss).not.toContain('phase: this.phase, name: this.name');
  });

  it('事件登记处同步：boss-health 载荷改键，realm-bleed 形状不变、desc 说明键口径', () => {
    const ev = 读('src/engine/events.js');
    expect(ev).toContain("payload: '{ hp, maxHp, phase, nameKey }',");
    expect(ev).not.toContain("payload: '{ hp, maxHp, phase, name }',");
    expect(ev).toContain("payload: '{ zone, key }',");
    expect(ev, 'realm-bleed 的 desc 要说清 zone 是文案键').toContain('zone 是区名的文案键');
    expect(ev.match(/payload: '/g).length, '一条 payload 都没扫到，扫描坏了').toBeGreaterThan(20);
  });
});

/* ------------------------------------------------------------------ *
 * ④ Boss 行为腿
 * ------------------------------------------------------------------ */

describe('④ Boss 行为腿：真生成 Boss，载荷带 nameKey', () => {
  it('shadow-warden：nameKey 指向登记表，boss-health 载荷四个键', () => {
    const m = makeManager();
    const boss = m.spawnBoss({ bossId: 'shadow-warden', x: 0, z: 0, respawn: false });
    expect(boss.nameKey).toBe('boss_name_shadow');
    const seen = [];
    const fn = (e) => seen.push(e.detail);
    window.addEventListener('boss-health', fn);
    boss.takeDamage(300);
    window.removeEventListener('boss-health', fn);
    expect(boss.phase, '300 点伤害不该跨过 50% 二阶段门槛').toBe(1);
    expect(seen).toEqual([{ hp: boss.hp, maxHp: boss.maxHp, phase: 1, nameKey: 'boss_name_shadow' }]);
    expect(seen[0]).not.toHaveProperty('name');
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ HUD 行为腿
 * ------------------------------------------------------------------ */

describe('⑤ HUD 行为腿：中文开机，事件落到每格都是展开句', () => {
  beforeAll(() => {
    globalThis.localStorage = fakeStorage();
    setLanguage('zh');
  });

  afterAll(() => {
    offAll('ui/HUD');
    delete globalThis.document;
    delete globalThis.localStorage;
    setLanguage('zh');
  });

  it('开机默认值：没来过事件的格子按快照默认值落（魂 0 / 技能点 0 / 第三人称）', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const hud = new HUD(bootGame());
    applyTranslations(doc);
    hud.refreshKeyHints();
    expect(doc.getElementById('souls-display').textContent).toBe('魂 0 · Lv.1');
    expect(doc.getElementById('skill-points-display').textContent).toBe('技能点 0');
    expect(doc.getElementById('camera-mode-display').textContent).toBe('第三人称');
    expect(doc.getElementById('discovery-count').textContent).toBe('日志 0 · 碎片 0/8 · 地图 0%');
    expect(doc.getElementById('input-device-display').textContent).toBe('—');
    hud.dispose?.();
  });

  it('事件腿：六格 + 覆盖层都是展开句（zone / Boss / 渗漏 / 计数 / 输入设备）', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const game = bootGame(true);
    const hud = new HUD(game);
    applyTranslations(doc);
    全套事件();
    expect(doc.getElementById('souls-display').textContent).toBe('魂 5 · Lv.2');
    expect(doc.getElementById('discovery-count').textContent).toBe('日志 2 · 碎片 3/8 · 地图 40%');
    expect(doc.getElementById('skill-points-display').textContent).toBe('技能点 3');
    expect(doc.getElementById('camera-mode-display').textContent).toBe('第一人称');
    expect(doc.getElementById('zone-name').textContent).toBe('霍格沃兹遗境');
    expect(doc.getElementById('zone-subtitle').textContent).toBe('位面渗漏 · 霍格沃兹遗境');
    expect(doc.getElementById('boss-name').textContent).toBe('影界守护者');
    expect(doc.getElementById('boss-phase').textContent).toBe('阶段 I');
    expect(doc.getElementById('boss-hp-bar').style.width).toBe('62.5%');
    // 输入设备：current 改口后那一格跟着改（改前是裸中文表）
    game.inputDevice.current = () => 'gamepad';
    hud.updateInputDevice();
    expect(doc.getElementById('input-device-display').textContent).toBe('手柄');
    // 覆盖层可撤：时停顶掉渗漏，时停结束落回区副标题
    window.dispatchEvent(new CustomEvent('time-stop-start'));
    expect(doc.getElementById('zone-subtitle').textContent).toBe('⏳ 时停中 — 蓄力法术可打断');
    window.dispatchEvent(new CustomEvent('time-stop-end'));
    expect(doc.getElementById('zone-subtitle').textContent).toBe('魔法位面 · 哈利波特');
    hud.dispose?.();
  });

  it('横幅腿：非 initial 的 zone-changed 弹横幅，横幅里也是展开句', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const hud = new HUD(bootGame());
    applyTranslations(doc);
    window.dispatchEvent(new CustomEvent('zone-changed', { detail: { zone: MAGIC_ZONE, zoneId: 'magic', initial: false } }));
    expect(doc.getElementById('zone-banner').innerHTML).toContain('霍格沃兹遗境');
    expect(doc.getElementById('zone-banner').innerHTML).toContain('魔法位面 · 哈利波特');
    hud.dispose?.();
  });
});

/* ------------------------------------------------------------------ *
 * ⑥ 换语言腿（核心）
 * ------------------------------------------------------------------ */

describe('⑥ 换语言腿：zh 落全套事件 → 切 en，每格英文且不留中文', () => {
  const 格子 = [
    'zone-name', 'zone-subtitle', 'souls-display', 'discovery-count', 'skill-points-display',
    'camera-mode-display', 'boss-name', 'boss-phase', 'input-device-display',
  ];

  beforeAll(() => {
    globalThis.localStorage = fakeStorage();
    setLanguage('zh');
  });

  afterAll(() => {
    offAll('ui/HUD');
    delete globalThis.document;
    delete globalThis.localStorage;
    setLanguage('zh');
  });

  it('切英文后九格全部改口：区名 / 副标题 / 魂 / 发现 / 技能点 / 镜头 / Boss / 输入设备', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const game = bootGame(true);
    const hud = new HUD(game);
    applyTranslations(doc);
    全套事件();
    game.inputDevice.current = () => 'gamepad';
    hud.updateInputDevice();
    expect(doc.getElementById('souls-display').textContent).toBe('魂 5 · Lv.2');

    // 换语言：SettingsManager.applyToGame 的那三步（setLanguage + applyTranslations + hud 刷新）
    setLanguage('en');
    applyTranslations(doc);
    hud.refreshKeyHints();

    expect(doc.getElementById('zone-name').textContent).toBe('Hogwarts Ruins');
    expect(doc.getElementById('zone-subtitle').textContent).toBe('Planar Bleed · Hogwarts Ruins');
    expect(doc.getElementById('souls-display').textContent).toBe('Souls 5 · Lv.2');
    expect(doc.getElementById('discovery-count').textContent).toBe('Logs 2 · Fragments 3/8 · Map 40%');
    expect(doc.getElementById('skill-points-display').textContent).toBe('Skill Points 3');
    expect(doc.getElementById('camera-mode-display').textContent).toBe('First Person');
    expect(doc.getElementById('boss-name').textContent).toBe('Shadow Warden');
    expect(doc.getElementById('boss-phase').textContent).toBe('Phase I');
    expect(doc.getElementById('input-device-display').textContent).toBe('Gamepad');
    for (const id of 格子) {
      expect(doc.getElementById(id).textContent, `英文界面下 #${id} 夹中文`).not.toMatch(含汉);
      expect(doc.getElementById(id).textContent).not.toContain('[MISSING:');
    }
    hud.dispose?.();
  });

  it('反向控制：载荷改回旧形状（裸 name）再也动不了 Boss 两格', () => {
    setLanguage('zh');
    const doc = bootDoc();
    globalThis.document = doc;
    const hud = new HUD(bootGame());
    applyTranslations(doc);
    window.dispatchEvent(new CustomEvent('boss-start'));
    window.dispatchEvent(new CustomEvent('boss-health', { detail: { hp: 500, maxHp: 800, phase: 1, nameKey: 'boss_name_shadow' } }));
    expect(doc.getElementById('boss-name').textContent).toBe('影界守护者');
    window.dispatchEvent(new CustomEvent('boss-health', { detail: { hp: 400, maxHp: 800, phase: 2, name: '影界守护者' } }));
    expect(doc.getElementById('boss-name').textContent, '旧形状载荷不该改动 Boss 名').toBe('影界守护者');
    expect(doc.getElementById('boss-phase').textContent, '旧形状载荷不该改动阶段').toBe('阶段 I');
    hud.dispose?.();
    setLanguage('zh');
  });
});

/* ------------------------------------------------------------------ *
 * ⑦ 反面证据
 * ------------------------------------------------------------------ */

describe('⑦ 反面证据：label 两侧口径、尺子自证', () => {
  it('inputDeviceLabel：中英两语三个名字，表外侧返回空串', () => {
    setLanguage('zh');
    expect(inputDeviceLabel('keyboard')).toBe('键盘');
    expect(inputDeviceLabel('mouse')).toBe('鼠标');
    expect(inputDeviceLabel('gamepad')).toBe('手柄');
    expect(inputDeviceLabel('touch'), '表外设备不该猜一个名字').toBe('');
    expect(inputDeviceLabel(null)).toBe('');
    setLanguage('en');
    expect(inputDeviceLabel('keyboard')).toBe('Keyboard');
    expect(inputDeviceLabel('mouse')).toBe('Mouse');
    expect(inputDeviceLabel('gamepad')).toBe('Gamepad');
    expect(inputDeviceLabel('vr')).toBe('');
    setLanguage('zh');
  });

  it('尺子自证：喂一段假源码 —— 认字符串、剔注释、剔插值、不认标识符', () => {
    const 假源码 = [
      "const a = '真火咒';",
      '// 行注释里的玄冰刺不算',
      '/* 块注释里的引力坍缩也不算 */',
      'const b = `模板 ${x} 结尾`;',
      'const 标识符中文 = 1;',
    ].join('\n');
    expect(中文字面量(假源码)).toEqual(["'真火咒'", '`模板  结尾`']);
  });
});