import * as THREE from 'three';
import { CAMERA_BLEND, DOF_PRESETS } from '../content/tuning.js';
import { requestDof, cancelDof } from '../engine/DofManager.js';

import { on, offAll } from '../engine/EventBus.js';
import { t } from '../engine/i18n.js';

const CINEMATIC_CINEMATICMANAGER = 'cinematic/CinematicManager';
const cineOn = (name, handler) => on(name, handler, CINEMATIC_CINEMATICMANAGER);

/**
 * Boss 过场文案表（W-D2 切片17：值全部是**文案键**，中英两表各住一份）。
 *
 * `title` 刻意**不新起键**：五只世界 Boss 直接指向名册的 `nameKey`
 * （`boss_name_*`），三只副本守钥者指向图鉴标题键（`boss_lore_*_title`）——
 * "它叫什么"仍然只有一个出处（`tests/boss-name-consistency.test.js` 同帧核对）。
 * `subtitle` / `lines` 是本表独有的两句，新登记 `cine_sub_*` / `cine_lines_*`。
 *
 * `lines` 里的 `{parry}` / `{lockOn}` 等占位符仍旧在 `Dialog.show` 里由
 * `keyText()` 展开（键位改绑时过场文案跟着变），这里只负责 `t()` 换语言。
 */
export const BOSS_CINEMATICS = {
  'shadow-warden': {
    title: 'boss_name_shadow',
    subtitle: 'cine_sub_shadow',
    lines: 'cine_lines_shadow',
    color: '#aa2222',
    duration: 5.5,
  },
  archmagus: {
    title: 'boss_name_mage',
    subtitle: 'cine_sub_mage',
    lines: 'cine_lines_mage',
    color: '#8844ff',
    duration: 6,
  },
  'singularity-herald': {
    title: 'boss_name_singularity',
    subtitle: 'cine_sub_singularity',
    lines: 'cine_lines_singularity',
    color: '#4488ff',
    duration: 6.5,
  },
  'void-chronarch': {
    title: 'boss_name_void',
    subtitle: 'cine_sub_void',
    lines: 'cine_lines_void',
    color: '#c9a962',
    duration: 5,
  },
  'chaos-overlord': {
    title: 'boss_name_chaos',
    subtitle: 'cine_sub_chaos',
    lines: 'cine_lines_chaos',
    color: '#ff2244',
    duration: 6,
  },
  'dungeon-ruin-crypt': {
    title: 'boss_lore_ruin_crypt_title',
    subtitle: 'cine_sub_ruin_crypt',
    lines: 'cine_lines_ruin_crypt',
    color: '#889977',
    duration: 4.5,
  },
  'dungeon-forbidden-library': {
    title: 'boss_lore_forbidden_library_title',
    subtitle: 'cine_sub_forbidden_library',
    lines: 'cine_lines_forbidden_library',
    color: '#8866cc',
    duration: 4.5,
  },
  'dungeon-five-dim-rift': {
    title: 'boss_lore_five_dim_rift_title',
    subtitle: 'cine_sub_five_dim_rift',
    lines: 'cine_lines_five_dim_rift',
    color: '#4488cc',
    duration: 4.5,
  },
};

export class CinematicManager {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第七处） */
  dispose() {
    offAll(CINEMATIC_CINEMATICMANAGER);
  }

  constructor(game) {
    this.game = game;
    this.active = false;
    this.timer = 0;
    this.config = null;
    this.bossPos = new THREE.Vector3();
    /** 过场机位的两个复用向量（rig 只读不写回，复用是安全的） */
    this._cinePos = new THREE.Vector3();
    this._cineLook = new THREE.Vector3();
    this.orbitAngle = 0;
    this.phase = 'intro';
    this.seen = new Set();

    this.letterbox = document.createElement('div');
    this.letterbox.id = 'cinematic-letterbox';
    this.letterbox.className = 'cinematic-letterbox hidden';
    this.letterbox.innerHTML = `
      <div class="cine-bar cine-top"></div>
      <div class="cine-bar cine-bottom"></div>
      <div class="cine-title-wrap">
        <div class="cine-title" id="cine-title"></div>
        <div class="cine-subtitle" id="cine-subtitle"></div>
      </div>
    `;
    document.body.appendChild(this.letterbox);

    cineOn('boss-start', (e) => this.tryPlay(e.detail));
  }

  tryPlay(detail) {
    const id = detail.bossId;
    if (!id || this.seen.has(id) || this.active) return;
    const cfg = BOSS_CINEMATICS[id];
    if (!cfg) return;

    this.seen.add(id);
    this.config = cfg;
    this.bossPos.copy(detail.position ?? this.game.player.position);
    this.active = true;
    this.timer = 0;
    this.phase = 'title';
    this.orbitAngle = 0;
    this.game.cinematicActive = true;
    document.exitPointerLock?.();

    document.getElementById('cine-title').textContent = t(cfg.title);
    document.getElementById('cine-subtitle').textContent = t(cfg.subtitle);
    document.getElementById('cine-title').style.color = cfg.color;
    this.letterbox.classList.remove('hidden');
    this.game.audio.bossRoar();
  }

  update(dt) {
    if (!this.active || !this.config) {
      // 无需手动关灯：DofManager 发现无请求时自动关闭（幂等、零遗漏）
      return;
    }

    this.timer += dt;
    this.orbitAngle += dt * 0.9;

    const boss = this.bossPos;
    const dist = 14 + Math.sin(this.orbitAngle * 0.5) * 2;
    const height = 5 + Math.sin(this.orbitAngle) * 1.5;
    /* 过场也走同一台 rig：以前这里直接搬 game.camera，玩家相机的平滑与 FOV 栈全然不知情，
     * 进出过场的那一两帧因此是"两处写入"的现场。
     * 认领 owner='cinematic'：进入的那一帧（owner 从 player 翻过来）rig 自动从当前画面补间到
     * 绕轨机位；过场期间 owner 不变，每帧直接落笔跟随。end() 什么都不用做——玩家下一帧重新
     * 认领时 rig 会自己补回来（短板 A4 的硬切就是这么消掉的）。 */
    this.game.player.rig
      .setView(
        this._cinePos.set(
          boss.x + Math.sin(this.orbitAngle) * dist,
          boss.y + height,
          boss.z + Math.cos(this.orbitAngle) * dist
        ),
        this._cineLook.set(boss.x, boss.y + 2.5, boss.z),
        { owner: 'cinematic', transition: CAMERA_BLEND.enter }
      );

    // 相位先切、再按相位声明这一帧的 DoF：反过来的话，切到 dialog 的那一帧还在请求
    // cinematicIntro，中段的满模糊整整晚一帧才起步。
    if (this.phase === 'title' && this.timer > 2.2) {
      this.phase = 'dialog';
      this.game.dialog.show(t(this.config.title), t(this.config.lines));
    }

    // 过场 DoF：使用预设表驱动，按 phase 自动切换淡入/保持/淡出 ——
    // title: cinematicIntro (弱模糊、快淡入) → dialog: cinematicMid (满模糊) → 结束: cinematicOutro (长淡出)
    const focus = this._cinePos.distanceTo(this._cineLook);
    if (this.phase === 'title') {
      requestDof({ preset: 'cinematicIntro', focus });
    } else if (this.phase === 'dialog') {
      requestDof({ preset: 'cinematicMid', focus });
    }

    if (this.timer >= this.config.duration) {
      this.end();
    }
  }

  end() {
    if (!this.active) return;
    this.active = false;
    this.game.cinematicActive = false;
    /* 过场收尾：按 cinematicOutro 的长 fadeOut 从当前模糊量退到 0，再由 DofManager 关灯。
     * 以前这里把 cinematicOutro 当普通预请求（向 0.30 淡入并永远 hold），灯就再也关不掉了。 */
    cancelDof(DOF_PRESETS.cinematicOutro.fadeOut);
    this.letterbox.classList.add('hidden');
    if (this.game.dialog.open) this.game.dialog.hide?.();
    window.dispatchEvent(new CustomEvent('cinematic-end'));
  }

  skip() {
    if (this.active) this.end();
  }
}
