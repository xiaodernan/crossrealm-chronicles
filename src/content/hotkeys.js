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
];

export const UI_ACTIONS = UI_HOTKEYS.map((e) => e.action);

/** 面板上给人看的名字。缺一个就意味着有一行动作在界面上是空的 —— 校验器管这条 */
export const UI_HOTKEY_LABELS = {
  help: '帮助手册',
  minimap: '小地图',
  worldMap: '世界地图',
  cameraMode: '视角切换',
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
