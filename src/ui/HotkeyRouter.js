/**
 * UI 热键派发（W-A7 切片3）。
 *
 * 只做三件事：**边沿**、**preventDefault 的判断**、**阻塞判断**。行为本体在
 * `Game.runHotkey()`（见 `content/hotkeys.js` 的分工）。
 *
 * 与改前的两点差别，都是有意的：
 * 1. 派发从"事件瞬间"挪到"下一帧轮询"（≤一帧延迟），换来键盘与手柄共用同一条路；
 * 2. **按住不放只触发一次**。改前靠浏览器重发 `keydown`，按住 Tab 会把区域面板抖成筛子 ——
 *    那是缺陷，不是手感。
 *
 * 阻塞判断在两个时刻各算一次：`keydown` 时算一次只为决定要不要 `preventDefault()`
 * （必须赶在事件里做），轮询时再算一次决定要不要派发。两个时刻相差不到一帧，
 * 而"面板刚被别的系统关掉"这种交错本来就没有正确答案。
 */
export class HotkeyRouter {
  constructor({ table, isBlocked, onAction }) {
    this.entries = table;
    this.isBlocked = isBlocked;
    this.onAction = onAction;
    /** 与 `table` 同长的状态数组：每帧只读写定长槽，不在热路径分配 */
    this._down = new Array(table.length).fill(false);
  }

  /** @returns {boolean} 调用方应当对这个键 `preventDefault()`（挡住浏览器默认行为） */
  onKeydown(code) {
    if (this.isBlocked(code)) return false;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (e.code === code) return e.preventDefault === true;
    }
    return false;
  }

  /** 每帧一次：把 `keys` 的按下沿派发动作 */
  poll(keys) {
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const down = !!keys[e.code];
      const was = this._down[i];
      this._down[i] = down;
      if (!down || was) continue;
      if (this.isBlocked(e.code)) continue;         // 面板接管期间不放行
      this.onAction(e.action);
    }
  }
}

/**
 * Escape 那条级联（谁吃掉这一下）。抽成纯函数是因为它有**七层顺序**，
 * 而顺序本身就是产品决策：过场里该先跳过演出，而不是先弹暂停菜单。
 * 改前这段顺序埋在 `keydown` 分支里，一行测试都没有。
 */
export function escapeRoute(s) {
  if (s.endCreditsSkippable) return 'endCredits';
  if (s.combatCinematicSkippable) return 'combatCinematic';
  if (s.worldMapOpen) return 'worldMap';
  if (s.autoPlayActive) return 'autoPlay';
  if (s.helpOpen) return 'help';
  if (s.cinematicActive) return 'cinematic';
  return 'pauseMenu';
}
