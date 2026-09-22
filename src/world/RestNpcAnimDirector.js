import { REST_NPC_POSE_POLICY, REST_NPC_GESTURES } from '../assets/RestNpcAnimManifest.js';
import * as THREE from 'three';
import { RestNpcGesturePlayer } from './RestNpcGesturePlayer.js';
import { RestNpcProceduralGestures } from './RestNpcProceduralGestures.js';
import { mergeRestNpcGestureClips } from './RestNpcGestureClipLoader.js';

/** 营火 NPC 动画总导演 — 坐姿/挥手/对话姿态（扩写层，不侵入 RestNpcManager 核心） */
export class RestNpcAnimDirector {
  constructor(game) {
    this.game = game;
    this.layers = new Map();
    this.greetCd = {};
    this._bindEvents();
  }

  attachRestNpcs(restNpcs) {
    for (const npc of restNpcs) {
      const layer = {
        npc,
        glb: new RestNpcGesturePlayer(npc.model),
        proc: new RestNpcProceduralGestures(npc),
        policy: REST_NPC_POSE_POLICY[npc.id] ?? REST_NPC_POSE_POLICY.hub,
      };
      this.layers.set(npc.id, layer);
      this._applyDefaultPose(layer);
      mergeRestNpcGestureClips(npc.model).then((n) => {
        if (n > 0) console.info('[RestNpcAnim] merged gestures', npc.id, n);
      });
    }
  }

  _bindEvents() {
    window.addEventListener('rest-dialogue-open', (e) => this._onDialogueOpen(e.detail));
    window.addEventListener('rest-dialogue-node', (e) => this._onDialogueNode(e.detail));
    window.addEventListener('rest-dialogue-close', (e) => this._onDialogueClose(e.detail));
    window.addEventListener('rest-npc-greet', (e) => this._onGreet(e.detail));
    window.addEventListener('dialog-choice-picked', (e) => {
      if (e.detail?.action === 'rest') this._onRestPicked(e.detail.restId);
    });
  }

  _layer(restId) {
    return this.layers.get(restId);
  }

  _applyDefaultPose(layer) {
    const p = layer.policy.defaultPose;
    if (p === 'sit') this.playGesture(layer.npc.id, 'sit', true);
  }

  playGesture(restId, gestureName, silent = false) {
    const layer = this._layer(restId);
    if (!layer) return;

    const gKey = gestureName;
    if (gKey === 'stand') {
      layer.proc.resetPose();
      layer.glb.returnToIdle(layer.npc.model.config?.idleAnim);
      return;
    }

    const played = layer.glb.playGesture(gKey);
    if (!played) {
      const def = REST_NPC_GESTURES[gKey] ?? REST_NPC_GESTURES.wave;
      layer.proc.setPose(def?.fallback ?? 'procedural_wave');
    }
    if (!silent) {
      window.dispatchEvent(new CustomEvent('rest-npc-gesture', { detail: { restId, gesture: gKey } }));
    }
  }

  _onDialogueOpen(detail) {
    const layer = this._layer(detail.restId);
    if (!layer) return;
    const pose = layer.policy.onDialogue;
    if (pose === 'sitTalk') this.playGesture(detail.restId, 'sitTalk');
    else if (pose === 'stand') this.playGesture(detail.restId, 'stand');
    this.playGesture(detail.restId, 'wave');
  }

  _onDialogueNode(detail) {
    if (detail.mood === 'warn') this.playGesture(detail.restId, 'point');
    else if (Math.random() < 0.35) this.playGesture(detail.restId, 'wave');
  }

  _onDialogueClose(detail) {
    const layer = this._layer(detail?.restId);
    if (!layer) return;
    layer.proc.resetPose();
    layer.glb.returnToIdle(layer.npc.model.config?.idleAnim);
    this._applyDefaultPose(layer);
  }

  _onGreet(detail) {
    this.playGesture(detail.restId, detail.gesture ?? 'greet');
  }

  _onRestPicked(restId) {
    this.playGesture(restId, 'wave');
  }

  tryGreetNear(playerPos) {
    for (const [id, layer] of this.layers) {
      const cd = this.greetCd[id] ?? 0;
      if (cd > 0) continue;
      layer.npc.mesh.getWorldPosition(this._w ?? (this._w = new THREE.Vector3()));
      const d = Math.hypot(playerPos.x - this._w.x, playerPos.z - this._w.z);
      if (d < 5.5 && d > 2.5 && !this.game.dialog?.open) {
        if (Math.random() < 0.002) {
          this.playGesture(id, 'wave');
          this.greetCd[id] = 20;
          window.dispatchEvent(new CustomEvent('rest-npc-greet', { detail: { restId: id } }));
        }
      }
    }
  }

  update(dt, playerPos) {
    for (const id of Object.keys(this.greetCd)) {
      this.greetCd[id] = Math.max(0, (this.greetCd[id] ?? 0) - dt);
    }
    for (const layer of this.layers.values()) {
      layer.glb.update(dt);
      layer.proc.update(dt);
    }
    if (playerPos) this.tryGreetNear(playerPos);
  }
}
