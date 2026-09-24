import { hotkeyCodeFor, isMapPassThrough } from '../content/hotkeys.js';

/**
 * 模态层清单（W-D1 第一片 / 修 **B46**）。
 *
 * 一行一层，两个问题在同一行答完：
 * - `back`：这一层吃不吃"返回"（Escape / 手柄 B）。**数组顺序就是吃键顺序**，越靠前越顶层。
 * - `blocks`：这一层开着时别的 UI 热键穿不穿过 —— `true` 全挡、`'map'` 走世界地图那份放行名单、
 *   `false` 不挡。
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
  { layer: 'dialog', state: 'dialogOpen', back: true, blocks: true },
  { layer: 'worldMap', state: 'worldMapOpen', back: true, blocks: 'map' },
  { layer: 'autoPlay', state: 'autoPlayActive', back: true, blocks: false },
  { layer: 'help', state: 'helpOpen', back: true, blocks: true },
  { layer: 'cinematic', state: 'cinematicActive', back: true, blocks: false },
  { layer: 'settings', state: 'settingsOpen', back: true, blocks: true },
  { layer: 'fastTravel', state: 'fastTravelOpen', back: true, blocks: true },
  { layer: 'pauseMenu', state: 'pauseMenuOpen', back: true, blocks: true },
  /**
   * 战斗演出的跳过排在所有吃返回键的模态之后（B52 的另一半：它自己那条 keydown 也撤了）。
   * 摆在这里 = 菜单/设置/对话开着时返回键先关它们，都没开着时才跳演出 —— 与它原来那条
   * "见 dialog/pauseMenu/upgrade 就让路"的守卫等价，但顺序只在这张表里写一次。
   */
  { layer: 'combatCinematic', state: 'combatCinematicSkippable', back: true, blocks: false },
  /**
   * 唯一的硬模态：升级面板没有返回路径（只能点"继续探索"），所以它连返回键一起挡。
   * 给它一条返回层是 W-D1 后面的事，这一片先把"别在升级面板后面弹出菜单"钉住。
   */
  { layer: 'upgrade', state: 'upgradeOpen', back: false, blocks: true },
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
 * 面板现状 + 物理码 → 这条 UI 热键穿不穿过（`true` = 拦下）。
 *
 * 判据只有一句：**有返回层的模态放行返回键本身**，其余一概拦住；硬模态连返回键也不放；
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
    return code !== hotkeyCodeFor('escape');           // 有返回层：只放行返回键本身
  }
  return mapOnly && !isMapPassThrough(code);
}

/** 表本身自检：状态字段名不许重复、`blocks` 只能是那三种值（加载期跑，不等到按下才发现） */
export function assertOverlayLayers(layers = OVERLAY_LAYERS) {
  const seen = new Set();
  for (const l of layers) {
    if (seen.has(l.state)) throw new Error(`模态层状态字段重复：${l.state}`);
    if (seen.has(l.layer)) throw new Error(`模态层名字重复：${l.layer}`);
    if (l.blocks !== true && l.blocks !== false && l.blocks !== 'map') {
      throw new Error(`层 "${l.layer}" 的 blocks 只能是 true / false / 'map'：${String(l.blocks)}`);
    }
    seen.add(l.state);
    seen.add(l.layer);
  }
  return layers;
}

assertOverlayLayers();

export { BY_STATE as OVERLAY_LAYER_BY_STATE };
