/**
 * W-C2 切片7（#164）：骨骼投射件的"位面归属 + 距离"投影门
 *
 * ## 这一片在修什么（切片6 的普查给的靶子）
 * 阴影趟普查读出来的唯一一笔意外是 `field:restNpcs.npcs(<别位面>)` ——
 * **玩家走不到的那些位面上的营火常驻 NPC** —— 它们占着阴影面里很可观的一成（逐站读数、
 * 以及切片7 修后"同一轮门开 / 门关"的反事实对账，都记在 `docs/MASTER_PLAN.md` 的 W-C2 条目里）。
 * 源码对得上：`RestNpcManager.build()` 开机就把八位面的 NPC 全建出来，
 * `RestNpcModel` 给身体 `applyShadow(body,'actor')`，此后**没有任何一关问它该不该投**。
 *
 * 省下的量按**投射件**计而不是按 NPC 名数计：`public/assets/models/rest/*.glb` 不在盘上时，
 * 每名兜底到 `Soldier.glb`，一个身体会带出好几个 `prop` 类投射件 —— 所以别拿"几绘 ÷ 几名"对账。
 *
 * ## 门为什么长这样（两条腿，一条都不能少）
 * - **同位面 ⇒ 永远投**：玩家就站在自己那面的营火旁，那名的影子不许被任何数值判据关掉。
 *   这一条是豁免，不是优化 —— 摘掉它，本站营火的 NPC 会在玩家贴着脸时失去影子。
 * - **跨位面 ⇒ 落进阴影框才投**：门限取**框半宽本身**（从光自己读，不抄第二份）。
 *   太阳几乎在头顶（`SUN_FOLLOW_OFFSET` 水平/垂直 = 0.67），两米高的件影子只偏移 1.3 米
 *   ⇒ 本体在框外的件，它的影子也在框外。
 *
 * ④ 的**行为腿真的驱动 `RestNpcManager.update()`**：判据不是只被喂过输入的纯函数，
 * 而是每帧真的落在树上、真的会翻转的那个东西。三条反向控制（甲/乙/丙）各自只坏在自己那一格。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as THREE from 'three';

import {
  DEFAULT_SHADOW_QUALITY,
  SHADOW_CLASSES,
  applyShadow,
  applyShadowCastGate,
  applySunShadowQuality,
  shadowFrameExtentOf,
  shouldCastShadow,
  sunShadowFrustumOf,
} from '../src/engine/shadowPolicy.js';
import { RestNpcManager } from '../src/world/RestNpcManager.js';
import { REST_NPC_DEFS } from '../src/content/restNpcDefs.js';
import { HUB_ZONE, ZONE_IDS, ZONE_ORDER } from '../src/content/ZoneIdentity.js';

const SRC = join(process.cwd(), 'src');

function srcFiles(dir = SRC, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) srcFiles(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
/** 剥掉注释：说明文字里提一嘴 `castShadow` 不该被算成一处赋值（"没扫到"≠"没有"） */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((ln) => { const i = ln.indexOf('//'); return i >= 0 ? ln.slice(0, i) : ln; }).join('\n');

/**
 * `RestNpcManager.update()` 的尾巴要碰 DOM（气泡投影读 `window.innerWidth`、往 `#hud` 挂气泡），
 * 而这里没有 jsdom —— 给最小替身，形状与 `tests/visual-world-clock.test.js` 同一份
 * （`?.appendChild` 本来就允许 HUD 缺席）。
 */
const 原window = globalThis.window;
const 原document = globalThis.document;
beforeAll(() => {
  globalThis.window = {
    innerWidth: 1280, innerHeight: 720,
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  };
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({ className: '', dataset: {}, style: {}, textContent: '', classList: { add() {}, remove() {} } }),
  };
});
afterAll(() => {
  globalThis.window = 原window;
  globalThis.document = 原document;
});

/** 一棵子树里**真的在投影**的网格件数（影影视锥与图层都在这一扇门之外，这里只问门落下的那个标记） */
function 投影件数(root) {
  let n = 0;
  root.traverse((o) => { if (o.isMesh && o.castShadow === true) n += 1; });
  return n;
}

describe('① 判据：同位面永远投，跨位面看距离', () => {
  const 框 = sunShadowFrustumOf(DEFAULT_SHADOW_QUALITY);   // 出厂档 = 140

  it('同位面赢过距离 —— 哪怕远在框外几千米', () => {
    expect(shouldCastShadow({ distance: 0, sameZone: true, extent: 框 })).toBe(true);
    expect(shouldCastShadow({ distance: 框, sameZone: true, extent: 框 })).toBe(true);
    expect(shouldCastShadow({ distance: 1e6, sameZone: true, extent: 框 }),
      '豁免是保险丝：玩家贴着脸的那一名，不许被任何数值判据关掉').toBe(true);
  });

  it('跨位面：框内投、框外不投，边界取等（<= 而不是 <）', () => {
    expect(shouldCastShadow({ distance: 1, sameZone: false, extent: 框 })).toBe(true);
    expect(shouldCastShadow({ distance: 框 - 1, sameZone: false, extent: 框 })).toBe(true);
    expect(shouldCastShadow({ distance: 框, sameZone: false, extent: 框 }), '正好压在框边那一格').toBe(true);
    expect(shouldCastShadow({ distance: 框 + 1, sameZone: false, extent: 框 })).toBe(false);
    // 距离由营火坐标表自己算，不抄一份测量：`world/RestPointManager.js` 的 buildDefaults
    const 距 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const hub = [0, 55];
    const fantasy = [-200, 0];
    const space = [200, 80];
    const gloom = [180, 100];
    expect(shouldCastShadow({ distance: 距(hub, fantasy), sameZone: false, extent: 框 }),
      '营火表里 hub↔fantasy 相距约 207 米，远在框外 ⇒ 站在 hub 时它那一名必被关掉').toBe(false);
    // 反向：营火表里**确有**两位面的营火挨得比框半宽还近（space↔gloom 只有约 28 米）。
    // 门不是"别位面一律关"：这一对若被关掉，玩家站在 space 就看不见隔壁 gloom 那名的影子。
    expect(距(space, gloom), 'space↔gloom 这两座营火确实落在框内').toBeLessThan(框);
    expect(shouldCastShadow({ distance: 距(space, gloom), sameZone: false, extent: 框 }),
      '跨位面但框内 ⇒ 照投（这一格正是探针在 space 站看见的：被关的名单里没有 gloom）').toBe(true);
  });

  it('量不到就抛，不许当成"关掉"', () => {
    // `NaN <= 框半宽` 永远是 false：静默走下去就是"影子莫名其妙没了，而没有任何一句话说过量不到"
    for (const 坏 of [NaN, Infinity, -Infinity, undefined, null, '120']) {
      expect(() => shouldCastShadow({ distance: 坏, sameZone: false, extent: 框 }),
        `距离收到 ${String(坏)} 必须抛`).toThrow(/不是有限数/);
    }
    for (const 坏 of [NaN, 0, -140, undefined]) {
      expect(() => shouldCastShadow({ distance: 5, sameZone: false, extent: 坏 }),
        `框半宽收到 ${String(坏)} 必须抛`).toThrow(/不是正有限数/);
    }
    // 抛的话术要说清是哪一路（两条腿的坏值下场不同，混成一句就没法定位）
    expect(() => shouldCastShadow({ distance: NaN, sameZone: false, extent: 框 })).toThrow(/关投影/);
  });
});

describe('② 门限来自光自己（不是第二份真相）', () => {
  it('三档画质各读各的框：降档之后门限跟着收小', () => {
    const 读到 = {};
    for (const 档 of [1024, 2048, DEFAULT_SHADOW_QUALITY]) {
      const 光 = new THREE.DirectionalLight();
      applySunShadowQuality(光, 档);
      读到[档] = shadowFrameExtentOf(光);
      expect(读到[档], `${档} 档的门限`).toBe(sunShadowFrustumOf(档));
    }
    // 三档互不相同 —— 这一句是下面那条反向控制的前提：写死任何一档都会红掉另两档
    expect(new Set(Object.values(读到)).size).toBe(3);
  });

  it('反向控制甲：门限写死成出厂档的话，低/中两档当场对不上', () => {
    const 写死 = sunShadowFrustumOf(DEFAULT_SHADOW_QUALITY);      // 假设有人抄了一份常量
    for (const 档 of [1024, 2048]) {
      const 光 = new THREE.DirectionalLight();
      applySunShadowQuality(光, 档);
      expect(shadowFrameExtentOf(光)).not.toBe(写死);
      expect(写死, `写死的 ${写死} 对 ${档} 档过大：门变成摆设`).toBeGreaterThan(shadowFrameExtentOf(光));
    }
  });

  it('没有光（或光还没长出影框）才回落到出厂档', () => {
    const 出厂 = sunShadowFrustumOf(DEFAULT_SHADOW_QUALITY);
    expect(shadowFrameExtentOf(undefined)).toBe(出厂);
    expect(shadowFrameExtentOf(null)).toBe(出厂);
    expect(shadowFrameExtentOf({})).toBe(出厂);
    expect(shadowFrameExtentOf({ shadow: {} })).toBe(出厂);
    expect(shadowFrameExtentOf({ shadow: { camera: { top: NaN } } })).toBe(出厂);
    expect(shadowFrameExtentOf({ shadow: { camera: { top: 0 } } }), '0 宽的框不是框').toBe(出厂);
  });

  it('读的就是 shadow.camera.top —— 写它的人改了，这里立刻跟着改', () => {
    const 光 = new THREE.DirectionalLight();
    applySunShadowQuality(光, DEFAULT_SHADOW_QUALITY);
    光.shadow.camera.top = 33;          // 模拟"别处改了框"（生产里唯一的写者是 applySunShadowQuality）
    expect(shadowFrameExtentOf(光)).toBe(33);
  });
});

describe('③ 落门：只关不点、还原各件原值、只在翻转时改过', () => {
  it('关掉的只是原本就投影的那些件；开回来的还是各自的原值', () => {
    const 组 = new THREE.Group();
    const 身 = applyShadow(new THREE.Mesh(new THREE.SphereGeometry(1)), 'actor');     // 投、不接
    const 地 = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)), 'ground');  // 不投、接
    组.add(身, 地);
    expect(投影件数(组)).toBe(1);

    const 关 = applyShadowCastGate(组, false);
    expect(关.改过).toBe(true);
    expect([身.castShadow, 地.castShadow], '关的时候两边都不投').toEqual([false, false]);
    expect(关.投影件数).toBe(0);

    const 开 = applyShadowCastGate(组, true);
    expect([身.castShadow, 地.castShadow], '各自回自己的类别值：地面件不许被门点亮').toEqual([true, false]);
    expect(开.投影件数).toBe(1);
    expect(地.receiveShadow, '这一层只管 cast，接收那半边归类别表').toBe(true);
  });

  it('重复落同一个判定 ⇒ 改过=false（热路径只在翻转时走树的依据）', () => {
    const 身 = applyShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1, 4, 6)), 'actor');
    expect(applyShadowCastGate(身, false).改过).toBe(true);
    expect(applyShadowCastGate(身, false).改过, '同一个判定第二次落，不该说"我改过了"').toBe(false);
    expect(applyShadowCastGate(身, true).改过).toBe(true);
    expect(applyShadowCastGate(身, true).改过).toBe(false);
  });

  it('后落地的件也认自己的原值：晚到不会被门点亮，也还得回来', () => {
    const 组 = new THREE.Group();
    组.add(applyShadow(new THREE.Mesh(new THREE.SphereGeometry(1)), 'actor'));
    applyShadowCastGate(组, false);
    const 晚 = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)), 'prop');
    const 晚地 = applyShadow(new THREE.Mesh(new THREE.PlaneGeometry(1, 1)), 'ground');   // 天生**不投**的那一类
    组.add(晚, 晚地);
    expect([晚.castShadow, 晚地.castShadow], '刚按类别落完：prop 投、ground 不投').toEqual([true, false]);
    applyShadowCastGate(组, false);
    expect(晚.castShadow, '门还关着 ⇒ 晚到的件跟着关').toBe(false);
    applyShadowCastGate(组, true);
    expect(晚.castShadow, '而它的原值是 prop=投 ⇒ 还回来就该是投').toBe(true);
    expect(晚地.castShadow, 'ground 的原值是**不投**：开门不许把它点亮').toBe(false);
  });

  it('非网格（灯 / 空 Group）不计数，也不炸', () => {
    const 组 = new THREE.Group();
    组.add(new THREE.PointLight(0xffffff, 1, 6));
    组.add(applyShadow(new THREE.Mesh(new THREE.SphereGeometry(1)), 'actor'));
    expect(applyShadowCastGate(组, false)).toEqual({ 改过: true, 投影件数: 0 });
    expect(applyShadowCastGate(null, false)).toEqual({ 改过: false, 投影件数: 0 });
    expect(applyShadowCastGate(undefined, true)).toEqual({ 改过: false, 投影件数: 0 });
  });
});

describe('④ 行为：营火 NPC 一族真的按位面与距离翻转', () => {
  /** 两名 NPC，位面 id 用真的两个（`hub` 与 `void`）；**坐标是夹具编的**（不抄世界布局）：
   * 一名在玩家这一面，另一名在 400 米外 —— 与普查里"别位面营火 200–300 米"同数量级。 */
  const 站 = { [ZONE_IDS.HUB]: new THREE.Vector3(0, 0, 0), [ZONE_IDS.VOID]: new THREE.Vector3(0, 0, 400) };

  function 造(位面) {
    const scene = new THREE.Scene();
    const 点 = Object.keys(站).map((id) => {
      const mesh = new THREE.Group();
      mesh.position.copy(站[id]);
      scene.add(mesh);
      return { id, position: 站[id].clone(), mesh };
    });
    const 光 = new THREE.DirectionalLight();
    applySunShadowQuality(光, DEFAULT_SHADOW_QUALITY);
    const world = {
      getGroundHeight: () => 0, zones: [], 所属: 位面,
      get zoneId() { return this.所属; },
    };
    // `dialog.open = true` 让"靠近就搭话"那一支（吃 Math.random）不掺进投影判定
    const mgr = new RestNpcManager(scene, world, { points: 点 }, { dialog: { toast() {}, open: true }, sun: 光 });
    return { mgr, 光, world };
  }
  const 那名 = (mgr, 面) => mgr.npcs.find((n) => n.id === 面);
  /** 走一帧，然后交回两名各自"仍在投影的件数" */
  function 走一步(mgr, 玩家位) {
    mgr.update(1 / 60, 玩家位);
    return { hub: 投影件数(那名(mgr, ZONE_IDS.HUB).mesh), void: 投影件数(那名(mgr, ZONE_IDS.VOID).mesh) };
  }
  /** 沿 X 把玩家摆到离某名 NPC 恰好 N 米（NPC 的世界位含 `def.offset`，所以从它自己的世界位起算） */
  function 摆在(mgr, 面, 距离) {
    const p = 那名(mgr, 面).mesh.getWorldPosition(new THREE.Vector3());
    return new THREE.Vector3(p.x + 距离, p.y, p.z);
  }

  it('NPC 的位面归属就是营火点的 id（营火与位面共用 id 那条规矩）', () => {
    const { mgr } = 造(ZONE_IDS.HUB);
    expect(mgr.npcs.map((n) => n.plane).sort()).toEqual([ZONE_IDS.HUB, ZONE_IDS.VOID].sort());
    for (const n of mgr.npcs) expect(n.plane, '归属取自 point.id，不是第二份名册').toBe(n.id);
  });

  it('兜底身体确实天生投影（门要关的东西是真的存在的）', () => {
    const { mgr } = 造(ZONE_IDS.HUB);
    for (const n of mgr.npcs) {
      expect(投影件数(n.mesh), `${n.id} 这名在门碰它之前有 ${SHADOW_CLASSES.actor.cast ? '1' : '0'} 件投影`)
        .toBeGreaterThan(0);
    }
  });

  it('站在 hub 营火旁：本站那名投，400 米外那名的影子关掉', () => {
    const { mgr } = 造(ZONE_IDS.HUB);
    const 读数 = 走一步(mgr, new THREE.Vector3(0, 0, 0));
    expect(读数.hub, '本站营火的 NPC 不许失去影子').toBeGreaterThan(0);
    expect(读数.void, '别位面那一名（void 营火在原点以北 200 米开外，远在框外）的影子由这一条关掉').toBe(0);
  });

  it('走近 ⇒ 恢复；走远 ⇒ 关掉（同一判据的两种相位各测一遍）', () => {
    const { mgr, 光 } = 造(ZONE_IDS.CORRIDOR);      // 走廊不属于任何位面 ⇒ 两名都只吃距离门
    const 框 = shadowFrameExtentOf(光);
    expect(走一步(mgr, 摆在(mgr, ZONE_IDS.VOID, 框 - 20)).void, `离 ${框 - 20} 米 ⇒ 框内`).toBeGreaterThan(0);
    expect(走一步(mgr, 摆在(mgr, ZONE_IDS.VOID, 框 + 20)).void, `离 ${框 + 20} 米 ⇒ 框外`).toBe(0);
    expect(走一步(mgr, 摆在(mgr, ZONE_IDS.VOID, 框)).void, '压在框边那一格').toBeGreaterThan(0);
    expect(走一步(mgr, 摆在(mgr, ZONE_IDS.VOID, 框 + 0.5)).void).toBe(0);
    expect(走一步(mgr, 摆在(mgr, ZONE_IDS.VOID, 5)).void, '走回来：关掉的影子必须真能长回去').toBeGreaterThan(0);
  });

  it('反向控制乙（摘掉豁免）：同位面而离营火 145 米这一格，只有豁免能让它还投', () => {
    const { mgr, 光, world } = 造(ZONE_IDS.HUB);
    const 框 = shadowFrameExtentOf(光);
    const 玩家 = 摆在(mgr, ZONE_IDS.HUB, 框 + 5);
    expect(走一步(mgr, 玩家).hub, '同位面 ⇒ 哪怕在框外也投（这就是豁免唯一被需要的形状）').toBeGreaterThan(0);
    // **只改归属，不改位置**：判据里那支 `sameZone` 被摘掉时，红的是这一条而不是上面任何一条
    world.所属 = ZONE_IDS.CORRIDOR;
    expect(走一步(mgr, 玩家).hub, '换成走廊 ⇒ 只剩距离门，框外就关').toBe(0);
  });

  it('反向控制丙（门恒真）：本站那名不许靠"永远开"蒙过这一片', () => {
    const { mgr } = 造(ZONE_IDS.HUB);
    // 判据恒真（`return true` 之类）在这条上露馅：400 米外、非同一名的那位必须有 0 件投影。
    // 恒假则由"走近 ⇒ 恢复"那条抓 —— 两条各盯一支，才不会一起绿着骗过去。
    expect(走一步(mgr, new THREE.Vector3(0, 0, 0)).void).toBe(0);
  });

  it('量不到玩家位置的那一帧：保持上一次判定，而不是关掉影子、也不炸主循环', () => {
    const { mgr } = 造(ZONE_IDS.HUB);
    走一步(mgr, new THREE.Vector3(0, 0, 0));
    const 起 = 投影件数(那名(mgr, ZONE_IDS.HUB).mesh);
    expect(() => mgr.update(1 / 60, new THREE.Vector3(NaN, 0, NaN))).not.toThrow();
    expect(投影件数(那名(mgr, ZONE_IDS.HUB).mesh), 'NaN 那一帧之后判定不变').toBe(起);
    // 坏值过去之后下一帧照常按位置重判（不是"保持住了就再也不动"）
    expect(走一步(mgr, 摆在(mgr, ZONE_IDS.VOID, 3)).void).toBeGreaterThan(0);
  });

  it('GLB 晚到时重新落一次门：判据没翻转也要把新进来的网格关掉', () => {
    const { mgr } = 造(ZONE_IDS.HUB);
    走一步(mgr, new THREE.Vector3(0, 0, 0));            // 先判一次（void 那名 = 关）
    const 晚 = applyShadow(new THREE.Mesh(new THREE.SphereGeometry(1)), 'prop');   // 与 loadGlb 同一形状
    那名(mgr, ZONE_IDS.VOID).mesh.add(晚);
    expect(晚.castShadow).toBe(true);
    mgr._重落投影门(ZONE_IDS.VOID);
    expect(晚.castShadow, '晚到的件跟着当前判定，而不是等下一次翻转').toBe(false);
    mgr._重落投影门(ZONE_IDS.HUB);                       // 开着的那一名：原值还回来
    expect(投影件数(那名(mgr, ZONE_IDS.HUB).mesh)).toBeGreaterThan(0);
    expect(() => mgr._重落投影门('没有这一名')).not.toThrow();
  });

  it('判定只在翻转时走树（每帧一次比较，不是每帧一次 traverse）', () => {
    const { mgr } = 造(ZONE_IDS.HUB);
    const 玩家 = new THREE.Vector3(0, 0, 0);
    走一步(mgr, 玩家);
    let 走 = 0;
    for (const n of mgr.npcs) {
      const 原 = n.mesh.traverse.bind(n.mesh);
      n.mesh.traverse = (fn) => { 走 += 1; return 原(fn); };
    }
    for (let i = 0; i < 30; i += 1) mgr.update(1 / 60, 玩家);
    expect(走, '30 帧同一个判定 ⇒ 一次树都不该走').toBe(0);
    mgr.update(1 / 60, 摆在(mgr, ZONE_IDS.VOID, 3));     // void 那名翻回开
    expect(走, '翻转的那一帧才走树').toBeGreaterThan(0);
  });

  it('记忆挂在网格上而不是挂在 id 上：拆掉重建的 NPC 不受旧判定牵连', () => {
    const { mgr } = 造(ZONE_IDS.HUB);
    走一步(mgr, new THREE.Vector3(0, 0, 0));
    expect(投影件数(那名(mgr, ZONE_IDS.VOID).mesh)).toBe(0);
    mgr.dispose();
    const 新 = 造(ZONE_IDS.CORRIDOR).mgr;               // 全新的一批网格
    expect(投影件数(那名(新, ZONE_IDS.VOID).mesh), '新建时按类别天生投影，门还没落过').toBeGreaterThan(0);
    expect(新.npcs.length).toBe(2);
  });
});

describe('⑦ 单一所有者：写 castShadow / receiveShadow 的出口仍然只有一处', () => {
  const 赋值处 = () => srcFiles()
    .map((f) => [relative(SRC, f).replace(/\\/g, '/'), stripComments(readFileSync(f, 'utf8'))])
    .filter(([, 净]) => /\b(castShadow|receiveShadow)\s*=/.test(净))
    .map(([rel]) => rel);

  it('投影门没有新增第二个写值的人：名单仍是策略表 + 光源声明', () => {
    const 全 = srcFiles();
    expect(全.length, '扫不到文件的"干净"是假绿').toBeGreaterThan(180);
    // `core/Game.js` 那一个是**光源本体**的 `this.sun.castShadow = true`（灯不是"物体的类别"，
    // 归 `setSunShadow` 之外唯一保留的声明处）—— 这一片一条都没新加，加的写值全在策略表里。
    expect(赋值处().slice().sort(), '多一个文件 = 门旁多开了一条写影子的路').toEqual([
      'core/Game.js',
      'engine/shadowPolicy.js',
    ]);
    const 接线 = stripComments(readFileSync(join(SRC, 'world/RestNpcManager.js'), 'utf8'));
    expect(接线).not.toMatch(/\bcastShadow\s*=/);
    expect(接线).toMatch(/applyShadowCastGate\(/);
    expect(接线).toMatch(/shouldCastShadow\(/);
  });

  it('反面证据：这把尺子量得出赋值（尺子坏了上面那条就是假绿）', () => {
    const 样本 = [
      'const x = 1;',
      'body.castShadow = true;',
      'm.castShadow=false;',
      'this.sun.receiveShadow = on;',
      '// castShadow = 只是注释里提了一嘴',
      '/* 说明块里也提 castShadow = */',
    ];
    const 命中 = 样本.filter((ln) => /\b(castShadow|receiveShadow)\s*=/.test(stripComments(ln)));
    expect(命中, '三行赋值都该被量到，注释里的两行不该').toHaveLength(3);
  });
});

describe('⑧ 豁免的前提：NPC 名册的键都是真区 id', () => {
  it('每一名营火 NPC 都挂在一个玩家真能站进去的位面上', () => {
    const 真区 = [HUB_ZONE.id, ...ZONE_ORDER];
    const 名册 = Object.keys(REST_NPC_DEFS);
    expect(名册.length, '八位面各一名（切片6 普查给的名册）').toBe(8);
    for (const id of 名册) {
      expect(真区, `REST_NPC_DEFS 的键 "${id}" 不是真区 id ⇒ 那一名的豁免永远不成立`).toContain(id);
    }
  });

  it('类别表没被这一片改动（门的"原值"仍以它为准）', () => {
    expect(Object.keys(SHADOW_CLASSES)).toEqual(['ground', 'prop', 'castOnly', 'actor']);
    expect(SHADOW_CLASSES.ground.cast).toBe(false);
    expect(SHADOW_CLASSES.prop.cast).toBe(true);
    expect(SHADOW_CLASSES.actor.cast).toBe(true);
  });
});
