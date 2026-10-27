/**
 * 门禁：每帧视觉的相位必须挂**世界时**，不许挂墙钟（W-A1 切片7，修 B118）。
 *
 * ## 这一条量的是谁的时钟
 *
 * 主循环把时间分成两支（`core/Game.js:951-966`）：
 * - `rawDt` —— 本帧真实时长，喂演出 / UI / 输入（命中停顿不该冻住玩家的手）；
 * - `dt = rawDt × timeScale × 镜头时标` —— **世界时**，喂 `ambientPass / worldEffects /
 *   weather / restNpcs / restPoints / soulWisps / zone` 这一整排视觉系统。
 *
 * 修前这一排里有十三处写的是 `Math.sin(performance.now() × k)`：同一个 `update(dt)` 里
 * `rotation.y += dt * 1.2` 归世界管、`position.y = sin(墙钟)` 归墙钟管。症状全是玩家看得见的：
 *
 * - **时停/定帧只冻住一半**：探针实测（`.tmp-20261015/probe-visual-clock.log`）魂火那一秒仍漂
 *   0.649 米、营火火苗仍抖 0.279 倍缩放与 1.356 自发光、魔法区漂浮书仍走 0.703 米、
 *   法杖浮珠仍浮 0.220 米 —— B/A 全是 1.000，即"世界停了，它没停"。
 * - **暂停回来跳一下**：暂停期间主循环照跑、世界不更新，相位却按真实时间走。停 1 秒再回来，
 *   漂浮书当场跳 0.558 米（正常一帧只走 0.0097），停得越久跳得越远。
 * - **帧率越高漂得越远**：`WorldEffects` 的粒子是 `arr[i+1] += sin(墙钟) × 0.002`，**不乘 dt**，
 *   量的是"每一帧"。180 fps 下漂移是 60 fps 的 3.1 倍，而且永不归位（W-A1 切片4 治过同族病：
 *   寿命按帧数走；这次是振幅按帧数累加）。
 *
 * ## 三档口径（探针与门禁共用）
 *
 * 真实时间三档都一样过 1 秒，只有世界时不同：
 * - **A 正常**：60 帧 × dt=1/60 ⇒ 世界时 1.00 秒
 * - **B 时停**：60 帧 × dt=0 ⇒ 世界时 **0.00 秒**
 * - **C 定帧**：60 帧 × dt=0.08/60 ⇒ 世界时 0.08 秒（`Time.hitstop` 的默认 scale）
 *
 * 判据：**B 档必须一帧都不动**（Σ|Δ| === 0）。这条是尖的 —— 相位只要还吃墙钟，B 档就非零。
 * C 档是 A 档的 ≈0.08 倍（正弦的行程不是时间的线性函数，所以给区间 [0.02, 0.30] 而不是等值；
 * 抓住的是"完全不吃时标"和"根本没人更新"这两头）。A 档 > 0 是地板：读数不动的夹具什么也证明不了。
 *
 * 每档跑之前先**预热一帧**：构造时的姿势与"动画解算出来的第一个值"之间必然有一跳，那一跳
 * 三档都有、与世界时无关，留着就把 B 档的地板顶成噪声（实测魂火 y 的 snap 是 0.355 米）。
 *
 * ## 反向对照
 *
 * 门禁自己也必须能被证伪：`假时钟对照` 那一条用同一套跑法跑一个**故意读墙钟**的对象，
 * 要求它在 B 档照样动 —— 否则"B===0"可能只是我的跑法根本不动任何东西。
 *
 * ## 每条腿各有盲区（17 条变异臂量出来的，不是推出来的）
 *
 * 三档 + 跳变 + 帧率 + 普查这五条腿**没有一个能单独吃下全部病灶**，两条是结构性看不见：
 *
 * - **B 档看不见"积分点整行删掉"**：相位彻底不推进 ⇒ 世界停着它当然也停着，B 档照样为 0。
 *   咬它的是 A 档地板（不动的夹具证明不了任何事）与积分点普查。
 * - **跳变看不见"按帧累加"（`_时相 += 1/60`）**：那一族每帧走同样多，跟墙钟走没走无关，
 *   暂停 60 秒的头两帧位移与正常头两帧逐字相等。咬它的是 B 档与积分点普查。
 * - **B 档也看不见"乘了 dt 的加速度项"**（雪的横向摆动）：dt=0 时整条就是 0；单帧跳变窗口同样
 *   看不见 —— 那一处改的是**速度**，误差要**下一帧**才落到位置上，所以跳变那条量两帧。
 * - **"忘了初始化"（少一行 `this._时相 = 0`）**只看名单的普查对它失明（`_时相 += dt` 那一行还在），
 *   而它的症状是 NaN：不报错，那件东西直接从画面上消失。所以积分点普查附带一条初值核对。
 *
 * 一句话：判据要成排，因为每一排都恰好看不见一种坏形状。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as THREE from 'three';
import { SoulWispManager } from '../src/world/SoulWispManager.js';
import { WorldEffects } from '../src/world/WorldEffects.js';
import { RestPointManager } from '../src/world/RestPointManager.js';
import { WeatherSystem } from '../src/world/WeatherSystem.js';
import { MagicZone } from '../src/world/zones/MagicZone.js';
import { SpaceZone } from '../src/world/zones/SpaceZone.js';
import { InternalSpace } from '../src/world/InternalSpace.js';
import { RestNpcManager } from '../src/world/RestNpcManager.js';
import { RestNpcModel } from '../src/world/RestNpcModel.js';
import { RestNpcProceduralGestures } from '../src/world/RestNpcProceduralGestures.js';
import { REST_NPC_DEFS } from '../src/content/restNpcDefs.js';
import { AmbientScenePass } from '../src/effects/AmbientScenePass.js';
import { WeaponSystem } from '../src/combat/WeaponSystem.js';
import { MagicBoss } from '../src/combat/MagicBoss.js';
import { ZONE_IDS } from '../src/content/ZoneIdentity.js';
import { makeWorld, makeScene, makePlayerRef } from './helpers/enemyHarness.js';

const 帧步毫秒 = 1000 / 60;
/** 三档的世界 dt；真实时间每档都按 60 fps 走满 1 秒 */
const 档 = { A: 1 / 60, B: 0, C: 0.08 / 60 };
/** 命中停顿的时标（`Time.hitstop(realSeconds, scale)` 的默认 scale） */
const 定帧时标 = 0.08;

let 墙 = 0;
const 真性能 = globalThis.performance.now.bind(globalThis.performance);
let 真随机 = Math.random;
let 乱 = 1;
/** 三档共用同一份随机流，否则 A/B/C 比的是两个不同个体（粒子位置、NPC 选择都吃随机） */
function 播种() {
  乱 = 12345;
  Math.random = () => { 乱 = (乱 * 1103515245 + 12345) % 2147483648; return 乱 / 2147483648; };
}

beforeAll(() => {
  globalThis.performance.now = () => 墙;
  // 没有 jsdom：NPC 气泡要 window.innerWidth 投影、Boss 状态机会 dispatch 事件，给最小替身
  globalThis.window = {
    innerWidth: 1280, innerHeight: 720,
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  // RestNpcManager 往 #hud 挂对话气泡；getElementById 交回 null 就是"这一页没有 HUD"，
  // 与生产里 hud 尚未挂载的那一帧同一形状（`?.appendChild` 本来就允许缺席）
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({ className: '', dataset: {}, style: {}, textContent: '', classList: { add() {}, remove() {} } }),
  };
});

afterAll(() => {
  globalThis.performance.now = 真性能;
  Math.random = 真随机;
  delete globalThis.document;
});

const 假世界 = { getGroundHeight: () => 0, bounds: null, collision: null, zones: [] };
/** 玩家放远处：既躲开 NPC 的"靠近才转身/搭话"分支，也让粒子盒始终跟着相机 */
const 玩家 = new THREE.Vector3(4000, 0, 4000);

/** 跑一帧并把读数逐条累进路径；返回累加器 */
function 跑(档名, row, 帧数, 预热) {
  墙 = 0; 播种();
  const x = row.造();
  const 玩家位 = row.玩家 ?? 玩家;
  const 走 = (dt) => { 墙 += 帧步毫秒; x.obj.update(dt, 玩家位); };
  if (预热) 走(档[档名]);
  const 起 = row.读(x);
  const 路径 = 起.map(() => 0);
  const 上 = 起.slice();
  for (let i = 0; i < 帧数; i += 1) {
    走(档[档名]);
    const r = row.读(x);
    r.forEach((v, j) => { 路径[j] += Math.abs(v - 上[j]); 上[j] = v; });
  }
  x.dispose?.();
  return 路径;
}

/** 同一行跑满三档（各 60 帧，预热一帧） */
function 三档(row, 帧数 = 60) {
  return { A: 跑('A', row, 帧数, true), B: 跑('B', row, 帧数, true), C: 跑('C', row, 帧数, true) };
}

const 求和 = (arr, k) => { const a = arr.attributes.position.array; let s = 0; for (let i = k; i < a.length; i += 3) s += a[i]; return s; };

/* -------------------------------------------------------------------------
 * 家族名册：每一行 = 一个被改造的视觉系统 + 它自己那几处"每帧重画"的读数。
 * 名册就是这一片的验收面：新增一处每帧视觉就得在这里登记（不登记 ⇒ 结构普查红）。
 * ---------------------------------------------------------------------- */
const 魂火 = {
  文件: 'src/world/SoulWispManager.js', 名: '魂火漂浮 + 光晕缩放 + 光晕透明度',
  造: () => ({ obj: new SoulWispManager(new THREE.Scene(), 假世界, { addSouls() {} }, { toast() {} }, {}) }),
  读: (x) => {
    const w = x.obj.wisps[0];
    return [w.mesh.position.y, w.mesh.children[0].scale.x, w.mesh.children[0].material.opacity];
  },
};
const 世界特效 = {
  文件: 'src/world/WorldEffects.js', 名: '极光透明度 + 极光倾角 + 奥术光球 + 混沌余烬',
  造: () => {
    const obj = new WorldEffects(new THREE.Scene());
    obj.fireflies.visible = true; obj.magicOrbs.visible = true; obj.aurora.visible = true; obj.chaosEmbers.visible = true;
    return { obj };
  },
  读: (x) => [x.obj.aurora.material.opacity, x.obj.aurora.rotation.z, 求和(x.obj.magicOrbs.geometry, 1), 求和(x.obj.chaosEmbers.geometry, 1)],
};
const 营火 = {
  文件: 'src/world/RestPointManager.js', 名: '营火火苗抖动 + 自发光脉动',
  造: () => {
    const obj = new RestPointManager(new THREE.Scene(), 假世界);
    obj.buildDefaults();
    return { obj };
  },
  读: (x) => {
    const f = x.obj.points[0].flame;
    return [f.scale.y, f.material.emissiveIntensity];
  },
};
const 雪 = {
  文件: 'src/world/WeatherSystem.js', 名: '雪花的下落与横向摆动',
  // 玩家就在粒子盒中心：`_follow` 不动，读数里就没有"整盒跟着跑"这一项，
  // 剩下的行程全部由下落（乘 dt）与横向摆动（乘 dt + 世界时相位）贡献。
  玩家: new THREE.Vector3(0, 0, 0),
  造: () => {
    const obj = new WeatherSystem(new THREE.Scene(), 假世界, null);
    obj.setZone(ZONE_IDS.SPACE);
    return { obj };
  },
  // 读的是粒子 y 与 x 的行程。修前那条横向 `+= sin(墙钟 + i) × dt × 0.4` 乘了 dt，但相位来自墙钟：
  // 它整条喂的是**水平速度**，所以只量 y 的那一版对它完全失明（B 档为 0 是因为一切都乘 dt，
  // 不是因为相位真的归世界管）—— x 那一格才是这一处的读数。
  读: (x) => [求和(x.obj.particles.geometry, 1), 求和(x.obj.particles.geometry, 0)],
};
const 魔法区 = {
  文件: 'src/world/zones/BaseZone.js', 名: 'POI 标记浮动（区域基类）',
  造: () => {
    // 构造器只构造（缺陷② 切片F）：内容由 `build()` 建 —— 生产里这一段由 `WorldManager`
    // 在挂好地面问手之后调用，裸区在这里自己补上同一句。
    const obj = new MagicZone(new THREE.Scene(), new THREE.Vector3(0, 0, -180), { toast() {} });
    obj.build();
    return { obj };
  },
  读: (x) => {
    const m = x.obj.poiMarkers[0]?.marker;
    return [m ? m.position.y : 0, m ? m.rotation.y : 0];
  },
};
const 漂浮书相位 = [0, Math.PI / 4, Math.PI / 2 + 0.6, -0.9];
const 漂浮书 = {
  文件: 'src/world/zones/MagicZone.js', 名: '魔法区漂浮书',
  造: () => {
    const obj = new MagicZone(new THREE.Scene(), new THREE.Vector3(0, 0, -180), { toast() {} });
    obj.build(); // 构造器只构造（缺陷② 切片F）：内容由 build() 建
    // 把读的那几本书的**相位钉死**（生产里 `phase: Math.random()*2π`，这里只是把夹具选中
    // 那几本的相位改成已知值 —— 不改振幅、不改公式、不改其余本）。
    //
    // 为什么必须钉：C 档只走 0.08 时标，即 60 帧把 `_时相` 推进 0.08 弧度；如果这一本的相位
    // 落在 sin 的**转折点**（`cos ≈ 0`，波峰/波谷）上，那点窗口内的位移是**二阶小量**，
    // C/A 读到 0.011 而不是 0.08 —— 用例红，而系统没错。夹具的通过与否不能靠播种流恰好
    // 抽到哪一档：切片5 把禁林那 50 棵树的材质改成共享，抽到的相位从 344.4° 变成 271.6°
    // （后者离波谷只差 1.6°），于是一条量"相位吃不吃世界时"的用例被**无关的构建改动**打红。
    // 相位由夹具点名之后，这条对播种流的变动免疫，而 B 档（dt=0 ⇒ `_时相` 不动）依然为 0。
    obj.books.slice(0, 漂浮书相位.length).forEach((b, i) => { b.phase = 漂浮书相位[i]; });
    return { obj };
  },
  读: (x) => 漂浮书相位.map((_, i) => {
    const b = x.obj.books?.[i];
    return b ? b.mesh.position.y : 0;
  }),
};
// 夹具自己的体检：钉进去的相位不许站在 sin 的转折点上（那会让上面那条比值变成二阶小量，
// 也就是把这条用例的余量交还给运气 —— 只是这次由夹具而不是播种流决定）。
for (const 相 of 漂浮书相位) {
  if (Math.abs(Math.cos(相)) < 0.3) throw new Error(`漂浮书夹具的相位 ${相} 落在 sin 转折点附近`);
}
const 时环 = {
  文件: 'src/world/zones/SpaceZone.js', 名: '太空区时环透明度',
  造: () => {
    const obj = new SpaceZone(new THREE.Scene(), new THREE.Vector3(0, 0, 180), { toast() {} });
    obj.build(); // 构造器只构造（缺陷② 切片F）：内容由 build() 建
    return { obj };
  },
  读: (x) => [x.obj.timeRing.material.opacity],
};
const 内在空间 = {
  文件: 'src/world/InternalSpace.js', 名: '内在空间 POI 标记浮动',
  造: () => {
    const obj = new InternalSpace({ id: 'probe-space', zoneId: ZONE_IDS.MAGIC, localCenter: { x: 0, z: 0 } });
    const marker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    marker.position.set(3, 2, 0);
    obj.poiMarkers.push({ marker });
    return { obj };
  },
  读: (x) => [x.obj.poiMarkers[0].marker.position.y],
};
const 尘光 = {
  文件: 'src/effects/AmbientScenePass.js', 名: '尘光漂移 + 营火光晕强度 + 光晕缩放',
  造: () => {
    const pass = new AmbientScenePass({
      scene: new THREE.Scene(),
      restPoints: { points: [{ position: new THREE.Vector3(3, 0, 4) }] },
      world: { getGroundHeight: () => 0 },
    });
    return { obj: pass, dispose: () => pass.dispose() };
  },
  读: (x) => [求和(x.obj.dust.geometry, 1), x.obj.restGlows[0].light.intensity, x.obj.restGlows[0].glow.scale.x],
};
const 营火NPC = {
  文件: 'src/world/RestNpcManager.js', 名: 'NPC 待机漂浮 + 幽灵斗篷透明度 + 斗篷自发光 + 说话点头',
  造: () => {
    const mk = (id) => ({ id, position: new THREE.Vector3(2, 0, 2), mesh: new THREE.Group() });
    const mgr = new RestNpcManager(
      new THREE.Scene(), 假世界,
      { points: [mk('magic'), mk('void')] },      // float 与 ghost 两种待机都盖到
      { dialog: { toast() {} } },
    );
    mgr.speakingId = 'magic';                     // 说话点头那一支只在 speaking/inDialogue 时写
    return { obj: mgr, dispose: () => mgr.dispose() };
  },
  读: (x) => {
    const a = x.obj.npcs.find((n) => n.id === 'magic');
    const g = x.obj.npcs.find((n) => n.id === 'void');
    return [a.mesh.position.y, g.cloak.material.opacity, g.cloak.material.emissiveIntensity, a.head.position.y];
  },
};
const 兜底头 = {
  文件: 'src/world/RestNpcModel.js', 名: '无素材兜底 NPC 的头部呼吸（逐帧累加）',
  造: () => {
    const model = new RestNpcModel('hub', REST_NPC_DEFS.hub);
    model.buildFallback();
    return { obj: model };
  },
  读: (x) => [x.obj.fallbackMeshes[1].position.y],
};
const 坐姿 = {
  文件: 'src/world/RestNpcProceduralGestures.js', 名: '程序化坐姿的胸口起伏',
  造: () => {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1, 4, 6));
    const npc = { body, head: new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6)), mesh: new THREE.Group(), def: REST_NPC_DEFS.hub };
    const proc = new RestNpcProceduralGestures(npc);
    proc.setPose('procedural_sit');
    return { obj: proc };
  },
  读: (x) => [x.obj.npc.body.position.y],
};
const 大奥术师 = {
  文件: 'src/combat/MagicBoss.js', 名: '大奥术师光球自发光脉动',
  造: () => {
    const boss = new MagicBoss(makeScene(), makeWorld(), { x: 0, z: 0 });
    const ref = makePlayerRef();
    return { boss, obj: { update: (dt) => boss.update(dt, new THREE.Vector3(10, 0, 0), ref) } };
  },
  读: (x) => [x.boss.mesh.getObjectByName('orb').material.emissiveIntensity],
};
const 杖珠 = {
  文件: 'src/combat/WeaponSystem.js', 名: '法杖杖珠浮动',
  造: () => {
    const 模型 = { bones: {}, boneOf: () => null, modelRoot: new THREE.Group() };
    const mesh = new THREE.Group();
    mesh.add(模型.modelRoot);
    const obj = new WeaponSystem(
      { position: new THREE.Vector3(), camera: new THREE.PerspectiveCamera(), mesh, characterModel: 模型, modelReady: Promise.resolve() },
      { toast() {} }, null,
    );
    obj.current = 'staff';
    obj._mountStaff();                    // 生产里等 modelReady；门禁不必等，挂上就能读
    return { obj };
  },
  读: (x) => [x.obj._orb.position.y],
};

const 家族 = [魂火, 世界特效, 营火, 雪, 魔法区, 漂浮书, 时环, 内在空间, 尘光, 营火NPC, 兜底头, 坐姿, 大奥术师, 杖珠];

describe('每帧视觉的相位挂世界时（B118 三档口径）', () => {
  it('名册不是空的，且每一行都点名了一个真实存在的文件', () => {
    expect(家族.length, '名册空了 ⇒ 下面三条循环全都无事可做').toBeGreaterThanOrEqual(12);
    for (const row of 家族) {
      expect(readFileSync(join(process.cwd(), row.文件), 'utf8'), `名册里的 ${row.文件} 不存在`).toBeTruthy();
    }
  });

  it('B 档（世界时 0 秒、真实时间照走 1 秒）⇒ 读数一帧都不动', () => {
    for (const row of 家族) {
      const r = 三档(row);
      r.B.forEach((b, j) => {
        expect(b, `${row.名} 读数#${j + 1}：世界停了它还在动（Σ|Δ|=${b}）—— 相位仍挂墙钟`).toBe(0);
      });
    }
  });

  it('A 档真的在动（地板：不动的夹具证明不了任何事）', () => {
    for (const row of 家族) {
      const r = 三档(row);
      r.A.forEach((a, j) => {
        expect(a, `${row.名} 读数#${j + 1}：正常一帧也没动 ⇒ 这一行量的不是每帧视觉`).toBeGreaterThan(0);
      });
    }
  });

  it('C 档（定帧 0.08 时标）走的是 A 档的那一段，只是被时标缩过', () => {
    for (const row of 家族) {
      const r = 三档(row);
      r.A.forEach((a, j) => {
        const 比 = r.C[j] / a;
        expect(比, `${row.名} 读数#${j + 1}：C/A=${比}（应接近 ${定帧时标}）`).toBeGreaterThanOrEqual(0.02);
        expect(比, `${row.名} 读数#${j + 1}：C/A=${比} 太接近 1 ⇒ 这一处不吃时标`).toBeLessThanOrEqual(0.3);
      });
    }
  });

  it('反向对照：一个故意读墙钟的对象在同一套跑法下 B 档照样动', () => {
    /*
     * 这条不是装饰：上面三条全是"B 档必须为 0"，而"为 0"有两种成因 —— 相位真的挂世界时，
     * 或者我的夹具根本没把那个东西跑起来。对照件用修前的写法（`sin(墙钟 × 0.003) × 0.2`）
     * 走同一台跑法，它必须 B 档非零。尺子量得动一个已知坏的，才配说已知好的。
     */
    const 读数 = { y: 0 };
    const 对照件 = {
      名: '对照件：相位直接取墙钟',
      造: () => ({ obj: { update: () => { 读数.y = Math.sin(globalThis.performance.now() * 0.003) * 0.2; } } }),
      读: () => [读数.y],
    };
    const r = 三档(对照件);
    // 0.2 而不是"越大越好"：这条腿要的只是"尺子读得动一个已知坏的"（实测 A=B=0.372）
    expect(r.A[0], '对照件在正常档也不动 ⇒ 跑法本身没在推进任何东西').toBeGreaterThan(0.2);
    expect(r.B[0], '对照件在 B 档没动 ⇒ 上面三条"B===0"证明不了任何事').toBeGreaterThan(0.2);
  });
});

describe('暂停回来不跳相位（B118 第二个症状）', () => {
  /*
   * 世界时没走、墙钟走了 N 秒 —— 回到游戏之后不许按真实时长补账。
   *
   * 窗口取**两帧**而不是第一帧：有一条病灶（`WeatherSystem` 的横向摆动）写的是**加速度**，
   * 它的相位误差要在**下一帧**才落到位置上 —— 单帧窗口对它结构性失明（实测把摆动改回墙钟之后，
   * "暂停 60 秒的第一帧位移"与正常第一帧逐字相等，两帧窗口才差开来）。
   * 两帧窗口对其他行只会更严：判据仍是"和正常两帧一模一样"，而正确的实现是纯 dt 的函数，
   * 跑几帧都相等。
   */
  function 跳变(row, 暂停秒) {
    墙 = 0; 播种();
    const 玩家位 = row.玩家 ?? 玩家;
    const x = row.造();
    for (let i = 0; i < 2; i += 1) { 墙 += 帧步毫秒; x.obj.update(档.A, 玩家位); }
    const 前 = row.读(x);
    墙 += 暂停秒 * 1000;                        // 暂停期间主循环照跑，世界不更新
    for (let i = 0; i < 2; i += 1) { 墙 += 帧步毫秒; x.obj.update(档.A, 玩家位); }
    const 后 = row.读(x);
    x.dispose?.();
    return 后.map((v, j) => Math.abs(v - 前[j]));
  }

  /*
   * 名册覆盖到哪，"暂停不跳相位"就管到哪。两条后来补上的各有理由：
   * - `雪`：那条横向摆动整条乘了 dt，B 档（世界时为 0）量不到它，且它喂的是速度，
   *   单帧跳变窗口也量不到它 —— 只有"墙钟走了、世界时没走"再落两帧才咬得住；
   * - `魔法区`：POI 标记的浮动住在 `BaseZone`，而 `BaseZone` 是全家族唯一给子类喂相位的
   *   积分点 —— 它跳相位，六个区域一起跳。
   */
  for (const row of [魂火, 雪, 魔法区, 漂浮书, 营火, 杖珠]) {
    it(`${row.名}：暂停 60 秒之后的两帧位移 = 正常两帧的位移`, () => {
      const 正常 = 跳变(row, 0);
      const 长停 = 跳变(row, 60);
      正常.forEach((v, j) => {
        expect(v, `${row.名} 读数#${j + 1}：正常两帧之间就不动，这条腿没量到东西`).toBeGreaterThan(0);
        expect(长停[j], `${row.名} 读数#${j + 1}：暂停 60 秒后走了 ${长停[j]}，正常两帧只有 ${v} ⇒ 相位还在吃墙钟`).toBe(v);
      });
    });
  }
});

describe('帧率独立性：同一秒世界时，60 帧与 180 帧走到同一个地方', () => {
  /*
   * 这一条专治"每帧累加不乘 dt"。修前 `WorldEffects` 的粒子是
   * `arr[i+1] += sin(墙钟) × 0.002` —— 180 fps 漂得是 60 fps 的 3.1 倍（探针实测 0.00093 vs 0.00030）。
   * 判据用**净位移**（末态 − 初态），不是行程：正弦的累加在 60/180 帧下末态应重合，
   * 而行程会因采样密度不同天然有差。
   */
  function 净位移(row, 帧数) {
    const dt = 1 / 帧数;
    墙 = 0; 播种();
    const x = row.造();
    墙 += 1000 / 帧数; x.obj.update(dt, 玩家);
    const 起 = row.读(x);
    for (let i = 0; i < 帧数; i += 1) {
      墙 += 1000 / 帧数;
      x.obj.update(dt, 玩家);
    }
    const 末 = row.读(x);
    x.dispose?.();
    return 末.map((v, j) => Math.abs(v - 起[j]));
  }

  const 名册 = [
    [世界特效, '粒子求和读数在两种帧率下都不动 ⇒ 累加项根本没生效', [2, 3]],
    [尘光, '尘光漂移读数不动', [0]],
    [兜底头, '兜底头部呼吸读数不动', [0]],
  ];

  for (const [row, 提示, 下标] of 名册) {
    it(`${row.名}：60 帧与 180 帧的净位移之差 < 15 %`, () => {
      const a = 净位移(row, 60);
      const b = 净位移(row, 180);
      for (const j of 下标) {
        expect(a[j], `${提示}（60 帧 ${a[j]}）`).toBeGreaterThan(0);
        const 差 = Math.abs(b[j] - a[j]) / a[j];
        expect(差, `${row.名} 读数#${j + 1}：60 帧走 ${a[j]}、180 帧走 ${b[j]}（差 ${(差 * 100).toFixed(1)} %）⇒ 按帧累加没乘 dt`).toBeLessThan(0.15);
      }
    });
  }
});

/* -------------------------------------------------------------------------
 * 结构普查：视觉家族不再读墙钟，剩下的每一处都得点名登记（B118② 已在切片8 判完）。
 * 名单不是豁免表 —— 每一条的理由必须**对着代码可读**：这一处量的确实是真实时间，
 * 而且它服务的对象也真的由真实时间驱动（对不上就是下一片的账）。
 * 切片7 登记时这里是七条；切片8 逐处判定后删掉三条：
 *   · `combat/BossStateMachine.js` —— `TIME_ELAPSED` 改成世界时台账 `phaseElapsed`；
 *   · `game/CombatStyleTracker.js` —— `lastEvent` 写两处、读零处，连招窗口本来就是 `decayTimer`；
 *   · `game/DungeonRunTracker.js` —— 「用时」改成 `update(dt)` 累计的世界秒（暂停不再计入）。
 * 判定过程与读数见 MASTER_PLAN §9 的 W-A1 切片8 ADR，门禁在 `tests/gameplay-clock-semantics.test.js`。
 * ---------------------------------------------------------------------- */
const SRC = join(process.cwd(), 'src');
const 玩法侧墙钟 = {
  'core/Game.js': '世界时的喂入口本身：clock.getDelta() 与 performance.now()/1000 就是两支钟的源头',
  'cinematic/CombatCameraDirector.js': 'blocksInputUntil = 墙钟 + duration×1000，而它守的那段演出每帧吃 rawDt（Game.update 里 combatCamera.update(rawDt)）—— 同支钟才对得上，见 gameplay-clock-semantics 的配对腿',
  'cinematic/CombatCameraDirectorExtensions.js': '跳过路径读同一个 blocksInputUntil 截止时间（不另起一支钟）',
  'cinematic/CombatCinematicSkip.js': 'canSkip 读同一个 blocksInputUntil 截止时间（不另起一支钟）',
};

function stripNonCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('结构普查：谁还在读墙钟（B118② 名单由扫描推导，不是手抄）', () => {
  const 读过的 = () => {
    const _found = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      if (/performance\.now\s*\(/.test(stripNonCode(readFileSync(file, 'utf8')))) _found.push(rel);
    }
    return _found.sort();
  };

  it('src/ 里读墙钟的文件恰好是登记过的那一批（新增一处 ⇒ 当场红）', () => {
    expect(读过的()).toEqual(Object.keys(玩法侧墙钟).sort());
  });

  it('登记名单不养僵尸条目：每一处今天还得真的读墙钟', () => {
    const 集合 = new Set(读过的());
    for (const [rel, 理由] of Object.entries(玩法侧墙钟)) {
      expect(集合.has(rel), `${rel} 已登记（${理由}），但代码里已经读不到了 ⇒ 从名单删掉`).toBe(true);
    }
  });

  it('名册里的每一处视觉都不再读墙钟，且相位来自 `_时相` 的积分', () => {
    for (const row of 家族) {
      const 源 = stripNonCode(readFileSync(join(process.cwd(), row.文件), 'utf8'));
      expect(/performance\.now\s*\(/.test(源), `${row.文件} 又去读墙钟了（B118）`).toBe(false);
      expect(/_时相/.test(源), `${row.文件} 不再使用积分出来的相位 ⇒ 这一行该从名册里删掉`).toBe(true);
    }
  });

  /*
   * "谁拥有时钟"也必须只有一处定义：`_时相 += dt` 的落点就是积分点。
   * MagicZone / SpaceZone 是**读者**（相位由 `BaseZone.update` 攒好），把它们也算进积分点
   * 就是允许子类各攒一份 —— 那正是修前"同一条 update 里两个时钟"的变形。
   */
  it('积分点（`_时相 += dt`）的名单就是这片改过的那一批', () => {
    const 积分者 = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      if (/_时相 \+= dt/.test(stripNonCode(readFileSync(file, 'utf8')))) 积分者.push(rel);
    }
    /*
     * MagicZone / SpaceZone 不在名单里：它们**读** `this._时相`，相位由 `BaseZone.update` 攒好。
     * 把子类也写进积分点就等于允许每层各攒一份 —— 那正是修前"同一条 update 里两个时钟"的变形。
     */
    const 积分点名册 = [
      'combat/MagicBoss.js',
      'combat/WeaponSystem.js',
      'effects/AmbientScenePass.js',
      'world/InternalSpace.js',
      'world/RestNpcManager.js',
      'world/RestNpcModel.js',
      'world/RestNpcProceduralGestures.js',
      'world/RestPointManager.js',
      'world/SoulWispManager.js',
      'world/WeatherSystem.js',
      'world/WorldEffects.js',
      'world/zones/BaseZone.js',
    ];
    expect(积分者.sort()).toEqual(积分点名册);
    /*
     * 积分点还必须**自己把相位起出来**：`this._时相 += dt` 落在一个从未赋值的字段上
     * 得到的是 NaN，`sin(NaN)` 又是 NaN —— 数值不会报错，只会把那个东西从画面上抹掉。
     * 这条腿的证据是变异臂「尘光时相忘了初始化」（删掉构造期那一行赋值）：
     * 名单里那一行 `_时相 += dt` 还在，所以只看名单的普查对它完全失明。
     */
    for (const rel of 积分点名册) {
      const 源 = stripNonCode(readFileSync(join(SRC, rel), 'utf8'));
      expect(/_时相\s*=\s*0/.test(源), `${rel} 有积分点却没有初值 ⇒ 第一帧就把相位乘成 NaN`).toBe(true);
    }
  });
});
