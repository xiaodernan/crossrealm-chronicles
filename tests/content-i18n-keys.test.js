/**
 * 内容表里的**键字段**必须在中英两表都登记（W-E3 切片10 / 切片11）。
 *
 * ## 为什么要有这道门禁
 *
 * 切片10 往主线里插了三步 ⇒ 顺手加了 9 个文案键 ⇒ **其中 9 个当时根本没写进表**，
 * 而**全套测试一路绿灯** —— 因为既有那道 i18n 门禁只扫两处：
 * `t('…')` 调用与壳页的 `data-i18n` 属性。
 *
 * 而**内容表**（`objectives.js` / `sideQuests.js` / `dungeons.js` / …）里的
 * 键是**字段值**（`title: 'obj_xxx_title'`）—— 既不是 `t()` 调用，也不是 HTML 属性
 * ⇒ **两处都扫不到** ⇒ 缺一个键，玩家的界面上就会出现 `[MISSING: …]`，
 * 而**没有任何一道门禁会红**。
 *
 * ## 口径
 *
 * **显式列出每张表的"键字段"** —— 不靠"长得像键"来猜：内容层里还有 55 个长得像键的
 * 字面量（CG 画廊的 id、遭遇池的 id……），猜的话全是假阳性。
 * 每张表的那些字段的**每一个值**都必须在中英两表里登记 ⇒ 缺一个当场点名。
 *
 * **两类表**：
 * - **行表**：一行里有几个字段是键（`title` / `desc` / `journal` / …）⇒ 逐字段逐值核；
 * - **映射表**：整个对象就是"键 → 键"（`ZONE_NAMES` / `REST_POINT_NAMES`）⇒ 逐值核。
 */
import { describe, it, expect } from 'vitest';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { OBJECTIVES } from '../src/content/objectives.js';
import { SIDE_QUESTS_ALL } from '../src/content/sideQuests.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { ENEMY_ROSTER } from '../src/content/enemies.js';
import { ECHOES } from '../src/content/echoes.js';
import { BOSS_ROSTER } from '../src/content/bossRoster.js';
import { SKILL_TREES } from '../src/content/skillTrees.js';
import { REST_NPC_DEFS } from '../src/content/restNpcDefs.js';
import { REST_POINT_NAMES } from '../src/content/restPointNames.js';
import { ALL_ACHIEVEMENTS_EXTRA } from '../src/content/achievements.js';
import { HELP_SECTIONS_EXTRA } from '../src/content/helpManual.js';
import { CG_GALLERY_BONUS_EXTRA } from '../src/content/cgGallery.js';
import { CUE_CATALOG } from '../src/content/captions.js';
import { ZONE_NAMES } from '../src/content/ZoneIdentity.js';
import { JOURNAL_CATEGORIES } from '../src/game/StoryJournal.js';
import { JOURNAL_EXTRA_TABS } from '../src/ui/JournalTabRegistry.js';
import { BOSS_CINEMATICS } from '../src/cinematic/CinematicManager.js';
import { KEY_LABELS, MOUSE_LABELS, PAD_BUTTON_LABELS } from '../src/content/keyLabels.js';
import { UI_HOTKEY_LABELS } from '../src/content/hotkeys.js';
import { KEY_ACTION_LABELS, PAD_ONLY_ACTION_LABELS } from '../src/content/keybinds.js';

const ZH = new Set(ZH_KEYS);
const EN = new Set(EN_KEYS);

/** 行表：那些字段的值是 i18n 键（`waypoint.label` 这种嵌套路径也认；`barks` 这种数组也认） */
const 行表 = [
  { 名: 'OBJECTIVES（主线目标）', 行: OBJECTIVES, 字段: ['title', 'desc', 'journal'], 嵌套: ['waypoint.label'] },
  { 名: 'SIDE_QUESTS_ALL（支线）', 行: SIDE_QUESTS_ALL, 字段: ['title', 'desc', 'journal'] },
  { 名: 'DUNGEON_DEFS（副本）', 行: DUNGEON_DEFS, 字段: ['name', 'mapLabel'] },
  { 名: 'ENEMY_ROSTER（敌人名册）', 行: Object.values(ENEMY_ROSTER), 字段: ['name'] },
  { 名: 'ECHOES（回声）', 行: ECHOES, 字段: ['title', 'desc'] },
  { 名: 'BOSS_ROSTER（Boss 名册）', 行: BOSS_ROSTER, 字段: ['nameKey', 'shortNameKey'] },
  { 名: 'SKILL_TREES（技能树）', 行: Object.values(SKILL_TREES).flat(), 字段: ['name', 'desc', 'lore'] },
  { 名: 'REST_NPC_DEFS（营火 NPC）', 行: Object.values(REST_NPC_DEFS), 字段: ['name', 'title', 'barks'] },
  { 名: 'ALL_ACHIEVEMENTS_EXTRA（成就）', 行: ALL_ACHIEVEMENTS_EXTRA, 字段: ['title', 'desc'] },
  { 名: 'HELP_SECTIONS_EXTRA（说明书）', 行: HELP_SECTIONS_EXTRA, 字段: ['title', 'body'] },
  { 名: 'CG_GALLERY_BONUS_EXTRA（CG 画廊）', 行: CG_GALLERY_BONUS_EXTRA, 字段: ['caption', 'speaker'] },
  { 名: 'CUE_CATALOG（字幕）', 行: Object.values(CUE_CATALOG), 字段: ['key'] },
  { 名: 'BOSS_CINEMATICS（Boss 过场）', 行: Object.values(BOSS_CINEMATICS), 字段: ['title', 'subtitle', 'lines'] },
  { 名: 'KEY_LABELS（键码显示名）', 行: Object.values(KEY_LABELS).map((v) => ({ v })), 字段: ['v'] },
  { 名: 'MOUSE_LABELS（鼠标显示名）', 行: Object.values(MOUSE_LABELS).map((v) => ({ v })), 字段: ['v'] },
  { 名: 'PAD_BUTTON_LABELS（手柄按钮显示名）', 行: Object.values(PAD_BUTTON_LABELS).map((v) => ({ v })), 字段: ['v'] },
  { 名: 'UI_HOTKEY_LABELS（热键动作名）', 行: Object.values(UI_HOTKEY_LABELS).map((v) => ({ v })), 字段: ['v'] },
  { 名: 'KEY_ACTION_LABELS（游戏键动作名）', 行: Object.values(KEY_ACTION_LABELS).map((v) => ({ v })), 字段: ['v'] },
  { 名: 'PAD_ONLY_ACTION_LABELS（手柄专属动作名）', 行: Object.values(PAD_ONLY_ACTION_LABELS).map((v) => ({ v })), 字段: ['v'] },
];

/** 映射表：整个对象就是"键 → 键" */
const 映射表 = [
  { 名: 'ZONE_NAMES（区名）', 映射: ZONE_NAMES },
  { 名: 'REST_POINT_NAMES（营火名）', 映射: REST_POINT_NAMES },
  { 名: 'JOURNAL_CATEGORIES（日志页签·基础）', 映射: JOURNAL_CATEGORIES },
  { 名: 'JOURNAL_EXTRA_TABS（日志页签·扩展）', 映射: JOURNAL_EXTRA_TABS },
];

/** 取一行里那个字段的值（嵌套路径 / 数组都认） */
function 键值(行, 路径) {
  let v = 行;
  for (const 段 of 路径.split('.')) {
    if (v === null || v === undefined) return undefined;
    v = v[段];
  }
  return v;
}

/** 把一个字段值摊成"可能是键的字符串"们（数组 ⇒ 逐个；非字符串 ⇒ 不算） */
function 摊平(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
  return typeof v === 'string' && v !== '' ? [v] : [];
}

/** 一张表里所有"该登记却没登记"的键（逐条点名）+ 一共扫到了多少个键值（防空转） */
function 核(行们, 字段, 嵌套 = []) {
  const 缺 = [];
  let 扫到 = 0;
  for (const 行 of 行们) {
    for (const f of [...字段, ...嵌套]) {
      for (const v of 摊平(键值(行, f))) {
        扫到 += 1;
        if (!ZH.has(v)) 缺.push(`中文表没有 "${v}"（${f}）`);
        if (!EN.has(v)) 缺.push(`英文表没有 "${v}"（${f}）`);
      }
    }
  }
  return { 缺: [...new Set(缺)], 扫到 };
}

describe('① 内容表里的键字段都登记在表里', () => {
  for (const t of 行表) {
    it(`${t.名}：每个键字段的值都在中英两表里（缺一个 = 玩家界面出现 [MISSING: ]）`, () => {
      const { 缺, 扫到 } = 核(t.行, t.字段, t.嵌套 ?? []);
      expect(缺, `${t.名} 里有键没登记`).toEqual([]);
      // 防空转：字段名写错的话，一个值都扫不到 ⇒ 门禁会一路绿而其实没在管
      expect(扫到, `${t.名} 的键字段一个都没扫到 —— 字段名写错了？`).toBeGreaterThan(0);
    });
  }

  for (const t of 映射表) {
    it(`${t.名}：映射的每一个值都在中英两表里`, () => {
      // 映射表的值**本身就是键** ⇒ 把它包成一行再走同一套核（免得两套写法）
      const 行们 = Object.values(t.映射 ?? {}).map((v) => ({ __值__: v }));
      const { 缺, 扫到 } = 核(行们, ['__值__']);
      expect(缺, `${t.名} 里有键没登记`).toEqual([]);
      expect(扫到, `${t.名} 一个值都没扫到 —— 形状变了吗？`).toBeGreaterThan(0);
    });
  }
});

describe('② 这道门禁会咬（反向控制）', () => {
  it('混一个假键进去，门禁必须点名它（防"扫描永远返回空"）', () => {
    const 假的行 = [{ id: 'x', title: 'obj_根本不存在_xyz', desc: 'obj_也不存在_abc', journal: 'obj_更不存在_def' }];
    const { 缺 } = 核(假的行, ['title', 'desc', 'journal']);
    expect(缺.length, '假键没被点名').toBe(6);
    expect(缺.some((l) => l.includes('obj_根本不存在_xyz'))).toBe(true);
    expect(缺.some((l) => l.includes('英文表没有'))).toBe(true);
  });

  it('真表上跑一遍是空的（反向控制的对照组：不是"扫描恒红"）', () => {
    expect(核(OBJECTIVES, ['title', 'desc', 'journal'], ['waypoint.label']).缺).toEqual([]);
  });

  it('数组字段里的假键也要被点名（`barks` 那种）', () => {
    const { 缺 } = 核([{ barks: ['rest_npc_hub_bark_0', 'rest_npc_根本没有_xyz'] }], ['barks']);
    expect(缺.length, '数组里的假键没被点名').toBe(2);
    expect(缺.some((l) => l.includes('rest_npc_根本没有_xyz'))).toBe(true);
  });
});

describe('③ 两张表逐键对齐（键字段这一层）', () => {
  it('中文表与英文表的键名集合完全一致', () => {
    const 只在中文 = [...ZH].filter((k) => !EN.has(k));
    const 只在英文 = [...EN].filter((k) => !ZH.has(k));
    expect(只在中文, '这些键只在中文表里').toEqual([]);
    expect(只在英文, '这些键只在英文表里').toEqual([]);
  });

  it('两张表的键集合大小一致（防空转）', () => {
    expect(ZH.size).toBeGreaterThan(500);
    expect(ZH.size).toBe(EN.size);
  });

  it('两张表里都没有空串（空文案 = 界面上那一格是空的）', () => {
    const 中文空 = [...ZH].filter((k) => typeof STRINGS_ZH[k] !== 'string' || STRINGS_ZH[k].trim() === '');
    expect(中文空, '这些键的中文文案是空的').toEqual([]);
    const 英文空 = [...EN].filter((k) => typeof STRINGS_EN[k] !== 'string' || STRINGS_EN[k].trim() === '');
    expect(英文空, '这些键的英文文案是空的').toEqual([]);
  });
});
