/**
 * Boss 名册显示文案双表化（W-D2 切片24）。
 *
 * ## 为什么要有这道门禁
 *
 * `QuestSystem` 里三张 Boss 表（`MAP_BOSS_META` 的简称 / `BOSS_DISPLAY` 的进度与
 * 路点 / `BossApproachDirector` 的靠近播报）整族是裸中文，而它们的读者——
 * HUD 指路句（`t(wp.label)`）、信标 DOM 标签、日志条目标题、再战 toast——
 * 全都假定"拿到的是键"。于是英文玩家看到的是
 * `▶ W · 252m · [MISSING: 影界守护者 Boss 区]`、信标上写着中文、日志标题也是中文。
 * 本片把三张表全改键，并在四个消费点补上 `t()`。
 *
 * 腿：
 * 1. 结构腿：三张表每一格都是双表键（表从源码里现抠，不手抄清单）。
 * 2. 钉文案腿：18 个新键的中英原值逐字钉死。
 * 3. 行为腿：`BossApproachDirector` 靠近信标时，toast 与日志条目收到的是展开句。
 * 4. 静态腿：三个消费文件不许再出现中文串字面量。
 * 5. 接线腿：信标标签那一行必须把 name 交给 t()。
 * 6. 新键不孤儿 + 键数腿 + 反向控制。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MAP_BOSSES, BOSS_DISPLAY } from '../src/game/QuestSystem.js';
import { BossApproachDirector } from '../src/world/BossApproachDirector.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { setLanguage } from '../src/engine/i18n.js';

const handlers = new Map();
globalThis.window = {
  addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); },
  dispatchEvent(event) { handlers.get(event.type)?.forEach((fn) => fn(event)); return true; },
};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

const 读 = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const QuestSystem源码 = 读('src/game/QuestSystem.js');
const Approach源码 = 读('src/world/BossApproachDirector.js');
const Beacons源码 = 读('src/world/BossBeacons.js');
const Rematch源码 = 读('src/world/BossRematchDirector.js');

/** 本片新建的 20 个键 → [中, 英] 原值钉死 */
const PIN = {
  map_boss_label_shadow: ['影界', 'Shadowrealm'],
  map_boss_label_mage: ['奥术', 'Arcane'],
  map_boss_label_singularity: ['奇点', 'Singularity'],
  boss_waypoint_shadow: ['影界守护者 Boss 区', 'Shadowrealm Warden — Boss area'],
  boss_waypoint_mage: ['大奥术师 Boss 区', 'Grand Arcanist — Boss area'],
  boss_waypoint_singularity: ['奇点领主 Boss 区', 'Singularity Herald — Boss area'],
  boss_waypoint_void: ['时线执政官 Boss 区', 'Chronarch — Boss area'],
  boss_waypoint_chaos: ['混沌领主 Boss 区', 'Chaos Overlord — Boss area'],
  boss_progress_shadow: ['进入灰白森林 Boss 红圈 (X≈-250 Z≈-35)', 'Enter the red circle in Greywhite Forest (X≈-250 Z≈-35)'],
  boss_progress_mage: ['魔法 Boss 红圈 (X≈5 Z≈-220)', 'Magic Boss red circle (X≈5 Z≈-220)'],
  boss_progress_singularity: ['星际 Boss 红圈 (X≈235 Z≈155)', 'Star-field Boss red circle (X≈235 Z≈155)'],
  boss_progress_void: ['时线 Boss 红圈 (Z≈235 · Ch4+)', 'Timeline Boss red circle (Z≈235 · Ch4+)'],
  boss_progress_chaos: ['混沌 Boss 红圈 (X≈-200 Z≈285 · Ch5+)', 'Chaos Boss red circle (X≈-200 Z≈285 · Ch5+)'],
  boss_approach_shadow: ['影界守护者 — 灰林东侧。两阶段，红圈砸地前翻滚。', 'Shadowrealm Warden — east of the Greywhite Forest. Two phases; roll before the red circle slams down.'],
  boss_approach_mage: ['大奥术师萨尔林 — 霍格沃兹遗境北侧。紫球追踪，弹反可打断。', 'Grand Arcanist Salrin — north of the Hogwarts Ruins. The purple orbs track you; a parry can interrupt them.'],
  boss_approach_singularity: ['奇点领主 — 米勒荒原。引力圈时向外滚。', "Singularity Herald — Miller's Wastes. Roll outward when the gravity ring pulls."],
  boss_approach_void: ['时线执政官 — 隐藏试炼。蓄力法术打断时停。', 'Chronarch — hidden trial. Interrupt the time stop with a charged spell.'],
  boss_approach_chaos: ['混沌裂隙领主 — 终焉 Boss。闪电风暴，贴身穿刺。', 'Chaos Rift Overlord — the final Boss. Lightning storm; stay close for the thrust.'],
};
const NEW_KEYS = Object.keys(PIN);

/** 从源码里现抠一张表：`const 表名 = { ... };` → id → 字段 */
function 读表(源码, 表名, 行式) {
  const m = 源码.match(new RegExp('const ' + 表名 + ' = \\{([\\s\\S]*?)\\n\\};'));
  expect(m, `源码里找不到 ${表名} 表`).not.toBeNull();
  const 表 = {};
  for (const 行 of m[1].split('\n')) {
    const r = 行.match(行式);
    if (!r) continue;
    表[r[1]] = r.slice(2);
  }
  return 表;
}

const 含汉 = /[\u4e00-\u9fff]/;
const 串字面量 = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
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


/** bossId → BOSS_APPROACH_INTEL 的键后缀（表里就是这一把键） */
const 简称后缀 = (bossId) => ({
  'shadow-warden': 'shadow',
  archmagus: 'mage',
  'singularity-herald': 'singularity',
  'void-chronarch': 'void',
  'chaos-overlord': 'chaos',
}[bossId]);

describe('Boss 名册显示文案双表化（W-D2 切片24）', () => {
  it('结构腿：三张表每一格都是双表键', () => {
    const 简称 = 读表(QuestSystem源码, 'MAP_BOSS_META',
      /^\s*'?([a-z-]+)'?:\s*\{\s*label:\s*'([^']*)',\s*short:\s*'([^']*)',\s*color:\s*'([^']*)'\s*\},?\s*$/);
    const 显示 = 读表(QuestSystem源码, 'BOSS_DISPLAY',
      /^\s*'?([a-z-]+)'?:\s*\{\s*progress:\s*'([^']*)',\s*waypoint:\s*'([^']*)'\s*\},?\s*$/);
    const 播报 = 读表(Approach源码, 'BOSS_APPROACH_INTEL', /^\s*'?([a-z-]+)'?:\s*'([^']*)',?\s*$/);
    expect(Object.keys(简称).length, 'MAP_BOSS_META 行数').toBe(5);
    expect(Object.keys(显示).length, 'BOSS_DISPLAY 行数').toBe(5);
    expect(Object.keys(播报).length, 'BOSS_APPROACH_INTEL 行数').toBe(5);
    for (const [id, [label]] of Object.entries(简称)) {
      expect(STRINGS_ZH[label], `MAP_BOSS_META ${id} 的 label 不是键`).toBeTypeOf('string');
      expect(STRINGS_EN[label], `MAP_BOSS_META ${id} 的 label 英文表没有`).toBeTypeOf('string');
    }
    for (const [id, [progress, waypoint]] of Object.entries(显示)) {
      for (const 键 of [progress, waypoint]) {
        expect(STRINGS_ZH[键], `BOSS_DISPLAY ${id} 的 ${键} 不是键`).toBeTypeOf('string');
        expect(STRINGS_EN[键], `BOSS_DISPLAY ${id} 的 ${键} 英文表没有`).toBeTypeOf('string');
      }
    }
    for (const [id, [键]] of Object.entries(播报)) {
      expect(STRINGS_ZH[键], `BOSS_APPROACH_INTEL ${id} 不是键`).toBeTypeOf('string');
      expect(STRINGS_EN[键], `BOSS_APPROACH_INTEL ${id} 英文表没有`).toBeTypeOf('string');
    }
    // 名册与导出的 MAP_BOSSES 对得上（顺序 / 简称 / 配色都不许漂）
    for (const b of MAP_BOSSES) {
      expect(b.label).toBe(简称[b.bossId][0]);
      expect(b.short).toBe(简称[b.bossId][1]);
      expect(b.color).toBe(简称[b.bossId][2]);
      expect(BOSS_DISPLAY[b.bossId].waypoint).toBe(显示[b.bossId][1]);
    }
  });

  it('结构腿反向控制：把一格改回中文必须被点名（防恒绿）', () => {
    const 假 = QuestSystem源码.replace(
      "'shadow-warden': { label: 'map_boss_label_shadow', short: 'B1', color: '#ff5555' },",
      "'shadow-warden': { label: '影界', short: 'B1', color: '#ff5555' },",
    );
    const 简称 = 读表(假, 'MAP_BOSS_META',
      /^\s*'?([a-z-]+)'?:\s*\{\s*label:\s*'([^']*)',\s*short:\s*'([^']*)',\s*color:\s*'([^']*)'\s*\},?\s*$/);
    expect(STRINGS_ZH[简称['shadow-warden'][0]], '改回中文的那格必须是双表里没有的值').toBeUndefined();
  });

  it('钉文案腿：20 个新键的中英原值逐字钉死', () => {
    for (const [键, [中, 英]] of Object.entries(PIN)) {
      expect(STRINGS_ZH[键], `中文表里没有 ${键}`).toBe(中);
      expect(STRINGS_EN[键], `英文表里没有 ${键}`).toBe(英);
    }
    expect(NEW_KEYS.length, '新键数对不上 —— 切片范围变了？').toBe(18);
  });

  it('行为腿：MAP_BOSSES 每一格的 label 切中切英都出展开句', () => {
    for (const b of MAP_BOSSES) {
      for (const lang of ['zh', 'en']) {
        setLanguage(lang);
        const 展开 = (lang === 'zh' ? STRINGS_ZH : STRINGS_EN)[b.label];
        expect(展开, `${b.bossId}(${lang}) 的 label 展开不了`).toBeTypeOf('string');
        expect(展开).not.toContain('[MISSING:');
      }
    }
  });

  it('行为腿：靠近信标时 toast 与日志条目收到的都是展开句', () => {
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      const toasts = [];
      const 日志 = [];
      const game = {
        dialog: { open: false, toast: (s) => toasts.push(s) },
        storyJournal: { add: (e) => 日志.push(e) },
        quests: { chapter: 1 },
      };
      const dir = new BossApproachDirector(game);
      const b = MAP_BOSSES[0];
      dir.update(0, { x: b.x, z: b.z });
      const 表 = lang === 'zh' ? STRINGS_ZH : STRINGS_EN;
      expect(toasts[0], `${lang} toast`).toBe('⚠ ' + 表['boss_approach_' + 简称后缀(b.bossId)]);
      expect(日志[0].title, `${lang} 日志标题`).toBe(表[b.label]);
      expect(日志[0].text, `${lang} 日志正文`).toBe(表['boss_approach_' + 简称后缀(b.bossId)]);
      expect(日志[0].text).not.toContain('[MISSING:');
    }
  });

  it('静态腿：四个文件不许再出现中文串字面量（信标 / 播报 / 再战 / 表）', () => {
    expect(扫中文串字面量(Approach源码), 'BossApproachDirector 里还有裸中文').toEqual([]);
    expect(扫中文串字面量(Beacons源码), 'BossBeacons 里还有裸中文').toEqual([]);
    expect(扫中文串字面量(Rematch源码), 'BossRematchDirector 里还有裸中文').toEqual([]);
    const 三表 = QuestSystem源码.split('export class QuestSystem')[0];
    expect(扫中文串字面量(三表), 'QuestSystem 表头区还有裸中文（console.warn 的迁移提示除外）').toEqual([]);
  });

  it('接线腿：信标标签那一行必须把 name 交给 t()（附反向控制）', () => {
    const 取标签行 = (源码) => 源码.split('\n').find((l) => l.includes('labelDiv.innerHTML')) ?? '';
    expect(取标签行(Beacons源码), '信标标签那一行没走 t() —— 英文玩家看中文信标').toContain('${t(name)}');
    const 旧写法 = 'labelDiv.innerHTML = `<strong>\u{1F480} ${short}</strong><span>${name}</span>`;';
    expect(取标签行(旧写法).includes('${t(name)}'), '人造的旧写法必须被点名').toBe(false);
  });

  it('新键不孤儿：20 个新键都在两个源文件里被引用', () => {
    const 没人用 = NEW_KEYS.filter((k) => !QuestSystem源码.includes("'" + k + "'") && !Approach源码.includes("'" + k + "'"));
    expect(没人用, '这些新键建了却没人引用（死键）').toEqual([]);
  });

  it('键数腿：20 个新键的文案在两表里最多两个键', () => {
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of NEW_KEYS) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('反向控制：不在表里的假键必须被点名（防结构腿恒绿）', () => {
    const 假 = ['boss_progress_根本不存在_xyz', 'map_boss_label_也不存在_abc'];
    const 缺 = 假.filter((k) => STRINGS_ZH[k] === undefined || STRINGS_EN[k] === undefined);
    expect(缺).toEqual(假);
  });
});