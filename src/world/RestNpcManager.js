import * as THREE from 'three';
import { RestNpcModel } from './RestNpcModel.js';

/** 营火常驻 NPC — Mixamo 模型 + RestDialogue 联动高亮 */
export const REST_NPC_DEFS = {
  hub: {
    name: '锚火看守',
    title: '看守 · 余温',
    body: 0x5a5048,
    cloak: 0xc9a962,
    emissive: 0x664422,
    accent: '#c9a962',
    height: 1.05,
    offset: [1.35, 0, 0.6],
    idle: 'stand',
    barks: ['火不会灭，只要锚还在。', '三个位面的风，在这里交汇。', '休息前先听听风声。'],
  },
  fantasy: {
    name: '精灵斥候',
    title: '斥候 · 灰林',
    body: 0x3a5a40,
    cloak: 0x2a4030,
    emissive: 0x224422,
    accent: '#66aa77',
    height: 0.95,
    offset: [-1.1, 0, 0.45],
    idle: 'sit',
    barks: ['森林记得每一场战争。', 'Boss 红圈别贪刀。', '连击终结能清小怪。'],
  },
  magic: {
    name: '奥术旅者',
    title: '旅者 · 遗境',
    body: 0x4a3868,
    cloak: 0x8866cc,
    emissive: 0x5533aa,
    accent: '#aa88ff',
    height: 1.0,
    offset: [0.9, 0, -0.7],
    idle: 'float',
    barks: ['火焰里倒映着未发生的灾难。', '蓄力法术是对 Boss 的礼貌。', '禁书在迷宫深处。'],
  },
  space: {
    name: '宇航员回声',
    title: '回声 · Endurance',
    body: 0x8899aa,
    cloak: 0x667788,
    emissive: 0x334455,
    accent: '#88ccff',
    height: 1.0,
    offset: [-0.8, 0, 0.9],
    idle: 'stand',
    helmet: true,
    barks: ['时间在这里是圆的。', '引力井会把你拉向中心。', '奇点领主有三阶段。'],
  },
  void: {
    name: '时线残影',
    title: '残影 · 折叠',
    body: 0x6a6050,
    cloak: 0x998866,
    emissive: 0xaa8844,
    accent: '#ddbb66',
    height: 1.08,
    offset: [0.7, 0, 0.5],
    idle: 'ghost',
    transparent: true,
    barks: ['有时火焰会倒着烧。', '时停可以用蓄力打断。', '隐藏 Boss 在北侧。'],
  },
  abyss: {
    name: '裂隙引路人',
    title: '引路 · 边境',
    body: 0x3a2028,
    cloak: 0x661122,
    emissive: 0xff2244,
    accent: '#ff4466',
    height: 1.12,
    offset: [-0.95, 0, -0.4],
    idle: 'stand',
    barks: ['门越多，界越薄。', '混沌脉冲别贴身。', 'Ch5 后可重进迷宫。'],
  },
};

export class RestNpcManager {
  constructor(scene, world, restPoints, game) {
    this.scene = scene;
    this.world = world;
    this.game = game;
    this.npcs = [];
    this.speakingId = null;
    this.highlightId = null;
    this._tmp = new THREE.Vector3();
    this._barkCd = {};
    this.build(restPoints);
    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('rest-dialogue-open', (e) => {
      const id = e.detail?.restId;
      this.highlightId = id;
      this.speakingId = e.detail?.speakerId ?? id;
      this._setNpcState(id, 'dialogue', e.detail);
      this.getByRestId(id)?.model?.playTalk?.(true);
    });
    window.addEventListener('rest-dialogue-node', (e) => {
      this.speakingId = e.detail?.speakerId ?? e.detail?.restId;
      this._pulseSpeaker(this.speakingId);
      this.getByRestId(e.detail?.restId)?.model?.playTalk?.(true);
    });
    window.addEventListener('rest-dialogue-close', () => {
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
        m.position.y = n.baseY + Math.sin(performance.now() * 0.0014 + n.homeYaw) * 0.12;
      } else if (idle === 'ghost') {
        m.position.y = n.baseY + Math.sin(performance.now() * 0.0009) * 0.06;
        const op = 0.55 + Math.sin(performance.now() * 0.002) * 0.15 + (speaking ? 0.2 : 0);
        if (n.cloak?.material) n.cloak.material.opacity = op;
      } else if (idle !== 'sit') {
        m.position.y = n.baseY + Math.sin(performance.now() * 0.0016) * 0.03;
      }

      if (speaking || inDialogue) {
        n.head?.position && (n.head.position.y = n.body.position.y + n.def.height * 0.55 + 0.18 + Math.sin(performance.now() * 0.008) * 0.025);
      }

      n.speakPulse = Math.max(0, n.speakPulse - dt * 0.6);
      const hi = n.id === this.highlightId ? 1 : 0;
      const sp = n.speakPulse;
      n.halo.material.opacity = THREE.MathUtils.lerp(n.halo.material.opacity, hi * 0.55 + sp * 0.45, dt * 8);
      n.halo.scale.setScalar(1 + hi * 0.15 + sp * 0.2);
      if (n.cloak?.material) {
        n.cloak.material.emissiveIntensity = 0.3 + hi * 0.35 + sp * 0.5 + Math.sin(performance.now() * 0.0018) * 0.1;
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
