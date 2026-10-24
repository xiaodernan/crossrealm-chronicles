/**
 * 技能锁因引用完整性（W-D2 切片44）。
 *
 * ## 这一片解决什么
 *
 * 切片43 把 13 条锁因搬进双表时盘点出：`skillTrees.js` 的 `lock` 引用着**八族** id
 * （Boss / 区域 / 击杀类型 / 效果 / 支线 / 物品 / 成就 / 剧情旗标），其中四族**没有生产者**。
 * 更深一层的根因已由切片48 修掉：四条元锁因读的 `quests.stats.{questsCompleted,
 * achievementsUnlocked,itemsCollected,storyFlags}` 四只桶原先**不在账本形状里**，现已进
 * `emptyStats()` 并经 `stats-changed` 从 PlayerStats 镜像（接线由
 * `tests/meta-lock-wiring.test.js` 钉着）。切片49 补上 `champion-of-hub` 成就（生产者
 * 随之接上：解锁即入账）、切片50 补上 `side-lost-scholar` 支线（完成即入账），今天剩下
 * 的死锁全是**内容缺失**：`void-resonance-shard` 物品 / `void-chronicle-read` 旗标都没有
 * 本体或生产者。
 * 症状是 B36 那一族：**那一格看起来有门，其实永远敞不开** —— 玩家在升级面板看到
 * "需收集 3 个 void-resonance-shard (0/3)"直到关服。同类已修的有三处：`s-combo` 的
 * `kills: { type: 'normal' }`（名册里没有 `normal` 这一类，`stats.kills` 按敌人真实 type
 * 记账，`Enemy` 构造器把无 type 的敌人兜底成 `'soldier'`）—— 切片47 修成 `'soldier'`，
 * 死锁清单随之缩到四处；切片49 补上 `champion-of-hub` 成就、切片50 补上
 * `side-lost-scholar` 支线，再缩到两处。
 *
 * ## 机制
 *
 * 不静默造内容（成就 / 支线 / 物品 / 旗标是设计决策，§9 ADR 留名），也不让新漂移再发生：
 * 本门禁把**当前两处死锁钉成一份清单**，计算集合与清单相等才算过 —— 新增一处悬空引用
 * 当场红；修掉一处也必须来改这份清单（刻意的动作，不是顺手）。
 *
 * ## 用例分四层
 * ① 结构腿：lock 的键集合与 getStoryLockReason 的分支集合双向对齐；
 * ② 活引用腿：有生产者宇宙的六族逐一核身份（Boss / 区域 / 击杀类型 / 效果 / 任务 / 成就）；
 * ③ 死锁清单腿：悬空引用计算集合 == 钉死的两处；
 * ④ 账本生产腿：成就族生产者钉在源码里、物品/旗标两族仍零写入 + 尺子自证。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_BRANCH_IDS, SKILL_EFFECT_KEYS, nodesOf } from '../src/content/skillTrees.js';
import { BOSS_IDS } from '../src/content/bossRoster.js';
import { ZONE_IDS } from '../src/content/ZoneIdentity.js';
import { ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { MAINLINE } from '../src/content/objectives.js';
import { SIDE_QUESTS_ALL } from '../src/content/sideQuests.js';
import { ACHIEVEMENTS } from '../src/game/AchievementSystem.js';
import { ACHIEVEMENTS_EXTRA, ACHIEVEMENTS_POP_CULTURE } from '../src/content/achievements.js';
import { installWindowShim } from './helpers/enemyHarness.js';

installWindowShim();

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');

/** 全部带 lock 的节点：[{ id, lock }] */
const 带锁节点 = () => SKILL_BRANCH_IDS
  .flatMap((b) => nodesOf(b))
  .filter((n) => n.lock)
  .map((n) => ({ id: n.id, lock: n.lock }));

/** 六个有生产者宇宙的族 */
const BOSS宇宙 = new Set(BOSS_IDS);
const 区域宇宙 = new Set(Object.values(ZONE_IDS));
const 效果宇宙 = new Set(SKILL_EFFECT_KEYS);
/** 击杀类型：名册十二余类 + Boss（`Enemy` 的 `type === 'boss'` 那一格） */
const 击杀宇宙 = new Set([...ENEMY_ROSTER_IDS, 'boss']);
const 任务宇宙 = new Set([...MAINLINE.map((r) => r.id), ...SIDE_QUESTS_ALL.map((q) => q.id)]);
const 成就宇宙 = new Set([
  ...ACHIEVEMENTS.map((a) => a.id),
  ...ACHIEVEMENTS_EXTRA.map((a) => a.id),
  ...ACHIEVEMENTS_POP_CULTURE.map((a) => a.id),
]);

/** 这个 lock 引用了哪些没有生产者的 id（`节点|族:id` 形状） */
const 悬空引用 = (id, lock) => {
  const out = [];
  if (lock.boss && !BOSS宇宙.has(lock.boss)) out.push(id + '|boss:' + lock.boss);
  if (lock.bossDefeated && !BOSS宇宙.has(lock.bossDefeated.bossId)) out.push(id + '|bossDefeated:' + lock.bossDefeated.bossId);
  if (lock.zoneReached && !区域宇宙.has(lock.zoneReached.zoneId)) out.push(id + '|zoneReached:' + lock.zoneReached.zoneId);
  if (lock.skillUses && !效果宇宙.has(lock.skillUses.skill)) out.push(id + '|skillUses:' + lock.skillUses.skill);
  if (lock.kills && !击杀宇宙.has(lock.kills.type)) out.push(id + '|kills:' + lock.kills.type);
  if (lock.questComplete && !任务宇宙.has(lock.questComplete.questId)) out.push(id + '|questComplete:' + lock.questComplete.questId);
  if (lock.achievementUnlocked && !成就宇宙.has(lock.achievementUnlocked.achievementId)) out.push(id + '|achievementUnlocked:' + lock.achievementUnlocked.achievementId);
  // 物品与剧情旗标两族：全仓没有 id 宇宙，也没有任何生产者 —— 一律计悬空
  if (lock.itemCollected) out.push(id + '|itemCollected:' + lock.itemCollected.itemId);
  if (lock.storyFlag) out.push(id + '|storyFlag:' + lock.storyFlag.flagId);
  return out;
};

/** 当前死锁清单（改这里 = 刻意动作：要么新内容接了产者，要么确认新漂移） */
const 钉死的死锁 = [
  'r-relic-hunter|itemCollected:void-resonance-shard',
  'r-archivist|storyFlag:void-chronicle-read',
];

/** 这条引用不在钉死的死锁清单里（死锁由 ③ 自己管） */
const 活的 = (id, kind, value) => !钉死的死锁.includes(id + '|' + kind + ':' + value);

/** getStoryLockReason 的分支键（源码里 `if (lock.xxx)` 的那一批） */
const 分支键 = () => {
  const src = 读('src/game/StoryWeaponSkills.js');
  return [...src.matchAll(/if \(lock\.(\w+)/g)].map((m) => m[1]);
};

/* ------------------------------------------------------------------
 * ① 结构腿
 * ------------------------------------------------------------------ */

describe('① 结构腿：lock 键集合与分支集合双向对齐', () => {
  it('表里每个 lock 键都有分支读它', () => {
    const 表里 = new Set(带锁节点().flatMap(({ lock }) => Object.keys(lock)));
    const 分支 = new Set(分支键());
    for (const k of 表里) expect(分支, 'lock.' + k + ' 没有分支读它').toContain(k);
  });

  it('每个分支键表里都出现过（没有为空气写的分支）', () => {
    const 表里 = new Set(带锁节点().flatMap(({ lock }) => Object.keys(lock)));
    for (const k of 分支键()) expect(表里, '分支 lock.' + k + ' 在表里没有用户').toContain(k);
  });

  it('分支恰好十三个（与切片43 的 13 条锁因一一对应）', () => {
    expect(分支键().sort()).toEqual([
      'achievementUnlocked', 'boss', 'bossDefeated', 'chapter', 'itemCollected', 'kills',
      'level', 'loreFragments', 'questComplete', 'skillUses', 'spellCasts', 'storyFlag', 'zoneReached',
    ]);
  });
});

/* ------------------------------------------------------------------
 * ② 活引用腿
 * ------------------------------------------------------------------ */

describe('② 活引用腿：六族引用都指着真实存在的生产者', () => {
  it('Boss 引用都在名册里', () => {
    for (const { id, lock } of 带锁节点()) {
      if (lock.boss && 活的(id, 'boss', lock.boss)) expect(BOSS宇宙, id + ' 的 lock.boss').toContain(lock.boss);
      if (lock.bossDefeated && 活的(id, 'bossDefeated', lock.bossDefeated.bossId)) expect(BOSS宇宙, id + ' 的 lock.bossDefeated.bossId').toContain(lock.bossDefeated.bossId);
    }
  });

  it('区域引用都是登记过的区', () => {
    for (const { id, lock } of 带锁节点()) {
      if (lock.zoneReached && 活的(id, 'zoneReached', lock.zoneReached.zoneId)) expect(区域宇宙, id + ' 的 lock.zoneReached.zoneId').toContain(lock.zoneReached.zoneId);
    }
  });

  it('效果引用都是 SKILL_EFFECT_CONSUMERS 登记过的效果', () => {
    for (const { id, lock } of 带锁节点()) {
      if (lock.skillUses && 活的(id, 'skillUses', lock.skillUses.skill)) expect(效果宇宙, id + ' 的 lock.skillUses.skill').toContain(lock.skillUses.skill);
    }
  });

  it('击杀类型都在名册里（或 Boss 那一格）', () => {
    for (const { id, lock } of 带锁节点()) {
      if (lock.kills && 活的(id, 'kills', lock.kills.type)) expect(击杀宇宙, id + ' 的 lock.kills.type').toContain(lock.kills.type);
    }
  });

  it('支线引用都在主线或支线表里', () => {
    for (const { id, lock } of 带锁节点()) {
      if (lock.questComplete && 活的(id, 'questComplete', lock.questComplete.questId)) expect(任务宇宙, id + ' 的 lock.questComplete.questId').toContain(lock.questComplete.questId);
    }
  });

  it('成就引用都在三张成就表里', () => {
    for (const { id, lock } of 带锁节点()) {
      if (lock.achievementUnlocked && 活的(id, 'achievementUnlocked', lock.achievementUnlocked.achievementId)) expect(成就宇宙, id + ' 的 lock.achievementUnlocked.achievementId').toContain(lock.achievementUnlocked.achievementId);
    }
  });
});

/* ------------------------------------------------------------------
 * ③ 死锁清单腿
 * ------------------------------------------------------------------ */

describe('③ 死锁清单腿：悬空引用计算集合 == 钉死的两处', () => {
  it('一处不多（新增悬空引用当场红）', () => {
    const 算出 = 带锁节点().flatMap(({ id, lock }) => 悬空引用(id, lock)).sort();
    const 多出来的 = 算出.filter((x) => !钉死的死锁.includes(x));
    expect(多出来的, '出现了清单外的悬空引用 —— 新内容要先接生产者，或确认后补进清单').toEqual([]);
  });

  it('一处不少（修掉死锁也要来改清单，不许静默）', () => {
    const 算出 = new Set(带锁节点().flatMap(({ id, lock }) => 悬空引用(id, lock)));
    const 已修好 = 钉死的死锁.filter((x) => !算出.has(x));
    expect(已修好, '清单里的死锁已不存在 —— 请更新钉死的死锁清单').toEqual([]);
  });

  it('s-combo 的击杀类型是名册里的 soldier（切片47 修掉 normal 死锁）', () => {
    const combo = 带锁节点().find((n) => n.id === 's-combo');
    expect(combo.lock.kills).toEqual({ type: 'soldier', count: 20 });
    expect(ENEMY_ROSTER_IDS).toContain('soldier');
  });

  it('清单本身形状正确：两处，覆盖两个节点', () => {
    expect(钉死的死锁.length).toBe(2);
    expect(new Set(钉死的死锁.map((x) => x.split('|')[0])).size).toBe(2);
  });
});

/* ------------------------------------------------------------------
 * ④ 账本生产腿 + 尺子自证
 * ------------------------------------------------------------------ */

describe('④ 账本生产腿：成就族生产者与物品/旗标两族的零写入钉在源码里', () => {
  const 全部源码 = () => {
    const out = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.js')) out.push([p, readFileSync(p, 'utf8')]);
      }
    };
    walk(join(ROOT, 'src'));
    return out;
  };

  it('achievementsUnlocked 的生产者只能有一处：AchievementSystem.unlock（切片48 接上）', () => {
    const 调用点 = [];
    for (const [p, src] of 全部源码()) {
      if (p.endsWith('PlayerStats.js')) continue;
      if (src.includes('onAchievementUnlocked(')) 调用点.push(p.replace(/\\/g, '/') + ' -> onAchievementUnlocked');
    }
    expect(调用点.length, 'achievementsUnlocked 的生产者只能有 unlock 这一处').toBe(1);
    expect(调用点[0].replace(/\\/g, '/')).toMatch(/src\/game\/AchievementSystem\.js -> onAchievementUnlocked$/);
  });

  it('itemsCollected / storyFlags 仍零写入：两族死锁还没接生产者', () => {
    const 调用点 = [];
    for (const [p, src] of 全部源码()) {
      if (p.endsWith('PlayerStats.js')) continue;
      for (const m of ['onItemCollected(', 'onStoryFlag(']) {
        if (src.includes(m)) 调用点.push(p.replace(/\\/g, '/') + ' -> ' + m);
      }
    }
    expect(调用点, '有人开始写这两个桶了 —— ③ 的死锁清单要跟着缩').toEqual([]);
  });

  it("'normal' 不是任何敌人的 type：名册里没有， Enemy 兜底是 'soldier'", () => {
    expect(ENEMY_ROSTER_IDS).not.toContain('normal');
    expect(读('src/combat/Enemy.js')).toContain("config.type ?? 'soldier'");
  });

  it('尺子自证：悬空判据抓得到假引用、放得过真引用', () => {
    expect(悬空引用('x', { boss: 'nobody' })).toEqual(['x|boss:nobody']);
    expect(悬空引用('x', { boss: 'shadow-warden', chapter: 2 })).toEqual([]);
    expect(悬空引用('x', { itemCollected: { itemId: 'anything' } })).toEqual(['x|itemCollected:anything']);
    expect(悬空引用('x', { kills: { type: 'soldier', count: 1 } })).toEqual([]);
  });
});
