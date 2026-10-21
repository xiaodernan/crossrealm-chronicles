import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { REST_NPC_MODELS } from '../assets/RestNpcManifest.js';
import { applyShadow } from '../engine/shadowPolicy.js';

const _loader = new GLTFLoader();

// B118：兜底头部的呼吸是**逐帧累加**，改前每帧加 `sin(墙钟×0.008)×0.0008`，
// 帧率越高累得越快（180 fps ≈ 60 fps 的 3 倍位移，且不封顶）。系数按 60 fps 折算成每秒速率，
// 60 fps 下逐帧增量与改前完全相同。
const 头部呼吸速率 = 0.0008 * 60;
const 头部呼吸角速度 = 8;   // 改前 0.008 rad/ms = 8 rad/s

/** 单个营火 NPC — Mixamo GLB + 程序化兜底 + idle/talk 动画 */
export class RestNpcModel {
  constructor(restId, visualDef) {
    this.restId = restId;
    this.visualDef = visualDef;
    this.config = REST_NPC_MODELS[restId] ?? REST_NPC_MODELS.hub;
    this.group = new THREE.Group();
    this.modelRoot = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.loaded = false;
    this.useGlb = false;
    this.fallbackMeshes = [];
    this.talkPulse = 0;
    this._时相 = 0;
  }

  buildFallback() {
    const def = this.visualDef;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: def.body,
      roughness: 0.72,
      metalness: 0.12,
      transparent: !!def.transparent,
      opacity: def.transparent ? 0.78 : 1,
    });
    const bodyH = def.height;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, bodyH, 8, 14), bodyMat);
    body.name = 'body';
    applyShadow(body, 'actor');
    body.position.y = def.idle === 'sit' || this.config.sit ? 0.72 : 1.15;
    this.group.add(body);
    this.fallbackMeshes.push(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), bodyMat.clone());
    head.name = 'head';
    head.position.y = body.position.y + bodyH * 0.55 + 0.18;
    this.group.add(head);
    this.fallbackMeshes.push(head);

    if (def.helmet || this.config.helmet) {
      const helm = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshStandardMaterial({ color: 0xccddee, roughness: 0.35, metalness: 0.55 })
      );
      helm.position.copy(head.position);
      helm.position.y += 0.04;
      this.group.add(helm);
    }

    const cloak = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 0.9, 8),
      new THREE.MeshStandardMaterial({
        color: def.cloak,
        roughness: 0.85,
        emissive: def.emissive,
        emissiveIntensity: 0.35,
        transparent: !!def.transparent,
        opacity: def.transparent ? 0.65 : 1,
        side: THREE.DoubleSide,
      })
    );
    cloak.rotation.x = Math.PI;
    cloak.position.y = body.position.y + 0.15;
    cloak.name = 'cloak';
    this.group.add(cloak);
    this.fallbackMeshes.push(cloak);

    this.modelRoot = this.group;
    return { body, head, cloak };
  }

  /**
   * 拆干净：把混放器的根从缓存里摘掉，放下这一层的引用（**不释放**那些网格资源）。
   *
   * 为什么现在才有（W-C1 切片3i）：`Game._adopt` **拒绝**没有 `dispose()` 的子系统
   * （"假装收编"的防线），而这一层此前**没有** `dispose()` ⇒ 它从不被收编。
   *
   * **为什么不释放那些资源**：这一组的网格是**挂在营火那一组上**的
   * （`RestNpcManager` 里 `point.mesh.add(model.group)`）⇒ 它们的几何与材质归**容器**
   * （营火本体）释放 —— 拆卸登记表按**登记的反序**执行，这一层先拆（网格还挂在营火上），
   * 营火本体后拆（那时才轮到那些资源）。在这里释放一遍就是**释放两遍**。
   * **混放器**（动画混放器）没有容器替它还 ⇒ 由这一层自己 `uncacheRoot` ✓。
   */
  dispose() {
    if (this.mixer && this.modelRoot) this.mixer.uncacheRoot(this.modelRoot);
    this.mixer = null;
    this.modelRoot = null;
    this.actions = {};
    this.fallbackMeshes.length = 0;
  }

  async loadGlb() {
    for (const url of this.config.glb) {
      try {
        const gltf = await _loader.loadAsync(url);
        const model = gltf.scene.clone(true);
        model.scale.setScalar(this.config.scale);
        model.rotation.y = this.config.rotY ?? Math.PI;
        model.traverse((c) => {
          if (c.isMesh) {
            applyShadow(c, 'prop');
            if (this.config.ghost) {
              c.material = c.material.clone();
              c.material.transparent = true;
              c.material.opacity = 0.72;
            }
          }
        });
        const box = new THREE.Box3().setFromObject(model);
        model.position.y -= box.min.y;
        this.fallbackMeshes.forEach((m) => { m.visible = false; });
        this.group.add(model);
        this.modelRoot = model;
        this.mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) {
          this.actions[clip.name] = this.mixer.clipAction(clip);
          const low = clip.name.toLowerCase();
          if (low.includes('idle') || low.includes('sit')) this.actions.idle = this.actions[clip.name];
        }
        this._playLoop(this._pickAnim(this.config.idleAnim) ?? Object.keys(this.actions)[0]);
        this.useGlb = true;
        this.loaded = true;
        console.info('[RestNpcModel]', this.restId, 'GLB', url);
        return true;
      } catch { /* try next */ }
    }
    return false;
  }

  _pickAnim(candidates) {
    for (const c of candidates ?? []) {
      if (this.actions[c]) return c;
      const hit = Object.keys(this.actions).find((k) => k.toLowerCase() === String(c).toLowerCase());
      if (hit) return hit;
      const partial = Object.keys(this.actions).find((k) => k.toLowerCase().includes(String(c).toLowerCase()));
      if (partial) return partial;
    }
    return null;
  }

  _playLoop(name, fade = 0.2) {
    const action = name ? this.actions[name] : null;
    if (!action) return;
    if (this.currentAction && this.currentAction !== action) this.currentAction.fadeOut(fade);
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(fade).play();
    this.currentAction = action;
  }

  playTalk(active) {
    if (!this.useGlb) return;
    this.talkPulse = active ? 1 : 0;
    const talk = this._pickAnim(this.config.talkAnim);
    if (talk && active) this._playLoop(talk, 0.15);
    else if (!active) this._playLoop(this._pickAnim(this.config.idleAnim), 0.2);
  }

  update(dt) {
    this._时相 += dt;
    this.mixer?.update(dt);
    this.talkPulse = Math.max(0, this.talkPulse - dt * 0.5);
    if (!this.useGlb && this.fallbackMeshes[1]) {
      this.fallbackMeshes[1].position.y += Math.sin(this._时相 * 头部呼吸角速度) * 头部呼吸速率 * dt * (1 + this.talkPulse);
    }
  }
}
