/**
 * 营火记忆门禁 —— 钉 `game/CampfireMemorySystem.js`。
 *
 * 通过真实 EventBus 驱动。几条"写错不抛、只静默算错/重复记"的不变量：
 * - 只有 `dialog-choice-picked` 的 `action==='rest'` 才记休息；缺 restId 默认 'hub'。
 * - **对话节点按 `restId:nodeId` 去重**（同节点只记一次）；缺 restId/nodeId 忽略；上限 80 条（丢最旧）。
 * - `getStats().total` 是**休息次数之和**、`zones` 是**不同营火数**（同营火歇两次 total=2 但 zones=1）。
 * - `getMemories` 按营火过滤、按 time 倒序；toJSON 只存最近 60 条节点。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { emit } from '../src/engine/EventBus.js';
import { CampfireMemorySystem } from '../src/game/CampfireMemorySystem.js';

let game, sys, updated, capture;

beforeEach(() => {
  updated = [];
  capture = (e) => { updated.push(e.detail); };
  globalThis.window.addEventListener('campfire-memory-updated', capture);
  game = { restPoints: { nameOf: () => '灰白森林' }, quests: { chapter: 2 } };
  sys = new CampfireMemorySystem(game);
});
afterEach(() => {
  sys?.dispose();
  globalThis.window.removeEventListener('campfire-memory-updated', capture);
  sys = null;
});

describe('CampfireMemorySystem 休息记录', () => {
  it('rest 动作记一次并广播；非 rest 忽略；缺 restId 默认 hub', () => {
    emit('dialog-choice-picked', { action: 'rest', restId: 'r1' });
    expect(sys.restCount.r1).toBe(1);
    expect(sys.lastRest.restId).toBe('r1');
    expect(updated.length).toBe(1);

    emit('dialog-choice-picked', { action: 'leave', restId: 'r1' });
    expect(sys.restCount.r1).toBe(1); // 非 rest 不加

    emit('dialog-choice-picked', { action: 'rest' }); // 缺 restId → hub
    expect(sys.restCount.hub).toBe(1);
  });
});

describe('CampfireMemorySystem 对话节点记忆', () => {
  it('按 restId:nodeId 去重', () => {
    emit('rest-dialogue-node', { restId: 'r1', nodeId: 'n1' });
    emit('rest-dialogue-node', { restId: 'r1', nodeId: 'n1' }); // 重复
    expect(sys.nodeMemories).toHaveLength(1);
  });

  it('缺 restId 或 nodeId 忽略', () => {
    emit('rest-dialogue-node', { restId: 'r1' }); // 缺 nodeId
    emit('rest-dialogue-node', { nodeId: 'n1' }); // 缺 restId
    expect(sys.nodeMemories).toHaveLength(0);
  });

  it('上限 80 条（丢最旧）', () => {
    for (let i = 0; i < 81; i += 1) emit('rest-dialogue-node', { restId: 'r', nodeId: `n${i}` });
    expect(sys.nodeMemories).toHaveLength(80);
  });
});

describe('CampfireMemorySystem 统计 / 过滤 / 存档', () => {
  it('total 是休息次数之和、zones 是不同营火数', () => {
    sys.recordRest('r1');
    sys.recordRest('r1');
    sys.recordRest('r2');
    const s = sys.getStats();
    expect(s.total).toBe(3); // 2 + 1
    expect(s.zones).toBe(2); // r1, r2
  });

  it('getMemories 按营火过滤、按 time 倒序', () => {
    sys.nodeMemories = [
      { key: 'a', restId: 'r1', time: 100 },
      { key: 'b', restId: 'r2', time: 300 },
      { key: 'c', restId: 'r1', time: 200 },
    ];
    expect(sys.getMemories('r1').map((m) => m.key)).toEqual(['c', 'a']); // 200, 100
    expect(sys.getMemories('all').map((m) => m.key)).toEqual(['b', 'c', 'a']); // 300,200,100
  });

  it('toJSON 只存最近 60 条节点；fromJSON 往返、null no-op', () => {
    sys.nodeMemories = Array.from({ length: 70 }, (_, i) => ({ key: `k${i}`, restId: 'r', time: i }));
    const json = sys.toJSON();
    expect(json.nodeMemories).toHaveLength(60);
    expect(json.nodeMemories[0].key).toBe('k10'); // slice(-60) 丢掉前 10
    sys.fromJSON(json);
    expect(sys.nodeMemories).toHaveLength(60);
    sys.fromJSON(null);
    expect(sys.nodeMemories).toHaveLength(60);
  });
});
