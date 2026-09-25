/**
 * 面板内导航共用的假 DOM（切片11 起，`focus-nav` 与 `modal-trail` 两片共用一份）。
 *
 * 为什么抽出来：这两片测的是同一件事的上下游，而**桩一旦各写一份，漂移就是无声的** ——
 * 切片11 的变异验证正是被"这里的 `querySelectorAll` 返回全部格子"这种桩缺陷放走了两条假绿
 * （见 docs/MASTER_PLAN.md §9 同日 ADR 的"桩少实现一层，判据就从行为退化成字符串"）。
 * 一份桩、两处用，改桩时两边的用例一起红，才是想要的耦合。
 *
 * 两条与浏览器对齐的形状纪律：
 * 1. `querySelectorAll` **真按选择器筛**（禁用 / `.hidden` / 文件框 / 隐藏 input 都不该在清单里）；
 * 2. 返回的是 **NodeList 形状**：有 `length` 与下标、有 `item()`，但**没有** `indexOf` / `map` / `sort`
 *    —— 于是"生产代码有没有真的拷一份数组出来"是可观察的（`navItems` 承诺交出的才是数组）。
 */

/** 只实现 `NAV_SELECTOR` 用到的那几种条件：标签名、`:not([属性])`、`:not([属性=值])`、`:not(.类)` */
function matchesGroup(el, group) {
  const tag = /^[a-z]+/.exec(group)?.[0];
  if (tag && el.tag !== tag) return false;
  for (const m of group.matchAll(/:not\(([^)]+)\)/g)) {
    const cond = m[1].trim();
    const attr = /^\[([a-zA-Z]+)(?:=(\w+))?\]$/.exec(cond);
    if (attr) {
      const [, name, value] = attr;
      if (value === undefined ? Boolean(el[name]) : String(el[name]) === value) return false;
    } else if (cond.startsWith('.') && el.classList.contains(cond.slice(1))) return false;
  }
  return true;
}

/** 浏览器的静态 NodeList：能按下标读、有 length 与 item()，但没有 Array 的那些方法 */
function nodeListOf(matched) {
  const list = { length: matched.length, item: (i) => matched[i] ?? null };
  matched.forEach((el, i) => { list[i] = el; });
  return list;
}

/**
 * 一格可聚焦的界面元素。`spec` 里的形状字段（`tag` / `type` / `disabled` / `hidden`）
 * 就是选择器要筛的东西；`acceptsFocus` 用来演"元素被藏起来了，focus() 被浏览器拒绝"。
 * `click()` 演"玩家真的点了这一格"：走的是构造函数挂上去的那个 `click` 监听，
 * 于是被测代码不需要暴露任何内部方法就能被按到。
 */
export function fakeItem(id, spec = {}) {
  const el = {
    id,
    tag: spec.tag ?? 'button',
    focusCount: 0,
    listeners: {},
    dataset: { ...(spec.dataset ?? {}) },
    clicks: 0,
    classList: {
      contains: (c) => (spec.hidden ? c === 'hidden' : c !== 'hidden'),
      toggle: () => {},
    },
  };
  if (spec.type) el.type = spec.type;
  if (spec.disabled) el.disabled = true;
  // 滑杆那几个属性照浏览器给成**字符串**（`el.value` 在真 DOM 里也是字符串），
  // 于是 `adjustFocused` 的浮点抹平是"从字符串读出来、再写回字符串"这条真路径（切片16）
  for (const attr of ['min', 'max', 'step', 'value']) {
    if (spec[attr] !== undefined) el[attr] = String(spec[attr]);
  }
  el.addEventListener = (type, fn) => { (el.listeners[type] ??= []).push(fn); };
  /** 造事件也要走同一批监听（`adjustFocused` 发的 `input` 就是这条）：只记不发 = 桩替被测方作弊 */
  el.dispatchEvent = (evt) => {
    (el.listeners[evt.type] ?? []).forEach((fn) => fn({ ...evt, target: el }));
    return true;
  };
  // 「玩家点了这一格」= 记一次点击 + 走挂在这格上的 click 监听（浏览器里本来就是同时发生的两件事）
  el.click = () => {
    if (el.disabled) return;                 // 禁用格点了没反应：浏览器不触发 click，我们也不假触发
    el.clicks += 1;
    (el.listeners.click ?? []).forEach((fn) => fn({ target: el }));
  };
  el.focus = () => {
    if (spec.acceptsFocus === false) return;
    el.doc?.setActive(el);
    el.focusCount += 1;
  };
  return el;
}

/** 一个界面容器（不是清单里的一格，只是挂着 id 的宿主） */
export function fakeBox(id) {
  const box = { id, hidden: false, listeners: {} };
  box.classList = {
    contains: (c) => (c === 'hidden' ? box.hidden : false),
    add: (c) => { if (c === 'hidden') box.hidden = true; },
    remove: (c) => { if (c === 'hidden') box.hidden = false; },
  };
  box.addEventListener = (type, fn) => { (box.listeners[type] ??= []).push(fn); };
  box.innerHTML = '';
  box.querySelectorAll = () => [];
  return box;
}

/**
 * 假 document：**焦点现状只有一份**（与浏览器一致），所以几个面板共用它 ——
 * 各面板自己记"我这一格里谁被选中"正是这一族要防的事，测试桩不能先犯。
 * `hosts` 让被测方走它生产里那条 `getElementById` 取宿主的路。
 */
export function fakeDoc(hosts = {}) {
  let activeEl = null;
  const doc = {
    hosts,
    get activeElement() { return activeEl; },
    getElementById: (id) => doc.hosts[id] ?? null,
    setActive: (el) => { activeEl = el; },
  };
  return doc;
}

/**
 * 一个面板宿主（`{ id, 清单 }`）。`entries` 每项可以是 id 字符串，或 `fakeItem` 的形状对象。
 * `active()` 问的是文档那一份事实，不是宿主自己记的账。
 */
export function fakePanel(entries, doc, id = 'panel-host') {
  const items = entries.map((raw) => {
    // `raw` 已经是造好的格子（有 `focus`）就直接用：同一格常常要同时出现在面板清单与某个子容器里，
    // 造两份就等于测试自己先犯了"一个东西有两个身份"
    const el = typeof raw === 'object' && typeof raw.focus === 'function'
      ? raw
      : fakeItem(typeof raw === 'string' ? raw : raw.id, raw);
    el.doc = doc;
    return el;
  });
  const host = {
    id,
    tag: 'DIV',
    items,
    selectorAsked: null,
    hidden: false,
    classList: {
      contains: (c) => (c === 'hidden' ? host.hidden : false),
      add: (c) => { if (c === 'hidden') host.hidden = true; },
      remove: (c) => { if (c === 'hidden') host.hidden = false; },
    },
    querySelectorAll(sel) {
      this.selectorAsked = sel;
      return nodeListOf(items.filter((el) => String(sel).split(',').some((g) => matchesGroup(el, g.trim()))));
    },
  };
  return { host, items, active: () => doc.activeElement?.id ?? null };
}
