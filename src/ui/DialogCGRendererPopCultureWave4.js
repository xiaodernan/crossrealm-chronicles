/** Wave4 致敬层的**程序绘制**（W-B1 切片1）。
 *
 *  这里原本还有一张 `REST_DIALOGUE_CG_POP_WAVE4`（5 条预设），实测**全仓无人引用**，
 *  且与 `REST_DIALOGUE_CG_POP` 最后 5 条逐字相同 —— 第二真源 + 死代码，本切片删掉。
 *  真正被用的是下面这几个 painter。
 *
 *  W-B4 切片1：它原本由 `attachWave4CgPainters(extraPainters)` 往调用方给的对象上**逐条赋值**
 *  （名单的形状要到运行时才知道，静态扫一遍读不出来）。现在交出的是一张导出的表，
 *  由致敬层那一批并进 `CG_PAINTERS`，撞名当场点名。
 */
/** Wave4 painters 名单 */

export const POP_CG_PAINTERS_WAVE4 = {

  cyber_alley: (r, ctx, w, h, accent) => paintCyberAlley(ctx, w, h, accent),

  samurai_torii: (r, ctx, w, h, accent) => paintSamuraiTorii(ctx, w, h, accent),

  cosmic_obelisk: (r, ctx, w, h, accent) => paintCosmicObelisk(ctx, w, h, accent),

  starport_cantina: (r, ctx, w, h, accent) => paintStarportCantina(ctx, w, h, accent),

  wave4_grid: (r, ctx, w, h, accent) => paintWave4Grid(ctx, w, h, accent),

};



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


