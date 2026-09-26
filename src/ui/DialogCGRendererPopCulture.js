/** 致敬层 CG 的**程序绘制**（W-B1 切片1）。
 *
 *  预设表 `REST_DIALOGUE_CG_POP` 已搬到 `content/dialogueCgPresets.js`：
 *  它与绘制混住时，`game/CgGalleryRegistry.js` 要枚举全部 CG 就得 import 本文件，
 *  于是形成 `chunk-core → chunk-ui` 回边（B37）。数据与绘制分家之后这里只管画。
 */
import { attachWave4CgPainters } from './DialogCGRendererPopCultureWave4.js';
import { keyText } from '../content/keyHints.js';

export function attachPopCultureCgRenderer(renderer) {
  const extraPainters = {
    wizard_school: (ctx, w, h, accent) => paintWizardSchool(ctx, w, h, accent, renderer),
    broom_ring: (ctx, w, h, accent) => paintBroomRing(ctx, w, h, accent, renderer),
    murphy_shelf: (ctx, w, h, accent) => paintMurphyShelf(ctx, w, h, accent, renderer),
    upside_down: (ctx, w, h, accent) => paintUpsideDown(ctx, w, h, accent, renderer),
    radio_tower: (ctx, w, h, accent) => paintRadioTower(ctx, w, h, accent, renderer),
    one_ring: (ctx, w, h, accent) => paintOneRing(ctx, w, h, accent, renderer),
    poster_wall: (ctx, w, h, accent) => paintPosterWall(ctx, w, h, accent, renderer),
    nine_platform: (ctx, w, h, accent) => paintNinePlatform(ctx, w, h, accent),
    patronus_lake: (ctx, w, h, accent) => paintPatronusLake(ctx, w, h, accent),
    wormhole_arch: (ctx, w, h, accent) => paintWormholeArch(ctx, w, h, accent),
    arcade_cab: (ctx, w, h, accent) => paintArcadeCab(ctx, w, h, accent),
    vecna_clock: (ctx, w, h, accent) => paintVecnaClock(ctx, w, h, accent),
    western_saloon: (ctx, w, h, accent) => paintWesternSaloon(ctx, w, h, accent),
    duel_noon: (ctx, w, h, accent) => paintDuelNoon(ctx, w, h, accent),
    noir_speakeasy: (ctx, w, h, accent) => paintNoirSpeakeasy(ctx, w, h, accent),
    scifi_dome: (ctx, w, h, accent) => paintScifiDome(ctx, w, h, accent),
    jump_gate: (ctx, w, h, accent) => paintJumpGate(ctx, w, h, accent),
    triad_poster: (ctx, w, h, accent) => paintTriadPoster(ctx, w, h, accent),
  };
  attachWave4CgPainters(extraPainters);

  const orig = renderer.render.bind(renderer);
  renderer.render = function popCultureRender(restId, nodeId, accent, mood) {
    const preset = this.getPreset(restId, nodeId);
    if (extraPainters[preset.scene]) {
      const key = `${restId}:${nodeId}:${accent}:${mood}:${preset.scene}`;
      this._syncKeyStamp();
      if (this.cache.has(key)) return this.cache.get(key);
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      ctx.clearRect(0, 0, w, h);
      extraPainters[preset.scene](ctx, w, h, accent);
      if (mood === 'warn') {
        ctx.fillStyle = 'rgba(255,60,40,0.12)';
        ctx.fillRect(0, 0, w, h);
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
    return orig(restId, nodeId, accent, mood);
  };
}

function grad(ctx, w, h, c1, c2) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function paintWizardSchool(ctx, w, h, accent, r) {
  r._paintMagicCastle(ctx, w, h, accent);
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = `rgba(255,220,120,${0.2 + Math.random() * 0.4})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, h * 0.3 + Math.random() * h * 0.4, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintBroomRing(ctx, w, h, accent) {
  grad(ctx, w, h, '#1a1030', '#0a0818');
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * (0.35 + i * 0.12), 80 - i * 15, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function paintMurphyShelf(ctx, w, h, accent) {
  grad(ctx, w, h, '#0a1020', '#1a2030');
  ctx.fillStyle = '#4a3520';
  for (let i = 0; i < 4; i++) ctx.fillRect(w * 0.3, h * 0.25 + i * 40, w * 0.4, 6);
  ctx.fillStyle = accent;
  ctx.font = 'italic 28px serif';
  ctx.fillText('Stay', w * 0.38, h * 0.55);
}

function paintUpsideDown(ctx, w, h) {
  grad(ctx, w, h, '#1a0810', '#0a0408');
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(200,40,60,${Math.random() * 0.35})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(80,0,20,0.5)';
  ctx.fillRect(w * 0.35, 0, w * 0.3, h);
}

function paintRadioTower(ctx, w, h, accent) {
  grad(ctx, w, h, '#151520', '#0a0a12');
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.85);
  ctx.lineTo(w * 0.5, h * 0.2);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.18);
  ctx.lineTo(w * 0.58, h * 0.28);
  ctx.lineTo(w * 0.42, h * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff2244';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.15, 6, 0, Math.PI * 2);
  ctx.fill();
}

function paintOneRing(ctx, w, h, accent) {
  grad(ctx, w, h, '#2a3a28', '#1a2018');
  ctx.strokeStyle = accent;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.45, 55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(201,169,98,0.35)';
  ctx.font = '12px serif';
  ctx.fillText('One Realm to bind them all', w * 0.28, h * 0.62);
}

function paintPosterWall(ctx, w, h, accent) {
  grad(ctx, w, h, '#1a1520', '#0a0810');
  const cols = [accent, '#66ccff', '#cc2244', '#88aa66', '#ff2244', '#c9a962'];
  cols.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(w * 0.15 + i * (w * 0.12), h * 0.3, w * 0.08, h * 0.35);
  });
  ctx.globalAlpha = 1;
}

function paintNinePlatform(ctx, w, h, accent) {
  grad(ctx, w, h, '#1a1008', '#0a0804');
  ctx.fillStyle = '#884422';
  ctx.fillRect(w * 0.35, h * 0.35, w * 0.3, h * 0.35);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.42, w * 0.08, Math.PI, 0);
  ctx.stroke();
}

function paintPatronusLake(ctx, w, h, accent) {
  grad(ctx, w, h, '#0a1020', '#102030');
  ctx.fillStyle = 'rgba(40,80,120,0.5)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.55, w * 0.35, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(w * 0.48, h * 0.5);
  ctx.lineTo(w * 0.52, h * 0.45);
  ctx.lineTo(w * 0.56, h * 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function paintWormholeArch(ctx, w, h, accent) {
  grad(ctx, w, h, '#050510', '#0a0a20');
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.45, 70, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(100,150,255,0.15)';
  ctx.fill();
}

function paintArcadeCab(ctx, w, h, accent) {
  grad(ctx, w, h, '#0a1210', '#051008');
  ctx.fillStyle = '#224433';
  ctx.fillRect(w * 0.42, h * 0.35, w * 0.16, h * 0.35);
  ctx.fillStyle = accent;
  ctx.fillRect(w * 0.44, h * 0.38, w * 0.12, h * 0.15);
}

function paintVecnaClock(ctx, w, h, accent) {
  grad(ctx, w, h, '#150808', '#0a0404');
  ctx.fillStyle = '#443333';
  ctx.fillRect(w * 0.46, h * 0.25, w * 0.08, h * 0.4);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.32, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.32);
  ctx.lineTo(w * 0.5, h * 0.28);
  ctx.stroke();
}

function paintWesternSaloon(ctx, w, h, accent) {
  grad(ctx, w, h, '#2a1810', '#1a1008');
  ctx.fillStyle = '#6a4433';
  ctx.fillRect(w * 0.3, h * 0.35, w * 0.4, h * 0.3);
  ctx.fillStyle = accent;
  ctx.fillRect(w * 0.46, h * 0.38, w * 0.08, h * 0.2);
}

function paintDuelNoon(ctx, w, h, accent) {
  grad(ctx, w, h, '#4a4020', '#2a2010');
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.55, 60, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,220,120,0.3)';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.15, 40, 0, Math.PI * 2);
  ctx.fill();
}

function paintNoirSpeakeasy(ctx, w, h, accent) {
  grad(ctx, w, h, '#0a0408', '#150810');
  ctx.fillStyle = '#221118';
  ctx.fillRect(w * 0.42, h * 0.35, w * 0.16, h * 0.35);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(w * 0.44, h * 0.5, w * 0.12, h * 0.02);
  ctx.globalAlpha = 1;
}

function paintScifiDome(ctx, w, h, accent) {
  grad(ctx, w, h, '#050810', '#0a1520');
  ctx.fillStyle = 'rgba(50,100,140,0.4)';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.55, 80, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function paintJumpGate(ctx, w, h, accent) {
  grad(ctx, w, h, '#050510', '#0a0a20');
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(w * 0.5 + i * 70, h * 0.45, 35, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function paintTriadPoster(ctx, w, h, accent) {
  grad(ctx, w, h, '#1a1520', '#0a0810');
  [accent, '#cc8844', '#661122', '#4488ff'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(w * 0.2 + i * (w * 0.14), h * 0.3, w * 0.1, h * 0.35);
  });
  ctx.globalAlpha = 1;
}
