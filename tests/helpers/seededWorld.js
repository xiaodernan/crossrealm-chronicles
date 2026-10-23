/**
 * 真世界的"钉死布局"建造器 —— B125 那一族共享的这一口锅。
 *
 * ## 为什么会有这个文件
 *
 * 世界里的障碍碰撞体是**未播种的 Math.random() 摆的**：FantasyZone 的六根柱
 * （x = -20 + i * 8 + (random-0.5)*4）、GloomZone.buildOuterWilds 的二十块散石
 * （过半带碰撞体）、其余各区同理。于是每一轮 WorldManager.build() 都是另一份布局。
 *
 * 读这些碰撞体的门禁因此**听命于运气**：B125 量到的那条"每个原生出生点四向至少
 * 一向警觉"在全量套件里轮换红（300 轮 6 次，受害者逐轮换）。判据没坏，坏的是它读的
 * 布局不点名。这个助手把随机源在 build() 那一段时间里换成确定性 LCG，建完立刻还原。
 *
 * ## 用法与纪律
 *
 * - 断言真实世界布局（碰撞体、视线、出生点脱困落点）的用例，一律走 buildSeededWorld(seed)。
 * - **不许**在用例里自己 Math.random = …：那会各钉各的、种子含义各自漂移。
 *   tests/seeded-world-build.test.js 静态盯着这件事（读布局却不走这个助手的文件会红）。
 * - buildUnseededWorld() 只服务门禁自己的反向控制（证明"钉种子"钉的不是空气），
 *   **不承载任何布局断言**。
 * - LCG 公式与 B125 当时逐字相同：换公式 = 换掉全部布局，那份钉死的种子要重新验。
 */
import * as THREE from 'three';
import { WorldManager } from '../../src/world/WorldManager.js';

/** 与 B125 当时同一条 LCG（线性同余）：同一种子同序列，build 结果可复现 */
function lcg(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * 建一份**钉死布局**的真世界。
 *
 * 只在 build() 这一段时间里把随机源换成种子决定的确定性序列，finally 还原 ——
 * 建图抛错也不把播种留在 Math.random 上，否则同一 worker 里后面的用例都跑在
 * 替身随机数上（那条保证由 tests/seeded-world-build.test.js 钉住）。
 *
 * @param {number} seed 布局种子；同一颗种子 => 同一份碰撞体布局
 * @returns {import('../../src/world/WorldManager.js').WorldManager}
 */
export function buildSeededWorld(seed) {
  const 原 = Math.random;
  Math.random = lcg(seed);
  try {
    const world = new WorldManager(new THREE.Scene(), { show() {}, toast() {} });
    world.build();
    return world;
  } finally {
    Math.random = 原;
  }
}

/**
 * 建一份**不钉种子**的真世界 —— 仅用于门禁的反向控制（两份布局必须不一样）。
 * 断言布局的用例不许用它：那正是 B125 之前"轮换红"的成因。
 */
export function buildUnseededWorld() {
  const world = new WorldManager(new THREE.Scene(), { show() {}, toast() {} });
  world.build();
  return world;
}