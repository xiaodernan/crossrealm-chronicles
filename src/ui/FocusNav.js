/**
 * 面板内焦点导航（W-A7 切片11 / W-D1「焦点管理」那一半的第一格）。
 *
 * 切片3 让手柄能开面板，切片10 让返回键退回得去，但**面板里的按钮只能鼠标点** ——
 * 缺的就是这一片：↑↓ 在面板里走出来，走到哪一格，Enter / 空格 就交给浏览器原生激活。
 *
 * 分工刻意切成三小段，每段只答一个问题：
 * - `navItems`：**一格里能停下来的东西有哪些**（清单的唯一生产者，顺序 = 玩家走出来的顺序）。
 * - `stepFocusIndex`：**从这一格走一格到哪**（纯算式：首格、末格、环绕）。
 * - `moveFocusWithin`：把前两段的结论落到 DOM 上（只在这里调 `focus()`）。
 *
 * 切片12 又加了一段同样窄的账：`parkFocus` / `restoreParkedFocus` 是**唯一**记录"焦点原来在哪"
 * 的地方（一格账，读完即清）—— 上层面板压着下层、关掉之后要落回当初那一格，
 * 但那份记忆如果散到各个面板的私有字段里，"现在选中谁"就又有了两个答案。
 *
 * 至于"**哪个面板**收焦点"，不在这里 —— 那是 `ui/OverlayStack.js` 的 `nav` 那一格（切片10 的同一张表）。
 *
 * ## 为什么激活不做一个热键
 *
 * 落焦用的是原生 `el.focus()`，于是 Enter / 空格 激活按钮是浏览器的本职。这一片如果再登记一条
 * `uiConfirm`，同一下按键就有了两个消费者（浏览器点一次、我们的轮询再点一次）—— 正是 B52 那一族。
 * 手柄的 A 要走这条路得先有"面板内的手柄表"（十字键与 A 全被游戏动作占着，见切片9 的 B51 认领表），
 * 那是下一片的事：届时 A 冒充 Enter 走 `keys`，不再新增第二个激活口。
 */

/**
 * 可导航项 = 面板里可用的按钮与输入控件。
 *
 * 排除的三样各有理由：`[disabled]` 走不进去；`.hidden` 那一格看不见却能吃掉一步；
 * `type=file` 按 Enter 会弹出系统文件框（`#pause-import-file` 就是它，导入由 `#pause-import` 按钮触发）。
 * `select` 在清单里（W-D3 切片3）：暂停菜单的存档槽与设置面板的语言选择此前是
 * 键盘与手柄都走不进的死格 —— 面板认领了宿主，宿主里每一格可聚焦元素就都该走得到。
 */
import { BROWSER_FOCUS_CODE } from '../content/hotkeys.js';

const NAV_SELECTOR = 'button:not([disabled]):not(.hidden),'
  + 'input:not([disabled]):not(.hidden):not([type=file]):not([type=hidden]),'
  + 'select:not([disabled]):not(.hidden)';

/** 一个面板里的可导航清单（DOM 顺序）。宿主不在（还没渲染 / 面板不认这个 id）给空表 */
export function navItems(host) {
  if (!host?.querySelectorAll) return [];
  return Array.from(host.querySelectorAll(NAV_SELECTOR));
}

/**
 * 从第 `active` 格走一格。`active` 为 -1（焦点不在清单里，例如刚打开面板时焦点还在 body）时，
 * 往下落第一格、往上落最后一格 —— 两条都是从外面走进面板的自然落点。
 *
 * 环绕是有意的：设置面板二十来格，逐格退到底比"按到最后一格就没反应"省十几次按键。
 * 空清单返回 -1（没人可指，调用方据此什么都不做）。
 */
export function stepFocusIndex({ length, active, delta, wrap = true }) {
  if (length <= 0) return -1;
  const dir = delta < 0 ? -1 : 1;
  if (active < 0) return dir < 0 ? length - 1 : 0;
  let next = active + dir;
  if (next < 0) next = wrap ? length - 1 : 0;
  else if (next >= length) next = wrap ? 0 : length - 1;
  return next;
}

/** 清单 + 当前焦点 → 下一个该落的元素（没有可落的给 null） */
export function nextFocusedItem(items, activeEl, delta) {
  return items[stepFocusIndex({ length: items.length, active: items.indexOf(activeEl), delta })] ?? null;
}

/**
 * 真的移焦：`true` = 这一格有人接住了这一下。
 * `doc` 只是测试的注入口（node 环境没有真的 `activeElement`），生产调用不传。
 */
export function moveFocusWithin(host, delta, doc = globalThis.document) {
  const target = nextFocusedItem(navItems(host), doc?.activeElement, delta);
  if (!target) return false;
  target.focus();
  return true;
}

/**
 * 焦点陷阱（W-D6 切片14）：模态开着时，把浏览器那一指 Tab 接过来。
 *
 * ## 病症
 *
 * 模态开着时 Tab 不在热键表里派发（它出厂绑的是 `zonePanel`，被
 * `overlayBlocksHotkeys` 拦下），于是 `preventDefault` 也不做 —— 浏览器**自己**那一指
 * "走到下一个可聚焦元素"就此漏了过去。后果是焦点走出模态：暂停菜单压着设置面板时，
 * 设置面板已被 CSS 让位成 `opacity: 0`（鼠标点不着，`style.css` 那条 `body:has(...)`），
 * 但 Tab 走得进去；更早一档的病症在对话框 —— 焦点会一路落到 `#game-guide` /
 * `#autoplay-fab` 上。玩家按一下 Tab，看得见的模态还开着，焦点已经在看不见的地方，
 * 再按 Enter 触发的是背后的东西。
 *
 * ## 字面量为什么住在 `content/hotkeys.js`
 *
 * "浏览器里哪个键负责移焦"既不是层表的事，也不是热键表的事，但它**确实是一枚键码** ——
 * 而全仓的规矩是键码字面量只出现在 `content/` 那几张表里（`tests/keybind-behaviour.test.js`
 * 那条全仓扫描：任何 `code === '键码'` 都是第二个真源）。所以那一指是哪一枚，问
 * `BROWSER_FOCUS_CODE`，本文件一个键码都不写。
 *
 * 分工因此是三层：`Game.trapFocusKey` 问**该不该拦、落在哪个宿主**（层表，与 `panelNav`
 * 同一条路）；本文件问**是不是浏览器那一指**（问表）与**怎么走格**（`moveFocusWithin`）。
 *
 * 没有宿主（`layer` 为 null：野外 / 世界地图 / 自动演示 / 过场）一律不拦 ——
 * 与"方向键在野外是死键"同一条口径：层表说不清的事，这里不替它做主。
 *
 * @param {KeyboardEvent} e 只用 `code` 与 `shiftKey`
 * @param {object|null} layer 顶层那一层（`topNavLayer` 的结论，`nav` 是宿主 id）
 * @returns {boolean} `true` = 这一指被接住了，调用方据此 `preventDefault()`
 */
export function trapTabFocus(e, layer, doc = globalThis.document) {
  if (!layer || e.code !== BROWSER_FOCUS_CODE) return false;
  return moveFocusWithin(doc.getElementById(layer.nav), e.shiftKey ? -1 : 1);
}

/** 面板刚打开：焦点落在清单第一格，玩家立刻有"现在选中的是谁"可看（没有可落的东西返回 false） */
export function focusFirstItem(host, doc = globalThis.document) {
  const items = navItems(host);
  if (!items.length) return false;
  // 已经落在这一格里就别动它：从别的界面退回同一个面板时保留玩家选中的那一格
  if (items.includes(doc?.activeElement)) return true;
  items[0].focus();
  return true;
}

/**
 * 焦点被上层面板借走之前，把"这一格是清单里的第几格"记下来（切片12 / W-D1 真栈第一格）。
 *
 * **只有一格账，而且只在这里**：`parkFocus` 覆盖前一次，`restoreParkedFocus` 读完即清。
 * 为什么不由各个面板自己存一个 index —— 那样"现在选中哪一格"就又有了第二个记处
 * （面板的私有字段 + 浏览器的 `activeElement`），而切片11 立的规矩是全仓只有这个文件认识焦点。
 */
let parked = null;

/** 记下当前焦点在这份清单里的位置；焦点不在清单里（或宿主没有 id）就不记，返回那个下标 */
export function parkFocus(host, doc = globalThis.document) {
  const index = navItems(host).indexOf(doc?.activeElement);
  parked = index >= 0 && host?.id ? { hostId: host.id, index } : null;
  return index;
}

/**
 * 上层关掉之后把焦点还给记下的那一格。`true` = **浏览器真的把它给了那一格**，
 * 而不是"我们调用过 `focus()`"：下层可能被别的路径关掉了（那时焦点只能留在原地）。
 * 没有账（从野外直接开上层面板）一律 false —— 不许凭空造出一条来路。
 */
export function restoreParkedFocus(doc = globalThis.document) {
  const rec = parked;
  parked = null;                    // 读一次就清：一次来路只够退一次
  if (!rec) return false;
  const items = navItems(doc?.getElementById?.(rec.hostId));
  if (!items.length) return false;
  const target = items[Math.min(Math.max(rec.index, 0), items.length - 1)];
  target.focus();
  return doc?.activeElement === target;
}

/**
 * 重绘之前记下"玩家此刻停在哪一格"，画完把他放回同一格（切片28 / 修 B58）。
 *
 * 为什么需要它：一块面板用 `innerHTML = ...` 重画，旧节点全部销毁，浏览器把焦点丢回 `body` ——
 * 改前读数里日志抽屉换一个页签就"从哪儿来的回到哪儿去"（↑ 又从头走，甚至整个走不动），
 * 玩家每按一次确认都要重新走一遍清单。这与 B44/B47 不同族，是**重绘与焦点各管各的**。
 *
 * 三条规矩：① 焦点本来不在这个宿主里 → 什么都不做（不许借重绘之名抢走玩家的焦点）；
 * ② 画完之后清单短了 → 落在最后一格（钳位，不是掉回 `body`）；
 * ③ 返回值问 `document.activeElement` 而不是"我们调没调 `focus()`"（与 `restoreParkedFocus` 同一条纪律）。
 */
export function preserveFocus(host, rerender, doc = globalThis.document) {
  const before = navItems(host);
  const index = before.indexOf(doc?.activeElement);
  rerender();
  if (index < 0) return false;
  const after = navItems(host);
  if (!after.length) return false;
  const target = after[Math.min(index, after.length - 1)];
  target.focus();
  return doc?.activeElement === target;
}

/**
 * 激活"现在聚焦的那一格"（切片14：手柄的 A）。
 *
 * 这不是"第二个 Enter 消费者"：键盘那条路一个字都没改（原生 Enter 本来就激活聚焦元素，
 * 我们从来没有为它登记过热键），而手柄不产生键盘事件 —— 所以 A 是这一下的唯一消费者。
 * 之所以由这里代做而不交给浏览器，是因为手柄没有"按下聚焦元素"这条原生通路。
 */
export function activateFocused(doc = globalThis.document) {
  const el = doc?.activeElement;
  if (!el || el === doc.body || typeof el.click !== 'function' || el.disabled) return false;
  el.click();
  return true;
}

/** 小数位数只从 `step` 的字面上数（`0.02` → 2、`5` → 0），用来把浮点尾巴抹掉 */
function stepDecimals(stepText) {
  const dot = stepText.indexOf('.');
  return dot < 0 ? 0 : Math.min(10, stepText.length - dot - 1);
}

/**
 * 左右两下：把**焦点那一格**的数值推一档（切片16）。
 *
 * 分工与上面三段一样窄 —— 走格问清单（`navItems`），激活问浏览器（`activateFocused`），
 * 这一段只问 `document.activeElement`："焦点现在在哪一格"本来就是唯一事实，
 * 不必再问层表（层表回答的是"走焦该走进哪个面板"，两件事）。
 *
 * 今天能推的只有 `<input type="range">`：其余控件返回 `false`（这一下没人接住）。
 * 刻意**不做**"左右移焦"：今天没有一扇面板有横向排布（键位行的两列在 DOM 里本来就是
 * 相邻两格，↑↓ 已经走得到），凭空造一条横向路径就是死代码 —— 等真有网格再登记。
 *
 * 三条必须自己写、不能交给浏览器的理由：
 * 1. **手柄没有键盘事件**：十字键冒充的那一格状态（`keys` 里的 `ArrowLeft`，注意是状态名不是码值字面量）
 *    只是一格布尔，原生滑杆的步进听的是 `keydown`，永远等不到它 —— 这一段就是切片16 存在的理由；
 * 2. **到头不许越界**：`min`/`max` 两侧夹住，夹到头返回 `false`（而不是把值推出去再被浏览器弹回）；
 * 3. **派完要发 `input`**：滑杆的写入方（`SettingsPanel.bindControls`）听的是 `input`，
 *    不发它就等于"值动了但设置没动"。这是全仓唯一一处为焦点导航造事件的地方，
 *    与 `activateFocused` 代点那一下同一条待遇：只许这一处，门禁盯着。
 *
 * @returns {boolean} true = 这一下真的推了一档
 */
export function adjustFocused(delta, doc = globalThis.document) {
  const el = doc?.activeElement;
  if (!el || el.disabled || el.type !== 'range') return false;
  // 三个属性各自按 HTML 的缺省值补（range 是 min=0 / max=100 / step=1），脏字面量一律不进算式
  const num = (raw, dflt) => {
    const t = String(raw ?? '').trim();
    if (t === '') return dflt;
    const n = Number(t);
    return Number.isFinite(n) ? n : dflt;
  };
  const stepText = String(el.step ?? '').trim();
  const s0 = num(stepText, 1);
  const s = s0 > 0 ? s0 : 1;                 // step="0" / 脏字面量：浏览器同样回落到缺省 1 档
  const loN = num(el.min, 0);
  const hiN = num(el.max, 100);
  const cur = num(el.value, NaN);
  if (!Number.isFinite(cur) || !(hiN > loN)) return false;
  // 按"第几档"算而不是 `cur + delta*s`：后者会在 1.6-0.1 上留下 1.5000000000000002，
  // 那串尾巴会被 `settings.set` 存进盘里、摆到滑杆上给玩家看。
  // 档位取四舍五入：玩家用鼠标拖出的 0.52 也在某一档附近，按下该走的是那一档的下一步。
  const at = Math.round((cur - loN) / s);
  const last = Math.round((hiN - loN) / s);
  const ticks = Math.min(last, Math.max(0, at + delta));
  const value = Number((loN + ticks * s).toFixed(stepDecimals(stepText)));
  if (value === cur) return false;                       // 已经在头上了：这一下没被接住
  el.value = String(value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}
