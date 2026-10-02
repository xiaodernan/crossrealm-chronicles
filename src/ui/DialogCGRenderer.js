import { REST_DIALOGUE_CG } from '../content/dialogueCgPresets.js';
import { keyText, keyStamp } from '../content/keyHints.js';
import { POP_CG_PAINTERS } from './DialogCGRendererPopCulture.js';

/** 营火对话 CG — 节点 id → 场景预设（程序绘制 + 可选图片） */

/**
 * 默认配色。全仓只此一处（W-B4 切片1）。
 *
 * 改前这句话在四个文件里各抄一遍（`RestDialogue` 两处、画廊目录一处、`Dialog` 两处），
 * 而它们抄的是**世界之锚看守那一座的配色** —— 于是"认不出说话人"在界面上表现成
 * "说话人戴着锚火看守的金边"。现在说话人的配色只从 `REST_NPC_DEFS` 取，
 * 取不到就没有 CG（见 `render` 返回 null），这一份只在调用方压根没给配色时兜底。
 */
export const CG_DEFAULT_ACCENT = '#c9a962';

/**
 * 场景名 → 绘制者。签名统一为 `(renderer, ctx, w, h, accent)`。
 *
 * 原先这个名单每次 `render` 新建一遍（20 个闭包），更要紧的是**没有别处能读出"有哪些场景可画"**：
 * 预设表里写一个没有绘制者的 `scene` 时，改前的代码 `?? painters.anchor_fire` —— 不报错，
 * 玩家看到的是世界之锚的那团火，而画廊与对话框都照常收下这张图。名单导出之后，
 * `tests/dialogue-cg-pairing.test.js` 能逐预设问一句"这个场景有人画吗"。
 */
export const CG_PAINTERS = {
  anchor_fire: (r, ctx, w, h, accent) => r._paintAnchorFire(ctx, w, h, accent),
  forest_camp: (r, ctx, w, h, accent) => r._paintForestCamp(ctx, w, h, accent),
  forest_map: (r, ctx, w, h, accent) => r._paintForestMap(ctx, w, h, accent),
  magic_castle: (r, ctx, w, h, accent) => r._paintMagicCastle(ctx, w, h, accent),
  space_endurance: (r, ctx, w, h, accent) => r._paintSpaceEndurance(ctx, w, h, accent),
  gravity_well: (r, ctx, w, h, accent) => r._paintGravityWell(ctx, w, h, accent),
  void_time: (r, ctx, w, h, accent) => r._paintVoidTime(ctx, w, h, accent),
  time_stop: (r, ctx, w, h, accent) => r._paintTimeStop(ctx, w, h, accent),
  chaos_border: (r, ctx, w, h, accent) => r._paintChaosBorder(ctx, w, h, accent),
  boss_shadow: (r, ctx, w, h) => r._paintBossSilhouette(ctx, w, h, '#aa2222'),
  boss_mage: (r, ctx, w, h) => r._paintBossSilhouette(ctx, w, h, '#8844ff'),
  boss_singularity: (r, ctx, w, h) => r._paintBossSilhouette(ctx, w, h, '#4488ff'),
  boss_chaos: (r, ctx, w, h) => r._paintBossSilhouette(ctx, w, h, '#ff2244'),
  hidden_boss: (r, ctx, w, h, accent) => r._paintHiddenBoss(ctx, w, h, accent),
  execution_art: (r, ctx, w, h, accent) => r._paintExecution(ctx, w, h, accent),
  combat_tutorial: (r, ctx, w, h, accent) => r._paintCombatTutorial(ctx, w, h, accent),
  quest_scroll: (r, ctx, w, h, accent) => r._paintQuestScroll(ctx, w, h, accent),
  walker_silhouette: (r, ctx, w, h, accent) => r._paintWalker(ctx, w, h, accent),
  spell_orbs: (r, ctx, w, h, accent) => r._paintSpellOrbs(ctx, w, h, accent),
  final_gate: (r, ctx, w, h, accent) => r._paintFinalGate(ctx, w, h, accent),
  /** W-B9 新增：幽暗林地场景 */
  misty_camp: (r, ctx, w, h, accent) => r._paintMistyCamp(ctx, w, h, accent),
  misty_map: (r, ctx, w, h, accent) => r._paintMistyMap(ctx, w, h, accent),
  gloom_wraith: (r, ctx, w, h, accent) => r._paintGloomWraith(ctx, w, h, accent),
  /** W-B9 新增：辉煌圣域场景 */
  golden_sands: (r, ctx, w, h, accent) => r._paintGoldenSands(ctx, w, h, accent),
  radiant_map: (r, ctx, w, h, accent) => r._paintRadiantMap(ctx, w, h, accent),
  radiant_knight: (r, ctx, w, h, accent) => r._paintRadiantKnight(ctx, w, h, accent),
};

/**
 * 致敬层并入同一张名单（W-B4 切片1：从"覆盖整个 `render`"改成"登记场景"）。
 *
 * 改前 `attachPopCultureCgRenderer` 把 `render` 整个换掉，于是同一套像素写了两遍 ——
 * 而致敬层那一份漏了 warn 的红边（只有满屏红罩子），基础层有。撞名也只会静默盖掉，
 * 这里当场点名：一个场景两家绘制者，玩家看到哪张取决于谁后注册。
 */
for (const [scene, paint] of Object.entries(POP_CG_PAINTERS)) {
  if (CG_PAINTERS[scene]) {
    throw new Error(`CG 场景「${scene}」有两家绘制者 —— 致敬层与基础层撞名，后到的那张静默盖掉前一张`);
  }
  CG_PAINTERS[scene] = paint;
}


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

  /**
   * 节点 → 预设。具体节点找不到时退回**同一座营火**的开场预设（13 个节点是刻意共用的），
   * 连营火都不认识就返回 null —— 改前这里是 `?? { scene: 'anchor_fire', caption: '' }`，
   * 任何陌生营火 id 都画成世界之锚那团火，而界面照常收下那张图。
   * `registry.js` 的 `checkDialogueCgPresets` 保证每棵树都有 `<营火>:start`，所以这里不会再退一层。
   */
  getPreset(restId, nodeId) {
    return REST_DIALOGUE_CG[this.getKey(restId, nodeId)] ?? REST_DIALOGUE_CG[`${restId}:start`] ?? null;
  }

  /**
   * 营火对话那一格该画的图。返回 null 表示"没有这张 CG"，调用方须把图位收起来 ——
   * 没有图是看得出来的缺，画成别人家的火是看不出来的错。
   */
  render(restId, nodeId, accent = CG_DEFAULT_ACCENT, mood = 'calm') {
    const preset = this.getPreset(restId, nodeId);
    if (!preset) return null;
    return this._paint(`${restId}:${nodeId}:${accent}:${mood}`, preset.scene, preset.caption, accent, mood);
  }

  /**
   * 画廊里不属于任何营火的行（Boss 击破、连击记忆）：目录那一行自己写着 `scene`，就按它画。
   *
   * 改前这里没有入口，`CgJournalTab` 只能拿 `entry.zone` 去冒充一个营火节点
   * —— 于是 `bonus:boss-shadow`（scene 写着 boss_shadow）画出来是灰林那顶帐篷。
   */
  renderScene(scene, caption, accent = CG_DEFAULT_ACCENT, mood = 'calm') {
    return this._paint(`scene:${scene}:${caption ?? ''}:${accent}:${mood}`, scene, caption, accent, mood);
  }

  /**
   * 键名轮次一变就丢掉全部缓存图（W-B2 切片5）。
   *
   * 图上写着的键名（`{escape} 跳过`、战斗教学那两格）是**画进像素里的**：缓存键里没有键名，
   * 改绑之后只让 `keyText` 改口，界面上看到的就是"表已经换了、图里还写着 Esc" ——
   * 而那一句玩家在 DOM 里读不到，改绑测试也抓不到。两条绘制路径（对话与画廊）都先过这里。
   */
  _syncKeyStamp() {
    const stamp = keyStamp();
    if (stamp !== this._keyStamp) {
      this.cache.clear();
      this._keyStamp = stamp;
    }
    return stamp;
  }

  _paint(key, scene, caption, accent, mood) {
    const paint = CG_PAINTERS[scene];
    if (!paint) return null;
    this._syncKeyStamp();
    if (this.cache.has(key)) return this.cache.get(key);

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    paint(this, ctx, w, h, accent);

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
    ctx.fillText(keyText(caption ?? ''), 24, h - 18);

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

  /** W-B9 新增：幽暗林地 */
  _paintMistyCamp(ctx, w, h, accent) {
    this._grad(ctx, w, h, '#1a1a2a', '#2a2a3a');
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(106,106,138,${0.08 + Math.random() * 0.12})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.6, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6a6a8a';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  _paintMistyMap(ctx, w, h, accent) {
    this._paintMistyCamp(ctx, w, h, accent);
    ctx.fillStyle = '#4a4a6a';
    ctx.font = '16px sans-serif';
    ctx.fillText('幽暗林地深处', w * 0.5, h * 0.25);
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.5);
    ctx.lineTo(w * 0.7, h * 0.7);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  _paintGloomWraith(ctx, w, h, accent) {
    this._paintMistyCamp(ctx, w, h, accent);
    ctx.fillStyle = '#5566aa';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.2);
    ctx.lineTo(w * 0.3, h * 0.6);
    ctx.lineTo(w * 0.7, h * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /** W-B9 新增：辉煌圣域 */
  _paintGoldenSands(ctx, w, h, accent) {
    this._grad(ctx, w, h, '#fff8d0', '#ffd700');
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255,215,0,${0.15 + Math.random() * 0.2})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.25);
    ctx.lineTo(w * 0.3, h * 0.65);
    ctx.lineTo(w * 0.7, h * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  _paintRadiantMap(ctx, w, h, accent) {
    this._paintGoldenSands(ctx, w, h, accent);
    ctx.fillStyle = '#ffaa00';
    ctx.font = '16px sans-serif';
    ctx.fillText('晨曦大门', w * 0.5, h * 0.2);
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, 40, -Math.PI * 0.6, -Math.PI * 1.4);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  _paintRadiantKnight(ctx, w, h, accent) {
    this._paintGoldenSands(ctx, w, h, accent);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(w * 0.35, h * 0.3, w * 0.3, h * 0.45);
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.25, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
