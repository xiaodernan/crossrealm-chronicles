import * as THREE from 'three';
import { CAMERA_BLEND } from '../content/tuning.js';
import { setDofEnabled, updateDofParams } from '../engine/DofPass.js';

/** 过场 DoF 档：焦点永远钉在 Boss 注视点，背景随距离全虚；fade 是首尾的淡入淡出坡长 */
const CINE_DOF = { maxblur: 0.85, fade: 0.5 };

const BOSS_CINEMATICS = {
  'shadow-warden': {
    title: '影界守护者',
    subtitle: '灰白森林 · 位面试炼 I',
    lines: '「踏入此域者，将承受影界之审判！」\n\n观察脚下红圈 · {parry} 弹反 · {skill} 位面斩',
    color: '#aa2222',
    duration: 5.5,
  },
  archmagus: {
    title: '大奥术师·萨尔林',
    subtitle: '霍格沃兹遗境 · 位面试炼 II',
    lines: '「奥术的本质，是吞噬一切位面的光。」\n\n躲避紫色法球 · 靠近弹反 · {spell1}–{spell4} 法术牵制',
    color: '#8844ff',
    duration: 6,
  },
  'singularity-herald': {
    title: '引力化身·奇点领主',
    subtitle: '米勒荒原 · 位面试炼 III',
    lines: '「引力从不询问许可——它只索取。」\n\n三阶段引力拉扯 · 轨道弹幕 · 蓄力法术破盾',
    color: '#4488ff',
    duration: 6.5,
  },
  'void-chronarch': {
    title: '时线执政官',
    subtitle: '破碎时线 · 隐藏试炼',
    lines: '「时间不是河流——是可被撕裂的布。」\n\nChapter 4 隐藏 Boss · 蓄力真火可打断时停',
    color: '#c9a962',
    duration: 5,
  },
  'chaos-overlord': {
    title: '混沌裂隙领主',
    subtitle: '混沌边境 · 终焉试炼',
    lines: '「四界归一，裂隙仍存——唯有斩裂混沌本身。」\n\n三阶段混沌脉冲 · 武器技能树加成 · {swapWeapon} 切换剑/杖',
    color: '#ff2244',
    duration: 6,
  },
  'dungeon-ruin-crypt': {
    title: '遗城守墓者',
    subtitle: '灰白遗城 · 迷宫守钥者',
    lines: '「我只保管门，不询问来者去向。」\n\n45% 血二阶段 · {lockOn} 锁定 · 清空后可 [{interact}] 离开',
    color: '#889977',
    duration: 4.5,
  },
  'dungeon-forbidden-library': {
    title: '禁书守页人',
    subtitle: '禁书图书馆 · 迷宫守钥者',
    lines: '「最后一页，不允许被读到。」',
    color: '#8866cc',
    duration: 4.5,
  },
  'dungeon-five-dim-rift': {
    title: '裂隙监工',
    subtitle: '五维裂隙 · 迷宫守钥者',
    lines: '「五维生物的投影 — 在此只有三维。」',
    color: '#4488cc',
    duration: 4.5,
  },
};

export class CinematicManager {
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

    window.addEventListener('boss-start', (e) => this.tryPlay(e.detail));
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

    document.getElementById('cine-title').textContent = cfg.title;
    document.getElementById('cine-subtitle').textContent = cfg.subtitle;
    document.getElementById('cine-title').style.color = cfg.color;
    this.letterbox.classList.remove('hidden');
    this.game.audio.bossRoar();
  }

  update(dt) {
    if (!this.active || !this.config) {
      // 幂等关灯：过场不在播就还灯，end 之外的任何退出路径都从这里兜住
      setDofEnabled(this.game.dofPass, false);
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

    // 过场 DoF：焦点钉在本帧注视点（_cineLook），模糊量首尾各留一个 fade 坡 ——
    // 进出过场时景深随镜头补间一起起落，不是一记硬切。
    // dofPass 缺席（旧 save / 无后处理档位）时两个调用都在 pass 判空里自熄。
    setDofEnabled(this.game.dofPass, true);
    const edge = Math.min(this.timer, this.config.duration - this.timer, CINE_DOF.fade)
      / CINE_DOF.fade;
    updateDofParams(this.game.dofPass, {
      focus: this._cinePos.distanceTo(this._cineLook),
      maxblur: CINE_DOF.maxblur * Math.max(edge, 0),
    });

    if (this.phase === 'title' && this.timer > 2.2) {
      this.phase = 'dialog';
      this.game.dialog.show(this.config.title, this.config.lines);
    }

    if (this.timer >= this.config.duration) {
      this.end();
    }
  }

  end() {
    this.active = false;
    this.game.cinematicActive = false;
    // 过场收尾当场还灯，不等下一帧的兜底
    setDofEnabled(this.game.dofPass, false);
    this.letterbox.classList.add('hidden');
    if (this.game.dialog.open) this.game.dialog.hide?.();
    window.dispatchEvent(new CustomEvent('cinematic-end'));
  }

  skip() {
    if (this.active) this.end();
  }
}
