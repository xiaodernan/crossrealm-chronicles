import * as THREE from 'three';
import { CAMERA_FOV } from '../content/tuning.js';

/**
 * 「镜头覆盖量」这一层 FOV 偏移的唯一 id。
 * 战斗演出与玩家相机（营火/接管中）都可能想压窄视野，但它们是同一件事的两种来源 ——
 * 用同一个 id 才能让"后写的赢"成为确定行为，而不是两层增量莫名叠成双倍。
 */
export const FOV_LAYER_OVERRIDE = 'camera-override';

/** 没声明 owner 的机位写入归到这里：稳定、不会与任何具名所有者发生交接 */
export const DEFAULT_VIEW_OWNER = 'default';

/**
 * 镜头覆盖量协议的"空表" —— 谁没在接管镜头就返回这一份。
 *
 * 字段必须齐全：`PlayerController` 无条件读 `pull`，缺一个就是 `dist - undefined = NaN`，
 * 整条第三人称轨道（含 CSS2D 标签与后处理的视线）当场变成 NaN。
 * 营火导演曾经正是这么返回的（只有 lockOrbit / orbit / fovAdd），枢纽里的主相机因此每帧算出 NaN；
 * 用例只 stub 了 `restScene: null`（走的是这份完整兜底），所以这个 bug 在测试里是隐形的 ——
 * 现在由 `tests/camera-contract.test.js` 直接拿真实导演类来验形状。
 */
export const CAMERA_OVERRIDES_NONE = Object.freeze({
  pull: 0, fovAdd: 0, lookBias: 0, focus: null, lockOrbit: false, orbit: null, gaze: 0,
});

/**
 * 相机唯一所有者（M3 第一切片）。
 *
 * 收口之前是"谁拿到 camera 谁写一笔"：`PlayerController` 每帧写位置与注视点，
 * `CombatCameraDirector` 每帧写 FOV 并在演出结束时"恢复基准"，`CinematicManager` 在过场期间
 * 直接搬相机，`Game.onResize` 改宽高比。后果不是"不干净"这么简单：一帧里两次
 * `updateProjectionMatrix()` 是白算，而"恢复基准"只要有一条退出路径漏了（跳过、面板抢占、
 * 异常、暂停中演出刚好结束），那个 -11° 就永久留在屏幕上 —— 玩家会以为是自己显卡的问题。
 *
 * 所以这里的关键约定是 **FOV 增量按帧申领**：想偏移的系统每帧 `requestFov(id, delta)` 一次，
 * 主循环末尾 `commitFov()` 落一笔。没有人需要"记得恢复"—— 这帧没人申领，偏移就自己消失。
 * 位置与注视点仍是直接写入（`setView`），但全仓库只有这一个入口。
 *
 * 本模块不决定机位该在哪：第三人称轨道、遮挡回弹、演出绕轨都留在各自系统里算，
 * 它们把结果交进来。rig 只保证"一帧一笔、退出一定能复原"。
 *
 * 生命周期：由 `PlayerController` 持有（它一定拿到 camera），其余系统经 `game.player.rig` 取用。
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    /** 基准 FOV：由镜头模式决定，只有 `setBaseFov()` 能改 */
    this.baseFov = CAMERA_FOV.third;
    /** 上一帧生效的申领（`fovLayers`/`lastFovChange` 读它） */
    this._granted = new Map();
    /** 本帧的申领；`commitFov()` 之后清空，等下一批 */
    this._asking = new Map();
    this._appliedFov = null;
    this._lastChange = null;
    this._look = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    /* —— 变换混合栈（W-A5 切片1）——
     * `_pos/_look` 是本帧**目标**机位（当前所有者想要的），
     * `_appliedPos/_appliedLook` 是**此刻真正在屏幕上**的那一笔（交接补间的起点读它）。
     * `_viewOwner` 是这一帧认领变换的所有者；`_blend` 非空表示正处在一次交接补间里。 */
    this._appliedPos = new THREE.Vector3().copy(camera.position);
    this._appliedLook = new THREE.Vector3();
    this._tmpLook = new THREE.Vector3();
    this._viewOwner = null;
    this._blend = null;
  }

  /** 基准 FOV（第一 / 第三人称切换、初始化）。各层增量留在账上，不被这次切换抹掉 */
  setBaseFov(fov) {
    this.baseFov = fov;
    return this;
  }

  /**
   * 「这一帧我要压多少 FOV」。同名层以最后一次申领为准。
   * 只在确实还想压的时候调用 —— 不想要就别调用，更不要申领一个 0：
   * 那等于把"记得收尾"的义务又塞回每个调用方，正是本模块要消掉的东西。
   */
  requestFov(id, delta) {
    if (delta) this._asking.set(id, delta);
    return this;
  }

  /** 当前生效 FOV（用例与 HUD 读它，不去读 `camera.fov`） */
  fov() {
    let sum = 0;
    for (const d of this._granted.values()) sum += d;
    return this.baseFov + sum;
  }

  /** 还挂着几层偏移：离开战斗后应回到 0，是 FOV 泄漏的现成探针 */
  get fovLayers() {
    return this._granted.size;
  }

  /** 最近一次层的进出（诊断用：想知道"是谁把 FOV 拉走的"） */
  lastFovChange() {
    return this._lastChange;
  }

  /**
   * 主循环在所有系统跑完之后调用一次：落 FOV，然后把本帧申领结算给下一帧。
   * 数值没变就不碰投影矩阵 —— 顺手消掉旧实现"每帧无脑重算投影"的浪费。
   */
  commitFov() {
    let sum = 0;
    for (const d of this._asking.values()) sum += d;
    const fov = this.baseFov + sum;
    const gone = [...this._granted.keys()].filter((k) => !this._asking.has(k));
    const born = [...this._asking.keys()].filter((k) => !this._granted.has(k));
    if (gone.length || born.length) this._lastChange = { gone, born };
    this._granted = new Map(this._asking);
    this._asking.clear();
    if (this._appliedFov === fov) return this;
    this._appliedFov = fov;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    return this;
  }

  /** 当场收掉某一层：跳过演出、进副本这类"不等下一帧"的场合 */
  revokeFov(id) {
    this._asking.delete(id);
    this._granted.delete(id);
    this._appliedFov = null;         // 强制重算一次，不拖到下一帧
    return this.commitFov();
  }

  /**
   * 唯一的机位写入点。两个入参都只读：内部先克隆再落笔，
   * 调用方可以照旧复用临时向量，而不必担心被 rig 反改。
   *
   * **所有权交接补间（W-A5 切片1）**：`opts.owner` 认领这一帧的变换。所有者不变时
   * 直接落笔（调用方自己已经做了阻尼，rig 不再叠第二层 —— 第三人称轨道、观看模式都自平滑）；
   * 所有者**变更**的那一帧（玩家 ↔ 过场 ↔ 观看）从当前画面缓动到新目标，`opts.transition`
   * 是这段交接的秒数。这样"进出过场是一帧硬切"（短板 A4）就没了落脚处，而且**没有一处需要
   * 记得收尾**：过场 `end()` 什么都不用做，下一帧玩家重新认领时 rig 自己把镜头补回去。
   *
   * @param {THREE.Vector3} position
   * @param {THREE.Vector3} lookAt
   * @param {{ owner?: string, transition?: number, snap?: boolean }} [opts]
   */
  setView(position, lookAt, opts = {}) {
    this._pos.copy(position);
    this._look.copy(lookAt);

    const owner = opts.owner ?? DEFAULT_VIEW_OWNER;
    if (this._viewOwner === null) {
      // 首次认领：没有"上一位所有者"可交接，直接落位（也避免从初始 0 注视点起补间）
      this._viewOwner = owner;
      this._apply();
      return this;
    }
    if (owner !== this._viewOwner) {
      // 真正的交接：从当前画面缓动到新目标；snap 或没给 transition 就仍是一帧落位
      const dur = opts.snap ? 0 : (opts.transition ?? 0);
      this._blend = dur > 0
        ? { fromPos: this._appliedPos.clone(), fromLook: this._appliedLook.clone(), t: 0, dur }
        : null;
      this._viewOwner = owner;
    }

    // 补间进行中：本帧不直接落笔，交给 commitView 用最新目标推进（目标每帧在动，补间追随它）
    if (!this._blend) this._apply();
    return this;
  }

  /** 把当前目标 `_pos/_look` 立刻落到相机上（非补间路径的唯一出口） */
  _apply() {
    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
    this._appliedPos.copy(this._pos);
    this._appliedLook.copy(this._look);
  }

  /**
   * 主循环末尾随 `commitFov()` 一起调用：推进一次进行中的交接补间。
   * 用的是 rawDt —— 过场进出是演出，不该被 hitstop / 慢动作拉长（与 `Scheduler` 同一口径）。
   * @param {number} dt
   */
  commitView(dt) {
    if (!this._blend) return this;
    const b = this._blend;
    b.t += dt;
    const k = Math.min(1, b.t / b.dur);
    const e = k * k * (3 - 2 * k);   // smoothstep：两头慢，中段快，起止不突兀
    this.camera.position.copy(b.fromPos).lerp(this._pos, e);
    this._tmpLook.copy(b.fromLook).lerp(this._look, e);
    this.camera.lookAt(this._tmpLook);
    this._appliedPos.copy(this.camera.position);
    this._appliedLook.copy(this._tmpLook);
    if (k >= 1) this._blend = null;
    return this;
  }

  /** 当前认领变换的所有者（诊断 / 门禁读它，别去猜谁在写相机） */
  get viewOwner() {
    return this._viewOwner;
  }

  /** 是否正处在一次交接补间里 */
  get blending() {
    return this._blend !== null;
  }

  /** 上一次落笔的注视点（镜头混合与过场进出拿它当起点） */
  lookPoint(out = new THREE.Vector3()) {
    return out.copy(this._appliedLook);
  }

  /** 窗口尺寸变化：宽高比是相机唯一的"布局"输入 */
  setAspect(aspect) {
    if (this.camera.aspect === aspect) return this;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    return this;
  }

  /**
   * 交出相机：传送、重生、进出副本。所有偏移当场作废，
   * 下一次写入无论来自哪一层都从基准重新起算。
   */
  reset(fov = CAMERA_FOV.third) {
    this._asking.clear();
    this._granted.clear();
    this._appliedFov = null;
    this._lastChange = null;
    this.baseFov = fov;
    // 交出相机：正在进行或待发生的交接一并作废，下一次 setView 从新所有权重新起算（不补间）
    this._blend = null;
    this._viewOwner = null;
    return this.commitFov();
  }
}
