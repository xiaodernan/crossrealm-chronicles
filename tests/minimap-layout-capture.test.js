/**
 * 玩家可见缺陷①：HUD 小地图"缩成一团 / 看不清"（切片A：把尺寸真源交还给盒子）。
 *
 * ## 根因（逐处读源码核出来的，不是猜的）
 *
 * `src/style.css` 里"铺满视口"那条规则的选择器原来是**裸 `canvas`**。W-D2 之后页面里
 * 不止一块画布（`#minimap` / `#world-map-canvas` / CG 的离屏画布），于是那条
 * `position:fixed; inset:0; width/height:100% !important` 把它们**一并抓走**：`!important`
 * 压过 `#minimap { width:180px }` 的非重要声明，而 `#minimap-wrap` 上有 `backdrop-filter`
 * ⇒ 它自己就是 fixed 后代的包含块，那个盒子只有标题那么高 ⇒ 玩家看到的"缩成一团"
 * 是一条约 180×24 的横条。世界地图面板那块canvas同一条规则受害（铺满整个视口）。
 *
 * 另一半"看不清"是**画的时候**：`drawMinimap()` 自己抄了一份 220 而盒子是 180 ⇒ 浏览器
 * 把位图缩到 0.82 倍 ⇒ 网格线和 7–9px 的字一起糊；而且 `canvas.width` **每帧都写**
 * （写它等于清屏 + 重新分配位图），也从不按 `devicePixelRatio` 放大。跨度还写死成
 * 0.135 像素/米 —— 把 ±320 米整个世界塞进 180 个像素（要 2370 才装得下）。
 *
 * ## 门禁两层
 *
 * - 静态：样式里不许再有裸 `canvas` 选择器（每一种写法都查）、`.gl-canvas` 确实带着那三条、
 *   `Game.js` 真的挂了这个名字、`#minimap` 只能是"跟着盒子走"的 100% + aspect-ratio、
 *   HUD 那个"量不到时退回"的常数由样式里的宽度和边框**算**出来。
 * - 行为：跑**在役的那个方法**（`HUD.prototype.drawMinimap`），从画布桩子读回位图尺寸与
 *   `setTransform` 的实参，核对"位图 = 盒子 × DPR""第二帧不重写位图""半径 = 米 × 由跨度
 *   反推的 scale""内容真的铺满盒子、也真的不出盒子"。
 *
 * 每条静态腿都配一臂"这条也咬得住"：把旧写法贴回一份副本，判据必须转红 —— 因为
 * 解析式门禁最常见的假绿是**匹配不到任何东西**，于是"没有 X"永远成立。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HUD, MINIMAP_CSS_SIZE, RADAR_WINDOW_M, minimapSize, minimapFont } from '../src/ui/HUD.js';
import { MAP_SPAN_M, ExplorationMap } from '../src/game/ExplorationMap.js';
import { MAP_BOSSES } from '../src/game/QuestSystem.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const readSrc = (rel) => readFileSync(join(SRC, rel), 'utf8');
const readRoot = (rel) => readFileSync(join(SRC, '..', rel), 'utf8');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 取某条规则的花括号体（`#minimap` 这种整选择器精确匹配，不做子串认领） */
function blockOf(css, selector) {
  const body = stripComments(css);
  const m = body.match(new RegExp(esc(selector) + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : null;
}

/** 每条规则的"选择器段"（含 @ 规则的前导），注释已剥掉 */
function selectorsOf(css) {
  const body = stripComments(css);
  const out = [];
  const re = /([^{}]+)\{/g;
  let m;
  while ((m = re.exec(body))) out.push(m[1].trim());
  return out;
}

/** 裸元素选择器 `canvas`：前面是行首/空白/组合符/逗号/括号，后面不接单词字符或连字符 */
const BARE_CANVAS = /(?:^|[\s>+~,(|])canvas(?![\w-])/;
const hasBareCanvasSelector = (css) => selectorsOf(css).some((sel) => BARE_CANVAS.test(sel));

describe('样式那一条只认 .gl-canvas（缺陷①的因）', () => {
  it('src/style.css 里没有任何裸 canvas 选择器（每一种写法都查）', () => {
    const css = readSrc('style.css');
    expect(selectorsOf(css).length, '选择器一条都没解析出来：门禁在空转').toBeGreaterThan(20);
    const culprits = selectorsOf(css).filter((sel) => BARE_CANVAS.test(sel));
    expect(culprits, '裸 canvas 选择器会把 HUD 的每块画布都铺满视口：' + culprits.join(' | ')).toEqual([]);
  });

  it('.gl-canvas 真的带着铺满视口那三条，且只由它带', () => {
    const css = readSrc('style.css');
    const block = blockOf(css, '.gl-canvas');
    expect(block, '找不到 .gl-canvas 规则').toBeTruthy();
    expect(block).toMatch(/position:\s*fixed/);
    expect(block).toMatch(/inset:\s*0/);
    expect(block).toMatch(/width:\s*100%\s*!important/);
    expect(block).toMatch(/height:\s*100%\s*!important/);
  });

  it('Game.js 确实把这个名字挂到 WebGL 画布上（规则得有主体，否则整条是死代码）', () => {
    const game = readSrc('core/Game.js');
    expect(game, 'WebGL 画布不再认领 .gl-canvas ⇒ 铺满视口这件事没人负责').toContain("classList.add('gl-canvas')");
    expect(game).toMatch(/appendChild\(this\.renderer\.domElement\)/);
  });

  it('页面里确实有两块 HUD 画布，而 wrap 就是那块 fixed 画布的包含块（缺陷成立的前提）', () => {
    const html = stripComments(readRoot('index.html'));
    expect((html.match(/<canvas\b/g) ?? []).length, '画布数量变了：这条门禁的口径要重算').toBe(2);
    expect(html).toMatch(/<canvas id="minimap"><\/canvas>/);
    expect(html).toMatch(/<canvas id="world-map-canvas"><\/canvas>/);
    const wrap = blockOf(readSrc('style.css'), '#minimap-wrap');
    expect(wrap, '找不到 #minimap-wrap 规则').toBeTruthy();
    expect(wrap, 'wrap 上没有滤镜 ⇒ "它自己就是 fixed 后代的包含块"这条推理要重写').toMatch(/backdrop-filter/);
  });

  it('#minimap 只能让盒子说话：width:100% + aspect-ratio，不许写死像素', () => {
    const css = readSrc('style.css');
    const block = blockOf(css, '#minimap');
    expect(block, '找不到 #minimap 规则').toBeTruthy();
    expect(block).toMatch(/width:\s*100%/);
    expect(block).toMatch(/aspect-ratio:\s*1\s*\/\s*1/);
    expect(block, '写死像素就等于重新制造两份真源（样式一份、位图一份）').not.toMatch(/\d+px/);
  });

  it('退路常数是样式算出来的：wrap 宽度 − 左右各一道边框（全站 border-box 是前提）', () => {
    const css = stripComments(readSrc('style.css'));
    const star = blockOf(css, '*');
    expect(star, '找不到全站盒模型那一格：下面这条算式的前提没了').toBeTruthy();
    expect(star).toMatch(/box-sizing:\s*border-box/);
    const wrap = blockOf(css, '#minimap-wrap');
    expect(wrap, '找不到 #minimap-wrap 规则').toBeTruthy();
    const width = Number(wrap.match(/width:\s*([\d.]+)px/)[1]);
    const border = Number(wrap.match(/border:\s*([\d.]+)px/)[1]);
    expect(MINIMAP_CSS_SIZE, `退路边长应等于 ${width} − 2×${border}`).toBe(width - 2 * border);
  });

  it('这条也咬得住：把裸 canvas 与写死像素贴回副本，两条判据当场转红（自证）', () => {
    const css = readSrc('style.css');
    const smuggled = css.replace('.gl-canvas {', 'canvas {');
    expect(smuggled, '锚点没命中：那条规则的写法变了').not.toBe(css);
    expect(hasBareCanvasSelector(css), '现写法本该没有裸 canvas').toBe(false);
    expect(hasBareCanvasSelector(smuggled), '贴回裸 canvas 没被抓到').toBe(true);
    const hardCoded = blockOf(css.replace(/#minimap\s*\{[^}]*\}/, '#minimap {\n  width: 180px;\n  height: 180px;\n}'), '#minimap');
    expect(hardCoded).toMatch(/\d+px/);
  });
});

/** 带"位图写入次数"账本的画布桩：`canvas.width = …` 是清屏 + 重新分配，次数就是要查的东西 */
function fakeMinimapCanvas({ clientWidth, dpr = 1 }) {
  const transformCalls = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    fillText() {}, fillRect() {}, strokeRect() {}, clearRect() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    arc() {}, setLineDash() {},
    setTransform: (...a) => transformCalls.push(a),
  };
  let widthWrites = 0;
  const canvas = {
    clientWidth,
    _w: 0, _h: 0,
    get width() { return this._w; },
    set width(v) { widthWrites += 1; this._w = v; },
    get height() { return this._h; },
    set height(v) { this._h = v; },
    getContext: () => ctx,
  };
  const hud = Object.create(HUD.prototype);
  hud.minimapVisible = true;
  hud.minimapCanvas = canvas;
  hud.game = minimapStub();
  const frame = () => {
    const prev = globalThis.window.devicePixelRatio;
    globalThis.window.devicePixelRatio = dpr;
    try {
      hud.drawMinimap();
    } finally {
      if (prev === undefined) delete globalThis.window.devicePixelRatio;
      else globalThis.window.devicePixelRatio = prev;
    }
  };
  return { canvas, ctx, frame, transformCalls, writes: () => widthWrites };
}

/** 小地图世界那一支要问的游戏桩：名册空、无 waypoint、玩家在原点 */
function minimapStub() {
  return {
    dungeons: { active: null },
    world: { getZoneMapData: () => [] },
    quests: { getQuestWaypoint: () => null },
    player: { position: { x: 0, z: 0 } },
    autoPlayMode: false,
    playerAutoPlay: { active: false },
  };
}

describe('drawMinimap 量盒子画位图（缺陷①的果）', () => {
  afterEach(() => {
    delete globalThis.window.devicePixelRatio;
  });

  it('1× 屏：位图边长 = 量到的盒子边长，transform 不放大', () => {
    const m = fakeMinimapCanvas({ clientWidth: 178, dpr: 1 });
    m.frame();
    expect(m.transformCalls.length, '一帧都没设 transform：这条在空转').toBe(1);
    expect(m.transformCalls[0]).toEqual([1, 0, 0, 1, 0, 0]);
    expect(m.canvas.width).toBe(178);
    expect(m.canvas.height).toBe(178);
  });

  it('2× 屏：位图按 DPR 放大到 356，并用 setTransform(2) 把坐标系摆回来', () => {
    const m = fakeMinimapCanvas({ clientWidth: 178, dpr: 2 });
    m.frame();
    expect(m.canvas.width, '1 CSS px 对 1 个真实像素 ⇒ 字发虚，正是"看不清"的那一半').toBe(356);
    expect(m.canvas.height).toBe(356);
    expect(m.transformCalls).toEqual([[2, 0, 0, 2, 0, 0]]);
  });

  it('DPR 超过 2 时封顶在 2，与 WebGL 那条 setPixelRatio(min(dpr,2)) 同一口径', () => {
    const m = fakeMinimapCanvas({ clientWidth: 178, dpr: 4 });
    m.frame();
    expect(m.canvas.width).toBe(356);
    expect(m.transformCalls).toEqual([[2, 0, 0, 2, 0, 0]]);
  });

  it('尺寸没变时第二帧不再写 canvas.width（写它 = 清屏 + 重新分配位图）', () => {
    const m = fakeMinimapCanvas({ clientWidth: 178, dpr: 1 });
    m.frame();
    expect(m.writes(), '第一帧就该分配一次位图').toBe(1);
    m.frame();
    m.frame();
    expect(m.writes(), '每帧重写位图 = 每帧重新分配 + 清屏').toBe(1);
    expect(m.transformCalls.length, '每帧仍要重设坐标系').toBe(3);
  });

  it('量不到布局时退回样式里那个常数，而不是退回旧的 220', () => {
    const m = fakeMinimapCanvas({ clientWidth: 0, dpr: 1 });
    m.frame();
    expect(m.canvas.width).toBe(MINIMAP_CSS_SIZE);
    expect(m.canvas.width).not.toBe(220);
  });

  it('跨度只有一个真源：小地图与 ExplorationMap 的格子同一张纸', () => {
    const grid = new ExplorationMap({}).getGridSize();
    expect(MAP_SPAN_M, 'MAP_SPAN_M 不再等于格子跨度：两张图各画各的世界了').toBe(grid.max - grid.min);
    expect(readSrc('ui/HUD.js'), '手抄的像素/米又回来了').not.toMatch(/const scale = 0\.135/);
    expect(RADAR_WINDOW_M * 3, '雷达窗口不再从 MAP_SPAN_M 推：两张图又各画各的了').toBeCloseTo(MAP_SPAN_M, 6);
  });
});

/**
 * 雷达世界那一支的录笔桩：arc / fillText / stroke 全录，颜色在落笔那一刻盖章
 * （`arc()` 在 `fillStyle` 之前落笔，只有 `fill()` 时读色才作数）。
 */
function drawRadar(overrides = {}) {
  const arcs = [];
  const texts = [];
  const strokes = [];
  const transformCalls = [];
  let pending = null;
  let pendingStroke = null;
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    fillRect() {}, strokeRect() {}, clearRect() {},
    beginPath() { pending = null; pendingStroke = null; }, closePath() {},
    moveTo(x, y) { pendingStroke = { pts: [[x, y]] }; },
    lineTo(x, y) { pendingStroke?.pts.push([x, y]); },
    stroke() { if (pendingStroke) { strokes.push({ pts: pendingStroke.pts, strokeStyle: ctx.strokeStyle }); pendingStroke = null; } },
    arc: (x, y, r) => { pending = { x, y, r }; },
    fill() { if (pending) arcs.push({ ...pending, fillStyle: ctx.fillStyle }); pending = null; },
    fillText(text, x, y) { texts.push({ text: String(text), x, y, font: ctx.font, fillStyle: ctx.fillStyle }); },
    setLineDash() {},
    setTransform: (...a) => transformCalls.push(a),
  };
  const canvas = { clientWidth: 178, width: 0, height: 0, getContext: () => ctx };
  const hud = Object.create(HUD.prototype);
  hud.minimapVisible = true;
  hud.minimapCanvas = canvas;
  hud.game = { ...minimapStub(), ...overrides };
  hud.drawMinimap();
  return { arcs, texts, strokes, transformCalls };
}

describe('小地图真的是一张雷达（玩家居中 · 界外钳边 · 字号按边长推）', () => {
  const CSS = 178;
  const scale = CSS / RADAR_WINDOW_M;

  it('玩家居中：区圆 = 盒心 +（区心 − 玩家）× scale，半径 = 区半径 × scale（不是桩子空转）', () => {
    const { arcs, transformCalls } = drawRadar({
      player: { position: { x: 40, z: -60 } },
      world: { getZoneMapData: () => [{ center: { x: 0, z: 0 }, radius: 100, color: '#ff0000' }] },
    });
    expect(transformCalls.length, '这一帧没落笔：桩子空转').toBe(1);
    const zoneCircle = arcs.find((a) => a.fillStyle === '#ff000055');
    expect(zoneCircle, '区域圆没画出来').toBeTruthy();
    expect(zoneCircle.x, '区圆没跟着玩家挪：雷达没居中').toBeCloseTo(89 + (0 - 40) * scale, 6);
    expect(zoneCircle.y).toBeCloseTo(89 + (0 - (-60)) * scale, 6);
    expect(zoneCircle.r).toBeCloseTo(100 * scale, 6);
  });

  it('区圆在区心溢出窗口：站进区里，你看得见"自己站在区里"（120 米圆 > 半窗）', () => {
    expect(120 * scale, '区圆比半窗还小 ⇒ 站在区心却看不出自己在区里').toBeGreaterThan(CSS / 2);
    expect(CSS / RADAR_WINDOW_M, '本地细节 = 整世界口径（0.278）的 3 倍').toBeCloseTo((CSS / MAP_SPAN_M) * 3, 6);
  });

  it('界外钳边：玩家在世界角落，画出的 Boss 短名全在盒内（同向的让位合并是设计）', () => {
    const { texts } = drawRadar({ player: { position: { x: 300, z: 300 } } });
    expect(MAP_BOSSES.length, 'Boss 名册是空的：这条在空转').toBeGreaterThan(0);
    const shorts = texts.filter((tx) => /^B\d$/.test(tx.text));
    expect(shorts.length, '一枚短名都没画：钳边那支空转').toBeGreaterThan(0);
    const 出盒 = shorts.filter((tx) => tx.x < 0 || tx.x > CSS || tx.y < 0 || tx.y > CSS);
    expect(出盒.map((tx) => `${tx.text}@${tx.x.toFixed(1)},${tx.y.toFixed(1)}`), '钳边失效：方向标跑出盒了').toEqual([]);
  });

  it('字号按边长推：三档 9/8/7 全部来自 minimapFont，手抄字面量绝迹', () => {
    const { texts } = drawRadar({});
    const boss = texts.find((tx) => tx.text === 'B1');
    expect(boss, 'Boss 短名没画出来（原点距离 ' + Math.hypot(-35, -200).toFixed(0) + 'm 应在窗内）').toBeTruthy();
    expect(boss.font, 'Boss 短名字号没走 mark 档').toBe(minimapFont(CSS, 'mark'));
    expect(minimapSize(CSS, 'mark'), 'mark 档该还原成 8px').toBe(8);
    expect(minimapSize(CSS, 'zone'), 'zone 档该还原成 9px').toBe(9);
    expect(minimapSize(CSS, 'poi'), 'poi 档该还原成 7px').toBe(7);
    expect(readSrc('ui/HUD.js').match(/'\d+px sans-serif'/g), '手抄的字号字面量又回来了').toBeNull();
  });

  it('区名沉浮：窗口内的区名浮着，窗口外的沉掉（雷达管脚下）', () => {
    const 在原点 = drawRadar({});
    expect(在原点.texts.some((tx) => tx.text === '枢纽'), '窗内（55m）的枢纽区名该浮着').toBe(true);
    expect(在原点.texts.some((tx) => tx.text === '混沌'), '窗外（297m）的区名该沉掉').toBe(false);
    const 在角落 = drawRadar({ player: { position: { x: 300, z: 300 } } });
    expect(在角落.texts.some((tx) => tx.text === '枢纽'), '玩家挪走后原地标签还挂着').toBe(false);
  });

  it('朝向须：玩家 yaw 的前进向量画成了中心点外的短须（针尖指哪 = 人朝哪）', () => {
    const { strokes } = drawRadar({ player: { position: { x: 0, z: 0 }, yaw: Math.PI / 2 } });
    const fx = Math.sin(Math.PI / 2);
    const fz = Math.cos(Math.PI / 2);
    const tip = strokes.find((s) => s.pts.length === 2
      && Math.abs(s.pts[0][0] - (89 + fx * 5)) < 1e-6
      && Math.abs(s.pts[0][1] - (89 + fz * 5)) < 1e-6
      && Math.abs(s.pts[1][0] - (89 + fx * 11)) < 1e-6
      && Math.abs(s.pts[1][1] - (89 + fz * 11)) < 1e-6);
    expect(tip, '朝向须没画出来（或方向错了）').toBeTruthy();
  });

  it('路点：界内画到脚边，界外钳到窗缘（half − 6），虚线从玩家出发', () => {
    const 近 = drawRadar({ quests: { getQuestWaypoint: () => ({ x: 100, z: 0 }) } });
    const 近线 = 近.strokes.find((s) => s.pts.length === 2
      && Math.abs(s.pts[0][0] - 89) < 1e-6 && Math.abs(s.pts[0][1] - 89) < 1e-6);
    expect(近线, '界内路点的虚线没从玩家出发').toBeTruthy();
    expect(近线.pts[1][0], '界内路点该画在真实位置').toBeCloseTo(89 + 100 * scale, 6);
    const 远 = drawRadar({ quests: { getQuestWaypoint: () => ({ x: 1000, z: 0 }) } });
    const 远线 = 远.strokes.find((s) => s.pts.length === 2
      && Math.abs(s.pts[0][0] - 89) < 1e-6 && Math.abs(s.pts[0][1] - 89) < 1e-6);
    expect(远线, '界外路点的虚线没画').toBeTruthy();
    expect(远线.pts[1][0], '界外路点该钳在窗缘（half − 6）').toBeCloseTo(89 + (CSS / 2 - 6), 6);
  });

  it('标签去堆叠：重叠的低优先级让出文字，位置不重叠的照画（直接打 _flushLabels）', () => {
    const texts = [];
    const ctx = { fillStyle: '', font: '', fillText: (s, x, y) => texts.push(`${s}@${x},${y}`) };
    const hud = Object.create(HUD.prototype);
    const 重叠对 = [
      { x: 50, y: 50, text: '甲甲甲', tier: 'poi', color: '#000', priority: 1 },
      { x: 52, y: 49, text: '乙乙', tier: 'poi', color: '#000', priority: 0 },
    ];
    hud._flushLabels(ctx, [...重叠对], 178);
    expect(texts, '高优先级（0）的乙该活，低优先级的甲该让').toEqual(['乙乙@52,49']);
    texts.length = 0;
    hud._flushLabels(ctx, [{ x: 50, y: 50, text: '甲甲甲', tier: 'poi', color: '#000', priority: 1 },
      { x: 120, y: 80, text: '乙乙', tier: 'poi', color: '#000', priority: 0 }]);
    expect(texts.sort(), '不重叠的两份都该活着').toEqual(['乙乙@120,80', '甲甲甲@50,50']);
    texts.length = 0;
    hud._flushLabels(ctx, [...重叠对].reverse(), 178);
    expect(texts, '只打乱入列顺序：幸存者不变（按优先级定，不按运气）').toEqual(['乙乙@52,49']);
  });
});
