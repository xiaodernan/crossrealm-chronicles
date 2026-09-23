import * as THREE from 'three';
import { CAMERA_BLEND } from '../content/tuning.js';

/**
 * 观看模式相机 — 法环式越肩跟随，固定俯角，无需鼠标。
 *
 * 它拿的是 `CameraRig` 而不是 camera：M3 之后全仓库只有 rig 一处能落笔写机位，
 * 任何"另一个系统也算了一个机位"都要走同一个入口，否则两处的平滑会互相覆盖。
 */
export class SpectatorCamera {
  constructor(rig) {
    this.rig = rig;
    this.distance = 6.5;
    this.pitch = 0.32;
    this.smoothPos = new THREE.Vector3();
    this.smoothLook = new THREE.Vector3();
    this._initialized = false;
    this._lastYaw = Math.PI;
  }

  reset() {
    this._initialized = false;
  }

  update(dt, targetPos, moveDirX, moveDirZ) {
    let yaw = this._lastYaw;
    if (Math.abs(moveDirX) > 0.05 || Math.abs(moveDirZ) > 0.05) {
      yaw = Math.atan2(moveDirX, moveDirZ);
      this._lastYaw = yaw;
    }

    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const pivot = new THREE.Vector3(targetPos.x, targetPos.y + 1.45, targetPos.z);
    const desired = new THREE.Vector3(
      pivot.x - Math.sin(yaw) * cosP * this.distance,
      pivot.y + sinP * this.distance,
      pivot.z - Math.cos(yaw) * cosP * this.distance
    );
    const lookAt = pivot.clone();
    lookAt.y += 0.2;

    if (!this._initialized) {
      this.smoothPos.copy(desired);
      this.smoothLook.copy(lookAt);
      this._initialized = true;
    }

    const smooth = 1 - Math.exp(-8 * dt);
    this.smoothPos.lerp(desired, smooth);
    this.smoothLook.lerp(lookAt, smooth);
    this.rig.setView(this.smoothPos, this.smoothLook,
      { owner: 'spectator', transition: CAMERA_BLEND.enter });
  }
}
