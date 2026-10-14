import * as THREE from 'three';
import { RestNpcModel } from './RestNpcModel.js';
import { REST_NPC_DEFS } from '../content/restNpcDefs.js';

import { on, offAll } from '../engine/EventBus.js';

const WORLD_RESTNPCMANAGER = 'world/RestNpcManager';
const npcOn = (name, handler) => on(name, handler, WORLD_RESTNPCMANAGER);
/** 营火常驻 NPC — Mixamo 模型 + RestDialogue 联动高亮 */


export class RestNpcManager {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第九处） */
  dispose() {
    offAll(WORLD_RESTNPCMANAGER);
  }

  constructor(scene, world, restPoints, game) {
    this.scene = scene;
    this.world = world;
    this.game = game;
    this.npcs = [];
    this.speakingId = null;
    this.highlightId = null;
    this._tmp = new THREE.Vector3();
    this._barkCd = {};
    this._时相 = 0;             // B118：NPC 待机呼吸的相位源改走世界时积分（改前六处各吃墙钟）
    this.build(restPoints);
    this._bindEvents();
  }

  _bindEvents() {
    npcOn('rest-dialogue-open', (e) => {
      const id = e.detail?.restId;
      this.highlightId = id;
      this.speakingId = e.detail?.speakerId ?? id;
      this._setNpcState(id, 'dialogue', e.detail);
      this.getByRestId(id)?.model?.playTalk?.(true);
    });
    npcOn('rest-dialogue-node', (e) => {
      this.speakingId = e.detail?.speakerId ?? e.detail?.restId;
      this._pulseSpeaker(this.speakingId);
      this.getByRestId(e.detail?.restId)?.model?.playTalk?.(true);
    });
    npcOn('rest-dialogue-close', () => {
      for (const n of this.npcs) n.model?.playTalk?.(false);
      this.speakingId = null;
      this.highlightId = null;
      for (const n of this.npcs) n.state = 'idle';
    });
  }

  build(restPoints) {
    for (const point of restPoints.points) {
      const def = REST_NPC_DEFS[point.id];
      if (!def) continue;
      this.npcs.push(this._createNpc(def, point));
    }
  }

  getByRestId(restId) {
    return this.npcs.find((n) => n.id === restId) ?? null;
  }

  _createNpc(def, point) {
    const model = new RestNpcModel(point.id, def);
    const fb = model.buildFallback();

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.04, 6, 24),
      new THREE.MeshBasicMaterial({ color: def.emissive, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.15;
    halo.name = 'halo';
    model.group.add(halo);

    const ember = new THREE.PointLight(def.emissive, 0.35, 6);
    ember.position.y = 1.4;
    model.group.add(ember);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x1a1810, transparent: true, opacity: 0.85 })
    );
    sign.position.set(0, 2.35, 0.5);
    sign.rotation.y = Math.PI;
    model.group.add(sign);

    const bubble = document.createElement('div');
    bubble.className = 'rest-npc-bubble hidden';
    bubble.dataset.restId = point.id;
    document.getElementById('hud')?.appendChild(bubble);

    const [ox, , oz] = def.offset;
    model.group.position.set(ox, 0, oz);
    model.group.rotation.y = Math.atan2(-ox, -oz + 0.001);
    point.mesh.add(model.group);

    model.loadGlb().then((ok) => {
      if (ok) this.game.dialog?.toast?.(`${def.name} 模型已加载`, 1800);
    });

    return {
      id: point.id,
      name: def.name,
      title: def.title,
      accent: def.accent,
      def,
      model,
      mesh: model.group,
      body: fb.body,
      head: fb.head,
      cloak: fb.cloak,
      halo,
      ember,
      sign,
      bubble,
      baseY: 0,
      homeYaw: model.group.rotation.y,
      state: 'idle',
      speakPulse: 0,
    };
  }

  _setNpcState(restId, state, detail) {
    for (const n of this.npcs) {
      n.state = n.id === restId ? state : 'idle';
      if (n.id === restId && detail?.mood === 'warn') n.speakPulse = 1.2;
      else if (n.id === restId) n.speakPulse = 0.8;
    }
    this._pulseSpeaker(this.speakingId);
    const npc = this.getByRestId(restId);
    if (npc?.bubble && detail?.linePreview) {
      npc.bubble.textContent = detail.linePreview.slice(0, 42);
      npc.bubble.classList.remove('hidden');
      npc.bubble.style.borderColor = npc.accent;
      npc.bubble.style.color = npc.accent;
    }
  }

  _pulseSpeaker(id) {
    const npc = this.getByRestId(id);
    if (!npc) return;
    npc.halo.material.opacity = 0.85;
    npc.cloak.material.emissiveIntensity = 1.1;
    npc.ember.intensity = 0.85;
  }

  tryAmbientBark(restId, playerPos) {
    const cd = this._barkCd[restId] ?? 0;
    if (cd > 0) return;
    const npc = this.getByRestId(restId);
    if (!npc || this.game.dialog?.open) return;
    npc.mesh.getWorldPosition(this._tmp);
    if (Math.hypot(playerPos.x - this._tmp.x, playerPos.z - this._tmp.z) > 6) return;
    if (Math.random() > 0.004) return;
    const line = npc.def.barks[Math.floor(Math.random() * npc.def.barks.length)];
    this.game.dialog.toast(`${npc.name}：${line}`, 3200);
    this._barkCd[restId] = 28;
    this.speakingId = restId;
    npc.speakPulse = 0.5;
  }

  update(dt, playerPos) {
    this._时相 += dt;
    const t = this._时相;              // 以下所有呼吸的相位源（B118）：改前六处各写 `performance.now() × k`
    for (const id of Object.keys(this._barkCd)) {
      this._barkCd[id] = Math.max(0, (this._barkCd[id] ?? 0) - dt);
    }

    for (const n of this.npcs) {
      n.model?.update(dt);
      const m = n.mesh;
      m.getWorldPosition(this._tmp);
      const d = Math.hypot(playerPos.x - this._tmp.x, playerPos.z - this._tmp.z);
      const inDialogue = n.state === 'dialogue';
      const speaking = this.speakingId === n.id;

      if (inDialogue || speaking || d < 14) {
        const ang = Math.atan2(playerPos.x - this._tmp.x, playerPos.z - this._tmp.z);
        m.rotation.y = THREE.MathUtils.lerp(m.rotation.y, ang, dt * (inDialogue ? 5 : 3.5));
      } else {
        m.rotation.y = THREE.MathUtils.lerp(m.rotation.y, n.homeYaw, dt * 1.5);
      }

      const idle = n.def.idle;
      if (idle === 'float') {
        m.position.y = n.baseY + Math.sin(t * 1.4 + n.homeYaw) * 0.12;
      } else if (idle === 'ghost') {
        m.position.y = n.baseY + Math.sin(t * 0.9) * 0.06;
        const op = 0.55 + Math.sin(t * 2) * 0.15 + (speaking ? 0.2 : 0);
        if (n.cloak?.material) n.cloak.material.opacity = op;
      } else if (idle !== 'sit') {
        m.position.y = n.baseY + Math.sin(t * 1.6) * 0.03;
      }

      if (speaking || inDialogue) {
        n.head?.position && (n.head.position.y = n.body.position.y + n.def.height * 0.55 + 0.18 + Math.sin(t * 8) * 0.025);
      }

      n.speakPulse = Math.max(0, n.speakPulse - dt * 0.6);
      const hi = n.id === this.highlightId ? 1 : 0;
      const sp = n.speakPulse;
      n.halo.material.opacity = THREE.MathUtils.lerp(n.halo.material.opacity, hi * 0.55 + sp * 0.45, dt * 8);
      n.halo.scale.setScalar(1 + hi * 0.15 + sp * 0.2);
      if (n.cloak?.material) {
        n.cloak.material.emissiveIntensity = 0.3 + hi * 0.35 + sp * 0.5 + Math.sin(t * 1.8) * 0.1;
      }
      n.ember.intensity = 0.28 + (d < 6 ? 0.15 : 0) + hi * 0.35 + sp * 0.4;

      if (n.bubble) {
        if (speaking || inDialogue) {
          const sx = ((this._tmp.x - playerPos.x) * 0.02 + 0.5) * window.innerWidth;
          n.bubble.style.left = `${Math.min(window.innerWidth - 220, Math.max(12, sx))}px`;
          n.bubble.style.top = `${window.innerHeight * 0.38}px`;
        } else {
          n.bubble.classList.add('hidden');
        }
      }

      if (!this.game.dialog?.open && d < 7) this.tryAmbientBark(n.id, playerPos);
    }
  }
}
