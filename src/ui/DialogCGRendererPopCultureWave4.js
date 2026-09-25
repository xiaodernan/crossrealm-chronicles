/** Wave4 致敬层的**程序绘制**（W-B1 切片1）。
 *
 *  这里原本还有一张 `REST_DIALOGUE_CG_POP_WAVE4`（5 条预设），实测**全仓无人引用**，
 *  且与 `REST_DIALOGUE_CG_POP` 最后 5 条逐字相同 —— 第二真源 + 死代码，本切片删掉。
 *  真正被用上的是下面这几个 painter（由 `attachPopCultureCgRenderer` 装进渲染器）。
 */
/** Wave4 CG preset + painters */

export function attachWave4CgPainters(extraPainters) {

  extraPainters.cyber_alley = paintCyberAlley;

  extraPainters.samurai_torii = paintSamuraiTorii;

  extraPainters.cosmic_obelisk = paintCosmicObelisk;

  extraPainters.starport_cantina = paintStarportCantina;

  extraPainters.wave4_grid = paintWave4Grid;

}



function grad(ctx, w, h, c1, c2) {

  const g = ctx.createLinearGradient(0, 0, 0, h);

  g.addColorStop(0, c1);

  g.addColorStop(1, c2);

  ctx.fillStyle = g;

  ctx.fillRect(0, 0, w, h);

}



function paintCyberAlley(ctx, w, h, accent) {

  grad(ctx, w, h, '#0a0818', '#180820');

  ctx.fillStyle = accent;

  ctx.fillRect(w * 0.2, h * 0.4, w * 0.6, h * 0.08);

}



function paintSamuraiTorii(ctx, w, h, accent) {

  grad(ctx, w, h, '#1a1008', '#281810');

  ctx.fillStyle = accent;

  ctx.fillRect(w * 0.25, h * 0.35, w * 0.5, h * 0.04);

  ctx.fillRect(w * 0.28, h * 0.35, w * 0.04, h * 0.25);

  ctx.fillRect(w * 0.68, h * 0.35, w * 0.04, h * 0.25);

}



function paintCosmicObelisk(ctx, w, h, accent) {

  grad(ctx, w, h, '#050808', '#0a1010');

  ctx.fillStyle = accent;

  ctx.fillRect(w * 0.46, h * 0.2, w * 0.08, h * 0.5);

}



function paintStarportCantina(ctx, w, h, accent) {

  grad(ctx, w, h, '#101018', '#181820');

  ctx.fillStyle = accent;

  ctx.beginPath();

  ctx.arc(w * 0.5, h * 0.55, 70, Math.PI, 0);

  ctx.fill();

}



function paintWave4Grid(ctx, w, h, accent) {

  grad(ctx, w, h, '#1a1520', '#0a0810');

  [accent, '#ff22aa', '#cc3322', '#224433', '#ffaa44'].forEach((c, i) => {

    ctx.fillStyle = c;

    ctx.globalAlpha = 0.5;

    ctx.fillRect(w * 0.15 + i * (w * 0.14), h * 0.3, w * 0.1, h * 0.35);

  });

  ctx.globalAlpha = 1;

}


