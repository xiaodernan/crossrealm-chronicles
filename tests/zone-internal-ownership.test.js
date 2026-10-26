/**
 * W-B9 切片9（修 B121）：重叠区之下，"大气归属"与"室内归属"必须是两个问题
 *
 * ## 现场读数（真世界，`WorldManager.build()`，探针 `.tmp-20261018-b121/probe-overlap.mjs`）
 * 七区的半径是 135~165 米的大气圆，两两大面积重叠；四座室内空间的半径是 8~25 米的占地。
 * - `gloom-ancient-shrine` 登记在 `gloom` 名下，世界心 `(200, 70)`、半径 12；
 *   这个点离 `space` 心 **10.0 米**、离 `gloom` 心 **36.1 米** ⇒ `zoneIdAt` 判给 `space`。
 * - `space` 名下**零座**室内空间 ⇒ 改前那道"这个点所属的区且该区注册过空间"的闸门在这里恒关，
 *   整座神殿 **0.0 %** 的足迹能答自己的地板（生产 `getGroundHeight` = 10.794 = 全局地形，
 *   期望的室内地板是 -10.000，差 **21.8 米**），`currentSpace` 永远是 null ⇒ 雾、层号、
 *   地面法向一起丢。
 * - 另外三座（tree-hollow / grand-hall / starwatch-tower）恰好判给了自己登记的那个区，
 *   所以 100 % 正常 —— 症状只在重叠区出现，这也正是它躲过上一代门禁的原因。
 *
 * ## 这一片只钉一件事
 * 大气归属（雾色、BGM、区域 HUD）保持原口径不变；室内归属改由**占地自己**回答。
 * 两问在同一个点上**同时成立且答案不同**，就是这一片的全部命题。
 * 所以这里既要有"神殿中心的大气归属仍然是 space"（不许顺手把区几何改了），
 * 也要有"同一个点的室内归属是那座神殿"，还要有"把邻区半径这个旋钮拧来拧去，只有前者跟着动"。
 *
 * ## 切片E（修 B126）在本片留下的三处口径
 *
 * 室内那一档从"占地内整体替换地面"变成了**全局高度场的一项**（占地外一条 smoothstep 过渡带
 * 收到 0，见 `InternalSpace.groundWeightAt`）。这片门禁的命题一个字没改，改的是**怎么读**：
 * - **精确**那一格挪给裸读数 `sampleGlobalHeight(…, 花名册)`：占地内权重恒 1，混合是原子的。
 *   玩家脚下的 `getGroundHeight` 走的是五抽头平滑（±0.5 米），它与地板的口径差实测 0.12 米
 *   —— 那是这座空间自己的**面形**（神殿中心凹陷、大厅中央微隆），不是"室内不认"，
 *   所以对它用的尺是一阶上坎，而不是 1e-9。
 * - ③ 那五档旋钮原来比"精确等于地板"，现在比两条结构关系：**五档互等**（差 < 1e-9）
 *   且每一档都落在那层地板的一阶上坎内 —— 后者拦住"五档一起答了室外"那种自洽的错。
 * - ⑤ 原来在代码里写着"占地内法向 = (0,1,0)"，所以法向与高度是两条口径。现在同源，
 *   于是这一条改成量"四座空间心的场差分出来必须竖直，而同一地点的自然地那一份必须歪" ——
 *   比原来那句字面量多咬得住"花名册没递进法向"这一族。
 *
 * ### 切片E 的落刀记录（本片吃到的）
 *
 * 整批五刀在 `tests/interior-ground-field.test.js` 头部那张表。这里只记本片：
 * **臂12**（`blendInterior` 不再掺这一档，但占地认领照旧）⇒ ① 地板那一档、② 整座占地答室内、
 * ③ 五档旋钮、⑤ 两条法向，共 **5 红，无漏无超出** —— 命题"室内归属与大气归属分家"没变，
 * 变的是"地面这一档活在一条场里"，四组读法一起点名，正是这一片想要的形状。
 * **臂9／臂10／臂11／臂13 本片 0 红**：①②③⑤ 问的都是**带室内的那条场**，
 * 顺序刀与网格刀（臂9/10）打的是 `WorldTerrain` 那一张皮，带宽与形状刀（臂11/13）打的是过渡带，
 * 都不落进"归属由占地认领"这个命题里 —— 让它们红的门禁另有其人。
 *
 * ## 反空跑那条尺为什么不是"差 > 20 米"
 * 上面那 21.8 米是 B121 当时的现场读数，不是判据该有的形状：缺陷② 的切片把走廊谷底到肩峰接成
 * smoothstep 之后，神殿中心的全局裸读数从 10.80 掉到 9.77（走廊#2 那一项 1.985 → −0.005），
 * 手打的 20 当场烂在原地，而"整座室内被压在地面之下"这件事一点没变。
 * 现在 ① 最后一条量的是**结构关系**：全局地面比这座室内的**顶板**（地板基准 + 一个层高，两个数都取自模板）
 * 还高出一整个层高；同一条判据顺手问 `gloom-tree-hollow`（树上的二层，顶板本就在地面之上）必须不成立，
 * 免得它变成"室内永远在地下"那样的恒等式。
 * 这条量的只是"埋得下去"这一侧（神殿实测 +12.76 米，树洞 −8.86 米）；当年那个"差 20 米"的量级
 * 不再由本片钉住 —— 地形本身归缺陷② 那三张门禁（连续性、行走见证、地面对齐）管。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorldManager } from '../src/world/WorldManager.js';
import { InternalSpaceManager, InternalSpaceTemplates } from '../src/world/InternalSpace.js';
import { sampleGlobalHeight, sampleGlobalHeightSmooth, sampleGroundNormal } from '../src/world/TerrainHeight.js';
import { playerStepUp } from './helpers/productionReadings.js';
import { ZONE_IDS, resolveZone, zoneIdAt } from '../src/content/ZoneIdentity.js';

const SRC = join(process.cwd(), 'src');
const makeScene = () => ({ add() {}, remove() {} });
const makeDialog = () => ({ show() {}, toast() {} });

/** 那座落在重叠区里的神殿 —— 本片的的主角 */
const 神殿id = 'gloom-ancient-shrine';

/** 生产里站在这座空间里时真正拿到的那个 `zone.center`（`resolveZone` 优先给静态描述，B120） */
const 区的载体 = (world, id) => resolveZone(world.zones, id);
const 空间中心 = (world, space) => space.getWorldCenter(区的载体(world, space.zoneId).center);
const 找 = (world, id) => [...world.internalSpaceManager.spacesByZone.values()].flat().find((s) => s.id === id);

/** 一座空间的占地样本：内接圆 0.9R 的方格网（每座约 90 个点，与半径无关） */
const 占地样本 = (space, center) => {
  const wc = space.getWorldCenter(center);
  const 步 = space.radius / 6;
  const 点 = [];
  for (let dx = -space.radius; dx <= space.radius; dx += 步) {
    for (let dz = -space.radius; dz <= space.radius; dz += 步) {
      if (Math.hypot(dx, dz) < space.radius * 0.9) 点.push({ x: wc.x + dx, z: wc.z + dz });
    }
  }
  return 点;
};

describe('B121：大气归属与室内归属分家', () => {
  let world;

  beforeEach(() => {
    globalThis.window = { addEventListener() {}, dispatchEvent() { return true; } };
    globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
    world = new WorldManager(makeScene(), makeDialog());
    world.build();
  });

  afterEach(() => {
    delete globalThis.window;
    delete globalThis.CustomEvent;
  });

  describe('① 同一个点、两个问题、两个答案', () => {
    it('神殿中心的大气归属仍然是 space —— 这一片没动区几何', () => {
      const 心 = 空间中心(world, 找(world, 神殿id));
      expect(zoneIdAt(心, world.zones), '大气归属仍按"最近的那个覆盖圆"').toBe(ZONE_IDS.SPACE);
      // 而 space 名下确实一座室内都没有：改前那道闸门正是这样把整座神殿关掉的
      expect(world.internalSpaceManager.spacesByZone.get(ZONE_IDS.SPACE), 'space 区注册过室内空间？')
        .toBeUndefined();
    });

    it('同一个点的室内归属是那座神殿，认领它的是登记区 gloom', () => {
      const 心 = 空间中心(world, 找(world, 神殿id));
      const 命中 = world.internalSpaceManager.spaceAtWorldPoint(心.x, 心.z);
      expect(命中?.space.id).toBe(神殿id);
      expect(命中?.zoneId).toBe(ZONE_IDS.GLOOM);
    });

    it('站在那儿：currentZone 是 space、currentSpace 是神殿，雾与层号认得出', () => {
      const 心 = 空间中心(world, 找(world, 神殿id));
      world.update(1 / 60, 心);
      expect(world.currentZone.id, '大气那条链还是 space（没被顺手改）').toBe(ZONE_IDS.SPACE);
      expect(world.internalSpaceManager.currentSpace?.id).toBe(神殿id);
      expect(world.currentInternalFog, '室内雾：改前在这里永远是 null').toBeTruthy();
      expect(world.internalSpaceFloor, '神殿是地下室那一层').toBe(-1);
    });

    it('地板答的是室内那一档，不是全局地形（改前差 21.8 米）', () => {
      const shrine = 找(world, 神殿id);
      const 载体 = 区的载体(world, shrine.zoneId);
      const 心 = 空间中心(world, shrine);
      const 期望 = shrine.getInternalHeightAt(心.x, 心.z, 载体.center);
      const 全局 = sampleGlobalHeightSmooth(心.x, 心.z, world.zones);
      /** 这座室内自己那一层的顶板：地板基准 + 一个层高 —— 两个数都取自模板，不是手打的实测 */
      const 顶板 = shrine.getWorldBaseHeight(载体.center) + shrine.floorHeight;
      expect(期望, '这座的地板在 -10 那一档').toBeCloseTo(-10, 6);
      // B126 之后室内那一档是高度场的一项：占地内权重恒 1，所以**裸读数**仍精确等于那一层；
      // 玩家脚下的五抽头只许与它差不过一阶上坎（抽头够得着 ±0.5 米，神殿那点吃的是自己
      // 室内面形的那 0.12 米，不是室外自然地）。
      expect(sampleGlobalHeight(心.x, 心.z, world.zones, world.internalSpaceManager))
        .toBeCloseTo(期望, 9);
      const 脚 = world.getGroundHeight(心.x, 心.z);
      expect(Math.abs(脚 - 期望), `站在那儿脚下比那一层地板高 ${Math.abs(脚 - 期望).toFixed(3)} 米 > 一阶上坎`)
        .toBeLessThan(playerStepUp());
      expect(脚, '改前这里答的是全局地形（差 21.8 米）').not.toBeCloseTo(全局, 6);
      // 反空跑：全局地面要把整座室内**压在下面**，而且比顶板还高出一整个层高 ——
      // 那样上一条"出口答的是室内"才不可能是两边恰好撞在同一个数上。
      // 阈值取自模板的层高，不取自某一次实测：切片D 把走廊谷底到肩峰那一段接成 smoothstep，
      // 这点的裸读数从 10.80 掉到 9.77（探针 .tmp 那批量的：走廊#2 那一项 1.985 → -0.005），
      // 当年手打的"差 > 20 米"当场烂在原地 —— 而"室内被压在地面之下几层"这件事一点没变。
      expect(全局 - 顶板, `全局地面只比室内顶板高 ${(全局 - 顶板).toFixed(2)} 米`
        + `（层高 ${shrine.floorHeight}，与室内地板差 ${Math.abs(全局 - 期望).toFixed(2)} 米）`).toBeGreaterThan(shrine.floorHeight);
      // 反向控制：同一条判据问树洞那一座（gloom 名下、树上的二层，本来就在地面之上）必须**不**成立 ——
      // 只有神殿过、别的不过，"整座室内被压在地面之下"这句话才有牙口，而不是谁都能过的恒等式。
      const 树洞 = 找(world, 'gloom-tree-hollow');
      const 树洞心 = 空间中心(world, 树洞);
      const 树洞顶板 = 树洞.getWorldBaseHeight(区的载体(world, 树洞.zoneId).center) + 树洞.floorHeight;
      const 树洞全局 = sampleGlobalHeightSmooth(树洞心.x, 树洞心.z, world.zones);
      expect(树洞全局 - 树洞顶板, `树洞的顶板竟也被压在地面下 ${(树洞全局 - 树洞顶板).toFixed(2)} 米`)
        .toBeLessThan(树洞.floorHeight);
    });
  });

  describe('② 整座占地都答室内（不是只有圆心那一点碰上了）', () => {
    it('四座空间的每个占地样本点都拿到自己那块地板，且答室内的比例是 100 %', () => {
      const 全部 = [...world.internalSpaceManager.spacesByZone.values()].flat();
      expect(全部.length, '四座模板都要注册进真世界').toBe(4);
      const 上坎 = playerStepUp();
      const 读数 = {};
      for (const space of 全部) {
        const center = 区的载体(world, space.zoneId).center;
        const 样本 = 占地样本(space, center);
        let 答室内 = 0;
        let 与全局不同 = 0;
        let 脚下漂 = 0;
        for (const p of 样本) {
          const 期望 = space.getInternalHeightAt(p.x, p.z, center);
          // 精确这一格归**裸读数**：占地内权重恒 1，混合是原子的，室内面形一个字不被掺。
          // 脚下的那条是五抽头（±0.5 米），它吃的是这座空间自己的面形，不是"室内不认"。
          const 实际 = sampleGlobalHeight(p.x, p.z, world.zones, world.internalSpaceManager);
          const 脚 = world.getGroundHeight(p.x, p.z);
          if (Math.abs(实际 - 期望) < 1e-9) 答室内++;
          if (Math.abs(脚 - 期望) > 脚下漂) 脚下漂 = Math.abs(脚 - 期望);
          if (Math.abs(脚 - sampleGlobalHeightSmooth(p.x, p.z, world.zones)) > 0.01) 与全局不同++;
          if (world.internalSpaceManager.spaceAtWorldPoint(p.x, p.z)?.space.id !== space.id) {
            expect.fail(`${space.id} 的占地样本 (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) 没被自己认领`);
          }
        }
        读数[space.id] = { 样本: 样本.length, 答室内, 与全局不同 };
        expect(样本.length, `${space.id} 的样本下限`).toBeGreaterThanOrEqual(60);
        expect(答室内, `${space.id} 答室内的样本数（共 ${样本.length}）`).toBe(样本.length);
        expect(脚下漂, `${space.id} 占地里脚下读数与那一层地板最差 ${脚下漂.toFixed(3)} 米 > 一阶上坎 ${上坎} `
          + '⇒ 平滑把室内那一档掺出了台阶').toBeLessThan(上坎);
        // 这一条不许是"全局恰好等于室内"混过去的：至少九成样本的读数与全局差得开
        expect(与全局不同 / 样本.length, `${space.id} 与全局地形读得出差值的比例`).toBeGreaterThanOrEqual(0.9);
      }
      expect(Object.values(读数).reduce((a, r) => a + r.答室内, 0), '合计答室内的样本数')
        .toBeGreaterThanOrEqual(240);
    });
  });

  describe('③ 室内归属不跟大气旋钮走', () => {
    it('把 space / gloom 的半径拧来拧去：大气归属跟着变，神殿的地板一动不动', () => {
      const shrine = 找(world, 神殿id);
      const center = 区的载体(world, shrine.zoneId).center;
      const 心 = shrine.getWorldCenter(center);
      const 期望 = shrine.getInternalHeightAt(心.x, 心.z, center);
      const space = world.zones.find((z) => z.id === ZONE_IDS.SPACE);
      const gloom = world.zones.find((z) => z.id === ZONE_IDS.GLOOM);
      const 原 = { space: space.radius, gloom: gloom.radius };

      const 试 = (空间半径, 幽暗半径) => {
        space.radius = 空间半径;
        gloom.radius = 幽暗半径;
        return { 大气: zoneIdAt(心, world.zones), 地板: world.getGroundHeight(心.x, 心.z) };
      };
      const 读数 = [
        试(原.space, 原.gloom),   // 现状：判给 space
        试(5, 原.gloom),          // 把 space 缩掉：那点只剩 gloom 盖得住
        试(400, 原.gloom),        // 把 space 撑到覆盖半个世界
        试(原.space, 20),         // 把 gloom 缩到盖不住这座神殿
        试(5, 20),                // 两边都盖不住：落到走廊
      ];
      space.radius = 原.space;
      gloom.radius = 原.gloom;

      // 旋钮对大气那条路真的有效（不是空跑）：五个档位量得出至少三种不同答案
      expect(new Set(读数.map((r) => r.大气)).size, '大气归属跟着半径变的档数').toBeGreaterThanOrEqual(3);
      expect(读数[1].大气, 'space 缩掉之后那点该判给 gloom').toBe(ZONE_IDS.GLOOM);
      expect(读数[4].大气, '两个区都盖不住时是走廊').toBe(ZONE_IDS.CORRIDOR);
      // 而室内那条路一次也没跟着动。B126 之后不再拿"精确等于地板"当尺（五抽头的口径差 0.12 米
      // 是场的形状，不是归属漂了），改成两条结构关系：**五档读数互等**，且每一档都落在
      // 那一层地板的一阶上坎之内 —— 后者防的是"五档一起答了室外"这种自洽的错。
      let 档间 = 0;
      for (const r of 读数) 档间 = Math.max(档间, Math.abs(r.地板 - 读数[0].地板));
      expect(档间, `五档地板读数最大互差 ${档间.toExponential(2)} 米 ⇒ 大气半径的旋钮动了室内那一档的读数`)
        .toBeLessThan(1e-9);
      const 上坎 = playerStepUp();
      for (const r of 读数) {
        expect(Math.abs(r.地板 - 期望), `大气=${r.大气} 那一档的地板 ${r.地板.toFixed(3)} 与 ${期望.toFixed(3)} `
          + `差 ${Math.abs(r.地板 - 期望).toFixed(3)} 米`).toBeLessThan(上坎);
      }
    });
  });

  describe('④ 室内分支不接管整片区', () => {
    it('落在 space 区内、但不在任何占地里 → 全局地形与全局法向', () => {
      const 点 = { x: 300, z: 80 };
      expect(zoneIdAt(点, world.zones)).toBe(ZONE_IDS.SPACE);
      expect(world.internalSpaceManager.spaceAtWorldPoint(点.x, 点.z)).toBe(null);
      expect(world.getGroundHeight(点.x, 点.z))
        .toBeCloseTo(sampleGlobalHeightSmooth(点.x, 点.z, world.zones), 9);
      expect(world.getGroundNormal(点.x, 点.z))
        .toEqual(sampleGroundNormal(点.x, 点.z, world.zones));
    });
  });

  describe('⑤ 一条判据三处共用（高度、法向、每帧缓存）', () => {
    // B126 之前 `getGroundNormal` 里另写了一格"占地内直接回 (0,1,0)"的特例 —— 那正是
    // "高度问一条场、法向问另一条口径"的分家（斜坡上的室内地板会给出竖直法向）。
    // 现在法向与高度同源：都由带花名册的那一条场差分出来。所以"站着是平的"这句话
    // 不再由代码写死，而是由场自己量出来 —— 四座的空间心要么平顶、要么旋转对称，
    // 差分出来的法向必须竖直；而**不带室内**的那一份在同一地点是歪的（自然地本来有坡度），
    // 于是这一条比原来那句 `toEqual({x:0,y:1,z:0})` 咬得动更多东西。
    it('四座的空间心：法向由**带室内的**那条场差分出来，且竖直（噪声位）', () => {
      for (const space of [...world.internalSpaceManager.spacesByZone.values()].flat()) {
        const 心 = 空间中心(world, space);
        const 法向 = world.getGroundNormal(心.x, 心.z);
        expect(法向, `${space.id} 心：法向与"带花名册的那条场"不是同一个数 —— 高度与法向又分家了`)
          .toEqual(sampleGroundNormal(心.x, 心.z, world.zones, world.internalSpaceManager));
        const 平 = Math.hypot(法向.x, 法向.z);
        expect(平, `${space.id} 心：室内那一档的水平分量 ${平.toFixed(6)} 不为 0（心是平顶或旋转对称）`)
          .toBeLessThan(1e-9);
        expect(法向.y).toBeGreaterThan(0.999999);
        // 反空跑：同一地点**不带室内**的那一份必须是歪的，否则上面那条"竖直"是撞上的
        const 天然 = sampleGroundNormal(心.x, 心.z, world.zones);
        expect(Math.hypot(天然.x, 天然.z), `${space.id} 心：自然地那一份本来就没坡 ⇒ 这条竖直判据量不到室内`)
          .toBeGreaterThan(1e-3);
      }
    });

    it('带内仍算室外归属，带外才把法向整个交还全局；那一帧不用跨区', () => {
      const shrine = 找(world, 神殿id);
      const 心 = 空间中心(world, shrine);
      world.update(1 / 60, 心);
      expect(world.internalSpaceManager.currentSpace?.id).toBe(神殿id);

      // 半径外 5 米：B126 之后这一点落在地面过渡带里 —— 归属已经出门，地面/法向还掺着室内
      const 带内 = { x: 心.x + shrine.radius + 5, z: 心.z };
      expect(带内.x - 心.x, '那点应当在占地外、带宽内').toBeGreaterThan(shrine.radius);
      expect(带内.x - 心.x, '那点应当在带宽内').toBeLessThan(shrine.radius + shrine.rimBand);
      expect(world.getGroundNormal(带内.x, 带内.z))
        .not.toEqual(sampleGroundNormal(带内.x, 带内.z, world.zones));
      world.update(1 / 60, 带内);
      expect(world.internalSpaceManager.currentSpace, '出了占地缓存就该归零（带宽不参与归属判据）').toBe(null);
      expect(world.currentInternalFog).toBe(null);

      // 带宽之外：法向一字不差地交还给不带花名册的那条场
      const 带外 = { x: 心.x + shrine.radius + shrine.rimBand + 5, z: 心.z };
      expect(zoneIdAt(带外, world.zones), '那点还在同一个大气区里（否则这条测的是跨区）')
        .toBe(zoneIdAt(心, world.zones));
      expect(world.getGroundNormal(带外.x, 带外.z))
        .toEqual(sampleGroundNormal(带外.x, 带外.z, world.zones));
    });
  });

  describe('⑥ 问手是这条路的一部分：问不到就当场抛，不许静默跳过', () => {
    const 裸管理器 = () => {
      const mgr = new InternalSpaceManager();
      mgr.register(InternalSpaceTemplates.gloomAncientShrine({ x: 180, y: 0, z: 100 }));
      return mgr;
    };

    // 三个入口各写一条用例：把"没挂问手"这一条摊成三个能被单独点名的症状。
    // 合成一条的话，任何只砍中其中一个入口的改动都让同一条用例变红，
    // 而用例标题说不出是哪一个入口被砍 —— 变异臂的预测因此无法归因。
    for (const [标题, 问法] of [
      ['按世界点问占地归属 → 点名 attachZoneCenterResolver', (m) => m.spaceAtWorldPoint(200, 70)],
      ['每帧缓存那条也走问手 → 点名 attachZoneCenterResolver', (m) => m.updateCurrent(200, 70)],
      ['高度入口同样先问中心 → 点名 attachZoneCenterResolver', (m) => m.getInternalHeightAtWorldPoint(200, 70)],
    ]) {
      it(标题, () => {
        expect(() => 问法(裸管理器())).toThrow(/attachZoneCenterResolver/);
      });
    }

    it('登记表里那个区问不到中心 → 抛错点名那个区 id（静默跳过就是 B121）', () => {
      const mgr = 裸管理器().attachZoneCenterResolver(() => null);
      expect(() => mgr.spaceAtWorldPoint(200, 70)).toThrow(new RegExp(`登记在 "${ZONE_IDS.GLOOM}" 名下`));
      // 反向控制：同一条代码路径，问得到就不抛
      const 好 = 裸管理器().attachZoneCenterResolver((id) => (id === ZONE_IDS.GLOOM ? { x: 180, y: 0, z: 100 } : null));
      expect(好.spaceAtWorldPoint(200, 70)?.space.id).toBe(神殿id);
    });

    it('真世界上每个登记了空间的区都问得到、且带有限的 y（⑥ 那条抛不许在生产上炸）', () => {
      const 登记 = [...world.internalSpaceManager.spacesByZone.keys()];
      expect(登记.length, '登记了室内空间的区数').toBeGreaterThanOrEqual(2);
      for (const id of 登记) {
        const 中心 = resolveZone(world.zones, id)?.center;
        expect(中心, `${id} 问不到中心`).toBeTruthy();
        expect(Number.isFinite(中心.y), `${id} 的 center.y`).toBe(true);
      }
    });
  });

  describe('⑦ 结构：收敛那一步没有第二份实现，口径写在了 docs 里', () => {
    /** EOL：仓库里源码可能是 CRLF 检出，先归一化（切片14 同族教训） */
    const 读 = (...相对) => readFileSync(join(SRC, ...相对), 'utf8').replace(/\r\n/g, '\n');
    /** 整行注释从尺子里去掉：量的是代码，不是"注释里提到了这句" */
    const 去注释 = (体) => 体.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

    const wm = () => 去注释(读('world', 'WorldManager.js'));
    const is = () => 去注释(读('world', 'InternalSpace.js'));

    it('两份源码都扫得到东西（扫不出内容的"绝迹"不算证据）', () => {
      expect(wm().length, 'WorldManager 去注释后的字符数').toBeGreaterThan(3000);
      expect(is().length, 'InternalSpace 去注释后的字符数').toBeGreaterThan(3000);
      expect(is().includes('spaceAtWorldPoint'), '管理器里应当真有占地归属这一条').toBe(true);
    });

    it('"这个点所属的区且该区有空间"那道闸门整个绝迹', () => {
      for (const 坏字样 of ['zoneWithSpace', '_zoneAt', 'querySpaceAt', 'getInternalHeightAtPoint']) {
        expect(wm().includes(坏字样), `WorldManager 里不该再有 ${坏字样}（B121 的那步收敛）`).toBe(false);
        expect(is().includes(坏字样), `InternalSpace 里不该再有 ${坏字样}`).toBe(false);
      }
    });

    it('WorldManager 只剩一处 `zoneIdAt(` 调用 —— 它只回答大气', () => {
      const 命中 = wm().match(/zoneIdAt\(/g) ?? [];
      expect(命中.length, `zoneIdAt( 的调用点：${命中.length} 处`).toBe(1);
    });

    it('递给管理器的只有两个世界坐标（区 id、区中心都不再过去）', () => {
      const 体 = wm();
      const 起 = 体.indexOf('updateCurrent(');
      expect(起, 'WorldManager 每帧要刷室内归属').toBeGreaterThan(-1);
      const 参 = 体.slice(起 + 'updateCurrent('.length, 体.indexOf(')', 起)).trim();
      expect(参, 'updateCurrent 的参数表').toBe('playerPos.x, playerPos.z');
    });

    it('占地认领只有一处：`containsWorldPoint` 只在 `spaceAtWorldPoint` 里被调用', () => {
      const 体 = is();
      const 起 = 体.indexOf('spaceAtWorldPoint(worldX, worldZ) {');
      expect(起, '管理器里应当有 spaceAtWorldPoint 这个方法').toBeGreaterThan(-1);
      const 方法 = 体.slice(起, 体.indexOf('\n  }', 起));
      expect((体.match(/\.containsWorldPoint\(/g) ?? []).length, '全文件对占地的调用数').toBe(1);
      expect((方法.match(/\.containsWorldPoint\(/g) ?? []).length, '这条方法里的调用数').toBe(1);
      // 换算用的区中心必须向问手现问，不是调用方递进来的（方法头只有两个世界坐标，已由上面的 indexOf 钉住）
      expect(/_zoneCenterFor\(zoneId\)/.test(方法), '登记区的中心要向问手现问').toBe(true);
    });

    it('高度与每帧缓存都走这一条：两处方法体里各有且只有一次 `spaceAtWorldPoint(` 调用', () => {
      const 体 = is();
      const 数 = (头) => {
        const 起 = 体.indexOf(头);
        expect(起, `管理器里应当有 ${头}`).toBeGreaterThan(-1);
        return (体.slice(起, 体.indexOf('\n  }', 起)).match(/spaceAtWorldPoint\(/g) ?? []).length;
      };
      expect(数('updateCurrent(worldX, worldZ) {'), 'updateCurrent 里的调用数').toBe(1);
      expect(数('getInternalHeightAtWorldPoint(worldX, worldZ) {'), '高度入口里的调用数').toBe(1);
    });

    it('`zoneIdAt` 的口径写在它自己的 doc 里（两区半径覆盖同一个点时归谁）', () => {
      const 源 = 读('content', 'ZoneIdentity.js');
      const 头 = 源.lastIndexOf('/**', 源.indexOf('export function zoneIdAt('));
      expect(头, 'zoneIdAt 应当带 doc').toBeGreaterThan(-1);
      const doc = 源.slice(头, 源.indexOf('export function zoneIdAt('));
      for (const 关键词 of ['大气归属', 'spaceAtWorldPoint', 'B121']) {
        expect(doc.includes(关键词), `zoneIdAt 的口径注释里少了「${关键词}」`).toBe(true);
      }
    });

    it('四座空间的占地两两分离 —— "取第一个命中"今天才无歧义', () => {
      const 全部 = [...world.internalSpaceManager.spacesByZone.values()].flat();
      let 相交 = 0;
      const 最紧 = { 比: Infinity, 对: '—' };
      for (let i = 0; i < 全部.length; i++) {
        for (let j = i + 1; j < 全部.length; j++) {
          const a = 空间中心(world, 全部[i]);
          const b = 空间中心(world, 全部[j]);
          const 距 = Math.hypot(a.x - b.x, a.z - b.z);
          const 和 = 全部[i].radius + 全部[j].radius;
          if (距 < 和) 相交++;
          if (距 - 和 < 最紧.比) { 最紧.比 = 距 - 和; 最紧.对 = `${全部[i].id} × ${全部[j].id}`; }
        }
      }
      expect(相交, `两两相交的占地对数（最紧的一对还余 ${最紧.比.toFixed(1)} 米）`).toBe(0);
    });
  });
});
