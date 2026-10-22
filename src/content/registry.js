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
import { BOSS_PHASE_TUNING } from './bossPhases.js';
import { ZONE_IDS, ZONE_NAMES, ZONE_ORDER } from './ZoneIdentity.js';
import { ZONE_AMBIENCE, AMBIENCE_KINDS, AMBIENCE_MAX_GAIN } from './zoneAmbience.js';
import { WISP_SPOTS } from './wispSpots.js';
import { checkZoneFactProducers } from './zoneFacts.js';
import { REST_NPC_DEFS } from './restNpcDefs.js';
import { BOSS_DEFEAT_LINES, BOSS_PHASE_LINES, DUNGEON_BOSS_LINES } from './bossDialogue.js';
import { ECHOES } from './echoes.js';
import { ZONE_EVENTS_POP, LORE_FRAGMENTS_POP, NPC_LINES_POP } from './ambientLore.js';
import { REST_DIALOGUES } from './restDialogues.js';
import { REST_POINT_NAMES } from './restPointNames.js';
import {
  REST_DIALOGUE_CG, REST_DIALOGUE_CG_BASE, REST_DIALOGUE_CG_EXTRA, REST_DIALOGUE_CG_POP,
} from './dialogueCgPresets.js';
import { ACHIEVEMENTS_EXTRA, ACHIEVEMENTS_POP_CULTURE } from './achievements.js';
import { CG_GALLERY_BONUS_EXTRA } from './cgGallery.js';
import { SIDE_QUESTS_BASE, SIDE_QUESTS_ZONE, SIDE_QUESTS_POP } from './sideQuests.js';
import { HELP_SECTIONS_EXTRA } from './helpManual.js';
import { SKILL_TREES, SKILL_BRANCH_IDS, SKILL_EFFECT_KEYS } from './skillTrees.js';
import { FRANCHISE } from './franchises.js';
import { OBJECTIVES, OBJECTIVE_TYPES } from './objectives.js';
import { checkQuestFactClosure } from './questFacts.js';
import { ENEMY_ROSTER } from './enemies.js';
import { ENEMY_SPAWNS } from './enemySpawns.js';
// 章节判据要读**展开后**的 announce（`announce` 存的是键，W-D2 切片16j）——
// 中文表就在**同层**（`content/strings.zh.js`），不构成"向上够 engine"。
// 读中文表够用：判的是"喊的是不是第 N 章"，而 `Chapter N` 这句写法两种语言一致。
import { STRINGS_ZH } from './strings.zh.js';
import { SURFACE_SPECS, SURFACE_PATTERNS } from './materialSurfaces.js';
import { DIFFICULTY_TIERS, checkDifficultyTable } from './difficulty.js';
import { ENEMY_GROWTH, GROWTH_MAX_STAGE, checkEnemyGrowth } from './enemyGrowth.js';
import { DUNGEON_DEFS, DUNGEON_IDS } from './dungeons.js';
import { DUNGEON_ENCOUNTERS } from './dungeonEncounters.js';
import { ENEMY_MOVE_SETS, BODY_PLANS } from './tuning.js';
import {
  GEAR_SLOTS, GEAR_STATS, GEAR_RARITY, GEAR_BASES, GEAR_AFFIXES, GEAR_SLOT_NAMES,
  GEAR_DROP, GEAR_NAMES, GEAR_RARITY_DISPLAY, GEAR_POOLS, GEAR_POOL_DEFAULT, GEAR_BAG,
  GEAR_BOSS_DROPS, rarityRank,
} from './gear.js';

/**
 * gearSlotNames 双向一致性（W-B5 切片4）。
 * 必须在 CONTENT_TABLES 之前定义，因为 invariant 在数组字面量求值时就会被引用。
 */
export function checkGearSlotNames(table) {
  const out = [];
  const known = new Set(GEAR_SLOTS);
  for (const id of Object.keys(table ?? {})) {
    if (!known.has(id)) out.push(`gearSlotNames: "${id}" 不是任何槽位 id（没有这一格会永远不出现）`);
  }
  for (const id of known) {
    if (!table?.[id]) out.push(`gearSlotNames: 缺 "${id}" 的中文名（界面上那一行会是空的）`);
  }
  return out;
}

/**
 * 技能树的整表规则（W-B6 切片1）。
 *
 * 声明式词汇表能说"这一格是 id、是正整数"，说不了"这棵树连不连得起来"：
 * `reqs` 是**跨行引用**（指向同一棵树里的其它节点），而"谁在谁前面"只有整表看得见。
 * 与营火那棵树同一条理由（那里用的是 `checkRestDialogueTree`），也与仓库里那条纪律一致：
 * 给条目留的函数槽位只装"形状表达不了的整表关系"。
 *
 * 这里钉住的每一条都对应一种**不会报错的坏法**：
 * - 跨流派 id 撞车 —— 存档只存 id，撞了读档就会点亮错的格；
 * - `reqs` 指向本树不存在的 id / 指向自己 / 连成环 —— 那一格永远点不亮，而面板只是灰着；
 * - `effect` 的键不在消费者白名单里（把 `melee` 拼错）—— 花掉技能点什么也不会变（B68 那一族）；
 * - 叙事技（`grant`）与剧情门（`lock`）同时写 —— 一个节点不可能既"达标白送"又"达标才能买"；
 * - 叙事技写了非 0 的 `cost`，或可加点节点写了 0 —— 前者是白送却要钱，后者是免费却要买。
 */
export function checkSkillTrees(table) {
  const out = [];
  const known = new Set(SKILL_BRANCH_IDS);
  const owner = new Map();
  for (const key of Object.keys(table ?? {})) {
    if (!known.has(key)) out.push(`skillTrees: "${key}" 不是登记过的流派（SKILL_BRANCHES 里没有这一条）`);
  }
  for (const b of SKILL_BRANCH_IDS) {
    if (!table?.[b]) out.push(`skillTrees: 缺流派 "${b}"（面板上那一格会是空的）`);
  }
  for (const [branch, nodes] of Object.entries(table ?? {})) {
    if (!Array.isArray(nodes)) { out.push(`skillTrees["${branch}"]: 期望数组`); continue; }
    const local = new Set();
    for (const n of nodes) {
      if (!n?.id) continue;
      if (owner.has(n.id)) {
        out.push(`skillTrees: id "${n.id}" 在 "${owner.get(n.id)}" 与 "${branch}" 里重了 —— 存档只存 id，重了读档会点亮错的格`);
      } else owner.set(n.id, branch);
      local.add(n.id);
    }
    for (const n of nodes) {
      if (!n?.id) { out.push(`skillTrees["${branch}"]: 有一行没有 id`); continue; }
      const p = `skillTrees["${branch}"]["${n.id}"]`;
      if (n.grant && n.lock) out.push(`${p}: 同时写了 grant 与 lock —— 一个节点不可能既"达标白送"又"达标才能买"`);
      if (n.grant && n.cost !== 0) out.push(`${p}: 叙事技（grant）的 cost 必须是 0，实际 ${n.cost}`);
      if (!n.grant && !(n.cost > 0)) out.push(`${p}: 可加点节点的 cost 必须是正整数，实际 ${n.cost}`);
      const eff = n.effect ?? {};
      const keys = Object.keys(eff);
      if (keys.length === 0) out.push(`${p}: effect 是空的 —— 这一格花掉技能点什么也不会变`);
      for (const k of keys) {
        if (!SKILL_EFFECT_KEYS.includes(k)) {
          out.push(`${p}.effect: "${k}" 不在消费者白名单里（拼错的键不会报错，只会安静地不生效；可用：${SKILL_EFFECT_KEYS.join(' / ')}`);
        }
        if (!Number.isFinite(eff[k]) || eff[k] === 0) out.push(`${p}.effect.${k}: 必须是有限且非 0 的数，实际 ${eff[k]}`);
      }
      if (!Array.isArray(n.reqs)) { out.push(`${p}.reqs: 必须是数组（没有前置就写 []）`); continue; }
      if (new Set(n.reqs).size !== n.reqs.length) out.push(`${p}.reqs: 有重复的前置`);
      for (const r of n.reqs) {
        if (r === n.id) out.push(`${p}.reqs: 指向了自己`);
        else if (!local.has(r)) out.push(`${p}.reqs: "${r}" 不在同一棵树里（跨流派的或拼错的 id 会让这一格永远点不亮）`);
      }
      if (n.lock && Object.keys(n.lock).length === 0) out.push(`${p}.lock: 是空对象（等于没有门，写它只会让人以为有）`);
    }
    // 无环 + 全部可达：从根出发反复剥"前置都已剥掉"的节点，剥不动的就在环里
    const byId = new Map(nodes.filter((n) => n?.id).map((n) => [n.id, n]));
    const done = new Set();
    let moved = true;
    while (moved) {
      moved = false;
      for (const [id, n] of byId) {
        if (done.has(id)) continue;
        const reqs = Array.isArray(n.reqs) ? n.reqs : [];
        if (reqs.every((r) => done.has(r))) { done.add(id); moved = true; }
      }
    }
    for (const id of byId.keys()) {
      if (!done.has(id)) out.push(`skillTrees["${branch}"]["${id}"]: 前置连成一个环（这一格永远点不亮）`);
    }
  }
  return out;
}

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
    // `nullable` 是给"文本由运行时现填"的那几格留的口子（营火 hub/quest 就是 text: null）。
    // 不给这个口子，人们会把 null 改成空串 —— 而空串在界面是一块空白，比 null 更难查。
    if (v === null && spec.nullable) return [];
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
  /**
   * 对象，键是 id、每个值按同一份字段表校验（W-B2：营火那棵树的 `节点 id → 节点`）。
   *
   * 与 `index` 形状的区别只在**层级**：`index` 是"一张表"，`map` 是"表里某个字段又是一张表"。
   * 没有它，这类嵌套只能退化成 `record` —— 于是节点内部再怎么写错都没人管。
   * 键的形状用 `keySet: false` 放宽（如 NPC 台词按章节号做键，那是数字不是 kebab id）。
   */
  map: (v, spec, path, ctx) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [`${path}: 期望对象，实际 ${typeName(v)}`];
    const inner = TYPES[spec.of?.t];
    if (!inner) return [`${path}: 未知的字段类型 "${spec.of?.t}"（registry 写错了）`];
    const out = [];
    for (const [key, value] of Object.entries(v)) {
      if (spec.keySet !== false && !ID_PATTERN.test(key)) {
        out.push(`${path} 的键 "${key}": 期望 kebab-case id`);
      }
      if (spec.keyRef) out.push(...TYPES.ref(key, spec.keyRef, `${path} 的键 "${key}"`, ctx));
      out.push(...inner(value, spec.of, `${path}.${key}`, ctx));
    }
    return out;
  },
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
 * 表面族与参数的一致性（W-C5 切片5）。
 *
 * 声明式词汇表说不了"按 `pattern` 二选一"：`bricks` 与 `brushed` 都是可选字段，
 * 于是"brushed 行缺 brushed""tiled 行混进 brushed"这类错在形状层是全静音的 ——
 * 前者要等烘焙器读到 `undefined` 才炸；后者更糟：数值在场、没人读，
 * 改它的人以为改了。`pattern` 的**值域**由 enum 那一层管，这里只管"说的和带的对不对得上"。
 */
/**
 * 图案族 → 这一族自己的参数行名（W-C5 切片10 起三族）。**判据只有这一份**：
 * 加第四族时在这里加一行，`checkSurfaceFamilies` 与门禁的逐族变异自动跟着长，
 * 不用再去改 if/else 链（切片5 起那条链就是逐个族抄一遍，加一族抄一遍）。
 */
export const SURFACE_FAMILY_PARAM = Object.freeze({ tiled: 'bricks', brushed: 'brushed', craggy: 'craggy' });

export function checkSurfaceFamilies(specs) {
  const out = [];
  for (const [name, spec] of Object.entries(specs ?? {})) {
    const p = `materialSurfaces["${name}"]`;
    const 本族 = SURFACE_FAMILY_PARAM[spec.pattern];
    // pattern 不在值域里由 enum 那一层点名，这里不重复判
    if (!本族) continue;
    if (!spec[本族]) out.push(`${p}: pattern "${spec.pattern}" 却缺 ${本族} 行`);
    for (const [族, 行] of Object.entries(SURFACE_FAMILY_PARAM)) {
      if (族 !== spec.pattern && spec[行]) {
        out.push(`${p}: pattern "${spec.pattern}" 却带着 ${行} 行 —— 这一族的数值没人读（改它以为改了）`);
      }
    }
  }
  return out;
}

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
    kind: 'wispSpots',
    note: '漂浮魂火（残响）的出生点（W-B12 切片5 从 `world/SoulWispManager.js` 搬进内容层）：'
      + '键是那一枚自己的 id，值是"归属哪座区 / 在哪 / 给多少魂火"。'
      + '读者是 `world/SoulWispManager.js` 的 `build()`（照这张表造魂火）。'
      + '搬进内容层的**直接收益**：分区支线"那位面到底有没有萤火"这件事查得到 —— '
      + '表在 `world/` 时内容层够不着它，于是"某座区一条萤火都没有 ⇒ 那条支线永远完成不了"'
      + '没人能查（gloom / radiant 就真的没有过，见 `content/zoneFacts.js` 的病根那段）',
    shape: 'rows',
    table: WISP_SPOTS,
    row: {
      id: { t: 'id' },
      zone: { t: 'enum', of: [...ZONE_ORDER, 'hub'] },
      x: { t: 'number' },
      z: { t: 'number' },
      souls: { t: 'int', min: 1 },
    },
  },
  {
    kind: 'zoneAmbience',
    note: '分层环境音（W-C7 切片4）：键是区 id，值是"这一座叠几层环境声"。'
      + '读者是 `audio/AudioManager` 的 `_换环境层`（照着这张表合成声线，'
      + '表里没有的层就听不见、表里多的层就多一条声线）。'
      + '键不强制对 `zones` —— `dungeon` / `wild` / `boss` 三档是**音频模式**不是位面，'
      + '而 `boss-*` 各档走 `boss` 那一档（见 `zoneAmbience.js` 的 `ambienceOf`）',
    shape: 'index',
    table: ZONE_AMBIENCE,
    value: {
      t: 'rows',
      of: {
        kind: { t: 'enum', of: AMBIENCE_KINDS },
        音量: { t: 'number', exclusiveMin: 0, max: AMBIENCE_MAX_GAIN },
      },
    },
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
    kind: 'bossPhaseTuning',
    note: '每只世界 Boss 的阶段参数（W-B8 切片5，`content/bossPhases.js`）：键 `keyRef` 到名册，'
      + '值是"第几阶段 → 一格子具名数字"。修前这些数散在五份 `update` 里按 `this.phase` 现算'
      + '（`12 + this.phase * 4`、`phase >= 3 ? 1.2 : 2.0` 之类），于是"这只 Boss 二阶段什么样"'
      + '没有一处读得到，改坏一处的症状是"那一档偏软/偏硬"而不报错',
    shape: 'index',
    table: BOSS_PHASE_TUNING,
    keyRef: { of: 'bosses' },
    // 值再往下是"阶段 → 一格数"的索引，schema 的 `t` 词汇表里没有"索引的索引"，
    // 所以这里只声明到 record，逐阶段与逐字段的规则交给 invariant
    value: { t: 'record' },
    invariant: checkBossPhaseTuning,
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
    kind: 'dungeons',
    note: '副本（地下城）定义（W-B10 切片3a，从 `world/DungeonManager.js` 的私有 const 搬来）：'
      + '各座迷宫的身份与关卡参数。**字段按实测读者声明** —— 搬之前普查证明 `themeType` 写 5 读 0，'
      + '那一格随之删掉；今天再加"以后可能用得上"的格子就是重犯同一条错。'
      + '切片3c 加的两格都有署名读者：`trial` → `TRIAL_DUNGEON_IDS`（飞升门 / 指路 / 开局点亮 / 助手清单），'
       + '`mapLabel` → `ui/WorldMapPanel.js` 上那几个点旁边的字'
      + '切片 W-E1 切片3 加的 `stage` → `dungeonGrowthStage()`（敌人成长档位）：'
      + '副本出生点在 (5000, …) 的独立坐标空间里，按坐标反推区域会全军覆没，所以档位是显式设计决定',
    shape: 'rows',
    table: DUNGEON_DEFS,
    row: {
      id: { t: 'id' },
      name: { t: 'string' },
      // 成长档位（W-E1 切片3）：必填 —— 省略即"这座副本的敌人按 0 档出"，
      // 而那座副本门口可能隔着半个世界。域由 `GROWTH_MAX_STAGE` 说话（与曲线表同源）。
      stage: { t: 'int', min: 0, max: GROWTH_MAX_STAGE },
      // W-B11 切片4：一份**设计好的布局**（关卡编辑器导出的载荷）——
      // 带了它，那座副本就不"摇"，改"补完"（与摇出来的共用同一段补完规则）。
      layout: { t: 'record', required: false },
      // 两格都是**必填**：`trial` 省略就等于"新加的那座默认不算试炼"，而这句话正是切片3c
      // 从四处手抄本收回来的那一句；`mapLabel` 省略则地图上的点没有字。
      trial: { t: 'bool' },
      mapLabel: { t: 'string' },
      theme: { t: 'int', min: 0, max: 0xffffff },
      accent: { t: 'int', min: 0, max: 0xffffff },
      gridW: { t: 'int', min: 3, max: 8 },
      gridH: { t: 'int', min: 3, max: 8 },
      origin: { t: 'row', of: { x: { t: 'int' }, y: { t: 'int' }, z: { t: 'int' } } },
      entrance: { t: 'row', of: { x: { t: 'int' }, z: { t: 'int' } } },
      exterior: { t: 'row', of: { x: { t: 'int' }, z: { t: 'int' }, label: { t: 'string' } } },
    },
    invariant: checkDungeons,
  },
  {
    kind: 'dungeonEncounters',
    note: '副本遭遇表（W-B10 切片3b）：键是副本 id，值是"这一座出哪几类、一间房出几只"。'
      + '切片3a 删掉写 5 读 0 的 `themeType` 之后，这是"这座副本出什么"唯一说话的地方 ——'
      + '读者是 `ProceduralDungeonGenerator.generate`（按 def.id 申领后递给 `generateMaze`）。'
      + '两边都得查得到：键对 `dungeons`（多一格 = 那座副本进不去，少一格 = 玩家进的是 A 打的是 B），'
      + '`type` 对 `enemyRoster`（名字与数值只由名册说，这里不许再写一遍）',
    shape: 'index',
    table: DUNGEON_ENCOUNTERS,
    keyRef: { of: 'dungeons' },
    value: {
      t: 'row',
      of: {
        pool: {
          t: 'rows',
          // 两类起步：这一片的全部理由是"五座打出同一场仗"，而单一类别的池子就是把那句话
          // 写进表里。真要一座"只有一种敌人"的副本，那是切片4 房间模板库的遭遇设计，不是这里
          minLength: 2,
          of: {
            type: { t: 'ref', of: 'enemyRoster' },
            // 权重是相对值：只要求正整数，不要求和为 100（见 `dungeonEncounters.js` 的口径）
            weight: { t: 'int', min: 1 },
          },
        },
        group: {
          t: 'row',
          of: {
            // 上下限都封在 1..4：普查实测是 1..2，而房间几何（CELL 18）与小队 aggro 名额
            // 今天没有为"一房五只"调过参数。真要更大编组，改这里要连着改 B76 那一族
            min: { t: 'int', min: 1, max: 4 },
            max: { t: 'int', min: 1, max: 4 },
          },
        },
      },
    },
    invariant: checkDungeonEncounters,
  },
  {
    kind: 'dungeonBossLines',
    note: '副本 Boss 台词：键是**副本 id**（不是 bossId —— 两者由 `getDungeonBossId` 转换）',
    shape: 'index',
    table: DUNGEON_BOSS_LINES,
    // 切片3a 落了副本表，这里就补上当时欠的那一条 keyRef：
    // 键写错一个字母的症状是"那场 Boss 打赢了却没有收尾台词"，而它不会红。
    keyRef: { of: 'dungeons' },
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
  {
    kind: 'echoes',
    note: '次元回声目录（W-B2：合并 Wave1-4）：id ↔ franchise/zone/title/desc/trigger',
    shape: 'rows',
    table: ECHOES,
    row: {
      id: { t: 'id' },
      // 母题用 enum 而不是 ref：`FRANCHISE` 是「常量名 → id」，ref 收到的是常量名（大写），
      // 而条目里存的是 id（小写）—— 拿常量名那张表去查会整表红。区域反过来正好：
      // `ZONE_NAMES` 的键就是区域 id，所以那里能用 ref
      franchise: { t: 'enum', of: Object.values(FRANCHISE) },
      zone: { t: 'ref', of: 'zones' },
      title: { t: 'string' },
      desc: { t: 'string' },
      trigger: { t: 'string' },
    },
  },
  {
    kind: 'ambientZoneEvents',
    note: '区域氛围事件（W-B2）：区域 id → [{ text, weight }] —— 键打错就是一个区域的低语永远不出现',
    shape: 'index',
    table: ZONE_EVENTS_POP,
    keyRef: { of: 'zones' },
    value: {
      t: 'rows',
      of: {
        text: { t: 'string' },
        weight: { t: 'number', min: 0, max: 1 },
      },
    },
  },
  {
    kind: 'loreFragments',
    note: 'Lore 碎片（W-B2）：章节门控的叙事碎片',
    shape: 'rows',
    table: LORE_FRAGMENTS_POP,
    row: {
      id: { t: 'id' },
      title: { t: 'string' },
      text: { t: 'string' },
      chapter: { t: 'int', min: 1, max: 5 },
    },
  },
  {
    kind: 'npcLines',
    note: 'NPC 章节台词（W-B2）：npcId → { chapterNum: [lines...] }',
    shape: 'index',
    table: NPC_LINES_POP,
    value: { t: 'record' },
  },
  {
    kind: 'restPointNames',
    note: '营火显示名（W-B4 切片2）：营火 id → 那一个名字。对话标题 / 交互提示 / 快速旅行行 / '
      + '营火记忆图鉴都从这一格取 —— 树上再抄一份就是第五个名字（改前的实物病例见 `restDialogues.js` 头注）',
    shape: 'index',
    table: REST_POINT_NAMES,
    keyRef: { of: 'zones' },
    value: { t: 'string' },
    invariant: checkRestPointNames,
  },
  {
    kind: 'restDialogues',
    note: '营火分支对话树（W-B2 整棵外移）：区域 id → { nodes: { 节点 id → 节点 } }。'
      + '名字不在这张表里（W-B4 切片2 删掉了那份抄本），见 `restPointNames`',
    shape: 'index',
    table: REST_DIALOGUES,
    keyRef: { of: 'zones' },
    value: {
      t: 'row',
      of: {
        nodes: {
          t: 'map',
          of: {
            t: 'row',
            of: {
              // 说话人名**不是**节点自己的字段了（W-D2 切片15）：它在 `REST_NPC_DEFS[zone].name`
              // 里只有一份，这里那 93 处 `speaker` 抄本（实测逐字等于定义里的名字）已删净。
              // 留着这一格是为了"某一节点确实换了说话人"那种情况 —— 写的话要是**文案键**。
              speaker: { t: 'string', required: false },
              // hub 的 quest 那一格文本由运行时按当前任务现填，所以允许 null ——
              // 但不许空串：空串在界面上是一块空白，null 至少说明"这一格是有意留的"
              text: { t: 'string', nullable: true },
              mood: { t: 'enum', of: ['calm', 'warn'], required: false },
              minChapter: { t: 'int', min: 1, max: 5, required: false },
              journal: {
                t: 'row',
                required: false,
                of: { id: { t: 'id' }, title: { t: 'string' }, text: { t: 'string' } },
              },
              choices: {
                t: 'rows',
                minLength: 1,
                of: {
                  label: { t: 'string' },
                  // 落点与动作的"只能二选一"由 `invariant` 管（那是跨字段的事，字段表说不了）
                  next: { t: 'id', required: false },
                  action: { t: 'enum', of: ['rest'], required: false },
                  minChapter: { t: 'int', min: 1, max: 5, required: false },
                },
              },
            },
          },
        },
      },
    },
    invariant: checkRestDialogueTree,
  },
  {
    kind: 'restDialogueCg',
    note: '营火对话 CG 预设（W-B4 切片1）：`<营火 id>:<节点 id>` → { scene, caption, mood? }。'
      + '键是复合串，`keyRef` 表达不了"节点得在那棵树上"，所以键的形状与配对全在 invariant 里',
    shape: 'index',
    table: REST_DIALOGUE_CG,
    // 刻意不挂 keyRef：键不是区域 id，而是"区域 id + 冒号 + 节点 id"
    value: {
      t: 'row',
      of: {
        scene: { t: 'string' },
        caption: { t: 'string' },
        mood: { t: 'enum', of: ['calm', 'warn'], required: false },
      },
    },
    invariant: checkDialogueCgPresets,
  },
  {
    kind: 'achievementsExtra',
    note: '额外成就（W-B2：原 AchievementExtras）',
    shape: 'rows',
    table: ACHIEVEMENTS_EXTRA,
    row: {
      id: { t: 'id' },
      title: { t: 'string' },
      desc: { t: 'string' },
      // check 是运行时函数，不参与静态校验
    },
  },
  {
    kind: 'achievementsPopCulture',
    note: '次元回声成就（W-B2：原 PopCultureAchievementExtras）',
    shape: 'rows',
    table: ACHIEVEMENTS_POP_CULTURE,
    row: {
      id: { t: 'id' },
      title: { t: 'string' },
      desc: { t: 'string' },
      // check 是运行时函数，不参与静态校验
    },
  },
  {
    kind: 'cgGalleryBonusExtra',
    note: 'CG 画廊 bonus 扩写（W-B2：原 CgGalleryRegistryExtras）',
    shape: 'rows',
    table: CG_GALLERY_BONUS_EXTRA,
    row: {
      id: { t: 'string' },
      scene: { t: 'string' },
      caption: { t: 'string' },
      mood: { t: 'string' },
      zone: { t: 'id' },
      speaker: { t: 'string' },
      accent: { t: 'string' },
      unlock: { t: 'string' },
      sort: { t: 'int', min: 0 },
    },
  },
  {
    kind: 'sideQuestsBase',
    note: '基础支线（W-B3 切片5 从 `game/SideQuestRegistry.js` 搬进内容层）：与致敬族合成 `SIDE_QUESTS_ALL` 一份名单，分母、页签、完成检测都只认那一份',
    shape: 'rows',
    table: SIDE_QUESTS_BASE,
    row: {
      id: { t: 'id' },
      zone: { t: 'enum', of: [...ZONE_ORDER, 'global'] },
      title: { t: 'string' },
      desc: { t: 'string' },
      // check 是运行时判据（签名 `(game) => boolean`），不参与静态校验；
      // 它是否存在由下面的 `checkSideQuestRosters` 当场核（少了它 = 这条支线永远完成不了，且不报错）
      reward: { t: 'int', min: 1 },
      journal: { t: 'string' },
    },
    invariant: checkSideQuestRosters,
  },
  {
    kind: 'sideQuestsZone',
    note: '分区支线（W-B12 切片1+2）：每位面 ≥2 条，判据只用已持久化又可跳过的位面事实（歇够次数 + 门口插画 + 该区萤火 + 火牌发现）',
    shape: 'rows',
    table: SIDE_QUESTS_ZONE,
    row: {
      id: { t: 'id' },
      zone: { t: 'enum', of: [...ZONE_ORDER, 'global'] },
      title: { t: 'string' },
      desc: { t: 'string' },
      reward: { t: 'int', min: 1 },
      journal: { t: 'string' },
    },
    invariant: (table, ctx) => [...checkZoneSideQuestCoverage(table, ctx), ...checkZoneFactProducers(table)],
  },
  {
    kind: 'sideQuestsPop',
    note: '致敬向支线任务（W-B2：原 SideQuestPopCulture 的数据半壁；挂载那半壁是改写 `checkAll` 的 monkey-patch，切片5 已删）。zone 自切片3 起不是自由文本：单系列的由回声表推（franchiseZone），多系列/百分比标 global',
    shape: 'rows',
    table: SIDE_QUESTS_POP,
    row: {
      id: { t: 'id' },
      zone: { t: 'enum', of: [...ZONE_ORDER, 'global'] },
      title: { t: 'string' },
      desc: { t: 'string' },
      reward: { t: 'int', min: 1 },
      journal: { t: 'string' },
    },
  },
  {
    kind: 'helpSectionsExtra',
    note: '说明书扩写章节（W-B2：原 HelpManualExtras）',
    shape: 'rows',
    table: HELP_SECTIONS_EXTRA,
    row: {
      id: { t: 'id' },
      title: { t: 'string' },
      body: { t: 'string' },
    },
  },
  {
    kind: 'gearRarity',
    note: '装备稀有度（W-B5 切片1）：掉一件装备抽几条词缀、相对权重多少 —— `affixes: 0` 的凡品是底座档',
    shape: 'rows',
    table: GEAR_RARITY,
    row: {
      id: { t: 'id' },
      weight: { t: 'int', min: 1 },
      affixes: { t: 'int', min: 0, max: 3 },
    },
    invariant: checkGearRarity,
  },
  {
    kind: 'gearBases',
    note: '装备基表（W-B5 切片1）：`slot` 只能是 GEAR_SLOTS 里那两个槽，`mods` 是这件装备天生给的属性点',
    shape: 'rows',
    table: GEAR_BASES,
    row: {
      id: { t: 'id' },
      slot: { t: 'enum', of: GEAR_SLOTS },
      weight: { t: 'int', min: 1 },
      mods: { t: 'record' },
    },
    invariant: checkGearBases,
  },
  {
    kind: 'gearAffixes',
    note: '装备词缀池（W-B5 切片1）：`minRarity` 引用稀有度表 —— 凡品上不许长出史诗的词（打错一个字母的档位会在开机红）',
    shape: 'rows',
    table: GEAR_AFFIXES,
    row: {
      id: { t: 'id' },
      weight: { t: 'int', min: 1 },
      minRarity: { t: 'ref', of: 'gearRarity' },
      mods: { t: 'record' },
    },
    invariant: checkGearAffixes,
  },
  {
    kind: 'gearDropChance',
    note: '按敌人档位的装备掉率（W-B5 切片2）：`none` 是名单外档位的显式兜底，`dummy` 是显式的"什么都不掉"',
    shape: 'index',
    table: GEAR_DROP.byKind,
    value: { t: 'number', min: 0, max: 1 },
  },
  {
    kind: 'gearSoulValue',
    note: '换下 / 不穿的装备折成多少魂（W-B5 切片2）：键必须是稀有度表里的 id —— 打错一档不会报错，只会"那一档折成 0 魂"',
    shape: 'index',
    table: GEAR_DROP.soulValue,
    keyRef: { of: 'gearRarity' },
    value: { t: 'int', min: 0 },
  },
  {
    kind: 'gearRarityDisplay',
    note: '稀有度的字样与颜色（W-B5 切片2）：地上那团光与拾取提示里那个词必须是同一个答案',
    shape: 'index',
    table: GEAR_RARITY_DISPLAY,
    keyRef: { of: 'gearRarity' },
    value: {
      t: 'row',
      of: {
        label: { t: 'string' },
        tint: { t: 'int', min: 0, max: 0xffffff },
      },
    },
  },
  {
    kind: 'gearNames',
    note: '装备与词缀的中文名（W-B5 切片2）：键必须与两张表的 id **互相**对得上（少一个 = 玩家看到一个 id，多一个 = 那条名字永远不会出现）',
    shape: 'index',
    table: GEAR_NAMES,
    value: { t: 'string' },
    invariant: checkGearNames,
  },
  {
    kind: 'gearPools',
    note: '每个区域掉得出哪些基表（W-B5 切片3）：`default` 那一格是名单外区域（走廊 / unknown）的显式兜底',
    shape: 'index',
    table: GEAR_POOLS,
    keyRef: { of: 'zones' },
    keyAllow: [GEAR_POOL_DEFAULT],
    value: {
      t: 'rows',
      minLength: 1,
      of: {
        base: { t: 'ref', of: 'gearBases' },
        weight: { t: 'int', min: 1 },
      },
    },
    invariant: checkGearPools,
  },
  {
    kind: 'gearBossDrops',
    note: '每只世界 Boss 必掉哪一件（W-B5 切片5）：键 `keyRef` 到名册（`dungeon-` 前缀的副本 Boss '
      + '不要求登记），值两格都是 `ref`（打错 base 或档位开机红，而不是"那只 Boss 静默少掉一件"）',
    shape: 'index',
    table: GEAR_BOSS_DROPS,
    keyRef: { of: 'bosses' },
    value: {
      t: 'row',
      of: {
        base: { t: 'ref', of: 'gearBases' },
        rarity: { t: 'ref', of: 'gearRarity' },
      },
    },
    invariant: checkGearBossDrops,
  },
  {
    kind: 'gearSlotNames',
    note: '槽位的中文名（W-B5 切片4）：与 `GEAR_SLOTS` **双向**对上（少一格 = 界面上那一行是空的，多一格 = 那个名字永远不出现）',
    shape: 'index',
    table: GEAR_SLOT_NAMES,
    value: { t: 'string' },
    invariant: checkGearSlotNames,
  },
  {
    kind: 'gearBag',
    note: '背包容量（W-B5 切片4）：键是旋钮名而不是 id（与 zoneIds 同一形状），值是格数 —— '
      + '写成 0 或负数的表现是"永远捡不起来"，开机就该红',
    shape: 'index',
    table: GEAR_BAG,
    value: { t: 'int', min: 1, max: 100 },
  },
  {
    kind: 'enemySpawns',
    note: '野外原生敌人的出生点（W-B7 切片7 从 `combat/EnemyManager.js` 搬进内容层）：'
      + '键是出场次序（**顺序也是契约** —— 出生点的先后决定 `spawnAt` 的调用序，而那决定敌人的列表序），'
      + '值是"哪一类敌人 / 站在哪个坐标"。读者是 `combat/EnemyManager.js` 的 `spawnDefaults()`。'
      + '表里**没有区位那一格** —— 区位是按坐标反推的（`zoneIdAt`，按位置反推区域的唯一一处），'
      + '在这里再抄一格就是第二份真相',
    shape: 'rows',
    table: ENEMY_SPAWNS,
    row: {
      type: { t: 'ref', of: 'enemyRoster' },
      x: { t: 'number' },
      z: { t: 'number' },
    },
  },
  {
    kind: 'enemyRoster',
    note: '敌人身份（W-B10 切片2）：名字与基础数值只有一份 —— 区域出生（`EnemyManager.spawnAt`）与'
      + '副本出生（`DungeonManager._spawnRoomEnemies`）都读同一格。键要对齐 `ENEMY_MOVE_SETS` 与'
      + ' `BODY_PLANS`：少一格 = 那一类只能靠手抄名字出生，多一格 = 那个名字永远不会出现',
    shape: 'index',
    table: ENEMY_ROSTER,
    value: {
      t: 'row',
      of: {
        name: { t: 'string' },
        hp: { t: 'int', min: 1 },
        posture: { t: 'int', min: 1 },
        damage: { t: 'int', min: 1, required: false },
        speed: { t: 'number', exclusiveMin: 0, required: false },
        aggroRange: { t: 'int', min: 1, required: false },
        color: { t: 'int', min: 0, max: 0xffffff },
        canAttack: { t: 'bool', required: false },
        respawn: { t: 'bool', required: false },
        respawnTime: { t: 'int', min: 1, required: false },
      },
    },
    invariant: checkEnemyRoster,
  },
  {
    kind: 'objectives',
    note: '主线/任务目标（W-B3 切片1 的数据层）—— 分支、条件、标志、重访；在役读者只有 `game/QuestSystem.js`（按表序走）',
    shape: 'rows',
    table: OBJECTIVES,
    row: {
      id: { t: 'id' },
      title: { t: 'string' },
      desc: { t: 'string' },
      type: { t: 'enum', of: OBJECTIVE_TYPES },
      targetId: { t: 'id', required: false },
      target: { t: 'int', min: 1, required: false },
      enemyType: { t: 'ref', of: 'enemyRoster', required: false },
      // 「装备」步（W-E3 切片17）：要挂东西的**槽位**（护符 / 徽记）——
      // 枚举而不是自由 id ⇒ 写错槽位名在开机那一刻就红（注册表必填校验走的是这一格）
      gearSlot: { t: 'enum', of: GEAR_SLOTS, required: false },
      bossId: { t: 'ref', of: 'bosses', required: false },
      // 副本 id 现在有一张表了（切片3a）：写错的字母以前只会让那条任务没有路点，
      // 如今开机就红 —— 与 `zone: { t: 'ref', of: 'zones' }` 同一口径
      dungeonId: { t: 'ref', of: 'dungeons', required: false },
      chapter: { t: 'int', min: 1, max: 5 },
      announce: { t: 'string', required: false },
      autoComplete: { t: 'bool', required: false },
      condition: { t: 'string', required: false },
      flags: { t: 'record', required: false },
      requires: { t: 'record', required: false },
      failsOn: { t: 'string', required: false },
      failMessage: { t: 'string', required: false },
      onFail: { t: 'enum', of: ['reset', 'restart', 'branch'], required: false },
      branchTo: { t: 'id', required: false },
      branchCondition: { t: 'string', required: false },
      revisit: { t: 'bool', required: false },
      reward: { t: 'int', min: 0, required: false },
      journal: { t: 'string', required: false },
      waypoint: {
        t: 'row',
        required: false,
        of: { x: { t: 'int' }, z: { t: 'int' }, label: { t: 'string' } },
      },
    },
    invariant: checkObjectivesTable,
  },
  {
    kind: 'skillTrees',
    note: '技能树（W-B6 切片1）：键是流派 id，值是这一流的节点行 —— `id` 是**存档里的稳定身份**'
      + '（`WeaponSkillTree.toJSON` 只存 id），所以跨流派也必须唯一；叙事技（`grant`）与可加点节点同表',
    shape: 'index',
    table: SKILL_TREES,
    keyAllow: SKILL_BRANCH_IDS,
    value: {
      t: 'rows',
      // §5 的数量目标：**每一流 ≥10 个节点**（这里数的是全部节点，含叙事技；
      // "可加点"那一份由 `tests/skill-trees.test.js` 单独数）
      minLength: 10,
      of: {
        id: { t: 'id' },
        name: { t: 'string' },
        desc: { t: 'string' },
        cost: { t: 'int', min: 0 },
        // `reqs` 故意不在这里声明：它是**跨行引用**（同树里其它节点的 id），
        // 而声明式词汇表没有"一组 id"这种类型 —— 见 `checkSkillTrees`
        effect: { t: 'record' },
        // 可加点节点的剧情门。每一格都必须有人读（`getStoryLockReason`）；
        // 修前 `m-mana` 那一格写的是没人读的 `quest`，等于敞着
        lock: {
          t: 'row',
          required: false,
          of: {
            chapter: { t: 'int', min: 1, max: 5, required: false },
            boss: { t: 'ref', of: 'bosses', required: false },
            loreFragments: { t: 'int', min: 1, required: false },
            spellCasts: { t: 'int', min: 1, required: false },
          },
        },
        grant: {
          t: 'row',
          required: false,
          of: {
            chapter: { t: 'int', min: 1, max: 5, required: false },
            boss: { t: 'ref', of: 'bosses', required: false },
          },
        },
        lore: { t: 'string', required: false },
      },
    },
    invariant: checkSkillTrees,
  },
  {
    kind: 'materialSurfaces',
    note: '程序化表面贴图的烘焙规格（W-C5 切片1）：键是表面名，值是"这张贴图长什么样"的全部数值。'
      + '三个读者共用这一份 —— `scripts/bake-textures.mjs` 按它产出 `public/textures/gen/*.png`、'
      + '`assets/TextureLibrary.js` 从 `files` 推导 URL、`tests/material-surfaces.test.js` 重算比对。'
      + '改任何一个数值都必须重烘焙（`npm run bake:textures`）：改数不重烤的症状是文件旧、规格新，'
      + '而且**不报错** —— 所以测试拿规格重算，与提交的字节逐像素比',
    shape: 'index',
    table: SURFACE_SPECS,
    value: {
      t: 'row',
      of: {
        pattern: { t: 'enum', of: SURFACE_PATTERNS },
        tileMeters: { t: 'number', exclusiveMin: 0 },
        size: { t: 'int', min: 64, max: 1024 },
        seed: { t: 'int', min: 0 },
        // 两族的参数各自可选（tiled 用 bricks、brushed 用 brushed），"按 pattern 二选一"
        // 由 `checkSurfaceFamilies` 点名 —— 形状层表达不了条件必填
        bricks: {
          t: 'row',
          required: false,
          of: {
            rows: { t: 'int', min: 1, max: 64 },
            cols: { t: 'int', min: 1, max: 64 },
            mortarPx: { t: 'int', min: 1, max: 32 },
            stagger: { t: 'number', min: 0, max: 1 },
            phase: { t: 'number', min: 0, max: 1 },
          },
        },
        brushed: {
          t: 'row',
          required: false,
          of: {
            lines: { t: 'int', min: 2, max: 256 },
            rows: { t: 'int', min: 2, max: 64 },
            amp: { t: 'number', exclusiveMin: 0, max: 1 },
          },
        },
        craggy: {
          t: 'row',
          required: false,
          of: {
            // 台阶数（1 = 不量化 ⇒ 光滑起伏，冰面那一档）/ 高度振幅 / 台阶面上的细颗粒权重
            facets: { t: 'int', min: 1, max: 64 },
            amp: { t: 'number', exclusiveMin: 0, max: 4 },
            grain: { t: 'number', min: 0, max: 1 },
          },
        },
        octaves: {
          t: 'rows',
          minLength: 1,
          of: {
            lattice: { t: 'int', min: 2, max: 256 },
            amp: { t: 'number', exclusiveMin: 0, max: 1 },
          },
        },
        normalStrength: { t: 'number', exclusiveMin: 0, max: 16 },
        roughBase: { t: 'number', min: 0, max: 1 },
        roughAmp: { t: 'number', min: 0, max: 0.5 },
        files: {
          t: 'row',
          of: {
            normal: { t: 'string' },
            roughness: { t: 'string' },
          },
        },
      },
    },
    invariant: checkSurfaceFamilies,
  },
  {
    kind: 'difficulty',
    note: '难度三档（W-E1 切片1）：键是档位 id，值是 label / desc / 三个乘子。'
      + '乘子的键名单由 `DIFFICULTY_KEYS` 固定，而"每一格都得有人读"由 `tests/difficulty.test.js` '
      + '逐个点名（表里加一格没人读 = 面板上多一个假旋钮）；出厂档 `standard` 必须逐格为 1，'
      + '由本条目的 invariant 硬断言（有它，"出厂行为与没有难度系统逐字节相同"才不是一句记忆）',
    shape: 'index',
    table: DIFFICULTY_TIERS,
    value: {
      t: 'row',
      of: {
        label: { t: 'string' },
        desc: { t: 'string' },
        multipliers: {
          t: 'row',
          of: {
            enemyHp: { t: 'number', exclusiveMin: 0 },
            damageTaken: { t: 'number', exclusiveMin: 0 },
            souls: { t: 'number', exclusiveMin: 0 },
          },
        },
      },
    },
    invariant: checkDifficultyTable,
  },
  {
    kind: 'enemyGrowth',
    note: '敌人成长曲线（W-E1 切片3）：行序即档位，第 i 行是"进度到第 i 档"的两个乘子'
      + '（hp / damage）。档位数必须与 ZONE_ORDER 一致（每座真实区域一档）、0 档必须恒等'
      + '（出发点区域"接上与不接一个样"）、逐档单调不降（"越往后越难"）—— 三条都由'
      + ' `checkEnemyGrowth` 在开机与 `npm test` 各跑一次。读者是 `EnemyManager.spawnAt`'
      + '（世界出生按区域下标取档，副本按定义行上的 `dungeons.stage` 取档）。',
    shape: 'rows',
    table: ENEMY_GROWTH,
    row: {
      hp: { t: 'number', exclusiveMin: 0 },
      damage: { t: 'number', exclusiveMin: 0 },
    },
    invariant: checkEnemyGrowth,
  },
];

/* ------------------------------------------------------------------ *
 * 校验入口
 * ------------------------------------------------------------------ */

/** 先扫一遍所有表，把 id 收成 `kind → Set`，供 `ref` 用 */
function collectIds(tables) {
  const ids = new Map();
  for (const t of tables) {
    if (t.shape === 'rows') {
      const key = t.idKey ?? 'id';
      ids.set(t.kind, new Set((Array.isArray(t.table) ? t.table : []).map((r) => r?.[key])));
    } else if (t.shape === 'index') {
      // `index` 形状的表，它的**键**本身就是那批 id（`zones` 的键就是区域 id）。
      // 不收这一份，`{ t: 'ref', of: 'zones' }` 就没地方可查，人们只能退回 `t: 'id'` ——
      // 那等于"看着像 id 就行"，`zone: 'magicc'` 一路绿到运行时才安静地什么都不做
      ids.set(t.kind, new Set(Object.keys(t.table ?? {})));
    }
  }
  return ids;
}

/**
 * 校验一张表，返回**全部**错误（不抛、不早退）。
 * 一次跑完能看到"这张表一共有几处坏"，而不是改一处跑一次。
 *
 * `ctx` 不给就按在役注册表自己收一遍：`ref` 是**字段**的属性，不是调用方的礼节。
 * 要求每个单独调 `checkTable` 的人都记得带上下文，等于让"这张表有没有断链"取决于谁怎么调它 ——
 * 而漏带的那一支只会把 `ref` 检查变成一次 TypeError。
 */
export function checkTable(entry, ctx = { ids: collectIds(CONTENT_TABLES) }) {
  const out = shapeErrors(entry, ctx);
  // 有的不变式不是"某个字段长什么形状"，而是"这棵树自己连不连得起来"
  // （营火那棵树里 `next` 必须落在**同一区域**的某个节点上）。声明式词汇表到这里就到底了：
  // 为一条表再造第十种类型只会让九种类型都变得可疑，所以给条目留一个函数槽位，
  // 并且只允许"形状表达不了的整表关系"用它。
  if (entry.invariant && entry.table && typeof entry.table === 'object') {
    out.push(...entry.invariant(entry.table, ctx));
  }
  return out;
}

function shapeErrors(entry, ctx) {
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
 * 营火名的名册成对规则（W-B4 切片2）。
 *
 * 名字、对话树、NPC 定义是三张按同一批营火 id 索引的表，而玩家看到的每一处都要三张一起说话：
 * 缺名字 → 提示与图鉴只能拿 id 冒充名字（正是这一族"不报错的说假话"）；多名字 → 那一格永远不会
 * 出现在玩家面前。三条各配反向，写在 `tests/rest-point-name-single-source.test.js`。
 */
/**
 * 支线两族名册的成对规则（W-B3 切片5）。
 *
 * 这一族以前静默失效过：基础那 7 条住在 `game/`、致敬那 14 条住在 `content/`，
 * 而"支线一共几条"有两个答案（分母读 7、完成检测读 21）—— HUD 能显示 "(12/7)"，
 * 14 条致敬支线能完成却从不出现在页签里。判据 `check` 是函数、不能静态校验，
 * 所以能静态核的就三件事，每件都对应一种"不报错的少内容"：
 * 1. 两族都非空 —— 搬空一族不会红，只是玩家少了 14 条支线；
 * 2. 两族之间 id 不重名 —— 合并表按"后写盖掉前写"的话，重名就是静默少一条（`SIDE_QUESTS_ALL`
 *    自己也会抛，这条给的是开机时能读懂的消息，而不是构建期一个匿名异常）；
 * 3. 每条都得有 `check` —— 少了它，遍历时抛 TypeError，而那一族以前包着 `catch (_) {}`，
 *    于是那条支线**永远完成不了**且没有任何声响。
 */
export function checkSideQuestRosters(baseTable) {
  const out = [];
  const rosters = [
    ['sideQuestsBase', baseTable ?? []],
    ['sideQuestsZone', SIDE_QUESTS_ZONE],
    ['sideQuestsPop', SIDE_QUESTS_POP],
  ];
  for (const [kind, rows] of rosters) {
    if (!Array.isArray(rows) || rows.length === 0) {
      out.push(`${kind}: 一族支线空了 —— 分母与页签会跟着一起变小，玩家少的这几条不会报任何错`);
    }
  }
  const 见过 = new Map();
  for (const [kind, rows] of rosters) {
    for (const row of rows ?? []) {
      if (typeof row?.check !== 'function') {
        out.push(`${kind} 支线 "${row?.id}": 没有 check 函数（运行时那句会抛 TypeError，这条支线永远完成不了）`);
      }
      if (见过.has(row?.id)) {
        out.push(`sideQuests: 支线 id "${row?.id}" 同时在 "${见过.get(row?.id)}" 与 "${kind}" 里 —— 合并名单只能留一条，另一条玩家看不到`);
      } else 见过.set(row?.id, kind);
    }
  }
  return out;
}

/**
 * 分区覆盖（W-B12 切片1 立门禁 ≥1，切片2 升到 ≥2，切片7 升到 ≥3）：**每个位面至少三条专属支线**。
 *
 * 这条不是形式主义 —— 板上"支线 7 → 15+"那个目标在 21 条时就已"达成"，
 * 而玩家在一座位面里做的事跟它是不是那个位面毫无关系。**能检验的是覆盖，不是条数。**
 * 切片1 时说过"要继续变严，得先有可跳过的持久化事实可绑"：当时每个位面只有两样
 * （歇几次、看过插画）；切片2 起萤火（`soulWisps`，一直在存档里）与火牌发现
 * （`restPointEnhancer.discovered`，存档 v7 落库 —— B66）也是位面账，每位面 ≥2 诚实做得到；
 * **切片7 起第三样位面事实落地**：该位面的**清剿数**（任务账 `zoneKills`，生产者是
 * `enemy-defeated` 事件里的 `zone`），于是每位面 ≥3 也诚实做得到。
   * **W-E3 切片7 起第四样位面事实落地**：那位面的**副本**（`dungeonRuns.clears`；
   * 位面 → 副本的映射由副本定义表那格 `zone` **推导**，不是手抄的名单）⇒ 每位面 ≥4。
 * 判据挂在分区族这张表上（不是合并名单），这样用例能把这张表换成"少一位"的版本走 shipped 入口。
 */
export function checkZoneSideQuestCoverage(zoneTable) {
  const 计数 = new Map();
  for (const q of zoneTable ?? []) {
    if (ZONE_ORDER.includes(q?.zone)) 计数.set(q.zone, (计数.get(q.zone) ?? 0) + 1);
  }
  const out = [];
  for (const zone of ZONE_ORDER) {
    const n = 计数.get(zone) ?? 0;
    if (n === 0) {
      out.push(`sideQuestsZone: 位面 "${zone}" 一条专属支线都没有 —— 这位面的内容深度是 0，而"条数够不够"那种门禁看不见它`);
    } else if (n < 4) {
      out.push(`sideQuestsZone: 位面 "${zone}" 的专属支线只有 ${n} 条（W-E3 切片7 门禁：每位面 ≥4）`
        + ' —— 四样位面事实（歇脚与插画 / 萤火与火牌 / 清剿数 / 那位面的副本）都在存档里，第四条没有理由缺席');
    }
  }
  return out;
}

export function checkRestPointNames(table) {
  const out = [];
  for (const id of Object.keys(table ?? {})) {
    const name = table[id];
    if (typeof name !== 'string' || !name) {
      out.push(`restPointNames "${id}": 名字不是非空字符串（交互提示与图鉴那一格会空掉，或写成 undefined）`);
    }
    if (!REST_DIALOGUES[id]) {
      out.push(`restPointNames "${id}": 有名字却没有对话树（那一格永远不会出现在玩家面前）`);
    }
  }
  for (const id of Object.keys(REST_DIALOGUES)) {
    if (!table?.[id]) {
      out.push(`restDialogues 营火 ${id}: 名字表里没有这一格（对话标题与脚下的提示都说不出它叫什么）`);
    }
  }
  for (const id of Object.keys(REST_NPC_DEFS)) {
    if (!table?.[id]) {
      out.push(`restNpcDefs 营火 ${id}: 有 NPC 定义却没有营火名（图鉴筛选那一行只能拿 id 顶上）`);
    }
  }
  return out;
}

/**
 * 营火树的结构不变式。
 *
 * 为什么形状校验拦不住它：`RestDialogue._showNode` 开头是 `if (!node) return` ——
 * 写错的 `next` 不报错、不提示，玩家点下那一格只看到对话窗自己关掉。
 * "静默的死选择"正是内容表最典型的坏法，也是眼睛最难发现的那种。
 *
 * 五条：
 * 1. `next` 必须落在**同一棵树的同一区域**里（区域之间不互跳：树按营火取）；
 * 2. 每一格选择要么 `next` 要么 `action`，有且只有一个（运行时先认 action，
 *    两个都给等于 next 白写；两个都不给就是"点了只关窗"那条兜底路径）；
 * 3. 除 `start` 外不许有孤儿节点 —— 没有选择通向它的节点，玩家永远看不到；
 * 4. 每一棵树的那座营火得有 NPC 定义，且 `name` / `accent` 是字符串（对话框与画廊读的就是这两格）；
 * 5. 反向也成对：有 NPC 定义却没树的那座营火，按 E 只会直接开升级面板。
 *
 * 第六条（W-B4 切片2）：树上不许再带 `title`。那一格曾经就是对话标题，而营火名在
 * `restPointNames` 只有一份 —— 抄回来不报错，只会让同一座火在同一个界面上有两个名字。
 */
export function checkRestDialogueTree(table) {
  const out = [];
  for (const [zone, tree] of Object.entries(table ?? {})) {
    // 第六条（W-B4 切片2）：树上不许再带名字。这一格曾经是对话标题的真源，而营火名在
    // `restPointNames` 只有一份 —— 抄回来不报错，只会让同一座火在同一个界面上有两个名字
    if (tree && Object.hasOwn(tree, 'title')) {
      out.push(`restDialogues 营火 ${zone}: 树上又带了 title —— 营火名只有 restPointNames 那一份，标题取 restPoint.name`);
    }
    const nodes = tree?.nodes ?? {};
    const ids = new Set(Object.keys(nodes));
    const referenced = new Set();
    for (const [nodeId, node] of Object.entries(nodes)) {
      const choices = node?.choices;
      if (!Array.isArray(choices)) {
        out.push(`restDialogues 营火 ${zone}/${nodeId}: choices 不是数组`);
        continue;
      }
      choices.forEach((c, i) => {
        const path = `restDialogues 营火 ${zone}/${nodeId}.choices[${i}]`;
        const has = Boolean(c?.next);
        const act = Boolean(c?.action);
        if (!has && !act) out.push(`${path}: 既没有 next 也没有 action —— 点它只会关掉对话框`);
        if (has && act) out.push(`${path}: next 与 action 同时给了，运行时只认 action，next 是白写的`);
        if (has && !ids.has(c.next)) {
          out.push(`${path}: next 指向 "${c.next}"，但 ${zone} 这棵树里没有这个节点（可用：${[...ids].sort().join(' / ')}）`);
        }
        if (has) referenced.add(c.next);
      });
    }
    for (const id of ids) {
      if (id !== 'start' && !referenced.has(id)) {
        out.push(`restDialogues 营火 ${zone}/${id}: 没有任何选择通向它，玩家看不到这一节点`);
      }
    }
    // 第四、五条：树与 NPC 定义得成对。改前运行时那一侧写的是 `def?.accent ?? '#c9a962'`，
    // 缺定义不报错 —— 它拿**世界之锚那座的配色**给一座新营火说话（W-B4 切片1 把它换成开机点名，
    // 那一侧现在只留渲染器自己的默认色一处，见 `ui/DialogCGRenderer.js` 的 `CG_DEFAULT_ACCENT`）
    const def = REST_NPC_DEFS[zone];
    if (!def) {
      out.push(`restDialogues 营火 ${zone}: REST_NPC_DEFS 里没有这一座（说话人名与配色无处可取）`);
    } else {
      for (const field of ['name', 'accent']) {
        if (typeof def[field] !== 'string' || !def[field]) {
          out.push(`restDialogues 营火 ${zone}: NPC 定义的 ${field} 不是非空字符串（对话框与画廊那一行要说的是它）`);
        }
      }
    }
  }
  for (const zone of Object.keys(REST_NPC_DEFS)) {
    if (!table?.[zone]) {
      out.push(`restNpcDefs 营火 ${zone}: 有 NPC 定义却没有对话树（走到火边按下交互键直接开升级面板，那句"愿火护佑"没人说）`);
    }
  }
  return out;
}

/**
 * 对话 CG 预设的整表规则（W-B4 切片1，`invariant` 槽位的第二个使用者）。
 *
 * 这张表的键是 `<营火 id>:<节点 id>` 的复合串，而它的两个读者都比表更"物理"：
 * `game/CgGalleryRegistry.js` 按**每一个键**建一行画廊目录（`id` / `restId` / `nodeId` 由 `split(':')` 得来），
 * `ui/DialogCGRenderer.getPreset` 按节点取预设。于是写错一个节点名不会报错，只会留下两样东西：
 * ① 一行玩家**永远解锁不了**的画廊 —— `side-cg-half`（解锁 40%）与成就 `cg-half`（50%）读的分母正是那张目录；
 * ② 一个渲染不到的节点 —— 它落到"本营火 `start` 那一格"，而 `start` 也在表里，
 *    所以缺了 `start` 的那座营火才会一路落到别人家的画面（改前那条兜底直接写着 `anchor_fire`）。
 *
 * 四条：
 * 1. 键的形状：正好一个冒号，两段都非空；
 * 2. 营火要有树、节点要在那棵树里（孤儿预设 = 画廊里那一行永远灰着）；
 * 3. 每棵树必须有 `<营火>:start`（那是"这一节点没有自己的预设"时唯一可落的那一格）；
 * 4. 三层名单（基础 / 扩写 / 致敬）互不相交 —— spread 的同名键是后层静默盖掉前层。
 *
 * 刻意**不**要求的：每个节点都得有自己的预设。今天 77 个节点里 13 个共享本营火的 `start`，
 * 那是有意的省（同一座火边闲聊不必每句换画），把它判成红只会逼人往表里灌 13 行重复。
 */
export function checkDialogueCgPresets(table) {
  const out = [];
  const covered = new Map();
  for (const key of Object.keys(table ?? {})) {
    const sep = key.indexOf(':');
    const restId = sep > 0 ? key.slice(0, sep) : null;
    const nodeId = sep > 0 ? key.slice(sep + 1) : null;
    if (!restId || !nodeId || nodeId.includes(':')) {
      out.push(`restDialogueCg 的键 "${key}": 不是 "<营火 id>:<节点 id>" 的形状`);
      continue;
    }
    const tree = REST_DIALOGUES[restId];
    if (!tree) {
      out.push(`restDialogueCg "${key}": 营火 "${restId}" 没有对话树（画廊里有这一行，玩家走到哪儿都触发不了它）`);
      continue;
    }
    if (!tree.nodes?.[nodeId]) {
      out.push(`restDialogueCg "${key}": ${restId} 那棵树里没有节点 "${nodeId}"（可用：${Object.keys(tree.nodes ?? {}).sort().join(' / ')}）`);
      continue;
    }
    if (!covered.has(restId)) covered.set(restId, new Set());
    covered.get(restId).add(nodeId);
  }
  for (const restId of Object.keys(REST_DIALOGUES)) {
    if (!covered.get(restId)?.has('start')) {
      out.push(`restDialogueCg: ${restId} 没有 "<营火>:start" 那一格（节点没有自己的预设时无处可落）`);
    }
  }
  const layers = [
    ['基础', Object.keys(REST_DIALOGUE_CG_BASE)],
    ['扩写', Object.keys(REST_DIALOGUE_CG_EXTRA)],
    ['致敬', Object.keys(REST_DIALOGUE_CG_POP)],
  ];
  for (const [name, keys] of layers) {
    for (const [otherName, otherKeys] of layers) {
      if (otherName === name) continue;
      for (const key of keys) {
        if (otherKeys.includes(key)) {
          out.push(`restDialogueCg "${key}": ${name}层与 ${otherName}层给了同一个键（spread 之后只剩后写那一层，前一层是白写的）`);
        }
      }
    }
  }
  return out;
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

/**
 * 装备表的整表不变式（W-B5 切片1）。两件事是字段词汇表达不了的：
 *
 * 1. **`mods` 的键**。`record` 只保证"是个对象"，而装备给的点数最后要落进 `PlayerStats` 那五个
 *    属性（`vigor / endurance / strength / arcane / mind`）。多写一个键不会报错，只会让那一点
 *    属性没有主人 —— 装备说明上写着"+3 幸运"而玩家身上什么都不变。
 * 2. **可达性**。某个槽位一条基表都没有、或某一档稀有度要 3 条词缀而它够不到的词缀不足 3 枚，
 *    都是 `rollGear` 里"静默少给"的那一支：不报错，玩家捡到的装备就是比表上说的少一条。
 */
const gearModErrors = (mods, path) => {
  const out = [];
  const entries = Object.entries(mods ?? {});
  if (!entries.length) return [`${path}: mods 不许是空对象（这件装备什么都不给）`];
  for (const [stat, n] of entries) {
    if (!GEAR_STATS.includes(stat)) {
      out.push(`${path}.${stat}: 不是装备能改的属性（可用：${GEAR_STATS.join(' / ')}）`);
    }
    if (!Number.isInteger(n) || n < 1) {
      out.push(`${path}.${stat}: 期望不小于 1 的整数，实际 ${JSON.stringify(n)}`);
    }
  }
  return out;
};

export function checkGearBases(table) {
  const out = [];
  const covered = new Set();
  (table ?? []).forEach((row, i) => {
    out.push(...gearModErrors(row?.mods, `gearBases[${i}].mods`));
    if (row?.slot) covered.add(row.slot);
  });
  for (const slot of GEAR_SLOTS) {
    if (!covered.has(slot)) out.push(`gearBases: 槽位 "${slot}" 一条基表都没有 —— 它永远掉不出来`);
  }
  return out;
}

export function checkGearAffixes(table) {
  const out = [];
  (table ?? []).forEach((row, i) => {
    out.push(...gearModErrors(row?.mods, `gearAffixes[${i}].mods`));
  });
  return out;
}

/**
 * 主线表（`objectives`）的整表不变式（W-B3 切片3）+ **判据闭包**（切片6）。
 *
 * `checkObjectiveTable` 管的是**行与行之间**的关系；`checkQuestFactClosure` 管的是
 * **判据与账本之间**的关系 —— 判据读的那一格有没有人写。两半都必须过，
 * 所以这里把两半合成一个 invariant（一个槽位只放一个函数）。
 */
export function checkObjectivesTable(table, ctx) {
  return [...checkObjectiveTable(table, ctx), ...checkQuestFactClosure()];
}

/**
 * 主线表（`objectives`）的整表不变式（W-B3 切片3）。
 *
 * 字段词汇表管到"这一格写得对不对"为止；下面五条都是**跨行**的关系，而它们在游戏里的
 * 表现全都不报错：
 * 1. **章节号沿表只升不降**。`chapter` 说的是"拿这一步时玩家在第几章"，而 sequencer 是按
 *    表序走的：夹一行章节回退的进去，玩家会在第 4 章看到"Chapter 2 进行中"。
 * 2. **门控行的位置**。`chapterGateAfter(id)` 读的是"紧跟在这一步后面的那一行"，
 * 所以在役表不再自己抄一份"哪一步开哪一章"（那是四行 `finished?.id === …`）。
 *    插一行、换序、或把 `branchTo` 指去别处，都会让翻转静默失踪 —— 这条钉住位置这个前提。
 * 3. **开新章的门控必须喊话**（`announce`），且喊的那一章就是它开的那一章（`chapter`）；
 *    不开新章的那一格（最后一道门）不许多喊 —— 喊了而章节没动，玩家看到的是一句对不上 HUD 的话。
 * 4. **`requires` 的生产者必须在前头**。这一格今天没有运行时读者 —— 在役的是按表序走的
 *    `QuestSystem`，会读 `requires` 的 `ObjectiveEngine` 已在 W-B3 切片4 删除。所以它的语义就是
 *    这条不变式，加上 `tests/mainline-requires.test.js` 那条走查：按表序走到第 k 行时，
 *    第 k 行声明的前置必须已经成立。少了这两道杠，"要一件还没人做的事"不会报错，
 *    只会让表上写的资格变成装饰。
 * 5. **`branchTo` 只能指向紧跟其后的那一行**（就是第 2 条的反面）。
 */
export function checkObjectiveTable(table) {
  const out = [];
  const rows = Array.isArray(table) ? table : [];
  /** flag → 第一次设它的那一行（值一起记着：`flags: { x: false }` 也是一种设置） */
  const producers = new Map();
  rows.forEach((row, i) => {
    const path = `objectives[${i}]("${row?.id ?? '(无 id)'}")`;
    const prev = rows[i - 1];
    const gate = row?.type === 'chapter-gate';
    if (gate) {
      if (row.autoComplete !== true) {
        out.push(`${path}: chapter-gate 必须写 autoComplete: true —— 玩家对这一格无事可做，`
          + '不自动过就是主线在这儿断掉');
      }
      if (prev?.chapter !== row.chapter) {
        if (!row.announce) {
          out.push(`${path}: 这一格把玩家带进第 ${row.chapter} 章（上一行还是第 ${prev?.chapter} 章），`
            + '所以必须写 announce —— 开章要对玩家喊的那一句由这一格说话');
        } else if (!String(STRINGS_ZH[row.announce] ?? row.announce).startsWith(`Chapter ${row.chapter}`)) {
          // W-D2 切片16j：`announce` 存的是**文案键** —— 章节判据要读**展开后**的那一句，
          // 否则键名（`obj_ch1_complete_announce`）永远不以 "Chapter " 开头。
          out.push(`${path}: announce「${row.announce}」喊的不是第 ${row.chapter} 章`
            + '（chapter 说玩家进入哪一章，两句必须同一章）');
        }
      } else if (row.announce) {
        out.push(`${path}: chapter 与上一步同为第 ${row.chapter} 章（没有开新章），却写着 announce`
          + ' —— 喊了等于什么都不翻，玩家会看到一句对不上 HUD 的话');
      }
      if (!prev || prev.type === 'chapter-gate') {
        out.push(`${path}: 门控行前面必须紧跟一个玩家能做的一步（chapterGateAfter 按位置读）`);
      } else if (prev.branchTo !== row.id) {
        out.push(`${path}: 前一步 "${prev.id}" 的 branchTo 是 ${JSON.stringify(prev.branchTo ?? null)}，`
          + `没指回这一格 —— chapterGateAfter 靠位置认领，branchTo 与位置对不上时翻章会静默失踪`);
      }
    } else {
      if (row?.announce !== undefined) out.push(`${path}: announce 只有 chapter-gate 那一族才有`);
      if (row?.autoComplete !== undefined) out.push(`${path}: autoComplete 只有 chapter-gate 那一族才有`);
      if (row?.branchTo && rows[i + 1]?.id !== row.branchTo) {
        out.push(`${path}: branchTo "${row.branchTo}" 不是紧跟其后的那一行`
          + (rows[i + 1]?.id ? `（下一行是 "${rows[i + 1].id}"）` : '（它已经是最后一行）'));
      }
      // 切片3a：地下城入口的路点不再由 `game/QuestSystem.js` 手抄，而是按 `dungeonId`
      // 问副本名册。少这一格的症状以前是"安静地没有箭头"，现在会在指路时抛 ——
      // 所以把它挡在开机：`type: 'dungeon'` 的行必须认领一座真实存在的副本。
      if (row?.type === 'dungeon' && !row.dungeonId) {
        out.push(`${path}: type 是 dungeon 却没写 dungeonId —— 地下城路点要按 id 问 \`content/dungeons.js\`，`
          + '缺这一格会在玩家走到这一步时当场抛（`DUNGEON_IDS` 也由这一格推导）');
      }
    }
    for (const [flag, want] of Object.entries(row?.requires ?? {})) {
      const p = producers.get(flag);
      if (!p) {
        out.push(`${path}: requires.${flag} 在这一行之前没有任何一步的 flags 设过它`
          + ' —— 在役链按表序走，走到这一行时那件前置永远不会已经成立');
      } else if (p.value !== want) {
        out.push(`${path}: requires.${flag} 要 ${JSON.stringify(want)}，`
          + `但 "${p.id}" 那行设的是 ${JSON.stringify(p.value)}`);
      }
    }
    for (const [flag, value] of Object.entries(row?.flags ?? {})) {
      if (!producers.has(flag)) producers.set(flag, { id: row.id, value });
    }
    if (prev && Number.isInteger(prev.chapter) && Number.isInteger(row?.chapter)
      && row.chapter < prev.chapter) {
      out.push(`${path}: chapter ${row.chapter} 比上一行 "${prev.id}" 的 ${prev.chapter} 小`
        + ' —— 章节号沿表只升不降（chapter 说的是"拿这一步时玩家在第几章"）');
    }
  });
  return out;
}

/**
 * "这一档要的条数够不够得到" 挂在稀有度那张表上：`invariant` 只拿得到自己那一份表，
 * 规则写在 gearAffixes 一侧就只能查出厂的词缀池 —— 改稀有度的人拿到的将是"没报错的少给"。
 */
export function checkGearRarity(table) {
  const out = [];
  for (const rarity of table ?? []) {
    if (!rarity.affixes) continue;
    const reachable = GEAR_AFFIXES
      .filter((a) => rarityRank(a.minRarity) <= rarityRank(rarity.id)).length;
    if (reachable < rarity.affixes) {
      out.push(`gearRarity: 稀有度 "${rarity.id}" 要 ${rarity.affixes} 条词缀，`
        + `但够得到的只有 ${reachable} 条 —— rollGear 会静默少给`);
    }
  }
  return out;
}

/**
 * 中文名单与两张 id 表必须互相覆盖（W-B5 切片2）。
 *
 * 为什么形状校验拦不住它：`{ t: 'id' }` 只说"这个键像个 id"，说不出"这个 id 在不在装备表里"。
 * 少写一格的表现是提示里出现 `ash-charm`（玩家看得懂中文看不懂 slug），多写一格的表现是
 * 那条名字永远不会出现 —— 两种都不报错，正是 `ref` 那一族换了方向的样子。
 */
/**
 * 槽位名与 `GEAR_SLOTS` **双向**对上（W-B5 切片4）。
 *
 * 为什么这里用 invariant 而不是 `ref`：`ref` 问的是"另一张已注册表里的 id"，而槽位今天没有
 * 自己的表（`GEAR_SLOTS` 是一行数组，没有 `id` 字段可查）。双向名单是同一件事在没有表时的写法：
 * 少一格 = 界面上那一行空白，多一格 = 那个名字永远不会出现。
 */
// gearSlotNames invariant must be defined before CONTENT_TABLES uses it
export function checkGearNames(table, ctx) {
  const out = [];
  const known = new Set([
    ...(ctx.ids.get('gearBases') ?? []),
    ...(ctx.ids.get('gearAffixes') ?? []),
  ]);
  for (const id of Object.keys(table ?? {})) {
    if (!known.has(id)) out.push(`gearNames: "${id}" 不是任何一件装备或词缀的 id（名字永远用不上）`);
  }
  for (const id of known) {
    if (!table?.[id]) out.push(`gearNames: 缺 "${id}" —— 提示里会出现这个 id 本身而不是中文`);
  }
  return out;
}

/**
 * 掉落池的整表规则（W-B5 切片3）：字段词汇说不了的两件事。
 *
 * 1. **兜底那一格必须在**：`poolForZone` 找不到区域时落 `default`，而"找不到"是常态
 *    （走廊、未知区域、以后新加却没列池的区域）。少了这一格，掉落层拿到的是 `undefined` 的池，
 *    表现是"那里的怪什么都不掉"，且不报错。
 * 2. **每件装备都要有人掉得出**：一件基表从所有池里被抹掉，就是永远掉不出的孤儿数据 ——
 *    表里还留着它（词条、名字、颜色都在），玩家却永远见不到。
 */
export function checkGearPools(table, ctx) {
  const out = [];
  const pools = table ?? {};
  if (!Array.isArray(pools[GEAR_POOL_DEFAULT]) || pools[GEAR_POOL_DEFAULT].length === 0) {
    out.push(`gearPools: 缺兜底那一格 "${GEAR_POOL_DEFAULT}" —— 名单外的区域将掉不出任何东西`);
  }
  const reachable = new Set();
  for (const rows of Object.values(pools)) {
    for (const row of rows ?? []) reachable.add(row?.base);
  }
  for (const id of ctx.ids.get('gearBases') ?? []) {
    if (!reachable.has(id)) out.push(`gearPools: "${id}" 不在任何一个池里 —— 这件装备永远掉不出`);
  }
  return out;
}

/**
 * 固定掉落的整表规则（W-B5 切片5），两件事字段词汇说不了：
 *
 * 1. **名册里每只世界 Boss 都得登记一件**：新加一只 Boss 而忘了写，表现是它照常掉，
 *    只是永远少那一件承诺过的奖励 —— 不报错、没有提示，玩家也不知道自己少了什么。
 *    副本 Boss 不在这份名单里（`dungeon-<副本 id>` 是动态前缀，数量随副本表长），
 *    它的键合法性由 `keyRef` 的 `allowPrefix` 走名册那一侧的口径。
 * 2. **档位下限 rare**：Boss 掉一件凡品等于让玩家白跑一趟，而这一格是数据不是算式，
 *    没有任何运行时路径会拦住"以后有人把它改成 common"。
 */
export function checkGearBossDrops(table, ctx) {
  const out = [];
  const drops = table ?? {};
  for (const id of ctx.ids.get('bosses') ?? []) {
    if (!drops[id]) out.push(`gearBossDrops: 名册里的 "${id}" 没有登记固定掉落 —— 它永远少一件承诺过的奖励`);
  }
  for (const id of Object.keys(drops)) {
    const rarity = drops[id]?.rarity;
    if (rarityRank(rarity) < rarityRank('rare')) {
      out.push(`gearBossDrops: "${id}" 的档位是 ${String(rarity)}（至少要 rare —— Boss 掉凡品等于让玩家白跑一趟）`);
    }
  }
  return out;
}

/**
 * 名册与招式表 / 体型表对账（W-B10 切片2）。
 *
 * 形状校验能说"这一格有名字、hp 是正整数"，说不了"这一类到底存不存在"。而普查
 * （`.tmp-20260930/wb10s1-census.mjs` M5）量的正是"存在但没登记"那一侧：副本那条
 * 三元式只点名 `golem` / `drone`，其余一律兜底成「遗城战士」—— 名册 12 类里 9 类
 * 一旦进副本就顶着别人的名字。这里钉住四条：
 * - 名册里的每一类都得在 `ENEMY_MOVE_SETS` 有行：有名字没招式 = 出生落到 `default` 三板斧（B68 那一族）；
 * - 每一类都得在 `BODY_PLANS` 有格：没体型 = 静默套 soldier 的形状，玩家看到的体型与名字对不上；
 * - 反过来，`ENEMY_MOVE_SETS` 里的原生敌人（扣 `boss` / `default`）必须在名册有一格：
 *   少一格的症状不是报错，而是"这一类只能靠调用点手抄名字出生" —— 正是这一片要终结的写法；
 * - 名字两两不重复，且不可攻击的那一类不许写 `damage`（伤害数字会显示却永远不会打出来）。
 */
export const ROSTER_NOT_IDENTITY = ['boss', 'default'];

export function checkEnemyRoster(table) {
  const out = [];
  const rows = table ?? {};
  const 名字 = new Map();
  for (const [id, row] of Object.entries(rows)) {
    const p = `enemyRoster["${id}"]`;
    if (ROSTER_NOT_IDENTITY.includes(id)) {
      out.push(`${p}: "${id}" 不是一类敌人的身份（Boss 走 bossRoster，default 是查不到时的兜底档）`);
    }
    if (!ENEMY_MOVE_SETS[id]) out.push(`${p}: 招式表里没有这一类 —— 出生只会落到 default 三板斧`);
    if (!BODY_PLANS[id]) out.push(`${p}: 体型表里没有这一类 —— 会静默套 soldier 的形状`);
    if (!row?.name) continue;
    if (名字.has(row.name)) {
      out.push(`${p}.name: "${row.name}" 与 enemyRoster["${名字.get(row.name)}"] 重了 —— 同一屏幕里两类敌人叫同一个名字`);
    } else 名字.set(row.name, id);
    if (row.canAttack === false && row.damage !== undefined) {
      out.push(`${p}: 不可攻击（canAttack: false）却写了 damage ${row.damage} —— 那个数字永远不会打出来`);
    }
  }
  for (const id of Object.keys(ENEMY_MOVE_SETS)) {
    if (ROSTER_NOT_IDENTITY.includes(id)) continue;
    if (!rows[id]) out.push(`enemyRoster: 缺 "${id}"（招式表里有这一类，名册却没登记身份 —— 它只能靠调用点手抄名字出生）`);
  }
  return out;
}

/**
 * 副本表的整表关系（W-B10 切片3a）。形状能说"这一格有个颜色"，说不了"五座副本互相分得开"：
 * - **配色两两不同**：B4 的原话是"房间只差配色"—— 如果连副本的颜色都撞了，五座就变成三座；
 * - **名字与门口标签两两不同**：UI 列表、HUD 与传送 prompt 都直接显示它们，重名等于少一座副本；
 * - **`entrance` 与 `exterior` 必须同点**：今天五座都是同一个坐标，这是"门口标记就是交互点"的
 *   成对规则。分开写的症状是玩家在牌子跟前按交互却没反应（两个坐标各有读者：
 *   `buildEntranceMarkers` 读 entrance、`buildExteriorShells` 读 exterior）。
 */
/**
 * 阶段参数表的整表规则（W-B8 切片5）。字段词汇说不了的四件事：
 *
 * 1. **名册里每只世界 Boss 都得有一档**（少一只 = 它悄悄走兜底，与"设计过"看不出区别）；
 * 2. **不许有多余的键**（多一只 = 打错了 id，而那只 Boss 其实在用兜底）；
 * 3. **每只都要有 1/2/3 三档**（缺一档 = 那一档落回 `DEFAULT`，曲线在这里断掉）；
 * 4. **`attackCooldown` 随阶段非增** —— 阶段越高出手越慢是"数值改反了"的典型症状，
 *    而它的表现只是"这只 Boss 越打越软"，不报错。
 */
export function checkBossPhaseTuning(table) {
  const out = [];
  const 表 = table ?? {};
  const 已知 = new Set(BOSS_IDS);

  for (const id of Object.keys(表)) {
    if (!已知.has(id)) out.push(`bossPhaseTuning["${id}"]: 名册里没有这只 Boss —— 打错 id 的话它其实在用兜底`);
  }
  for (const id of BOSS_IDS) {
    const 三档 = 表[id];
    if (!三档) { out.push(`bossPhaseTuning["${id}"]: 名册里有它，这里没有 —— 它会悄悄走兜底`); continue; }
    const 冷却 = [];
    for (const phase of [1, 2, 3]) {
      const 档 = 三档[phase];
      const p = `bossPhaseTuning["${id}"][${phase}]`;
      if (!档) { out.push(`${p}: 缺这一档`); continue; }
      const cd = 档.attackCooldown;
      if (typeof cd !== 'number' || !(cd > 0)) out.push(`${p}.attackCooldown: 要是正数，实际 ${JSON.stringify(cd)}`);
      else 冷却.push([phase, cd]);
      for (const [k, v] of Object.entries(档)) {
        if (k.startsWith('can') && typeof v !== 'boolean') out.push(`${p}.${k}: 开关要是布尔，实际 ${typeof v}`);
      }
    }
    for (let i = 1; i < 冷却.length; i++) {
      if (冷却[i][1] > 冷却[i - 1][1]) {
        out.push(`bossPhaseTuning["${id}"]: ${冷却[i][0]} 阶段的收招间隔(${冷却[i][1]}) 比 ${冷却[i - 1][0]} 阶段(${冷却[i - 1][1]}) 还长 —— 阶段越高越慢，多半是改反了`);
      }
    }
  }
  return out;
}

export function checkDungeons(table) {
  const out = [];
  const rows = Array.isArray(table) ? table : [];
  const 撞 = (字段, 取值) => {
    const 见过 = new Map();
    rows.forEach((row, i) => {
      const v = 取值(row);
      if (v === undefined) return;
      const p = `dungeons[${i}].${字段}`;
      if (见过.has(v)) out.push(`${p}: "${v}" 与 ${见过.get(v)} 撞了 —— 界面上分不出这两座副本`);
      else 见过.set(v, p);
    });
  };
  撞('theme', (r) => r?.theme);
  撞('accent', (r) => r?.accent);
  撞('name', (r) => r?.name);
  撞('mapLabel', (r) => r?.mapLabel);
  撞('exterior.label', (r) => r?.exterior?.label);
  // 试炼不能是空集：`checkAllDungeons` 的形状是"每一座都要清过"，空表上它恒真 ——
  // 全改成 `trial: false` 的症状不是报错，是**第三章开门不需要打任何一座副本**。
  if (rows.length && !rows.some((r) => r?.trial === true)) {
    out.push('dungeons: 没有任何一行 `trial: true` —— 三界试炼成了空集，`checkAllDungeons` 会在零座副本清空的判据上返回真');
  }
  rows.forEach((row, i) => {
    const e = row?.entrance; const x = row?.exterior;
    if (!e || !x) return;
    if (e.x !== x.x || e.z !== x.z) {
      out.push(`dungeons[${i}]("${row.id}"): entrance (${e.x},${e.z}) 与 exterior (${x.x},${x.z}) 不同点 —— `
        + '门口牌子上立着的交互点不是同一个地方（各有读者：`buildEntranceMarkers` / `buildExteriorShells`）');
    }
  });
  return out;
}

/**
 * 副本遭遇表的整表关系（W-B10 切片3b）。字段表能说"这一格有一池子"，说不了这四件事：
 * - **每座副本都得有一格**。缺格的症状不是"少了点内容"而是玩家进得去那座迷宫时当场抛
 *   （`generateMaze` 的第 4 个参数必填）；把这件事交给开机而不是交给门口。
 * - **一池之内同一类只许一行**。写两行的症状是那一类的实际权重悄悄翻倍，而表上看是 3 其实是 6。
 * - **`group.min ≤ max`**。反了不是报错，是编组公式 `min + 摇 (max-min+1)` 里那个区间长度变成
 *   0 或负数 —— 于是整座迷宫一间房都不出怪，玩家走空旷跑到 Boss 面前。
 * - **五张池子两两不同**（按类型集合比，不按字符串比）。这一片的立身之本就是"别让五座打同一场仗"；
 *   抄隔壁那一池是最省事的改法，也是把普查读数（M2：34 / 34 / 33 均匀三分）换个写法留下来。
 * - **不可攻击的那一类不许进池**。名册里的 `dummy` 是训练木人（`canAttack: false`、hp 99999），
 *   把它写进副本池 = 玩家在迷宫里遇见一个打不动也杀不掉的摆设。
 * - **一池之内只许有一个最重**。并列第一等于"这座副本打头的是谁"没答案，实测主类会跟着
 *   种子区间翻 —— 这一条不是设想，是切片3b 第一次跑分布读数时量出来的（墓穴 4/4 并列，
 *   200 个种子的主类落到了 wraith 而不是表上排在最前的 soldier）。
 */
export function checkDungeonEncounters(table) {
  const out = [];
  const rows = table ?? {};
  const 支撑 = (row) => [...new Set((row?.pool ?? []).map((e) => e?.type))].sort().join(' ');
  for (const [id, row] of Object.entries(rows)) {
    const p = `dungeonEncounters["${id}"]`;
    const seen = new Set();
    for (const [i, e] of (row?.pool ?? []).entries()) {
      const key = `${p}.pool[${i}]`;
      if (seen.has(e?.type)) out.push(`${key}: "${e?.type}" 在同一池里写了不止一行 —— 它的实际权重是各行相加，表上看不出来`);
      else seen.add(e?.type);
      const 类 = ENEMY_ROSTER[e?.type];
      if (类 && 类.canAttack === false) {
        out.push(`${key}: "${e?.type}"（${类.name}）不可攻击，不能进副本池 —— 玩家会遇到一个打不掉的摆设`);
      }
    }
    const g = row?.group;
    if (g && g.min > g.max) {
      out.push(`${p}.group: min ${g.min} > max ${g.max} —— 编组区间是空的，整座迷宫一间房都不会出怪`);
    }
    // 并列最重 = 表上答不出"这一座打头的是谁"。这一条不是设想：切片3b 第一次跑分布读数时，
    // 墓穴的 soldier 与 wraith 都写 4，200 个种子的实测主类是 wraith（4168 对 4121 —— 一枚硬币），
    // 换一个种子区间就会翻过去。第⑤层要断言"实测主类 == 表上权重最大者"，那张表就必须只有一个第一。
    const 池 = row?.pool ?? [];
    const 最重 = Math.max(...池.map((e) => e?.weight ?? 0));
    const 并列 = 池.filter((e) => e?.weight === 最重);
    if (并列.length > 1) {
      out.push(`${p}: ${并列.map((e) => `"${e.type}"`).join(' / ')} 并列最重（各 ${最重}）—— `
        + '这一座打头的是谁表上答不出来，而实测主类会跟着种子区间漂');
    }
  }
  const 缺 = DUNGEON_IDS.filter((id) => !rows[id]);
  if (缺.length) {
    out.push(`dungeonEncounters: 这些副本没有遭遇格（${缺.join(' / ')}）—— 玩家进那座迷宫时 generateMaze 会当场抛，该在这里红`);
  }
  const 撞 = new Map();
  for (const [id, row] of Object.entries(rows)) {
    const v = 支撑(row);
    if (!v) continue;
    if (撞.has(v)) out.push(`dungeonEncounters["${id}"].pool: 与 dungeonEncounters["${撞.get(v)}"] 是同一批敌人（${v}）—— 这两座副本打的是同一场仗`);
    else 撞.set(v, id);
  }
  return out;
}
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
