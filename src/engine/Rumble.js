import { RUMBLE as RUMBLE_CFG } from '../content/tuning.js';

/**
 * 手柄震动 —— 打击反馈的第二路输出（W-A7 切片17）。
 *
 * 它不是第四个"谁来请求震动"的入口，而是一条**顺路**：各系统照旧只调 `addShake(intensity)`
 * （全仓 8 处调用点一个没动），`engine/Shake.js` 在记账之后把同一个 `intensity` 交给这里。
 * 于是"这一击有多重"仍然只有一个决定 —— 若在调用点旁边再写一份 `strongRumble`，
 * 轻重就分家成两处（B36 那一族：同一条算式抄两处），而这片想钉住的正是"打击感只有一个真源"。
 *
 * 三段分工，各自只答一个问题：
 * - `content/tuning.js` 的 `RUMBLE.bands`：**多少强度给多大的马达**（唯一的映射表，加载期自检）。
 * - `request()` / `update()`：**一帧里几下怎么合成一次**（合并 + 不许把正在跑的砍短）。
 * - 注入的 `send`：**怎么落到设备上** —— 那是桥的事（`GamepadInput.vibrate`），这里不碰手柄。
 *
 * ## 为什么必须合并，而不是"每下都调一次"
 *
 * `GamepadHapticActuator` 没有叠加：`playEffect` 一下就是**替换**当前那次震动。连招里一帧
 * 来两三下（很常见：挥砍命中多只敌人）若各调一次，玩家听到的是最后那一下的尾巴。
 * 所以请求先攒进本帧的合并槽，帧末一次下令；正在跑的那一次如果更强也更久，新的弱请求
 * 干脆不发 —— 否则就是"轻的一下把重的一下砍短"，症状从"没叠够"变成"震到一半没了"。
 *
 * ## 没有致动器就安静地什么都不做
 *
 * 网页手柄大多没有马达（XInput 之外的设备、蓝牙链路、Linux 上的不少映射都不给），
 * 所以 `send` 返回 `false` 是**常态**而不是异常：不抛错、不重试、不刷日志，
 * 只把账记在 `failed` 上供诊断读。整条链路对没有手柄的玩家是零影响的 ——
 * `padInput` 不在（早期启动）时 `send` 里的可选链就已经把它变成 `false`。
 */

/**
 * 强度落在哪一档。表是"从小到大第一个够得着的落点"，`at: null` 那一行是兜底
 * （最响的一档：蓄力法术 0.35 与 Boss 终焉阶段 0.18+）。
 * 找不到兜底就退回最后一行：宁可给一档实在的震动，也不要在打起来那一刻抛错。
 */
export function rumbleBandFor(intensity, bands = RUMBLE_CFG.bands) {
  for (const b of bands) {
    if (b.at === null || intensity <= b.at) return b;
  }
  return bands[bands.length - 1];
}

/**
 * 表自检（加载期跑）：档位从小到大、三格都不许回头、最后一行必须是兜底。
 *
 * 为什么要在这里炸：单调性一旦破了（有人插了一行"轻击 0.9"），症状是"越轻的攻击震得越猛"，
 * 那既看不见也测不出——而它确实是一次真回归，不是审美问题。
 */
export function assertRumbleBands(bands = RUMBLE_CFG.bands) {
  if (!Array.isArray(bands) || bands.length === 0) throw new Error('RUMBLE.bands 必须是非空数组');
  let prev = { strong: -1, weak: -1, ms: 0 };
  bands.forEach((b, i) => {
    const last = i === bands.length - 1;
    if (!last && !(typeof b.at === 'number' && b.at > 0)) throw new Error(`RUMBLE.bands 第 ${i + 1} 行的 at 必须是正数（兜底只许放在最后一行）`);
    if (last && b.at !== null) throw new Error('RUMBLE.bands 最后一行必须是兜底档（at: null）');
    for (const k of ['strong', 'weak', 'ms']) {
      if (!(typeof b[k] === 'number' && b[k] >= 0)) throw new Error(`RUMBLE.bands 第 ${i + 1} 行的 ${k} 必须是非负数`);
      if (b[k] < prev[k]) throw new Error(`RUMBLE.bands 第 ${i + 1} 行的 ${k} 比上一档还小：档位不许回头`);
    }
    prev = b;
  });
  return bands;
}

assertRumbleBands();

export class Rumble {
  /**
   * @param {(pulse: {strong: number, weak: number, ms: number}) => boolean} send
   *        唯一的出口：`Game` 注入的是"桥的 `vibrate`"。返回 `true` = 真的落到设备上了
   */
  constructor(send, cfg = RUMBLE_CFG) {
    this.send = typeof send === 'function' ? send : () => false;
    this.cfg = cfg;
    /** 玩家的开关（`vibration`）：由 `SettingsManager.applyToGame` 写，这里只读 */
    this.enabled = true;
    /** 本帧攒出来的合并槽。复用对象，热路径不分配（与桥的 `look` / `move` 同一纪律） */
    this.pending = { any: false, strong: 0, weak: 0, ms: 0 };
    /** 下令那只槽同样是复用的：`send` 必须当场读走三个数，不许留着引用 */
    this.pulse = { strong: 0, weak: 0, ms: 0 };
    /** 已经下令、还在跑的那一次（马达只认最后一次命令，所以新的要和它比再过） */
    this.held = { strong: 0, weak: 0, left: 0 };
    /** 诊断账：`pulses` = 真落到设备几次，`dropped` = 被挡下几次（开关 / 已被盖过），`failed` = 设备没接住 */
    this.pulses = 0;
    this.dropped = 0;
    this.failed = 0;
  }

  /**
   * 一次请求（从 `Shake.add` 顺路过来）。只做本帧合并：同几格里取最大的幅度、最长的一次。
   * 关掉开关时连攒都不攒 —— 否则"关掉震动"之后仍会在下一帧漏出一次。
   */
  request(intensity) {
    if (!this.enabled || !(intensity > 0)) {
      this.dropped += 1;
      return false;
    }
    const band = rumbleBandFor(intensity, this.cfg.bands);
    const p = this.pending;
    p.any = true;
    if (band.strong > p.strong) p.strong = band.strong;
    if (band.weak > p.weak) p.weak = band.weak;
    if (band.ms > p.ms) p.ms = band.ms;
    return true;
  }

  /**
   * 帧末结账：有攒下的请求就合成一次下令。
   *
   * `dt` 要传**真实时间**（`rawDt`）：马达是物理设备，命中停顿把那 120 毫秒拉成半秒
   * 不是"慢动作手感"，而是震到玩家手麻。返回值 = 这一帧是否真的下过一次令。
   */
  update(dt) {
    this.held.left = Math.max(0, this.held.left - (dt > 0 ? dt * 1000 : 0));
    const p = this.pending;
    if (!p.any) return false;
    const running = this.held.left > 0;
    const covered = running
      && this.held.strong >= p.strong && this.held.weak >= p.weak && this.held.left >= p.ms;
    const out = this.pulse;
    // 攒下的账无论如何都要清：这一帧没下令是"已经被盖过"，不是"下一帧再补发"
    p.any = false;
    const reqStrong = p.strong;
    const reqWeak = p.weak;
    const reqMs = p.ms;
    p.strong = 0;
    p.weak = 0;
    p.ms = 0;
    if (!this.enabled || covered) {
      this.dropped += 1;
      return false;
    }
    out.strong = running ? Math.max(reqStrong, this.held.strong) : reqStrong;
    out.weak = running ? Math.max(reqWeak, this.held.weak) : reqWeak;
    // 时长取"新请求"与"还剩的那段"里更长的一边：短的那次不许把正在跑的截断
    out.ms = Math.max(reqMs, running ? this.held.left : 0);
    if (this.send(out) !== true) {
      this.failed += 1;
      return false;
    }
    this.pulses += 1;
    this.held.strong = out.strong;
    this.held.weak = out.weak;
    this.held.left = out.ms;
    return true;
  }
}
