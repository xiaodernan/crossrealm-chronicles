/**
 * 在场心跳（W-Z26「星图微光」）：本机游侠每隔几秒续一次命，服务端 Set/TTL 才能看见你还在。
 *
 * 计时走 Game 的 update(dt) 轴（不自建 setInterval——B39；页面暂停/切后台时 dt 不动，
 * 心跳自然停发，游侠自动掉线，这本身就是 presence 的语义）。
 * 只在 `onlineServices.enabled()` 时候发；失败永远吞掉（在线服务什么时候不可用，
 * 不该影响本地打 Boss）。
 */
import { onlineServices } from './OnlineServices.js';
import { presenceTracker, resolvePresenceId, PRESENCE_CHANNEL } from './presenceTracker.js';

const BEAT_INTERVAL_S = 5;
const WORLD_EXTENT = 900;   // 与世界坐标系的归一化口径（x/z ∈ [-1,1]），>900 就贴边
const DEFAULT_HUE = 38;     // 锚火金（本作唯一视觉母题色）

export class PresenceBeat {
  constructor(game) {
    this.game = game;
    this.id = resolvePresenceId();
    this.name = `ranger-${this.id.slice(0, 6)}`;
    this._tick = 0;
    // 提前一拍触发（建联即续）：本次页面内第一跳不必等 5 秒，否则别人看不到你出场
    this._tick = BEAT_INTERVAL_S;
  }

  _normalizedPosition() {
    const p = this.game?.player?.position;
    if (!p) return { x: 0, z: 0 };
    const clamp = (v) => {
      if (!Number.isFinite(v)) return 0;
      return Math.max(-1, Math.min(1, v / WORLD_EXTENT));
    };
    return { x: clamp(p.x), z: clamp(p.z) };
  }

  /** 收编清理：复位自身计时；SSE 单例一同停掉（新开一局时 Game 重启会 start 回来） */
  dispose() {
    this._tick = 0;
    presenceTracker.stop();
  }

  async update(dt) {
    this._tick += dt;
    if (this._tick < BEAT_INTERVAL_S) return;
    this._tick = 0;
    if (!onlineServices.enabled()) return;
    const { x, z } = this._normalizedPosition();
    const ok = await onlineServices.postPresenceBeat({
      id: this.id,
      name: this.name,
      hue: DEFAULT_HUE,
      x,
      z,
      channel: PRESENCE_CHANNEL,
    });
    // 在线开关被玩家在面板里关掉时会自然静默（下一次 tick 就不发了）
    if (!ok) this._tick = BEAT_INTERVAL_S - 1; // 下一帧再试一次（不补发风暴）
  }
}
