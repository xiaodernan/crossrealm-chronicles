import * as THREE from 'three';
import { ZONE_IDS } from '../content/ZoneIdentity.js';
import { shouldUpdate as frameShouldUpdate } from '../engine/FrameBudget.js';
import { releaseSubtree } from '../engine/releaseSubtree.js';

/** 区域天气 — 雨 / 雪 / 灰烬 / 奥术 drizzle，跟随玩家 */
const ZONE_PRESETS = {
  [ZONE_IDS.HUB]: { kind: 'mist', count: 420, color: 0xaabbcc, speed: 6, wind: 0.4, fogBoost: 0.0004 },
  [ZONE_IDS.FANTASY]: { kind: 'rain', count: 900, color: 0x8899aa, speed: 28, wind: 1.2, fogBoost: 0.0008 },
  [ZONE_IDS.MAGIC]: { kind: 'arcane', count: 650, color: 0xaa66ff, speed: 16, wind: 0.6, fogBoost: 0.0006 },
  [ZONE_IDS.SPACE]: { kind: 'snow', count: 750, color: 0xccddee, speed: 5, wind: 0.35, fogBoost: 0.0003 },
  [ZONE_IDS.VOID]: { kind: 'ash', count: 580, color: 0x998877, speed: 8, wind: 0.5, fogBoost: 0.0007 },
  [ZONE_IDS.ABYSS]: { kind: 'ember', count: 520, color: 0xff4422, speed: 12, wind: 0.8, fogBoost: 0.0005 },
};

/**
 * 涟漪每秒的放大倍率。旧写法是"每帧 ×1.08"，那是 60fps 下的经验值；
 * 这里换算成按秒的量，`_updateSplashes` 再按 dt 取幂，放大速度与帧率脱钩。
 */
const SPLASH_GROWTH_PER_SEC = 1.08 ** 60;

export class WeatherSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {object} world
   * @param {import('../effects/ZoneFog.js').ZoneFog} [zoneFog] 区域雾的运行期载体
   *        （W-C4 切片2）：天气对雾密度的加成经 `setWeatherBoost` 供给 ——
   *        改前这里直接重写 `fog.density`（在 zone-changed 同步链上后跑，
   *        把 `WorldManager` 写的区域密度整个覆盖掉），三个写入者互相打架。
   */
  constructor(scene, world, zoneFog = null) {
    this.scene = scene;
    this.world = world;
    this._zoneFog = zoneFog;
    this.zone = ZONE_IDS.HUB;
    this.preset = ZONE_PRESETS[ZONE_IDS.HUB];
    this.group = new THREE.Group();
    scene.add(this.group);

    this.particles = null;
    this.velocities = null;
    this.splashGroup = new THREE.Group();
    this.group.add(this.splashGroup);
    /** 雨滴落点涟漪：与粒子同一条 dt 时间轴，由 `update()` 推进（修 B43） */
    this.splashes = [];

    this._follow = new THREE.Vector3();
    this._box = { x: 55, y: 32, z: 55 };
    /** 世界时累计（秒）—— 雪的横向摆动相位源（B118）。改前摆动**幅值**乘了 dt、方向却取墙钟：
     *  定帧那一档（世界时 0.08 秒）实测仍走出正常档 **76.9%** 的路径，等于雪在定格里满速乱摆 */
    this._时相 = 0;
    /**
     * 每颗粒子**脚下那一格**的地面高度，连同采样时它自己的 (x, z)（W-C2 切片20）。
     *
     * 包围盒判定问的只是"这颗穿到地面以下 2 米没有"，可 `getGroundHeight` 每问一次就把整张
     * 高度场**四角各算一遍**（`sampleGlobalHeightSmooth`：自然地 + 七区 + 广场 + 室内）。
     * 900 颗每帧各问一次 ⇒ 探针 patch-out 量到 `weather.update` 那 5.68ms 里 **98.8% 是这一问**
     * （`.tmp-20261030-s22/probe-w2.log`）。而雨滴下落时 x/z 不动，问十次还是同一格。
     *
     * 缓存只有一种情况会读错答案：`getGroundHeight` **换了答题的人**（室内 / 野外那两条分支，
     * 见 `WorldManager.getGroundHeight` 的 B120 注）。所以每帧比对那一条分支，一跳就整张作废 ——
     * 付一帧的重问（约 5.6ms，进出副本各一次），换掉"雨落在错高度上"这种没人能复现的症状。
     */
    this._gy = null;
    this._gxy = null;
    this._室内 = null;
    this._buildParticles(this.preset);
  }

  _buildParticles(preset) {
    if (this.particles) {
      this.group.remove(this.particles);
      this.particles.geometry.dispose();
      this.particles.material.dispose();
    }

    const n = preset.count;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this._randomizeParticle(pos, vel, i, preset, true);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const size = preset.kind === 'snow' ? 0.22 : preset.kind === 'mist' ? 0.45 : 0.14;
    const mat = new THREE.PointsMaterial({
      color: preset.color,
      size,
      transparent: true,
      opacity: preset.kind === 'mist' ? 0.35 : 0.72,
      blending: preset.kind === 'ember' || preset.kind === 'arcane' ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });
    this.particles = new THREE.Points(geo, mat);
    this.velocities = vel;
    // 粒子数一变，旧的"这颗脚下多高"就认不得这颗了：整张重开。
    // NaN 是"还没问过"的记号 —— 它与任何数比都不等，所以第一帧逐颗各问一次。
    this._gy = new Float32Array(n);
    this._gxy = new Float32Array(n * 2).fill(NaN);
    this.group.add(this.particles);
  }

  _randomizeParticle(pos, vel, i, preset, initial = false) {
    const bx = this._box.x;
    const by = this._box.y;
    const bz = this._box.z;
    const cx = this._follow.x;
    const cz = this._follow.z;
    pos[i * 3] = cx + (Math.random() - 0.5) * bx * 2;
    pos[i * 3 + 1] = initial ? by * Math.random() : by + 4;
    pos[i * 3 + 2] = cz + (Math.random() - 0.5) * bz * 2;

    const w = preset.wind * (0.6 + Math.random() * 0.8);
    vel[i * 3] = w * (Math.random() - 0.3);
    vel[i * 3 + 1] = -preset.speed * (0.7 + Math.random() * 0.6);
    vel[i * 3 + 2] = w * 0.4 * (Math.random() - 0.5);

    if (preset.kind === 'ember') {
      vel[i * 3 + 1] = Math.abs(vel[i * 3 + 1]) * 0.5 + 4;
      vel[i * 3] *= 1.4;
    }
    if (preset.kind === 'snow') {
      vel[i * 3 + 1] *= 0.35;
      vel[i * 3] += Math.sin(i) * 0.8;
    }
    if (preset.kind === 'mist') {
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.6;
      vel[i * 3] *= 0.5;
    }
  }

  setZone(zoneId) {
    const preset = ZONE_PRESETS[zoneId] ?? ZONE_PRESETS[ZONE_IDS.HUB];
    if (preset.kind === this.preset?.kind && zoneId === this.zone) return;
    this.zone = zoneId;
    this.preset = preset;
    this._buildParticles(preset);

    // 天气加成推给区域雾（W-C4 切片2）：区域给基础密度、天气给 boost，
    // 在 ZoneFog 里合成 —— 不再直接写 fog（改前这里把区域密度整个覆盖掉）
    this._zoneFog?.setWeatherBoost(preset.fogBoost ?? 0);
  }

  update(dt, playerPos) {
    // 涟漪独立于粒子推进：粒子缺位时它也得把寿命走完，否则网格会挂在场景里
    this._updateSplashes(dt);
    if (!this.particles || !this.velocities) return;

    // 相位每帧累积（B118：慢动作里不传送）；粒子位置更新降频到 1/2 帧（W-C2 切片4 余项）。
    const 几何帧 = frameShouldUpdate(2);
    this._时相 += dt;
    this._follow.lerp(playerPos, dt * 2.5);
    this.group.position.set(this._follow.x, 0, this._follow.z);

    const arr = this.particles.geometry.attributes.position.array;
    const vel = this.velocities;
    const preset = this.preset;
    const groundBase = this.world.getGroundHeight(playerPos.x, playerPos.z);
    const 缓存 = this._gxy;

    // 答题的人换了吗？（`getGroundHeight` 在室内 / 野外之间换源头）换了就整张作废，
    // 下一帧逐颗重问 —— 那一帧贵 5ms，但它值的是"雨别再落在错的高度上"。
    const 室内 = !!this.world.dungeonManager?.isInside?.();
    if (室内 !== this._室内) { 缓存.fill(NaN); this._室内 = 室内; }

    const 粒子数 = arr.length / 3;
    for (let i = 0; i < 粒子数; i++) {
      // 包围盒检测每帧做，防止粒子逃逸；位置积分仅在几何帧推进。
      const px = arr[i * 3];
      const py = arr[i * 3 + 1];
      const pz = arr[i * 3 + 2];

      // 这一颗自己挪没挪：水平位移过 1 米才重问地面（NaN 的比较恒假 ⇒ 没问过的必问）。
      // 判据的容差是"低于地面 2 米"，而 1 米水平位移内的地面差不超过 0.1 米量级 ——
      // 省掉的是整张高度场四次角点采样，换来的是同一格的第二十次回答。
      if (!(Math.abs(px - 缓存[i * 2]) <= 1 && Math.abs(pz - 缓存[i * 2 + 1]) <= 1)) {
        this._gy[i] = this.world.getGroundHeight(px, pz);
        缓存[i * 2] = px;
        缓存[i * 2 + 1] = pz;
      }
      const gy = this._gy[i] + 0.5;

      const outOfBox =
        Math.abs(px - this._follow.x) > this._box.x
        || Math.abs(pz - this._follow.z) > this._box.z
        || py < gy - 2
        || py > this._box.y + 8;

      if (outOfBox) {
        this._randomizeParticle(arr, vel, i, preset, false);
        arr[i * 3 + 1] = this._box.y + Math.random() * 6;
      } else if (几何帧) {
        arr[i * 3] += vel[i * 3] * dt;
        arr[i * 3 + 1] += vel[i * 3 + 1] * dt;
        arr[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }

      if (preset.kind === 'snow') {
        // 雪的横向摆动每帧做（幅值小，不降频影响不大），相位源仍是 _时相
        vel[i * 3] += Math.sin(this._时相 + i) * dt * 0.4;
      }
    }

    if (几何帧) this.particles.geometry.attributes.position.needsUpdate = true;

    if (preset.kind === 'rain' && Math.random() < dt * 18) {
      this._spawnSplash(
        playerPos.x + (Math.random() - 0.5) * 20,
        playerPos.z + (Math.random() - 0.5) * 20,
        groundBase
      );
    }
  }

  _spawnSplash(x, z, gy) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.12, 6),
      new THREE.MeshBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, gy + 0.05, z);
    this.splashGroup.add(ring);
    this.splashes.push({ ring, life: 0.25 });
    // 与修前同一个上限，但回收要同时离开两个容器 —— 只删网格会留下幽灵条目
    if (this.splashes.length > 40) this._retireSplash(0);
  }

  _retireSplash(i) {
    const [s] = this.splashes.splice(i, 1);
    this.splashGroup.remove(s.ring);
    s.ring.geometry.dispose();
    s.ring.material.dispose();
  }

  /** 涟漪寿命按秒走（修 B43：过去是自建 rAF + 每帧 0.016，144Hz 下只活约 0.07 秒） */
  _updateSplashes(dt) {
    for (let i = this.splashes.length - 1; i >= 0; i -= 1) {
      const s = this.splashes[i];
      s.life -= dt;
      if (s.life <= 0) {
        this._retireSplash(i);
        continue;
      }
      s.ring.material.opacity = s.life * 2;
      s.ring.scale.multiplyScalar(SPLASH_GROWTH_PER_SEC ** dt);
    }
  }

  /**
   * 拆干净：把天气那一组从场景里摘掉，释放雨/雪粒子的几何与材质、以及还活着的涟漪。
   *
   * 为什么现在才有（W-C1 切片3e）：`Game._adopt` **拒绝**没有 `dispose()` 的子系统
   * （"假装收编"的防线），而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒
   * `Game.dispose()` 走完，它造的那些几何与材质**一份都不还**。
   *
   * 涟漪**不逐个退**（`_retireSplash` 会各自释放一次）：子树释放器已经把整棵
   * `splashGroup` 走了一遍 —— 逐个退完再释放就是**释放两遍**。
   */
  dispose() {
    this.scene.remove(this.group);
    releaseSubtree(this.group);
    this.splashes.length = 0;
    this.particles = null;
    this.velocities = null;
  }
}
