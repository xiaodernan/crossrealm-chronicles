import { hotkeyCodeFor, isMapPassThrough, isNavCode } from '../content/hotkeys.js';

/**
 * 模态层清单（W-D1 第一片 / 修 **B46**）。
 *
 * 一行一层，三个问题在同一行答完：
 * - `back`：这一层吃不吃"返回"（Escape / 手柄 B）。**数组顺序就是吃键顺序**，越靠前越顶层。
 * - `blocks`：这一层开着时别的 UI 热键穿不穿过 —— `true` 全挡、`'map'` 走世界地图那份放行名单、
 *   `false` 不挡。
 * - `nav`：这一层开着时**焦点归哪个 DOM 宿主**（切片11）。没有这一格的面板不收焦点，
 *   于是野外按 ↑ 什么都不做 —— 那是正确答案，不是漏判。
 *
 * 为什么非要写进同一张表：B46 的根因正是"挡键的那份名单"与"返回键归谁的那份级联"分别长在
 * 两个函数里 —— 级联压根没有 settings / fastTravel 两层，而守卫连返回键一起挡，
 * 于是暂停菜单只能靠鼠标点"继续"。两份清单合成一份之后，"改一边另一边立刻不一致"这件事
 * 才有地方被测试钉住（见 `tests/overlay-stack.test.js` 的静态门禁）。
 *
 * `state` 那格是**消费方传进来的状态字段名**：`Game.overlayState()` 是唯一的生产者，
 * 表里登记的字段与它返回的键必须一一对齐（同样有门禁）。
 */
export const OVERLAY_LAYERS = [
  { layer: 'endCredits', state: 'endCreditsSkippable', back: true, blocks: false },
  /**
   * 对话排在这里（切片10 / 修 **B52**）：以前它自己在 `window` 上挂一条 keydown 关自己，
   * 于是同一下 Escape 有两个消费者 —— 它先按事件把对话关掉，下一帧热键派发口再拿这条键走级联，
   * 结果对话关完顺手弹出了暂停菜单（浏览器读数 R4 抓到）。关掉对话从此是级联的一格，
   * 而且它排在地图之前：对话压着地图时，返回键先还对话的自由。
   */
  /**
   * 对话框（W-D6 切片10）：它也收焦点。改前这一层没有 `nav`，于是对话框里的选项
   * （接不接这个任务、在不在营火休息、读不读这段记忆）**只能鼠标点** —— ↑↓ 在它外面就落空。
   * 而那些选项是**玩法决策**，不是装饰：纯键盘玩家走到营火前按 E，看到一段话和一个
   * "继续探索"，却走不进任何一格。落焦由 `Dialog.show` / `showChoices` 做
   * （`focusFirstItem`，全仓唯一出口），关掉之后焦点随 innerHTML 清空自然落回 body。
   */
  { layer: 'dialog', state: 'dialogOpen', back: true, blocks: true, nav: 'dialog-overlay' },
  { layer: 'worldMap', state: 'worldMapOpen', back: true, blocks: 'map' },
  { layer: 'autoPlay', state: 'autoPlayActive', back: true, blocks: false },
  { layer: 'help', state: 'helpOpen', back: true, blocks: true, nav: 'help-manual' },
  /**
   * 日志抽屉（切片27 / 修 **B57**）。它过去只归 `HUD` 自己记一格布尔：`overlayState()` 里没有它，
   * 于是级联不知道要关它（按 Escape 反而把暂停菜单弹出来，抽屉还开着）、走焦也不认它（面板里
   * 明明有八格可点，↑↓ 一步都进不去），而两张手柄表里没有任何一格能打开它 —— 手柄玩家连开都开不了。
   * 现在它与说明书同档：吃返回键、挡别的 UI 热键、认领 `#journal-panel` 那一格的焦点。
   */
  { layer: 'journal', state: 'journalOpen', back: true, blocks: true, nav: 'journal-panel' },
  { layer: 'cinematic', state: 'cinematicActive', back: true, blocks: false },
  { layer: 'settings', state: 'settingsOpen', back: true, blocks: true, nav: 'settings-panel' },
  { layer: 'fastTravel', state: 'fastTravelOpen', back: true, blocks: true, nav: 'fast-travel-panel' },
  { layer: 'pauseMenu', state: 'pauseMenuOpen', back: true, blocks: true, nav: 'pause-menu' },
  /**
   * 战斗演出的跳过排在所有吃返回键的模态之后（B52 的另一半：它自己那条 keydown 也撤了）。
   * 摆在这里 = 菜单/设置/对话开着时返回键先关它们，都没开着时才跳演出 —— 与它原来那条
   * "见 dialog/pauseMenu/upgrade 就让路"的守卫等价，但顺序只在这张表里写一次。
   */
  { layer: 'combatCinematic', state: 'combatCinematicSkippable', back: true, blocks: false },
  /**
   * 升级面板（营火）。切片10 那一版把它写成唯一的硬模态：没有返回路径，只能点"继续探索"。
   *
   * 切片24 改口的理由不是"想要一个快捷键"，而是**纯手柄玩家进不去也退不出**：这一层既不
   * `back`（级联不吃它），又没有 `nav`（↑↓ 走不进那九格），而 A 那一下要"当前有聚焦元素"
   * 才点得动 —— 真浏览器读数里 Escape / ↑↓ / Tab / 手柄 B / 手柄 A / Start 六条路全都不改变
   * 任何东西，只有鼠标能解。今天它是一层**吃得掉、走得进**的普通模态：返回键关掉它，
   * ↑↓ 走进那九格，A 交给浏览器激活焦点那一格（与其他面板同一条路）。
   */
  { layer: 'upgrade', state: 'upgradeOpen', back: true, blocks: true, nav: 'upgrade-panel' },
];

const BY_STATE = new Map(OVERLAY_LAYERS.map((l) => [l.state, l]));

/**
 * 这一下"返回"该由哪一层吃掉。
 *
 * 什么都没开着时返回 `'pauseMenu'` —— 那不是"关掉暂停菜单"，而是"打开它"，
 * 所以调用方拿到的永远是"这一下有人吃"，不需要再判 null。
 */
export function topBackLayer(state) {
  for (const l of OVERLAY_LAYERS) {
    if (l.back && state[l.state]) return l.layer;
  }
  return 'pauseMenu';
}

/**
 * 这一下移焦该由哪一层接住（切片11）：从上往下找第一个"开着且登记了 `nav` 宿主"的层。
 *
 * 与 `topBackLayer` 吃同一份现状、同一份层序 —— 所以"Escape 关掉的"与"↑↓ 走进去的"
 * 必然是同一个面板。从前这两件事会分叉：级联说菜单在最顶上，而焦点还留在设置面板里。
 * 没有一层收焦点返回 `null`（野外按 ↑ 什么都不做）。
 */
export function topNavLayer(state) {
  for (const l of OVERLAY_LAYERS) {
    if (l.nav && state[l.state]) return l;
  }
  return null;
}

/**
 * 面板现状 + 物理码 → 这条 UI 热键穿不穿过（`true` = 拦下）。
 *
 * 判据只有一句：**有返回层的模态放行返回键本身与移焦键**，其余一概拦住；硬模态连返回键也不放；
 * 只有世界地图自己那份放行名单（`MAP_PASSTHROUGH_ACTIONS`，切片7）在"没有别的模态挡着"时才生效
 * —— 地图和暂停菜单同时开着时，模态优先，别让 `Tab` 从菜单底下钻出去。
 * 返回键是哪个码问生效表（改绑之后跟着搬），不在这里抄 `Escape`。
 */
export function overlayBlocksHotkeys(state, code) {
  let mapOnly = false;
  for (const l of OVERLAY_LAYERS) {
    if (!l.blocks || !state[l.state]) continue;
    if (l.blocks === 'map') { mapOnly = true; continue; }
    if (!l.back) return true;                          // 硬模态：连返回键一起挡
    return code !== hotkeyCodeFor('escape') && !isNavCode(code);
  }
  return mapOnly && !isMapPassThrough(code) && !isNavCode(code);
}

/** 表本身自检：状态字段名不许重复、`blocks` 只能是那三种值（加载期跑，不等到按下才发现） */
export function assertOverlayLayers(layers = OVERLAY_LAYERS) {
  const seen = new Set();
  const hosts = new Set();
  for (const l of layers) {
    if (seen.has(l.state)) throw new Error(`模态层状态字段重复：${l.state}`);
    if (seen.has(l.layer)) throw new Error(`模态层名字重复：${l.layer}`);
    if (l.blocks !== true && l.blocks !== false && l.blocks !== 'map') {
      throw new Error(`层 "${l.layer}" 的 blocks 只能是 true / false / 'map'：${String(l.blocks)}`);
    }
    // 一个 DOM 宿主只能被一层认领：两层抢同一格焦点 = "现在选中的是谁"又有两个答案（B47 那一族）
    if (l.nav !== undefined) {
      if (typeof l.nav !== 'string' || !l.nav) throw new Error(`层 "${l.layer}" 的 nav 必须是 DOM id`);
      // 不吃返回键的层（硬模态）认领焦点 = 那一格永远走不进去：↑↓ 在它外面就被挡下了
      if (!l.back) throw new Error(`层 "${l.layer}" 不吃返回键，不许认领焦点：${l.nav}`);
      if (hosts.has(l.nav)) throw new Error(`DOM 宿主 "${l.nav}" 被两层认领：${l.layer}`);
      hosts.add(l.nav);
    }
    seen.add(l.state);
    seen.add(l.layer);
  }
  return layers;
}

assertOverlayLayers();

export { BY_STATE as OVERLAY_LAYER_BY_STATE };
