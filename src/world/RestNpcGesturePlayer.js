import * as THREE from 'three';
import { REST_NPC_GESTURES } from '../assets/RestNpcAnimManifest.js';

/** Mixamo Clip 手势播放层 — 不修改 RestNpcModel 本体 */
export class RestNpcGesturePlayer {
  constructor(model) {
    this.model = model;
    this.mixer = model.mixer;
    this.actions = model.actions ?? {};
    this.currentGesture = null;
    this.gestureTimer = 0;
    this.baseIdle = null;
  }

  _pickClip(gestureKey) {
    const def = REST_NPC_GESTURES[gestureKey];
    if (!def) return null;
    for (const name of def.clipNames) {
      if (this.actions[name]) return this.actions[name];
      const hit = Object.keys(this.actions).find((k) =>
        k.toLowerCase().includes(name.toLowerCase()) && name.length > 3
      );
      if (hit) return this.actions[hit];
    }
    return null;
  }

  playGesture(gestureKey, onDone) {
    const def = REST_NPC_GESTURES[gestureKey];
    const action = this._pickClip(gestureKey);
    if (!action || !this.mixer) return false;

    if (!this.baseIdle && this.model.currentAction) {
      this.baseIdle = this.model.currentAction;
    }

    if (this.model.currentAction && this.model.currentAction !== action) {
      this.model.currentAction.fadeOut(0.12);
    }

    action.reset();
    action.setLoop(def.loop ? THREE.LoopRepeat : THREE.LoopOnce, def.loop ? Infinity : 1);
    action.clampWhenFinished = !def.loop;
    action.fadeIn(0.12).play();
    this.model.currentAction = action;
    this.currentGesture = gestureKey;
    this.gestureTimer = def.loop ? 9999 : (def.duration ?? 1.5);
    this._onDone = onDone;
    return true;
  }

  returnToIdle(idleAnimList) {
    this.currentGesture = null;
    this.gestureTimer = 0;
    const name = this.model._pickAnim?.(idleAnimList ?? this.model.config?.idleAnim);
    if (name && this.actions[name]) {
      const a = this.actions[name];
      if (this.model.currentAction && this.model.currentAction !== a) this.model.currentAction.fadeOut(0.2);
      a.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
      this.model.currentAction = a;
    }
  }

  update(dt) {
    if (!this.currentGesture || this.gestureTimer > 9000) return;
    this.gestureTimer -= dt;
    if (this.gestureTimer <= 0) {
      this._onDone?.();
      this._onDone = null;
      this.returnToIdle();
    }
  }
}
