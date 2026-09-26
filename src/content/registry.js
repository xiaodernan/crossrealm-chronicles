/**
 * 内容表注册表与声明式校验（W-B1 切片2）。
 *
 * ## 为什么要这一层
 *
 * 修前，`content/` 里的表各自手写一个 `assert*`：`assertArenaScript`、`assertKeybinds`、
 * `assertHotkeys`、`assertKeybindings`、`assertKeyActionLabels`、`assertPadScopesDisjoint`……
 * 十一个，散在五个模块里。它们有两个共同的毛病：
 *
 * 1. **都在第一条错误上抛**。一张表改坏五处，就得改一处跑一次、跑五次。
 * 2. **各写一套词汇**。`'必须是 1~3 的整数'` 这句话在 `assertArenaScript` 里手写了一遍，
 *    下一张表想加同样的检查只能再抄一遍 —— 抄出来的第二份与第一份迟早不一样。
 *
 * 更要紧的是**没有任何一处能回答"全仓有哪些内容表"**。于是"每加一个敌人/任务/装备
 * 都要改代码"（W-B1 存在的理由）在数据层面也无从谈起：你连"该改哪张表"都要先读一遍代码。
 *
 * ## 这一层做什么、不做什么
 *
 * 做三件事：**列清单**（`CONTENT_TABLES`）、**攒错误**（一次报全部，带路径）、
 * **校验交叉引用**（`{ t: 'ref' }` —— 指向一个不存在的 id 是最典型、也最难靠眼睛发现的错）。
 *
 * **不做**通用 schema DSL：字段类型只有这一层真正用到的九个，没有 `oneOf` / 递归 / 条件必填。
 * 真需要时再加，而不是先写一个能表达一切、却没人看得懂的校验器。
 * 校验的**位置**也刻意留在加载期（模块顶层 `assertContent()`），不是构建期插件 ——
 * 这一层要能同时在 `npm test`、`vite build` 与浏览器启动时跑，而只有加载期能做到三处同一份。
 */

import { BOSS_ROSTER, BOSS_IDS, DUNGEON_BOSS_PREFIX } from './bossRoster.js';
import { BOSS_ARENA_SCRIPTS, ARENA_MOVES, ARENA_TRIGGERS } from './arenaScripts.js';
import { ZONE_IDS, ZONE_NAMES } from './ZoneIdentity.js';
import { REST_NPC_DEFS } from './restNpcDefs.js';
import { BOSS_DEFEAT_LINES, BOSS_PHASE_LINES, DUNGEON_BOSS_LINES } from './bossDialogue.js';

/** `id` 字段的形状：小写字母开头，kebab-case。与 POI / 区域 id 同一把尺子 */
export const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/* ------------------------------------------------------------------ *
 * 字段类型
 *
 * **一律返回 `string[]`（可能为空）**，不返回 `string | null`。
 * 第一版混用了两种形状（单条返回字符串、多条返回数组），而调用方按"单条"处理 ——
 * 于是 `rows` 类型吐出的数组被当成**一条消息**整个推进结果里，`flatMap` 之后变成
 * 一堆空数组：`assertContent()` 报"12 处错"却一个字都打不出来。
 * 统一成一种形状之后，调用方只有 `push(...check(...))` 这一种写法，不会再错。
 * ------------------------------------------------------------------ */

const typeName = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '数组';
  return typeof v === 'object' ? '对象' : `${typeof v} ${JSON.stringify(v)}`;
};

const at = (path, field) => (field ? `${path}.${field}` : path);

const TYPES = {
  /** kebab-case 标识符 */
  id: (v, spec, path) => {
    if (typeof v !== 'string') return [`${path}: 期望 id 字符串，实际 ${typeName(v)}`];
    if (!ID_PATTERN.test(v)) return [`${path}: id 必须是 kebab-case（小写字母开头、用 - 分隔），实际 ${JSON.stringify(v)}`];
    return [];
  },
  string: (v, spec, path) => {
    if (typeof v !== 'string') return [`${path}: 期望字符串，实际 ${typeName(v)}`];
    if (v === '') return [`${path}: 不许是空串`];
    return [];
  },
  int: (v, spec, path) => {
    if (!Number.isInteger(v)) return [`${path}: 期望整数，实际 ${typeName(v)}`];
    if (spec.min !== undefined && v < spec.min) return [`${path}: 至少 ${spec.min}，实际 ${v}`];
    if (spec.max !== undefined && v > spec.max) return [`${path}: 至多 ${spec.max}，实际 ${v}`];
    return [];
  },
  number: (v, spec, path) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return [`${path}: 期望有限数字，实际 ${typeName(v)}`];
    if (spec.min !== undefined && v < spec.min) return [`${path}: 不小于 ${spec.min}，实际 ${v}`];
    if (spec.exclusiveMin !== undefined && !(v > spec.exclusiveMin)) {
      return [`${path}: 必须大于 ${spec.exclusiveMin}，实际 ${v}`];
    }
    if (spec.max !== undefined && v > spec.max) return [`${path}: 不大于 ${spec.max}，实际 ${v}`];
    return [];
  },
  bool: (v, spec, path) => (typeof v === 'boolean' ? [] : [`${path}: 期望布尔，实际 ${typeName(v)}`]),
  enum: (v, spec, path) => (spec.of.includes(v)
    ? []
    : [`${path}: ${JSON.stringify(v)} 不在允许值里（可用：${spec.of.join(' / ')}）`]),
  /** 交叉引用：值必须是另一张已注册表里的 id。`ctx.ids` 由第一遍扫描填好 */
  ref: (v, spec, path, ctx) => {
    const known = ctx.ids.get(spec.of);
    if (!known) return [`${path}: 引用了未注册的表 "${spec.of}"（registry 写错了）`];
    if (spec.allowPrefix && typeof v === 'string' && v.startsWith(spec.allowPrefix)) return [];
    if (!known.has(v)) return [`${path}: "${v}" 不在 ${spec.of} 里（可用：${[...known].sort().join(' / ')}）`];
    return [];
  },
  /** 一组行（数组），每行按 `of` 的字段表校验 */
  rows: (v, spec, path, ctx) => {
    if (!Array.isArray(v)) return [`${path}: 期望数组，实际 ${typeName(v)}`];
    const out = [];
    if (spec.minLength !== undefined && v.length < spec.minLength) {
      out.push(`${path}: 至少要 ${spec.minLength} 条，实际 ${v.length}`);
    }
    v.forEach((row, i) => out.push(...checkFields(row, spec.of, `${path}[${i}]`, ctx)));
    return out;
  },
  /** 单行（`index` 形状里"键 → 一个实体"的那种表，如营火 NPC） */
  row: (v, spec, path, ctx) => checkFields(v, spec.of, path, ctx),
  /** 自由形状的对象（如 `resist` 的元素抗性表）：只要求是对象，键值由别处管 */
  record: (v, spec, path) => (v && typeof v === 'object' && !Array.isArray(v)
    ? []
    : [`${path}: 期望对象，实际 ${typeName(v)}`]),
};

/** 一行字段：`spec` 是 `{ 字段名: { t, ... } }`；缺字段只在 `required !== false` 时算错 */
export function checkFields(row, spec, path, ctx) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return [`${path}: 期望对象，实际 ${typeName(row)}`];
  }
  const out = [];
  for (const [field, f] of Object.entries(spec)) {
    const v = row[field];
    if (v === undefined) {
      if (f.required !== false) out.push(`${at(path, field)}: 缺少必填字段`);
      continue;
    }
    const check = TYPES[f.t];
    if (!check) { out.push(`${at(path, field)}: 未知的字段类型 "${f.t}"（registry 写错了）`); continue; }
    out.push(...check(v, f, at(path, field), ctx));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 内容表清单
 * ------------------------------------------------------------------ */

/**
 * 全仓的内容表。
 *
 * `shape`：
 * - `rows`  —— 数组，每行一个实体（`idKey` 默认 `'id'`），行内 id 必须唯一；
 * - `index` —— 对象，键是 id、值是行（或行数组）。`keyRef` 声明"键必须是哪张表的 id"。
 *
 * 加新内容表 = 在这里加一条 + 写好 `row` / `value` 的字段表。**这就是"有哪些内容表"的唯一答案。**
 */
export const CONTENT_TABLES = [
  {
    kind: 'zones',
    note: '区域身份（W-A2）：id ↔ 显示名。真源在 ZoneIdentity.js，本处只做形状与一致性校验',
    shape: 'index',
    table: ZONE_NAMES,
    value: { t: 'string' },
  },
  {
    kind: 'zoneIds',
    note: '区域 id 常量表（ZoneIdentity.js）：`常量名 → id`，值必须是 kebab-case',
    shape: 'index',
    table: ZONE_IDS,
    value: { t: 'id' },
  },
  {
    kind: 'bosses',
    note: 'Boss 名册（W-B1 切片2）：bossId 的唯一真源',
    shape: 'rows',
    table: BOSS_ROSTER,
    row: {
      id: { t: 'id' },
      name: { t: 'string' },
      chapter: { t: 'int', min: 1, max: 5 },
    },
  },
  {
    kind: 'arenaScripts',
    note: '场地招式脚本（W-A6 切片3）：键是 bossId，值是这一场的招式列表',
    shape: 'index',
    table: BOSS_ARENA_SCRIPTS,
    keyRef: { of: 'bosses', allowPrefix: DUNGEON_BOSS_PREFIX },
    // `default` 不是任何 Boss 的 id，是"未登记者的兜底档" —— 显式列出来，
    // 免得下一个人以为它是个 bossId（它确实长得很像）
    keyAllow: ['default'],
    value: {
      t: 'rows',
      minLength: 1,
      of: {
        move: { t: 'enum', of: Object.keys(ARENA_MOVES) },
        phase: { t: 'int', min: 1, max: 3 },
        trigger: { t: 'enum', of: ARENA_TRIGGERS },
        chance: { t: 'number', required: false, exclusiveMin: 0, max: 1 },
        rate: { t: 'number', required: false, exclusiveMin: 0 },
        cooldown: { t: 'number', required: false, exclusiveMin: 0 },
        range: { t: 'number', required: false, exclusiveMin: 0 },
        tint: { t: 'int', required: false, min: 0, max: 0xffffff },
      },
    },
  },
  {
    kind: 'bossDefeatLines',
    note: 'Boss 击破台词（content/bossDialogue.js）：键是 bossId —— 打错一个字母就是"这场 Boss 打赢了却没有收尾台词"',
    shape: 'index',
    table: BOSS_DEFEAT_LINES,
    keyRef: { of: 'bosses' },
    value: {
      t: 'row',
      of: {
        title: { t: 'string' },
        text: { t: 'string' },
      },
    },
  },
  {
    kind: 'bossPhaseLines',
    note: 'Boss 阶段台词（同文件）：键是 bossId，值是"第几阶段 → 台词组"',
    shape: 'index',
    table: BOSS_PHASE_LINES,
    keyRef: { of: 'bosses' },
    // 值是 `{ 2: [...], 3: [...] }`：阶段号是键、不是字段，所以这里只要求是对象；
    // 真要逐阶段校验就得先有一份"每个 Boss 有几个阶段"的表 —— 那归 W-B8，本切片不造
    value: { t: 'record' },
  },
  {
    kind: 'dungeonBossLines',
    note: '副本 Boss 台词：键是**副本 id**（不是 bossId —— 两者由 `getDungeonBossId` 转换）',
    shape: 'index',
    table: DUNGEON_BOSS_LINES,
    // 键是副本 id，而"有哪些副本"今天还没有一张表（归 W-B10 地下城房间套件），
    // 所以这里**刻意不挂 keyRef** —— 挂一张不存在的表只会让门禁自己红。
    // 等副本表落地，这一条加上 `keyRef: { of: 'dungeons' }` 即可。
    value: {
      t: 'row',
      of: {
        intro: { t: 'string' },
        p2: { t: 'string', required: false },
        defeat: { t: 'string' },
      },
    },
  },
  {
    kind: 'restNpcs',
    note: '营火常驻 NPC 定义（W-B1 切片1 从 world/ 搬来）：键是营火 id',
    shape: 'index',
    table: REST_NPC_DEFS,
    value: {
      t: 'row',
      of: {
        name: { t: 'string' },
        title: { t: 'string', required: false },
        body: { t: 'int', min: 0, max: 0xffffff },
        cloak: { t: 'int', min: 0, max: 0xffffff },
      },
    },
  },
];

/* ------------------------------------------------------------------ *
 * 校验入口
 * ------------------------------------------------------------------ */

/** 先扫一遍所有 `rows` 形状的表，把 id 收成 `kind → Set`，供 `ref` 用 */
function collectIds(tables) {
  const ids = new Map();
  for (const t of tables) {
    if (t.shape !== 'rows') continue;
    const key = t.idKey ?? 'id';
    ids.set(t.kind, new Set((Array.isArray(t.table) ? t.table : []).map((r) => r?.[key])));
  }
  return ids;
}

/**
 * 校验一张表，返回**全部**错误（不抛、不早退）。
 * 一次跑完能看到"这张表一共有几处坏"，而不是改一处跑一次。
 */
export function checkTable(entry, ctx) {
  const { kind, shape, table } = entry;
  const out = [];
  if (!table || typeof table !== 'object') return [`${kind}: 表本身不存在或不是对象`];

  if (shape === 'rows') {
    if (!Array.isArray(table)) return [`${kind}: 期望数组，实际 ${typeName(table)}`];
    const key = entry.idKey ?? 'id';
    const seen = new Map();
    table.forEach((row, i) => {
      const path = `${kind}[${i}]`;
      out.push(...checkFields(row, entry.row ?? {}, path, ctx));
      const id = row?.[key];
      if (typeof id === 'string') {
        if (seen.has(id)) out.push(`${path}.${key}: id "${id}" 与 ${kind}[${seen.get(id)}] 重复`);
        else seen.set(id, i);
      }
    });
    return out;
  }

  if (shape === 'index') {
    const allow = new Set(entry.keyAllow ?? []);
    for (const [key, value] of Object.entries(table)) {
      const path = `${kind}["${key}"]`;
      if (!allow.has(key) && entry.keyRef) {
        out.push(...TYPES.ref(key, entry.keyRef, `${kind} 的键 "${key}"`, ctx));
      }
      const spec = entry.value;
      if (!spec) continue;
      const check = TYPES[spec.t];
      if (!check) { out.push(`${path}: 未知的字段类型 "${spec.t}"（registry 写错了）`); continue; }
      out.push(...check(value, spec, path, ctx));
    }
    return out;
  }

  return [`${kind}: 未知的 shape "${shape}"（只支持 rows / index）`];
}

/** 全部错误。`tables` 可注入（用例拿它造坏表） */
export function checkContent(tables = CONTENT_TABLES) {
  const ctx = { ids: collectIds(tables) };
  return tables.flatMap((entry) => checkTable(entry, ctx));
}

/**
 * 加载期入口：有问题就抛，把**全部**错误一次说完。
 * 与 `assertArenaScript` / `assertKeybinds` 同一条纪律 —— 错表要在开打前红，
 * 不要等到"那一场 Boss 不铺场"才发现。
 */
export function assertContent(tables = CONTENT_TABLES) {
  const errors = checkContent(tables);
  if (errors.length) {
    throw new Error(`内容表校验未通过（${errors.length} 处）：\n  - ${errors.join('\n  - ')}`);
  }
  return tables;
}

/** 一行摘要，给 F3 面板与调试用："有哪些内容、各多少条" */
export function contentSummary(tables = CONTENT_TABLES) {
  const out = {};
  for (const t of tables) {
    out[t.kind] = Array.isArray(t.table) ? t.table.length : Object.keys(t.table ?? {}).length;
  }
  return out;
}

/** 所有 Boss 的 id（含副本前缀说明），给提示与调试用 */
export const knownBossIds = () => [...BOSS_IDS];

assertContent();
