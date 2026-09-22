import * as THREE from 'three';
import { CAMERA_FOV } from '../content/tuning.js';

/**
 * 「镜头覆盖量」这一层 FOV 偏移的唯一 id。
 * 战斗演出与玩家相机（营火/接管中）都可能想压窄视野，但它们是同一件事的两种来源 ——
 * 用同一个 id 才能让"后写的赢"成为确定行为，而不是两层增量莫名叠成双倍。
 */
export const FOV_LAYER_OVERRIDE = 'camera-override';

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
   */
  setView(position, lookAt) {
    this._pos.copy(position);
    this._look.copy(lookAt);
    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
    return this;
  }

  /** 上一次落笔的注视点（镜头混合与过场进出拿它当起点） */
  lookPoint(out = new THREE.Vector3()) {
    return out.copy(this._look);
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
    return this.commitFov();
  }
}
