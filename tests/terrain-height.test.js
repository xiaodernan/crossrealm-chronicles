import { describe, it, expect } from 'vitest';
import {
  hubPlateau,
  continentalNoise,
  connectionTerrain,
  corridorRidge,
  sampleGlobalHeight,
  sampleGlobalHeightSmooth,
  sampleGroundNormal,
  hubPlazaWeight,
  HUB_PLAZA,
} from '../src/world/TerrainHeight.js';
import { HUB_ZONE } from '../src/content/ZoneIdentity.js';

/**
 * 替身区按 `BaseZone` 的形状给：`center` / `radius` / `distanceToCenter` / 区外交 `-Infinity`。
 * `sampleGlobalHeight` 的契约里 `zones` 就是 BaseZone 实例（区缘权重要读几何），
 * 只给一个 `getHeightAt` 的替身会把这条契约糊过去。
 */
const fakeZone = (x, z, h) => ({
  center: { x, z },
  radius: 40,
  distanceToCenter: (px, pz) => Math.hypot(px - x, pz - z),
  getHeightAt: (px, pz) =>
    (Math.hypot(px - x, pz - z) > 40 ? -Infinity : (px === x && pz === z ? h : 0)),
});

describe('TerrainHeight', () => {
  it('枢纽台地在中心最高、超出半径后归零', () => {
    expect(hubPlateau(0, 55)).toBeGreaterThan(3);
    expect(hubPlateau(0, 200)).toBe(0);
  });

  it('大陆噪声有界（保证 M1 碰撞层可用有限范围做空间哈希）', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let x = -600; x <= 600; x += 7) {
      for (let z = -600; z <= 600; z += 11) {
        const h = continentalNoise(x, z);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
    }
    expect(min).toBeGreaterThan(-25);
    expect(max).toBeLessThan(25);
  });

  it('走廊中心凹陷、两侧隆起', () => {
    const seg = [0, 55, 200, 80];
    const center = corridorRidge(100, 67.5, ...seg, 12);
    const ridge = corridorRidge(98.5, 79.4, ...seg, 12);
    const far = corridorRidge(100, 900, ...seg, 12);
    expect(far).toBe(0);
    expect(center).toBeLessThan(0);
    expect(ridge).toBeGreaterThan(center);
  });

  it('zone 高度参与取最大值', () => {
    const zones = [fakeZone(3, 4, 99)];
    expect(sampleGlobalHeight(3, 4, zones)).toBeGreaterThanOrEqual(99);
  });

  it('平滑采样与单点采样偏差很小（四角平均不应制造台阶）', () => {
    const raw = sampleGlobalHeight(37, -91, []);
    const smooth = sampleGlobalHeightSmooth(37, -91, []);
    expect(Math.abs(raw - smooth)).toBeLessThan(0.5);
  });

  it('法线为单位向量且朝上', () => {
    const n = sampleGroundNormal(10, 10, []);
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 5);
    expect(n.y).toBeGreaterThan(0);
  });
});

/**
 * 枢纽广场台面（#178C 还的那笔账，缺陷② 切片C）。
 *
 * 广场治的是"看不见"之外另一半的病：枢纽那一圈原本是**起伏近 20 米的山地** —— 泉池埋进坡、
 * 招牌柱与幡圈各站各的高度、玩家往坡上是逐帧被瞬移几米。切片A 把落脚点改成"整圈取中点"
 * 只解决了"整族埋没"，坡还在。这一片把台面交给地形函数本身：`sampleGlobalHeight` 是玩家、
 * 相机、装饰、POI、Boss 场共用的**唯一一个**地面读数出口，在装饰层里垫一块板子等于造出
 * 第二份地面 —— 那份地面没人读，摆件会站在空气上。
 *
 * ## 判据各有一种死法
 *
 * ① **平**：盘内起伏为 0，且台面法线朝正上。摘掉 `sampleGlobalHeight` 里的混合项，
 *    这条第一个红（起伏实测回到 19.6 米）。
 * ② **只在枢纽里平**（反向控制）：几何上出了 `r + skirt` 的那些点**逐位**等于三项和 ——
 *    用 `toBe` 而不是近似：那是同一条和式，本来就该一位不差。这条不替①作证（摘掉混合项
 *    它照样绿），它钉的是"广场没顺手把整个世界抹平"。总体按**几何**选，不按被审的
 *    `hubPlazaWeight` 选：权重被改成恒 1（全图摊平）时这里必须红，而不是拿到一份空集合。
 * ③ **水位不是我挑的数**：水位上下挪一米，盘内地形改动总量必须变大 —— 钉"挖方与填方相抵"
 *    这条 L1 最优性质，不在门禁里重抄一遍中位数算法（重抄 = 生产改了门禁还在按旧式放行）。
 * ④ **接痕不成崖**：过渡带里最陡的坡不得陡过这块地本来的坡。`skirt` 归零（台面边缘变成
 *    垂直台阶）红的就是这条。
 * ⑤ **同心且不越界**：台面与枢纽台地、`HUB_ZONE.center` 同心（盘心现在只有一份写法，
 *    抄成两份的那笔账由 臂4 收：搬中心会把水位、台面、枢纽家具三圈一起搬走，所以它只红
 *    这一条），且 盘 + 带 整张还在枢纽的归属半径里 —— 出了那一圈，大气与镜头归属就换人，
 *    台面不能伸到别人的地里。
 *
 * ## 变异臂（切片C 的落刀记录；每一把都可按"刀"那一列改生产常数复现，红名由非 TTY 输出解析）
 *
 * | 臂 | 刀 | 预测红 | 实测 | 超出预测的红 ⇒ 归因 |
 * | --- | --- | --- | --- | --- |
 * | 臂0 | 不落刀 | — | 0 红 | 基线 |
 * | 臂1 | 摘掉 `sampleGlobalHeight` 里的混合项 | ①＋埋没清单＋家具站在台面 | 3 红，无漏 | — |
 * | 臂2 | `PLAZA_SKIRT = 0` | ②b＋④＋⑤ | 4 红 | **①**：带宽归零后 `内缘 == 外缘 == 22`，整数格样本 (0,±22)、(±22,0) 先撞上 `d2 >= 外缘²` 那一支 ⇒ 盘缘一圈直接掉回自然地形。① 因此还兼钉"盘缘不成崖" |
 * | 臂3 | `level: 30`（挑一个数） | ③ | 2 红 | **④**：水位被抬到 30 m 后，16 米宽的要塞里要揉掉 18 米高差，接痕必然陡过本地自然的坡 |
 * | 臂4 | 盘心手抄成 (0,95) | ⑤ | 1 红，无漏 | 无 —— 这正是"抄不出第二份"的见证 |
 * | 臂5 | 带外权重不归零（改 0.02） | ②＋②b | 3 红 | **zone 高度参与取最大值**（老用例）：(3,4) 距盘心 51 m 在带外，2% 的漏就把它从 99 m 拽到 97.3 ⇒ 老判据也认得这条不变量 |
 *
 * 三条超出的红都是**多出来的证据**（同一把刀同时击穿两条独立判据），不是漏网的机制。
 */
const 自然和式 = (x, z) => continentalNoise(x, z) + connectionTerrain(x, z) + hubPlateau(x, z);

describe('枢纽广场台面', () => {
  const 心x = HUB_PLAZA.x;
  const 心z = HUB_PLAZA.z;

  it('① 盘内起伏为 0，站在台面上法线朝正上', () => {
    let lo = Infinity;
    let hi = -Infinity;
    let 样本数 = 0;
    for (let dx = -HUB_PLAZA.r; dx <= HUB_PLAZA.r; dx += 1) {
      for (let dz = -HUB_PLAZA.r; dz <= HUB_PLAZA.r; dz += 1) {
        if (Math.hypot(dx, dz) > HUB_PLAZA.r) continue;
        const h = sampleGlobalHeight(心x + dx, 心z + dz, []);
        if (h < lo) lo = h;
        if (h > hi) hi = h;
        样本数 += 1;
      }
    }
    expect(样本数, '盘内一个样本都没落到 ⇒ 这条在读空集合').toBeGreaterThan(1000);
    expect(hi - lo, `台面起伏 ${lo.toFixed(4)}→${hi.toFixed(4)} 共 ${(hi - lo).toFixed(3)} m ⇒ 混合项没把盘内揉平`).toBeLessThan(1e-9);
    expect(lo, '台面读数与 `HUB_PLAZA.level` 不是同一个数').toBeCloseTo(HUB_PLAZA.level, 9);
    const n = sampleGroundNormal(心x, 心z, []);
    expect(Math.abs(n.x), `台面法线 x 分量 ${n.x.toExponential(2)} ⇒ 站在台面上还在歪`).toBeLessThan(1e-9);
    expect(Math.abs(n.z), `台面法线 z 分量 ${n.z.toExponential(2)} ⇒ 站在台面上还在歪`).toBeLessThan(1e-9);
  });

  it('② 出了盘 + 带就逐位交回自然地形（反向控制：广场不抹平整个世界）', () => {
    const 外缘 = HUB_PLAZA.r + HUB_PLAZA.skirt + 0.5;
    const 带外 = [];
    for (let x = -260; x <= 260; x += 13) {
      for (let z = -260; z <= 260; z += 17) {
        if (Math.hypot(x - 心x, z - 心z) < 外缘) continue;
        带外.push([x, z]);
      }
    }
    expect(带外.length, '带外样本没几个 ⇒ 这条在空转').toBeGreaterThan(500);
    for (const [x, z] of 带外) {
      expect(sampleGlobalHeight(x, z, []), `(${x},${z}) 带外读数`).toBe(自然和式(x, z));
    }
  });

  it('②b 权重形状：盘内恒 1、带内严格下降、带外恒 0', () => {
    const 射线 = [];
    for (let d = 0; d <= HUB_PLAZA.r + HUB_PLAZA.skirt + 6; d += 0.5) {
      射线.push(hubPlazaWeight(心x, 心z + d));
    }
    expect(射线[0], '盘心权重').toBe(1);
    const 带内 = 射线.filter((w) => w > 0 && w < 1);
    expect(带内.length, '带内一个中间值都没有 ⇒ smoothstep 那一条被摘了').toBeGreaterThan(10);
    for (let i = 1; i < 射线.length; i += 1) {
      expect(射线[i] <= 射线[i - 1] + 1e-12, `r=${(i * 0.5).toFixed(1)} 处权重回升`).toBe(true);
    }
    expect(射线[射线.length - 1], '最外圈权重').toBe(0);
  });

  it('③ 水位取的是盘内改动总量最小的那一档（挖方与填方相抵）', () => {
    const 点们 = [];
    for (let dx = -HUB_PLAZA.r; dx <= HUB_PLAZA.r; dx += 1) {
      for (let dz = -HUB_PLAZA.r; dz <= HUB_PLAZA.r; dz += 1) {
        if (Math.hypot(dx, dz) > HUB_PLAZA.r) continue;
        点们.push(自然和式(心x + dx, 心z + dz));
      }
    }
    expect(点们.length, '盘内一个样本都没落到 ⇒ 这条在读空集合').toBeGreaterThan(1000);
    const 改动总量 = (L) => 点们.reduce((s, h) => s + Math.abs(h - L), 0);
    const 现值 = 改动总量(HUB_PLAZA.level);
    for (const 挪 of [-2, -1, 1, 2]) {
      const 挪后 = 改动总量(HUB_PLAZA.level + 挪);
      expect(挪后, `水位挪 ${挪} m 后盘内改动总量 ${现值.toFixed(0)}→${挪后.toFixed(0)} 没变大 ⇒ 水位不是最小改动那一档`).toBeGreaterThan(现值);
    }
  });

  it('④ 过渡带的接痕不比这块地本来的坡更陡', () => {
    const e = 0.5;
    const 坡度 = (f, x, z) => Math.hypot(f(x + e, z) - f(x - e, z), f(x, z + e) - f(x, z - e)) / (2 * e);
    let 合成最陡 = 0;
    let 自然最陡 = 0;
    let 样本数 = 0;
    const 外缘 = HUB_PLAZA.r + HUB_PLAZA.skirt;
    for (let dx = -外缘; dx <= 外缘; dx += 1) {
      for (let dz = -外缘; dz <= 外缘; dz += 1) {
        const r = Math.hypot(dx, dz);
        if (r < HUB_PLAZA.r || r > 外缘) continue;
        const x = 心x + dx;
        const z = 心z + dz;
        样本数 += 1;
        合成最陡 = Math.max(合成最陡, 坡度((px, pz) => sampleGlobalHeight(px, pz, []), x, z));
        自然最陡 = Math.max(自然最陡, 坡度(自然和式, x, z));
      }
    }
    expect(样本数, '带内一个样本都没落到 ⇒ 这条在读空集合').toBeGreaterThan(1000);
    expect(合成最陡, `带内最陡 ${合成最陡.toFixed(2)}（自然 ${自然最陡.toFixed(2)}）⇒ 台面边缘成了崖`).toBeLessThanOrEqual(自然最陡 + 1e-6);
  });

  it('⑤ 台面与枢纽同心，且盘 + 带整张还在枢纽归属半径里', () => {
    expect([HUB_PLAZA.x, HUB_PLAZA.z], '广场中心没跟着 `HUB_ZONE.center` 走').toEqual([HUB_ZONE.center.x, HUB_ZONE.center.z]);
    expect(
      HUB_PLAZA.r + HUB_PLAZA.skirt,
      `盘 + 带 = ${HUB_PLAZA.r + HUB_PLAZA.skirt} m 伸出了枢纽归属半径 ${HUB_ZONE.radius} m`
    ).toBeLessThanOrEqual(HUB_ZONE.radius);
    expect(HUB_PLAZA.skirt, '过渡带宽度是混合的命门：归零就是把接痕做成垂直台阶').toBeGreaterThan(0);
  });
});
