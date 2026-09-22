/** 营火记忆 — 记录每次休息与对话节点 */
export class CampfireMemorySystem {
  constructor(game) {
    this.game = game;
    this.restCount = {};
    this.lastRest = null;
    this.nodeMemories = [];
    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('dialog-choice-picked', (e) => {
      if (e.detail?.action !== 'rest') return;
      const restId = e.detail.restId ?? 'hub';
      this.recordRest(restId);
    });
    window.addEventListener('rest-dialogue-node', (e) => {
      const { restId, nodeId, speaker, linePreview } = e.detail ?? {};
      if (!restId || !nodeId) return;
      const key = `${restId}:${nodeId}`;
      if (this.nodeMemories.some((m) => m.key === key)) return;
      this.nodeMemories.push({
        key,
        restId,
        nodeId,
        speaker: speaker ?? this.game.restPoints?.nameOf(restId) ?? '位面营火',
        preview: linePreview ?? '',
        chapter: this.game.quests?.chapter ?? 1,
        time: Date.now(),
      });
      if (this.nodeMemories.length > 80) this.nodeMemories.shift();
    });
  }

  recordRest(restId) {
    this.restCount[restId] = (this.restCount[restId] ?? 0) + 1;
    this.lastRest = { restId, time: Date.now(), chapter: this.game.quests?.chapter ?? 1 };
    window.dispatchEvent(new CustomEvent('campfire-memory-updated', { detail: this.getStats() }));
  }

  getStats() {
    const total = Object.values(this.restCount).reduce((s, n) => s + n, 0);
    const zones = Object.keys(this.restCount).length;
    return { total, zones, nodeCount: this.nodeMemories.length, lastRest: this.lastRest };
  }

  getMemories(filterRest = 'all') {
    const list = filterRest === 'all'
      ? [...this.nodeMemories]
      : this.nodeMemories.filter((m) => m.restId === filterRest);
    return list.sort((a, b) => b.time - a.time);
  }

  toJSON() {
    return {
      restCount: { ...this.restCount },
      lastRest: this.lastRest,
      nodeMemories: this.nodeMemories.slice(-60),
    };
  }

  fromJSON(data) {
    if (!data) return;
    this.restCount = { ...(data.restCount ?? {}) };
    this.lastRest = data.lastRest ?? null;
    this.nodeMemories = data.nodeMemories ?? [];
  }
}
