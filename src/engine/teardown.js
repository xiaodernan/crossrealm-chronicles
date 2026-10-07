/**
 * 子系统清理登记表（W-A1 注销欠账迁移第二处）
 *
 * ## 为什么要有这一层
 * `engine/EventBus.js` 给了"怎么注销"（`offAll(tag)`），上一片给 `CombatCinematicSkip`
 * 补了 `dispose()` —— 但**没有人调用它**。全仓只有 8 个 `dispose()` 定义，
 * 而 `Game` 上挂着几十个子系统；`Game` 自己**没有任何"把东西收干净"的出口**。
 * 于是"注销路径存在"与"注销会发生"之间差着这一层。
 *
 * ## 谁登记、谁执行
 * **谁建谁登记**：`Game` 收编子系统时把它的 `dispose` 交上来（见 `Game._adopt`），
 * 执行是 `Game.dispose()` 里的 `runTeardowns()` 一次结清。
 *
 * ## 三条纪律
 * 1. **tag 唯一**。两个系统登记同一个 tag 说明所有权重叠 —— 当场抛，
 *    而不是让后来者悄悄覆盖前者（那会让前一个系统的清理**永远不被执行**）。
 * 2. **反序执行**。后建的系统先收：先建的可能是后建者的依赖
 *    （HUD 读 `stats`、`CombatFeedback` 读场景），正序收会让先收的系统
 *    在拆卸途中被还在跑的系统访问。
 * 3. **一条抛错不连累其他**，但也不吞 —— 全部跑完后把第一个异常原样抛出
 *    （与 `Scheduler.update` 的到期回调同一口径）。
 *
 * ## 为什么是模块级的
 * `new Game()` 全仓只出现一次（`main.js` 的 `boot()`）。登记表跟着这个事实走：
 * 它描述的是"这一个游戏实例持有什么"，而不是一个可复用的容器。
 * `runTeardowns()` 执行完会**清空**，所以第二次调用是空转（幂等）。
 */

/** @type {Array<{tag: string, fn: () => void}>} */
const entries = [];

/**
 * 登记一个子系统的清理函数。
 * @param {string} tag 所有权标识，约定 `"域/类名"`，与 `EventBus.on` 的 tag 同一套写法
 * @param {() => void} fn 清理函数
 */
export function registerTeardown(tag, fn) {
  if (typeof tag !== 'string' || tag.length === 0) {
    throw new Error(`registerTeardown: tag 必须是非空字符串（约定 "域/类名"），收到 ${String(tag)}。`);
  }
  if (typeof fn !== 'function') {
    throw new Error(`registerTeardown('${tag}'): 清理函数必须是函数，收到 ${typeof fn}。`);
  }
  if (entries.some((e) => e.tag === tag)) {
    throw new Error(
      `registerTeardown('${tag}'): 这个 tag 已经登记过了 —— 两个系统抢同一个所有权时，`
      + '先登记的那一个的清理会永远不被执行。给其中一个换个 tag。',
    );
  }
  entries.push({ tag, fn });
}

/**
 * 收编一个子系统：把它的 `dispose` 交给登记表。
 *
 * **没有 `dispose()` 的会被当场拒绝** —— 这是"假装收编"的防线：一句
 * `registerTeardown(tag, () => {})` 也能让账面上多一条，但拆卸时什么都不会发生。
 * 要收编就得先有清理路径。
 *
 * @param {string} tag
 * @param {{dispose: () => void}} instance
 * @returns 传进来的那个实例（方便写成 `this.x = adoptSubsystem(tag, new X())`）
 */
export function adoptSubsystem(tag, instance) {
  if (typeof instance?.dispose !== 'function') {
    throw new Error(
      `adoptSubsystem('${tag}'): 这个子系统没有 dispose()，收编不了 —— `
      + '先给它补上清理路径（停监听 / 释放 GPU 资源 / 退订观测量），再来登记。',
    );
  }
  registerTeardown(tag, () => instance.dispose());
  return instance;
}

/**
 * 执行全部清理，**反序**（后建先收）。执行完清空登记表。
 * @returns {number} 实际执行的条数
 */
export function runTeardowns() {
  if (!entries.length) return 0;
  const list = entries.splice(0, entries.length);
  let firstError = null;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    try {
      list[i].fn();
    } catch (err) {
      if (!firstError) firstError = err;
    }
  }
  if (firstError) throw firstError;
  return list.length;
}

/** 诊断用：现在登记了几条、分别是哪些 tag */
export function teardownTags() {
  return entries.map((e) => e.tag);
}

/** 清空登记表（只给测试用：把上一条用例留下的账抹掉） */
export function clearTeardowns() {
  entries.length = 0;
}
