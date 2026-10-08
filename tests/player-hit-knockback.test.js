/**
 * 玩家受击顶开（W-A6 切片7）：把"挨打被推开"接进切片6 的外部冲量账。
 *
 * 切片6 给玩家建了那本账（`PlayerController.knock`），但账上当时只有井与引力化身在记 ——
 * 敌人砍完一刀、Boss 砸完一下、弹体撞上来，玩家原地不动：伤害数字在跳，人却站得比铁桩还稳。
 * 这一片把"这一下从哪来、顶多远"从四个调用方收进咽喉（`CombatController.takeDamage` 第 4 参
 * `impact = { from, knock? }`）。本文件用**真**对象见证全链路：真 `CombatController` +
 * 真 `PlayerController` 原型宿主（`applyKnockback` 是账本本体）+ `EnemyManager` 里跑 AI 的真敌人，
 * 不经过任何替身 —— 切片6 的账本机制已在 `player-knockback.test.js` 钉过，这里量的是接线与公式。
 *
 * 三条口径各钉一头：
 * - **通用档**：`speed = base + 伤害份额 × scale`（份额 = 结算后的伤害 ÷ maxHp，与震屏同一把
 *   尺子），封顶 `cap`；份额那格用"真结算跑完之后的扣血量"反推，用例不手抄伤害数字；
 * - **覆盖语义**：招自带 `knock` 的（盾击）按招的数，**替掉**通用档而不是相加 —— 一记至多一笔；
 *   用例另外自证"通用档那项 > 1"，否则"恰等于表值"这句话没有区分力；
 * - **排除语义**：场地危险区刻意不传 `from`（圈不是"这一下"，有拉力的井自带持续的力），
 *   掉血照掉、账上一个子都不多。
 *
 * 位移读数是解析式的：账本按"衰减曲线本帧平均"积分，收口于 `speed / decay`。这里量的是
 * "这一笔顶开真的落在这个数上"，帧率无关性（B39）由切片6 的套件负责，不重复测。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CombatController } from '../src/combat/CombatController.js';
import { ProjectileManager } from '../src/combat/ProjectileManager.js';
import { TimeController } from '../src/engine/Time.js';
import { ENEMY_MOVES, GROUND_HAZARD, PLAYER_KNOCK } from '../src/content/tuning.js';
import {
  installWindowShim, makeManager, makeScene, spawn, until, NEVER_LEAVES,
} from './helpers/enemyHarness.js';
import { makePlayer, runFrames } from './helpers/playerHarness.js';

beforeAll(installWindowShim);

const DT = 1 / 60;
const ROOT = process.cwd();

/** 咽喉会调到的音频出口（试听之外的两个） */
const makeAudio = () => ({ playerHurt() {}, hit() {} });

/** 真玩家宿主：`PlayerController` 原型 + 咽喉构造器要的 `scene` */
const makeDuelPlayer = () => {
  const p = makePlayer();
  p.scene = new THREE.Group();
  return p;
};

/** 把真咽喉接到真玩家上（生产接线：`playerRef.combat`） */
const wire = (p) => {
  const combat = new CombatController(
    p,
    { enemies: [], getAliveEnemies: () => [] },
    { toast() {} },
    null,
    makeAudio(),
    null,
  );
  combat.setTimeController(new TimeController());
  combat.rng = () => 0.99;                 // 不暴击：量的是公式本体
  p.combat = combat;
  return combat;
};

/** 通用档的期望值：唯一真源是 `PLAYER_KNOCK.onHit`，份额从实测扣血反推 */
const 通用档 = (掉血, maxHp) => Math.min(
  PLAYER_KNOCK.onHit.cap,
  PLAYER_KNOCK.onHit.base + (掉血 / maxHp) * PLAYER_KNOCK.onHit.scale,
);

describe('受击顶开：沿"出手者→玩家"记进冲量账（W-A6 切片7）', () => {
  it('近战小兵一刀：账 = base + 份额×scale，方向推离出手者，位移 ≈ speed/decay', () => {
    const m = makeManager();
    const p = makeDuelPlayer();
    const combat = wire(p);
    const e = spawn(m, {
      type: 'soldier', x: 1.8, z: 0, moves: ['sweep'], ai: NEVER_LEAVES, hp: 99999, posture: 99999,
    });
    /* 手抄循环而不是用 `until`：要在每帧推进**之前**把出手者站位抓下来 ——
     * 顶开方向的定义是"命中那一刻从出手者指向玩家"，而小兵出生后会先绕行一步
     * （orbit 的切向），站位不恰好在 x 轴上。断言方向本身，而不是"z 必须为 0" */
    let 命中前站位 = null;
    let 命中 = false;
    for (let i = 0; i < Math.round(6 / DT) && !命中; i++) {
      命中前站位 = e.position.clone();
      m.update(DT, p.position, p, null, null);
      命中 = combat.hp < combat.maxHp;
    }
    expect(命中, '六秒都没挨到那一刀：这条用例在空转').toBe(true);

    const 掉血 = combat.maxHp - combat.hp;
    const 期望 = 通用档(掉血, combat.maxHp);
    expect(Math.hypot(p.knock.x, p.knock.z), '账上的速度不是通用档公式算出来的').toBeCloseTo(期望, 8);
    const 方向 = new THREE.Vector3().subVectors(p.position, 命中前站位).normalize();
    expect(方向.x, '玩家不在出手者的 −x 侧：这条用例的站位前提变了').toBeLessThan(-0.9);
    expect(p.knock.x, '顶开没有指向"离出手者而去"').toBeCloseTo(方向.x * 期望, 8);
    expect(p.knock.z, '顶开没有指向"离出手者而去"').toBeCloseTo(方向.z * 期望, 8);

    // 位移 ≈ speed/decay：让敌人闭嘴，只跑玩家的帧，量这一笔自己走出多远
    e.attackCooldown = 999;
    e.state = 'idle';
    const 起点 = p.position.clone();
    runFrames(p, 1, DT, {});
    const 位移 = Math.hypot(p.position.x - 起点.x, p.position.z - 起点.z);
    expect(位移, '位移不是 speed/decay：顶开的钟与切片6 那本账不是同一个')
      .toBeCloseTo(期望 / PLAYER_KNOCK.decay, 3);
    expect(p.position.x - 起点.x, '位移方向与账本方向不一致').toBeLessThan(0);
  });

  it('盾击那一类：招自带的 knock **替掉**通用档 —— 恰是表里那一格，不是 7.5 + 通用', () => {
    const m = makeManager();
    const p = makeDuelPlayer();
    const combat = wire(p);
    spawn(m, {
      type: 'knight', x: 1.8, z: 0, moves: ['bash'], ai: NEVER_LEAVES, hp: 99999, posture: 99999,
    });
    expect(until(m, 6, DT, p.position, p, () => combat.hp < combat.maxHp),
      '六秒都没挨到盾击：这条用例在空转').toBe(true);

    const 掉血 = combat.maxHp - combat.hp;
    expect(通用档(掉血, combat.maxHp), '通用档这项太小，"恰等于表值"就失去区分力')
      .toBeGreaterThan(1);
    expect(Math.hypot(p.knock.x, p.knock.z), '叠加了：盾击那一笔之上又记了一次通用档')
      .toBeCloseTo(ENEMY_MOVES.bash.knock, 10);
    expect(p.knock.x).toBeLessThan(0);
  });

  it('无敌帧：一步都不记 —— 闪避成功了不该反被推飞', () => {
    const p = makeDuelPlayer();
    const combat = wire(p);
    combat.invincible = true;
    expect(combat.isInvulnerable()).toBe(true);
    combat.takeDamage(20, null, null, { from: new THREE.Vector3(1.8, 0, 0) });
    expect(combat.hp).toBe(combat.maxHp);
    expect(p.knock.x).toBe(0);
    expect(p.knock.z).toBe(0);
  });

  it('封顶：这一笔在 cap 上停住，不把玩家弹射出去', () => {
    const p = makeDuelPlayer();
    const combat = wire(p);
    combat.takeDamage(90, null, null, { from: new THREE.Vector3(0, 0, 3) });
    const 掉血 = combat.maxHp - combat.hp;
    expect(combat.hp, '这一下把人打死了：重生会清账，cap 就测不到').toBeGreaterThan(0);
    expect(掉血 / combat.maxHp, '份额没到"该封顶"的档：这条用例在空转').toBeGreaterThanOrEqual(0.5);
    expect(Math.hypot(p.knock.x, p.knock.z)).toBeCloseTo(PLAYER_KNOCK.onHit.cap, 10);
    expect(p.knock.z, '出手者在 +z：顶开要指向 −z').toBeLessThan(0);
  });
});

describe('来路接线：Boss / 混沌脉冲 / 弹体三条都递 `from`', () => {
  it('Boss 近战那一刀：从 Boss 站位顶开（真 Boss.update 驱动）', () => {
    const m = makeManager();
    const p = makeDuelPlayer();
    p.position.set(3, 0, 0);
    const combat = wire(p);
    m.spawnBoss({ bossId: 'shadow-warden', x: 0, z: 0, respawn: false });
    expect(until(m, 8, DT, p.position, p, () => combat.hp < combat.maxHp),
      'Boss 八秒没打到玩家：这条用例在空转').toBe(true);

    const 掉血 = combat.maxHp - combat.hp;
    expect(Math.hypot(p.knock.x, p.knock.z), 'Boss 那一刀没顶开：第 4 参没接上')
      .toBeCloseTo(通用档(掉血, combat.maxHp), 8);
    expect(p.knock.x, 'Boss 在 −x 侧：顶开要指向 +x').toBeGreaterThan(0);
    expect(p.knock.z).toBeCloseTo(0, 10);
  });

  it('混沌脉冲：2.5 秒一发的那记也顶开（真 ChaosBoss）', () => {
    const m = makeManager();
    const p = makeDuelPlayer();
    p.position.set(6, 0, 0);
    const combat = wire(p);
    const boss = m.spawnChaosBoss({ bossId: 'chaos-overlord', x: 0, z: 0, respawn: false });
    boss.phase = 2;                        // canPulse 从二阶段起
    boss.chaosPulse = 999;                 // 这一帧就到脉冲期
    m.update(DT, p.position, p, null, null);

    const 掉血 = combat.maxHp - combat.hp;
    expect(掉血, '脉冲没落下来：canPulse / 距离这些门没开，用例在空转').toBeGreaterThan(0);
    expect(Math.hypot(p.knock.x, p.knock.z), '脉冲那一记没顶开：第 4 参没接上')
      .toBeCloseTo(通用档(掉血, combat.maxHp), 8);
    expect(p.knock.x, 'Boss 在 −x 侧：顶开要指向 +x').toBeGreaterThan(0);
    expect(p.knock.z).toBeCloseTo(0, 10);
  });

  it('弹体：顶开方向随弹道（真 ProjectileManager）', () => {
    const p = makeDuelPlayer();
    const combat = wire(p);
    const pm = new ProjectileManager(makeScene(), null);
    pm.spawn(new THREE.Vector3(5, 0, 0), new THREE.Vector3(0, 0, 0), 12, 10, 0xff0000);
    let 撞上了 = false;
    for (let i = 0; i < 600 && !撞上了; i++) {
      pm.update(DT, p.position, p);
      撞上了 = combat.hp < combat.maxHp;
    }
    expect(撞上了, '弹体从五米外飞来十秒都没撞上：这条用例在空转').toBe(true);

    const 掉血 = combat.maxHp - combat.hp;
    expect(Math.hypot(p.knock.x, p.knock.z), '弹体那一记没顶开：第 4 参没接上')
      .toBeCloseTo(通用档(掉血, combat.maxHp), 8);
    expect(p.knock.x, '弹体从 +x 飞来：顶开要指向 −x').toBeLessThan(0);
    expect(p.knock.z).toBeCloseTo(0, 10);
  });
});

describe('场地危险区：刻意不是"这一下"', () => {
  it('掉血照掉、账上一个子都不多（站偏一点，方向非零——真传了 from 就会被抓住）', () => {
    const m = makeManager();
    const p = makeDuelPlayer();
    p.position.set(1.2, 0, 0);
    const combat = wire(p);
    m.hazards.spawn({ ...GROUND_HAZARD.bossSlam, x: 0, z: 0, damage: 12, tick: 0.3, duration: 2 });
    let 最大账 = 0;
    for (let i = 0; i < Math.round(5 / DT); i++) {
      m.hazards.update(DT, p.position, p);
      最大账 = Math.max(最大账, Math.hypot(p.knock.x, p.knock.z));
    }
    expect(combat.hp, '域没落地：这条用例在空转').toBeLessThan(combat.maxHp);
    expect(最大账, '圈开始顶开玩家了 —— "圈不是这一下"这条语义被改掉了').toBe(0);
  });

  it('静态门禁：四条来路都递 `from`，场地危险区两处结算点都不递', () => {
    for (const f of ['Enemy.js', 'Boss.js', 'ChaosBoss.js', 'ProjectileManager.js']) {
      const src = readFileSync(join(ROOT, 'src', 'combat', f), 'utf8');
      const 调用 = src.match(/combat\.takeDamage\([^\n]*/g) ?? [];
      expect(调用.length, `${f} 里找不到 takeDamage 调用：这条门禁在空转`).toBeGreaterThan(0);
      for (const c of 调用) {
        expect(c, `${f} 的某处 takeDamage 没递 \`{ from: … }\`：顶开会静默失效`).toMatch(/\{ from:/);
      }
    }
    const 圈 = readFileSync(join(ROOT, 'src', 'combat', 'GroundHazards.js'), 'utf8');
    const 圈调用 = 圈.match(/combat\.takeDamage\(/g) ?? [];
    expect(圈调用.length, '场地危险区少了结算点（tick 与落地两处都要在）').toBeGreaterThanOrEqual(2);
    expect(/\{ from:/.test(圈), '场地危险区开始传 from 了 —— 圈不是"这一下"，这是设计改动，不是顺手补')
      .toBe(false);
  });
});
