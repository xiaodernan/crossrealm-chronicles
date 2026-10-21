import * as THREE from 'three';

/** 胶囊体 NPC 程序化手势 — 无 Mixamo 时的坐姿/挥手/指点 */
export class RestNpcProceduralGestures {
  constructor(npcEntry) {
    this.npc = npcEntry;
    this.mode = 'idle';
    this.timer = 0;
    this._时相 = 0;             // B118：坐姿/说话点头的呼吸相位改走世界时积分
    this._base = {
      bodyY: npcEntry.body?.position.y ?? 1.15,
      headY: npcEntry.head?.position.y ?? 1.8,
      cloakRot: npcEntry.cloak?.rotation.x ?? Math.PI,
      groupY: npcEntry.mesh?.position.y ?? 0,
    };
    this._waveArm = null;
    this._buildWaveArm();
  }

  _buildWaveArm() {
    if (!this.npc.mesh || this._waveArm) return;
    const mat = new THREE.MeshStandardMaterial({
      color: this.npc.def?.body ?? 0x5a5048,
      roughness: 0.75,
      emissive: this.npc.def?.emissive ?? 0x332211,
      emissiveIntensity: 0.2,
    });
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.35, 4, 8), mat);
    arm.name = 'waveArm';
    arm.visible = false;
    arm.position.set(0.42, 1.35, 0.15);
    this.npc.mesh.add(arm);
    this._waveArm = arm;
  }

  setPose(poseKey) {
    this.mode = poseKey;
    this.timer = poseKey === 'procedural_wave' ? 1.4 : poseKey === 'procedural_point' ? 1.2 : 999;
    if (poseKey === 'procedural_sit' || poseKey === 'procedural_sit_talk') {
      if (this.npc.body) this.npc.body.position.y = 0.72;
      if (this.npc.head) this.npc.head.position.y = 1.35;
    }
    if (poseKey === 'procedural_wave' || poseKey === 'procedural_point') {
      if (this._waveArm) this._waveArm.visible = true;
    }
  }

  resetPose() {
    this.mode = 'idle';
    this.timer = 0;
    if (this.npc.body) this.npc.body.position.y = this._base.bodyY;
    if (this.npc.head) this.npc.head.position.y = this._base.headY;
    if (this._waveArm) {
      this._waveArm.visible = false;
      this._waveArm.rotation.set(0, 0, 0);
    }
  }

  /**
   * 拆干净：放下那只挥手手臂的引用（**不释放**它的几何与材质）。
   *
   * 为什么现在才有（W-C1 切片3i）：那一层（`RestNpcAnimDirector`）此前**只解绑监听**、
   * 不管这些资源 ⇒ 它们归**容器**（营火本体那一组）释放 —— 在这里释放就是**释放两遍**。
   */
  dispose() {
    this._waveArm = null;
    this.npc = null;
  }

  update(dt) {
    this._时相 += dt;
    const t = this._时相;         // 改前 `performance.now() * 0.001`（B118）：坐姿胸口与说话点头吃墙钟，定帧时仍继续起伏
    if (this.mode === 'procedural_sit' || this.mode === 'procedural_sit_talk') {
      if (this.npc.body) this.npc.body.position.y = 0.72 + Math.sin(t * 1.2) * 0.015;
      if (this.mode === 'procedural_sit_talk' && this.npc.head) {
        this.npc.head.position.y = 1.35 + Math.sin(t * 6) * 0.02;
      }
      return;
    }

    if (this.mode === 'procedural_wave' && this._waveArm) {
      const phase = 1 - this.timer / 1.4;
      this._waveArm.rotation.z = -0.8 - Math.sin(phase * Math.PI * 3) * 0.9;
      this._waveArm.rotation.x = Math.sin(phase * Math.PI * 2) * 0.3;
    }

    if (this.mode === 'procedural_point' && this._waveArm) {
      this._waveArm.position.set(0.55, 1.45, 0.35);
      this._waveArm.rotation.z = -1.4;
      this._waveArm.rotation.x = -0.2;
    }

    if (this.timer > 0 && this.timer < 9000) {
      this.timer -= dt;
      if (this.timer <= 0) this.resetPose();
    }
  }
}
