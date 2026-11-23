/**
 * 天象（B178）—— **真实数据**驱动的夜空。
 *
 * ## 这一片在钉什么
 *
 * `src/world/WorldEffects.js` 的星场曾经是 800 个 `Math.random()` 白点：
 * 没有一颗是真星、永远不转、也不对应任何一个时刻。
 * 那是"演示数据堆砌"的典型 —— 画面上有个东西占着位置，但那个位置**没有信息**。
 *
 * 这一片把它换成**真数据**：
 *
 * - **真实亮星表**（J2000 赤经赤纬 / 视星等 / 光谱色）——
 *   判据不是"表里有 50 行"，而是"每一行的坐标与星等都落在真实取值域内，
 *   且最亮的那颗**就是天狼星**（−1.44）"；
 * - **真实月相** —— 判据是"**2026 年真实的朔日相位必须是 0、真实的望日必须是 0.5**"
 *   （25 个真实时刻逐条点名）。这一条最硬：它把"月相算法"与"真实月相日历"绑在一起，
 *   换成"差不多像"就会当场红；
 * - **真实太阳赤纬** —— 夏至 ≈ +23.44°、冬至 ≈ −23.44°（地轴倾角）；
 * - **真实二十四节气** —— 24 条，中英名齐，四季各 6 条。
 *
 * ## 三条纪律
 *
 * 1. **判据住生产代码**：`月相()` / `太阳赤纬()` / `节气()` / `天球向量()` / `星等映射()`
 *    都在 `src/content/astronomy.js`，这里只喂坏数据、只核对真实数据的性质。
 * 2. **不读墙钟**：月相的输入是**世界日**（游戏里的第几天）。
 * 3. **星空只有一个主人**：`WorldEffects` 那份重复的随机星场必须消失（静态腿钉住）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import {
  月相,
  太阳赤纬,
  节气,
  距纪元天,
  反推日期,
  天球向量,
  星等映射,
  真实朔,
  真实望,
  亮星表,
  节气表,
  朔望月,
  地轴倾角,
  相名,
  太阳黄经,
  黄道赤道,
  太阳赤道坐标,
  月亮赤道坐标,
} from '../src/content/astronomy.js';
import {
  CelestialSphere,
  天球半径,
  默认纬度,
  月视直径,
  正午时刻,
  星顶点着色器,
  月顶点着色器,
  月面片元着色器,
} from '../src/world/CelestialSphere.js';

const ROOT = process.cwd();
const 游戏源文 = readFileSync(join(ROOT, 'src/core/Game.js'), 'utf8');
const 效果源文 = readFileSync(join(ROOT, 'src/world/WorldEffects.js'), 'utf8');
const 天球源文 = readFileSync(join(ROOT, 'src/world/CelestialSphere.js'), 'utf8');

/** 剥掉注释（只留代码）—— 注释里提到旧实现不算现行代码 */
const 去注释 = (源) => 源
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** 真实朔/望的世界日 */
const 时刻 = (表项) => 距纪元天(2026, 表项.月, 表项.日 + 表项.时 / 24);

/** 两个单位向量之间的夹角（度） */
const 夹角 = (甲, 乙) => {
  const 点积 = Math.max(-1, Math.min(1, 甲.x * 乙.x + 甲.y * 乙.y + 甲.z * 乙.z));
  return (Math.acos(点积) * 180) / Math.PI;
};

/** 建一个天球（真场景、真材质，只是没有 WebGL 上下文） */
const 建天球 = () => {
  const 场景 = new THREE.Scene();
  const 天球 = new CelestialSphere(场景);
  return { 场景, 天球 };
};

/** 与游戏同参的相机（`core/Game.js` 里那一个：55° 视角、远裁剪面 2500） */
const 建相机 = () => new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 2500);

describe('天象（B178）—— 真实数据驱动的夜空', () => {
  describe('① 月相：锚在真实的朔与望上', () => {
    it('2026 年**每一个真实的朔日**相位都是 0（照亮比 0）', () => {
      expect(真实朔.length, '真实朔表不该是空的').toBe(12);
      for (const s of 真实朔) {
        const m = 月相(时刻(s));
        expect(m.相位, `${s.月} 月 ${s.日} 日是真实的朔，相位却不是 0`).toBeCloseTo(0, 9);
        expect(m.照亮比, `${s.月} 月 ${s.日} 日是真实的朔，照亮比却不是 0`).toBeLessThan(0.0005);
      }
    });

    it('2026 年**每一个真实的望日**相位都是 0.5（照亮比 1）', () => {
      expect(真实望.length, '真实望表不该是空的').toBe(13);
      for (const f of 真实望) {
        const m = 月相(时刻(f));
        expect(m.相位, `${f.月} 月 ${f.日} 日是真实的望，相位却不是 0.5`).toBeCloseTo(0.5, 9);
        expect(m.照亮比, `${f.月} 月 ${f.日} 日是真实的望，照亮比却不是 1`).toBeGreaterThan(0.9995);
      }
    });

    it('照亮比就是真实定义 (1 − cos 2π·相位)/2（逐点对账）', () => {
      for (let d = 0; d < 90; d += 0.37) {
        const m = 月相(d);
        const 期望 = (1 - Math.cos(2 * Math.PI * m.相位)) / 2;
        expect(m.照亮比, `第 ${d.toFixed(2)} 天的照亮比不是定义式`).toBeCloseTo(期望, 12);
        expect(m.照亮比).toBeGreaterThanOrEqual(0);
        expect(m.照亮比).toBeLessThanOrEqual(1);
      }
    });

    it('相位连续：不会在中间跳变（一个朔望月里相位只涨不跳）', () => {
      let 前 = 月相(0).相位;
      for (let d = 0.25; d < 120; d += 0.25) {
        const 今 = 月相(d).相位;
        let 差 = Math.abs(今 - 前);
        if (差 > 0.5) 差 = 1 - 差;   // 0/1 处的环绕
        expect(差, `第 ${d.toFixed(2)} 天相位跳了 ${差.toFixed(4)}`).toBeLessThan(0.035);
        前 = 今;
      }
    });

    it('朔望月长度是真实的那一个（29 天 12 时 44 分 3 秒）', () => {
      expect(朔望月).toBeCloseTo(29.530588853, 9);
      // 相邻两个真实朔的真实间隔在 29.3–29.9 天之间（椭圆的摄动）
      for (let i = 1; i < 真实朔.length; i++) {
        const 间隔 = 时刻(真实朔[i]) - 时刻(真实朔[i - 1]);
        expect(间隔, `第 ${i} 个朔的间隔 ${间隔.toFixed(3)} 天不真实`).toBeGreaterThan(29.2);
        expect(间隔).toBeLessThan(29.9);
      }
    });

    it('八个相名齐（中英各一份），且相位落在哪一相就报哪一相', () => {
      expect(相名.length).toBe(8);
      for (const 名 of 相名) {
        expect(名.zh.length, `相名缺中文：${JSON.stringify(名)}`).toBeGreaterThan(0);
        expect(名.en.length, `相名缺英文：${JSON.stringify(名)}`).toBeGreaterThan(0);
      }
      // 新月当天的名字就是"新月"、望日就是"满月"
      expect(月相(时刻(真实朔[0])).名.zh).toBe('新月');
      expect(月相(时刻(真实望[0])).名.zh).toBe('满月');
    });
  });

  describe('② 太阳赤纬：真实的地轴倾角', () => {
    it('夏至 ≈ +23.44°、冬至 ≈ −23.44°', () => {
      const 夏 = 太阳赤纬(距纪元天(2026, 6, 21));
      const 冬 = 太阳赤纬(距纪元天(2026, 12, 22));
      expect(夏, `夏至赤纬 ${夏.toFixed(3)} 不对`).toBeCloseTo(地轴倾角, 1);
      expect(冬, `冬至赤纬 ${冬.toFixed(3)} 不对`).toBeCloseTo(-地轴倾角, 1);
    });

    it('赤纬永远落在 ±地轴倾角之内（真实世界的硬上限）', () => {
      for (let d = 0; d < 365; d += 1) {
        const δ = 太阳赤纬(d);
        expect(Number.isFinite(δ), `第 ${d} 天的赤纬不是有限数`).toBe(true);
        expect(Math.abs(δ), `第 ${d} 天的赤纬 ${δ.toFixed(3)} 越界`).toBeLessThanOrEqual(地轴倾角 + 1e-9);
      }
    });
  });

  describe('③ 二十四节气：真实的那一张', () => {
    it('24 条，中英名齐，四季各 6 条', () => {
      expect(节气表.length).toBe(24);
      const 季 = {};
      for (const j of 节气表) {
        expect(j.名.zh.length, `节气缺中文：${JSON.stringify(j.名)}`).toBeGreaterThan(0);
        expect(j.名.en.length, `节气缺英文：${JSON.stringify(j.名)}`).toBeGreaterThan(0);
        expect(j.月).toBeGreaterThanOrEqual(1);
        expect(j.月).toBeLessThanOrEqual(12);
        expect(j.日).toBeGreaterThanOrEqual(1);
        expect(j.日).toBeLessThanOrEqual(31);
        季[j.季] = (季[j.季] ?? 0) + 1;
      }
      expect(季).toEqual({ 春: 6, 夏: 6, 秋: 6, 冬: 6 });
    });

    it('节气(某日) 报的是那天真实所在的节气', () => {
      expect(节气(距纪元天(2026, 3, 21)).名.zh, '三月二十一该是春分').toBe('春分');
      expect(节气(距纪元天(2026, 12, 22)).名.zh, '十二月二十二该是冬至').toBe('冬至');
      expect(节气(距纪元天(2026, 8, 7)).名.zh, '八月七号该是立秋').toBe('立秋');
      expect(节气(距纪元天(2026, 6, 21)).季).toBe('夏');
    });

    it('距下一个节气是正的（表没排错）', () => {
      for (let d = 0; d < 365; d += 7) {
        const j = 节气(d);
        expect(j.距下一个, `第 ${d} 天距下一个节气是 ${j.距下一个}`).toBeGreaterThan(0);
        expect(j.距下一个).toBeLessThan(40);
      }
    });
  });

  describe('④ 亮星表与天球坐标', () => {
    it('表够大，且每一行都落在真实取值域里', () => {
      expect(亮星表.length, '亮星表太少 —— 夜空撑不起"宏大"').toBeGreaterThanOrEqual(50);
      for (const 星 of 亮星表) {
        expect(星.名.zh.length, `星星缺中文名：${JSON.stringify(星.名)}`).toBeGreaterThan(0);
        expect(星.名.en.length, `星星缺英文名：${JSON.stringify(星.名)}`).toBeGreaterThan(0);
        expect(星.赤经, `${星.名.en} 的赤经越界`).toBeGreaterThanOrEqual(0);
        expect(星.赤经).toBeLessThan(24);
        expect(星.赤纬, `${星.名.en} 的赤纬越界`).toBeGreaterThanOrEqual(-90);
        expect(星.赤纬).toBeLessThanOrEqual(90);
        expect(星.星等, `${星.名.en} 的星等越界`).toBeGreaterThan(-1.5);
        expect(星.星等).toBeLessThan(6);
        expect(星.色).toBeGreaterThan(0);
        expect(星.色).toBeLessThanOrEqual(0xffffff);
      }
    });

    it('最亮的那颗**就是天狼星**（视星等 −1.44）—— 表没排错', () => {
      const 最亮 = 亮星表.reduce((a, b) => (b.星等 < a.星等 ? b : a));
      expect(最亮.名.en).toBe('Sirius');
      expect(最亮.星等).toBeCloseTo(-1.44, 2);
    });

    it('天球向量是单位向量；天极与赤经零点的方位对得上', () => {
      const v = 天球向量(6.75, -16.7);
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 12);
      const 北 = 天球向量(0, 90);
      expect(北.y).toBeCloseTo(1, 9);
      expect(Math.hypot(北.x, 北.z)).toBeCloseTo(0, 9);
      const 赤道零 = 天球向量(0, 0);
      expect(赤道零.x).toBeCloseTo(1, 9);
      expect(赤道零.z).toBeCloseTo(0, 9);
    });

    it('星等映射是单调的：越亮 ⇒ 越大越亮', () => {
      let 前 = 星等映射(4);
      for (const 等 of [3, 2, 1, 0, -1.44]) {
        const 今 = 星等映射(等);
        expect(今.大小, `${等} 等星比 ${等 + 1} 等星还小`).toBeGreaterThan(前.大小);
        expect(今.亮度).toBeGreaterThan(前.亮度);
        前 = 今;
      }
    });
  });

  describe('⑤ 接线：星空只有一个主人', () => {
    it('Game 建了天球，并把时刻 / 世界日交给它', () => {
      expect(游戏源文).toMatch(/this\.celestial = this\._adopt\('world\/CelestialSphere'/);
      expect(游戏源文).toMatch(/this\.celestial\?\.update\(\{[^}]*时刻: this\.timeOfDay/);
      expect(游戏源文).toMatch(/世界天: this\.世界日/);
      // 昼夜**不再**喂给天球 —— 星星的可见性按**真太阳高度**算
      // （太阳沉到地平线以下才出星星；用游戏自己的"昼夜"亮度当开关，
      //   等于让星星跟着美术参数走，而不是跟着天文学走）。
      expect(游戏源文, '天球不该再吃昼夜').not.toMatch(/this\.celestial\?\.update\(\{[^}]*昼夜/);
    });

    it('太阳方向全仓只有**一份**（Game 不再另抄一份算式）', () => {
      expect(游戏源文, '天空的太阳位置应直接读天球算出来的那一份').toMatch(/sunPosition\.value\.copy\(太阳\)/);
      expect(游戏源文, 'Game 里不该还有手写的太阳算式').not.toMatch(/sunPosition\.value\.set\(/);
      expect(游戏源文, '直射光也应从太阳那边来').toMatch(/addScaledVector\(方向, 100\)/);
    });

    it('世界日只在跨零点时 +1（不是每帧乱加）', () => {
      expect(游戏源文).toMatch(/if \(this\.timeOfDay < 前时刻\) this\.世界日 \+= 1/);
    });

    it('**旧的随机星场没了**：WorldEffects 不再撒 800 个随机白点', () => {
      // 两份随机星场叠在太空区（WorldEffects 一份 + SpaceZone 一份）——
      // 而真正的星空现在归天球管。星空只能有一个主人。
      expect(去注释(效果源文), 'WorldEffects 里还有旧星场').not.toMatch(/buildStarField|starField/);
      expect(去注释(效果源文), 'WorldEffects 里还在撒随机星点').not.toMatch(/pos\[i \* 3\] = \(Math\.random\(\) - 0\.5\) \* 600/);
      // 流星改按区开关
      expect(效果源文).toMatch(/if \(!this\.太空区\) return/);
    });

    it('天球自己管自己的生死（有 dispose），且深度钉在远平面', () => {
      expect(天球源文).toMatch(/dispose\(\)/);
      // **逐段**断言：星场与月面各钉一次。
      // （变异臂实测：早先只断言"整文件里有 gl_Position.z = gl_Position.w"这一处 ——
      //   摘掉**星场**那一处、月面那一处还在，这条腿照样绿 ⇒ 门禁被自己糊弄了。）
      expect(星顶点着色器, '星场的深度没钉在远平面 ⇒ 会被 2500 的远裁剪面切掉')
        .toMatch(/gl_Position\.z = gl_Position\.w/);
      expect(月顶点着色器, '月面的深度没钉在远平面').toMatch(/gl_Position\.z = gl_Position\.w/);
      expect(天球源文).toMatch(/frustumCulled = false/);
    });

    it('月亮按**真实视直径 0.52°** 画（不是随手一个圆盘）', () => {
      expect(天球源文).toMatch(/月视直径 = 0\.52/);
      expect(天球源文).toMatch(/Math\.tan\(THREE\.MathUtils\.degToRad\(月视直径 \/ 2\)\)/);
    });

    it('星场的数据来自真实表（不是 Math.random）', () => {
      expect(天球源文).toMatch(/import \{[^}]*亮星表/);
      // 只量**代码**：注释里提到旧实现的那句 Math.random 不算（那是病史，不是现行代码）
      expect(去注释(天球源文), '天球里不许有 Math.random').not.toMatch(/Math\.random/);
    });
  });

  describe('⑥ 反向控制：坏数据当场被点名', () => {
    it('越界的赤经 / 赤纬 / 坏星等 ⇒ 当场抛（不静默兜一个近似值）', () => {
      expect(() => 天球向量(24, 0)).toThrow();
      expect(() => 天球向量(-0.1, 0)).toThrow();
      expect(() => 天球向量(0, 91)).toThrow();
      expect(() => 天球向量(0, -91)).toThrow();
      expect(() => 天球向量(NaN, 0)).toThrow();
      expect(() => 星等映射(NaN)).toThrow();
      expect(() => 月相(NaN)).toThrow();
      expect(() => 月相(Infinity)).toThrow();
      expect(() => 太阳赤纬(NaN)).toThrow();
      expect(() => 距纪元天(2026, 13, 1)).toThrow();
      expect(() => 距纪元天(2026, 0, 1)).toThrow();
    });

    it('日期与天数互推自洽（喂一天，还回那一天）', () => {
      for (const [月, 日] of [[1, 1], [3, 15], [6, 21], [12, 22], [12, 31]]) {
        const 天 = 距纪元天(2026, 月, 日);
        const 回 = 反推日期(天);
        expect(回.年, `${月}-${日} 的年推错了`).toBe(2026);
        expect(回.月, `${月}-${日} 的月推错了`).toBe(月);
        expect(回.日, `${月}-${日} 的日推错了`).toBeCloseTo(日, 6);
      }
    });
  });

  describe('⑦ 渲染层：数据对 ≠ 画出来了（这一组只问"画没画"）', () => {
    it('星点几何与真实亮星表一一对应（数量、坐标、逐星大小）', () => {
      const { 天球 } = 建天球();
      const 几何 = 天球.星点.geometry;
      expect(几何.attributes.position.count, '几何里的星点数与真实表对不上').toBe(亮星表.length);
      expect(几何.attributes.aSize.count).toBe(亮星表.length);
      expect(几何.attributes.aColor.count).toBe(亮星表.length);
      亮星表.forEach((星, i) => {
        const v = 天球向量(星.赤经, 星.赤纬);
        // 几何缓冲是 float32 ⇒ 用**相对误差**对账（绝对容差会被 40000 这个量级放大）
        const 对账 = (实际, 期望, 名) => {
          expect(Math.abs(实际 / 期望 - 1), `${星.名.en} 的${名}对不上`).toBeLessThan(1e-6);
        };
        对账(几何.attributes.position.getX(i), v.x * 天球半径, '位置');
        对账(几何.attributes.position.getY(i), v.y * 天球半径, '位置');
        对账(几何.attributes.position.getZ(i), v.z * 天球半径, '位置');
        expect(几何.attributes.aSize.getX(i), `${星.名.en} 的大小对不上`).toBeCloseTo(星等映射(星.星等).大小, 6);
      });
      天球.dispose();
    });

    it('点尺寸下限 ≥ 1 px（亚像素的点精灵会被驱动舍掉 —— 那颗星就凭空消失）', () => {
      for (const 星 of 亮星表) {
        expect(星等映射(星.星等).大小, `${星.名.en} 映射出了亚像素的点`).toBeGreaterThanOrEqual(1);
      }
      expect(星等映射(-1.44).大小, '最亮的星不能糊满屏').toBeLessThanOrEqual(4.2);
      // 着色器里再兜一道：两条都留着
      expect(天球源文).toMatch(/gl_PointSize = max\(1\.0, aSize \* uPixelRatio\)/);
    });

    it('反向控制：相机对准天狼星 —— 不钉深度会被 2500 的远裁剪面切掉，钉了才在屏内', () => {
      const { 天球 } = 建天球();
      天球.update({ 时刻: 正午时刻, 世界天: 0 });
      const 世界 = new THREE.Vector3()
        .fromBufferAttribute(天球.星点.geometry.attributes.position, 0)
        .applyMatrix4(天球.星点.matrixWorld);
      const 相机 = 建相机();
      相机.position.set(0, 0, 0);
      相机.lookAt(世界.x, 世界.y, 世界.z);
      相机.updateMatrixWorld(true);

      const 裁剪 = new THREE.Vector4(世界.x, 世界.y, 世界.z, 1)
        .applyMatrix4(相机.matrixWorldInverse)
        .applyMatrix4(相机.projectionMatrix);
      // 不钉深度：远裁剪面只有 2500，而天球在 40000 ⇒ z > 1（被裁掉）
      const 未钉 = 裁剪.clone().divideScalar(裁剪.w);
      expect(未钉.z, '没钉深度时天狼星居然还在裁剪面内 —— 判据本身失效了').toBeGreaterThan(1);
      // 钉在远平面：z = w ⇒ 正好落在远平面上，x/y 仍在屏内
      const 钉 = 裁剪.clone();
      钉.z = 裁剪.w;
      钉.divideScalar(钉.w);
      expect(钉.z).toBeCloseTo(1, 9);
      expect(Math.abs(钉.x), '钉深度后天狼星跑到屏外了').toBeLessThanOrEqual(1);
      expect(Math.abs(钉.y)).toBeLessThanOrEqual(1);
      // 钉深度这件事本身得**写在星场那一段着色器里**（否则 JS 侧再对也不算数）
      expect(星顶点着色器, '着色器没把深度钉在远平面 ⇒ 天球会被 2500 的远裁剪面切掉')
        .toMatch(/gl_Position\.z = gl_Position\.w/);
      天球.dispose();
    });

    it('月面的终结线：弦的半宽 = cos(2π·相位)（照亮比 = (1−k)/2），盈在右、亏在左', () => {
      // 着色器的分支不许反：盈时亮面在右（上弦的右边亮），亏时亮面在左
      expect(月面片元着色器, '盈月的亮面方向反了').toMatch(/uPhase < 0\.5\s*\?\s*step\(k \* edge \+ 0\.002, p\.x\)/);
      expect(月面片元着色器, '亏月的亮面方向反了').toMatch(/step\(p\.x, -k \* edge - 0\.002\)/);
      expect(月面片元着色器).toMatch(/float k = cos\(6\.283185307179586 \* uPhase\)/);
      // 数据侧：弦半宽与照亮比必须对得上（照亮比 = (1 − cos 2π·相位)/2）
      for (const 世界天 of [0, 5, 12, 17.5, 22, 30]) {
        const 相 = 月相(世界天);
        const k = Math.cos(2 * Math.PI * 相.相位);
        expect((1 - k) / 2, `第 ${世界天} 天的弦半宽与照亮比对不上`).toBeCloseTo(相.照亮比, 12);
      }
    });

    it('月亮的世界方向 = 真黄经差算出来的赤道向量（接线没走偏）', () => {
      const { 天球 } = 建天球();
      const 世界天 = 17.5;
      const 时刻 = 0.25 + 0.13;
      天球.update({ 时刻, 世界天 });
      const 坐标 = 月亮赤道坐标(世界天);
      const 赤道 = 天球向量(坐标.赤经时, 坐标.赤纬);
      // 期望方向 = 赤道向量经"时角 + 天极倾斜"两级变换（与生产同一套变换）
      const 期望 = new THREE.Vector3(赤道.x, 赤道.y, 赤道.z)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), 天球.星空.rotation.y)
        .applyQuaternion(天球.天穹.getWorldQuaternion(new THREE.Quaternion()));
      const 实测 = 天球.月亮.position.clone().normalize();
      expect(夹角(期望, 实测), '月亮的位置与真实黄经差不符').toBeLessThan(0.01);
      天球.dispose();
    });

    it('月亮按**真实视直径 0.52°** 画（角直径对账，不是随手一个圆盘）', () => {
      const { 天球 } = 建天球();
      const 宽 = 天球.月亮.geometry.parameters.width;
      const 角 = (2 * Math.atan(宽 / 2 / 天球半径) * 180) / Math.PI;
      expect(角, `月亮的角直径是 ${角.toFixed(3)}°`).toBeCloseTo(月视直径, 3);
      天球.dispose();
    });

    it('太阳沉到地平线以下，星星才出来（正午整片藏起来）', () => {
      const { 天球 } = 建天球();
      天球.update({ 时刻: 正午时刻, 世界天: 0 });
      expect(天球.星材质.uniforms.uOpacity.value, '正午竟有星星').toBe(0);
      expect(天球.星点.visible).toBe(false);
      expect(天球.月亮.visible).toBe(false);
      天球.update({ 时刻: 正午时刻 + 0.5, 世界天: 0 });
      expect(天球.星材质.uniforms.uOpacity.value, '夜里没有星星').toBeGreaterThan(0.9);
      expect(天球.星点.visible).toBe(true);
      expect(天球.读数().太阳高度, '午夜太阳竟还在天上').toBeLessThan(0);
      天球.dispose();
    });

    it('月面的相位 uniform = 真实月相算出来的相位（同一份真源）', () => {
      const { 天球 } = 建天球();
      for (const 世界天 of [0, 17.5, 33.2, 120.7]) {
        天球.update({ 时刻: 正午时刻, 世界天 });
        expect(天球.月材质.uniforms.uPhase.value, `第 ${世界天} 天的相位对不上`)
          .toBeCloseTo(月相(世界天).相位, 9);
      }
      天球.dispose();
    });

    it('星空绕**天极**转：拨四分之一天，转 90°（时刻 0.25 = 正午）', () => {
      const { 天球 } = 建天球();
      天球.update({ 时刻: 正午时刻, 世界天: 0 });
      const 前 = 天球.星空.rotation.y;
      天球.update({ 时刻: 正午时刻 + 0.25, 世界天: 0 });
      const 后 = 天球.星空.rotation.y;
      expect(后 - 前).toBeCloseTo(-Math.PI / 2, 9);
      天球.dispose();
    });

    it('dispose 之后不留一个孤儿（场景里没有它了）', () => {
      const { 场景, 天球 } = 建天球();
      expect(场景.children).toContain(天球.group);
      天球.dispose();
      expect(场景.children).not.toContain(天球.group);
      expect(天球.星点, 'dispose 后星点还挂着').toBeNull();
      expect(天球.月亮).toBeNull();
    });
  });

  describe('⑧ 天极的真实几何：北极星的高度 = 观察者纬度', () => {
    it('天极落在"北边、高度 = 纬度"上', () => {
      const { 天球 } = 建天球();
      天球.update({ 时刻: 正午时刻, 世界天: 0 });
      const 天极 = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(天球.天穹.getWorldQuaternion(new THREE.Quaternion()));
      const 高度 = (Math.asin(天极.y) * 180) / Math.PI;
      expect(高度, `天极的高度是 ${高度.toFixed(2)}°，应当等于纬度 ${默认纬度}°`).toBeCloseTo(默认纬度, 6);
      expect(天极.z, '天极该朝北（−Z）').toBeLessThan(0);
      天球.dispose();
    });

    it('同一把尺量两颗星：北极星几乎不动（它就站在天极上），天狼星动得很厉害', () => {
      const { 天球 } = 建天球();
      const 北极星 = 亮星表.findIndex((星) => 星.名.en === 'Polaris');
      const 天狼星 = 亮星表.findIndex((星) => 星.名.en === 'Sirius');
      expect(北极星, '亮星表里没有北极星').toBeGreaterThanOrEqual(0);
      expect(天狼星, '亮星表里没有天狼星').toBeGreaterThanOrEqual(0);
      const 读高度 = (索引, 时刻) => {
        天球.update({ 时刻, 世界天: 0 });
        const 世界 = new THREE.Vector3()
          .fromBufferAttribute(天球.星点.geometry.attributes.position, 索引)
          .applyMatrix4(天球.星点.matrixWorld)
          .normalize();
        return (Math.asin(世界.y) * 180) / Math.PI;
      };
      const 幅度 = (索引) => {
        const 们 = [];
        for (let i = 0; i < 16; i++) 们.push(读高度(索引, i / 16));
        return { 幅度: Math.max(...们) - Math.min(...们), 们 };
      };
      const 北 = 幅度(北极星);
      const 天 = 幅度(天狼星);
      expect(北.幅度, '北极星一天不该动好几度（它离天极只有 0.7°）').toBeLessThan(2);
      expect(天.幅度, '天狼星一天里高度几乎不变 —— 星空没转').toBeGreaterThan(60);
      expect(天.幅度, '两颗星用同一把尺 —— 说明测的不是"绕天极"').toBeGreaterThan(北.幅度 * 20);
      expect(Math.min(...天.们), '天狼星一天都没落到地平线下 —— 算错了').toBeLessThan(0);
      天球.dispose();
    });

    it('北极星的高度 = 纬度 ± 1°（真实天文学的核心事实）', () => {
      const { 天球 } = 建天球();
      const 索引 = 亮星表.findIndex((星) => 星.名.en === 'Polaris');
      for (const 时刻 of [0, 0.25, 0.5, 0.75]) {
        天球.update({ 时刻, 世界天: 0 });
        const 世界 = new THREE.Vector3()
          .fromBufferAttribute(天球.星点.geometry.attributes.position, 索引)
          .applyMatrix4(天球.星点.matrixWorld)
          .normalize();
        const 高度 = (Math.asin(世界.y) * 180) / Math.PI;
        expect(Math.abs(高度 - 默认纬度), `时刻 ${时刻} 时北极星的高度 ${高度.toFixed(2)}° 离纬度太远`)
          .toBeLessThan(1);
      }
      天球.dispose();
    });
  });

  describe('⑨ 月亮的真实角距：月相不只是数值，还是几何', () => {
    /** 太阳与月亮在赤道系里的单位向量 */
    const 两向量 = (世界天) => {
      const 太阳 = 太阳赤道坐标(世界天);
      const 月 = 月亮赤道坐标(世界天);
      return {
        太阳: 天球向量(太阳.赤经时, 太阳.赤纬),
        月: 天球向量(月.赤经时, 月.赤纬),
      };
    };

    it('月与太阳的角距 = 月相 × 360°（朔 0°、上弦 90°、望 180°）', () => {
      for (const 世界天 of [0, 5, 12.4, 17.5, 20, 30, 45, 88]) {
        const 相 = 月相(世界天);
        const { 太阳, 月 } = 两向量(世界天);
        const 实测 = 夹角(太阳, 月);
        const 期望 = Math.min(相.相位 * 360, 360 - 相.相位 * 360);
        expect(Math.abs(实测 - 期望), `第 ${世界天} 天：月与太阳夹角 ${实测.toFixed(2)}°，期望 ${期望.toFixed(2)}°`)
          .toBeLessThan(0.5);
      }
    });

    it('真实朔日：月亮与太阳**同方向**（角距 0°）', () => {
      for (const s of 真实朔) {
        const 天 = 时刻(s);
        const { 太阳, 月 } = 两向量(天);
        expect(夹角(太阳, 月), `${s.月} 月 ${s.日} 日是朔，月亮却不在太阳那边`).toBeLessThan(0.5);
      }
    });

    it('真实望日：月亮与太阳**正对着**（角距 180°）', () => {
      for (const f of 真实望) {
        const 天 = 时刻(f);
        const { 太阳, 月 } = 两向量(天);
        expect(Math.abs(夹角(太阳, 月) - 180), `${f.月} 月 ${f.日} 日是望，月亮却没在太阳对面`)
          .toBeLessThan(0.5);
      }
    });

    it('黄道 → 赤道的换算自洽：赤纬 = asin(sin ε · sin λ)，赤经在赤道上', () => {
      for (const 黄经 of [0, 45, 90, 180, 270, 359]) {
        const 换 = 黄道赤道(黄经);
        expect(换.赤纬, `黄经 ${黄经}° 的赤纬不对`).toBeCloseTo(
          (Math.asin(Math.sin((地轴倾角 * Math.PI) / 180) * Math.sin((黄经 * Math.PI) / 180)) * 180) / Math.PI, 9,
        );
        expect(换.赤经时).toBeGreaterThanOrEqual(0);
        expect(换.赤经时).toBeLessThan(24);
      }
      // 春分点的黄经 = 0 ⇒ 赤经 = 0、赤纬 = 0
      expect(黄道赤道(0).赤纬).toBeCloseTo(0, 9);
      expect(黄道赤道(0).赤经时).toBeCloseTo(0, 6);
      // 夏至（黄经 90°）⇒ 赤纬 = 地轴倾角
      expect(黄道赤道(90).赤纬).toBeCloseTo(地轴倾角, 6);
    });

    it('太阳的平黄经：春分落在 3 月 20 日前后（误差 ±2 天，写在注释里的那个口径）', () => {
      const 春分 = 距纪元天(2026, 3, 20);
      expect(Math.abs(((太阳黄经(春分) + 180) % 360) - 180), '春分点的黄经不是 0').toBeLessThan(2.5);
      // 一年转一圈
      const 明 = 太阳黄经(春分 + 365);
      expect(Math.abs(((明 - 太阳黄经(春分) + 180) % 360) - 180), '黄经一年没转回原处').toBeLessThan(1.5);
    });
  });
});
