/** 营火 NPC 待机微动 — 玩家靠近时 */
import { shouldUpdate as frameShouldUpdate } from '../engine/FrameBudget.js';
export class RestNpcIdleDirector {
  constructor(game) {
    this.game = game;
    this.phase = 0;
  }

  update(dt, playerPos) {
    const npcs = this.game.restNpcs?.npcs ?? [];
    this.phase += dt;
    // 距离判定每帧做，位置抖动降频 1/2 帧（纯视觉）。
    const 视觉帧 = frameShouldUpdate(2);
    for (const npc of npcs) {
      if (!npc.mesh) continue;
      const dx = playerPos.x - npc.mesh.position.x;
      const dz = playerPos.z - npc.mesh.position.z;
      const dist = dx * dx + dz * dz;
      if (dist > 400) continue;
      if (视觉帧) {
        const bob = Math.sin(this.phase * 2 + (npc.restId?.length ?? 0)) * 0.04;
        npc.mesh.position.y = (npc.baseY ?? npc.mesh.position.y) + bob;
      }
    }
  }

  attachRestNpcs(npcs) {
    for (const npc of npcs ?? []) {
      if (npc.mesh) npc.baseY = npc.mesh.position.y;
    }
  }
}
