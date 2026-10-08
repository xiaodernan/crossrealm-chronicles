import * as THREE from 'three';
import { dropChance, gearIsUpgrade, isGearInstance, rarityRank, rollBossGear, rollGear } from '../content/gear.js';
import { getColorVisionMode, rarityTint } from './ColorVision.js';

/** 地上那一件的形状全系统共用一份：档位只改颜色，不改几何 */
const DROP_RADIUS = 0.25;
/** 魂的光色写在这里，装备的光色查表 —— 两边的分工与 `content/gear.js` 的显示档一致 */
const SOUL_TINT = 0x44ddff;
const SOUL_EMISSIVE = 0x116688;
/** 没人捡的掉落物在地上留多久（秒，走主循环 dt） */
const DROP_LIFE = 30;
/** 身体的浮动基准与幅度：地面环与光柱的贴地补偿都从这两个数推导（不再出现第二个 -0.78） */
const BOB_BASE = 0.8;
const BOB_AMP = 0.3;
/** 地面环贴地高度与光柱中心高度（世界坐标，自地面算起；光柱高 3 米） */
const RING_Y = 0.02;
const BEAM_CENTER_Y = 1.5;
/** 光柱的固定透明度：它是"这件值得捡"的语义灯，不随呼吸脉冲（环负责呼吸） */
const BEAM_OPACITY = 0.22;

/**
 * 地面环的档位规格（环径倍率与环光强度）。形状与生命周期归掉落层（与 `DROP_RADIUS` 同一分工），
 * 颜色仍查表 —— 但走 `rarityTint()`（`game/ColorVision.js`），它按**当前色觉档**取值。
 * 键集与 `GEAR_RARITY` 逐一对齐由用例双向钉住：多一格是死格，少一格那一档的环会当场炸而不是悄悄变小。
 */
export const DROP_RING_BY_RARITY = Object.freeze({
  common: Object.freeze({ scale: 1, opacity: 0.3 }),
  uncommon: Object.freeze({ scale: 1.25, opacity: 0.4 }),
  rare: Object.freeze({ scale: 1.55, opacity: 0.55 }),
  epic: Object.freeze({ scale: 1.9, opacity: 0.7 }),
});

/** 魂那一枚没有档位：固定一档（比凡品的环再小一点、暗一点） */
export const DROP_RING_SOUL = Object.freeze({ scale: 0.85, opacity: 0.28 });

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
 *
 * 切片7 起每格是"三件套"：八面体（本体）+ 地面环（档位色、档位环径，贴地呼吸）+ 高亮光柱
 * （只有"比身上那件严格更好"的装备才亮 —— 判据问 `gearIsUpgrade`，与捡起时换不换是同一个答案）。
 * 环与柱是本体网格的**孩子**，随格一起借还：资源账仍按格计 —— 全局三份共享几何
 * （八面体 / 环 / 柱），每格三份材质 —— 与同时在场峰值挂钩，不与累计掉落数挂钩。
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
    /** 环躺平（XZ 面）与光柱共用：两份几何全局各一份，网格按格借还 */
    this.ringGeometry = new THREE.RingGeometry(0.32, 0.46, 24);
    this.beamGeometry = new THREE.CylinderGeometry(0.035, 0.035, 3, 6);
    /**
     * 上色时用的色觉档（W-D6 切片3）。玩家在设置里换档时，`update` 比对出差异就重涂全场 ——
     * 可访问性开关半生效（新掉落是新色、旧掉落是旧色）比不生效更难查。
     */
    this._tintMode = getColorVisionMode();
  }

  /**
   * 取一格：池里有用完的就复用，没有才新建。
   * 一格 = 本体 + 环 + 柱三件网格（后两件是本体的孩子，复用与归还都跟着走）。
   * 材质必须每格一份 —— 档位色就写在材质上，共用一份会变成"后掉的那件改掉前掉那件的颜色"。
   */
  _acquire() {
    const slot = this._pool.pop() ?? this._build();
    // 复用的那一格带着上一件的自转：不洗一眼就看得出"这件是第二次掉在地上"
    slot.mesh.rotation.set(0, 0, 0);
    this.scene.add(slot.mesh);
    return slot;
  }

  /** 新建一格（只在池子空时走到这里）：三件网格、三份材质，几何全是共享的那三份 */
  _build() {
    const mesh = new THREE.Mesh(
      this.geometry,
      new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.2, emissiveIntensity: 0.9 }),
    );
    const ring = new THREE.Mesh(
      this.ringGeometry,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    const beam = new THREE.Mesh(
      this.beamGeometry,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.add(ring);
    mesh.add(beam);
    return { mesh, ring, beam };
  }

  /** 还回池里而不是丢掉：从场景摘出去，三件网格留着下一件接着用 */
  _release(d) {
    this.scene.remove(d.mesh);
    this._pool.push({ mesh: d.mesh, ring: d.ring, beam: d.beam });
  }

  /** 池里备用网格数：泄漏 watchdog 与用例都看这个，不翻内部结构 */
  pooled() {
    return this._pool.length;
  }

  /**
   * 环与柱的贴地补偿：它们挂在浮动的身体下面，这里把世界高度拉回地面（同一处算术，spawn 与每帧共用）。
   * 地面参照与身体一致（身体跟着玩家当前位置的地面走）—— 环因此永远躺在"脚边那一层"。
   */
  _lay(d, groundY) {
    const 浮动 = BOB_BASE + Math.sin(d.phase) * BOB_AMP;
    d.mesh.position.y = groundY + 浮动;
    d.ring.position.y = RING_Y - 浮动;
    d.beam.position.y = BEAM_CENTER_Y - 浮动;
  }

  /**
   * 上色：档位色查表（`rarityTint` 按**当前**色觉档取），魂走固定的那一对常数。
   *   - 出生时调一次；
   *   - 玩家在设置里换色觉档时，`update` 对所有在场掉落再调一次（见文件头"生效时机"）。
   * 抽成方法而不是写在 `_spawn` 里，就是因为有这两个调用点 —— 抄第二遍的表现是
   * "切了色盲档，新掉的是新色、旧掉的还是旧色"，而那正是可访问性开关最怕的半生效。
   */
  _paint(d) {
    const tint = d.gear ? rarityTint(d.gear.rarity) : SOUL_TINT;
    d.mesh.material.color.setHex(tint);
    d.mesh.material.emissive.setHex(d.gear ? tint : SOUL_EMISSIVE);
    d.ring.material.color.setHex(tint);
    d.beam.material.color.setHex(tint);
  }

  _spawn(pos, { souls, gear }) {
    const { mesh, ring, beam } = this._acquire();
    const look = gear ? DROP_RING_BY_RARITY[gear.rarity] : DROP_RING_SOUL;
    const d = { mesh, ring, beam, souls, gear, life: DROP_LIFE, phase: this.rng() * Math.PI * 2, look };
    this._paint(d);
    mesh.position.copy(pos);
    ring.material.opacity = look.opacity;
    ring.scale.setScalar(look.scale);
    beam.material.opacity = BEAM_OPACITY;
    // 高亮光柱：出生那一刻先问一次；之后每帧 update 从**活的**装备账再问（换上/卸下当场跟上）
    beam.visible = gear ? gearIsUpgrade(this.stats?.gear ?? null, gear) : false;
    this.drops.push(d);
    this._lay(d, pos.y);
    // 装备落地的一声，档位越高越亮（魂不响 —— 捡起时那一声才是魂的）
    if (gear) this.audio?.gearDrop(rarityRank(gear.rarity));
    return d;
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
    this._release(d);
  }

  update(dt, playerPos, pickupRadius = 2.5) {
    // 色觉档换了就重涂全场（W-D6 切片3）：见构造处 `_tintMode` 的注释
    const mode = getColorVisionMode();
    if (mode !== this._tintMode) {
      this._tintMode = mode;
      for (const d of this.drops) this._paint(d);
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      d.phase += dt * 3;
      this._lay(d, playerPos.y);
      d.mesh.rotation.y += dt * 2;
      // 环呼吸：环径与环光一起起伏，倍率来自出生时的档位规格（表在 `DROP_RING_BY_RARITY`）
      const 呼吸 = Math.sin(d.phase);
      d.ring.scale.setScalar(d.look.scale * (1 + 呼吸 * 0.12));
      d.ring.material.opacity = d.look.opacity * (0.8 + 呼吸 * 0.2);
      // 高亮光柱：每帧从**活的**装备账问"这一件比身上好吗"（判据在 `gearIsUpgrade` 只有一处）；
      // 魂没有柱，出生时就是灭的
      if (d.gear) d.beam.visible = gearIsUpgrade(this.stats?.gear ?? null, d.gear);

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

