/**
 * 锁定条上的战斗情报（W-G1 切片1）。
 *
 * ## 这一片解决什么
 *
 * W-F1 的图鉴是**只读档案**：能查到"幽暗怨影怕火"，但那是翻书翻出来的，
 * 与正在打的这一只无关。于是图鉴进度没有玩法回报 —— 研究满一整页，战斗里一点感觉都没有。
 *
 * 这一片把线接上：**锁定一只敌人时，名字下面直接写它的弱点与抗性**，
 * 但只有研究过（≥ `BESTIARY_TIERS` 的 `studied` 档）的那一类才给。
 *
 * ## 用例分六层
 * ① 门槛腿：门槛用档位下标表达，不另抄一个数 —— 改档位阈值，这里自动跟着走；
 * ② 纯函数腿：`lockIntelOf` 的四种输入（无记录 / 未研究 / 已研究 / 无相性）；
 * ③ HUD 接线腿（中文）：真 `BestiarySystem` + 真 `ENEMY_RESIST`，四句话逐字钉死；
 * ④ 缓存腿：同一只逐帧调用不重建节点（逐帧 `textContent=` 会让浏览器白重排）；
 * ⑤ 换语言腿：`refreshKeyHints()` 之后三句全改口，不留中文；
 * ⑥ 结构腿：模板两行、CSS 三档色、HUD 不再往 `#lock-target` 上写整句。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HUD } from '../src/ui/HUD.js';
import { lockIntelOf, INTEL_TIER_INDEX, INTEL_KILLS } from '../src/ui/lockIntel.js';
import { BESTIARY_TIERS } from '../src/content/bestiary.js';
import { BestiarySystem } from '../src/game/BestiarySystem.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { 键数问题 } from './helpers/i18nKeyCount.js';
import { setLanguage, applyTranslations } from '../src/engine/i18n.js';
import { makeMarkupDom, node } from './helpers/fakeMarkupDom.js';
import { offAll } from '../src/engine/EventBus.js';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');
const 含汉 = /[\u4e00-\u9fff]/;

/** 本片三枚新键：键 → [中文原值, 英文原值] */
const NEW_KEYS = {
  bestiary_intel_weak_fmt: ['怕${elem} ${pct}%', 'weak ${elem} ${pct}%'],
  bestiary_intel_resist_fmt: ['抗${elem} ${pct}%', 'resists ${elem} ${pct}%'],
  bestiary_intel_locked_fmt: ['属性未知 · 熟悉需 ${n} 次', 'traits unknown · study ${n} kills'],
};

/* ------------------------------------------------------------------ *
 * ① 门槛腿
 * ------------------------------------------------------------------ */

describe('① 门槛腿：门槛是档位下标，不是抄来的数', () => {
  it('INTEL_TIER_INDEX 指的确实是 studied（钉语义，不只钉数字）', () => {
    expect(BESTIARY_TIERS[INTEL_TIER_INDEX].id).toBe('studied');
  });

  it('INTEL_KILLS 是档位表里的取值（改阈值这里自动跟着走）', () => {
    expect(INTEL_KILLS).toBe(BESTIARY_TIERS[INTEL_TIER_INDEX].kills);
    expect(INTEL_KILLS).toBe(5);
  });

  it('lockIntel.js 里没有第二个 5：门槛只从表里取', () => {
    const src = 读('src/ui/lockIntel.js');
    expect(src).toContain('BESTIARY_TIERS[INTEL_TIER_INDEX].kills');
    expect(src, '门槛被写死成字面量了').not.toMatch(/tierIndex\s*<\s*\d/);
  });
});

/* ------------------------------------------------------------------ *
 * ② 纯函数腿
 * ------------------------------------------------------------------ */

describe('② lockIntelOf：四种输入', () => {
  it('没有记录（不是名册里的类型）→ 未知，且不抛', () => {
    expect(lockIntelOf(null)).toEqual({ known: false, weak: null, resist: null });
    expect(lockIntelOf(undefined)).toEqual({ known: false, weak: null, resist: null });
  });

  it('见过但没研究（tierIndex 0）→ 未知', () => {
    const entry = { type: 'wraith', tierIndex: 0, affinity: { weak: null, resist: null } };
    expect(lockIntelOf(entry).known).toBe(false);
  });

  it('tierIndex 是 -1（零击杀，档位表里查不到）→ 未知', () => {
    const entry = { type: 'wraith', tierIndex: -1 };
    expect(lockIntelOf(entry).known).toBe(false);
  });

  it('研究过 → 两段情报，pct 是正整数（符号已在字段名里）', () => {
    const entry = {
      type: 'wraith',
      tierIndex: 1,
      affinity: {
        weak: { id: 'fire', label: 'bestiary_elem_fire', value: -0.15 },
        resist: { id: 'gravity', label: 'bestiary_elem_gravity', value: 0.2 },
      },
    };
    expect(lockIntelOf(entry)).toEqual({
      known: true,
      weak: { id: 'fire', label: 'bestiary_elem_fire', pct: 15 },
      resist: { id: 'gravity', label: 'bestiary_elem_gravity', pct: 20 },
    });
  });

  it('研究过但没有相性 → known 真、两段都是 null（由 UI 决定说"无偏向"）', () => {
    const entry = { type: 'x', tierIndex: 1, affinity: { weak: null, resist: null } };
    expect(lockIntelOf(entry)).toEqual({ known: true, weak: null, resist: null });
  });

  it('记录里没有 affinity 时回落到 bestiaryAffinity（不查第二张表）', () => {
    const intel = lockIntelOf({ type: 'golem', tierIndex: 1 });
    expect(intel.known).toBe(true);
    expect(intel.weak, 'golem 两系都是正的，没有弱点').toBeNull();
    expect(intel.resist.id, '取的是绝对值最大的那一系').toBe('ice');
    expect(intel.resist.pct).toBe(35);
  });
});

/* ------------------------------------------------------------------ *
 * ③④⑤ HUD 行为腿
 * ------------------------------------------------------------------ */

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

/** 与生产同序的最小 game；`kills` 喂真 BestiarySystem，`bestiary` 可换成桩 */
function bootGame({ kills = {}, bestiary = null } = {}) {
  return {
    inputDevice: { current: () => null },
    dialog: { toast: () => {} },
    player: { position: { x: 0, z: 0 }, yaw: 0, combat: { lockTarget: null } },
    quests: {
      notifyUpdate: () => {},
      getQuestWaypoint: () => null,
      getQuestDirectionText: () => '',
      getAssistantHint: () => '',
    },
    trial: { getState: () => ({ state: 'idle' }) },
    bestiary: bestiary ?? new BestiarySystem({ stats: { kills } }),
  };
}

/** 关掉小地图绘制：这一片量的是锁定条，2D 上下文不该进来掺一脚 */
function 新建HUD(game) {
  const hud = new HUD(game);
  hud.minimapVisible = false;
  return hud;
}

/** 一只被锁定的敌人：`lockTarget` 只需要 name / type / alive / posture 四个读数 */
const 锁定 = (type, name = '目标') => ({
  type, name, alive: true, posture: 30, maxPosture: 60,
});

describe('③ HUD 接线腿（中文）：真图鉴 + 真抗性表', () => {
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

  it('没锁定时两行都不露', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const game = bootGame({ kills: { wraith: 9 } });
    const hud = 新建HUD(game);
    applyTranslations(doc);
    hud.update(0.016);
    expect(doc.getElementById('lock-target').classList.contains('hidden')).toBe(true);
    expect(doc.getElementById('lock-intel').classList.contains('hidden')).toBe(true);
    expect(doc.getElementById('lock-intel').textContent).toBe('');
    hud.dispose?.();
  });

  it('研究过（9 杀）：名字 + 弱点 + 抗性三句齐落', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const game = bootGame({ kills: { wraith: 9 } });
    const hud = 新建HUD(game);
    applyTranslations(doc);
    game.player.combat.lockTarget = 锁定('wraith', '时线怨影');
    hud.update(0.016);
    const intel = doc.getElementById('lock-intel');
    expect(doc.getElementById('lock-target').classList.contains('hidden')).toBe(false);
    expect(doc.getElementById('lock-name').textContent).toBe('🔒 时线怨影');
    expect(intel.classList.contains('hidden')).toBe(false);
    expect(intel.children.map((c) => c.textContent)).toEqual(['怕火 15%', '抗引力 20%']);
    expect(intel.children.map((c) => c.className)).toEqual(['lock-intel-chip is-weak', 'lock-intel-chip is-resist']);
    hud.dispose?.();
  });

  it('只见过没研究（4 杀）：一句话，不剧透任何一系', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const game = bootGame({ kills: { wraith: 4 } });
    const hud = 新建HUD(game);
    applyTranslations(doc);
    game.player.combat.lockTarget = 锁定('wraith', '时线怨影');
    hud.update(0.016);
    const intel = doc.getElementById('lock-intel');
    expect(intel.children.map((c) => c.textContent)).toEqual(['属性未知 · 熟悉需 5 次']);
    expect(intel.textContent).not.toContain('火');
    hud.dispose?.();
  });

  it('没杀过（0 杀）：同样走"未解锁"那句，不是空白', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const game = bootGame({ kills: {} });
    const hud = 新建HUD(game);
    applyTranslations(doc);
    game.player.combat.lockTarget = 锁定('wraith', '时线怨影');
    hud.update(0.016);
    expect(doc.getElementById('lock-intel').textContent).toBe('属性未知 · 熟悉需 5 次');
    hud.dispose?.();
  });

  it('研究过但这一系没有偏向：说"无属性偏向"而不是留空', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const 桩 = {
      entryOf: () => ({ type: 'flat', tierIndex: 2, affinity: { weak: null, resist: null } }),
    };
    const game = bootGame({ bestiary: 桩 });
    const hud = 新建HUD(game);
    applyTranslations(doc);
    game.player.combat.lockTarget = 锁定('flat', '无向者');
    hud.update(0.016);
    const intel = doc.getElementById('lock-intel');
    expect(intel.children.map((c) => c.textContent)).toEqual(['无属性偏向']);
    expect(intel.children[0].className).toBe('lock-intel-chip is-flat');
    hud.dispose?.();
  });

  it('不是名册里的类型（Boss 的 type 是 boss）：情报行整行不露，名字照常', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const game = bootGame({ kills: {} });
    const hud = 新建HUD(game);
    applyTranslations(doc);
    game.player.combat.lockTarget = 锁定('no_such_type', '影界守护者');
    hud.update(0.016);
    expect(doc.getElementById('lock-name').textContent).toBe('🔒 影界守护者');
    expect(doc.getElementById('lock-intel').classList.contains('hidden')).toBe(true);
    hud.dispose?.();
  });

  it('放开锁定后擦干净：上一只的弱点不许留在屏幕上', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const game = bootGame({ kills: { wraith: 9 } });
    const hud = 新建HUD(game);
    applyTranslations(doc);
    game.player.combat.lockTarget = 锁定('wraith', '时线怨影');
    hud.update(0.016);
    expect(doc.getElementById('lock-intel').textContent).toBe('怕火 15%抗引力 20%');
    game.player.combat.lockTarget = null;
    hud.update(0.016);
    expect(doc.getElementById('lock-name').textContent).toBe('');
    expect(doc.getElementById('lock-intel').textContent).toBe('');
    expect(doc.getElementById('lock-intel').classList.contains('hidden')).toBe(true);
    hud.dispose?.();
  });
});

/* ------------------------------------------------------------------ *
 * ④ 缓存腿
 * ------------------------------------------------------------------ */

describe('④ 缓存腿：同一只逐帧调用不重建节点', () => {
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

  it('连跑 30 帧，情报格还是同一个节点（签名没变就直接返回）', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const game = bootGame({ kills: { wraith: 9 } });
    const hud = 新建HUD(game);
    applyTranslations(doc);
    game.player.combat.lockTarget = 锁定('wraith', '时线怨影');
    hud.update(0.016);
    const 首帧 = doc.getElementById('lock-intel').children[0];
    for (let i = 0; i < 29; i += 1) hud.update(0.016);
    expect(doc.getElementById('lock-intel').children[0]).toBe(首帧);
    hud.dispose?.();
  });

  it('换一只（哪怕同类）会重画：名字变了，签名就变了', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const game = bootGame({ kills: { wraith: 9 } });
    const hud = 新建HUD(game);
    applyTranslations(doc);
    game.player.combat.lockTarget = 锁定('wraith', '时线怨影');
    hud.update(0.016);
    const 首帧 = doc.getElementById('lock-intel').children[0];
    game.player.combat.lockTarget = 锁定('wraith', '另一只怨影');
    hud.update(0.016);
    expect(doc.getElementById('lock-name').textContent).toBe('🔒 另一只怨影');
    expect(doc.getElementById('lock-intel').children[0]).not.toBe(首帧);
    hud.dispose?.();
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ 换语言腿
 * ------------------------------------------------------------------ */

describe('⑤ 换语言腿：refreshKeyHints 之后三句全改口', () => {
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

  it('已解锁那一格：怕火 15% / 抗引力 20% → weak fire 15% / resists gravity 20%', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const game = bootGame({ kills: { wraith: 9 } });
    const hud = 新建HUD(game);
    applyTranslations(doc);
    game.player.combat.lockTarget = 锁定('wraith', '时线怨影');
    hud.update(0.016);
    expect(doc.getElementById('lock-intel').textContent).toBe('怕火 15%抗引力 20%');

    setLanguage('en');
    applyTranslations(doc);
    hud.refreshKeyHints();

    expect(doc.getElementById('lock-intel').children.map((c) => c.textContent))
      .toEqual(['weak fire 15%', 'resists gravity 20%']);
    expect(doc.getElementById('lock-intel').textContent).not.toMatch(含汉);
    hud.dispose?.();
    setLanguage('zh');
  });

  it('未解锁那一格也说英文（元素名与门槛数字都现展开）', () => {
    const doc = bootDoc();
    globalThis.document = doc;
    const game = bootGame({ kills: { wraith: 2 } });
    const hud = 新建HUD(game);
    applyTranslations(doc);
    game.player.combat.lockTarget = 锁定('wraith', '时线怨影');
    hud.update(0.016);
    expect(doc.getElementById('lock-intel').textContent).toBe('属性未知 · 熟悉需 5 次');

    setLanguage('en');
    applyTranslations(doc);
    hud.refreshKeyHints();

    expect(doc.getElementById('lock-intel').textContent).toBe('traits unknown · study 5 kills');
    hud.dispose?.();
    setLanguage('zh');
  });
});

/* ------------------------------------------------------------------ *
 * ⑥ 文案登记 + 结构腿
 * ------------------------------------------------------------------ */

describe('⑥ 文案登记：三枚新键两表对齐', () => {
  it('三个新键的中英原值逐字钉死', () => {
    for (const [key, [zh, en]] of Object.entries(NEW_KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('三枚新键都带同一组占位符（中英不许一边多一个）', () => {
    const 占位 = (s) => [...s.matchAll(/\$\{(\w+)(?:\|[^}]*)?\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(NEW_KEYS)) {
      expect(占位(STRINGS_EN[key]), `${key} 中英占位符不一致`).toEqual(占位(STRINGS_ZH[key]));
    }
  });

  it('键数 2840：两表相等且等于登记值', () => {
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
    expect(键数问题(ZH_KEYS, EN_KEYS), '键数与登记值不符').toEqual([]);
  });

  it('三枚新键都不孤儿：两处引用（lockIntel 的注释不算，得在 HUD 里真的用到）', () => {
    const hud = 读('src/ui/HUD.js');
    for (const key of ['bestiary_intel_locked_fmt', 'bestiary_intel_weak_fmt', 'bestiary_intel_resist_fmt']) {
      expect(hud, `${key} 建了却没人引用（死键）`).toContain(key);
    }
  });
});

describe('⑦ 结构腿：模板两行、CSS 三档色、不再整句写盒子', () => {
  const hud源码 = 读('src/ui/HUD.js');
  const css = 读('src/style.css');

  it('模板里 `#lock-target` 拆成名字 + 情报两行', () => {
    expect(hud源码).toContain('id="lock-name"');
    expect(hud源码).toContain('id="lock-intel"');
  });

  it('不再往 `#lock-target` 上写整句（旧写法会把两行一起抹掉）', () => {
    expect(hud源码).not.toContain('lockEl.textContent =');
  });

  it('CSS 三档色 + 未解锁一档都在场（颜色只是加速辨认，正文自带"怕/抗"）', () => {
    for (const cls of ['.lock-intel-chip.is-weak', '.lock-intel-chip.is-resist', '.lock-intel-chip.is-flat', '.lock-intel-chip.is-locked']) {
      expect(css, `样式里少了 ${cls}`).toContain(cls);
    }
    expect(css).toContain('.lock-intel.hidden');
  });

  it('情报行是 flex 竖排：盒子按行数自己长，不写死高度', () => {
    const body = /\.lock-target \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(body, 'CSS 里找不到 .lock-target 的规则（门禁自己坏了）').not.toBe('');
    expect(body).toContain('flex-direction: column');
    expect(body).not.toContain('height:');
  });
});
