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
 */
const NAV_SELECTOR = 'button:not([disabled]):not(.hidden),'
  + 'input:not([disabled]):not(.hidden):not([type=file]):not([type=hidden])';

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

/** 面板刚打开：焦点落在清单第一格，玩家立刻有"现在选中的是谁"可看（没有可落的东西返回 false） */
export function focusFirstItem(host, doc = globalThis.document) {
  const items = navItems(host);
  if (!items.length) return false;
  // 已经落在这一格里就别动它：从别的界面退回同一个面板时保留玩家选中的那一格
  if (items.includes(doc?.activeElement)) return true;
  items[0].focus();
  return true;
}
