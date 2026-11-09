/**
 * 链路追踪（Tracing）—— Spring Cloud Sleuth / Zipkin 语义的**内化**。
 *
 * ## 要补的缺口：帧耗时是**聚合数**，拆不开
 *
 * `PerfHUD` 只有三行聚合读数（FPS / 帧时耗 / 峰值帧）。三行都答不了
 * "这一帧是谁吃掉的" —— 而这正是"这一帧 20ms"最该问的问题。
 *
 * 仓里已经有第二把尺子：**每帧 CPU 普查**（`engine/` 下那个普查模块），它按**调用点**
 * 拆耗时。但它是**手动装**的仪器（装上去、跑完、卸下来），拆的是
 * "调用点"（`hud.update` 这一族），不是"子系统"；而且装上以后那一格的记账规则是
 * "根调用记自己的耗时、嵌套只记次数" —— 要读它得先懂它的记账口径。
 *
 * 本片要的是**另一件事**：一帧 = 一条 trace，一次子系统调用 = 一个 span，
 * 形状照 Zipkin 的 span 走（`traceId` / `id` / `parentId` / `name` / `timestamp` /
 * `duration`），这样导出的东西将来真接一个 Zipkin collector，前端这一层不改。
 *
 * ## 借 Spring Cloud 的哪个契约
 *
 * | 契约 | 在这里的落法 |
 * |------|--------------|
 * | **trace / span（Sleuth）** | 一帧 = 一条 trace；一次子系统调用 = 一个 span；帧本身是根 span |
 * | **span 父子（Zipkin）** | 子 span 的 `parentId` 指向那一帧的根 span |
 * | **导出形状（Zipkin v2 span）** | `{ traceId, id, parentId, name, timestamp, duration }`，时间单位**微秒** |
 * | **按需开（采样）** | 仪器默认**关**（开着才有开销）；F3 打开性能 HUD 时一起开 |
 *
 * ## 为什么 span 就是"舱壁调用"
 *
 * B163 之后主循环里每一条**写侧**子系统调用都走舱壁（`platform/bulkhead.js`），
 * 所以"谁被调了、调了多久"这件事**舱壁已经知道**。追踪器不另接一套钩子 ——
 * 它挂在舱壁这一条路上：调用发生 ⇒ 一个 span；舱壁短路（熔断中，没调下游）⇒
 * 一个 0 毫秒的"跳过"span。**一处真源**。
 *
 * ## 三条纪律
 *
 * 1. **帧号只有一个真源**：`engine/FrameBudget.js` 的 `currentFrame()` —— 不另起
 *    一本计数器（另起一本就是"帧号有两份真相"那一族）。
 * 2. **墙钟只进仪器**：span 的时间戳是墙钟微秒（纪元取建追踪器那一刻），
 *    但它**不进游戏状态** —— 只有仪器读它、只有性能面板显示它。
 * 3. **关着就零开销**：`包()` 在关着的时候直接调下游（不读时钟、不建对象）。
 */

import { currentFrame } from '../engine/FrameBudget.js';
import { 正整数至少一 } from './config.js';

/** Zipkin 的 traceId / spanId 是 16 位十六进制 —— 这里照那个形状 */
const 十六 = (n) => n.toString(16).padStart(16, '0');

/** 默认保留帧数：最近保留几帧的 span */
export const 默认保留帧 = 60;
/** 默认每帧跨度上限：一帧最多记多少条 span */
export const 默认每帧上限 = 256;

/**
 * span id 的跨距 —— **固定 2²⁰，不随"每帧上限"变**。
 *
 * id 的算法是 `帧号 × 跨距 + 序号`（根占 0，子从 1 起）。跨距固定 ⇒ 帧与帧的 id 空间
 * 永不相撞。**早先它是"每帧上限 + 1"** —— 那样一来上限旋钮一动，整个 id 空间就跟着移，
 * 于是两帧的 span id 会撞上（帧号 1 用上限 256、帧号 52 用上限 4，两边的 id 会撞）。
 * 跨距固定 + 上限有硬顶（< 跨距）之后，这个撞车就不可能了。
 */
const 跨距 = 1 << 20;

/** 旋钮的键（Config Server 的键形状：ASCII 点号路径） */
export const 保留帧键 = 'crossrealm.tracing.retained-frames';
export const 每帧上限键 = 'crossrealm.tracing.max-spans-per-frame';

/** 每帧上限的合格线：整数、至少 1、且必须小于跨距（否则 id 会撞） */
const 每帧上限合格 = (值) => 正整数至少一(值) && 值 < 跨距;

/**
 * 追踪器自己的旋钮名册 —— **缺省与校验住在主人模块里**，配置中心只拿这份名册去认键。
 */
export const 追踪可调项 = [
  {
    键: 保留帧键,
    缺省: 默认保留帧,
    校验: 正整数至少一,
    说明: '最近保留几帧的 span（整数，至少 1）',
  },
  {
    键: 每帧上限键,
    缺省: 默认每帧上限,
    校验: 每帧上限合格,
    说明: `一帧最多记多少条 span（整数，至少 1，小于 ${跨距}）`,
  },
];

/**
 * 校验一批导出 span 的父子关系 —— **判据住生产代码**，测试只喂坏数据。
 *
 * 三条：
 * - **孤儿**：parentId 指向的 span 不在这批里（`parentId` 悬空）；
 * - **错帧**：parentId 找得到，但那个父 span 在**另一条 trace** 里（跨帧串了）；
 * - **无根**：parentId 为 null 的 span 不止一个（根只能是"帧"那一条）。
 *
 * @param {Array} 出 导出形状的 span 列表
 * @returns {{孤儿: string[], 错帧: string[], 无根: string[]}}
 */
export function 校验导出(出) {
  const 已知 = new Map(出.map((s) => [s.id, s]));
  const 孤儿 = [];
  const 错帧 = [];
  let 根数 = 0;
  for (const s of 出) {
    if (s.parentId === null) {
      根数 += 1;
      continue;
    }
    const 父 = 已知.get(s.parentId);
    if (!父) 孤儿.push(s.id);
    else if (父.traceId !== s.traceId) 错帧.push(s.id);
  }
  const 无根 = 根数 > 1 ? 出.filter((s) => s.parentId === null).map((s) => s.id) : [];
  return { 孤儿, 错帧, 无根 };
}

/**
 * 建一个追踪器。
 *
 * @param {object} 选
 * @param {number} 选.保留帧 最近保留几帧的 span（环形档，满了挤掉最老的一帧）
 * @param {number} 选.每帧上限 一帧最多记多少条 span（超出的记溢出，不许无限长）
 * @param {object} [选.配置] 配置客户端（`platform/config.js`）。给了就**动态读**两个旋钮：
 *   下发即刻生效（构造参数只当兜底）。
 */
export function 建追踪({ 保留帧 = 默认保留帧, 每帧上限 = 默认每帧上限, 配置 = null } = {}) {
  if (!Number.isInteger(保留帧) || 保留帧 < 1) {
    throw new Error(`追踪器要保留至少 1 帧，读到 ${保留帧}`);
  }
  if (!Number.isInteger(每帧上限) || 每帧上限 < 1) {
    throw new Error(`追踪器每帧上限要至少 1 条，读到 ${每帧上限}`);
  }
  if (每帧上限 >= 跨距) {
    throw new Error(`追踪器每帧上限要小于 ${跨距}（超了 span id 会撞），读到 ${每帧上限}`);
  }

  /**
   * 当前生效的两个旋钮。优先级：**配置里下发的值 > 构造参数 > 主人的缺省**。
   */
  const 现保留 = () => (配置 ? 配置.取(保留帧键, 保留帧) : 保留帧);
  const 现上限 = () => (配置 ? 配置.取(每帧上限键, 每帧上限) : 每帧上限);

  const 帧档 = []; // 最近若干帧（新的在后）
  let 当前 = null; // 当前帧
  let 开着 = false;
  /** 一共记过多少条 span（"仪器关着时一个都不许记"这条性质的可读见证） */
  let 已记 = 0;
  /** 墙钟纪元（微秒）：建追踪器那一刻的 `Date.now()`，之后按 `performance.now()` 推进 */
  const 纪元 = Date.now() * 1000 - performance.now() * 1000;

  const 自己 = {
    /** 仪器开关：关着时 `包()` 直接调下游 —— 零额外开销 */
    get 开着() {
      return 开着;
    },
    /** 一共记过多少条 span（关着时这个数必须一直是 0） */
    get 已记() {
      return 已记;
    },
    设开着(开) {
      开着 = Boolean(开);
      if (!开着) 当前 = null;
      return 开着;
    },

    /**
     * 开一帧（= 开一条 trace）。帧号取 `FrameBudget.currentFrame()` —— 唯一真源。
     *
     * **它不把这一帧放进档里**：这一帧还没跑完（span 还在陆续记）。放进档的就是
     * "半条 trace"—— 导出会多一根没走完的根 span，而读数会在帧首读到空帧
     * （性能面板正是在帧首渲染的，它读到的是**上一帧**，这才是"这一帧谁吃掉了"的答案）。
     *
     * @returns {string|null} traceId；仪器关着时返回 null
     */
    开帧() {
      if (!开着) return null;
      const 帧号 = currentFrame();
      当前 = {
        帧号,
        traceId: 十六(帧号),
        根Id: 十六(帧号 * 跨距),
        开始: performance.now(),
        耗时: 0,
        跨度: [],
        溢出: 0,
      };
      return 当前.traceId;
    },

    /** 收这一帧：根 span 的耗时 = 从开帧到收帧；**收完才进档** */
    收帧() {
      if (!开着 || !当前) return null;
      当前.耗时 = performance.now() - 当前.开始;
      帧档.push(当前);
      while (帧档.length > 现保留()) 帧档.shift();
      当前 = null;
      return 帧档[帧档.length - 1];
    },

    /**
     * 记一个 span。
     * @param {string} 名 子系统名
     * @param {number} 毫秒 耗时（毫秒）
     * @param {boolean} 成 调用成没成
     * @param {boolean} 短路 是不是"熔断中、根本没调下游"
     */
    记(名, 毫秒, 成, 短路 = false) {
      if (!开着 || !当前) return null;
      if (当前.跨度.length >= 现上限()) {
        当前.溢出 += 1;
        return null;
      }
      const 序号 = 当前.跨度.length;
      已记 += 1;
      const span = {
        名,
        毫秒,
        成,
        短路,
        traceId: 当前.traceId,
        id: 十六(当前.帧号 * 跨距 + 1 + 序号),
        parentId: 当前.根Id,
        timestamp: Math.round(纪元 + 当前.开始 * 1000),
        duration: Math.round(毫秒 * 1000),
      };
      当前.跨度.push(span);
      return span;
    },

    /**
     * 包一次下游调用：开着才计时；异常照旧抛出去（**舱壁**负责接，不是这里接）。
     */
    包(名, fn) {
      if (!开着) return fn();
      const t0 = performance.now();
      try {
        const 值 = fn();
        自己.记(名, performance.now() - t0, true, false);
        return 值;
      } catch (错) {
        自己.记(名, performance.now() - t0, false, false);
        throw 错;
      }
    },

    /**
     * 读数：**最近一帧已完成的** trace（复制一份，外部改不到内部账）。
     *
     * 为什么不是"当前那一帧"：性能面板在**帧首**渲染，那时本帧的 span 还没开始记，
     * 读到的是空帧 —— 面板要答的是"上一帧谁吃掉的"，所以读数取**已完成**的那一帧。
     */
    读数() {
      const 帧 = 帧档[帧档.length - 1] ?? null;
      if (!帧) return null;
      return {
        帧号: 帧.帧号,
        traceId: 帧.traceId,
        耗时: 帧.耗时,
        跨度数: 帧.跨度.length,
        溢出: 帧.溢出,
        跨度: 帧.跨度.map((s) => ({ ...s })),
      };
    },

    /** 最慢的 N 条（性能面板用；取最近一帧**已完成**的 trace） */
    最慢(条数 = 3) {
      const 帧 = 帧档[帧档.length - 1] ?? null;
      if (!帧) return [];
      return [...帧.跨度].sort((a, b) => b.毫秒 - a.毫秒).slice(0, Math.max(0, 条数));
    },

    /** 当前生效的两个旋钮（诊断用：旋钮真的生效了吗） */
    旋钮() {
      return { 保留帧: 现保留(), 每帧上限: 现上限() };
    },

    /** 导出：Zipkin v2 span 形状（根 span + 子 span） */
    导出() {
      const 出 = [];
      for (const 帧 of 帧档) {
        出.push({
          traceId: 帧.traceId,
          id: 帧.根Id,
          parentId: null,
          name: 'frame',
          timestamp: Math.round(纪元 + 帧.开始 * 1000),
          duration: Math.round(帧.耗时 * 1000),
        });
        for (const s of 帧.跨度) {
          出.push({
            traceId: s.traceId,
            id: s.id,
            parentId: s.parentId,
            name: s.name,
            timestamp: s.timestamp,
            duration: s.duration,
            tags: { 成: s.成, 短路: s.短路 },
          });
        }
      }
      return 出;
    },

    /** 清空（换关 / 重开局时用） */
    清空() {
      帧档.length = 0;
      当前 = null;
    },
  };

  // 下发即刻生效：每帧上限变了，下一条 span 就按新上限记（超出的记溢出）；
  // 保留帧变小了，档**立刻**挤掉超出的老帧（不用等下一帧收帧）。
  if (配置) {
    配置.订阅(() => {
      const 保留 = 现保留();
      while (帧档.length > 保留) 帧档.shift();
    });
  }

  return 自己;
}
