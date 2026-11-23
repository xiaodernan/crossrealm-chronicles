/**
 * 天球（Celestial Sphere）—— **真实**的夜空。
 *
 * ## 旧的那一片是随机数
 *
 * `WorldEffects.buildStarField()` 撒的是 800 个 `Math.random()` 的白点：
 * 没有一颗是真星、永远不转、也不对应任何一个时刻。
 * 那是"演示数据堆砌"的典型 —— 画面上有个东西占着位置，但那个位置**没有信息**。
 *
 * ## 这一片换成什么
 *
 * - **50+ 颗真实亮星**（J2000 赤经赤纬 / 视星等 / 光谱色），绕**天极**转（恒星日一圈）；
 * - **真实月相**：照亮比 = (1 − cos 2π·相位)/2，锚在 2026 年**真实的朔与望**时刻上；
 * - 月亮按**真实视直径 0.52°** 画（不是随手一个圆盘的大小）；
 * - 太阳按**真实黄经**摆（季节决定它有多高），夜里**沉到地平线以下** —— 天空真的会黑。
 *
 * ## 一套变换，太阳与月亮共用（B179 收口）
 *
 * 真天象的骨架是三层，从里到外：
 *
 * | 层 | 是什么 | 谁在写 |
 * |----|--------|----------|
 * | 赤道系 | 恒星 / 太阳 / 月亮各自的赤经赤纬 | `content/astronomy.js`（真黄经 → 真赤道） |
 * | 时角 | 绕**天极**转（地球自转） | 本类的 `星空.rotation.y` |
 * | 地平系 | 天极扳到"北边、高度 = 纬度" | 本类的 `天穹.rotation.x` |
 *
 * 太阳与月亮**都**放在赤道系里（两个 `Object3D` 探针），于是：
 *
 * - 它们之间的**角距 = 黄经差 = 月相 × 360°**（朔 0°、上弦 90°、望 180°）——
 *   这不是凑出来的，是"月亮和太阳都在黄道上"这条几何的直接结果；
 * - 天空里的太阳、月光的方向、直射光的方向**共用同一份读数**（`太阳方向()`），
 *   全仓不再有第二份太阳算式（原先 `core/Game.js` 与本类各算一遍）。
 *
 * ## 四条纪律
 *
 * 1. **不读墙钟**：相位输入是**世界日**（游戏里的第几天），不是 `Date.now()` ——
 *    B118 那道门禁（墙钟不进玩法）仍然成立。
 * 2. **自己管自己的生死**：星场、月面、几何、材质都在这里建，也都在这里拆 ——
 *    `dispose()` 不留一个孤儿（仓里的生命周期普查会点名）。
 * 3. **新逻辑不读写别人的内部字段**：天球只问 `astronomy.js` 的公开函数，
 *    只接 `timeOfDay` / `世界日` / 相机这样的**公开口**。
 * 4. **位置靠探针，不靠手写矩阵**：太阳与月亮的世界坐标由 three 自己算
 *    （探针挂在赤道系里），本类不手搓旋转矩阵 —— 两处变换不会各写一份。
 */

import * as THREE from 'three';
import {
  亮星表,
  天球向量,
  星等映射,
  月相,
  太阳赤道坐标,
  月亮赤道坐标,
} from '../content/astronomy.js';

/** 天球半径（世界单位）：远小于天空盒（450000），远大于任何地形 */
export const 天球半径 = 40000;

/** 观察者的纬度（度）：决定天极的高度（北极星的高度 = 纬度） */
export const 默认纬度 = 35;

/** 月亮的**真实视直径**（度）—— 月亮在天上的角直径约 0.52° */
export const 月视直径 = 0.52;

/** 太阳沉到地平线下多少度算"全夜"（航海暮光结束） */
export const 暮光深度 = 8;

/** 世界时刻 0.25 = 正午（太阳过中天）；0.75 = 午夜 */
export const 正午时刻 = 0.25;

export const 顶点着色器 = /* glsl */`
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // 深度钉在远平面（与 three 自己的 Sky 同一手法）：相机的远裁剪面只有 2500，
    // 而天球在 40000 —— 不钉的话整片天会被裁掉。视差还在（x/y/w 没动），
    // 所以星星的大小仍是真实角尺寸。
    gl_Position.z = gl_Position.w;
    gl_PointSize = max(1.0, aSize * uPixelRatio);
  }
`;

/** 星场的顶点着色器（导出：门禁要能**逐段**断言它，不许用"整文件里有一处"糊弄） */
export const 星顶点着色器 = 顶点着色器;

export const 月顶点着色器 = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w;   // 同星场：钉在远平面，别被裁掉
  }
`;

export const 片元着色器 = /* glsl */`
  varying vec3 vColor;
  uniform float uOpacity;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float a = smoothstep(0.5, 0.08, r);
    gl_FragColor = vec4(vColor * a, a * uOpacity);
  }
`;

export const 月面着色器 = /* glsl */`
  uniform float uPhase;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float edge = sqrt(max(0.0, 1.0 - p.y * p.y));
    // 终结线：亮暗分界是一条半椭圆 —— 弦的半宽 |cos(2π·相位)|（相位的余弦 = 1 − 2×照亮比）
    float k = cos(6.283185307179586 * uPhase);
    float lit = uPhase < 0.5
      ? step(k * edge + 0.002, p.x)     // 盈：亮面在右
      : step(p.x, -k * edge - 0.002);   // 亏：亮面在左
    // 球面明暗（边缘变暗）+ 一点点地照（暗面不是全黑）
    float shade = 0.68 + 0.32 * sqrt(max(0.0, 1.0 - r2));
    float a = (0.05 + 0.95 * lit) * uOpacity * smoothstep(1.0, 0.9, r2);
    gl_FragColor = vec4(vec3(1.0, 0.975, 0.92) * lit * shade, a);
  }
`;

/** 月面的片元着色器（导出：门禁逐段断言终结线方向） */
export const 月面片元着色器 = 月面着色器;

export class CelestialSphere {
  /**
   * @param {THREE.Scene} scene
   * @param {object} 选
   * @param {number} 选.半径 天球半径
   * @param {number} 选.纬度 观察者纬度（度）
   */
  constructor(scene, { 半径 = 天球半径, 纬度 = 默认纬度 } = {}) {
    this.scene = scene;
    this.半径 = 半径;
    this.纬度 = 纬度;

    this.group = new THREE.Group();
    this.group.name = 'celestial';
    scene.add(this.group);

    // 天穹（外层）：把天极从 +Y 扳到"北"（−Z）方向，高度 = 纬度
    this.天穹 = new THREE.Group();
    this.天穹.rotation.x = -THREE.MathUtils.degToRad(90 - 纬度);
    this.group.add(this.天穹);

    // 星空（内层）：绕自己的天极轴转（时角 —— 地球自转）
    this.星空 = new THREE.Group();
    this.天穹.add(this.星空);

    this.星材质 = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: 1 },
        uOpacity: { value: 1 },
      },
      vertexShader: 顶点着色器,
      fragmentShader: 片元着色器,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.星点 = this._建星场();
    this.星空.add(this.星点);

    // 太阳与月亮的**位置探针**：挂在赤道系里，世界坐标由 three 自己算 ——
    // 太阳与月亮因此共用同一套变换（时角 + 天极倾斜），角距天然是真实的黄经差。
    this.太阳探针 = new THREE.Object3D();
    this.月亮探针 = new THREE.Object3D();
    this.星空.add(this.太阳探针);
    this.星空.add(this.月亮探针);

    /** 太阳的世界方向（单位向量）—— 天空、月光、直射光共用这一份 */
    this.太阳世界 = new THREE.Vector3(0, 1, 0);
    /** 月亮的世界位置 */
    this.月亮世界 = new THREE.Vector3();

    this.月材质 = new THREE.ShaderMaterial({
      uniforms: {
        uPhase: { value: 0 },
        uOpacity: { value: 0 },
      },
      vertexShader: 月顶点着色器,
      fragmentShader: 月面着色器,
      transparent: true,
      depthWrite: false,
    });
    const 月宽 = 2 * 半径 * Math.tan(THREE.MathUtils.degToRad(月视直径 / 2));
    this.月亮 = new THREE.Mesh(new THREE.PlaneGeometry(月宽, 月宽), this.月材质);
    this.月亮.renderOrder = 12;   // 压在天空之后、地形之前（深度测试照旧，地形会挡住它）
    this.月亮.frustumCulled = false;   // 深度钉在远平面 ⇒ 视锥剔除会误杀它
    this.group.add(this.月亮);
  }

  /** 用真实亮星表建点云 */
  _建星场() {
    const n = 亮星表.length;
    const 位置 = new Float32Array(n * 3);
    const 颜色 = new Float32Array(n * 3);
    const 大小 = new Float32Array(n);
    const c = new THREE.Color();
    亮星表.forEach((星, i) => {
      const v = 天球向量(星.赤经, 星.赤纬);
      位置[i * 3] = v.x * this.半径;
      位置[i * 3 + 1] = v.y * this.半径;
      位置[i * 3 + 2] = v.z * this.半径;
      c.setHex(星.色);
      const 映射 = 星等映射(星.星等);
      颜色[i * 3] = c.r * 映射.亮度;
      颜色[i * 3 + 1] = c.g * 映射.亮度;
      颜色[i * 3 + 2] = c.b * 映射.亮度;
      大小[i] = 映射.大小;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(位置, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(颜色, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(大小, 1));
    const 点 = new THREE.Points(geo, this.星材质);
    点.frustumCulled = false;
    点.renderOrder = 11;
    return 点;
  }

  /** 把一个赤道坐标放进探针（局部系 = 赤道系） */
  _放探针(探针, 赤经时, 赤纬度) {
    const v = 天球向量(赤经时, 赤纬度);
    探针.position.set(v.x * this.半径, v.y * this.半径, v.z * this.半径);
  }

  /**
   * 每帧更新。
   *
   * @param {object} 读数
   * @param {number} 读数.时刻 世界时刻 0…1（0.25 = 正午）
   * @param {number} 读数.世界天 距纪元的天数（可含小数）
   * @param {THREE.Camera} [读数.相机] 用来把月面转向镜头
   */
  update({ 时刻 = 正午时刻, 世界天 = 0, 相机 = null } = {}) {
    // 太阳：真实黄经 → 赤道坐标（季节决定它多高）
    const 太阳赤道 = 太阳赤道坐标(世界天);

    // **时角**：地球自转带来的那一转。
    //
    // 星空的转角 = 太阳赤经 − 90° − (时刻 − 0.25)·360°：
    //   · 减 90° —— 星空系里"中天"的方向是 +Z（赤经 90°），太阳转到那儿就是过中天；
    //   · (时刻 − 0.25)·360° —— 时刻 0.25 = 正午，此后每过 1/24 天转 15°；
    //   · 太阳赤经 —— 季节项：太阳在黄道上走，星空相对太阳每天挪约 1°
    //     （所以同一颗星每天比昨天早升起约 4 分钟 —— 真的就是这个）。
    const 转角 = (太阳赤道.赤经时 * 15 - 90 - (时刻 - 正午时刻) * 360) * (Math.PI / 180);
    this.星空.rotation.y = 转角;

    // 月亮：真实黄经差 = 相位 × 360° ⇒ 与太阳的角距就是真实月相
    const 月赤道 = 月亮赤道坐标(世界天);
    this._放探针(this.月亮探针, 月赤道.赤经时, 月赤道.赤纬);

    // 太阳探针也在赤道系里（与月亮同一套变换 ⇒ 角距天然是真实的黄经差）
    this._放探针(this.太阳探针, 太阳赤道.赤经时, 太阳赤道.赤纬);

    // 世界坐标交给 three 算（探针 → 星空 → 天穹 → group）：不手写旋转矩阵
    this.group.updateMatrixWorld(true);
    this.太阳世界.copy(this.太阳探针.getWorldPosition(new THREE.Vector3()));
    this.月亮世界.copy(this.月亮探针.getWorldPosition(new THREE.Vector3()));
    this.月亮.position.copy(this.月亮世界);

    // 星星的可见度：**按真太阳高度**（太阳沉到地平线以下，星星才出来）——
    // 白天看不见星星是物理事实，不是审美选择。
    const 太阳高度 = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(this.太阳世界.y / this.半径, -1, 1)));
    const 夜 = THREE.MathUtils.clamp(-太阳高度 / 暮光深度, 0, 1);
    this.星材质.uniforms.uOpacity.value = 夜;
    this.星材质.uniforms.uPixelRatio.value = Math.min(2, globalThis.devicePixelRatio || 1);
    this.星点.visible = 夜 > 0.02;

    // 月亮：相位取真值，不透明度跟着"夜"与照亮比
    const 相 = 月相(世界天);
    this.月材质.uniforms.uPhase.value = 相.相位;
    this.月材质.uniforms.uOpacity.value = 夜 * (0.25 + 0.75 * 相.照亮比);
    this.月亮.visible = 夜 > 0.02 && 相.照亮比 > 0.005;

    if (相机) this.月亮.quaternion.copy(相机.quaternion);
  }

  /**
   * **太阳的世界方向**（单位向量）—— 天空、月光、直射光共用这一份。
   *
   * @param {THREE.Vector3} [出] 复用的目标向量（不想每次新建就传一个进来）
   */
  太阳方向(出 = new THREE.Vector3()) {
    return 出.copy(this.太阳世界).normalize();
  }

  /** 读数（诊断用）：星数、月相、太阳高度、当前朝向 */
  读数() {
    return {
      星数: 亮星表.length,
      月相位: this.月材质.uniforms.uPhase.value,
      月不透明度: this.月材质.uniforms.uOpacity.value,
      太阳高度: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(this.太阳世界.y / this.半径, -1, 1))),
      时角: this.星空.rotation.y,
    };
  }

  dispose() {
    this.group.removeFromParent();
    this.星点.geometry?.dispose();
    this.星材质.dispose();
    this.月亮.geometry?.dispose();
    this.月材质.dispose();
    this.太阳探针.removeFromParent();
    this.月亮探针.removeFromParent();
    this.星点 = null;
    this.月亮 = null;
    this.太阳探针 = null;
    this.月亮探针 = null;
  }
}
