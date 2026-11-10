/**
 * 写者租约与栅栏令牌（B168 / Spring Cloud 内化 切片6）。
 *
 * ## 这一片量的是什么
 *
 * 切片5 的总线让"被别人写了"看得见，**看得见之后照样丢**：两个标签页各存一次同一格，
 * 后一次把前一次整体退回，而两次 `save()` 都返回 true。改前实测（同一份存储、同一条键）：
 * `stats.souls` 9,500 → **130**、`stats.level` 7 → **1**、`player.x`／`player.z` 88／42 → **1／3**。
 *
 * 五组分别量：① 记录与令牌（那一本账本身对不对）② 陈旧写者与手动第二次（拦得住吗）
 * ③ 释放 / 坏记录 / 量不到（纪律 3 与 4）④ 旋钮 enforce（拦错了要不重启就放开）
 * ⑤ 接线与性质（真的接进 SaveSystem / Game 了吗，以及**把接线摘掉丢失就回来**）。
 *
 * 判据里的数不是抄来的：② 的令牌序列、⑤ 的端到端差异都从**同一条调用序列**现推。
 * ⑤ 的反向控制臂（摘掉 `租约` ⇒ 差异回来；不带 `期望` ⇒ 两个实例占住同一个令牌）
 * 证明这几条量的是**这套机制**，不是测试自己写的断言。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  建写者租约, 锁键, 锁键后缀, 记录版本, 账上限, 强制键, 默认强制, 租约可调项, 动作集, 原因集,
} from '../src/platform/lease.js';
import { 建配置, 默认应用名 } from '../src/platform/config.js';
import { 舱壁可调项 } from '../src/platform/bulkhead.js';
import { 追踪可调项 } from '../src/platform/tracing.js';
import { 监听可调项 } from '../src/engine/EventBus.js';
import { SaveSystem, slotKey, 存档题 } from '../src/game/SaveSystem.js';
import { CURRENT_VERSION } from '../src/game/SaveMigrations.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { 键数问题 } from './helpers/i18nKeyCount.js';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');
const 租约源文 = 读('src/platform/lease.js');
const 存档源文 = 读('src/game/SaveSystem.js');
const 游戏源文 = 读('src/core/Game.js');
const 暂停源文 = 读('src/ui/PauseMenu.js');

/** 资源名就用存储键的样子：本模块只知道这个名字，不知道它是第几槽 */
const K = 'crossrealm_save_v21';

/* ------------------------------------------------------------------ *
 * 尺子
 * ------------------------------------------------------------------ */

/** 剥掉注释（块注释 + 整行行注释），只留代码 —— 纪律 5 那条"不读钟"扫的是代码 */
function 剥注释(源) {
  return 源.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** 模块级函数体：从 `function 名(` 到下一个顶格 `}`（CRLF 安全：找的是 `\n}`） */
function 函数体(源, 名) {
  const 起 = 源.indexOf(`function ${名}(`);
  if (起 < 0) return null;
  const 止 = 源.indexOf('\n}', 起);
  return 止 < 0 ? null : 源.slice(起, 止);
}

/** 类方法体：从 `static 名(` 到下一个两格缩进的 `}` */
function 方法体(源, 名) {
  const 起 = 源.indexOf(名);
  if (起 < 0) return null;
  const 止 = 源.indexOf('\n  }', 起);
  return 止 < 0 ? null : 源.slice(起, 止);
}

/** 会坏的 localStorage：坏 = { 读, 写, 删 }，可以跑到一半再改（占坑失败那一路要的就是这个） */
function 假存储(初 = {}, 坏初 = {}) {
  const 存 = new Map(Object.entries(初));
  const 台 = {
    存,
    坏: { ...坏初 },
    getItem: (k) => {
      if (台.坏.读) throw new Error('denied');
      return 存.has(k) ? 存.get(k) : null;
    },
    setItem: (k, v) => {
      if (台.坏.写) throw new Error('QuotaExceededError');
      存.set(k, String(v));
    },
    removeItem: (k) => {
      if (台.坏.删) throw new Error('denied');
      存.delete(k);
    },
  };
  return 台;
}

/** 递归差异（⑤ 端到端那两条的尺子，与改前那趟读数同一把） */
function 差异(a, b, 前缀 = '', 出 = []) {
  const 键 = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of 键) {
    const x = a?.[k];
    const y = b?.[k];
    const 是对象 = x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x);
    if (是对象) 差异(x, y, `${前缀}${k}.`, 出);
    else if (JSON.stringify(x) !== JSON.stringify(y)) 出.push(`${前缀}${k}`);
  }
  return 出;
}

/* ------------------------------------------------------------------ *
 * ① 记录与令牌
 * ------------------------------------------------------------------ */

describe('① 记录与令牌：那一本账本身', () => {
  it('锁键 = 资源名 + `:lock`（与 quarantine 的 `:corrupt` 同一个后缀惯例）', () => {
    expect(锁键(K)).toBe(`${K}${锁键后缀}`);
    expect(锁键后缀).toBe(':lock');
    expect(锁键('crossrealm_save_v21_slot2')).toBe('crossrealm_save_v21_slot2:lock');
  });

  it('空资源名当场抛 —— 拼错了不会报错，只会"每个人都有自己的锁"', () => {
    for (const 坏 of ['', null, undefined, 0, {}, ['a']]) {
      expect(() => 锁键(坏), `收到 ${String(坏)} 却抛不出来`).toThrow(/非空字符串/);
    }
  });

  it('第一次占坑写下四格：v / owner / token / at', () => {
    const 存 = 假存储();
    const 租 = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const 占 = 租.抢占(K, 1_700_000_000_000);
    expect(占).toMatchObject({ 成: true, 因: 'taken', 令牌: 1, 前: 0 });
    expect(JSON.parse(存.存.get(锁键(K)))).toEqual({
      v: 记录版本, owner: 'tab-A', token: 1, at: 1_700_000_000_000,
    });
    expect(记录版本).toBe(1);
  });

  it('令牌单调递增：同一个实例连占三次是 1/2/3，换一个实例从 3 接到 4（不从 1 重来）', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    expect([A.抢占(K).令牌, A.抢占(K).令牌, A.抢占(K).令牌]).toEqual([1, 2, 3]);
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    expect(B.抢占(K).令牌).toBe(4);
    expect(B.记录(K)).toMatchObject({ 有: true, 因: 'ok', 令牌: 4, 持有者: 'tab-B' });
  });

  it('`at` 只是给人看的：后来者递一个更早的时刻照样顶掉前者（判定不看钟）', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    A.抢占(K, 9_999_999);
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    expect(B.抢占(K, 1)).toMatchObject({ 成: true, 令牌: 2 });
    expect(A.可写(K)).toMatchObject({ 成: false, 因: 'stale', 视图: 1, 令牌: 2, 持有者: 'tab-B' });
  });

  it('纪律 5：模块代码里一个钟都不读、一个计时器都不开（注释里提了 Date.now 不算）', () => {
    const 码 = 剥注释(租约源文);
    for (const 装置 of ['Date.now', 'performance.now', 'new Date', 'setTimeout', 'setInterval', 'requestAnimationFrame']) {
      expect(码, `租约里出现了 ${装置} —— 那一格不确定性不许引进来`).not.toContain(装置);
    }
    // 反向控制：同一把尺子喂一段带钟的代码，必须点名（否则上面那六条是在空集上恒真）
    const 假代码 = 剥注释('/* const t = Date.now(); */\nconst 钟 = performance.now(); // setTimeout(f, 1)\nconst 又 = new Date();');
    expect(假代码).not.toContain('Date.now');
    expect(剥注释('const 钟 = performance.now();\nsetTimeout(f, 1);')).toContain('performance.now');
  });

  it('视图与记录分家：占坑只推自己的视图，别人的视图一个字都不动', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    A.抢占(K);
    expect(A.视图令牌(K)).toBe(2);
    expect(B.视图令牌(K)).toBe(1);
    expect(B.记录(K).令牌).toBe(2);
  });

  it('从没问过的资源没有视图（null），而不是 0 —— 0 是"读过一个空键"', () => {
    const 租 = 建写者租约({ 身份: 'tab-A', 存储: 假存储() });
    expect(租.视图令牌(K)).toBe(null);
    expect(租.观测(K)).toBe(0);
    expect(租.视图令牌(K)).toBe(0);
  });

  it('账按 指纹 去重、封顶 50、清账有出口', () => {
    const 租 = 建写者租约({ 身份: 'tab-A', 存储: 假存储() });
    for (let i = 0; i < 5; i += 1) 租.抢占(K);
    const 账 = 租.账();
    expect(账).toHaveLength(1);
    expect(账[0]).toMatchObject({ 指纹: `take|${K}|taken`, 动作: 'take', 资源: K, 因: 'taken', 次数: 5, 视图: 1, 令牌: 0 });
    // 首见的那一格留原值，只有"最近"跟着走 —— 否则账上读不出第一次是在几号令牌上发生的
    expect(账[0].最近视图).toBe(5);
    expect(账[0].最近令牌).toBe(4);
    const 多 = 建写者租约({ 身份: 'tab-A', 存储: 假存储() });
    for (let i = 0; i < 账上限 + 20; i += 1) 多.抢占(`res-${i}`);
    expect(多.账().length).toBe(账上限);
    expect(账上限).toBe(50);
    expect(多.清账()).toBe(账上限);
    expect(多.账()).toEqual([]);
  });

  it('账里出现的每个 动作/因 都在枚举名册里（值进诊断与判据，不许漂成中文描述句）', () => {
    const 租们 = [];
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    A.可写(K);
    A.抢占(K);
    A.观测(K);
    A.释放(K);
    A.可写(K);
    A.释放(K);
    租们.push(A);
    // contended 那一支：占坑时期望对不上（下面 ⑤ 有专条，这里只保证枚举扫得到它）
    const 台2 = 假存储();
    const C = 建写者租约({ 身份: 'tab-C', 存储: 台2 });
    const D = 建写者租约({ 身份: 'tab-D', 存储: 台2 });
    C.抢占(K);
    D.观测(K);
    D.抢占(K);
    C.抢占(K, null, { 期望: 1 });
    租们.push(C, D);
    // 量不到那一支
    租们.push(建写者租约({ 身份: 'tab-E', 存储: 假存储({}, { 读: true, 写: true, 删: true }) }));
    const 坏 = 租们[租们.length - 1];
    坏.可写(K);
    坏.抢占(K);
    坏.观测(K);
    坏.释放(K);
    // 脏记录那一支
    const 台3 = 假存储({ [锁键(K)]: '{oops' });
    const F = 建写者租约({ 身份: 'tab-F', 存储: 台3 });
    F.可写(K);
    租们.push(F);
    const 动作 = new Set();
    const 因 = new Set();
    for (const 租 of 租们) for (const 条 of 租.账()) { 动作.add(条.动作); 因.add(条.因); }
    for (const a of 动作) expect(动作集, `没登记过的动作：${a}`).toContain(a);
    for (const r of 因) expect(原因集, `没登记过的原因：${r}`).toContain(r);
    expect(因).toEqual(new Set(['no-record', 'taken', 'kept', 'released', 'contended', 'no-storage', 'bad-record']));
  });

  it('资源名册按调用方给的名字排，重复的名字只留一条', () => {
    const 存 = 假存储();
    const 租 = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    租.抢占(K);
    租.抢占(`${K}_slot1`);
    expect(租.资源名册([K, `${K}_slot1`, K])).toEqual([
      { 资源: K, 视图: 1, 有记录: true, 令牌: 1, 持有者: 'tab-A' },
      { 资源: `${K}_slot1`, 视图: 1, 有记录: true, 令牌: 1, 持有者: 'tab-A' },
    ]);
  });

  it('身份缺省走 bus.js 的 实例身份()，同一个口径才有"谁是谁"', () => {
    const 租 = 建写者租约({ 存储: 假存储() });
    expect(租.读数().身份).toMatch(/^[a-z0-9-]+$/);
    expect(租.读数().身份.length).toBeGreaterThan(4);
    expect(建写者租约({ 身份: ' 手写的 ', 存储: 假存储() }).读数().身份).toBe(' 手写的 ');
  });
});

/* ------------------------------------------------------------------ *
 * ② 陈旧写者与手动第二次
 * ------------------------------------------------------------------ */

describe('② 陈旧写者与手动第二次：拦得住吗', () => {
  it('教科书场景：B 观测过又写了，A 那份旧读数被栅栏拦住', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    B.抢占(K);
    const 判 = A.可写(K);
    expect(判).toMatchObject({ 成: false, 因: 'stale', 视图: 1, 令牌: 2, 持有者: 'tab-B' });
    expect(存.存.get(锁键(K))).toContain('"token":2');
  });

  it('拦住的是**写**：记录没被顶掉、视图没被推上去、令牌没被跳过', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    B.抢占(K);
    A.可写(K);
    expect(A.抢占(K, null, { 期望: 1 })).toMatchObject({ 成: false, 因: 'contended', 前: 2 });
    expect(A.视图令牌(K)).toBe(1);
    expect(JSON.parse(存.存.get(锁键(K)))).toMatchObject({ owner: 'tab-B', token: 2 });
  });

  it('自己的第二次保存不拦（视图 === 记录）—— 对照组：同一标签页反复存是合法的', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    A.抢占(K);
    expect(A.可写(K)).toMatchObject({ 成: true, 因: 'match', 视图: 1, 令牌: 1 });
    expect(A.抢占(K, null, { 期望: 1 })).toMatchObject({ 成: true, 令牌: 2 });
    expect(A.可写(K).成).toBe(true);
  });

  it('从没读过这一格 ⇒ never-seen 放行：把新游戏存进别人写过的格子是玩家的主动动作', () => {
    const 存 = 假存储({ [锁键(K)]: JSON.stringify({ v: 记录版本, owner: 'tab-B', token: 3, at: null }) });
    const C = 建写者租约({ 身份: 'tab-C', 存储: 存 });
    expect(C.可写(K)).toMatchObject({ 成: true, 因: 'never-seen', 视图: null, 令牌: 3, 持有者: 'tab-B' });
    expect(C.抢占(K, null, { 期望: 3 })).toMatchObject({ 成: true, 令牌: 4 });
  });

  it('空键（没人写过）⇒ no-record 放行，令牌从 1 起', () => {
    const 租 = 建写者租约({ 身份: 'tab-A', 存储: 假存储() });
    expect(租.可写(K)).toMatchObject({ 成: true, 因: 'no-record', 令牌: 0 });
    expect(租.抢占(K, null, { 期望: 0 })).toMatchObject({ 成: true, 令牌: 1 });
  });

  it('手动第一次同样拦住，但把"已经当面说过了"记下来', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    B.抢占(K);
    expect(A.可写(K, { 手动: true })).toMatchObject({ 成: false, 因: 'stale', 令牌: 2 });
    expect(A.账().find((条) => 条.因 === 'stale')).toBeTruthy();
  });

  it('手动第二次让路（override）：那一下是玩家的决定，不是 bug', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    B.抢占(K);
    A.可写(K, { 手动: true });
    expect(A.可写(K, { 手动: true })).toMatchObject({ 成: true, 因: 'override', 视图: 1, 令牌: 2 });
    expect(A.抢占(K, null, { 期望: 2 })).toMatchObject({ 成: true, 令牌: 3 });
  });

  it('override 只对**那一份**冲突有效：对面又写了一次，就重新拦（一次授权不许永远有效）', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    B.抢占(K);
    A.可写(K, { 手动: true });
    B.抢占(K);
    expect(A.可写(K, { 手动: true })).toMatchObject({ 成: false, 因: 'stale', 令牌: 3 });
  });

  it('自动那一列的拒绝不许替玩家按下第二下：第一次当面按仍然拦住、第二下才让路', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    B.抢占(K);
    for (let i = 0; i < 3; i += 1) expect(A.可写(K).成).toBe(false);
    // 改前这一条是 true：自动保存先把"已提示"记上了，玩家第一次当面按下就直接放行 ——
    // 警告一次没说，别人那份档已经盖下去了。
    expect(A.可写(K, { 手动: true })).toMatchObject({ 成: false, 因: 'stale', 令牌: 2 });
    expect(A.可写(K, { 手动: true })).toMatchObject({ 成: true, 因: 'override' });
  });

  it('提示只对**那一个令牌**有效：当面拦过一次、换个令牌还要重新问两下', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    B.抢占(K);
    expect(A.可写(K, { 手动: true }).成).toBe(false);
    B.抢占(K);
    expect(A.可写(K, { 手动: true }).成).toBe(false);
    expect(A.可写(K, { 手动: true })).toMatchObject({ 成: true, 因: 'override', 令牌: 3 });
  });

  it('拒绝那一刻上报五个字段（视图 / 令牌 / 持有者 / 资源 / 描述）；放行的一条都不报', () => {
    const 存 = 假存储();
    const 收 = [];
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存, 上报: (条) => 收.push(条) });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    expect(收).toEqual([]);
    B.观测(K);
    B.抢占(K);
    A.可写(K);
    expect(收).toHaveLength(1);
    expect(收[0]).toMatchObject({ 资源: K, 视图: 1, 令牌: 2, 持有者: 'tab-B' });
    expect(收[0].描述).toContain(K);
  });

  it('上报出口自己炸了不许带走判定（判定在前，出口在后）', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存, 上报: () => { throw new Error('出口炸了'); } });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    B.抢占(K);
    expect(() => A.可写(K)).not.toThrow();
    expect(A.可写(K).成).toBe(false);
  });

  it('读数：每个数都从账推，放行/拒绝/抢占各占其位', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    B.抢占(K);
    A.可写(K);
    A.可写(K);
    const 读 = A.读数();
    // 两次同一类拒绝在账上是一行两次，而读数把这个"次数"加回来 —— 判据读的是次数不是行数
    expect(读).toMatchObject({ 身份: 'tab-A', 存储: 'localStorage', 强制: true, 拒绝: 2, 抢占: 1 });
    expect(读.放行).toBe(0);
    expect(读.资源数).toBe(1);
    expect(读.观测).toBe(0);
    expect(B.读数().观测).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * ③ 释放 / 坏记录 / 量不到
 * ------------------------------------------------------------------ */

describe('③ 释放、坏记录、量不到：纪律 3 与 4', () => {
  it('释放自己的：记录删掉、视图清空、下一次问就是 no-record', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    A.抢占(K);
    expect(A.释放(K)).toMatchObject({ 成: true, 因: 'released' });
    expect(存.存.has(锁键(K))).toBe(false);
    expect(A.视图令牌(K)).toBe(null);
    expect(A.可写(K)).toMatchObject({ 成: true, 因: 'no-record' });
  });

  it('不许释放别人的锁（纪律 4）：成 = false、记录还在、令牌没被抹、还上报一条', () => {
    const 存 = 假存储();
    const 收 = [];
    // 上报挂在 A 上：动手解别人锁的是 A，那一行账该进 A 那一路的诊断出口
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存, 上报: (条) => 收.push(条) });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.抢占(K);
    expect(A.释放(K)).toMatchObject({ 成: false, 因: 'not-owner', 持有者: 'tab-B' });
    expect(JSON.parse(存.存.get(锁键(K)))).toMatchObject({ owner: 'tab-B', token: 2 });
    expect(收[0].描述).toContain('tab-B');
    expect(B.释放(K).成).toBe(true);
  });

  it('释放一条不存在的记录：不抛，成 = false 因 no-record', () => {
    const A = 建写者租约({ 身份: 'tab-A', 存储: 假存储() });
    expect(A.释放(K)).toMatchObject({ 成: false, 因: 'no-record' });
    expect(A.读数().想放别人的锁).toBe(0);
  });

  it('坏记录（别人写的脏键）⇒ 放行：量不到就不拦，但把"量不到"留下名字', () => {
    const 存 = 假存储({ [锁键(K)]: '不是 JSON' });
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    A.观测(K);
    expect(A.可写(K)).toMatchObject({ 成: true, 因: 'bad-record' });
    expect(A.记录(K)).toMatchObject({ 有: false, 因: 'bad-record' });
  });

  it('形状不对的记录同样算坏记录：token 不是整数 / owner 不是字符串 / 数组 / null', () => {
    for (const 脏 of ['[]', 'null', '{"owner":"a"}', '{"token":"1","owner":"a"}', '{"token":-2,"owner":"a"}', '"a"']) {
      const 存 = 假存储({ [锁键(K)]: 脏 });
      const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
      expect(A.可写(K).因, `脏记录没认出来：${脏}`).toBe('bad-record');
    }
  });

  it('坏记录被下一次占坑顶掉（自愈）：一个从没写对的键不许永远挡住这一格', () => {
    const 存 = 假存储({ [锁键(K)]: '{oops' });
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    expect(A.抢占(K)).toMatchObject({ 成: true, 因: 'taken', 前: 0, 令牌: 1 });
    expect(A.记录(K)).toMatchObject({ 有: true, 因: 'ok', 令牌: 1 });
  });

  it('存储整个不可用（隐私模式被禁）⇒ 放行、占坑失败留名、不抛', () => {
    const 租 = 建写者租约({ 身份: 'tab-A', 存储: null });
    expect(租.可写(K)).toMatchObject({ 成: true, 因: 'no-storage' });
    expect(租.抢占(K)).toMatchObject({ 成: false, 因: 'no-storage', 令牌: null });
    expect(租.观测(K)).toBe(null);
    expect(租.释放(K)).toMatchObject({ 成: false, 因: 'no-storage' });
    expect(租.读数()).toMatchObject({ 存储: 'none', 放行: 1, 占坑失败: 1 });
  });

  it('存储一调就抛（真隐私模式的形状）同样算量不到，而不是把保存掀翻', () => {
    const 租 = 建写者租约({ 身份: 'tab-A', 存储: 假存储({}, { 读: true, 写: true, 删: true }) });
    expect(() => 租.可写(K)).not.toThrow();
    expect(租.可写(K)).toMatchObject({ 成: true, 因: 'no-storage' });
    expect(租.抢占(K).成).toBe(false);
  });

  it('写不上记录 ≠ 写不上档：占坑失败时视图不动（下一次问还是原来那份读数）', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    A.抢占(K);
    // 只坏写、读照旧：B 必须**读得到** A 那条记录（令牌 1），否则这一臂量的就不是"写不上记录"，
    // 而是"这一块盘根本不存在"（那是纪律 3 的 no-storage，另一条用例已经量过）。
    存.坏 = { 写: true };
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    B.观测(K);
    expect(B.抢占(K).成).toBe(false);
    expect(B.视图令牌(K)).toBe(1);
    expect(A.视图令牌(K)).toBe(1);
  });

  it('关() 只清本地状态：存储里那条记录留着，那是别人的读数依据', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    expect(A.关()).toBe(true);
    expect(A.视图令牌(K)).toBe(null);
    expect(存.存.has(锁键(K))).toBe(true);
    expect(B.记录(K).令牌).toBe(1);
    expect(A.dispose()).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * ④ 旋钮 enforce
 * ------------------------------------------------------------------ */

describe('④ 旋钮：拦错了要能不重启就放开', () => {
  it('名册一条：键、缺省、校验、说明齐', () => {
    expect(租约可调项).toHaveLength(1);
    const [项] = 租约可调项;
    expect(项.键).toBe(强制键);
    expect(项.键).toMatch(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/);
    expect(项.缺省).toBe(默认强制);
    expect(默认强制).toBe(true);
    expect(项.校验(true)).toBe(true);
    expect(项.校验(false)).toBe(true);
    expect(项.校验('false'), '字符串 "false" 不是布尔').toBe(false);
    expect(项.校验(undefined)).toBe(false);
    expect(项.说明.length).toBeGreaterThan(3);
  });

  it('缺省与校验住在主人模块：config.js 源码里搜不到 lease 这个键', () => {
    const 源 = 读('src/platform/config.js');
    expect(源).not.toContain('lease');
    expect(源).not.toContain('enforce');
  });

  it('旋钮不与舱壁 / 追踪 / 监听那几枚撞号', () => {
    const 别人的 = new Set([...舱壁可调项, ...追踪可调项, ...监听可调项].map((项) => 项.键));
    expect(别人的.size).toBeGreaterThan(3);
    expect(别人的.has(强制键)).toBe(false);
  });

  it('关掉 ⇒ enforce-off 放行（回到 B168 之前那份行为）', () => {
    const 配置 = 建配置({ 名册: 租约可调项 });
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存, 配置 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    B.抢占(K);
    expect(A.可写(K).成).toBe(false);
    配置.下发({
      name: 默认应用名,
      propertySources: [{ name: 'local', source: { [强制键]: false } }],
    }, { 来源: 'local' });
    expect(A.可写(K)).toMatchObject({ 成: true, 因: 'enforce-off', 令牌: null });
    expect(A.读数().强制).toBe(false);
  });

  it('每问一次现读旋钮：再下发 true 就立刻回到拦住的状态（不许把开关抄进构造）', () => {
    const 配置 = 建配置({ 名册: 租约可调项 });
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存, 配置 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    B.抢占(K);
    const 关 = (值) => 配置.下发({
      name: 默认应用名,
      propertySources: [{ name: 'local', source: { [强制键]: 值 } }],
    }, { 来源: 'local' });
    关(false);
    expect(A.可写(K).因).toBe('enforce-off');
    关(true);
    expect(A.可写(K).因).toBe('stale');
    关(false);
    expect(A.可写(K).因).toBe('enforce-off');
  });

  it('值不是布尔 ⇒ 整份文档被拒：配置中心不替它猜一个"差不多的值"', () => {
    const 配置 = 建配置({ 名册: 租约可调项 });
    const A = 建写者租约({ 身份: 'tab-A', 存储: 假存储(), 配置 });
    const 回 = 配置.下发({
      name: 默认应用名,
      propertySources: [{ name: 'local', source: { [强制键]: 'false' } }],
    }, { 来源: 'local' });
    expect(回.成).toBe(false);
    expect(回.原因).toContain(强制键);
    expect(A.读数().强制, '被拒的文档不许改档').toBe(true);
  });

  it('enforce 关掉时占坑照做（放行不等于不记账）：令牌仍在涨，重新打开立刻拦住旧视图', () => {
    const 配置 = 建配置({ 名册: 租约可调项 });
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存, 配置 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存, 配置 });
    const 关 = (值) => 配置.下发({
      name: 默认应用名,
      propertySources: [{ name: 'local', source: { [强制键]: 值 } }],
    }, { 来源: 'local' });
    关(false);
    expect(A.抢占(K).令牌).toBe(1);
    expect(B.抢占(K).令牌).toBe(2);
    expect(A.可写(K).因).toBe('enforce-off');
    expect(A.读数().放行).toBe(1);
    关(true);
    expect(A.可写(K)).toMatchObject({ 成: false, 因: 'stale', 视图: 1, 令牌: 2 });
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ 接线与性质
 * ------------------------------------------------------------------ */

const 存储 = new Map();

function 建宿主(souls = 100) {
  return {
    dialog: { toasts: [], toast(m) { this.toasts.push(m); } },
    player: {
      position: { x: 1, y: 2, z: 3 },
      yaw: 0.5, pitch: 0.2,
      combat: { hp: 100, maxHp: 118, stamina: 50 },
      teleport() {},
    },
    stats: {
      data: { bag: [], level: 1, souls },
      toJSON() { return { ...this.data }; },
      fromJSON(d) { this.data = { ...this.data, ...d }; },
      pushToConsumers() {},
    },
    quests: new QuestSystem({ toast() {} }),
    spells: { mana: 100 },
    settings: { data: {}, applyToGame() {} },
    weaponSkills: { unlocked: new Set(), toJSON: () => ({ unlocked: [] }), fromJSON() {} },
    restPointEnhancer: {
      discovered: new Set(),
      toJSON() { return { discovered: [...this.discovered] }; },
      fromJSON(d) { this.discovered = new Set(d?.discovered ?? []); },
    },
    总线: { 发布的名: [], 发布(题, 载荷) { this.发布的名.push([题, 载荷?.slot]); } },
    errorReporter: { 条: [], record(错) { this.条.push(错); } },
  };
}

/** 两个标签页共用一块 localStorage，各有一本自己的租约 */
function 接租约(...身份们) {
  const 配置 = 建配置({ 名册: 租约可调项 });
  return 身份们.map((身份) => 建写者租约({ 身份, 存储: globalThis.localStorage, 配置 }));
}

beforeAll(() => {
  globalThis.window = { addEventListener() {}, dispatchEvent() { return true; } };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  globalThis.localStorage = {
    getItem: (k) => (存储.has(k) ? 存储.get(k) : null),
    setItem: (k, v) => 存储.set(k, String(v)),
    removeItem: (k) => 存储.delete(k),
  };
  globalThis.document = { createElement: () => ({ click() {}, set href(v) {}, get href() { return ''; } }) };
  globalThis.URL = class {
    static createObjectURL() { return 'blob:x'; }
    static revokeObjectURL() {}
  };
  globalThis.Blob = class {};
  globalThis.FileReader = class {
    readAsText(file) { this.result = file.text; this.onload(); }
  };
});

beforeEach(() => 存储.clear());

describe('⑤ 接线与性质：真的接在落盘那一步前面', () => {
  it('落盘那一步的顺序：问门 → 占坑（比较后写）→ 写内容（纪律 2），三步之间没有 await（纪律 6）', () => {
    const 问 = 函数体(存档源文, '问门');
    const 占 = 函数体(存档源文, '占坑并落盘');
    const 体 = 方法体(存档源文, 'static save(');
    expect(问, 'SaveSystem.js 里找不到 问门 —— 接线没进去').not.toBeNull();
    expect(占, 'SaveSystem.js 里找不到 占坑并落盘 —— 接线没进去').not.toBeNull();
    expect(问).toContain('.可写(');
    expect(占).toContain('.抢占(');
    expect(占).toContain('{ 期望:');
    const 顺序 = (s) => s.indexOf('问门(') > -1 && s.indexOf('问门(') < s.indexOf('占坑并落盘(')
      && s.indexOf('占坑并落盘(') < s.lastIndexOf('setItem');
    expect(顺序(体), 'save() 里三步不是 问门 → 占坑 → 落盘').toBe(true);
    for (const 段 of [问, 占, 体]) expect(段, '两步之间让出了事件循环').not.toContain('await');
    // 反向控制：一把"先落盘再问门"的假 body 喂给同一把尺子，必须判它不合格
    const 倒置体 = 'const 门 = 问门(game, key, 手动); localStorage.setItem(key, s); 占坑并落盘(game, key);';
    expect(顺序(倒置体)).toBe(false);
  });

  it('拒绝那一路既不落盘也不广播（被拦下的一次保存不许通知别人"我写了"）', () => {
    const 体 = 函数体(存档源文, '拒绝落盘');
    expect(体).not.toContain('setItem');
    expect(体).not.toContain('广播存档');
    expect(函数体(存档源文, '问门')).toContain('if (!game.租约) return { 成: true, 判: null };');
    expect(存档源文).toContain("game.租约.可写(key, { 手动 })");
  });

  it('SaveSystem 不 import 租约模块：资源名就是那条存储键，谁持有它由宿主递进来', () => {
    expect(存档源文).not.toContain('platform/lease.js');
    expect(存档源文).not.toContain('建写者租约');
    expect(存档源文).toMatch(/game\.租约\.(可写|抢占)\(/);
    expect(存档源文).toMatch(/game\.租约\?\.\s*观测\?\.\(/s);
    expect(租约源文).not.toContain('slotKey');
    expect(租约源文).not.toContain('SAVE_SLOTS');
    expect(租约源文).not.toContain('crossrealm_save');
  });

  it('Game：租约建在开机读档之前、走 _adopt 收编、上报进错误账', () => {
    expect(游戏源文).toContain("import { 建写者租约, 租约可调项 } from '../platform/lease.js';");
    const 起 = 游戏源文.indexOf('建写者租约({');
    expect(起).toBeGreaterThan(-1);
    expect(起).toBeLessThan(游戏源文.indexOf('SaveSystem.load(this)'), '晚了第一次保存不知道自己几点钟的读数');
    expect(游戏源文).toContain("this._adopt('platform/SaveWriterLease'");
    const 块 = 游戏源文.slice(起, 游戏源文.indexOf('}));', 起));
    expect(块).toContain('配置: this.配置');
    expect(块).toContain("kind: 'lease'");
    expect(块).toContain("source: 'platform/lease.js'");
    expect(游戏源文).toMatch(/名册:\s*\[[^\]]*\.\.\.租约可调项\s*\]/);
  });

  it('玩家当面的那两下带 手动：快捷键与暂停菜单，自动保存不带', () => {
    expect(游戏源文).toMatch(/case 'save': return SaveSystem\.save\(this, 0, \{ 手动: true \}\);/);
    expect(暂停源文).toMatch(/SaveSystem\.save\(this\.game, this\.selectedSlot\(\), \{ 手动: true \}\)/);
    expect(暂停源文).toMatch(/SaveSystem\.importFile\(this\.game, file, this\.selectedSlot\(\), \{ 手动: true \}\)/);
    const 自动 = [...存档源文.matchAll(/static (save|importFile)\(game[^)]*\)/g)].map((m) => m[0]);
    expect(自动).toEqual([
      'static save(game, slot = 0, { 手动 = false } = {})',
      'static importFile(game, file, slot = 0, { 手动 = false } = {})',
    ]);
  });

  it('端到端（改后）：A 存 ⇒ B 读并玩 ⇒ B 存 ⇒ A 再存 —— B 那一份一个字都没丢', () => {
    const [租A, 租B] = 接租约('tab-A', 'tab-B');
    const A = 建宿主();
    A.租约 = 租A;
    const B = 建宿主();
    B.租约 = 租B;
    expect(SaveSystem.save(A, 0)).toBe(true);
    expect(SaveSystem.load(B, 0)).toBe(true);
    B.stats.data.souls = 9_500;
    B.stats.data.level = 7;
    B.player.position.x = 88;
    B.player.position.z = 42;
    expect(SaveSystem.save(B, 0)).toBe(true);
    const B那一份 = localStorage.getItem(slotKey(0));

    A.stats.data.souls = 130;
    expect(SaveSystem.save(A, 0)).toBe(false);
    expect(localStorage.getItem(slotKey(0)), '被拦下的那一次仍然改了盘').toBe(B那一份);
    expect(A.errorReporter.条.map((条) => 条.kind)).toEqual(['lease']);
    expect(A.errorReporter.条[0].message).toMatch(/lease=stale view=1 record=2/);
    expect(A.总线.发布的名).toEqual([[存档题, 0]]);
    expect(A.dialog.toasts).toEqual(['进度已保存']);
    expect(租A.读数()).toMatchObject({ 拒绝: 1, 抢占: 1 });
  });

  it('反向控制：同一趟把 租约 摘掉 ⇒ 改前那个读数原样回来（证明上面那条量的是接线）', () => {
    const A = 建宿主();
    const B = 建宿主();
    expect(SaveSystem.save(A, 0)).toBe(true);
    expect(SaveSystem.load(B, 0)).toBe(true);
    B.stats.data.souls = 9_500;
    B.stats.data.level = 7;
    B.player.position.x = 88;
    B.player.position.z = 42;
    expect(SaveSystem.save(B, 0)).toBe(true);
    const B的档 = JSON.parse(localStorage.getItem(slotKey(0)));
    A.stats.data.souls = 130;
    expect(SaveSystem.save(A, 0)).toBe(true);
    const 现在 = JSON.parse(localStorage.getItem(slotKey(0)));
    expect(现在.stats.souls).toBe(130);
    expect(差异(现在, B的档).filter((路) => 路 !== 'time').sort())
      .toEqual(['player.x', 'player.z', 'stats.level', 'stats.souls']);
    expect(A.errorReporter.条).toEqual([]);
  });

  it('读档过的那一格才有视图：没读过的格子第一次保存照样放行（新游戏存进别人写过的槽）', () => {
    const [租A, 租B] = 接租约('tab-A', 'tab-B');
    const B = 建宿主();
    B.租约 = 租B;
    expect(SaveSystem.save(B, 0)).toBe(true);
    const A = 建宿主(500);
    A.租约 = 租A;
    A.stats.data.souls = 700;
    expect(SaveSystem.save(A, 0)).toBe(true);
    expect(JSON.parse(localStorage.getItem(slotKey(0))).stats.souls).toBe(700);
    expect(A.租约.视图令牌(slotKey(0))).toBe(2);
    expect(B.租约.视图令牌(slotKey(0))).toBe(1);
  });

  it('手动第二次真能盖：第一次说话、第二次落盘，对面那一份从此归旧', () => {
    const [租A, 租B] = 接租约('tab-A', 'tab-B');
    const A = 建宿主();
    A.租约 = 租A;
    const B = 建宿主();
    B.租约 = 租B;
    SaveSystem.save(A, 0);
    SaveSystem.load(B, 0);
    B.stats.data.souls = 9_500;
    SaveSystem.save(B, 0);
    A.stats.data.souls = 130;
    expect(SaveSystem.save(A, 0, { 手动: true })).toBe(false);
    expect(A.dialog.toasts).toEqual(['进度已保存', '槽1已被另一个标签页写过 · 这一次保存没有落盘：再按一次就用这一份盖掉那一格']);
    expect(JSON.parse(localStorage.getItem(slotKey(0))).stats.souls).toBe(9_500);
    expect(SaveSystem.save(A, 0, { 手动: true })).toBe(true);
    expect(JSON.parse(localStorage.getItem(slotKey(0))).stats.souls).toBe(130);
    expect(A.dialog.toasts).toHaveLength(3);
    // B 的视图是 2 不是 1：`抢占` 自己把视图推到新令牌（上面"反向控制"那条同一条规矩），
    // B 写完那一刻它的内存就是记录 2 那一份 —— 此刻挡住 B 的是 A 刚盖下去的记录 3。
    expect(租B.可写(slotKey(0))).toMatchObject({ 成: false, 因: 'stale', 视图: 2, 令牌: 3 });
  });

  it('自动保存被拦住不说话：每 5 秒刷一次的那一路不许把提示打成噪音', () => {
    const [租A, 租B] = 接租约('tab-A', 'tab-B');
    const A = 建宿主();
    A.租约 = 租A;
    const B = 建宿主();
    B.租约 = 租B;
    SaveSystem.save(A, 0);
    SaveSystem.load(B, 0);
    SaveSystem.save(B, 0);
    const 提示前 = A.dialog.toasts.length;
    for (let i = 0; i < 5; i += 1) expect(SaveSystem.save(A, 0)).toBe(false);
    expect(A.dialog.toasts).toHaveLength(提示前);
    expect(A.总线.发布的名).toHaveLength(1);
    expect(A.errorReporter.条).toHaveLength(5);
    expect(A.errorReporter.条.every((条) => 条.kind === 'lease')).toBe(true);
  });

  it('自动保存那几问不算"当面说过"：玩家第一次按仍然拦住并说话，第二次才让路', () => {
    // 这一条钉的是 `可写` 里那句"提示过只由当面那一下记"：自动保存每 5 秒问一次，
    // 要是它也能把提示记上，玩家第一次当面按下就会被当成"第二次"直接放行 ——
    // 警告一次没说过，别人的档已经被盖下去了。
    const [租A, 租B] = 接租约('tab-A', 'tab-B');
    const A = 建宿主();
    A.租约 = 租A;
    const B = 建宿主();
    B.租约 = 租B;
    SaveSystem.save(A, 0);
    SaveSystem.load(B, 0);
    SaveSystem.save(B, 0);
    for (let i = 0; i < 3; i += 1) expect(SaveSystem.save(A, 0)).toBe(false);
    expect(A.dialog.toasts).toHaveLength(1);
    expect(SaveSystem.save(A, 0, { 手动: true }), '第一次当面按就放行了 —— 警告一次没说过').toBe(false);
    expect(A.dialog.toasts).toHaveLength(2);
    expect(SaveSystem.save(A, 0, { 手动: true })).toBe(true);
  });

  it('读档过的那一格才拦得住：B 读了，之后 C 写了一笔，B 再存必须让路（两个槽都钉）', () => {
    // 这一条补的是 M16 变异臂露出来的空档：把槽0 读档里的 `观测` 摘掉，整套 61 例全绿 ——
    // 因为端到端那条钉的是"**没读过**的那位被拦"，而"读过的那位被后写者挡住"没有一条腿。
    // 少了 `观测`，读档的实例下一次保存会被当成 never-seen（"这份内容不是从那格推出来的"），
    // 于是它拿着旧读数把别人的新进度整体盖掉 —— 正是这一片要防的那一种丢失。
    for (const 槽 of [0, 1]) {
      const [租A, 租B, 租C] = 接租约(`tab-A${槽}`, `tab-B${槽}`, `tab-C${槽}`);
      const A = 建宿主();
      A.租约 = 租A;
      expect(SaveSystem.save(A, 槽)).toBe(true);
      const B = 建宿主();
      B.租约 = 租B;
      expect(SaveSystem.load(B, 槽)).toBe(true);
      expect(租B.视图令牌(slotKey(槽)), `槽${槽}读档没记视图`).toBe(1);
      const C = 建宿主(777);
      C.租约 = 租C;
      expect(SaveSystem.save(C, 槽), 'C 没读过这一格：主动写新的一份，不拦').toBe(true);
      expect(SaveSystem.save(B, 槽), 'B 读档之后别人写了一笔，B 的旧读数不许落盘').toBe(false);
      expect(JSON.parse(localStorage.getItem(slotKey(槽))).stats.souls).toBe(777);
    }
  });

  it('比较后写：可写 与 抢占 之间被插一笔 ⇒ contended 让位，不写记录、不推视图', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    const 判 = A.可写(K);
    expect(判).toMatchObject({ 成: true, 因: 'match', 令牌: 1 });
    B.抢占(K);
    const 坑 = A.抢占(K, null, { 期望: 判.令牌 });
    expect(坑).toMatchObject({ 成: false, 因: 'contended', 令牌: null, 前: 2 });
    expect(A.视图令牌(K)).toBe(1);
    expect(JSON.parse(存.存.get(锁键(K))).owner).toBe('tab-B');
    expect(A.读数().占坑让位).toBe(1);
  });

  it('反向控制：不带 期望 的同一趟交错 ⇒ 占坑一路向前顶掉对面（`期望` 就是那一格）', () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    expect(A.可写(K)).toMatchObject({ 成: true, 因: 'match', 令牌: 1 });
    B.抢占(K);
    expect(A.抢占(K)).toMatchObject({ 成: true, 因: 'taken', 前: 2, 令牌: 3 });
    expect(A.视图令牌(K)).toBe(3);
    // B 刚写的那一份已经被一个"问过门但没核对过"的写者顶掉了 —— 这就是 lost update 的形状
    expect(B.可写(K)).toMatchObject({ 成: false, 因: 'stale', 视图: 2, 令牌: 3 });
    expect(A.读数().占坑让位).toBe(0);
  });

  it('把两步隔进异步 tick（纪律 6 那一路）仍然被查到 —— 窗口从"不许有 await"降级成"有也查得出来"', async () => {
    const 存 = 假存储();
    const A = 建写者租约({ 身份: 'tab-A', 存储: 存 });
    const B = 建写者租约({ 身份: 'tab-B', 存储: 存 });
    A.抢占(K);
    B.观测(K);
    const 判 = await Promise.resolve().then(() => A.可写(K));
    await Promise.resolve();
    B.抢占(K);
    expect(A.抢占(K, null, { 期望: 判.令牌 })).toMatchObject({ 成: false, 因: 'contended' });
    expect(JSON.parse(存.存.get(锁键(K))).owner).toBe('tab-B');
  });

  it('导入那一路同样过门，而且门在 ingest 之前：被拦 ⇒ 内存、盘、广播三处都没动', async () => {
    const [租A, 租B] = 接租约('tab-A', 'tab-B');
    const A = 建宿主();
    A.租约 = 租A;
    const B = 建宿主();
    B.租约 = 租B;
    expect(SaveSystem.save(A, 1)).toBe(true);
    const 内容 = localStorage.getItem(slotKey(1));
    expect(SaveSystem.load(B, 1)).toBe(true);
    B.stats.data.souls = 4_242;
    expect(SaveSystem.save(B, 1)).toBe(true);
    const 对面 = localStorage.getItem(slotKey(1));

    expect(await SaveSystem.importFile(A, { text: 内容 }, 1)).toBe(false);
    expect(localStorage.getItem(slotKey(1))).toBe(对面);
    expect(A.stats.data.souls).toBe(100);
    expect(A.dialog.toasts).toEqual(['进度已保存 · 槽2']);
    expect(A.总线.发布的名).toEqual([[存档题, 1]]);
    expect(A.errorReporter.条.map((条) => 条.kind)).toEqual(['lease']);
    // 玩家当面再按一次就落盘（与保存那一路同一个规矩）
    expect(await SaveSystem.importFile(A, { text: 内容 }, 1, { 手动: true })).toBe(false);
    expect(await SaveSystem.importFile(A, { text: 内容 }, 1, { 手动: true })).toBe(true);
    expect(A.dialog.toasts).toContain('存档已导入并写入浏览器');
    expect(租B.可写(slotKey(1)).成).toBe(false);
  });

  it('迁移回写也过同一道门：落盘的是刚读进来的那一份，视图 +1、记录换手', () => {
    const A = 建宿主(10);
    const [租A] = 接租约('tab-A');
    A.租约 = 租A;
    expect(SaveSystem.save(A, 0)).toBe(true);
    // 老档躺在**老键**里：槽 0 的读档链只在 `key 的版本 ≠ 当前版本` 时回写当前键，
    // 把 v17 的内容塞进 v21 键里量不到那一路（当前键命中即返回，压根不回写）。
    const 原始 = JSON.parse(localStorage.getItem(slotKey(0)));
    localStorage.removeItem(slotKey(0));
    localStorage.setItem('crossrealm_save_v17', JSON.stringify({ ...原始, version: 17 }));
    const B = 建宿主(0);
    const [租B] = 接租约('tab-B');
    B.租约 = 租B;
    expect(SaveSystem.load(B, 0)).toBe(true);
    expect(B.dialog.toasts[0]).toContain('已迁移到');
    expect(B.租约.视图令牌(slotKey(0))).toBe(2);
    expect(JSON.parse(localStorage.getItem(锁键(slotKey(0))))).toMatchObject({ owner: 'tab-B', token: 2 });
    expect(JSON.parse(localStorage.getItem(slotKey(0))).version).toBe(CURRENT_VERSION);
    // 旧键保留一份（那是回滚到旧构建还能读的依据），回写不是搬家
    expect(JSON.parse(localStorage.getItem('crossrealm_save_v17')).version).toBe(17);
  });

  it('迁移回写被拦住只跳过回写，读档本身照成（把"被拦"升成"读档失败"才是真的坏事）', () => {
    const A = 建宿主(10);
    const [租A] = 接租约('tab-A');
    A.租约 = 租A;
    expect(SaveSystem.save(A, 0)).toBe(true);
    const 原始 = JSON.parse(localStorage.getItem(slotKey(0)));
    localStorage.removeItem(slotKey(0));
    localStorage.setItem('crossrealm_save_v17', JSON.stringify({ ...原始, version: 17 }));
    const B = 建宿主(0);
    // 桩在这里比真租约合适：单线程里"观测刚读完、回写就被别人插一笔"造不出来，
    // 而这条要钉的是**被拦那一路的形状**（不占坑、不落盘、读档照成、账上留一行）。
    B.租约 = {
      可写: () => ({ 成: false, 因: 'stale', 视图: 1, 令牌: 2 }),
      抢占: () => { throw new Error('被拦住就不该占坑'); },
      观测: () => 1,
    };
    expect(SaveSystem.load(B, 0)).toBe(true);
    expect(B.dialog.toasts).toEqual([expect.stringContaining('已迁移到'), '存档已加载']);
    // 当前键**一个字节都没落下**：迁移后那份只在内存里，下次开机再迁一遍是幂等的
    expect(localStorage.getItem(slotKey(0))).toBe(null);
    expect(JSON.parse(localStorage.getItem('crossrealm_save_v17')).version).toBe(17);
    expect(B.errorReporter.条.map((条) => 条.kind)).toEqual(['lease']);
    expect(租A.读数().抢占).toBe(1);
  });

  it('文案腿：save_fenced_fmt 中英逐字、两表都在场、不孤儿、键数登记', () => {
    expect(STRINGS_ZH.save_fenced_fmt).toBe('槽${slot}已被另一个标签页写过 · 这一次保存没有落盘：再按一次就用这一份盖掉那一格');
    expect(STRINGS_EN.save_fenced_fmt).toBe('Another tab already wrote Slot ${slot} — this save was not applied. Press save again to overwrite it with this copy.');
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
    expect(键数问题(ZH_KEYS, EN_KEYS), '键数与登记值不符').toEqual([]);
    expect(存档源文).toContain("t('save_fenced_fmt'");
  });

  it('存档键的家族没被抄进租约：三个槽各占一条锁记录，互不干扰', () => {
    const [租A] = 接租约('tab-A');
    const A = 建宿主();
    A.租约 = 租A;
    expect(SaveSystem.save(A, 0)).toBe(true);
    expect(SaveSystem.save(A, 1)).toBe(true);
    expect(SaveSystem.save(A, 2)).toBe(true);
    const 锁们 = [...存储.keys()].filter((k) => k.endsWith(锁键后缀));
    expect(锁们.sort()).toEqual([slotKey(0), slotKey(1), slotKey(2)].map(锁键).sort());
    expect(租A.读数().资源数).toBe(3);
    expect(租A.读数().抢占).toBe(3);
  });
});
