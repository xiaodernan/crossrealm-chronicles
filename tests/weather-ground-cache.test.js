/**
 * 门禁：天气粒子的"脚下那一格多高"必须有账（W-C2 切片20，修每帧普查点名的那一格）。
 *
 * ## 这一条量出来的是什么
 *
 * 每帧 CPU 普查（`src/engine/frameCensus.js`，切片19 立）第一次真跑就把"森林一帧 15ms 里住着谁"
 * 从猜测变成读数：八站榜首全是 `weather.update` —— 灰白森林 **10.18ms/帧**（p95 15.00）、
 * space 7.73、magic 5.66、枢纽 3.20（p95 8.40）。常驻那两条 CPU 红（森林 `updateAvg/updateP95`
 * 越 12、枢纽 `updateP95` 16.2 > 12）不是"内容变多了"，是一行代码。
 *
 * 那一行是 `WeatherSystem.update()` 包围盒判定里的 `this.world.getGroundHeight(px, pz)` ——
 * **每颗粒子、每一帧、各问一次**。而 `getGroundHeight` 一次就是整张高度场**四角各算一遍**
 * （`sampleGlobalHeightSmooth`：自然地 + 七座区 + 广场权重 + 室内掺混）。
 *
 * ## 代价的读数（headless patch-out A/B，同一种子 / 同一组 900 颗 / 同 240 帧）
 *
 * - 改前（`.tmp-20261030-s22/probe-w2.log`）：真地面每帧 **5.68ms**、每帧问 **901 次**；
 *   把 `getGroundHeight` 换成常数后每帧 **0.07ms** ⇒ **98.8%** 是"问地面"，不是移动粒子。
 * - 改后（`probe-w3.log`）：每帧 **0.17ms**、每帧问 **20 次**。
 *
 * ## 为什么"缓存一颗的高度"在这里是安全的，以及它唯一会读错的地方
 *
 * 雨滴下落只有 y 在动，x/z 一格里根本不动 —— 问第二十一遍还是那一格的答案；野外那一条分支
 * 是 (x, z) 的纯函数（各区 `sampleHeight` 不吃时间也不吃帧号）。唯一会换答案的是
 * `WorldManager.getGroundHeight` 自己那两条分支：**室内 / 野外**（B120 注）。所以这份账不是
 * "永远不重问"，而是按两个条件重问：
 * ① 这一颗自己水平挪过 1 米（含重生，重生必挪）；
 * ② 答题的人换了（每帧比对那一条分支，一跳就整张作废，下一帧逐颗重问）。
 *
 * ## 为什么这些腿看 `_gxy` 而不是数日志里的坐标
 *
 * 判"这颗重问没重问"最干净的证人就是账自己：重问必然把新的 (x, z) 抄进 `_gxy`。
 * 去日志里比对坐标会被两件事污染 —— 粒子在同一帧里还会被积分推走一点，而 900 颗散在
 * 110 米里，随便挑一格都可能撞上另一颗。所以每条腿先钉住"这颗站着哪"，再看账改没改。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WeatherSystem } from '../src/world/WeatherSystem.js';
import { ZONE_IDS } from '../src/content/ZoneIdentity.js';

/**
 * 一台会记账的世界替身：`问` 逐次记下 (x, z)，判据要问的就是"到底问了几次、问的是哪一格"。
 *
 * `室内` 是一个**盒子**（`{ 值 }`）而不是布尔：副本那条分支是运行期翻的，测试要在帧中间翻它。
 */
function 造世界({ 地面 = () => 0, 室内 = { 值: false } } = {}) {
  const 问 = [];
  const world = {
    getGroundHeight(x, z) {
      问.push([x, z]);
      return 地面(x, z);
    },
    dungeonManager: { isInside: () => 室内.值 },
  };
  return { world, 问, 室内 };
}

/**
 * 玩家站在**粒子云的圆心**上。这不是随手挑的坐标：粒子是围绕 `_follow` 撒的，
 * 把玩家放到两百米外就等于"所有颗粒子都在盒外"⇒ 每帧全员重生、每帧全员重问，
 * 那条"第二帧几乎不再问"就变成在测重生而不是测缓存。
 */
const 玩家 = new THREE.Vector3(0, 0, 0);
const dt = 1 / 60;

function 造天气(世界, 区 = ZONE_IDS.FANTASY) {
  const 天气 = new WeatherSystem(new THREE.Group(), 世界);
  天气.setZone(区);
  天气._follow.set(0, 0, 0);
  return 天气;
}

const 粒子数 = (天气) => 天气.particles.geometry.attributes.position.count;
/**
 * 只看"为粒子问的"那一半：每帧另有**一次** `groundBase`（玩家脚下，涟漪落点用），要按帧数扣。
 *
 * 这里扣的是帧数不是"1 次"，因为臂（`.tmp-20261030-s22/arms20.py` 丁：位移条件恒假）
 * 证明只扣 1 会把这条腿判成空转：那种"整条重问都不做"的实现每帧仍留 1 次 `groundBase`，
 * 跑 20 帧就是 20 次，减掉 1 还剩 19 —— 下界 `> 0` 照样绿，等于那条腿什么都没盯住。
 */
const 为粒子问 = (问, 帧数 = 1) => 问.length - 帧数;

describe('① 账本身：第一帧必逐颗问，之后按位移问', () => {
  it('第一帧每颗粒子各问一次（+ 玩家脚下那一次）', () => {
    const { world, 问 } = 造世界();
    const 天气 = 造天气(world);
    天气.update(dt, 玩家);
    expect(问.length, '第一帧没逐颗问地面 ⇒ 有的粒子拿到的是没问过的答案').toBe(粒子数(天气) + 1);
  });

  it('记号是 NaN 而不是 0：拿 0 当"没问过"，地面在 7 米的世界里会读成海平面', () => {
    const { world } = 造世界({ 地面: () => 7 });
    const 天气 = 造天气(world);
    const 数 = 粒子数(天气);
    // 半张账的分工必须是"谁还没问过"写得出来：`_gy` 全 0 是合法答案，初值记号只能在 `_gxy` 上。
    expect(天气._gxy.every((v) => Number.isNaN(v)), '_gxy 的初值不是 NaN ⇒ "没问过"没有记号').toBe(true);
    expect(天气._gy.length).toBe(数);
    天气.update(dt, 玩家);
    expect(Array.from(天气._gy).every((v) => v === 7), '跑完一帧账里还是 0 ⇒ 初值没被重问，雨会贴到海平面').toBe(true);
  });

  it('第二帧不再逐颗问：雨滴只动 y，问第二遍的是同一格', () => {
    const { world, 问 } = 造世界();
    const 天气 = 造天气(world);
    天气.update(dt, 玩家);
    问.length = 0;
    天气.update(dt, 玩家);
    const 数 = 粒子数(天气);
    // 实测这一帧只重问二十来次（风把极少数吹过 1 米线 + 极少数落到地面重生）。
    // 上界取 1/8：比常数地面宽，比旧写法（每帧 = 数）低 112 倍 ⇒ 有人加回整圈重问必红。
    //
    // 这里**不写**下界。先前那一版写的是"一帧都不问 ⇒ 包围盒判定读的是空账"，那句因果是反的：
    // 空账（`_gxy` 全 NaN）与任何数比都不等 ⇒ 判定会重问**全部**粒子，读出来是 `= 数` 而不是 0，
    // 上界那条早就把它红了。而雨滴一帧的水平位移不到 1 米 ⇒ 0 是这份替身下的正解。
    // 真正的"判定确实在读账"换了下面那条腿去证：它喂一个**没有查询能返回**的高度。
    expect(为粒子问(问), `一帧重问 ${为粒子问(问)} 次，粒子 ${数} ⇒ 又变成每帧逐颗问`).toBeLessThanOrEqual(数 / 8);
  });

  it('包围盒判定读的是账，不是再问一遍：喂一个查询问不出来的高度', () => {
    const { world, 问 } = 造世界({ 地面: () => 0 });
    const 天气 = 造天气(world);
    天气.update(dt, 玩家);                                // 先把账填满（平地面 ⇒ 全 0）
    const arr = 天气.particles.geometry.attributes.position.array;
    arr[1] = 5;                                          // 盒内、地面(0)以上：按真账不该重生
    天气._gxy[0] = arr[0];
    天气._gxy[1] = arr[2];                               // 冻住这颗，不许靠"挪了"来重问
    天气._gy[0] = 1000;                                  // 平地面世界里这个数**问不出来**
    问.length = 0;
    天气.update(dt, 玩家);
    // 判据若还在每帧现问，问回来的是 0 ⇒ 这颗留在 y=5；只有"读账"才会把它按回盒顶（y ≥ 32）。
    expect(arr[1], '账里那个假高度没起作用 ⇒ 判读的不是账，缓存根本没生效').toBeGreaterThanOrEqual(天气._box.y);
    expect(为粒子问(问), '这一帧为这颗现问了地面 ⇒ 上面那条"读到账"的证人作废').toBe(0);
  });

  it('六十帧合计问询有上界（省下那 5.6ms 的就是这一条）', () => {
    const { world, 问 } = 造世界();
    const 天气 = 造天气(world);
    const 数 = 粒子数(天气);
    for (let i = 0; i < 60; i += 1) 天气.update(dt, 玩家);
    const 每帧 = 为粒子问(问, 60) / 60;
    expect(每帧, `平均每帧问 ${每帧.toFixed(1)} 次 ⇒ 包围盒判定又在每帧逐颗问场`).toBeLessThanOrEqual(数 / 8);
    // 下界挪到这一条才是性质：雨落 28 米/秒，一秒里必有颗粒子穿到地面以下并重生（重生必挪 x/z）。
    // 一次都不问 = 位移/重生这条重问条件整条没接上，那种实现会让雨贴着一张永远不过期的旧地图落。
    expect(每帧, '六十帧一次都不重问 ⇒ 落地重生的那颗没触发重问，账只会越读越旧').toBeGreaterThan(0);
  });
});

describe('② 重问的触发条件：位移过线、答题的人换了', () => {
  it('水平挪过 1 米 ⇒ 这颗重问（账里的坐标跟着换成它现在站的这一格）', () => {
    const { world, 问 } = 造世界({ 地面: (x) => x * 0.1 });
    const 天气 = 造天气(world);
    天气.update(dt, 玩家);
    const arr = 天气.particles.geometry.attributes.position.array;
    const 旧基准 = 天气._gxy[0];
    const 旧高度 = 天气._gy[0];
    问.length = 0;
    arr[0] = 旧基准 + 3;                                 // 把第 0 颗沿 x 推 3 米
    天气.update(dt, 玩家);
    expect(天气._gxy[0], '挪了 3 米却没重问 ⇒ 它还带着别处的地面高度').not.toBe(旧基准);
    expect(Math.abs(天气._gxy[0] - (旧基准 + 3))).toBeLessThan(0.5);
    expect(为粒子问(问), '一条都没问 ⇒ 上那条"没改账"是别的坏法造出来的').toBeGreaterThan(0);
    expect(天气._gy[0], '重问了但没把新答案抄进账').not.toBe(旧高度);
    expect(天气._gy[0]).toBeCloseTo((旧基准 + 3) * 0.1, 1);
  });

  it('没挪过 1 米 ⇒ 不重问（这就是省下来的那一大截）', () => {
    const { world, 问 } = 造世界({ 地面: (x) => x * 0.1 });
    const 天气 = 造天气(world);
    天气.update(dt, 玩家);
    const arr = 天气.particles.geometry.attributes.position.array;
    const 基准 = 天气._gxy[0];
    const 高度 = 天气._gy[0];
    问.length = 0;
    arr[0] = 基准 + 0.4;                                 // 只挪 0.4 米
    天气.update(dt, 玩家);
    expect(天气._gxy[0], '0.4 米就重问 ⇒ 容差没生效（基准被改写=重问的唯一证人）').toBe(基准);
    expect(天气._gy[0]).toBe(高度);
    expect(为粒子问(问)).toBeLessThanOrEqual(粒子数(天气) / 8);
  });

  it('答题的人换了（室内 ⇄ 野外）⇒ 整张作废，下一帧逐颗重问，之后照旧便宜', () => {
    const { world, 问, 室内 } = 造世界({ 地面: () => 4 });
    const 天气 = 造天气(world);
    const 数 = 粒子数(天气);
    天气.update(dt, 玩家);
    室内.值 = true;                                      // 进副本：`getGroundHeight` 换了源头
    问.length = 0;
    天气.update(dt, 玩家);
    expect(问.length, '换了答题的人之后没重问 ⇒ 室内那一格用的还是野外的地面').toBe(数 + 1);
    expect(天气._室内, '分支状态没跟着记 ⇒ 下一帧还会当成"换了人"再全量重问一遍').toBe(true);
    问.length = 0;
    天气.update(dt, 玩家);
    expect(为粒子问(问), '第二帧又全量重问 ⇒ 作废被做成了每帧作废').toBeLessThanOrEqual(数 / 8);
  });
});

describe('③ 反面控制：省的是问询，不是包围盒判定', () => {
  it('已穿到地面以下 2 米的粒子照样重生（缓存不许让逃逸看不见）', () => {
    const { world } = 造世界({ 地面: () => 30 });
    const 天气 = 造天气(world);
    天气.update(dt, 玩家);                               // 先把账填满
    const arr = 天气.particles.geometry.attributes.position.array;
    天气._gxy[0] = arr[0];
    天气._gxy[1] = arr[2];                               // 冻住这颗：不许靠"挪了"来重问
    天气._gy[0] = 30;
    arr[1] = 5;                                          // 压到地面(30)以下 25 米
    天气.update(dt, 玩家);
    expect(arr[1], '低于地面 2 米却没重生 ⇒ 判据被缓存绕过去了').toBeGreaterThan(28);
    expect(arr[1]).toBeLessThanOrEqual(天气._box.y + 8);
  });

  it('横向甩出盒外的粒子被重生回盒内（横向判定不依赖地面问询）', () => {
    const { world } = 造世界();
    const 天气 = 造天气(world);
    天气.update(dt, 玩家);
    const arr = 天气.particles.geometry.attributes.position.array;
    const 盒 = 天气._box.x;
    arr[0] = 天气._follow.x + 盒 + 40;                   // 甩出盒外 40 米
    天气.update(dt, 玩家);
    expect(Math.abs(arr[0] - 天气._follow.x), '甩出盒外还在原地 ⇒ 横向判定丢了').toBeLessThanOrEqual(盒);
  });

  it('切区重开账：新的粒子数配新的账，第一帧逐颗问', () => {
    const { world, 问 } = 造世界();
    const 天气 = 造天气(world);
    天气.update(dt, 玩家);
    问.length = 0;
    天气.setZone(ZONE_IDS.SPACE);                        // rain 900 → snow 750
    const 数 = 粒子数(天气);
    expect(数, '切区没换粒子数 ⇒ 这份替身测不出账长与粒子数错位').not.toBe(900);
    expect(天气._gy.length, '账长没跟着粒子数重开').toBe(数);
    expect(天气._gxy.length).toBe(数 * 2);
    expect(天气._gxy.every((v) => Number.isNaN(v)), '切区没重开账 ⇒ 旧颗的坐标记号被新粒子继承').toBe(true);
    天气.update(dt, 玩家);
    expect(问.length).toBe(数 + 1);
  });

  it('雪那族的横向摆动会自己触发重问（摆动就是水平位移，账不许把它当静止）', () => {
    const { world, 问 } = 造世界();
    const 天气 = 造天气(world, ZONE_IDS.SPACE);
    const 数 = 粒子数(天气);
    for (let i = 0; i < 40; i += 1) 天气.update(dt, 玩家);
    问.length = 0;
    for (let i = 0; i < 20; i += 1) 天气.update(dt, 玩家);
    const 每帧 = 为粒子问(问, 20) / 20;
    expect(每帧, '雪一直飘却一次都不重问 ⇒ 位移条件把飘的雪当成了静止').toBeGreaterThan(0);
    expect(每帧).toBeLessThanOrEqual(数 / 8);
  });
});
