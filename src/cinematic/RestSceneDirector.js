import * as THREE from 'three';
import { CAMERA_OVERRIDES_NONE } from '../engine/CameraRig.js';

import { on, offAll } from '../engine/EventBus.js';

const CINEMATIC_RESTSCENEDIRECTOR = 'cinematic/RestSceneDirector';
const restSceneOn = (name, handler) => on(name, handler, CINEMATIC_RESTSCENEDIRECTOR);
/** 营火对话 — 柔和轨道镜头，与 RestNpc 联动 */
export class RestSceneDirector {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第七处） */
  dispose() {
    offAll(CINEMATIC_RESTSCENEDIRECTOR);
  }

  constructor(game) {
    this.game = game;
    this.active = false;
    this.timer = 0;
    this.restId = null;
    this.npcWorld = new THREE.Vector3();
    this.fireWorld = new THREE.Vector3();
    this.orbitCenter = new THREE.Vector3();
    this._angle = 0;
    this._tmp = new THREE.Vector3();

    restSceneOn('rest-dialogue-open', (e) => this._onOpen(e.detail));
    restSceneOn('rest-dialogue-close', () => this.release('dialogue'));
    restSceneOn('dialog-overlay-hidden', () => this.release('dialogue'));
  }

  _onOpen(detail) {
    if (this.game.combatCamera?.active) return;
    const rest = this.game.restPoints?.points?.find((p) => p.id === detail?.restId);
    const npc = this.game.restNpcs?.getByRestId?.(detail.restId);
    if (!rest) return;

    this.active = true;
    this.timer = 0;
    this.restId = detail.restId;
    rest.mesh.getWorldPosition(this.fireWorld);
    if (npc?.mesh) npc.mesh.getWorldPosition(this.npcWorld);
    else this.npcWorld.copy(this.fireWorld).add(new THREE.Vector3(1.2, 0, 0.6));

    this.orbitCenter.lerpVectors(this.fireWorld, this.npcWorld, 0.45);
    this.orbitCenter.y += 1.1;

    const p = this.game.player.position;
    this._angle = Math.atan2(p.x - this.orbitCenter.x, p.z - this.orbitCenter.z);
  }

  release(reason) {
    if (!this.active) return;
    if (reason === 'combat') {
      this.active = false;
      this.restId = null;
    } else if (this.active) {
      this.active = false;
      this.restId = null;
    }
  }

  getCameraOverrides() {
    if (!this.active || this.game.combatCamera?.active) {
      // 必须交完整形状：读方无条件取 `.pull`，缺字段会让主相机整帧 NaN
      return CAMERA_OVERRIDES_NONE;
    }
    const t = Math.min(this.timer, 1.2);
    const blend = 1 - Math.exp(-t * 2.8);
    this._angle += 0.0008;

    const radius = THREE.MathUtils.lerp(6.8, 5.2, blend);
    const height = 1.65 + Math.sin(this.timer * 0.9) * 0.08;
    const pos = this._tmp.set(
      this.orbitCenter.x + Math.sin(this._angle) * radius,
      this.orbitCenter.y + height,
      this.orbitCenter.z + Math.cos(this._angle) * radius
    );

    const lookAt = new THREE.Vector3(
      this.npcWorld.x,
      this.npcWorld.y + 1.35,
      this.npcWorld.z
    ).lerp(new THREE.Vector3(this.fireWorld.x, this.fireWorld.y + 1.0, this.fireWorld.z), 0.35);

    return {
      pull: 0.6 * blend,
      fovAdd: -3 * blend,
      lookBias: 0.55 * blend,
      focus: this.npcWorld,
      lockOrbit: blend > 0.25,
      orbit: { position: pos, lookAt, blend: blend * 0.82 },
    };
  }

  update(dt) {
    if (!this.active) return;
    this.timer += dt;
    if (this.timer > 8 && !this.game.dialog?.open) this.release('timeout');
  }
}
