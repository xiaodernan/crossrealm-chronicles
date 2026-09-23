import * as THREE from 'three';

/**
 * 世界空间 UI 的朝向与容器（W-A3）。
 *
 * ## 要修的是什么
 *
 * 敌人血条、锁定标记、头顶警示此前都是**挂在敌人身体 `mesh` 上的子节点**，
 * 而那个 group 的旋转同时承担两件事：
 * - `facePoint()` 写 `rotation.y` —— 让敌人朝移动方向（血条跟着转）；
 * - `wobble()` 写 `rotation.z` —— 悬浮单位的摆动（血条跟着歪）。
 *
 * 于是从侧面看血条缩成一条线，从背后看是镜像，无人机摆一下血条跟着摇。
 * 这是"世界空间 UI 挂在了会动的骨骼上"的经典错误：UI 的朝向该由**相机**决定，
 * 与载体的姿态无关。
 *
 * ## 修法
 *
 * 1. 这类 UI 一律挂到**场景根**下（`Billboard` 自己在构造函数里 `scene.add`），
 *    位置每帧按世界锚点跟随 —— 因此不继承身体的旋转，也不继承身体的倾斜；
 * 2. 朝向**只绕 Y 轴**对齐相机（不抄相机四元数）：抄四元数会让血条随俯仰一起翻，
 *    玩家抬头看天时血条变成竖的。绕 Y 的"圆柱式公告板"是血条的正确形态 ——
 *    它永远水平、永远正对观察者。
 *
 * ## 为什么正上方要退回上一帧
 *
 * 相机正对锚点的正上/正下方时，水平夹角在数学上无定义（dx=dz=0）。
 * 此时退回**上一帧的朝向**而不是跳 0，否则玩家从敌人头顶掠过时会看到
 * 血条瞬间甩一下。
 */

/**
 * 锚点朝向相机的水平角（纯函数，可单测）。
 *
 * 返回的角是"把默认朝向 +Z 的平面转到正对相机"所需的 `rotation.y`：
 * 旋转后局部 +Z 映射到世界 `(sin yaw, 0, cos yaw)`，即锚点指向相机的水平方向。
 *
 * @param {{x:number, y:number, z:number}} anchor 世界坐标（只读 x/z）
 * @param {{x:number, y:number, z:number}} camPos 相机世界坐标（只读 x/z）
 * @param {number} [fallback] 锚点与相机水平重合时返回的角
 * @returns {number} 弧度
 */
export function yawToCamera(anchor, camPos, fallback = 0) {
  const dx = camPos.x - anchor.x;
  const dz = camPos.z - anchor.z;
  // 阈值取 1e-4 米（0.1 毫米）：这个量级以下的方向噪声比"甩一下"更难看
  if (dx * dx + dz * dz < 1e-8) return fallback;
  return Math.atan2(dx, dz);
}

/** 兜底容器：没有场景可挂时（单测里直接 new 敌人）也要能用 */

/**
 * 一块挂在场景根、跟随世界锚点、按相机水平朝向的 UI 容器。
 *
 * 用法（见 `combat/Enemy.js`）：
 * ```js
 * const bar = new Billboard(scene, { name: 'hpBar', offsetY: 2.8 });
 * bar.add(bgMesh, fillMesh);
 * bar.setVisible(true);
 * // 每帧：
 * bar.follow(enemy.mesh.position);
 * bar.faceCamera(ctx.camera);
 * ```
 */
export class Billboard {
  /**
   * @param {THREE.Scene | null | undefined} scene 传空则只建对象不挂场景（单测用）
   * @param {{ name?: string, offsetY?: number }} [options]
   *        `offsetY` 是相对锚点的世界高度偏移 —— 写在世界坐标里，因此不随身体倾斜
   */
  constructor(scene, options = {}) {
    this.scene = scene ?? null;
    /** 相对锚点的世界高度偏移 */
    this.offsetY = options.offsetY ?? 0;
    this.object3D = new THREE.Group();
    this.object3D.name = options.name ?? 'billboard';
    this.object3D.visible = false;
    /** 上一帧朝向：相机正上/正下方时用它兜底 */
    this._yaw = 0;
    this._disposed = false;
    if (this.scene) this.scene.add(this.object3D);
  }

  /** 挂进容器的子对象（bg / fill / 标记…） */
  add(...objects) {
    for (const o of objects) if (o) this.object3D.add(o);
    return this;
  }

  get visible() {
    return this.object3D.visible;
  }

  setVisible(v) {
    this.object3D.visible = !!v;
  }

  /**
   * 跟随世界锚点。锚点通常是敌人网格原点（脚下），因此 `offsetY` 给的是
   * "血条离地多高"这个直观量，而不是某个骨骼的局部坐标。
   *
   * @param {{x:number, y:number, z:number}} anchor
   */
  follow(anchor) {
    if (this._disposed) return;
    this.object3D.position.set(anchor.x, anchor.y + this.offsetY, anchor.z);
  }

  /**
   * 只绕 Y 轴对齐相机；`camPos` 缺省时保持上一帧朝向（没有相机就没有朝向依据，
   * 不是"朝向原点"）。
   *
   * @param {{x:number, y:number, z:number} | null | undefined} camPos
   */
  faceCamera(camPos) {
    if (this._disposed || !camPos) return;
    this._yaw = yawToCamera(this.object3D.position, camPos, this._yaw);
    this.object3D.rotation.y = this._yaw;
  }

  /** 当前朝向（弧度）——测试与调试用 */
  get yaw() {
    return this._yaw;
  }

  /**
   * 从场景摘下并释放几何与材质。
   * 幂等：重复调用不会二次 dispose（敌人重生路径可能走到两次）。
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this.scene) this.scene.remove(this.object3D);
    this.object3D.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    // 摘干净引用：dispose 之后再 follow/faceCamera 是调用方的 bug，
    // 那两个方法会因 `_disposed` 直接早退（不作用在已释放的几何上）
    this.object3D.clear?.();
    this.scene = null;
  }
}
