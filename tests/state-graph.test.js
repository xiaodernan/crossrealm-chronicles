/**
 * StateGraph — 纯粹引擎单测。钉住：注册顺序 / 静态与条件边 / 终止性 / 轨迹准确性。
 */
import { describe, it, expect } from 'vitest';
import { StateGraph } from '../src/core/StateGraph.js';

describe('StateGraph — 最小闭环', () => {
  it('静态边链路：intro → hand → farewell → end', () => {
    const g = new StateGraph();
    g.addNode('intro', () => ({ phase: 'entered' }))
     .addNode('hand', (s) => ({ held: (s.held ?? 0) + 1 }))
     .addNode('farewell', (s) => ({ farewell: true, held: s.held + 1 }))
     .setEntryPoint('intro')
     .addEdge('intro', 'hand')
     .addEdge('hand', 'farewell');
    const compiled = g.compile();
    const { state, trace } = compiled.invoke({});
    expect(state).toMatchObject({ phase: 'entered', held: 2, farewell: true });
    expect(trace.map((t) => t.node)).toEqual(['intro', 'hand', 'farewell']);
  });

  it('条件边：下一节点由 state.axis-dominant 决定', () => {
    const g = new StateGraph();
    g.addNode('entry', () => ({ axis: [1, 0, 0] }))
     .addNode('left', () => ({ chose: 'left' }))
     .addNode('right', () => ({ chose: 'right' }))
     .setEntryPoint('entry')
     .addConditionalEdges('entry', (s) => (s.axis?.[0] === 1 ? 'left' : 'right'));
    const outL = g.compile().invoke({});
    expect(outL.state.chose).toBe('left');

    const g2 = new StateGraph();
    g2.addNode('entry', () => ({ axis: [0, 1, 0] }))
      .addNode('left', () => ({ chose: 'left' }))
      .addNode('right', () => ({ chose: 'right' }))
      .setEntryPoint('entry')
      .addConditionalEdges('entry', (s) => (s.axis?.[0] === 1 ? 'left' : 'right'));
    const outR = g2.compile().invoke({});
    expect(outR.state.chose).toBe('right');
  });

  it('节点 patch 采用浅 merge，原始 initial state 不被破坏', () => {
    const g = new StateGraph();
    g.addNode('start', () => ({ a: 1, b: 2 }))
     .addNode('merge', (s) => ({ b: 99 }))
     .setEntryPoint('start')
     .addEdge('start', 'merge');
    const { state } = g.compile().invoke({ keep: 'me' });
    expect(state).toMatchObject({ keep: 'me', a: 1, b: 99 });
  });

  it('invoke 的轨迹逐节点记录', () => {
    const g = new StateGraph();
    g.addNode('a', () => ({})).addNode('b', () => ({})).addNode('c', () => ({}));
    g.setEntryPoint('a').addEdge('a', 'b').addEdge('b', 'c');
    const { trace } = g.compile().invoke({});
    expect(trace).toHaveLength(3);
    expect(trace[0].node).toBe('a');
    expect(trace[2].node).toBe('c');
  });
});

describe('StateGraph — 编译失败面', () => {
  it('缺 entry 抛错', () => {
    const g = new StateGraph();
    g.addNode('n', () => ({}));
    expect(() => g.compile()).toThrow(/setEntryPoint/);
  });

  it('注册了 addEdge 但是没 addNode → 编译期炸', () => {
    const g = new StateGraph();
    g.addNode('a', () => ({})).setEntryPoint('a');
    expect(() => g.addEdge('a', 'b')).toThrow(/尚未 addNode/);
  });

  it('入口路径没有终点 —— 节点无出边直接停止，不死循环', () => {
    const g = new StateGraph();
    g.addNode('only', () => ({ done: true })).setEntryPoint('only');
    const { state, trace } = g.compile().invoke({});
    expect(state.done).toBe(true);
    expect(trace).toHaveLength(1);
  });

  it('addEdge 顺序不拘（先 addConditionalEdges 再覆盖 addEdge 都是后写覆盖，保证调用方）', () => {
    const g = new StateGraph();
    g.addNode('a', () => ({}));
    g.addNode('b', () => ({ chose: 'b' }));
    g.addNode('c', () => ({ chose: 'c' }));
    g.setEntryPoint('a').addConditionalEdges('a', () => 'b').addEdge('a', 'c');
    const { state } = g.compile().invoke({});
    expect(state.chose).toBe('c');
  });
});
