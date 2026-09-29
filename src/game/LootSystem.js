import * as THREE from 'three';
import { GEAR_RARITY_DISPLAY, dropChance, isGearInstance, rollBossGear, rollGear } from '../content/gear.js';

/** 地上那一件的形状全系统共用一份：档位只改颜色，不改几何 */
const DROP_RADIUS = 0.25;
/** 魂的光色写在这里，装备的光色查表 —— 两边的分工与 `content/gear.js` 的显示档一致 */
const SOUL_TINT = 0x44ddff;
const SOUL_EMISSIVE = 0x116688;
/** 没人捡的掉落物在地上留多久（秒，走主循环 dt） */
const DROP_LIFE = 30;

/**
 * 掉落：地上那一件东西，从"谁生成"到"谁捡走"只有这一个 owner。
 *
 * 切片2 起它可以交出一件**装备**，而装备的规矩全在 `content/gear.js`：该不该掉（`dropChance`）、
 * 掉哪一件（`rollGear`）、多重（`gearScore`）。这一层只负责形状与生命周期 —— 一旦这里开始
 * 自己算档位或自己抄颜色，"地上的光"与"提示里的字"就会各说一套（B36 那一族）。
 *
 * `rng` 是注入的：掉落是概率，而概率必须能被复现地测（自己写 `Math.random` 的用例只能断言
 * "在范围内"，那是最弱的一种断言 —— 一件装备该不该掉、掉的是哪一档，全都查不出来）。
 * `onGear` 是装备被捡起时唯一的出口：谁把它变成"穿上 + 提示"由组装方（`Game`）决定，
 * 这一层不认识 `PlayerStats` 之外的任何人。
 *
 * 生命周期与 `effects/VoidEcho.js` 同一套口径：八面体一份、网格按池申领/归还，
 * "新建过几份"因此跟**同时在场峰值**挂钩而不是跟累计击杀数挂钩（W-C1 切片1 的普查数：
 * 改前 500 件掉落就是 500 个几何 + 500 个材质、`dispose` 0 次，峰值在场只有 40 件）。
 */
export class LootSystem {
  constructor(scene, stats, audio, { rng = Math.random, onGear = null } = {}) {
    this.scene = scene;
    this.stats = stats;
    this.audio = audio;
    this.rng = rng;
    this.onGear = onGear;
    this.drops = [];
    /** 捡走或到期后摘出场景存这里：不再每件新建一份几何与材质，也不留"remove 却不归还"的孤儿 */
    this._pool = [];
    this.geometry = new THREE.OctahedronGeometry(DROP_RADIUS, 0);
  }

  /**
   * 取一件地上的网格：池里有用完的就复用，没有才新建。
   * 材质必须每件一份 —— 档位色就写在材质上，共用一份会变成"后掉的那件改掉前掉那件的颜色"。
   */
  _acquire() {
    const mesh = this._pool.pop() ?? new THREE.Mesh(
      this.geometry,
      new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.2, emissiveIntensity: 0.9 }),
    );
    // 复用的那一格带着上一件的自转：不洗一眼就看得出"这件是第二次掉在地上"
    mesh.rotation.set(0, 0, 0);
    this.scene.add(mesh);
    return mesh;
  }

  /** 还回池里而不是丢掉：从场景摘出去，资源留着下一件接着用 */
  _release(mesh) {
    this.scene.remove(mesh);
    this._pool.push(mesh);
  }

  /** 池里备用网格数：泄漏 watchdog 与用例都看这个，不翻内部结构 */
  pooled() {
    return this._pool.length;
  }

  _spawn(pos, { souls, gear }) {
    const mesh = this._acquire();
    const tint = gear ? GEAR_RARITY_DISPLAY[gear.rarity].tint : SOUL_TINT;
    mesh.material.color.setHex(tint);
    mesh.material.emissive.setHex(gear ? tint : SOUL_EMISSIVE);
    mesh.position.copy(pos);
    mesh.position.y += 1;
    this.drops.push({ mesh, souls, gear, life: DROP_LIFE, phase: this.rng() * Math.PI * 2 });
    return this.drops[this.drops.length - 1];
  }

  /** 一件装备：颜色就是它的档位（表里那一格，不是这里现编的）。坏的那一件不生成 —— 否则地上多一个捡不动的假掉落物 */
  spawnGear(pos, instance) {
    if (!isGearInstance(instance)) return null;
    return this._spawn(pos, { souls: 0, gear: instance });
  }

  /**
   * 一次击杀该交什么。档位名（`boss` / `elite` / `golem` / `normal` / `dummy`）与区域 id 都由
   * 敌人那边给 —— "这一档掉不掉"与"这一片掉得出什么"两张表都在 `content/gear.js`，
   * 这一处只是把它们串起来（掉落层自己不抄、不查）。
   *
   * `bossId` 同理由敌人那边给（第五参，切片5）。只在 `kind === 'boss'` 时查固定掉落表：
   * 普通怪的击杀不带 bossId，就算带了也不该白掉一件 Boss 奖励；未登记的 bossId 交回 `null`
   * 并照常走池子 —— "没有固定件"是合法结果，不是错误。
   */
  spawnKill(pos, souls, kind, zoneId, bossId = null) {
    const out = [this._spawn(pos, { souls, gear: null })];
    // 固定件**不掷骰**：表上承诺了就必掉（掷骰要掷的只有词缀，那在 `rollBossGear` 里）
    if (kind === 'boss') {
      const fixed = this.spawnGear(pos, rollBossGear(this.rng, bossId));
      if (fixed) out.push(fixed);
    }
    // `dropChance` 给 1 时那一掷必然命中，给 0 时必然不命中：兜底不靠这里再判一次
    if (this.rng() < dropChance(kind)) {
      const gear = this.spawnGear(pos, rollGear(this.rng, zoneId));
      if (gear) out.push(gear);
    }
    return out;
  }

  /**
   * 摘账的唯一出口：捡走与到期两条路都从这里归还。
   * 分成两处写就留下"改了捡走那半、忘了到期那半"的空间 —— 那一半的症状不是报错，是池子只进不出。
   */
  _despawn(i) {
    const d = this.drops[i];
    this.drops.splice(i, 1);
    this._release(d.mesh);
  }

  update(dt, playerPos, pickupRadius = 2.5) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      d.phase += dt * 3;
      d.mesh.position.y = playerPos.y + 0.8 + Math.sin(d.phase) * 0.3;
      d.mesh.rotation.y += dt * 2;

      const dist = Math.sqrt(
        (playerPos.x - d.mesh.position.x) ** 2 + (playerPos.z - d.mesh.position.z) ** 2
      );
      if (dist < pickupRadius) {
        if (d.gear) this.onGear?.(d.gear, d.souls);
        else this.stats.addSouls(d.souls);
        this.audio?.pickup();
        this._despawn(i);
        continue;
      }
      if (d.life <= 0) this._despawn(i);
    }
  }
}
