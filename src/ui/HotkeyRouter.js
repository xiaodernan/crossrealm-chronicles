import { topBackLayer, overlayBlocksHotkeys } from './OverlayStack.js';
import { UI_NAV_ACTIONS } from '../content/hotkeys.js';
import { NAV_REPEAT } from '../content/tuning.js';

/**
 * 哪些动作按住要连发：**只有面板内导航那一组**（名单在 `hotkeys.js`，这里不另抄一份）。
 * 开关类动作（Tab / Escape / G…）按住连发是缺陷不是手感 —— 切片3 立的那条规矩对它们仍然成立。
 */
const REPEATABLE = new Set(UI_NAV_ACTIONS);

/**
 * UI 热键派发（W-A7 切片3）。
 *
 * 只做三件事：**边沿**、**preventDefault 的判断**、**阻塞判断**。行为本体在
 * `Game.runHotkey()`（见 `content/hotkeys.js` 的分工）。
 *
 * 与改前的两点差别，都是有意的：
 * 1. 派发从"事件瞬间"挪到"下一帧轮询"（≤一帧延迟），换来键盘与手柄共用同一条路；
 * 2. **按住不放只触发一次**（导航那几格除外，见下）。改前靠浏览器重发 `keydown`，
 *    按住 Tab 会把区域面板抖成筛子 —— 那是缺陷，不是手感。
 *
 * 切片18 把第 2 条开了一道口子，而且只开一道：**"要不要连发"由名单说，"多快"由
 * `NAV_REPEAT` 说，两者都只在这一个类里被读**。桥（`GamepadInput`）因此不必知道自己面对的
 * 是面板还是战斗，也不需要第三份节奏；键盘按住不放与手柄按住不放走的是同一只定时器。
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
    /** 同一格键"距下一次连发还剩多少秒"；0 = 这一格不许连发（或已经用完这一轮） */
    this._held = new Array(table.length).fill(0);
  }

  /**
   * 换一张表（重映射之后）。边沿状态跟着表走 —— 留着旧的定长数组，
   * 换表后的第一次按下会被当成"已经按着了"，那一格键就此失灵。
   * 节奏同理：按新表的第一格键不该继承上一张表的剩余等待。
   */
  useTable(table) {
    this.entries = table;
    this._down = new Array(table.length).fill(false);
    this._held = new Array(table.length).fill(0);
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

  /**
   * 每帧一次：把 `keys` 的按下沿派发动作；导航那几格按住不放时按 `NAV_REPEAT` 连着派发。
   *
   * @param {object} keys 按下表（键盘写的、手柄桥借键写的，同一形状）
   * @param {number} [dt] `rawDt`（秒）。**不传就等于不连发** —— 只剩切片3 那套纯边沿语义，
   *        所以调用方（`Game.update`）必须把这一帧的真实时长递进来，有门禁盯着这一句
   */
  poll(keys, dt = 0) {
    /* 只认"有限的正秒数"：脏值（字符串 / NaN / 负数）一律当 0 处理。宁可"按住不连发"，
     * 也不能让一只脏计时器把移焦打成机关枪 —— `'1' > 0` 在 JS 里是真，所以光比大小不够。
     * `TimeController.maxDelta` 把一帧夹在 0.05 秒且 `interval` 比它长，所以"每帧最多走一步"
     * 是**结构**保证的：掉帧不会攒出一串补发（那才是按住不动焦点乱跳的成因）。 */
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const down = !!keys[e.code];
      const was = this._down[i];
      this._down[i] = down;
      if (!down) { this._held[i] = 0; continue; }     // 松手：节奏清零，下次按下重新等一整个 delay
      if (this.isBlocked(e.code)) { this._held[i] = 0; continue; }
      if (!was) {                                     // 按下沿照旧派发一次（切片3 的行为不变）
        this.onAction(e.action);
        this._held[i] = REPEATABLE.has(e.action) ? NAV_REPEAT.delay : 0;
        continue;
      }
      if (this._held[i] <= 0) continue;               // 名单外的动作：按住也永远只此一次
      this._held[i] -= step;
      if (this._held[i] > 0) continue;
      this.onAction(e.action);
      this._held[i] = NAV_REPEAT.interval;
    }
  }
}

/**
 * UI 热键的阻塞判据（纯函数）：面板现状 + 物理码进，`true` = 拦下。
 *
 * 判据本体在 `ui/OverlayStack.js` 那张层表里（切片10 / 修 B46）—— 这里只留一个转发，
 * 因为"挡哪些键"与"返回键归谁"必须是同一份清单：以前它长在两个函数里各抄一份，
 * 于是面板开着时连 Escape 一起挡，暂停菜单再也关不掉。
 */
export function hotkeyBlockedBy(state, code) {
  return overlayBlocksHotkeys(state, code);
}

/**
 * Escape 那条级联（谁吃掉这一下）。顺序本体在 `OVERLAY_LAYERS`（切片10），
 * 这里只留旧名字与那句"顺序本身就是产品决策"的说明：过场里该先跳过演出，而不是先弹暂停菜单。
 * 改前这段顺序埋在 `keydown` 分支里，一行测试都没有；切片3 抽成纯函数，切片10 收进表。
 */
export function escapeRoute(state) {
  return topBackLayer(state);
}
