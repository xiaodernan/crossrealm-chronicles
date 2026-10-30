import { describe, it, expect, afterEach } from 'vitest';
import { WorldManager } from '../src/world/WorldManager.js';
import { attachPopCultureZones } from '../src/world/PopCultureZoneEnhancer.js';
import { MAINLINE, OBJECTIVES } from '../src/content/objectives.js';
import { zoneIdAt } from '../src/content/ZoneIdentity.js';

const makeScene = () => ({ add() {}, remove() {} });
const makeDialog = () => ({ show() {}, toast() {} });

/** 主线里"有主"的那一步：有 targetId、有路点、世界里也真有那处 POI */
function 配对(world) {
  const byId = new Map(world.pointsOfInterest.map((p) => [p.id, p]));
  const out = [];
  for (const row of MAINLINE) {
    if (!row.targetId || !row.waypoint) continue;
    const poi = byId.get(row.targetId);
    if (!poi) continue;
    out.push({ row, poi });
  }
  return out;
}

const 距离 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * 路点必须和它指的那处 POI 落在**同一个区**（W-E3 切片47，纯门禁片）。
 *
 * ## 为什么要有这道门
 *
 * 主线每一格都写了两处坐标：`waypoint`（指路助手画箭头用的）和 `targetId`（那处 POI 的 id）。
 * 两处**各自**都能过已有的门：`mainline-table` 只问"路点写没写"，`poi-identity` 只问
 * "POI 有没有人认领"。于是 `waypoint: { x, z }` 把两个数字写反这种错，全套测试是绿的 ——
 * 玩家走到第 3 章，指路箭头却指着另一座位面，屏幕上一个字都不会报。
 *
 * 判据用 `zoneIdAt()`（"这个坐标属于哪片大气"的既有唯一算式），**不自己比大小**：
 * 比 `x` 的正负号只能覆盖"西边那一排"，而七座区的中心与半径各不相同。
 *
 * ## 限度（如实记）
 *
 * - 它抓的是**落错区**，抓不住"同一区里偏了 40 米"：
 *   `fantasy-frag` / `space-frag` 这两行本来就允许粗糙（50 米），所以这里只设
 *   60 米上界，把"指到别处去了"挡在外面，不假装自己在管精度。
 * - 它只检查主线行（`MAINLINE`）—— 支线的路点在 `sideQuests.js` 里另有一族读者，
 *   不在本片范围。
 */
describe('主线路点与它指的 POI 落在同一个区（W-E3 切片47）', () => {
  let world;

  const 建 = () => {
    world = new WorldManager(makeScene(), makeDialog());
    world.build();
    attachPopCultureZones({ world, dialog: makeDialog(), scene: makeScene() });
    return world;
  };

  afterEach(() => {
    world = undefined;
  });

  it('逐行比对：指路的坐标与那处 POI 同区，且距离不超过 60 米', () => {
    const w = 建();
    const pairs = 配对(w);
    // 分母自证：这一族今天有 29 行；少于 25 行说明本片根本没量到东西
    expect(pairs.length, '主线里"有 POI 的步"少得不正常 —— 这条断言不能算通过').toBeGreaterThanOrEqual(25);

    const 错区 = [];
    const 太远 = [];
    for (const { row, poi } of pairs) {
      const 指点 = zoneIdAt(row.waypoint, w.zones);
      const 实际 = zoneIdAt(poi.position, w.zones);
      if (指点 !== 实际) {
        错区.push(`${row.id}: 路点落在 ${指点}，而 "${row.targetId}" 在 ${实际}`);
      }
      const d = 距离(row.waypoint, poi.position);
      if (d > 60) 太远.push(`${row.id}: 路点离 "${row.targetId}" ${d.toFixed(1)} 米`);
    }
    expect(错区, 错区.join('\n')).toEqual([]);
    expect(太远, 太远.join('\n')).toEqual([]);
  });

  it('反向控制：把每一行的 x / z 写反，绝大多数必须被这道门点名（防恒绿）', () => {
    const w = 建();
    const pairs = 配对(w);
    const 被抓 = pairs.filter(({ row, poi }) => {
      const 真 = zoneIdAt(poi.position, w.zones);
      const 写反 = zoneIdAt({ x: row.waypoint.z, z: row.waypoint.x }, w.zones);
      return 写反 !== 真;
    });
    // 今天 27 / 29 会被抓；设 20 是给"将来某个 POI 恰好落在对角线附近"留余量，
    // 但绝不能低到"只抓一两个"—— 那种情况下这条腿就退化成空断言了。
    expect(被抓.length, '写反坐标几乎没被抓到 —— 判据量的是别的东西').toBeGreaterThanOrEqual(20);
  });

  it('分支路的落点全都在世界里（两条腿不能有一条是空气）', () => {
    const w = 建();
    const ids = new Set(w.pointsOfInterest.map((p) => p.id));
    const 缺 = [];
    for (const row of MAINLINE) {
      if (!row.branch) continue;
      for (const target of Object.values(row.branch)) {
        // `true-end` 那两条路汇回的是**章节门**（门不在主线里、也不该有 POI），跳过
        const gate = OBJECTIVES.find((r) => r.id === target && r.type === 'chapter-gate');
        if (gate) continue;
        const leg = MAINLINE.find((r) => r.id === target);
        if (!leg) 缺.push(`${row.id} → ${target}（主线里没有这一步）`);
        else if (!leg.targetId || !ids.has(leg.targetId)) 缺.push(`${row.id} → ${target}（targetId=${leg.targetId}）`);
      }
    }
    expect(缺, '这些分支目标的落点在世界里不存在 —— 玩家选了它只能对着空气互动').toEqual([]);
  });
});
