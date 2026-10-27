/**
 * 装饰整层的落座**另一半**：底边不许浮在地面之上（缺陷② 切片H）。
 *
 * ## 这一片补的是什么
 *
 * `tests/decoration-ground-landing.test.js` 判的是"**整件埋在自己脚下**"
 * （顶面 vs 地面）—— 那是"看不见 ⇒ 撞不上"那一笔账。
 * 这一片判的是另一半：**一件东西的底悬在半空**。症状是玩家看见一道缝、
 * 一圈飘着的影子，而碰撞体已经挡住了他（`BASE_SINK` 那一手把体压到地面以下 0.3 米，
 * 于是"浮着"与"挡着"在同一个件上同时成立）。
 *
 * ## 为什么必须分"顶层件"与"子件"
 *
 * 装饰层 800 多件里约四成是子件：树冠挂树顶、灯头挂灯柱顶、雨棚挂摊底顶、
 * 门梁跨两根门柱之间、幡布挂幡杆上。它们的底边**本来就该离地** ——
 * 不分父子就量，337 件子件把分母撑爆，真正的顶层件浮起来反而淹没在里面。
 *
 * ## 判据住在生产那一侧
 *
 * 读数（`量落座`）与判据（`落座问题`）都在 `src/world/decoLanding.js`，
 * 这一层只**喂坏数据**：好读数不报、坏读数逐条点名。门禁不在测试里复刻判断 ——
 * 复刻的那份迟早与生产的分家，而分家之后有一半读数是假的。
 *
 * ## 落座身份由生产自己声明
 *
 * `mesh.userData.landing`（`'ground'` 或 `'on:<族名>'`）。诊断要说出"是哪一族浮起来了"，
 * 门禁要按族算分母，两者读同一处，不各抄一份名单。
 *
 * ## 变异臂（切片H）
 *
 * | 臂 | 刀 | 预测红 | 机理 |
 * | --- | --- | --- | --- |
 * | H0 | 控制臂（不动） | 0 | 起点必须全绿 |
 * | H1 | 水晶的心高退回写死 `+0.8`（尺寸随机 ⇒ 小的那些浮起来） | ① 顶层件的底边 | 六颗水晶里小的那些浮在地面之上 10~28 厘米 |
 * | H2 | 断柱的心高退回写死 `+0.8`（矮柱浮空） | ① 顶层件的底边 | 柱高 1.5 米的那些底边离地 5 厘米 |
 * | H3 | 长椅的心高退回写死 `+0.2` | ① 顶层件的底边 | 底边离地 2.5 厘米 |
 * | H4 | 幡布的父族改成一个不存在的族 | ③ 父族存在 / 附近真有父件 | 挂空了 |
 * | H5 | 把幡布声明成顶层件 | ① 顶层件的底边 + ① 逐族列名 | 布的底边离地 1.75 米 ⇒ 浮空 |
 * | H6 | 把全部件声明成子件 | ① 顶层件清零 + ① 逐族列名 + ③ 三条 | 尺子被绕过去 |
 * | H7 | 幡杆不进场景 | ③ 父族 + 体与网格互相点名 + 两处合批计数 | 幡布失去父件，杆的体成了孤儿 |
 *
 * **H2 与 H3 逼出了容差的选择**：容差取 0.1 米（"看得见才算"）时这两刀**一条都不红**
 * —— 尺子咬不住"心高写死"这一族的本体（5 厘米与 2.5 厘米都在 10 厘米以下）。
 * 把容差收到 **2 厘米**（好状态离它 4000 倍余量）之后两刀都咬住 ⇒ 容差卡的是
 * "浮"这个事实，不是"浮得够不够难看"。这条发现记在 §9 同日 ADR 里。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildSeededWorld, buildSeededDecorations } from './helpers/seededWorld.js';
import { installWindowShim } from './helpers/enemyHarness.js';
import { 顶层, 挂于, 父距容差, LANDING_TOLERANCE, 量落座, 落座问题 } from '../src/world/decoLanding.js';

beforeAll(() => {
  installWindowShim();
});

const 世界种子 = 7;
const 摆件种子 = 8;

let world = null;
let deco = null;
let 读数 = null;

beforeAll(() => {
  world = buildSeededWorld(世界种子);
  deco = buildSeededDecorations(world, 摆件种子);
  读数 = 量落座(deco, world);
});

afterAll(() => {
  deco?.dispose();
  deco = null;
  world?.dispose?.();
  world = null;
});

/** 一件落在地上的顶层件 */
const 件 = (族, 差, 落座 = 顶层, 落点 = { x: 0, z: 0 }) => ({
  族,
  落座,
  底: 10 + 差,
  顶: 10.35,
  当地地面: 10,
  差,
  落点,
});

describe('① 顶层件不许浮在地面之上（钉死布局的真世界）', () => {
  it('读数不是空的（这一层真的摆出了东西，不是空转的全称判据）', () => {
    expect(读数.length).toBeGreaterThan(500);
    expect(new Set(读数.map((r) => r.族)).size).toBeGreaterThan(10);
  });

  it('顶层件的底边不许高于当地地面（容差内）', () => {
    const 顶层件 = 读数.filter((r) => r.落座 === 顶层);
    expect(顶层件.length, '这一层没有顶层件了（尺子被绕过去了）').toBeGreaterThan(100);
    const 浮着 = 顶层件.filter((r) => r.差 > LANDING_TOLERANCE);
    expect(
      浮着.map((r) => `${r.族} 浮 ${r.差.toFixed(2)} 米 @(${r.落点.x.toFixed(1)}, ${r.落点.z.toFixed(1)})`),
      '有顶层件浮在地面之上'
    ).toEqual([]);
  });

  it('读数用的是"它自己的落脚点"，不是包围盒中心（坡上那半的身位）', () => {
    // 断柱是随机尺寸的族：包围盒中心离它真正的落脚点能差一个身位。
    // 按中心读地表，在坡上会差到米级 ⇒ 这条判据必须是"按落脚点"。
    const 柱 = 读数.filter((r) => r.族 === 'wildRuinColumn');
    expect(柱.length).toBeGreaterThan(0);
    for (const r of 柱) {
      expect(r.当地地面, '当地地面不是按落脚点读的').toBe(world.getGroundHeight(r.落点.x, r.落点.z));
    }
  });

  it('子件豁免，但**逐族列名**（不许静默豁免 —— 豁免名单是生产自己声明的）', () => {
    const 子件族 = [...new Set(读数.filter((r) => r.落座 !== 顶层).map((r) => r.族))].sort();
    expect(子件族).toEqual([
      'hubBanner',
      'hubStallAwning',
      'pathLanternLamp',
      'wildTreeCrown',
      'zoneGateBeam',
    ]);
  });
});

describe('② 每一件都声明了落座身份', () => {
  it('没有漏声明的件（既不是顶层件、也没说挂在谁上面）', () => {
    const 漏 = 读数.filter((r) => r.落座 !== 顶层 && !String(r.落座).startsWith('on:'));
    expect(漏.map((r) => r.族)).toEqual([]);
  });
});

describe('③ 子件的父族必须存在、而且附近真有那个父件', () => {
  it('父族存在且是顶层件', () => {
    const 顶层族 = new Set(读数.filter((r) => r.落座 === 顶层).map((r) => r.族));
    const 断链 = 读数
      .filter((r) => String(r.落座).startsWith('on:'))
      .filter((r) => !顶层族.has(r.落座.slice(3)));
    expect(断链.map((r) => `${r.族} → ${r.落座}`)).toEqual([]);
  });

  it('附近那一格里真有那个父件（不许"挂在一个不存在的地方"）', () => {
    const 孤 = [];
    for (const r of 读数.filter((x) => String(x.落座).startsWith('on:'))) {
      const 父 = r.落座.slice(3);
      const 有父 = 读数.some((p) => p.族 === 父
        && Math.hypot(p.落点.x - r.落点.x, p.落点.z - r.落点.z) <= 父距容差);
      if (!有父) 孤.push(`${r.族} → ${父} @(${r.落点.x.toFixed(1)}, ${r.落点.z.toFixed(1)})`);
    }
    expect(孤).toEqual([]);
  });

  it('子件不许挂在父件底下（挂反了就是穿到地里去了）', () => {
    const 挂反 = [];
    for (const r of 读数.filter((x) => String(x.落座).startsWith('on:'))) {
      const 父 = r.落座.slice(3);
      const 父件们 = 读数.filter((p) => p.族 === 父);
      // 父族压根不存在时**跳过**：那件事由上一条（"父族存在且是顶层件"）点名，
      // 在这儿算出来的"挂反了"是误导 —— 空数组的 `Math.min` 是 Infinity，
      // 于是每一条都变成"挂反"，把真正的那条错名盖掉了。
      if (!父件们.length) continue;
      const 父底 = Math.min(...父件们.map((p) => p.底));
      if (r.底 < 父底 - LANDING_TOLERANCE) 挂反.push(`${r.族} 的底 ${r.底.toFixed(2)} 低于「${父}」的底 ${父底.toFixed(2)}`);
    }
    expect(挂反).toEqual([]);
  });
});

describe('④ 判据本身：喂坏数据必须点名（判据住在生产那一侧）', () => {
  const 好读数 = [
    件('hubBench', 0),
    件('wildTreeTrunk', 0),
    件('wildTreeCrown', 1.7, 挂于('wildTreeTrunk')),
  ];

  it('反向控制：好读数一条都不报（证明下面那些不是恒红）', () => {
    expect(落座问题(好读数, LANDING_TOLERANCE)).toEqual([]);
  });

  it('一件浮着 ⇒ 点名那一族与那几厘米', () => {
    const 问 = 落座问题([件('wildCrystal', 0.27)], LANDING_TOLERANCE);
    expect(问.join('\n')).toMatch(/wildCrystal/);
    expect(问.join('\n')).toMatch(/浮在地面之上 0\.27 米/);
  });

  it('漏声明身份 ⇒ 点名那一族', () => {
    const 问 = 落座问题([{ ...件('hubFountain', 0), 落座: null }], LANDING_TOLERANCE);
    expect(问.join('\n')).toMatch(/hubFountain/);
    expect(问.join('\n')).toMatch(/没有声明落座身份/);
  });

  it('父族不存在 ⇒ 点名"挂在谁上面"与那一族', () => {
    const 问 = 落座问题([件('hubBanner', 1.75, 挂于('hubBannerPole'))], LANDING_TOLERANCE);
    expect(问.join('\n')).toMatch(/hubBanner/);
    expect(问.join('\n')).toMatch(/hubBannerPole/);
    expect(问.join('\n')).toMatch(/不存在|不是顶层件/);
  });

  it('父族在远处 ⇒ 点名"那一格里没有"', () => {
    const 问 = 落座问题([
      件('wildTreeTrunk', 0),
      件('wildTreeCrown', 1.7, 挂于('wildTreeTrunk'), { x: 500, z: 500 }),
    ], LANDING_TOLERANCE);
    expect(问.join('\n')).toMatch(/wildTreeCrown/);
    expect(问.join('\n')).toMatch(/没有「wildTreeTrunk」的件/);
  });

  it('全标成子件 ⇒ 尺子被绕过去这件事本身要报出来', () => {
    const 问 = 落座问题([
      件('wildTreeCrown', 1.7, 挂于('wildTreeTrunk')),
      件('wildTreeTrunk', 0, 挂于('wildTreeCrown')),
    ], LANDING_TOLERANCE);
    expect(问.join('\n')).toMatch(/没有顶层件了/);
  });

  it('容差是判据自己给的（生产侧那一格），门禁不另抄一个数', () => {
    expect(LANDING_TOLERANCE).toBeGreaterThan(0);
    // 2 厘米：好状态离它 4000 倍余量（顶层件最大底差 4.9e-6 米），
    // 而"心高写死"那一族的本体（长椅 2.5 厘米、断柱 5 厘米）都在它上面。
    expect(LANDING_TOLERANCE).toBeLessThanOrEqual(0.05);
    // 容差之内不报、超出必报
    expect(落座问题([件('x', LANDING_TOLERANCE)], LANDING_TOLERANCE)).toEqual([]);
    expect(落座问题([件('x', LANDING_TOLERANCE + 0.01)], LANDING_TOLERANCE)).toHaveLength(1);
  });
});

describe('⑤ 钉子是钉子：这一层的读数由种子说了算', () => {
  it('同一颗种子两次读出的读数逐位相同', () => {
    const a = 量落座(buildSeededDecorations(world, 摆件种子), world);
    const b = 量落座(buildSeededDecorations(world, 摆件种子), world);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('不同种子读出不同的读数（否则上面那条钉的是空气）', () => {
    const a = 量落座(buildSeededDecorations(world, 摆件种子), world);
    const b = 量落座(buildSeededDecorations(world, 摆件种子 + 1), world);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});
