/**
 * 逐帧 DOM 写入去重（W-Y5 切片1）
 *
 * ## 为什么要有这一层读数
 *
 * `HUD.update()` 每帧都跑，而坐标 / 耐力 / 罗盘 / 引导语 / 锁定两行在**站着不动的帧里
 * 一个字符都没变**。改前它们每帧照写：`textContent =` 会换掉文本节点、`style.width =`
 * 会让样式失效一次 —— 值一样也是写。这一族的账不在 `update()` 的毫秒数里，
 * 在随后的排版/合成上，所以性能冒烟的 updateAvg 看不见它。
 *
 * 用例分三层：
 * ① 出口语义：同值跳过、换值才写、null 安全、属性之间各记各的；
 * ② 热路径读数：同一帧态连跑两遍，第二遍 **0 次 DOM 写、0 次 getElementById**；
 * ③ 变化能落地：坐标变了只写坐标那一格；锁上目标时两个 hidden 各翻一次，之后回到 0。
 */
import { describe, it, expect, afterAll } from 'vitest';
import { setText, setStyle, setHidden } from '../src/ui/domWrite.js';
import { HUD } from '../src/ui/HUD.js';

/* 假文档只在本文件的生命周期里装上：装着不拆会把"有 document"漏给同 worker 后面的文件 */
const 原文档 = globalThis.document;
afterAll(() => {
  if (原文档 === undefined) delete globalThis.document;
  else globalThis.document = 原文档;
});

/** 会记账的假格子：文本 / 常用样式属性 / hidden 类，各记各的写次数 */
function 记数格(id) {
  const el = {
    id,
    writes: 0,
    _text: '',
    style: {},
    classList: {
      add() { el.writes += 1; },
      remove() { el.writes += 1; },
      toggle() { el.writes += 1; },
    },
  };
  Object.defineProperty(el, 'textContent', {
    get() { return el._text; },
    set(v) { el.writes += 1; el._text = v; },
  });
  for (const prop of ['width', 'opacity', 'left', 'top', 'transform']) {
    let 值 = '';
    Object.defineProperty(el.style, prop, {
      get() { return 值; },
      set(v) { el.writes += 1; 值 = v; },
    });
  }
  return el;
}

/** 只有这几格是存在的；其余 id 一律 null（与真 HUD 里"没有那一格"同形） */
function 假文档(ids) {
  const 格 = new Map(ids.map((id) => [id, 记数格(id)]));
  const 账 = { lookups: 0 };
  return {
    格,
    账,
    getElementById(id) {
      账.lookups += 1;
      return 格.get(id) ?? null;
    },
  };
}

const 热格 = [
  'coord-display', 'stamina-bar', 'compass', 'quest-guide', 'quest-arrow',
  'lock-target', 'lock-row', 'posture-bar', 'fps-display', 'roll-cd-bar',
  'lock-name', 'lock-intel',
];

const 总写 = (格) => [...格.values()].reduce((n, el) => n + el.writes, 0);

/** 只装 `update()` 真正会摸到的那几样（锁情报那格查不到 → 早退） */
function 假HUD(文档, over = {}) {
  const hud = Object.create(HUD.prototype);
  hud.game = {
    player: { position: { x: 0, z: 0 }, yaw: 0, combat: undefined },
    quests: {
      getQuestWaypoint: () => null,
      getQuestDirectionText: () => '',
      getAssistantHint: () => 'hint',
    },
    inputDevice: { current: () => null },
    ...over.game,
  };
  Object.assign(hud, {
    stamina: 100,
    minimapVisible: false,
    minimapCanvas: null,
    _inputDeviceShown: null,
    _trialTick: 0,
    _seasonPillTick: 0,
    frameCount: 0,
    fpsTimer: 0,
  }, over.hud);
  return hud;
}

describe('W-Y5 切片1 逐帧 DOM 写入去重', () => {
  describe('① 出口语义', () => {
    it('同值跳过、换值才写；null 元素不抛', () => {
      const el = 记数格('t');
      expect(setText(el, 'a')).toBe(true);
      expect(setText(el, 'a')).toBe(false);
      expect(setText(el, 'b')).toBe(true);
      expect(el.writes).toBe(2);
      expect(setText(null, 'x')).toBe(false);
    });

    it('样式按属性各记各的；100 与 "100" 是同一个值', () => {
      const el = 记数格('s');
      expect(setStyle(el, 'width', 100)).toBe(true);
      expect(setStyle(el, 'width', '100')).toBe(false);
      expect(setStyle(el, 'opacity', '1')).toBe(true);
      expect(setStyle(el, 'width', '100%')).toBe(true);
      expect(el.writes).toBe(3);
      expect(setStyle(null, 'width', '1px')).toBe(false);
    });

    it('hidden 状态相同不写；null 不抛', () => {
      const el = 记数格('h');
      expect(setHidden(el, true)).toBe(true);
      expect(setHidden(el, true)).toBe(false);
      expect(setHidden(el, false)).toBe(true);
      expect(el.writes).toBe(2);
      expect(setHidden(null, true)).toBe(false);
    });
  });

  describe('② 热路径读数：同一帧态第二遍零写、零查找', () => {
    it('静立帧：第一遍 10 写，第二遍 0 写 0 查', () => {
      const 文档 = 假文档(热格);
      globalThis.document = 文档;
      const hud = 假HUD(文档);

      hud.update(0.016);
      const 首帧 = 总写(文档.格);
      const 首查 = 文档.账.lookups;
      // 坐标/耐力/罗盘/引导/箭头/锁定两行 = 7；锁情报两行 + 它的 hidden 类 = 3
      expect(首帧, '首帧要把格子写到位').toBe(10);
      expect(首查, '首帧查一遍全部热格').toBeGreaterThan(0);

      文档.账.lookups = 0;
      hud.update(0.016);
      expect(总写(文档.格) - 首帧, '同一帧态第二遍不许再碰 DOM').toBe(0);
      expect(文档.账.lookups, '格子已记住，第二遍不许再查文档').toBe(0);
    });
  });

  describe('③ 变化能落地', () => {
    it('坐标跨过整数格只写坐标那一格', () => {
      const 文档 = 假文档(热格);
      globalThis.document = 文档;
      const hud = 假HUD(文档);
      hud.update(0.016);
      const 底 = 总写(文档.格);

      hud.game.player.position.x = 3.7;
      hud.update(0.016);
      expect(总写(文档.格) - 底, '只有 coord-display 该写').toBe(1);
      expect(文档.格.get('coord-display')._text).toBe('X: 4 · Z: 0');
    });

    it('锁上目标：两格 hidden 各翻一次 + 架势条写一次，之后回到 0', () => {
      const 文档 = 假文档(热格);
      globalThis.document = 文档;
      const hud = 假HUD(文档);
      hud.update(0.016);
      const 底 = 总写(文档.格);

      hud.game.player.combat = {
        rollCooldownTimer: 0,
        rollCooldown: 1,
        lockTarget: { alive: true, posture: 50, maxPosture: 100, type: 'wolf', name: '狼' },
      };
      hud.update(0.016);
      const 锁帧 = 总写(文档.格) - 底;
      // 冷却条 width/opacity 2 + 锁定两行 2 + 架势 1（首帧还得再写一次，值都是新的）
      expect(锁帧).toBeGreaterThanOrEqual(5);

      const 冻结 = 总写(文档.格);
      hud.update(0.016);
      expect(总写(文档.格) - 冻结, '同状态下一帧不再写').toBe(0);
    });
  });
});
