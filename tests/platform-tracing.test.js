/**
 * 链路追踪（B163 切片2）—— 帧 = trace、舱壁调用 = span、导出照 Zipkin 的形状。
 *
 * 五组：
 * ① **形状**：一帧 = 一条 trace；一次调用 = 一个 span；子 span 的 parentId 指向那一帧的根 span；
 *    traceId / id 是 16 位十六进制；duration 是整数微秒。
 * ② **导出**：Zipkin v2 span 形状（根 span + 子 span），每个子 span 的 parentId 都能在导出里
 *    找到对应 id；导出的条数 = 帧数 + 跨度数。
 * ③ **帧号只有一个真源**：traceId 来自 `FrameBudget.currentFrame()`，追踪器不另起一本计数器。
 * ④ **按需开**：关着时 `包()` 直接透传（值与异常都对），且**不产生任何 span**；
 *    熔断短路也要留痕（0 毫秒的"跳过"span）。
 * ⑤ **接线**：Game 把**同一个**追踪器交给舱壁组与性能面板，F3 把两者一起开/关。
 *
 * 判据住在生产代码（`src/platform/tracing.js`），这里只喂坏数据。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { 建追踪, 校验导出 } from '../src/platform/tracing.js';
import { 建舱壁组 } from '../src/platform/bulkhead.js';
import { tick, currentFrame, resetForTest } from '../src/engine/FrameBudget.js';

const ROOT = process.cwd();
const 源文 = readFileSync(join(ROOT, 'src/platform/tracing.js'), 'utf8');
const 游戏源文 = readFileSync(join(ROOT, 'src/core/Game.js'), 'utf8');

/** 十六进制 id（Zipkin 形状） */
const 十六 = (n) => n.toString(16).padStart(16, '0');

beforeEach(() => {
  resetForTest();
});

describe('① 形状：一帧 = 一条 trace，一次调用 = 一个 span', () => {
  it('开一帧给出一条 trace（帧号取 FrameBudget 的唯一真源）', () => {
    const 追踪 = 建追踪();
    追踪.设开着(true);
    tick();
    const 帧号 = currentFrame();
    const traceId = 追踪.开帧();
    expect(traceId, '开帧没给出 traceId').toBe(十六(帧号));
    expect(traceId, 'traceId 不是 16 位十六进制').toMatch(/^[0-9a-f]{16}$/);
  });

  it('记一个 span：id 唯一、parentId 指向那一帧的根、duration 是整数微秒', () => {
    const 追踪 = 建追踪();
    追踪.设开着(true);
    tick();
    追踪.开帧();
    const span = 追踪.记('world', 3.25, true);
    expect(span).toBeTruthy();
    expect(span.名).toBe('world');
    expect(span.成).toBe(true);
    expect(span.毫秒).toBe(3.25);
    expect(span.duration, 'duration 必须是整数微秒').toBe(3250);
    expect(Number.isInteger(span.duration)).toBe(true);
    expect(span.traceId).toMatch(/^[0-9a-f]{16}$/);
    expect(span.id, 'span id 不是 16 位十六进制').toMatch(/^[0-9a-f]{16}$/);
    expect(span.parentId, '子 span 的 parentId 必须是这一帧的根 span').toMatch(/^[0-9a-f]{16}$/);
    expect(span.id, 'span id 不许等于自己的 parentId').not.toBe(span.parentId);
  });

  it('同一帧里两个 span 的 id 不一样', () => {
    const 追踪 = 建追踪();
    追踪.设开着(true);
    tick();
    追踪.开帧();
    const 甲 = 追踪.记('a', 1, true);
    const 乙 = 追踪.记('b', 1, true);
    expect(甲.id).not.toBe(乙.id);
    expect(甲.parentId).toBe(乙.parentId);
  });

  it('读数取的是**已完成**的那一帧（性能面板在帧首渲染，它要答的是"上一帧谁吃掉的"）', () => {
    // 这条是本片真跑出来的一个缺陷：最初 开帧() 就把新帧放进档，于是面板在帧首读到的是
    // 刚开、还**没有一条 span** 的半截帧 ⇒ "最慢 span"那一行永远不出现。
    const 追踪 = 建追踪();
    追踪.设开着(true);
    tick();
    追踪.开帧();
    追踪.记('world', 5, true);
    追踪.收帧();
    expect(追踪.读数().跨度.length).toBe(1);

    tick();
    追踪.开帧();          // 新一帧开始
    追踪.记('hud', 1, true);
    // **还没收帧** ⇒ 读数仍应是上一帧（不是这一帧的空壳）
    expect(追踪.读数().跨度[0].名, '读到的是没走完的那一帧').toBe('world');
    追踪.收帧();
    expect(追踪.读数().跨度[0].名, '收完帧就该换成这一帧').toBe('hud');
  });

  it('帧号是唯一的真源：追踪器自己不另起一本计数器', () => {
    // 行为腿：帧号推进 ⇒ traceId 跟着推进（不是追踪器自己数出来的）
    const 追踪 = 建追踪();
    追踪.设开着(true);
    tick();
    const 甲 = 追踪.开帧();
    tick();
    const 乙 = 追踪.开帧();
    expect(甲).not.toBe(乙);
    expect(乙).toBe(十六(currentFrame()));
    // 结构腿：追踪器不许自己维护帧计数器（那会变成"帧号有两份真相"）
    expect(源文).toMatch(/import \{ currentFrame \} from '\.\.\/engine\/FrameBudget\.js'/);
    expect(源文, '追踪器自己数帧了 ⇒ 帧号有两份真相').not.toMatch(/let\s+帧(?:号|计数)\s*=/);
  });
});

describe('② 导出：Zipkin v2 span 形状', () => {
  it('导出 = 根 span + 子 span，每个子 span 的 parentId 都找得到', () => {
    const 追踪 = 建追踪();
    追踪.设开着(true);
    tick();
    追踪.开帧();
    追踪.记('world', 2, true);
    追踪.记('hud', 1, true);
    追踪.收帧();
    const 出 = 追踪.导出();
    expect(出.length).toBe(3); // 1 个根 + 2 个子
    const 根 = 出.find((s) => s.parentId === null);
    expect(根, '没有根 span').toBeTruthy();
    expect(根.name).toBe('frame');
    for (const s of 出) {
      expect(s.traceId).toMatch(/^[0-9a-f]{16}$/);
      expect(s.id).toMatch(/^[0-9a-f]{16}$/);
      expect(Number.isInteger(s.duration)).toBe(true);
      if (s.parentId !== null) {
        expect(出.some((x) => x.id === s.parentId), `parentId ${s.parentId} 在导出里找不到`).toBe(true);
      }
    }
  });

  it('导出条数 = 帧数 + 跨度数（不多不少）', () => {
    const 追踪 = 建追踪();
    追踪.设开着(true);
    for (let i = 0; i < 3; i++) {
      tick();
      追踪.开帧();
      追踪.记('x', 1, true);
      追踪.记('y', 1, true);
      追踪.收帧();
    }
    expect(追踪.导出().length).toBe(3 * 3);
    expect(追踪.读数().跨度数).toBe(2);
  });

  it('保留帧上限是硬的：超出的帧被挤掉，不许无限长', () => {
    const 追踪 = 建追踪({ 保留帧: 2 });
    追踪.设开着(true);
    for (let i = 0; i < 5; i++) {
      tick();
      追踪.开帧();
      追踪.记('x', 1, true);
      追踪.收帧();
    }
    expect(追踪.导出().length).toBe(2 * 2);
  });

  it('每帧跨度上限是硬的：超出只记溢出，不许无限长', () => {
    const 追踪 = 建追踪({ 每帧上限: 3 });
    追踪.设开着(true);
    tick();
    追踪.开帧();
    for (let i = 0; i < 10; i++) 追踪.记('x', 1, true);
    追踪.收帧();
    const 读数 = 追踪.读数();
    expect(读数.跨度数).toBe(3);
    expect(读数.溢出).toBe(7);
  });
});

describe('③ 按需开：关着就零开销', () => {
  it('关着时 包() 直接透传（值与异常都对），且**一个 span 都不许记**', () => {
    const 追踪 = 建追踪();
    expect(追踪.开着).toBe(false);
    // 关着时"开帧"也不许发生：给了 traceId 就说明这一帧被开出来了，
    // 而它一被开出来，后面的 包() 就有地方记 span —— "按需开"就名存实亡了。
    expect(追踪.开帧(), '关着时开帧不该给出 traceId').toBeNull();
    expect(追踪.包('x', () => 42)).toBe(42);
    expect(() => 追踪.包('x', () => { throw new Error('炸'); })).toThrow('炸');
    expect(追踪.读数(), '关着时不该有读数').toBeNull();
    expect(追踪.导出().length).toBe(0);
    // 「一个都不许记」的可读见证：连累加计数都不许动 ——
    // 这条是 T5 那一臂（仪器关着也照记）真正咬住的地方。
    expect(追踪.已记, '仪器关着却记了 span ⇒ 按需开作废').toBe(0);
  });

  it('开着时 已记 在涨（见证本身不是死的）', () => {
    const 追踪 = 建追踪();
    追踪.设开着(true);
    tick();
    追踪.开帧();
    追踪.包('x', () => 1);
    追踪.包('y', () => 2);
    expect(追踪.已记).toBe(2);
  });

  it('开着时 包() 记 span：成了记成功，炸了记失败', () => {
    const 追踪 = 建追踪();
    追踪.设开着(true);
    tick();
    追踪.开帧();
    追踪.包('好的', () => 1);
    try { 追踪.包('坏的', () => { throw new Error('炸'); }); } catch { /* 记完照旧抛 */ }
    追踪.收帧();
    const 跨度 = 追踪.读数().跨度;
    expect(跨度.length).toBe(2);
    expect(跨度[0].成).toBe(true);
    expect(跨度[1].成).toBe(false);
    expect(跨度[1].名).toBe('坏的');
  });

  it('熔断短路也留痕：0 毫秒的"跳过"span（没调下游这件事本身是信息）', () => {
    const 追踪 = 建追踪();
    追踪.设开着(true);
    const 舱壁组 = 建舱壁组({ 失败阈值: 1, 冷却秒: 10, 追踪 });
    tick();
    追踪.开帧();
    // 第一次失败 ⇒ 断开
    舱壁组.跑('会炸的', () => { throw new Error('炸'); });
    // 第二次：熔断中 ⇒ 短路（下游一次都不该被调）
    let 被调 = 0;
    舱壁组.跑('会炸的', () => { 被调 += 1; });
    expect(被调).toBe(0);
    追踪.收帧();
    const 跨度 = 追踪.读数().跨度;
    const 短路那条 = 跨度.find((s) => s.短路);
    expect(短路那条, '短路没留痕').toBeTruthy();
    expect(短路那条.毫秒).toBe(0);
    expect(短路那条.成).toBe(false);
  });
});

describe('④ 接线：追踪器挂在舱壁那条路上', () => {
  it('Game 把同一个追踪器交给舱壁组与性能面板', () => {
    expect(游戏源文).toMatch(/this\.追踪 = 建追踪\(/);
    expect(游戏源文).toMatch(/建舱壁组\(\{[^}]*追踪: this\.追踪/);
    expect(游戏源文).toMatch(/new PerfHUD\(\{[^}]*trace: this\.追踪/);
  });

  it('帧的边界在主循环里：开帧在 update 里、收帧在 render 之后', () => {
    expect(游戏源文).toMatch(/this\.追踪\?\.开帧\(\)/);
    expect(游戏源文).toMatch(/this\.追踪\?\.收帧\(\)/);
    // 收帧必须在两个 try/catch 之后（render 炸了也要收帧）
    const 收帧位 = 游戏源文.indexOf('this.追踪?.收帧()');
    const render兜底位 = 游戏源文.indexOf("this._帧级兜底('render', err)");
    expect(收帧位, '收帧不在 render 兜底之后 ⇒ render 炸了那一帧的账永远没收')
      .toBeGreaterThan(render兜底位);
  });

  it('F3 把追踪器与性能 HUD 一起开/关（两个都是开发期仪器）', () => {
    expect(游戏源文).toMatch(/const 开 = this\.perfHud\?\.toggle\(\);[\s\S]{0,120}this\.追踪\?\.设开着\(开\)/);
  });

  it('追踪器不进舱壁（circular：舱壁量追踪、追踪量舱壁）', () => {
    expect(游戏源文).not.toMatch(/走舱壁\(this, '追踪'/);
    expect(游戏源文).not.toMatch(/走舱壁\(this, 'tracing'/);
  });

  it('反向控制：把子 span 的 parentId 抹掉，同一把尺子必须点名它', () => {
    // 判据在生产代码（`校验导出`），这里只喂坏数据。
    const 追踪 = 建追踪();
    追踪.设开着(true);
    tick();
    追踪.开帧();
    追踪.记('world', 2, true);
    追踪.收帧();
    const 好 = 追踪.导出();
    expect(校验导出(好), '好数据被判成坏的了').toEqual({ 孤儿: [], 错帧: [], 无根: [] });

    // 坏数据一：parentId 悬空
    const 孤儿 = 校验导出([...好, { ...好[1], id: 十六(999), parentId: 十六(888) }]);
    expect(孤儿.孤儿.length, 'parentId 悬空没被点名').toBe(1);

    // 坏数据二：父 span **存在**但在另一条 trace 里（跨帧串了）
    const 另一帧根 = { ...好[0], id: 十六(996), traceId: 十六(4242) };
    const 错帧 = 校验导出([
      ...好,
      另一帧根,
      { ...好[1], id: 十六(997), parentId: 另一帧根.id, traceId: 十六(7) },
    ]);
    expect(错帧.错帧.length, '跨帧串了没被点名').toBe(1);
    expect(错帧.孤儿.length, '这一条不该被判成孤儿（父 span 是存在的）').toBe(0);

    // 坏数据三：两个根
    const 无根 = 校验导出([...好, { ...好[0], id: 十六(995) }]);
    expect(无根.无根.length, '两个根没被点名').toBe(2);
  });
});
