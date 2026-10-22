import * as THREE from 'three';
import { codeFor } from '../content/keybinds.js';
import { attachToHand, STAFF_GRIP } from '../player/WeaponGrip.js';
import { t } from '../engine/i18n.js';

/**
 * 双武器：剑（近战）/ 杖（法术增幅）— 键位见 `content/keybinds.js` 的 `swapWeapon`。
 * **模块内私有**：只有 `get weapon()` 读它（`export` 曾挂在这里，但全仓 src+tests 无一处
 * import —— 名字经"换武器"事件送到 HUD，走的是事件 detail，不是这个导出）。
 */
const WEAPONS = {
  sword: {
    id: 'sword',
    name: '位面长剑',
    meleeMult: 1.15,
    spellMult: 1,
    skillMult: 1,
    color: 0xc9a962,
  },
  staff: {
    id: 'staff',
    name: '奥术法杖',
    meleeMult: 0.85,
    spellMult: 1.35,
    skillMult: 1.2,
    color: 0x8844ff,
  },
};

/**
 * 法杖的几何与浮动（切片11）。
 * - `杖身长` 只在这里写一次：几何、杖珠的静止位、浮动的锚点全从它推导。
 * - `躯干挂点 / 躯干侧倾` 是**胶囊退路**那一档（没有手骨可挂时住在视觉层的哪个位置）——
 *   进手的那条路径由 `WeaponGrip.attachToHand` 重写局部变换，不看这两个数。
 * - `杖珠静止 = [0, 杖身长/2, 0]` 是**杖身局部**：珠挂杖身，所以浮动口径与"这根杖住在握持层
 *   还是视觉层"无关（改前它是 `player.mesh` 的兄弟节点，锚点是那个抄本 `1.75`）。
 */
const 杖身长 = 1.4;
const 躯干挂点 = Object.freeze([0.5, 1.1, 0]);
const 躯干侧倾 = -0.15;
const 珠静止 = Object.freeze([0, 杖身长 / 2, 0]);
/** `角速度` 的单位是**弧度/秒**（B118 之前是 0.004 弧度/毫秒，且相位直接取墙钟 ⇒ 定帧时杖珠仍浮） */
const 珠浮 = Object.freeze({ 幅: 0.08, 角速度: 4 });

export class WeaponSystem {
  constructor(player, dialog, audio) {
    this.player = player;
    this.dialog = dialog;
    this.audio = audio;
    this.current = 'sword';
    this.cooldown = 0;
    this._时相 = 0;           // B118：杖珠浮动的相位改走世界时积分（改前吃墙钟）
    this._buildStaffMesh();
    /**
     * 挂点必须等骨架就位。生产里 `new WeaponSystem` 在 `Game` 的构造函数里跑（`core/Game.js`），
     * 而 `main.js` 那句 `await game.player.modelReady` 在它**之后** ⇒ 构造那一刻 `boneOf` 一定
     * 认不出右手，直接在构造函数里挂就等于把 B113③ 原样再写一遍。
     * 挂好之后补一次 `applyVisual`：读档（`game/SaveSystem.js`）可能在这之前就切到了法杖，
     * 那时两件还没进树，可见性开关是空跑。
     */
    this.mountReady = Promise.resolve(this.player.modelReady).then(() => this._mountStaff());
    this.applyVisual();
  }

  _buildStaffMesh() {
    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 杖身长, 6),
      new THREE.MeshStandardMaterial({ color: 0x5533aa, emissive: 0x220044, emissiveIntensity: 0.5, metalness: 0.4 })
    );
    staff.position.fromArray(躯干挂点);
    staff.rotation.z = 躯干侧倾;
    staff.name = 'staff';
    staff.visible = false;

    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xaa66ff, emissive: 0x6622aa, emissiveIntensity: 0.9 })
    );
    orb.position.fromArray(珠静止);
    orb.name = 'staffOrb';
    orb.visible = false;
    // 两件都只**建**不挂：挂在哪儿由 `_mountStaff` 决定（要等骨架）。
    staff.add(orb);
    this._staff = staff;
    this._orb = orb;
    // 记下自己造的那四份资源：拆的时候要还掉（改前这一层**没有** `dispose()` ⇒ 它们永远不还）
    this._own = {
      杖几何: staff.geometry,
      杖材质: staff.material,
      珠几何: orb.geometry,
      珠材质: orb.material,
    };
  }

  /**
   * 拆干净：把杖从手上摘下来，释放它那四份资源（W-C1 切片3h）。
   *
   * 为什么现在才有：`Game._adopt` **拒绝**没有 `dispose()` 的子系统（"假装收编"的防线），
   * 而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒ `Game.dispose()` 走完，
   * 杖身与珠那四份资源**一份都不还**。
   */
  dispose() {
    // 杖挂在**手的骨**上（`attachToHand`）⇒ 摘的时候得从它真正的父节点上摘
    this._staff?.parent?.remove(this._staff);
    for (const r of Object.values(this._own ?? {})) r?.dispose?.();
    this._own = null;
    this._staff = null;
    this._orb = null;
  }

  /**
   * 法杖进**右手骨**（B113③）：改前两件都是 `player.mesh.add(...)`，挂在逻辑节点上 ——
   * `proc.pitch` 从 0 写到 −0.35 时杖的世界位移实测 **0.0000 米**（同一时刻手里的剑动 0.2812 米），
   * 在戏姿态下静止杖心离右手 0.859 米、离左手 0.277 米 ⇒ 按切片9 的肩线口径它悬在左手外侧。
   * 只有胶囊（没有手臂骨）⇒ 退**视觉层**那一个根：那才是承载 proc 三份值的层（切片6/7 的分家）。
   * 退路不留 `swingRest`：`CombatController` 只按 `'weapon'` 找武器，给杖记一个它读不到的记号
   * 等于宣称一个不存在的写者。
   */
  _mountStaff() {
    const 模型 = this.player.characterModel;
    const 右手 = 模型.boneOf(STAFF_GRIP.骨标签);
    if (右手) attachToHand(右手, this._staff, STAFF_GRIP);
    else 模型.modelRoot.add(this._staff);
    this.applyVisual();
  }

  get weapon() { return WEAPONS[this.current]; }

  get meleeMult() { return this.weapon.meleeMult; }
  get spellMult() { return this.weapon.spellMult; }
  get skillMult() { return this.weapon.skillMult; }

  toggle() {
    if (this.cooldown > 0) return;
    this.current = this.current === 'sword' ? 'staff' : 'sword';
    this.cooldown = 0.6;
    this.applyVisual();
    this.dialog.toast(t('weapon_switch', { name: this.weapon.name }));
    this.audio?.weaponSwitch?.();
    window.dispatchEvent(new CustomEvent('weapon-changed', { detail: { weapon: this.current, name: this.weapon.name } }));
  }

  applyVisual() {
    const sword = this.player.mesh.getObjectByName('weapon');
    const staff = this.player.mesh.getObjectByName('staff');
    const orb = this.player.mesh.getObjectByName('staffOrb');
    const isStaff = this.current === 'staff';
    if (sword) sword.visible = !isStaff;
    if (staff) staff.visible = isStaff;
    if (orb) orb.visible = isStaff;
  }

  update(dt, keys) {
    this._时相 += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (keys[codeFor('swapWeapon')]) {
      keys[codeFor('swapWeapon')] = false;
      this.toggle();
    }
    // 浮动画在**杖身局部**：锚点与珠的静止位是同一个推导（`珠静止[1] = 杖身长/2`）。
    // 改前那句 `orb.position.y = 1.75 + …` 写的是逻辑节点上的挂点坐标 —— 换一次挂层就得跟着
    // 供一份那个抄本，这正是 B113③ 留到本篇的尾巴。
    if (this._orb.visible) this._orb.position.y = 珠静止[1] + Math.sin(this._时相 * 珠浮.角速度) * 珠浮.幅;
  }
}
