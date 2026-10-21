/**
 * 任务判据读的事实 —— **判据闭包**那一格（W-B3 切片6）。
 *
 * ## 这个缺口是怎么来的
 *
 * 判据（`CONDITIONS`）读 `state.stats.<格>`，生产者（`STAT_EVENTS`）写 `s.<格>`。
 * 两份都在同一层内容里，但**没有一处把它们对起来**：
 *
 * - **判据读的那一格没人写** ⇒ 那一格永远 `false` ⇒ 玩家看到一条**永远做不完**的主线步，
 *   而注册表全绿（它只核"条件名在不在 `CONDITIONS` 里"，核不了"它读的那一格有没有人写"）。
 * - **生产者写了没人读** ⇒ 死账（危害小一些，但同样是不该有的第二份真相）。
 *
 * 这条尾巴从 W-B3 切片5 记到现在 —— W-B12 切片3+ 与切片4+ 都逐字点名"判据仍是闭包"，
 * 而它是**主线与支线两族共同**的缺口。本模块收**主线那半**（支线那半的形状不一样：
 * 判据读的是 `game` 上的子系统与它们自报的读数，不是这本账）。
 *
 * ## 口径：事实**抠**出来，不手抄
 *
 * 判据与记账都是**函数** —— 函数体里读了哪一格、写了哪一格，从源码里扫出来即可。
 * 手抄一份"这一格归谁写"就是再造第二份真相（而那份还会漂）。所以本模块**没有表**，
 * 只有三份**推导**：
 *
 * - `questFactsRead()` —— 判据读的那几格（`CONDITIONS` 全体 + `objectiveDone`）
 * - `questFactsWritten()` —— 生产者写的那几格（`STAT_EVENTS` 全体 + 计算写 + 读数）
 * - `questLedgerShape()` —— 账本的形状（`emptyStats()` 的键）
 *
 * ## 扫描口径的三条约定
 *
 * 1. **写入是 `s.<格>`**（记账函数的形参叫 `s`），**读取是 `stats.<格>`**（判据的形参
 *    叫 `stats`）。形参名写死在正则里 —— 这不是"猜"，而是本仓的记账函数一律 `(s, d) => …`、
 *    判据函数一律 `(state) => state.stats.…`；有人改了形参名，这条门禁会红 ——
 *    那正是我们要的（形参改名 ⇒ 读写两侧要一起重新对账）。
 *    正则的前视断言 `(?<![\w$.])` 是为了**不把 `stats.hits` 里的那个 `s` 当成写入**。
 * 2. **计算写（`s[key] = …`）扫不出键** —— Boss 那几格是 `s[key] = true`，
 *    `key` 来自 `BOSS_STAT_KEYS`。那一族的键由**表**给出（`Object.values(BOSS_STAT_KEYS)`），
 *    不是手抄。同理**计算读**（`stats[key]`）也由那张表给出。
 * 3. **读数格**（`STAT_READINGS`）由别的系统推来（`PlayerStats` 推 `stats-changed`），
 *    但它们同时也是 `STAT_EVENTS` 里的记账函数写的 —— 两边都在就够，不必单列。
 *
 * ## 四条闭包规则
 *
 * | 规则 | 破了会怎样 |
 * |---|---|
 * | 读的 ⊆ 写的 | 判据永远假 ⇒ 那一步永远做不完（**玩家看得见**） |
 * | 读的 ⊆ 账本形状 | 判据读到 `undefined` ⇒ 同上，但更隐蔽（读的是 `?.` 的左边） |
 * | 写的 ⊆ 账本形状 | 生产者写了一格账本里没有的 ⇒ 那一格是**伪账**（写进去就没了） |
 * | 账本形状 ⊆ 写的 | 账本里有一格没人写 ⇒ 死格（读它的人永远读到初值） |
 */
import {
  CONDITIONS, STAT_EVENTS, STAT_READINGS, BOSS_STAT_KEYS, emptyStats, objectiveDone,
} from './objectives.js';

/** 写入扫描：`s.<格>`。前视断言挡住 `stats.hits` 里那个 `s`（它前面是字母，属单词字符）。 */
const 写正则 = /(?<![\w$.])s\.([A-Za-z_$][\w$]*)/g;
/** 读取扫描：`stats.<格>`。前视断言只挡单词字符 —— `state.stats.x` 里的 `stats` 前面是 `.`，要认。 */
const 读正则 = /(?<![\w$])stats\.([A-Za-z_$][\w$]*)/g;

/**
 * 从一段源码里抠出它读/写的账本格名。
 *
 * @param {string} src 函数源码（`fn.toString()`）
 * @param {RegExp} re 带一个捕获组的正则
 * @returns {Set<string>}
 */
function 抠格名(src, re) {
  const out = new Set();
  if (typeof src !== 'string') return out;
  // 正则带 `g` 标志 ⇒ 复用同一个对象时 `lastIndex` 会残留，每次新建一个
  const r = new RegExp(re.source, re.flags);
  let m;
  while ((m = r.exec(src)) !== null) out.add(m[1]);
  return out;
}

/** 一个函数体里的账本格：读的那些 ∪ 写的那些 */
function 函数的格(fn) {
  const src = typeof fn === 'function' ? fn.toString() : '';
  return { 读: 抠格名(src, 读正则), 写: 抠格名(src, 写正则) };
}

/**
 * 判据读的那几格。
 *
 * 两个来源：① `CONDITIONS` 全体（门控判据）；② `objectiveDone`（每一步"完成了没有"）。
 * 计算读（`stats[key]`，Boss 那一族）由 `BOSS_STAT_KEYS` 补上 —— 它是**表**，不是手抄。
 *
 * @returns {Set<string>}
 */
export function questFactsRead() {
  const out = new Set();
  for (const fn of Object.values(CONDITIONS)) {
    for (const k of 函数的格(fn).读) out.add(k);
  }
  for (const k of 函数的格(objectiveDone).读) out.add(k);
  for (const k of Object.values(BOSS_STAT_KEYS)) out.add(k);
  return out;
}

/**
 * 生产者写的那几格。
 *
 * 三个来源：① `STAT_EVENTS` 全体（事件 → 记账）；② `BOSS_STAT_KEYS` 的值（计算写的键）；
 * ③ `STAT_READINGS`（由别的系统推来的读数 —— 就算它们同时也在 `STAT_EVENTS` 里，
 * 列出来是为了让"这一格由谁推"这件事在表上看得见）。
 *
 * @returns {Set<string>}
 */
export function questFactsWritten() {
  const out = new Set();
  for (const fn of Object.values(STAT_EVENTS)) {
    for (const k of 函数的格(fn).写) out.add(k);
  }
  for (const k of Object.values(BOSS_STAT_KEYS)) out.add(k);
  for (const k of STAT_READINGS) out.add(k);
  return out;
}

/**
 * 账本的形状 —— `emptyStats()` 的键。
 *
 * @returns {Set<string>}
 */
export function questLedgerShape() {
  return new Set(Object.keys(emptyStats()));
}

/**
 * 判据闭包的四条规则。
 *
 * @returns {string[]} 错误清单（空数组 = 闭包成立）
 */
export function checkQuestFactClosure() {
  const out = [];
  const 读 = questFactsRead();
  const 写 = questFactsWritten();
  const 形状 = questLedgerShape();

  for (const k of [...读].sort()) {
    if (!写.has(k)) {
      out.push(`判据读的账本格 "${k}" 没有任何生产者 —— 那一格永远是初值，`
        + '读它的判据永远为假（玩家看到一条永远做不完的主线步，而门禁不报错）');
    }
    if (!形状.has(k)) {
      out.push(`判据读的账本格 "${k}" 不在账本形状里（emptyStats）—— 读到的是 undefined`);
    }
  }

  for (const k of [...写].sort()) {
    if (!形状.has(k)) {
      out.push(`生产者写的账本格 "${k}" 不在账本形状里（emptyStats）—— 写进去的那一格是伪账`);
    }
  }

  for (const k of [...形状].sort()) {
    if (!写.has(k)) {
      out.push(`账本里有 "${k}" 这一格，却没有任何生产者 —— 它永远是初值（死格）`);
    }
  }

  return out;
}
