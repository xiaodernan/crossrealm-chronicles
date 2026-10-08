/**
 * UI 热键表（W-A7 切片3）。
 *
 * 从前这些判断直接写在 `Game.setupInput()` 的 `keydown` 分支里，于是只有键盘能用：
 * 手柄没有 `keydown` 事件。挪成表之后，派发方变成"每帧轮询 `keys` 的边沿"，
 * 同一张表既服务键盘也服务手柄（`start → Escape` 就是这么接上的）。
 *
 * 表里只放**声明**（哪个键、什么动作、要不要挡浏览器的默认行为），
 * 行为本体在 `Game.runHotkey()` —— 与 `arenaScripts.js`（数据）+ `Boss`（行为）同一分工。
 */
export const UI_HOTKEYS = [
  { code: 'KeyH', action: 'help', preventDefault: true },
  { code: 'KeyM', action: 'minimap' },
  { code: 'KeyG', action: 'worldMap' },
  { code: 'KeyV', action: 'cameraMode' },
  { code: 'Tab', action: 'zonePanel', preventDefault: true },
  // 世界地图上的路点（W-D6 切片13）。改前画布上"点击放置 / Shift+点击移除"只能鼠标点，
  // 而地图是全屏模态里唯一一张画布：纯键盘玩家看得见图、切得了导航路点，就是落不了自己的点。
  // 这两格是"落点"那一下的键盘出口；光标本身不占键位 —— ↑↓←→ 本来就是移焦那四格，
  // 地图开着时它们没有宿主可去（`worldMap` 层没有 `nav`），改推光标，不新开四条绑定。
  { code: 'F4', action: 'mapMark', preventDefault: true },
  { code: 'F6', action: 'mapUnmark', preventDefault: true },
  { code: 'KeyU', action: 'questTracker' },
  { code: 'KeyN', action: 'autoPlay', preventDefault: true },
  { code: 'KeyJ', action: 'journal' },
  { code: 'F2', action: 'photoMode', preventDefault: true },
  { code: 'F3', action: 'perfHud', preventDefault: true },
  { code: 'Backquote', action: 'sessionStats', preventDefault: true },
  { code: 'KeyP', action: 'save' },
  { code: 'KeyL', action: 'load' },
  { code: 'Escape', action: 'escape' },
  { code: 'F10', action: 'settings' },
  // 面板内移焦（切片11）：↑↓ 在开着的面板里走，Enter / 空格 交给浏览器原生激活
  { code: 'ArrowUp', action: 'uiUp', preventDefault: true },
  { code: 'ArrowDown', action: 'uiDown', preventDefault: true },
  // 面板内调值（切片16）：← → 推焦点那一格的数值（今天能推的只有滑杆）。
  // `preventDefault: true` 是**接管**的声明：原生滑杆步进与我们的步进若同时发生，
  // 玩家按一下会走两档。于是这条通路只有一个消费者 —— 键盘与手柄（十字键冒充 ← →）走同一条。
  { code: 'ArrowLeft', action: 'uiLeft', preventDefault: true },
  { code: 'ArrowRight', action: 'uiRight', preventDefault: true },
];

export const UI_ACTIONS = UI_HOTKEYS.map((e) => e.action);

/** 面板上给人看的名字。缺一个就意味着有一行动作在界面上是空的 —— 校验器管这条 */
export const UI_HOTKEY_LABELS = {
  help: '帮助手册',
  minimap: '小地图',
  worldMap: '世界地图',
  cameraMode: '视角切换',
  mapMark: '放置路点',
  mapUnmark: '移除路点',
  zonePanel: '区域信息',
  questTracker: '任务追踪',
  autoPlay: '自动演示',
  journal: '日志',
  photoMode: '拍照模式',
  perfHud: '性能面板',
  sessionStats: '本局统计',
  save: '保存',
  load: '读取',
  escape: '返回 / 暂停',
  settings: '设置',
  uiUp: '面板焦点上移',
  uiDown: '面板焦点下移',
  uiLeft: '面板数值调小',
  uiRight: '面板数值调大',
};

/**
 * `KeyboardEvent.code` 的合法形状（`KeyA` / `Digit1` / `F5` / `Backquote` / `Numpad0`…）。
 * 两层意义：确认"这确实是枚键盘键"，以及它是设置面板里唯一会被拼进 DOM 的玩家输入 ——
 * 过了这条正则，就没有别处需要再 escape 一次。
 */
const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * 把玩家的重映射叠到表上，返回**新表**（不改常量：常量是全仓的"出厂设定"，
 * 复位只要 `{}` 就够）。校验在应用这一刻跑，而不是等到按下才发现：
 * 未知动作与撞键都直接抛，调用方（设置面板）拿它当"这次改动作弊"的判据。
 */
export function applyHotkeyOverrides(table = UI_HOTKEYS, overrides = {}) {
  const entries = table.map((e) => ({ ...e }));
  const byAction = new Map(entries.map((e) => [e.action, e]));
  for (const [action, code] of Object.entries(overrides ?? {})) {
    const target = byAction.get(action);
    if (!target) throw new Error(`未知的热键动作 "${action}"：表里没有这一格`);
    if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
      throw new Error(`动作 "${action}" 的键位不合法：${JSON.stringify(code)}`);
    }
    target.code = code;
  }
  assertHotkeys(entries);      // 撞键在这里红：不是等到按下才发现"两个动作共用一个键"
  return entries;
}

/** 表里的当前键位（面板显示与"这一格现在绑的是什么"都问它，不各自存一份） */
export function hotkeyCodes(table) {
  return Object.fromEntries(table.map((e) => [e.action, e.code]));
}

/**
 * **生效表**的模块级镜像（W-A7 切片6）。
 *
 * 游戏键那半边在 `keybinds.js` 里早就有这一份（`ACTIVE`），热键这半边一直缺 ——
 * 于是 HUD 与提示条想知道"日志现在按什么键"只能读出厂表。补上镜像之后，
 * 两张表的读法一致：写只有一个点（`Game.rebuildHotkeys()`），读谁都可以。
 */
let ACTIVE_HOTKEYS = UI_HOTKEYS;
let HOTKEY_EPOCH = 0;

export function setHotkeyTable(table) {
  ACTIVE_HOTKEYS = Array.isArray(table) ? table : UI_HOTKEYS;
  HOTKEY_EPOCH++;
  return ACTIVE_HOTKEYS;
}

export function activeHotkeyTable() {
  return ACTIVE_HOTKEYS;
}

/** 生效表换过的次数：只读的消费方（提示文案缓存）拿它判"我手里这份是不是旧的" */
export function hotkeyEpoch() {
  return HOTKEY_EPOCH;
}

/** 热键动作当前绑的键码；表里没这个动作返回 null（提示文案要的就是这个区分） */
export function hotkeyCodeFor(action) {
  const e = ACTIVE_HOTKEYS.find((x) => x.action === action);
  return e?.code ?? null;
}

/**
 * 世界地图开着时仍然放行的那几个动作：开图的那个键、关图的那个键、区域面板的开关，
 * 以及落点那两格（切片13：地图开着时它们就是"在这一格放 / 收路点"，与鼠标同一条语义）。
 * 这里列的是**动作**不是键码 —— 玩家把"世界地图"改到 `C` 之后，例外就该跟着搬到 `C`，
 * 而不是继续给出厂的 `G` 放行（那等于改绑之后地图开着时按 `G` 还会穿透）。
 */
export const MAP_PASSTHROUGH_ACTIONS = ['worldMap', 'escape', 'zonePanel', 'mapMark', 'mapUnmark'];

/** 这个物理码是不是当前生效表里"地图例外"那几个动作之一 */
export function isMapPassThrough(code) {
  for (const action of MAP_PASSTHROUGH_ACTIONS) {
    const bound = hotkeyCodeFor(action);
    if (bound !== null && bound === code) return true;
  }
  return false;
}

/**
 * 面板内导航的那四个动作（切片11 的 ↑↓ + 切片16 的 ← →）。与 `MAP_PASSTHROUGH_ACTIONS`
 * 同一条理由列**动作**不列键码：层表放行的是"移焦与调值这件事"，玩家把 ← 改到 `I` 之后
 * 该放行的就是 `I` —— 抄 `'ArrowLeft'` 等于给改绑留一个"面板里调不了值"的坑。
 *
 * 四个动作分成两对，出口各不相同，但都从这一份清单派发：↑↓ 问 `movePanelFocus`（走格），
 * ← → 问 `FocusNav.adjustFocused`（推焦点那一格的数值）。层表只认清单，不关心走的是哪一对。
 *
 * 同一份清单在切片18 又多答一个问题：**按住要连发的就是这四格**（`HotkeyRouter` 拿它当名单，
 * 节奏在 `tuning.js` 的 `NAV_REPEAT`）。这里列**动作**不列键码的第二条理由也就是它：
 * 名单只该有一份，否则"改了绑定的键盘能连发、手柄不能"这类分裂迟早回来。
 */
export const UI_NAV_ACTIONS = ['uiUp', 'uiDown', 'uiLeft', 'uiRight'];

/** 这枚码是不是当前生效表里的"面板内导航"键（模态层据此决定让不让移焦穿过去） */
export function isNavCode(code) {
  for (const action of UI_NAV_ACTIONS) {
    const bound = hotkeyCodeFor(action);
    if (bound !== null && bound === code) return true;
  }
  return false;
}

/** 动作名要有中文名：缺一行，设置面板上就是一格空白 */
export function assertHotkeyLabels(labels = UI_HOTKEY_LABELS, table = UI_HOTKEYS) {
  for (const e of table) {
    if (!labels[e.action]) throw new Error(`热键动作 "${e.action}" 没有显示名`);
  }
  const extra = Object.keys(labels).filter((a) => !table.some((e) => e.action === a));
  if (extra.length) throw new Error(`显示名里有表里不存在的动作：${extra.join(', ')}`);
  return labels;
}

/**
 * 整表校验，加载期跑一次。两个"唯一"是这张表的全部风险：
 * 一个键两个动作 = 按一次办两件事；一个动作两个键 = 谁在派发说不清（重映射界面要翻这张表）。
 */
export function assertHotkeys(table = UI_HOTKEYS) {
  const codes = new Set();
  const actions = new Set();
  for (const [i, e] of table.entries()) {
    const at = `热键表 [${i}] ${e.code ?? '(无 code)'}`;
    if (!e.code || typeof e.code !== 'string') throw new Error(`${at}：code 必须是非空字符串`);
    if (!e.action) throw new Error(`${at}：缺 action`);
    if (codes.has(e.code)) throw new Error(`${at}：code 已被前面的条目占用`);
    if (actions.has(e.action)) throw new Error(`${at}：动作 "${e.action}" 重复绑定`);
    codes.add(e.code);
    actions.add(e.action);
  }
  return table;
}

assertHotkeys();
