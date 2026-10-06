/**
 * 色彩分级的运行期载体（W-C4 切片4）：composer 链上的分级 pass 是它的唯一输出。
 *
 * ## 为什么站在 OutputPass 之前
 * 分级是**线性空间**的操作（增益/饱和度/对比度在 ACES 与 sRGB 编码之前做才有
 * 物理意义）。composer-chain 门禁立了铁律：OutputPass 是链上唯一允许站链尾的
 * pass，后续一切 pass 必须插在它之前 —— 本 pass 就是第一个这样插进来的。
 *
 * ## 为什么是参数化 shader 而不是 3D 纹理 LUT
 * "色彩分级 LUT"的意图是分级调色。参数化（saturation/contrast/warmth 三个
 *  uniform）在这个项目里更贴：程序生成美学、运行时可调（表驱动逐区过渡）、
 * 不引入外部素材与烘焙管线（离线烘焙是 W-C5 的事）。任意曲线的需求真出现时，
 * 再把 pass 内部换成 Data3DTexture 采样 —— 控制器与表的契约不变。
 *
 * ## 算式（与 content/zoneGrade.js 的口径一一对应）
 * 1. warmth：红蓝反向增益 ±WARMTH_GAIN；
 * 2. saturation：向 luma（Rec.709 权重）插值；
 * 3. contrast：绕中灰 0.5 拉伸。
 * 三步都是恒等式在 saturation=1 / contrast=1 / warmth=0 时成立 —— 出厂中性。
 *
 * ## 唯一写入者
 * pass.uniforms 的写权限归本控制器（ZoneFog 同纪律）：Game.js 只在每帧驱动
 * `update(dt, world.zoneId)`，换区收敛、同区幂等都由 `blendGrade` 的指数平滑
 * 一式承担，没有"检测到换区"的状态分支。
 */
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import {
  WARMTH_GAIN, LUMA_WEIGHTS, zoneGradeOf, blendGrade,
} from '../content/zoneGrade.js';

/** 收敛速率（每秒）：与 ZoneFog 同款 —— 约 0.5 秒走完 95% 过渡 */
const BLEND_RATE = 1.5;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uWarmth: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uWarmth;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      vec3 c = texel.rgb;
      // warmth：暖 = 提红压蓝，冷相反
      c.r *= 1.0 + ${WARMTH_GAIN} * uWarmth;
      c.b *= 1.0 - ${WARMTH_GAIN} * uWarmth;
      // saturation：向 luma 插值（Rec.709）
      float luma = dot( c, vec3( ${LUMA_WEIGHTS.join(', ')} ) );
      c = mix( vec3( luma ), c, uSaturation );
      // contrast：绕中灰拉伸
      c = ( c - 0.5 ) * uContrast + 0.5;
      gl_FragColor = vec4( c, texel.a );
    }`,
};

export class ColorGrade {
  constructor() {
    /** 分级 pass：插在 OutputPass 之前（铁律，见 composer-chain 门禁） */
    this.pass = new ShaderPass(GradeShader);
    /** 当前运行值（纯数字快照，单测与读数不必碰 three 对象） */
    this._current = { saturation: 1, contrast: 1, warmth: 0 };
  }

  /**
   * 每帧驱动。`zoneId` 来自 `world.zoneId`。
   * @returns {{saturation: number, contrast: number, warmth: number}} 本帧落定的运行值（读数用）
   */
  update(dt, zoneId) {
    const target = zoneGradeOf(zoneId);
    const k = 1 - Math.exp(-BLEND_RATE * dt);
    // 从当前值向目标走 k 比例 —— 跨区（跳变）时收敛，同区（恒等）时不动。
    // blendGrade 返回浮点，积分状态不取整（中途取整会让收敛末段卡死，见 zoneGrade 注释）。
    this._current = blendGrade(this._current, target, k);
    this.pass.uniforms.uSaturation.value = this._current.saturation;
    this.pass.uniforms.uContrast.value = this._current.contrast;
    this.pass.uniforms.uWarmth.value = this._current.warmth;
    return this._current;
  }
}
