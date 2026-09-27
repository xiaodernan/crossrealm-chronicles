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
import { ECHOES } from './echoes.js';
import { ZONE_EVENTS_POP, LORE_FRAGMENTS_POP, NPC_LINES_POP } from './ambientLore.js';
import { REST_DIALOGUES } from './restDialogues.js';
import { ACHIEVEMENTS_EXTRA, ACHIEVEMENTS_POP_CULTURE } from './achievements.js';
import { CG_GALLERY_BONUS_EXTRA } from './cgGallery.js';
import { SIDE_QUESTS_POP } from './sideQuests.js';
import { HELP_SECTIONS_EXTRA } from './helpManual.js';
import { FRANCHISE } from './franchises.js';
import {
  GEAR_SLOTS, GEAR_STATS, GEAR_RARITY, GEAR_BASES, GEAR_AFFIXES,
  GEAR_DROP, GEAR_NAMES, GEAR_RARITY_DISPLAY, GEAR_POOLS, GEAR_POOL_DEFAULT, rarityRank,
} from './gear.js';

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
    kind: 'restDialogues',
    note: '营火分支对话树（W-B2 整棵外移）：区域 id → { title, nodes: { 节点 id → 节点 } }',
    shape: 'index',
    table: REST_DIALOGUES,
    keyRef: { of: 'zones' },
    value: {
      t: 'row',
      of: {
        title: { t: 'string' },
        nodes: {
          t: 'map',
          of: {
            t: 'row',
            of: {
              speaker: { t: 'string' },
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
    kind: 'sideQuestsPop',
    note: '致敬向支线任务（W-B2：原 SideQuestPopCulture）',
    shape: 'rows',
    table: SIDE_QUESTS_POP,
    row: {
      id: { t: 'id' },
      title: { t: 'string' },
      desc: { t: 'string' },
      // check 是运行时函数，不参与静态校验
      reward: { t: 'int', min: 0 },
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
 */
export function checkTable(entry, ctx) {
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
 * 营火树的结构不变式（`invariant` 槽位目前唯一的使用者）。
 *
 * 为什么形状校验拦不住它：`RestDialogue._showNode` 开头是 `if (!node) return` ——
 * 写错的 `next` 不报错、不提示，玩家点下那一格只看到对话窗自己关掉。
 * "静默的死选择"正是内容表最典型的坏法，也是眼睛最难发现的那种。
 *
 * 三条：
 * 1. `next` 必须落在**同一棵树的同一区域**里（区域之间不互跳：树按营火取）；
 * 2. 每一格选择要么 `next` 要么 `action`，有且只有一个（运行时先认 action，
 *    两个都给等于 next 白写；两个都不给就是"点了只关窗"那条兜底路径）；
 * 3. 除 `start` 外不许有孤儿节点 —— 没有选择通向它的节点，玩家永远看不到。
 */
export function checkRestDialogueTree(table) {
  const out = [];
  for (const [zone, tree] of Object.entries(table ?? {})) {
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
