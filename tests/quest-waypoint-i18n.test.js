/**
 * 任务指路族双表化（W-D2 切片23）。
 *
 * ## 为什么要有这道门禁
 *
 * `TARGET_WAYPOINTS`（POI 路点）的 9 个 label 是**裸中文**，而消费端
 * `getQuestDirectionText` / `GameGuidePanel` / `QuestAssistant` 早就统一走
 * `t(wp.label)` —— 于是英文玩家（甚至中文玩家）跟着发现类任务走的时候，
 * HUD 上那一行是 `▶ 西 · 202m · [MISSING: 至尊石环]`。同一族里
 * `getProgressText` 的一整排参数字面量（'完成' / '寻找地下城入口（紫环）' /
 * '已装备' / …）也是裸中文：英文玩家读到的是 "Dungeon: 完成"。
 *
 * 腿：
 * 1. 结构腿：`TARGET_WAYPOINTS` 9 格的 label 全是双表键（表从源码里现抠，
 *    不手抄清单 —— 手抄一份就会和源码各自漂）。
 * 2. 钉文案腿：9 格键名 + 13 个新键的中英原值逐字钉死。
 * 3. 行为腿：主线每一行（Boss 行除外，归切片24）切中/切英重放
 *    `getQuestDirectionText` / `getProgressText` / `getAssistantHint`：
 *    不许出现 `[MISSING:`，英文输出不许夹中文。
 * 4. 静态腿：`getProgressText` 与 `_tryAutoAction` 两个函数体里不许有中文串字面量。
 * 5. 新键不孤儿 + 键数腿 + 反向控制。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { MAINLINE, BOSS_STAT_KEYS } from '../src/content/objectives.js';
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
const QuestAssistant源码 = 读('src/ui/QuestAssistant.js');

/** 路点表：POI id → { x, z, label }（label 现在是双表键） */
const 钉路点 = {
  'hub-anchor': 'wp_label_anchor',
  'fantasy-ring': 'wp_label_one_ring',
  'magic-castle': 'demo_step_magic_castle',
  'space-tesseract': 'echo_tesseract_title',
  'void-rift': 'obj_void_rift_title',
  'void-tablet': 'wp_label_void_tablet',
  'chaos-core': 'wp_label_chaos_core',
  wanderer: 'wp_label_wanderer',
  'astronaut-echo': 'wp_label_astronaut_echo',
};

/** 本片新建的 13 个键 → [中, 英] 原值钉死 */
const PIN = {
  quest_state_done: ['完成', 'Done'],
  quest_state_done_already: ['已完成', 'Completed'],
  quest_progress_dungeon_search: ['寻找地下城入口（紫环）', 'Find the dungeon entrance (purple ring)'],
  quest_progress_dungeon_rerun_again: ['再次进入地下城（Chapter 5 后）', 'Enter a dungeon again (after Chapter 5)'],
  quest_progress_gear_equipped: ['已装备', 'Equipped'],
  quest_progress_gear_unequipped: ['装备一件再出发', 'Equip one before setting out'],
  quest_progress_choice_pending: ['做出抉择方能前行', 'Make a choice to move on'],
  quest_progress_npc_search: ['寻找 NPC（绿点）', 'Find the NPC (green dot)'],
  quest_progress_discovery_search_fmt: ['寻找 ${label}', 'Find ${label}'],
  quest_progress_discovery_marker: ['标记点', 'marker'],
  common_target: ['目标', 'Target'],
  qa_toast_arrived_boss_fmt: ['已到达 ${label} — 可点「${autoplay}」跑完全流程', 'Arrived at ${label} — click "${autoplay}" to run the full flow'],
  qa_toast_arrived_fmt: ['已到达 ${label} — ${progress}', 'Arrived at ${label} — ${progress}'],
};
const NEW_KEYS = Object.keys(PIN);

/** 从源码里现抠 TARGET_WAYPOINTS（不手抄清单） */
function 读路点表(源码) {
  const m = 源码.match(/const TARGET_WAYPOINTS = \{([\s\S]*?)\n\};/);
  expect(m, '源码里找不到 TARGET_WAYPOINTS 表').not.toBeNull();
  const 表 = {};
  for (const 行 of m[1].split('\n')) {
    const r = 行.match(/^\s*'?([A-Za-z0-9-]+)'?:\s*\{\s*x:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+),\s*label:\s*'([^']*)'\s*\},?\s*$/);
    if (!r) continue;
    表[r[1]] = { x: Number(r[2]), z: Number(r[3]), label: r[4] };
  }
  return 表;
}

/** 抠一个方法体（从 `  名(` 那行到下一个两空格缩进的右花括号） */
function 取函数体(源码, 名) {
  const 行s = 源码.split('\n');
  const 起 = 行s.findIndex((l) => l.includes(名 + '(') && l.includes('{'));
  expect(起, `找不到 ${名}`).toBeGreaterThan(-1);
  const 体 = [行s[起]];
  for (let i = 起 + 1; i < 行s.length; i++) {
    体.push(行s[i]);
    if (行s[i] === '  }') break;
  }
  return 体.join('\n');
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

const 造任务 = () => new QuestSystem({ toast() {}, show() {} });

describe('任务指路族双表化（W-D2 切片23）', () => {
  it('结构腿：TARGET_WAYPOINTS 9 格的 label 全是双表键', () => {
    const 表 = 读路点表(QuestSystem源码);
    expect(Object.keys(表).sort()).toEqual(Object.keys(钉路点).sort());
    for (const [id, 格] of Object.entries(表)) {
      expect(格.label, `${id} 的 label 不是键`).toBe(钉路点[id]);
      expect(STRINGS_ZH[格.label], `中文表没有 ${格.label}`).toBeTypeOf('string');
      expect(STRINGS_EN[格.label], `英文表没有 ${格.label}`).toBeTypeOf('string');
    }
  });

  it('结构腿反向控制：把一格改回中文必须被点名（防恒绿）', () => {
    const 假源码 = QuestSystem源码.replace(
      "  'hub-anchor': { x: 0, z: 55, label: 'wp_label_anchor' },",
      "  'hub-anchor': { x: 0, z: 55, label: '世界之锚' },",
    );
    const 表 = 读路点表(假源码);
    expect(表['hub-anchor'].label).not.toBe(钉路点['hub-anchor']);
  });

  it('钉文案腿：13 个新键的中英原值逐字钉死', () => {
    for (const [键, [中, 英]] of Object.entries(PIN)) {
      expect(STRINGS_ZH[键], `中文表里没有 ${键}`).toBe(中);
      expect(STRINGS_EN[键], `英文表里没有 ${键}`).toBe(英);
    }
    expect(NEW_KEYS.length, '新键数对不上 —— 切片范围变了？').toBe(13);
  });

  it('行为腿：主线每一行（Boss 行除外）切中/切英都不许出现 [MISSING:]', () => {
    const qs = 造任务();
    const 漏网 = [];
    for (let i = 0; i < MAINLINE.length; i++) {
      const row = MAINLINE[i];
      if (BOSS_STAT_KEYS[row.bossId]) continue; // Boss 行的 waypoint/progress 归切片24
      for (const lang of ['zh', 'en']) {
        setLanguage(lang);
        qs.questIndex = i;
        const 三处 = [
          qs.getQuestDirectionText(0, 0),
          qs.getProgressText(),
          qs.getAssistantHint(),
        ].filter((v) => typeof v === 'string');
        for (const 文本 of 三处) {
          if (文本.includes('[MISSING:')) 漏网.push(`${lang} #${i} ${row.id}: ${文本}`);
          if (lang === 'en' && 含汉.test(文本)) 漏网.push(`英文夹中文 #${i} ${row.id}: ${文本}`);
        }
      }
    }
    expect(漏网, '这些任务行玩家会看到 [MISSING:] 或英文夹中文').toEqual([]);
  });

  it('行为腿：发现类任务的中英指路句逐字钉死（至尊石环那一行）', () => {
    const qs = 造任务();
    const 行 = MAINLINE.findIndex((r) => r.targetId === 'fantasy-ring');
    expect(行, '主线里找不到 fantasy-ring 那一行').toBeGreaterThan(-1);
    setLanguage('zh');
    qs.questIndex = 行;
    expect(qs.getQuestDirectionText(0, 0)).toBe('▶ 西 · 202m · 至尊石环');
    setLanguage('en');
    expect(qs.getQuestDirectionText(0, 0)).toBe('▶ W · 202m · One Ring');
  });

  it('行为腿：进度行参数字面量也进了双表（英文不再是"完成"）', () => {
    const qs = 造任务();
    const 行 = MAINLINE.findIndex((r) => r.type === 'dungeon');
    expect(行, '主线里找不到 dungeon 那一行').toBeGreaterThan(-1);
    setLanguage('en');
    qs.questIndex = 行;
    expect(qs.getProgressText()).toBe('Find the dungeon entrance (purple ring)');
    setLanguage('zh');
    expect(qs.getProgressText()).toBe('寻找地下城入口（紫环）');
  });

  it('静态腿：getProgressText 与 _tryAutoAction 函数体没有中文串字面量', () => {
    expect(扫中文串字面量(取函数体(QuestSystem源码, 'getProgressText')), 'getProgressText 里还有裸中文').toEqual([]);
    expect(扫中文串字面量(取函数体(QuestAssistant源码, '_tryAutoAction')), '_tryAutoAction 里还有裸中文').toEqual([]);
  });

  it('新键不孤儿：13 个新键都在两个源文件里被引用', () => {
    const 没人用 = NEW_KEYS.filter((k) => !QuestSystem源码.includes("'" + k + "'") && !QuestAssistant源码.includes("'" + k + "'"));
    expect(没人用, '这些新键建了却没人引用（死键）').toEqual([]);
  });

  it('键数腿：13 个新键的文案在两表里最多两个键', () => {
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of NEW_KEYS) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('反向控制：不在表里的假键必须被点名（防结构腿恒绿）', () => {
    const 假 = ['quest_state_根本不存在_xyz', 'common_也不存在_abc'];
    const 缺 = 假.filter((k) => STRINGS_ZH[k] === undefined || STRINGS_EN[k] === undefined);
    expect(缺).toEqual(假);
  });
});