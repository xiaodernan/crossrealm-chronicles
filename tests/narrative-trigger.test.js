/**
 * W-B8 切片5：击败 Boss 后叙事技立即白送。
 *
 * 这条用例钉的是**时序契约**：`Boss.die()` 先派 `enemy-defeated`
 * （把对应 Boss 的统计写进任务账本 `quests.stats[BOSS_STAT_KEYS[bossId]]`），
 * 后派 `boss-defeated`；`Game.setupEvents` 在 `boss-defeated` 里重扫
 * `weaponSkills.tryNarrativeUnlocks`。若有人把统计写入挪到 `boss-defeated` 之后，
 * 或把 `tryNarrativeUnlocks` 从该监听里拿掉，这条就会红 —— 它守的不是
 * "tryNarrativeUnlocks 会不会白送"（那在 `skill-trees` 已测），而是
 * "账本在 `boss-defeated` 到达时已经写好"。
 */
import { describe, it, expect } from 'vitest';
import { WeaponSkillTree } from '../src/game/WeaponSkillTree.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { nodesOf } from '../src/content/skillTrees.js';
import { installWindowShim } from './helpers/enemyHarness.js';

const grantIdFor = (boss) =>
  nodesOf('sword').concat(nodesOf('staff'), nodesOf('realm'))
    .find((n) => n.grant?.boss === boss)?.id;

describe('W-B8 切片5：击败 Boss 后叙事技立即白送', () => {
  const build = () => {
    installWindowShim();
    const qs = new QuestSystem({ toast() {}, show() {} });
    const game = {
      quests: qs,
      storyJournal: { getCounts: () => ({ fragment: 0 }), addSilent() {} },
    };
    const t = new WeaponSkillTree({}, { toast() {} }, game);
    // 复刻 Game.setupEvents 的接线：boss-defeated -> 重扫叙事技
    window.addEventListener('boss-defeated', () => { t.tryNarrativeUnlocks(game); });
    return { qs, game, t };
  };

  it('击杀 shadow-warden 后立即白送对应的 boss 叙事技', () => {
    const { qs, t } = build();
    const id = grantIdFor('shadow-warden');
    expect(id, '应有 shadow-warden 的叙事技').toBeTruthy();
    expect(t.unlocked.has(id)).toBe(false);

    // enemy-defeated 先入账
    window.dispatchEvent(new CustomEvent('enemy-defeated', { detail: { type: 'boss', bossId: 'shadow-warden' } }));
    expect(qs.stats.bossDefeated, '击杀后 bossDefeated 应已写 true').toBe(true);

    // boss-defeated 触发重扫 -> 立即白送
    window.dispatchEvent(new CustomEvent('boss-defeated', { detail: { bossId: 'shadow-warden' } }));
    expect(t.unlocked.has(id)).toBe(true);
    expect(t.narrativeUnlocked.has(id)).toBe(true);
  });

  it('只解锁被击败的那一位面：其它 Boss 的叙事技不会一起送', () => {
    const { t } = build();
    const shadow = grantIdFor('shadow-warden');
    const arch = grantIdFor('archmagus');
    window.dispatchEvent(new CustomEvent('enemy-defeated', { detail: { type: 'boss', bossId: 'shadow-warden' } }));
    window.dispatchEvent(new CustomEvent('boss-defeated', { detail: { bossId: 'shadow-warden' } }));
    expect(t.unlocked.has(shadow)).toBe(true);
    expect(t.unlocked.has(arch), '未击败 archmagus 不该送它的叙事技').toBe(false);
  });

  it('未击败任何 Boss 时不白送 boss 叙事技（回归：别把全部 grant 当满足）', () => {
    const { t } = build();
    t.tryNarrativeUnlocks(t.game);
    expect(t.unlocked.has(grantIdFor('shadow-warden'))).toBe(false);
    expect(t.unlocked.has(grantIdFor('singularity-herald'))).toBe(false);
  });
});
