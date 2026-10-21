/**
 * 支线判据读的事实 —— **判据闭包**那一条尾巴的另一半（W-B3 切片7）。
 *
 * ## 为什么要有这一层
 *
 * 切片6 收了**主线**那半（判据读 `stats.<格>`，生产者写 `s.<格>`）。支线那半的形状不同：
 * 支线判据是 `check: (game) => boolean`，读的是**活的 `game` 对象**上的事实 ——
 * `g.soulWisps?.collected?.size`、`game.campfireMemory?.getStats()?.zones` 这样的。
 *
 * 缺口与主线那半**同形**：注册表能核"这条支线在不在名单里"，核不了"**它读的那一格
 * 还在不在**"。症状具体到玩家身上：某个字段被改名 ⇒ `?.` 把 `undefined` 吞掉 ⇒
 * 判据永远是 `false` ⇒ **那条支线永远完成不了**，而玩家看到的是进度条上的一个空格，
 * 没有任何报错、没有任何日志。
 *
 * ## 这一层是**纯函数**：输入源码，输出事实表
 *
 * 它**不读文件** —— 读文件是 Node 侧的事（测试与门禁）。本模块只做一件事：
 * 把一段源码里"从 `game` 上读了哪些事实"**抠**出来。
 *
 * ## 三条抠取约定
 *
 * 1. **接收者只有三种**：`game` / `g`，以及**别名**（`const sys = game.popCulture`）。
 *    别名不解析就会漏掉一整族（`countFranchise` 里 `sys.getEntries` / `sys.unlocked`
 *    全是别名上的读取）。
 * 2. **链上的每一段（除根之外）都是一个事实**，只有**集合访问器**例外 ——
 *    `size` / `length` / `has` / `add` 那些是 `Set` / `Map` / `Array` 自带的，
 *    不是谁写的字段。名单在 `FACT_ACCESSORS` 里。
 * 3. **调用与取值不区分**：链上的 `getStats`（方法）与 `percent`（它返回的那一格）
 *    都是"这个系统上真实存在的东西"。区分它们要判断返回值的形状，而本模块不解析类型 ——
 *    统一按"名字存在"判，够用且不会误伤。
 */

/**
 * 集合 / 数组自带的访问器 —— **不是**谁写的字段，判据读它们不算读了一个事实。
 * 名单要全：漏一个就会让"某条支线读的是一个集合方法"被当成"读了一个没人写的字段"。
 */
export const FACT_ACCESSORS = Object.freeze(new Set([
  'size', 'length', 'has', 'add', 'delete', 'clear', 'includes', 'indexOf',
  'keys', 'values', 'entries', 'forEach', 'filter', 'map', 'some', 'every',
  'find', 'join', 'split', 'toString', 'valueOf', 'at', 'flat', 'reduce',
]));

/** 把一条访问链切成 `{ 名, 调用 }` 的段序列 */
function 解析链(链文本) {
  const segs = [];
  const re = /\??\.([A-Za-z_$][\w$]*)(\(\))?/g;
  let m;
  while ((m = re.exec(链文本)) !== null) {
    segs.push({ 名: m[1], 调用: Boolean(m[2]) });
  }
  return segs;
}

/**
 * 从一段源码里抠出"从 `game` 上读了哪些事实"。
 *
 * @param {string} src 源码（整份模块 —— 支线判据里的事实有一半藏在模块私有的辅助函数里，
 *   只抠 `check` 函数体会漏掉它们）
 * @returns {{ 根: Set<string>, 事实: Map<string, Set<string>>, 别名: Map<string, string> }}
 */
export function sideQuestFactsFromSource(src) {
  const text = typeof src === 'string' ? src : '';

  // ── ① 别名：`const sys = game.popCulture` ──
  const 别名 = new Map();
  for (const m of text.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:g|game)\.([A-Za-z_$][\w$]*)/g)) {
    别名.set(m[1], m[2]);
  }

  const 事实 = new Map();   // 根 -> Set(叶)
  const 根集 = new Set();
  const 记 = (根, 叶) => {
    if (!根) return;
    根集.add(根);
    if (!事实.has(根)) 事实.set(根, new Set());
    if (叶 && !FACT_ACCESSORS.has(叶)) 事实.get(根).add(叶);
  };

  // ── ② 直接写在 `game.` / `g.` 上的链 ──
  for (const m of text.matchAll(/\b(?:g|game)((?:\??\.[A-Za-z_$][\w$]*(?:\(\))?)+)/g)) {
    const segs = 解析链(m[1]);
    if (!segs.length) continue;
    const 根 = segs[0].名;
    for (const s of segs.slice(1)) 记(根, s.名);
  }

  // ── ③ 别名上的链（`sys.getEntries(...)`） ──
  if (别名.size) {
    const 名表 = [...别名.keys()].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp(`\\b(${名表})((?:\\??\\.[A-Za-z_$][\\w$]*(?:\\(\\))?)+)`, 'g');
    for (const m of text.matchAll(re)) {
      const 根 = 别名.get(m[1]);
      if (!根) continue;
      const segs = 解析链(m[2]);
      for (const s of segs) 记(根, s.名);
    }
  }

  return { 根: 根集, 事实, 别名 };
}
