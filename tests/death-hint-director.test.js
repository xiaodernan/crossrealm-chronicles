/**
 * 倒下提示门禁 —— 钉 `game/DeathHintDirector.js`。
 *
 * 通过真实 EventBus 驱动。核心不变量是**提示优先级**（写错只静默给错建议，不抛）：
 *   连段≥4 → 打 Boss → 副本里 → 回营火（兜底）
 * 以及：倒下计数累加、提示走两层展开（`t()` 取句 → `keyText()` 展开 `{动作}`）、
 * 写日志、广播 `player-death-count`、存档往返。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emit } from '../src/engine/EventBus.js';
import { t } from '../src/engine/i18n.js';
import { keyText } from '../src/ui/keyHints.js';
import { DeathHintDirector } from '../src/game/DeathHintDirector.js';

let game, dir, deathEvents, capture;

beforeEach(() => {
  deathEvents = [];
  capture = (e) => { deathEvents.push(e.detail); };
  globalThis.window.addEventListener('player-death-count', capture);
  game = {
    player: { combat: { comboCount: 0 } },
    enemyManager: { boss: { alive: false } },
    dungeons: { active: false },
    dialog: { toast: vi.fn() },
    storyJournal: { add: vi.fn() },
    quests: { chapter: 2 },
  };
  dir = new DeathHintDirector(game);
});
afterEach(() => {
  dir?.dispose();
  globalThis.window.removeEventListener('player-death-count', capture);
  dir = null;
});

const hintText = (key) => keyText(t(key));

describe('DeathHintDirector 提示优先级', () => {
  it('连段≥4 → 连段提示（最高优先）', () => {
    game.player.combat.comboCount = 5;
    game.enemyManager.boss.alive = true; // 有 Boss 也让位给连段
    dir.onRespawn();
    expect(game.storyJournal.add.mock.calls[0][0].text).toBe(hintText('death_hint_combo'));
  });

  it('无连段但有 Boss → Boss 提示', () => {
    game.enemyManager.boss.alive = true;
    dir.onRespawn();
    expect(game.storyJournal.add.mock.calls[0][0].text).toBe(hintText('death_hint_boss'));
  });

  it('无连段无 Boss 但在副本里 → 副本提示', () => {
    game.dungeons.active = true;
    dir.onRespawn();
    expect(game.storyJournal.add.mock.calls[0][0].text).toBe(hintText('death_hint_dungeon'));
  });

  it('都不满足 → 回营火兜底', () => {
    dir.onRespawn();
    expect(game.storyJournal.add.mock.calls[0][0].text).toBe(hintText('death_hint_campfire'));
  });
});

describe('DeathHintDirector 计数 / 广播 / 存档', () => {
  it('倒下计数累加、广播、日志 id 带序号（经 player-respawn 事件）', () => {
    emit('player-respawn');
    emit('player-respawn');
    expect(dir.deathCount).toBe(2);
    expect(deathEvents.at(-1)).toEqual({ count: 2 });
    expect(game.storyJournal.add.mock.calls[1][0].id).toMatch(/^death-2-/);
  });

  it('toJSON/fromJSON 存读 deathCount；null 安全 no-op', () => {
    dir.onRespawn();
    dir.onRespawn();
    expect(dir.toJSON()).toEqual({ deathCount: 2 });
    dir.deathCount = 0;
    dir.fromJSON({ deathCount: 2 });
    expect(dir.deathCount).toBe(2);
    dir.fromJSON(null);
    expect(dir.deathCount).toBe(2);
  });
});
