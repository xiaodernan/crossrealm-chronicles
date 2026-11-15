/**
 * 任务路标光柱（W-Z104）—— 主世界里给「下一步去哪儿」画一束金色立柱。
 *
 * ## 为什么是世界主体而不是屏幕角标
 *
 * 玩家迷路的原因不是 HUD 没有方向，而是目力朝向的是世界，不是屏幕中央。屏幕角标
 * 需要有意识地瞥一眼；世界里的一束柱子只要抬头就看见。「世界的尽头有一团光在召唤」——
 * 这就是开发意图。它和神殿/副本的既有 `boss-beacon-label` 共用同一套 CSS2DObject +
 * `boss-beacon-label` 变体，风格不会有跨出画的感觉。
 *
 * ## 它挂在哪里、它不挂在哪里
 *
 * 走「主世界路径」才出现：
 *   - `world.provider === 'sidequest'`、`activeDungeon !== null`、或主线已走完 ⇒ 不显示（没有意义）
 *   - 否则：`quests.getQuestWaypoint()` 返回非空 ⇒ 就这么挂上去；否则立杆隐藏
 *
 * 与现有的内置 `quest-assistant` HUD 文字「◉ → label 200m」**互补而不是重复**：
 * 一个是屏幕上看的（精确坐标+文字指向），一个是世界里看的（抬头就是方向）。
 * 两者在几何上是同一份 wp，不会各说各话。
 *
 * ## 生命周期
 *
 * `Game.js` 启动时 `new QuestWaypointBeacon(this)`、放进 `this._adopt('world/QuestWaypointBeacon', ...)`；
 * dispose 会拆掉 DOM/剩余几何。无定时器、无独立命中环、不参与任何战斗判定。
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { t } from '../engine/i18n.js';

export class QuestWaypointBeacon {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'QuestWaypointBeacon';
    this.group.visible = false;

    /* 金色竖柱——与 lore-9「无烟之年残碑」同源美学：不亮，不喧宾夺主 */
    const 柱 = new THREE.CylinderGeometry(0.55, 1.0, 18, 18, 1, true);
    const 柱材 = new THREE.MeshStandardMaterial({
      color: 0xffd98a,
      emissive: 0x8a5a1a,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const 光柱 = new THREE.Mesh(柱, 柱材);
    光柱.position.y = 9;
    光柱.name = 'quest-beacon-pillar';
    this.group.add(光柱);
    this._mat = 柱材;

    /* CSS2D 标签——与 BOSS 头顶的 boss-beacon-label 同源 */
    this._labelDiv = document.createElement('div');
    this._labelDiv.className = 'quest-beacon-label';
    this._labelDiv.innerHTML = '<strong>◉</strong><span></span>';
    this._labelSpan = this._labelDiv.querySelector('span');
    const labelObj = new CSS2DObject(this._labelDiv);
    labelObj.position.set(0, 21, 0);
    this.group.add(labelObj);

    /* 当前 wp 的量化锚——从当前 `questIndex` 到 quest 切到下一格的全过程
       只台架一次；哪一格真正变了，哪个 div 的 textContent 才会被换 */
    this._lastKey = null;
  }

  /** 每帧读一遍 wp：主线路标有效就显示，副本内不举灯 */
  update() {
    const scene = this.game?.scene;
    const wp = this.game?.quests?.getQuestWaypoint?.();
    const alive = wp && !this.game?.dungeons?.active;
    if (!alive) {
      if (this.group.visible) this.group.visible = false;
      if (this._lastKey !== null) this._lastKey = null;
      return;
    }

    if (scene && !this.group.parent) scene.add(this.group);
    const gy = this.game?.world?.getGroundHeight?.(wp.x, wp.z)
      ?? this.game?.world?.getGroundHeightAt?.(wp.x, wp.z)
      ?? 0;
    this.group.position.set(wp.x, gy, wp.z);
    if (!this.group.visible) this.group.visible = true;

    const key = `${wp.label}|${Math.round(wp.x)}|${Math.round(wp.z)}`;
    if (key === this._lastKey) return;
    this._lastKey = key;
    this._labelSpan.textContent = t(wp.label);
  }

  dispose() {
    /* CSS2DObject 挂在 group 上，group 从 scene 移除就够了；几何/材质要手动释放 */
    if (this.group.parent) this.group.parent.remove(this.group);
    for (const child of this.group.children) {
      if (child.isMesh) {
        child.geometry?.dispose?.();
      }
    }
    this._mat?.dispose?.();
    this._mat = null;
    this._labelSpan = null;
    this._labelDiv = null;
  }
}
