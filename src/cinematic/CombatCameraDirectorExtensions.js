/** 扩写：为 CombatCameraDirector 挂载 skip() — 不改动原文件主体 */
import { FOV_LAYER_OVERRIDE } from '../engine/CameraRig.js';
import { cancelDof } from '../engine/DofManager.js';

export function attachCombatCameraSkip(director, game) {
  director.skip = function skip() {
    if (!this.active && performance.now() >= (this.blocksInputUntil ?? 0)) return;

    this.active = false;
    this.timer = this.duration;
    this._timeScale = 1;
    this.blocksInputUntil = 0;

    // 跳过也是退出路径：DoF 请求必须一起撤，否则灯停在演出的模糊量上永远不关
    // （淡出时长与正常播完同一条：preset 的 fadeOut 由 DofManager 记账）
    cancelDof();

    if (game.player) game.player.timeSlow = 1;

    this.label?.classList.add('hidden');
    this.letterbox?.classList.add('hidden');
    this.vignette?.classList.add('hidden');
    this.flash && (this.flash.style.opacity = '0');

    // 跳过是一条退出路径：偏移当场收回，不指望玩家相机的下一帧
    game.player?.rig?.revokeFov(FOV_LAYER_OVERRIDE);

    game.combatInputLock?.release?.();
    this._cooldown = 0.15;
    window.dispatchEvent(new CustomEvent('combat-camera-skipped'));
  };
}
