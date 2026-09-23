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
