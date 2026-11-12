/**
 * 星轨顾问的**客户端契约**（W-Y2 切片1）。
 *
 * 这里放的是「与服务端对齐的数」与「建议问题的名册」，不是玩法内容表。
 * 之所以单开一份内容层文件：服务端 `AiProperties` / `ChatRequest` 已经有同一组上限
 * （400 字、8 条上下文、20 秒上游超时），客户端若再各自写一遍字面量，改一边就会
 * 出现「前端放过去、后端 400 拒掉」或「前端把玩家的话截短了却不告诉他」这两种静默分家。
 * 数字在内容层只留一份，逻辑层读它。
 *
 * 注意这些是**客户端侧的保护**，不是安全边界：真正的校验在服务端 `@Valid` 上。
 * 客户端做一遍只是为了让玩家在按下送出之前就看到长度，而不是等 503 回来。
 */

export const ADVISOR_LIMITS = Object.freeze({
  /** 与 `ChatRequest.question` 的 `@Size(max = 400)` 对齐 */
  questionMax: 400,
  /** 与 `ChatRequest.context` 的 `@Size(max = 8)` 对齐 */
  contextMaxEntries: 8,
  /** 上下文单值限长：它会被拼进提示词，不是一条无限长的管道 */
  contextValueMax: 120,
  /**
   * 客户端等得更久一点：服务端单次上游超时 20s、最多重试 2 次 ⇒ 最坏约 60s。
   * 掐在 20s 会把一次**合法但慢**的成功当成失败，而服务端那三次外呼已经付过钱了。
   * 玩家等不住时按「停止」，走真 AbortController（不是 setTimeout 假取消）。
   */
  requestTimeoutMs: 70_000,
  /** 健康探针是本地网关一次 GET，不该跟大模型同一档耐心 */
  healthTimeoutMs: 2_000,
  /** 一局里留多少条气泡；再多就让 DOM 无限长（每帧都在的 HUD 之外，仍要封顶） */
  historyMaxMessages: 24,
});

/**
 * 三个开局问题。`key` 既是芯片上那句话，也是真的发出去的问题 ——
 * 刻意**不另存一份 question**：芯片写「这一季该堆什么属性」却把别的一句话发给模型，
 * 是最难被发现的一种说谎（玩家看得到前者，日志里只有后者）。
 */
/**
 * 顾问链路的**结果原因枚举**：`OnlineServices` 只产出这些值，`AdvisorPanel` 必须全覆盖。
 *
 * 这一片真的抓到过一次分家：客户端写 `bad-json`、面板写成 `bad_json`，于是
 * 「网关回了纯文本」这种最常见的 503 会静默落进「连不上网关」那一句，
 * 玩家照着去检查一个根本没坏的网关。**跨文件传的字符串也是线协议**，
 * 不放在一处就没有人能保证两端同名。
 */
export const ADVISOR_REASONS = Object.freeze({
  OK: 'ok',
  DISABLED: 'disabled',
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  BAD_JSON: 'bad-json',
  BLANK: 'blank',
  CANCELLED: 'cancelled',
  HTTP: 'http',
  /** 服务端明确 429（W-Y4 的队列背压 / 网关限流）：不是"连不上"，是"忙，稍后再来" */
  BUSY: 'busy',
});

/** 会走到玩家面前的那些原因（成功不算） */
export const ADVISOR_ERROR_REASONS = Object.freeze(
  Object.values(ADVISOR_REASONS).filter((r) => r !== ADVISOR_REASONS.OK),
);

export const ADVISOR_SUGGESTIONS = Object.freeze([
  Object.freeze({ id: 'build', key: 'advisor_suggestion_build' }),
  Object.freeze({ id: 'season', key: 'advisor_suggestion_season' }),
  Object.freeze({ id: 'trial', key: 'advisor_suggestion_trial' }),
]);

/**
 * 把输入框里的原文收敛成可以发的一句。
 *
 * 换行抹平是有意的：玩家从别处粘一段带换行的文本，服务端会把换行折成空格
 * 再拼进提示词；这里先折一次，字符计数与真正发出去的内容才一致。
 */
export function normalizeAdvisorQuestion(raw) {
  const text = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  return text.slice(0, ADVISOR_LIMITS.questionMax);
}

/**
 * 上下文白名单化：只收 snake_case 键、只收标量、每条限长、最多 8 条。
 *
 * 不把 `game` 整个对象塞进来 —— 那一坨里有 THREE 资源、有循环引用、有玩家存档，
 * 而且上下文是**会被拼进提示词的数据**：多带一个字段就是多一个注入面。
 */
export function normalizeAdvisorContext(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw).slice(0, ADVISOR_LIMITS.contextMaxEntries)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'object' || typeof value === 'function') continue;
    out[key] = String(value).replace(/\s+/g, ' ').slice(0, ADVISOR_LIMITS.contextValueMax);
  }
  return out;
}
