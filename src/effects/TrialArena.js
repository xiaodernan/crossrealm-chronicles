/**
 * 位面试炼的场地边界（W-F3 切片5）—— 一圈地面光环 + 八根细光柱。
 *
 * ## 为什么需要它
 *
 * 切片3 把试炼变成"以玩家为圆心的场"，但那个场**在画面上不存在**：玩家会一路
 * 追着怪跑出 12 米，然后奇怪为什么不再刷怪。规则没有说出口，就等于没有规则。
 *
 * ## 为什么不做成"墙"
 *
 * 试炼允诺的是"限时清剿"，不是"关进笼子"。把场地做成实心墙会把玩家真正关起来，
 * 而这个场是**在已有世界里临时划出来的**（可能压在一条路上、一座桥边）。
 * 一圈会呼吸的光比墙诚实：它说的是"这里是场"，不是"你出不去"。
 *
 * ## 单位的取法
 *
 * 环是**单位半径**的几何（`0.985 ~ 1.0`），半径靠 `scale` 拉 —— 造一个 12 米的环
 * 等于把半径焊死在几何里，下次改数值就得重建几何。柱子反过来：它们要**各自的
 * 位置**（8 个角），所以位置在 `show()` 里按半径重算，几何只有一份。
 *
 * ## 所有权
 *
 * 造它的只有 `TrialSystem`（首次开局），拆它的也只有 `TrialSystem.dispose()`。
 * 中途结束只 `hide()` —— 一局结束不等于这个对象该被重建，下一局还要用。
 * 这符合仓库那条纪律：**`new THREE.*` 必须有创建者，也必须有销毁者**。
 */
import * as THREE from 'three';

/** 场边光柱的根数：8 根 = 每 45° 一根，站在场内任一点都至少看得见两根 */
const PILLAR_COUNT = 8;
/** 光柱高度（米）—— 比玩家高一头就够，太高既挡远景又费像素 */
const PILLAR_HEIGHT = 3.6;
/** 柱心的 y（几何是居中的，所以要抬到高度的一半） */
const PILLAR_Y = PILLAR_HEIGHT / 2;
/** 地面环离地高度：贴到 0 会与地形 z-fighting，0.06 在第三人称视角下看不出来 */
const RING_Y = 0.06;

/** 环的呼吸幅度与周期：0.35 ~ 0.65 的透明度，约 2.4 秒一轮 */
const RING_OPACITY_BASE = 0.5;
const RING_OPACITY_SWING = 0.15;
const RING_BREATH_RATE = 2.6;
/** 柱子整体转速（弧度/秒）：极慢，只为"场在运转"，不为炫技 */
const PILLAR_SPIN_RATE = 0.12;

export class TrialArena {
  /**
   * @param {THREE.Scene} scene 场景（构造即挂上，`visible=false` 时什么都不画）
   */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene?.add?.(this.group);
    this._t = 0;
    this._disposed = false;

    /* 单位环：半径靠 scale 拉（见文件头）。`DoubleSide` 是因为地形起伏时从侧面能看到环的背面 */
    this.ringGeo = new THREE.RingGeometry(0.985, 1, 96);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xc9a48a,
      transparent: true,
      opacity: RING_OPACITY_BASE,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = RING_Y;
    this.group.add(this.ring);

    /* 八根柱子共用一份几何与材质：它们只是同一个东西摆在八个角，
     * 各造一份等于让显存里躺着八份一模一样的圆柱 */
    this.pillarGeo = new THREE.CylinderGeometry(0.1, 0.14, PILLAR_HEIGHT, 6, 1, true);
    this.pillarMat = new THREE.MeshBasicMaterial({
      color: 0xd9b18c,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.pillars = new THREE.Group();
    for (let i = 0; i < PILLAR_COUNT; i += 1) {
      const p = new THREE.Mesh(this.pillarGeo, this.pillarMat);
      // 单位圆上的初始位置；真正的半径由 show() 按给定值摆
      const a = (i / PILLAR_COUNT) * Math.PI * 2;
      p.position.set(Math.cos(a), PILLAR_Y, Math.sin(a));
      this.pillars.add(p);
    }
    this.group.add(this.pillars);
  }

  /**
   * 摆到场地上并显形。
   *
   * 脏参数**回落而不是抛**：这一格来自运行时（玩家位置可能还没就绪），
   * 一个坏值不该让整局开不起来 —— 与 `SpawnTuning` / `ZoneFog` 同一口径。
   *
   * @param {{x:number, z:number}} center 场心（世界坐标）
   * @param {number} radius 半径（米）
   */
  show(center, radius) {
    if (this._disposed) return;
    const r = Number.isFinite(radius) && radius > 0 ? radius : 12;
    const x = Number.isFinite(center?.x) ? center.x : 0;
    const z = Number.isFinite(center?.z) ? center.z : 0;
    this.group.position.set(x, 0, z);
    this.ring.scale.setScalar(r);
    const n = this.pillars.children.length;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      this.pillars.children[i].position.set(Math.cos(a) * r, PILLAR_Y, Math.sin(a) * r);
    }
    this.pillars.rotation.y = 0;
    this._t = 0;
    this.group.visible = true;
  }

  /** 藏起来（一局结束）。**不拆** —— 下一局还要用，拆了就是每局重建一次 GPU 资源 */
  hide() {
    if (this._disposed) return;
    this.group.visible = false;
  }

  /** 每帧：环呼吸 + 柱子极慢自转。不新建任何东西（热路径里出现 `new THREE.*` 是要红的） */
  update(dt) {
    if (this._disposed || !this.group.visible) return;
    const step = Number(dt);
    if (!Number.isFinite(step) || step <= 0) return;
    this._t += step;
    this.ringMat.opacity = RING_OPACITY_BASE + Math.sin(this._t * RING_BREATH_RATE) * RING_OPACITY_SWING;
    this.pillars.rotation.y = this._t * PILLAR_SPIN_RATE;
  }

  /**
   * 彻底拆掉：从场景摘组、释放四种共享资源。
   *
   * **重复调用幂等** —— `TrialSystem.dispose()` 会在换档/重开时被走到，
   * 而"拆两次就抛"会让一次重开变成一场崩溃。
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.scene?.remove?.(this.group);
    // 先清空引用再释放：`Group.clear()` 只摘子节点，几何与材质是**共享**的，
    // 逐个 mesh 释放会同一份资源释放八次（three 扛得住，但那是碰运气）
    this.pillars?.clear();
    this.group?.clear();
    this.ringGeo?.dispose();
    this.ringMat?.dispose();
    this.pillarGeo?.dispose();
    this.pillarMat?.dispose();
    this.ring = null;
    this.pillars = null;
    this.group = null;
  }
}
