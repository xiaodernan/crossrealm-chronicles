/**
 * 动画层与实体的所有权分家（W-C6 切片5）。
 *
 * ## 这片门禁钉住的是实测到的三个洞
 *
 * 普查（`D:\tmp-wc6s5\census-seam.mjs`，从真接缝跑 `Enemy.update` 40 帧）读数：
 * - **朝向被动画偷走**：同一枚士兵，没挂适配器末帧 `mesh.rotation.y = 1.4697`（正转向玩家），
 *   挂了适配器 `= 0.0218`。原因是混音器直接绑在 `entity.mesh` 上，而占位片段那条
 *   `.rotation[y]` 轨道每帧把它按关键帧写成 0。第三层后果：`Resolution.isBehind`（背刺判据，
 *   读的正是 `facingYaw()` → `mesh.rotation.y`）从 `true` 翻成 `false` —— 挂上适配器的敌人
 *   再也背刺不了。而 `Game.js:1011` 每帧都在给新敌人挂适配器，这不是"偶发"，是常态。
 * - **占位片段根本不动**：6 个状态 × 30 帧里 `mesh` 的最大变化 `0.00e+0`（每条轨道都是 `[0, 0]`）。
 * - **切过去的动作没在跑**：`crossFade` 走的是 three 的 `crossFadeTo`，而它（three.core.js:33092
 *   的 `crossFadeFrom`）只做 `fadeOut + fadeIn`，**从不 `play()` 目标** —— 目标 action 不进 mixer
 *   的激活表，权重淡到 1 也不写一帧属性。
 *
 * ## 关键设计：判据绑机制，不绑读数
 *
 * 朝向这件事不能靠"跑两枚敌人比轨迹"来钉：`Enemy` 的 `aiSeed = ++aiSeq` 每只不同，两枚敌人
 * 本来就不该完全一致（比的是构造顺序，不是适配器）。所以这里两条腿走路：
 * - **结构腿**：混音器绑的对象**不是** `entity.mesh`；片段里每一条轨道的绑定路径只许出现在
 *   `MOTION_CHANNELS` 那三条（`.position[y]` / `.rotation[x]` / `.rotation[z]`）里 ——
 *   `rotation[y]` 进不了片段，朝向就不可能被写回去。
 * - **机制腿**：把逻辑字段写成哨兵值，推进动画 300 帧，哨兵必须分毫不动，而视觉层在起伏。
 * 再加一条**接缝腿**：挂了适配器的真敌人仍然转向玩家、从背面打仍然算背刺（这是 B 单上那句
 * "用户能看见的后果"的直接见证）。每条腿都配反向对照：判据对自己人造的坏片段必须点名，
 * 否则"没找到违规"可能只是"什么都没找"。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { isBehind } from '../src/combat/Resolution.js';
import {
  createEntityAdapter, ensureAnimRoot, STATE_TO_ACTION, ANIM_ROOT_NAME,
} from '../src/animation/AnimationEntityAdapter.js';
import { AnimationLibrary, ANIM_MOTION, MOTION_CHANNELS } from '../src/animation/AnimationLibrary.js';
import { AnimationClipLoader } from '../src/animation/AnimationClipLoader.js';
import * as animIndex from '../src/animation/index.js';
import { makeManager, spawn, run, makePlayerRef, installWindowShim, v } from './helpers/enemyHarness.js';

installWindowShim();

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const 允许的绑定 = new Set(Object.values(MOTION_CHANNELS));

/** 最小实体：`mesh` 带两枚视觉子节点，够看出"搬进组"与"搬回来"。 */
const makeEntity = () => {
  const mesh = new THREE.Object3D();
  const a = new THREE.Object3D(); a.name = 'body';
  const b = new THREE.Object3D(); b.name = 'wing';
  mesh.add(a, b);
  return { mesh, combatState: 'idle', sprinting: false, 部件: [a, b] };
};

const 适配器 = (entity = makeEntity()) => {
  const e = entity;
  const a = createEntityAdapter(e);
  return { entity: e, adapter: a };
};

/** 视觉层根节点（真敌人的身体组挂在 `mesh` 下） */
const 视觉层 = (entity) => entity.mesh.children.find((o) => o.name === ANIM_ROOT_NAME);

/** 推进某个动作并采样视觉层三条通道（`play` 不停状态机，隔离测量） */
function 采样(adapter, 动作, 帧数, dt = 1 / 60) {
  const 组 = adapter.animRoot;
  adapter.controller.play(动作);
  const out = { y: [], rx: [], rz: [] };
  for (let i = 0; i < 帧数; i++) {
    adapter.controller.update(dt);
    out.y.push(组.position.y); out.rx.push(组.rotation.x); out.rz.push(组.rotation.z);
  }
  return out;
}
const 幅度 = (序) => Math.max(...序) - Math.min(...序);

/** 剥注释后再找令牌：说明文字里提到被删的表名是常态，不是接线（与 chunk-graph 同款） */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((ln) => { const i = ln.indexOf('//'); return i >= 0 ? ln.slice(0, i) : ln; }).join('\n');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** 判据本体：从"剥了注释的源码文本"里挑出含指定令牌的相对路径 */
function 令牌所在(files, 令牌) {
  return files.filter((f) => stripComments(readFileSync(f, 'utf8')).includes(令牌))
    .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/'));
}

describe('视觉层根节点：动画不接管实体变换（W-C6 切片5）', () => {
  it('适配器建独立视觉层根节点：混音器绑它，不绑实体的 mesh', () => {
    const { entity, adapter } = 适配器();
    const 组 = 视觉层(entity);
    expect(组, '`mesh` 下没有视觉层根节点').toBeInstanceOf(THREE.Group);
    expect(adapter.animRoot).toBe(组);
    expect(adapter.controller.mixer.root, '混音器还绑在实体自己的变换节点上').toBe(组);
    expect(adapter.controller.mixer.root).not.toBe(entity.mesh);
    // 搬进去而不是复制：世界变换不变（组的局部变换是单位阵）
    expect(entity.mesh.children.length).toBe(1);
    expect(组.children.map((o) => o.name).sort()).toEqual(['body', 'wing']);
  });

  it('片段的绑定路径只有视觉层那三条；`.rotation[y]` 一条都不许有（带反向对照）', () => {
    const { adapter } = 适配器();
    const 全部轨道 = [];
    for (const 名 of adapter.library.getActionNames()) {
      // 轨道上的绑定路径存在 `name` 里（`KeyframeTrack` 没有 `propertyPath` 字段 —— 那是
      // `createFromJSON` 入参的名字；读错字段会让这条门禁把**所有**轨道都当成违规）
      for (const t of adapter.library.getClip(名).tracks) 全部轨道.push({ 名, 路径: t.name });
    }
    expect(全部轨道.length, '一条轨道都没扫到 —— 扫描器空转，这条断言不能算通过').toBeGreaterThanOrEqual(
      Object.keys(ANIM_MOTION).length);
    const 违规 = 全部轨道.filter((t) => !允许的绑定.has(t.路径));
    expect(违规, `越界绑定：${违规.map((t) => `${t.名}→${t.路径}`).join(', ')}`).toEqual([]);

    // 反向对照：同一套判据喂给人造的坏片段（把朝向绑回去），必须点名
    const 坏库 = new AnimationLibrary();
    坏库.setClip('坏的', AnimationClipLoader.createFromJSON({
      name: '坏的', duration: 1,
      tracks: [{ propertyPath: '.rotation[y]', times: [0, 1], values: [0, 0] }],
    }));
    const 坏违规 = 坏库.getClip('坏的').tracks.filter((t) => !允许的绑定.has(t.name));
    expect(坏违规.map((t) => t.name), '判据对 `.rotation[y]` 视而不见 = 门禁是空的').toEqual(['.rotation[y]']);
  });

  it('哨兵不死：逻辑字段（yaw / roll / 贴地高度）推进 300 帧动画后分毫未动，视觉层却在起伏', () => {
    const { adapter } = 适配器();
    adapter.entity.mesh.rotation.set(0, 1.234, 0.5);
    adapter.entity.mesh.position.set(0, 7, 0);
    const 哨兵 = { yaw: 1.234, roll: 0.5, y: 7 };
    for (const 态 of ['idle', 'pursue', 'orbit', 'windup', 'strike', 'stagger', 'dead']) {
      adapter.entity.combatState = 态;
      for (let i = 0; i < 40; i++) adapter.update(1 / 60);
    }
    const m = adapter.entity.mesh;
    expect(m.rotation.y, '动画把朝向写回去了（B 单上的 yaw 归零）').toBeCloseTo(哨兵.yaw, 6);
    expect(m.rotation.z, '动画把摆动字段写回去了').toBeCloseTo(哨兵.roll, 6);
    expect(m.position.y, '动画把贴地高度写回去了').toBeCloseTo(哨兵.y, 6);
    expect(幅度(采样(adapter, 'run', 60).y), '视觉层没动：占位片段还是全 0？').toBeGreaterThan(0.05);
  });

  it('真接缝：挂了适配器的敌人仍然转向玩家，从背面打仍然算背刺', () => {
    // 走 `EnemyManager.spawn` 而不是 `new Enemy(...)`：`squad` 由管理器发，
    // 缺席时 `EnemyFSM.tryClaimStrikeSlot` 会在第 47 行读 `squad.claim` 崩 —— 那是脚手架的洞，不是被测的行为。
    const m = makeManager();
    const player = v(5, 0);
    const ref = makePlayerRef();
    const e = spawn(m, { x: 0, z: 0 });
    e.animationAdapter = createEntityAdapter(e);

    run(m, 1, 1 / 60, player, ref);   // 一秒：够追上来，也够把朝向收敛到玩家

    const want = Math.atan2(player.x - e.position.x, player.z - e.position.z);
    let d = want - e.mesh.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    expect(Math.abs(d), `没转向玩家：yaw=${e.mesh.rotation.y.toFixed(4)} 期望≈${want.toFixed(4)}`).toBeLessThan(0.2);

    // 背刺位 = 敌人背后、与玩家相反的那一侧
    const 朝向 = new THREE.Vector3(Math.sin(e.mesh.rotation.y), 0, Math.cos(e.mesh.rotation.y));
    const 背面 = new THREE.Vector3(e.position.x, 1, e.position.z).addScaledVector(朝向, -3);
    expect(isBehind(e, 背面), 'facingYaw 被动画接管后，背刺判据翻假').toBe(true);
    // 视觉层确实在动，而身体组的 yaw 仍是逻辑的那一份
    expect(视觉层(e), '没有视觉层根节点').toBeDefined();
  });

  it('重复挂载只套一层视觉根；dispose 之后部件原路搬回实体根', () => {
    const { entity } = 适配器();
    const 第二次 = createEntityAdapter(entity);
    expect(entity.mesh.children.length, '第二枚适配器又套了一层视觉根').toBe(1);
    expect(ensureAnimRoot(entity.mesh)).toBe(视觉层(entity));
    第二次.dispose();
    expect(entity.mesh.children.length, 'dispose 没把视觉根摘掉').toBe(2);
    expect(entity.mesh.children.map((o) => o.name).sort()).toEqual(['body', 'wing']);
    expect(视觉层(entity), 'dispose 后视觉根还挂在实体上').toBeUndefined();
  });

  it('一个动作只定义一次：库里的循环档与 clip 的时长/轨道逐项等于运动表', () => {
    const { adapter } = 适配器();
    for (const [名, m] of Object.entries(ANIM_MOTION)) {
      const cfg = adapter.library.getConfig(名);
      expect(cfg.loop, `${名}：配置里的 loop 与运动表不一致`).toBe(m.loop);
      const clip = adapter.library.getClip(名);
      expect(clip.duration, `${名}：clip 时长与运动表不一致`).toBeCloseTo(m.duration, 6);
      const 通道 = Object.keys(MOTION_CHANNELS).filter((c) => m[c]);
      expect(clip.tracks.length, `${名}：轨道数与运动表通道数不符`).toBe(通道.length);
      for (const c of 通道) {
        const t = clip.tracks.find((x) => x.name === MOTION_CHANNELS[c]);
        expect(t.times[0], `${名}.${c} 第一帧不在 0`).toBeCloseTo(0, 6);
        expect(t.times[t.times.length - 1], `${名}.${c} 末帧不在时长处`).toBeCloseTo(m.duration, 6);
        // `values` 落进 Float32Array：float32 的精度就到 1e-7 这一档，所以这里比到 6 位小数。
        // 再紧一档就成了"比谁的舍入方式更巧"，而不是"比关键帧内容"—— 漂移一位小数（0.03→0.029）照样红。
        t.values.forEach((值, i) => expect(值, `${名}.${c} 第 ${i} 帧关键值漂移`).toBeCloseTo(m[c][i][1], 6));
      }
      // 循环档首尾同值，否则每圈结尾硬跳一下
      if (m.loop) for (const c of 通道) {
        const ks = m[c];
        expect(ks[ks.length - 1][1], `${名}.${c} 是循环档却首尾不同值`).toBeCloseTo(ks[0][1], 9);
      }
    }
  });

  it('状态映射只有一份，且每一条都指向运动表里真存在的动作', () => {
    const { adapter } = 适配器();
    const 缺 = [...new Set(Object.values(STATE_TO_ACTION))].filter((名) => !(名 in ANIM_MOTION));
    expect(缺, `映射指向运动表里没有的动作：${缺.join(', ')}`).toEqual([]);
    // 控制器用的就是这张表（不是构造时另抄的一份）
    expect(adapter.controller.stateMap).toEqual({ ...STATE_TO_ACTION });
    for (const 态 of Object.keys(STATE_TO_ACTION)) {
      expect(adapter.library.has(adapter._resolveAction(态)), `状态 ${态} 解析出的动作不在库里`).toBe(true);
    }
    expect(adapter._resolveAction('locomotion', true)).toBe('run');
    expect(adapter._resolveAction('没有这个状态')).toBe('idle');
  });

  it('crossFade 的目标真的在跑（three 的 crossFadeTo 从不 play，混音器必须自己补）', () => {
    const { adapter } = 适配器();
    adapter.setState('idle', { force: true });
    adapter.update(1 / 60);
    adapter.setState('pursue');            // → crossFade 到 'run'
    const 目标 = adapter.controller.mixer.currentAction;
    expect(adapter.getCurrentAction()).toBe('run');
    expect(目标.isRunning(), '切过去了但一个动作都没跑').toBe(true);
    expect(目标.isScheduled()).toBe(true);
    // 结构带子：不许退回 three 的 crossFadeTo（它只淡权重，不 play）
    const 源 = stripComments(readFileSync(join(SRC, 'animation/AnimationMixer.js'), 'utf8'));
    expect(源.includes('crossFadeTo('), 'AnimationMixer 又用回 crossFadeTo 了').toBe(false);
    expect('action.crossFadeTo(x, 1, true)'.includes('crossFadeTo('), '判据本身失灵').toBe(true);
  });

  it('循环口径由运动表说了算：一次性动作停在最后一帧，循环动作一直在动', () => {
    const { adapter } = 适配器();
    const death = 采样(adapter, 'death', 180);
    const 末 = death.rx[death.rx.length - 1];
    expect(末, 'death 没停在末帧的倒地下姿态').toBeCloseTo(ANIM_MOTION.death.rx[2][1], 4);
    expect(Math.max(...death.rx.slice(90)), 'death 回卷了：倒下之后又站起来').toBeLessThan(-1.0);
    expect(death.y[death.y.length - 1]).toBeCloseTo(ANIM_MOTION.death.y[2][1], 4);

    const idle = 采样(adapter, 'idle', 240);
    expect(幅度(idle.y), 'idle 不循环：起伏没跑起来').toBeGreaterThan(0.02);
    expect(new Set(idle.y.map((x) => x.toFixed(5))).size, 'idle 读数单调 = 片段根本没推进').toBeGreaterThan(10);

    const block = 采样(adapter, 'block', 120);
    expect(Math.max(...block.rx), 'block 的常驻举盾前倾被抹平了').toBeLessThan(-0.1);
  });

  it('动作真的动起来了，而且幅度分得开：冲刺起伏 > 走路起伏 > 站立起伏', () => {
    const { adapter } = 适配器();
    const 冲刺 = 幅度(采样(adapter, 'run', 120).y);
    const 走路 = 幅度(采样(adapter, 'walk', 120).y);
    const 站立 = 幅度(采样(adapter, 'idle', 120).y);
    expect(冲刺, '冲刺没有起伏（占位片段没生效）').toBeGreaterThan(0.08);
    expect(冲刺).toBeGreaterThan(走路);
    expect(走路).toBeGreaterThan(站立);
    expect(Math.min(...采样(adapter, 'attack1', 40).rx), '出手不前倾').toBeLessThan(-0.2);
  });

  it('旧的两份陈述删净：`*ANIM_PRESETS` / `DEFAULT_*_STATE_MAP` / `createStateMachine` 在 src 里零出现（带 planted 对照）', () => {
    const files = walk(SRC);
    expect(files.length, 'src 一个 .js 都没走到 —— 扫描器空转').toBeGreaterThan(50);
    for (const 令牌 of ['PLAYER_ANIM_PRESETS', 'ENEMY_ANIM_PRESETS', 'BOSS_ANIM_PRESETS',
      'DEFAULT_PLAYER_STATE_MAP', 'DEFAULT_ENEMY_STATE_MAP', 'DEFAULT_BOSS_STATE_MAP', 'createStateMachine']) {
      expect(令牌所在(files, 令牌), `${令牌} 还有去处`).toEqual([]);
    }
    // 对照两条：真在的令牌必须被点名（否则"零出现"只是"什么都没扫"）；已删掉的必须为空
    expect(令牌所在([join(SRC, 'animation/AnimationMixer.js')], 'clipAction'),
      '对照：真存在的令牌没被扫到 —— 扫描器是瞎的').toEqual(['src/animation/AnimationMixer.js']);
    // 运行时那一层也验一次：门面导出的是一张运动表，不是三份预设
    expect(animIndex.ANIM_MOTION).toBe(ANIM_MOTION);
    expect(animIndex.PLAYER_ANIM_PRESETS, '门面还在再导出被删的预设表').toBeUndefined();
    expect(animIndex.DEFAULT_ENEMY_STATE_MAP).toBeUndefined();
  });
});
