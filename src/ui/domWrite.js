/**
 * 逐帧 DOM 写入的**去重出口**（W-Y5 切片1）。
 *
 * ## 修的是什么
 *
 * `HUD.update()` 每帧都跑，而坐标、耐力、朝向、引导语这些格子**绝大多数帧一个字符都没变**
 * （站着不动、没有目标、没有路点）。改前它们每帧无条件写一次：
 *
 * - `el.textContent = …` 即使值一样，也会把旧的文本节点换掉、让浏览器把那一格重新排版一次；
 * - `el.style.width = …` 值没变同样会让样式失效一次（随后那帧的 layout 就有了理由重算）。
 *
 * 这是"逻辑价"很低、但落在**合成/排版热路径**上的账：帧率越稳的机器越容易看见它变成掉帧。
 *
 * ## 这一层只做一件事
 *
 * **值没变就不碰 DOM。** 记忆挂在元素自己身上（WeakMap）：
 * 面板整块 `innerHTML` 重绘后旧元素被换掉，旧记录跟着元素一起回收，
 * 不会出现"拿着上一个元素的缓存去比新元素"的错位。
 *
 * 三个出口对 null 元素都安全（查不到的格子直接跳过）—— 这让调用点不必再写
 * `if (el)` 的三行守卫，逐帧热路径也就少了几次分支。
 *
 * 注意：**同一个元素不要绕过这一层再写**。缓存只知道经它手写过的值；
 * 别处直接 `textContent =` 会让记录过期，下一次同值写入会被误跳。
 * 目前热路径上的九个格子（坐标/耐力/冷却/架势/朝向/引导/FPS/锁定两行）都只在这里写。
 */

/** 元素 → 上一次写进 textContent 的字符串 */
const 文本账 = new WeakMap();
/** 元素 → (样式属性 → 上一次写进去的值) */
const 样式账 = new WeakMap();
/** 元素 → 上一次的 hidden 状态 */
const 显隐账 = new WeakMap();

/**
 * 写文本，值相同就跳过。返回 true = 这一帧真的写了 DOM。
 */
export function setText(el, text) {
  if (!el) return false;
  const 值 = String(text);
  if (文本账.get(el) === 值) return false;
  文本账.set(el, 值);
  el.textContent = 值;
  return true;
}

/**
 * 写一条内联样式，同属性同值就跳过。返回 true = 真的写了。
 */
export function setStyle(el, prop, value) {
  if (!el || !el.style) return false;
  let 账 = 样式账.get(el);
  if (!账) 账 = new Map();
  const 值 = String(value);
  if (账.get(prop) === 值) return false;
  账.set(prop, 值);
  样式账.set(el, 账);
  el.style[prop] = 值;
  return true;
}

/**
 * 挂/摘 `hidden` 类，状态相同就跳过。返回 true = 真的写了。
 */
export function setHidden(el, hidden) {
  if (!el) return false;
  const 值 = Boolean(hidden);
  if (显隐账.get(el) === 值) return false;
  显隐账.set(el, 值);
  el.classList.toggle('hidden', 值);
  return true;
}
