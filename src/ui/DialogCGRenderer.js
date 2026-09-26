import { REST_DIALOGUE_CG } from '../content/dialogueCgPresets.js';
import { keyText, keyStamp } from '../content/keyHints.js';

/** 营火对话 CG — 节点 id → 场景预设（程序绘制 + 可选图片） */


/** 程序 CG 绘制 — Canvas 2D 场景插画 */
export class DialogCGRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 360;
    this.ctx = this.canvas.getContext('2d');
    this.cache = new Map();
  }

  getKey(restId, nodeId) {
    return `${restId}:${nodeId}`;
  }

  getPreset(restId, nodeId) {
    return REST_DIALOGUE_CG[this.getKey(restId, nodeId)] ?? REST_DIALOGUE_CG[`${restId}:start`] ?? { scene: 'anchor_fire', caption: '' };
  }

  /**
   * 键名轮次一变就丢掉全部缓存图（W-B2 切片5）。
   *
   * 图上写着的键名（`{escape} 跳过`、战斗教学那两格）是**画进像素里的**：缓存键里没有键名，
   * 改绑之后只让 `keyText` 改口，界面上看到的就是"表已经换了、图里还写着 Esc" ——
   * 而那一句玩家在 DOM 里读不到，改绑测试也抓不到。两条绘制路径（本文件与致敬层那一条）都先过这里。
   */
  _syncKeyStamp() {
    const stamp = keyStamp();
    if (stamp !== this._keyStamp) {
      this.cache.clear();
      this._keyStamp = stamp;
    }
    return stamp;
  }

  render(restId, nodeId, accent = '#c9a962', mood = 'calm') {
    const key = `${restId}:${nodeId}:${accent}:${mood}`;
    this._syncKeyStamp();
    if (this.cache.has(key)) return this.cache.get(key);

    const preset = this.getPreset(restId, nodeId);
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const painters = {
      anchor_fire: () => this._paintAnchorFire(ctx, w, h, accent),
      forest_camp: () => this._paintForestCamp(ctx, w, h, accent),
      forest_map: () => this._paintForestMap(ctx, w, h, accent),
      magic_castle: () => this._paintMagicCastle(ctx, w, h, accent),
      space_endurance: () => this._paintSpaceEndurance(ctx, w, h, accent),
      gravity_well: () => this._paintGravityWell(ctx, w, h, accent),
      void_time: () => this._paintVoidTime(ctx, w, h, accent),
      time_stop: () => this._paintTimeStop(ctx, w, h, accent),
      chaos_border: () => this._paintChaosBorder(ctx, w, h, accent),
      boss_shadow: () => this._paintBossSilhouette(ctx, w, h, '#aa2222'),
      boss_mage: () => this._paintBossSilhouette(ctx, w, h, '#8844ff'),
      boss_singularity: () => this._paintBossSilhouette(ctx, w, h, '#4488ff'),
      boss_chaos: () => this._paintBossSilhouette(ctx, w, h, '#ff2244'),
      hidden_boss: () => this._paintHiddenBoss(ctx, w, h, accent),
      execution_art: () => this._paintExecution(ctx, w, h, accent),
      combat_tutorial: () => this._paintCombatTutorial(ctx, w, h, accent),
      quest_scroll: () => this._paintQuestScroll(ctx, w, h, accent),
      walker_silhouette: () => this._paintWalker(ctx, w, h, accent),
      spell_orbs: () => this._paintSpellOrbs(ctx, w, h, accent),
      final_gate: () => this._paintFinalGate(ctx, w, h, accent),
    };

    (painters[preset.scene] ?? painters.anchor_fire)();

    if (mood === 'warn') {
      ctx.fillStyle = 'rgba(255,60,40,0.12)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,100,60,0.45)';
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, w - 16, h - 16);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h - 52, w, 52);
    ctx.fillStyle = accent;
    ctx.font = '600 22px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillText(keyText(preset.caption ?? ''), 24, h - 18);

    const url = this.canvas.toDataURL('image/jpeg', 0.88);
    this.cache.set(key, url);
    return url;
  }

  _grad(ctx, w, h, c1, c2) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  _paintAnchorFire(ctx, w, h, accent) {
    this._grad(ctx, w, h, '#1a1520', '#0a0810');
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(255,${140 + Math.random() * 80},60,${Math.random() * 0.35})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, h * 0.55 + Math.random() * h * 0.35, 1 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(w * 0.48, h * 0.72);
    ctx.quadraticCurveTo(w * 0.5, h * 0.35, w * 0.52, h * 0.72);
    ctx.fill();
    ctx.fillStyle = 'rgba(201,169,98,0.25)';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.78, 80, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _paintForestCamp(ctx, w, h, accent) {
    this._grad(ctx, w, h, '#2a3a30', '#1a2018');
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = '#1a2820';
      ctx.beginPath();
      ctx.moveTo(i * 60 - 20, h);
      ctx.lineTo(i * 60 + 10, h * 0.35);
      ctx.lineTo(i * 60 + 40, h);
      ctx.fill();
    }
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(w * 0.55, h * 0.68, 28, 0, Math.PI * 2);
    ctx.fill();
  }

  _paintForestMap(ctx, w, h, accent) {
    this._paintForestCamp(ctx, w, h, accent);
    ctx.strokeStyle = 'rgba(170,100,255,0.6)';
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(w * 0.15, h * 0.2, w * 0.35, h * 0.45);
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.45, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  _paintMagicCastle(ctx, w, h, accent) {
    this._grad(ctx, w, h, '#1a1030', '#2a1848');
    ctx.fillStyle = 'rgba(136,102,204,0.35)';
    ctx.fillRect(w * 0.25, h * 0.25, w * 0.5, h * 0.45);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.15);
    ctx.lineTo(w * 0.72, h * 0.55);
    ctx.lineTo(w * 0.28, h * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(170,102,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.72, w * 0.22, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _paintSpaceEndurance(ctx, w, h, accent) {
    this._grad(ctx, w, h, '#050810', '#101828');
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.6})`;
      ctx.fillRect(Math.random() * w, Math.random() * h * 0.6, 1.5, 1.5);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.35, h * 0.55, w * 0.3, h * 0.18);
    ctx.fillStyle = 'rgba(136,204,255,0.4)';
    ctx.fillRect(w * 0.42, h * 0.62, w * 0.16, h * 0.06);
  }

  _paintGravityWell(ctx, w, h, accent) {
    this._paintSpaceEndurance(ctx, w, h, accent);
    const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 10, w * 0.5, h * 0.5, 140);
    g.addColorStop(0, 'rgba(68,136,255,0.5)');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  _paintVoidTime(ctx, w, h, accent) {
    this._grad(ctx, w, h, '#181410', '#2a2418');
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.5, 40 + i * 18, 20 + i * 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _paintTimeStop(ctx, w, h, accent) {
    this._paintVoidTime(ctx, w, h, accent);
    ctx.fillStyle = 'rgba(255,220,120,0.35)';
    ctx.font = '48px serif';
    ctx.fillText('⏸', w * 0.46, h * 0.52);
  }

  _paintChaosBorder(ctx, w, h, accent) {
    this._grad(ctx, w, h, '#180810', '#280818');
    ctx.strokeStyle = '#ff2244';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(0, h * 0.3 + i * 40);
      ctx.lineTo(w, h * 0.25 + i * 45);
      ctx.stroke();
    }
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.7, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  _paintBossSilhouette(ctx, w, h, color) {
    this._grad(ctx, w, h, '#0a0810', '#1a1020');
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.42, 55, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(w * 0.42, h * 0.42, w * 0.16, h * 0.28);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.55, 120, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _paintHiddenBoss(ctx, w, h, accent) {
    this._paintVoidTime(ctx, w, h, accent);
    ctx.fillStyle = '#c9a962';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('?', w * 0.47, h * 0.48);
  }

  _paintExecution(ctx, w, h, accent) {
    this._grad(ctx, w, h, '#100808', '#201010');
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w * 0.35, h * 0.25);
    ctx.lineTo(w * 0.65, h * 0.75);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,200,80,0.3)';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, 90, 0, Math.PI * 2);
    ctx.fill();
  }

  _paintCombatTutorial(ctx, w, h, accent) {
    this._paintForestCamp(ctx, w, h, accent);
    ctx.fillStyle = '#ffdd88';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(keyText('{parry} 弹反'), w * 0.12, h * 0.35);
    ctx.fillText(keyText('{lockOn} 锁定'), w * 0.62, h * 0.35);
  }

  _paintQuestScroll(ctx, w, h, accent) {
    this._grad(ctx, w, h, '#1a1810', '#2a2418');
    ctx.fillStyle = '#e8e0c8';
    ctx.fillRect(w * 0.2, h * 0.18, w * 0.6, h * 0.55);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.2, h * 0.18, w * 0.6, h * 0.55);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(80,70,50,0.35)';
      ctx.fillRect(w * 0.26, h * 0.28 + i * 32, w * 0.48, 8);
    }
  }

  _paintWalker(ctx, w, h, accent) {
    this._paintAnchorFire(ctx, w, h, accent);
    ctx.fillStyle = 'rgba(200,180,120,0.7)';
    ctx.fillRect(w * 0.44, h * 0.38, w * 0.12, h * 0.32);
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.32, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  _paintSpellOrbs(ctx, w, h, accent) {
    this._paintMagicCastle(ctx, w, h, accent);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(170,102,255,${0.4 + i * 0.08})`;
      ctx.beginPath();
      ctx.arc(w * 0.2 + i * 80, h * 0.35 + Math.sin(i) * 20, 14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _paintFinalGate(ctx, w, h, accent) {
    this._paintChaosBorder(ctx, w, h, accent);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 5;
    ctx.strokeRect(w * 0.38, h * 0.28, w * 0.24, h * 0.42);
  }
}
