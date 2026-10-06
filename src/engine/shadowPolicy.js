/**
 * 阴影策略：谁能投影、谁能接收，只有这一个文件说了算（W-C3 切片1）
 *
 * ## 为什么要有这一层
 * 改前 `castShadow` / `receiveShadow` 的赋值散在 **27 个文件的 55 处**
 * （`.tmp-20261006/wc3s1-census.mjs`），而且**没有一处是 `false`** ——
 * 全是"开"，于是"关掉某个东西的阴影"这件事根本没有出口。
 *
 * 更直接的症状是**同一类物体在不同文件里行为不一致**：`rock` 在
 * `world/WorldDecorations.js` 里是 cast+receive，在 `world/zones/*.js` 里却只 cast；
 * `trunk` 三处全只 cast。同一件事有两个答案，而两边都"没错"，因为从来没有一张表说
 * 石头到底接不接收阴影。
 *
 * ## 类别
 * 四类就够覆盖现有 55 处，分类按"这个东西在画面里是什么"，不按"它在哪个文件里"。
 * **这一版的取值是按迁移前的实测逐格定的，所以迁移本身零视觉变更** ——
 * 先收口、后调值，两件事分开才有办法归因。
 *
 * - `ground` 地面与地板：不投影（地面不会在自己身上留影），只接收。
 * - `prop` 墙 / 悬崖 / 长在地面上的石头 / 角色手里的家伙：投影也接收 ——
 *   它们要能显出别人投在自己身上的影子，否则看着像浮在地上。
 * - `castOnly` 树干 / 树冠 / 柱 / 塔 / 水晶 / 告示牌：只投影，不接收。
 *   与 `actor` 同值但语义不同：这一类以后若要按画质档降阴影，降的是"远景装饰"，
 *   而 `actor` 降的是"角色"—— 同值不该并成一类，并了就没有分别调的余地。
 * - `actor` 玩家 / 敌人 / Boss / NPC 的**主体**：只投影，不接收。
 *   不接收是刻意的：角色接收阴影会招来自阴影瑕疵（acne），而角色自己本来就在投影。
 *   真要让它接收，正确的做法是调 `sun.shadow.normalBias`，不是在这里开 `receive`。
 *
 * ## 认不出就抛
 * `shadowClassOf` 与 B71 那条同口径（`sfx:play` 认不出名字当场抛，不是静默不播）：
 * 静默给个默认值等于让"写错类别名"变成"这个东西悄悄不长影子"。
 */

/** 四类物体的阴影策略。改这张表就是改全世界的阴影，别处不许再写 `castShadow =`。 */
export const SHADOW_CLASSES = Object.freeze({
  ground: Object.freeze({ cast: false, receive: true }),
  prop: Object.freeze({ cast: true, receive: true }),
  castOnly: Object.freeze({ cast: true, receive: false }),
  actor: Object.freeze({ cast: true, receive: false }),
});

/** 类别清单，由表推导 —— 加一类只需要往表里加一行 */
export const SHADOW_CLASS_IDS = Object.freeze(Object.keys(SHADOW_CLASSES));

/** 取一类的策略；认不出就抛（说得出有哪些类） */
export function shadowClassOf(cls) {
  const hit = SHADOW_CLASSES[cls];
  if (!hit) {
    throw new Error(`shadowClassOf: 未知的阴影类别 "${cls}"，可用的是 ${SHADOW_CLASS_IDS.join(' / ')}`);
  }
  return hit;
}

/**
 * 给一个对象落阴影策略。`obj` 可以是一个网格，也可以是一棵子树的根（默认只落它自己）。
 * @returns 传进去的那个对象，方便接着用
 */
export function applyShadow(obj, cls, { deep = false } = {}) {
  if (!obj) return obj;
  const p = shadowClassOf(cls);
  const hit = (o) => {
    if (!o || typeof o !== 'object') return;
    o.castShadow = p.cast;
    o.receiveShadow = p.receive;
  };
  if (deep) obj.traverse?.(hit);
  else hit(obj);
  return obj;
}

/**
 * 总开关：太阳投不投影。`false` 时连 shadow map 那一趟都省了。
 * 光源不是"物体类别"，所以单独一个出口，不走 `applyShadow`。
 */
export function setSunShadow(sun, enabled) {
  if (!sun) return;
  sun.castShadow = !!enabled;
}
