/** 营火 NPC 待机微动 — 玩家靠近时 */
export class RestNpcIdleDirector {
  constructor(game) {
    this.game = game;
    this.phase = 0;
  }

  update(dt, playerPos) {
    const npcs = this.game.restNpcs?.npcs ?? [];
    this.phase += dt;
    for (const npc of npcs) {
      if (!npc.mesh) continue;
      const dx = playerPos.x - npc.mesh.position.x;
      const dz = playerPos.z - npc.mesh.position.z;
      const dist = dx * dx + dz * dz;
      if (dist > 400) continue;
      const bob = Math.sin(this.phase * 2 + (npc.restId?.length ?? 0)) * 0.04;
      npc.mesh.position.y = (npc.baseY ?? npc.mesh.position.y) + bob;
    }
  }

  attachRestNpcs(npcs) {
    for (const npc of npcs ?? []) {
      if (npc.mesh) npc.baseY = npc.mesh.position.y;
    }
  }
}
