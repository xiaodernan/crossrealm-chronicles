/**
 * 元锁因账本接线（W-D2 切片48；切片49/50/51/52 各增补一条死锁接驳证明）。
 *
 * ## 这一片防的是什么
 *
 * `game/StoryWeaponSkills.js` 的四条元锁因（questComplete / achievementUnlocked /
 * itemCollected / storyFlag）读的是 `game.quests.stats` 里的四只桶。改前这四只桶
 * **不在账本形状里**（`emptyStats()` 没有这四个键）—— 分支里的 `q?.stats?.X?.[id] ?? 0`
 * 恒等于 0：那四格锁因在真实游戏里永远不可达。refs 门禁 ③ 腿只核 id 宇宙、不核账本
 * 形状，所以一直绿着 —— 本片把根因修掉，再用这道门禁钉住接线。
 *
 * ## 接线口径
 *
 * 真源在 `PlayerStats`（W-B6 切片5 起就有这四只桶与四个写入口）：它每次写都派发
 * `stats-changed`，`STAT_EVENTS` 的 stats-changed 记账函数把快照里的四格镜像进任务
 * 账本。四格进 `STAT_READINGS`（不落盘）—— 读档时 `SaveSystem` 复原 PlayerStats 之后
 * 再推一次 stats-changed，投影自动回填，与 `level` / `mind` 同一口径。成就那一族的
 * 生产者是 `AchievementSystem.unlock()`：解锁即入账；顺带把 `ach.game` 反引补上
 *（它自仓库重建起从没被赋过值，cg / codex / echo 三族成就的统计监听因此全是死的）。
 *
 * ## 用例分四层
 * ① 形状腿：emptyStats 有四桶、STAT_READINGS 收录它们；
 * ② 镜像腿：stats-changed 把四格照搬进账本（函数级 + QuestSystem 事件级）；
 * ③ 端到端腿：真 AchievementSystem 解锁 -> PlayerStats 桶 -> 账本；四条元分支各造
 *    一条"桶满放行 / 桶空拦截"的读数；另有四条接驳证明（champion-of-hub 五首领 /
 *    side-lost-scholar 六条笔记 / void-chronicle-read 秘典全解锁 / void-resonance-shard
 *    三座宝箱 -> 各自入账 -> 锁因放行）；
 * ④ 静态钉腿：Game.js 反引与 unlock 入账两处焊点钉在源码里。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installWindowShim } from './helpers/enemyHarness.js';
import { emptyStats, STAT_READINGS, applyStatEvent, statsToJSON } from '../src/content/objectives.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { ACHIEVEMENTS, AchievementSystem } from '../src/game/AchievementSystem.js';
import { PlayerStats } from '../src/game/PlayerStats.js';
import { LoreCodexSystem } from '../src/game/LoreCodexSystem.js';
import { getStoryLockReason } from '../src/game/StoryWeaponSkills.js';
import * as THREE from 'three';
import { CollectibleManager } from '../src/world/CollectibleManager.js';
import { setLanguage } from '../src/engine/i18n.js';

installWindowShim();

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');

const 四桶 = ['questsCompleted', 'achievementsUnlocked', 'itemsCollected', 'storyFlags'];

let win;
let dialog;

function dispatch(name, detail) {
  win.dispatchEvent(new CustomEvent(name, { detail }));
}

beforeEach(() => {
  installWindowShim();
  win = globalThis.window;
  dialog = { toast() {}, play() {} };
  setLanguage('zh');
});

afterEach(() => {
  globalThis.window = undefined;
  globalThis.CustomEvent = undefined;
  win = undefined;
});

/* ------------------------------------------------------------------
 * ① 形状腿
 * ------------------------------------------------------------------ */

describe('① 形状腿：四只元桶在账本形状里，且是读数（不落盘）', () => {
  it('emptyStats() 四只桶都在，初值都是空对象', () => {
    const s = emptyStats();
    for (const k of 四桶) {
      expect(s, k + ' 不在账本形状里').toHaveProperty(k);
      expect(s[k], k + ' 初值该是空对象').toEqual({});
    }
  });

  it('四只桶都在 STAT_READINGS：镜像不落盘，真源是 PlayerStats', () => {
    for (const k of 四桶) expect(STAT_READINGS, k + ' 没进 STAT_READINGS').toContain(k);
    const 落盘 = statsToJSON(emptyStats());
    for (const k of 四桶) expect(落盘, k + ' 不该落盘').not.toHaveProperty(k);
  });
});

/* ------------------------------------------------------------------
 * ② 镜像腿
 * ------------------------------------------------------------------ */

describe('② 镜像腿：stats-changed 把四格照搬进账本', () => {
  it('函数级：applyStatEvent 直接镜像', () => {
    const s = emptyStats();
    applyStatEvent(s, 'stats-changed', {
      level: 7, mind: 3,
      questsCompleted: { 'side-x': 2 },
      achievementsUnlocked: { 'first-blood': 1 },
      itemsCollected: { 'void-resonance-shard': 3 },
      storyFlags: { 'void-chronicle-read': 1 },
    });
    expect(s.level).toBe(7);
    expect(s.questsCompleted).toEqual({ 'side-x': 2 });
    expect(s.achievementsUnlocked).toEqual({ 'first-blood': 1 });
    expect(s.itemsCollected).toEqual({ 'void-resonance-shard': 3 });
    expect(s.storyFlags).toEqual({ 'void-chronicle-read': 1 });
  });

  it('事件级：QuestSystem 监听 stats-changed 后账本跟上（浅拷贝，不握同一份对象）', () => {
    const qs = new QuestSystem(dialog);
    const 快照 = {
      questsCompleted: { 'side-x': 1 }, achievementsUnlocked: { a: 1 },
      itemsCollected: { i: 1 }, storyFlags: { f: 1 },
    };
    dispatch('stats-changed', 快照);
    expect(qs.stats.questsCompleted).toEqual({ 'side-x': 1 });
    expect(qs.stats.achievementsUnlocked).toEqual({ a: 1 });
    expect(qs.stats.itemsCollected).toEqual({ i: 1 });
    expect(qs.stats.storyFlags).toEqual({ f: 1 });
    expect(qs.stats.questsCompleted).not.toBe(快照.questsCompleted);
  });
});

/* ------------------------------------------------------------------
 * ③ 端到端腿
 * ------------------------------------------------------------------ */

describe('③ 端到端腿：成就解锁入账，四条元分支桶满放行、桶空拦截', () => {
  it('AchievementSystem 解锁 -> PlayerStats 桶 -> stats-changed -> QuestSystem 账本', () => {
    const qs = new QuestSystem(dialog);
    const stats = new PlayerStats();
    const ach = new AchievementSystem(dialog);
    ach.game = { stats };
    ach.stats.kills = 1;
    ach.checkAll();
    expect(stats.achievementsUnlocked['first-blood'], '解锁没写进 PlayerStats 桶').toBe(1);
    expect(qs.stats.achievementsUnlocked['first-blood'], '账本没镜像到').toBe(1);
  });

  const 壳 = (桶) => ({
    quests: { chapter: 5, stats: { ...emptyStats(), ...桶 } },
    storyJournal: { getCounts: () => ({ fragment: 99 }) },
  });

  it('s-champion：成就桶空着时报锁因（带显示名），满了放行', () => {
    expect(getStoryLockReason(壳({}), 's-champion')).toMatch(/枢纽冠军/);
    expect(getStoryLockReason(壳({ achievementsUnlocked: { 'champion-of-hub': 1 } }), 's-champion')).toBeNull();
  });

  it('champion-of-hub 接驳（切片49）：五首领击败 -> 成就解锁 -> 入账 -> s-champion 放行', () => {
    const stats = new PlayerStats();
    const ach = new AchievementSystem(dialog);
    ach.game = { stats };
    expect(ACHIEVEMENTS.some((a) => a.id === 'champion-of-hub'), '成就表里没有 champion-of-hub').toBe(true);
    expect(ach.unlocked.has('champion-of-hub'), '出厂就该没解锁').toBe(false);
    for (const bossId of ['shadow-warden', 'archmagus', 'singularity-herald', 'void-chronarch']) {
      dispatch('enemy-defeated', { bossId });
    }
    expect(ach.unlocked.has('champion-of-hub'), '四位首领就放水了').toBe(false);
    dispatch('enemy-defeated', { bossId: 'chaos-overlord' });
    expect(ach.unlocked.has('champion-of-hub'), '五首领齐了却没解锁').toBe(true);
    expect(stats.achievementsUnlocked['champion-of-hub'], '解锁没写进 PlayerStats 桶').toBe(1);
    expect(getStoryLockReason(壳({ achievementsUnlocked: { 'champion-of-hub': 1 } }), 's-champion')).toBeNull();
  });

  it('r-quest-master：支线完成桶满了放行', () => {
    expect(getStoryLockReason(壳({}), 'r-quest-master')).toMatch(/迷途学者/);
    expect(getStoryLockReason(壳({ questsCompleted: { 'side-lost-scholar': 1 } }), 'r-quest-master')).toBeNull();
  });

  it('r-relic-hunter：物品桶满 3 个才放行', () => {
    expect(getStoryLockReason(壳({ itemsCollected: { 'void-resonance-shard': 2 } }), 'r-relic-hunter')).toMatch(/虚空共鸣碎片/);
    expect(getStoryLockReason(壳({ itemsCollected: { 'void-resonance-shard': 3 } }), 'r-relic-hunter')).toBeNull();
  });

  it('r-archivist：剧情旗标桶满了放行', () => {
    expect(getStoryLockReason(壳({}), 'r-archivist')).toMatch(/读罢虚空编年史/);
    expect(getStoryLockReason(壳({ storyFlags: { 'void-chronicle-read': 1 } }), 'r-archivist')).toBeNull();
  });

  it('void-chronicle-read 接驳（切片51）：秘典全解锁 -> 旗标入账 -> r-archivist 放行', () => {
    const stats = new PlayerStats();
    const codex = new LoreCodexSystem({ dialog, stats });
    // 先解锁十一条（差 dungeon-clear 那条）：还没读罢编年史，旗标不落
    for (const id of ['rest-hub-souls', 'rest-hub-gallery', 'rest-fantasy-boss1', 'rest-void-hidden', 'rest-hub-rematch']) {
      dispatch('journal-entry', { id });
    }
    for (const bossId of ['archmagus', 'singularity-herald', 'chaos-overlord']) {
      dispatch('boss-defeated', { bossId });
    }
    dispatch('combat-execution');
    dispatch('combo-finisher');
    dispatch('cg-unlocked', { id: 'bonus:world-anchor' });
    expect(codex.getStats().unlocked, '用例少派了事件 —— 十一条都没凑齐').toBe(11);
    expect(stats.storyFlags['void-chronicle-read'], '没读罢就落旗标了').toBeUndefined();

    dispatch('dungeon-cleared');
    expect(codex.getStats().percent).toBe(100);
    expect(stats.storyFlags['void-chronicle-read'], '全解锁了却没落旗标').toBe(1);
    expect(getStoryLockReason(壳({ storyFlags: { 'void-chronicle-read': 1 } }), 'r-archivist')).toBeNull();
  });
  it('r-relic-hunter 接驳（切片52）：三座箱开出虚空共鸣碎片 -> 入账 -> 锁因放行；两座仍拦', () => {
    const stats = new PlayerStats();
    const mgr = new CollectibleManager(new THREE.Scene(), { getGroundHeight: () => 0 }, stats, dialog);
    const 带碎片 = mgr.chests.filter((c) => (c.items ?? []).includes('void-resonance-shard'));
    expect(带碎片.length, '带碎片的箱正好三座（fantasy2 / magic2 / space2）').toBe(3);
    for (const c of 带碎片) mgr.open(c);
    expect(stats.itemsCollected['void-resonance-shard'], '三座箱开完该入账 3 枚').toBe(3);
    expect(getStoryLockReason(壳({ itemsCollected: { 'void-resonance-shard': 3 } }), 'r-relic-hunter')).toBeNull();
    expect(getStoryLockReason(壳({ itemsCollected: { 'void-resonance-shard': 2 } }), 'r-relic-hunter')).toMatch(/虚空共鸣碎片/);
  });

});

/* ------------------------------------------------------------------
 * ④ 静态钉腿
 * ------------------------------------------------------------------ */

describe('④ 静态钉腿：两处焊点钉在源码里', () => {
  it('Game.js 把 game 反引给 AchievementSystem（cg/codex/echo 听众与入账都靠它）', () => {
    expect(读('src/core/Game.js')).toContain('this.achievements.game = this;');
  });

  it('AchievementSystem.unlock 解锁即入账 PlayerStats', () => {
    expect(读('src/game/AchievementSystem.js')).toContain('this.game?.stats?.onAchievementUnlocked(a.id);');
  });

  it('objectives.js 的 stats-changed 记账函数镜像四格', () => {
    const src = 读('src/content/objectives.js');
    for (const k of 四桶) expect(src, k + ' 的镜像行没了').toContain('s.' + k + ' = { ...d.' + k + ' };');
  });
});
