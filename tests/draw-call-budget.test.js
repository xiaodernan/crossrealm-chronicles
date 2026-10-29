/**
 * draw call 预算的门禁（W-C2 切片4，#157）。
 *
 * ## 这一片在收什么
 *
 * 2026-10-18 的分母重测（`.tmp-20261018-b94/`，台账 B94）把 B94 那笔"draw call < 400 达标"
 * 重新打开了：剔除修好之后，**逐站分母是 151–918**（八站），而不是当年那句"静置 226"。
 * 交到本片的三句硬话有三条，全在本文件里落地：
 *   ① 预算表**按站列**（一个全局上限会同时放过坏站和冤枉好站）；
 *   ② 拆**"本体 / 阴影"两列**（静置那一帧 402 = 211 + 191）；
 *   ③ **钉住站点 + 朝向 + `timeOfDay` + 结算帧数**（否则门禁红绿由噪声决定）。
 *
 * ## 这一片的题眼："达标"不许有两处定义
 *
 * `renderer.info.render.calls` 有两个读者：CI 里那张表，和开发期 HUD 上那一行红绿。
 * 修之前 HUD 里写的是硬编码的 `> 400` —— 门禁改了上限，画面上的红不会跟着变。
 * 所以名册住在 `src/engine/drawCallBudget.js`（零 three 依赖，node 能直接 import），
 * 脚本与 HUD 都从这里取。
 *
 * ## 第二条题眼：坐标**不抄**（B120 / B121 那一课）
 *
 * 站点名单里**只有 id**。坐标在运行时从世界里读：枢纽读 `HUB_ZONE.center`，
 * 其余读 `world.zones` 里那一实例自己的 `center`。
 * 抄一份坐标 = 区域一搬家抄本烂在原地，而门禁还绿着 —— 那正是 B120 的形状。
 * 这条由**结构腿**（源码里不许出现坐标字面量）与**行为腿**（判定函数吃改过的数据会红）两道钉住。
 *
 * ## 判据放在生产代码里，不放在用例里
 *
 * `overCeiling` / `missingCeilings` / `extraCeilings` 是 `src/engine/drawCallBudget.js` 里的
 * 纯函数，`scripts/perf-smoke.mjs` 与本文件问的是**同一个判**。各写一份判迟早漂开
 * （W-D4 切片3"判据与执行分家"的同一条纪律）。所以下面每条"反面控制"都是真的
 * 喂一份坏数据给生产判定，而不是在用例里复刻一遍判断。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DRAW_CALL_BUDGETS,
  DRAW_CALL_CEILINGS,
  DRAW_CALL_STATION_IDS,
  DRAW_CALL_HUB_CENTER,
  DRAW_CALL_RECIPE,
  DRAW_CALL_ACCEPT_LINE,
  overCeiling,
  missingCeilings,
  extraCeilings,
} from '../src/engine/drawCallBudget.js';
import { ZONE_IDS, ZONE_ORDER, HUB_ZONE } from '../src/content/ZoneIdentity.js';
import { PERF_BUDGETS } from '../scripts/perf-budgets.mjs';
import { draw读数问题 } from '../scripts/harness-readings.mjs';

const SRC = join(process.cwd(), 'src');
const 读 = (相对) => readFileSync(join(SRC, ...相对), 'utf8');
const 脚本源 = readFileSync(join(process.cwd(), 'scripts', 'perf-smoke.mjs'), 'utf8');

describe('单一真源："达标"不许有两处定义', () => {
  it('预算表挂进来的是同一份对象，不是抄本', () => {
    expect(PERF_BUDGETS.drawCalls).toBe(DRAW_CALL_BUDGETS);
    expect(PERF_BUDGETS.drawCalls.ceilings).toBe(DRAW_CALL_CEILINGS);
    expect(PERF_BUDGETS.drawCalls.stationIds).toBe(DRAW_CALL_STATION_IDS);
  });

  it('HUD 的 draw call 阈值来自名册，不是硬编码', () => {
    const 源 = 读(['engine', 'PerfHUD.js']);
    expect(源, 'PerfHUD 没从 drawCallBudget 取阈值').toMatch(/import\s*\{[^}]*DRAW_CALL_ACCEPT_LINE[^}]*\}\s*from\s*'\.\/drawCallBudget\.js'/);
    expect(源, 'PerfHUD 的 draw call 那一行没用名册里的验收线').toMatch(/draw call[\s\S]{0,120}DRAW_CALL_ACCEPT_LINE/);
    // 硬编码的 400 阈值不许回流：那一行里不许再出现裸的 400
    const 那一行 = 源.split('\n').find((l) => l.includes('draw call') && l.includes('warn'));
    expect(那一行, 'PerfHUD 里找不到 draw call 那一行').toBeTruthy();
    expect(那一行, '那一行里又出现了硬编码的 400').not.toMatch(/[^_A-Za-z]400\b/);
  });

  it('验收线本身是一个数（不是表、不是 undefined）', () => {
    expect(typeof DRAW_CALL_ACCEPT_LINE).toBe('number');
    expect(DRAW_CALL_ACCEPT_LINE).toBeGreaterThan(0);
  });
});

describe('站点名单是推导的，不是抄的', () => {
  it('名单 = 枢纽 + ZONE_ORDER（逐格相等）', () => {
    expect([...DRAW_CALL_STATION_IDS]).toEqual([ZONE_IDS.HUB, ...ZONE_ORDER]);
    /**
     * 只比**内容**不够：手写一份 id 表在今天就与真表逐格相等，于是加一个区域时
     * 手写表不会跟着长，而那正是这条名单存在的理由（新区域必须立刻有名册格与上限）。
     * 所以声明本身也要钉：只能是 `Object.freeze([ZONE_IDS.HUB, ...ZONE_ORDER])`。
     */
    const 源 = 读(['engine', 'drawCallBudget.js']);
    expect(源, '站点名单不是从 ZONE_ORDER 推出来的（手写一份 id 表 = 加区域不会自动进名册）')
      .toMatch(/DRAW_CALL_STATION_IDS\s*=\s*Object\.freeze\(\[ZONE_IDS\.HUB,\s*\.\.\.ZONE_ORDER\]\)/);
  });

  it('名单里没有坐标 —— 结构腿：源码不许出现"站点 + 坐标"那份抄本', () => {
    const 源 = 读(['engine', 'drawCallBudget.js']);
    // 抄本的形状：{ zoneId: 'x', x: <数>, z: <数> } 或 { id, x, z }
    expect(源, 'drawCallBudget 里出现了一份带坐标的站点表 —— 抄本会烂在原地').not.toMatch(/zoneId\s*:\s*['"`][a-z]+['"`]\s*,\s*x\s*:/);
    expect(源, 'drawCallBudget 里出现了一份带坐标的站点表').not.toMatch(/\{\s*id\s*:\s*['"`][a-z]+['"`]\s*,\s*x\s*:/);
    // 名单只能是 id 的数组
    for (const id of DRAW_CALL_STATION_IDS) expect(typeof id, `站点 "${id}" 不是字符串 id`).toBe('string');
  });

  it('枢纽坐标取自真源（同一引用，不是手抄的 {x:0,z:55}）', () => {
    expect(DRAW_CALL_HUB_CENTER).toBe(HUB_ZONE.center);
    expect(DRAW_CALL_HUB_CENTER).toEqual({ x: 0, z: 55 });
  });

  it('其余站点的坐标只能从世界里读 —— 脚本里不许出现坐标字面量', () => {
    // 脚本里若写死坐标 = 又一份抄本。允许出现的只有"从 world.zones 里按 id 找"这条真源路径。
    expect(脚本源, '脚本里没有从 world.zones 读坐标的那条路径').toMatch(/world\.zones/);
    expect(脚本源, '脚本里没有按 id 找区实例').toMatch(/\.find\(\s*\(Z\)\s*=>\s*Z\.id\s*===\s*站id\s*\)/);
    // 不许出现形如 "x": -200 这样的坐标字面量表
    expect(脚本源, '脚本里出现了一份坐标字面量表').not.toMatch(/x\s*:\s*-\d+\s*,\s*z\s*:\s*-?\d+/);
  });
});

describe('上限表与站点名单一一对应', () => {
  it('不多不少（多 = 给没测过的站发通行证；少 = 静默放开那一站）', () => {
    expect(missingCeilings(DRAW_CALL_STATION_IDS, DRAW_CALL_CEILINGS)).toEqual([]);
    expect(extraCeilings(DRAW_CALL_STATION_IDS, DRAW_CALL_CEILINGS)).toEqual([]);
    expect(Object.keys(DRAW_CALL_CEILINGS).sort()).toEqual([...DRAW_CALL_STATION_IDS].sort());
  });

  it('每站三列都是正数（写成 0 或负数，门禁就在空转）', () => {
    for (const id of DRAW_CALL_STATION_IDS) {
      const 上 = DRAW_CALL_CEILINGS[id];
      expect(上, `站点 "${id}" 没有上限`).toBeTruthy();
      for (const 列 of ['frame', 'body', 'shadow']) {
        expect(typeof 上[列], `站点 "${id}" 的 "${列}" 不是数`).toBe('number');
        expect(上[列], `站点 "${id}" 的 "${列}" 不是正数`).toBeGreaterThan(0);
      }
    }
  });

  it('三列自洽：阴影列 + 本体列应当与整帧列同量级（整帧不是本体、也不是阴影）', () => {
    for (const id of DRAW_CALL_STATION_IDS) {
      const 上 = DRAW_CALL_CEILINGS[id];
      expect(上.body, `站点 "${id}" 的本体上限 ≥ 整帧上限（两列至少得同量级）`).toBeLessThan(上.frame);
      expect(上.shadow, `站点 "${id}" 的阴影上限 ≥ 整帧上限`).toBeLessThan(上.frame);
    }
  });
});

describe('配方钉死：读数只有在配方钉死时才是数', () => {
  it('四个自由度都在（少一个，门禁红绿就由噪声决定）', () => {
    for (const 键 of ['timeOfDay', 'yaw', 'pitch', 'settleFrames']) {
      expect(DRAW_CALL_RECIPE[键], `配方少了 "${键}"`).toBeDefined();
      expect(typeof DRAW_CALL_RECIPE[键], `配方 "${键}" 不是数`).toBe('number');
    }
    expect(Number.isInteger(DRAW_CALL_RECIPE.settleFrames)).toBe(true);
    expect(DRAW_CALL_RECIPE.settleFrames, '结算帧数必须是正数').toBeGreaterThan(0);
    expect(DRAW_CALL_RECIPE.timeOfDay).toBeGreaterThanOrEqual(0);
    expect(DRAW_CALL_RECIPE.timeOfDay).toBeLessThanOrEqual(1);
  });

  it('配方是冻结的（运行中被改 = 读数口径当场漂）', () => {
    expect(Object.isFrozen(DRAW_CALL_RECIPE)).toBe(true);
    expect(Object.isFrozen(DRAW_CALL_BUDGETS)).toBe(true);
    expect(Object.isFrozen(DRAW_CALL_STATION_IDS)).toBe(true);
    expect(Object.isFrozen(DRAW_CALL_CEILINGS)).toBe(true);
  });

  it('第五个自由度（页龄）**钉不进配方**，只能钉取样规则（切片12，B154）', () => {
    /**
     * 上面那四个都能靠"取账前把状态设成某个值"钉住；页龄不行 —— 掉落物的寿命
     * （`LootSystem` 的 `DROP_LIFE = 30`）减的是 `dt`（**真实时间**），把它钉住等于取消掉落物本身，
     * 那是玩法不是尺子。所以这一条判的是**形状**：
     * - 配方里必须**正好**是那四个数 —— 多出一个 `pageAge: 0` 之类的"假钉子"，
     *   下一个人就会以为这一列被控住了（而它其实只是没让人看见它在漂）。
     * - 它的处置写在两处，都在源码文本里（文本腿判不了行为，但这里被处置的正是"口径的说明"）：
     *   头部"口径"一节要留着那条自由度，取样规则要留着"一站只取一次账"。
     */
    expect(Object.keys(DRAW_CALL_RECIPE).sort(), '配方里的键不再是那四个自由度（页龄不能当配方钉）')
      .toEqual(['pitch', 'settleFrames', 'timeOfDay', 'yaw']);
    const 名册源 = 读(['engine', 'drawCallBudget.js']);
    expect(名册源, '头部不再提"页龄"这条自由度 ⇒ 下一个人会把 20–40 个 call 的差读成"内容涨了"')
      .toMatch(/页龄/);
    expect(名册源, '取样规则"一站只取一次账"没了 ⇒ 同页多轮取最大会把耗尽后的残局当世界开销')
      .toMatch(/只取一次/);
    expect(名册源, '没写清"地板只吃年轻页读数"⇒ 残局读数会重新混进地板').toMatch(/只吃\*\*年轻页\*\*|只吃年轻页/);
  });
});

describe('脚本真的在用这三列 + 那几处当场拒', () => {
  it('三列都读、也都比', () => {
    // 四个词：`阴影` 是报告列（三列自洽那条判据要它），`阴影趟` 是数出来的那一列（上限吃它）。
    // 少了前者，差值不再被核对；少了后者，越预算那一格又回到吃差值。
    for (const 列 of ['整帧', '本体', '阴影', '阴影趟']) {
      expect(脚本源, `脚本里没有 "${列}" 这一列`).toContain(列);
    }
    // **调用点**，不是词面：一个 `import { overCeiling }` 或一句注释都能骗过 `toContain`，
    // 而脚本要是自己内联一遍比较，名册与门禁就成了两处定义（本片正是要消灭这个）。
    expect(脚本源, '脚本没有真的调用共享的判定函数（只剩 import 或注释不算）').toMatch(/越线\.push\(\.\.\.overCeiling\(/);
    expect(脚本源, '脚本没有真的调用共享的缺站判定').toMatch(/= missingCeilings\(/);
    expect(脚本源, '脚本没有真的调用共享的多站判定').toMatch(/= extraCeilings\(/);
  });

  it('四处当场拒都在（读数作废，而不是"记为通过"）', () => {
    // ① 站错区 ② timeOfDay 没钉住 ③ 阴影趟为 0 ④ 站点 id 在世界里找不到
    expect(脚本源, '少了"站错区"那条拒').toMatch(/现在落在/);
    expect(脚本源, '少了"timeOfDay 没钉住"那条拒').toMatch(/timeOfDay 没钉住/);
    expect(脚本源, '少了"世界里没有这一区"那条拒').toMatch(/世界里没有 id 为/);
    /**
     * ③ 这一条从切片6b 起住在 `scripts/harness-readings.mjs`（"每一列都得是数"那条判据的邻居），
     * 脚本只负责"不合格就抛"。所以这里**不再**在脚本里找那句话 —— 那句话改由下面的行为腿
     * 真喂一份坏读数验它出得来；脚本这一侧验的是"它确实问了那个判、且问了就抛"。
     */
    expect(脚本源, '脚本没有问三列的完整性判据').toMatch(/const 问 = draw读数问题\(站id, r\);/);
    expect(脚本源, '问了之后没有作废（不抛 = 记为通过）').toMatch(/站点 \$\{站id\} 的 draw call 腿不是一次测量/);
    const 问 = draw读数问题('hub', { 整帧: 278, 本体: 278, 阴影: 0, 三角面: 120000 });
    expect(问.join('\n'), '阴影趟读到 0 那句话不再出自判据模块').toMatch(/阴影趟读到 0（整帧 278 \/ 本体 278）/);
    expect(问.join('\n')).toMatch(/关阴影没有减少任何 call/);
  });

  it('世界侧对账也在（加了新区域却没进名单 ⇒ 当场红）', () => {
    expect(脚本源, '脚本没有做世界侧对账').toMatch(/世界里有区不在 draw call 站点名单里/);
  });

  it('取账方式与 B94 那一批逐字一致（钉时刻 → update → info.reset() → render()）', () => {
    expect(脚本源, '脚本没有钉 timeOfDay').toMatch(/g\.timeOfDay\s*=\s*配方\.timeOfDay/);
    expect(脚本源, '脚本没有 info.reset()').toMatch(/i\.reset\(\)/);
    expect(脚本源, '脚本没有 render()').toMatch(/g\.render\(\)/);
  });

  it('timeOfDay 那一拒是**精确相等**，而且钉在 update 之后（update 每帧都推进时刻）', () => {
    /**
     * `update()` 末尾调 `updateDayNight(dt)`，里面 `timeOfDay = (timeOfDay + dt * 0.005) % 1`
     * —— 所以"先钉后 update"再去比 `!== 配方` 是**永远为真**的拒：第一个站点就红。
     * 2026-10-20 第一次真跑正是这个红。修法是挪钉的位置（update 之后、reset 之前），
     * 让"渲染器看到的时刻"逐字等于配方，而不是给比较加容差 —— 容差会变成下一次红之后
     * 被放宽的那个数。
     */
    const 一趟体 = 脚本源.slice(脚本源.indexOf('const 一趟 = () => {'), 脚本源.indexOf('const 整帧 = 一趟()'));
    expect(一趟体, '找不到一趟() 的函数体').toBeTruthy();
    const 序 = ['g.update();', '钉();', 'i.reset();', 'g.render();'].map((句) => 一趟体.indexOf(句));
    expect(序, `一趟() 里缺句子：${JSON.stringify(序)}`).not.toContain(-1);
    expect(序, `一趟() 的顺序不是 update→钉→reset→render，而是 ${JSON.stringify(序)}`).toEqual([...序].sort((a, b) => a - b));
    // 比较必须是精确相等（两处：钉住值 vs 配方、render 前后自己漂没漂）
    expect(脚本源, 'timeOfDay 的比较不是精确相等').toMatch(/钉住的 !== 配方\.timeOfDay \|\| g\.timeOfDay !== 钉住的/);
    expect(脚本源, '给 timeOfDay 加了容差（那会把这条拒变成可调的数）').not.toMatch(/Math\.abs\([^)]*timeOfDay[^)]*\)\s*(<=|<)/i);
  });
});

describe('反面控制：判定函数真的咬得住（喂坏数据必须红）', () => {
  it('越线：整帧超了就报，超了本体/阴影趟也各报一条', () => {
    const 上 = { frame: 100, body: 60, shadow: 40 };
    expect(overCeiling({ 站: 'a', 整帧: 100, 本体: 60, 阴影趟: 40 }, { a: 上 })).toEqual([]);
    expect(overCeiling({ 站: 'a', 整帧: 101, 本体: 60, 阴影趟: 40 }, { a: 上 })).toHaveLength(1);
    expect(overCeiling({ 站: 'a', 整帧: 100, 本体: 61, 阴影趟: 40 }, { a: 上 })).toHaveLength(1);
    expect(overCeiling({ 站: 'a', 整帧: 100, 本体: 60, 阴影趟: 41 }, { a: 上 })).toHaveLength(1);
    expect(overCeiling({ 站: 'a', 整帧: 999, 本体: 999, 阴影趟: 999 }, { a: 上 })).toHaveLength(3);
  });

  /**
   * **第三列的名字是判据的一部分**（B152）。
   *
   * 阴影那一格从"报告列的差"换成"数出来的笔数"之后，比较吃的是 `阴影趟` 这个**新字段**。
   * 如果这里还用旧名 `阴影`，脚本里少交一个字段（或把它划回 `整帧 − 本体`）就读成 `undefined`，
   * 而 `undefined > 上限` 是 false —— 这一格会**绿在空尺上**，正是 `harness-readings.mjs`
   * 头部那条"NaN 不参与大于"的洞换了个字段名重演。所以这里喂三份坏形状：缺字段、NaN、小数。
   */
  it('阴影趟缺字段 / NaN / 小数 ⇒ 点名拒绝，不静默放过', () => {
    const 上 = { frame: 100, body: 60, shadow: 40 };
    const 缺 = overCeiling({ 站: 'a', 整帧: 100, 本体: 60 }, { a: 上 });
    expect(缺, '缺阴影趟这一列被当成了"没越线"').toHaveLength(1);
    expect(缺[0]).toMatch(/阴影趟 读到 undefined/);
    expect(overCeiling({ 站: 'a', 整帧: 100, 本体: 60, 阴影趟: NaN }, { a: 上 })[0]).toMatch(/不是整数/);
    expect(overCeiling({ 站: 'a', 整帧: 100, 本体: 60, 阴影趟: 40.5 }, { a: 上 })[0]).toMatch(/不是整数/);
    // 旧字段名不再是那一格：只交 `阴影`（报告列的差）读出来同样是"没量到"，
    // 且点的是"不是整数"那一句，不是"999 > 40"—— 这一句就是"阴影那一格已经不吃差值"的正面见证
    const 旧字段 = overCeiling({ 站: 'a', 整帧: 100, 本体: 60, 阴影: 999 }, { a: 上 });
    expect(旧字段, '把报告列的差交给阴影那一格，不该被当成一次测量').toHaveLength(1);
    expect(旧字段[0], '那一格报的不是"空尺"而是"越线"，说明还在吃旧字段').toMatch(/阴影趟 读到 undefined/);
    // 反证：差值再大也不算越线，数出来的那列在内 ⇒ 空。这把尺换读者换得彻底。
    expect(overCeiling({ 站: 'a', 整帧: 100, 本体: 60, 阴影: 999, 阴影趟: 40 }, { a: 上 })).toEqual([]);
    // 整帧/本体两列同罪：缺哪一列点哪一列，且**只有那一列**被点
    const 只缺本体 = overCeiling({ 站: 'a', 整帧: 100, 阴影趟: 40 }, { a: 上 });
    expect(只缺本体).toHaveLength(1);
    expect(只缺本体[0]).toMatch(/本体 读到 undefined/);
  });

  it('越线：站点不在上限表里 ⇒ 报"缺站"而不是静默放过', () => {
    const 越 = overCeiling({ 站: 'x', 整帧: 10, 本体: 5, 阴影趟: 5 }, {});
    expect(越).toHaveLength(1);
    expect(越[0]).toMatch(/上限表里没有这一站/);
  });

  it('缺站：名单比上限表多一站 ⇒ 点名那一站', () => {
    expect(missingCeilings(['a', 'b'], { a: {} })).toEqual(['b']);
    expect(missingCeilings(['a'], { a: {} })).toEqual([]);
  });

  it('多站：上限表比名单多一站 ⇒ 点名那一站', () => {
    expect(extraCeilings(['a'], { a: {}, b: {} })).toEqual(['b']);
    expect(extraCeilings(['a'], { a: {} })).toEqual([]);
  });

  it('控制臂：一条都不动 ⇒ 三条判定都空（证明上面几条不是恒红）', () => {
    const 上限 = { a: { frame: 100, body: 60, shadow: 40 } };
    expect(overCeiling({ 站: 'a', 整帧: 100, 本体: 60, 阴影趟: 40 }, 上限)).toEqual([]);
    expect(missingCeilings(['a'], 上限)).toEqual([]);
    expect(extraCeilings(['a'], 上限)).toEqual([]);
  });

  it('真表本身也不越线：上限必须落在本配方实测值的两侧带里', () => {
    // 本配方实测最大值，**逐格注明出处**（"地板必须由量出上限的那同一把尺给"）：
    //
    // **三行都在 2026-10-29 W-C2 切片12（B154）重钉过**，推导脚本 `.tmp-20261029-s16/floors.mjs`
    // —— 它扫今天散在各处的同配方日志（11 个文件、134 条读数，每条自带出处）算地板，不手抄数。
    // 地板的定义没变（"**同配方全部读数的最大**"），切片12 加的是**第二条限制**：
    // 只有**年轻页**的读数进地板。理由见下面"页龄是第五个自由度"那一段。
    //
    // - **frame / body 两行 = 今天年轻页最大 并上 2026-10-24 那批**，逐格取最大（只收不放）。
    //   旧行的日志（`.tmp-175/*`）已经不在这台机器上，那两行是那份扫描唯一的抄本，所以脚本里
    //   把它们当作一份**历史见证**并进来，而不是当作今天的一把尺。六格今天读得更高
    //   （frame：hub 267→288、magic 584→593、space 211→218、void 134→139、abyss 122→123、
    //   radiant 440→455；body 同向 +1～+15），两格保持旧数（fantasy 267 / 213、gloom 184 / 120 ——
    //   今天年轻页只读到 260/205、161/95）。把旧行改低**不是**"收紧"：那等于用"今天没读到"
    //   冒充"今天读不到"，而地板往下挪一寸，上面那条 1.6× 上界就跟着松一寸。
    // - **年轻页的出处**：门内腿后 `.tmp-20261029-b151/perf-s35b.log`（hub 288/226）与
    //   `perf-run2.log`（gloom 161/95）；同页首访 `.tmp-20261029-s16/spread-head-pinned.log`
    //   （四页 × 八站，一页一读）；同页首访/首轮 `.tmp-20261029-s14/counted{,2}.log`、
    //   `.tmp-20261029-s16/mech2-hub.log`（magic 593、space 218 这两格出自这里）。
    //   **平面（`4911300`，`spread-plane-pinned.log`）那批不进地板**：它量的是 174 个提交之前的
    //   世界，与 2026-10-18 那批"合批前的数"是同一条坑 —— 但它是下面归因的第二把尺，见 ②。
    // - **shadow 一行**：口径与出处都还是切片11 那一套（**数出来的**笔数，
    //   `.tmp-20261029-s14/counted*.log` 八站 × 五轮并上真门 `.tmp-20261029-s14/perf-s11.log`）。
    //   切片12 复核后**一格没动**，而且它不是"没来得及动"：同一页从年轻读到残局，整帧掉 25–40
    //   个 call，这一列七轮 + 跨页加载全同值（见下面 ③）—— 页龄那条自由度根本不碰它。
    //
    // ## B154 归因：这 10 格之差是**内容**，不是运气，也不是抖动（切片12 判完，逐条有出处）
    //
    // B154 留的问题是那一句"高 8% 是切片11→33 加了内容，还是种子挑了一份更密的布局"。三条证据：
    //
    // **① 种子运气排除了。** 钉上世界种子（`WORLD_SEED = 20261028`）之后，同一棵树、同一颗种子、
    // **每页只读一次**连开四页（`spread-head-pinned.log`）：八站里六站的极差是 **0**，
    // hub 与 radiant 是 **2**（283/283/285/285、451/453）。而 2026-10-24 那个 hub 地板 267 出自
    // **未播种**的那批 —— 它面对的是每页一份新布局的散布。跨页只剩 0–2 个 call ⇒ 那 267 不是
    // 一份运气好的稀疏布局；今天读到 288 也不可能是"这一页的布局恰好密"。
    //
    // **② 差来自内容增量。** 把 2026-10-24 的 HEAD（`4911300`）单独 checkout 成平面
    // `D:/3a-plane-b154`，**同一颗种子、同一份配方、同样是年轻页**再读一遍八站，与今天的树逐格比：
    // hub **+23/+23**、magic +15/+12、space +11/+5、void +7/+6、radiant +11/+11、abyss +2/+1，
    // 而 fantasy **−7/−8**、gloom **−13/−15**。布局这一项已经被种子钉成同一份，所以差只剩内容。
    // 两站是**负的** —— 这句话必须逐格说，不许收成"世界长了 8%"：切片11→33 里 hub/magic 那条线
    // 在加东西，fantasy/gloom 那条线在减东西（合并/剔除），一个整体百分比会把后者洗掉。
    //
    // **③ 页龄是这份配方的第五个自由度**（头部"口径"一节原来只列四个，切片12 补第五个）。
    // 探针 `.tmp-20261029-s16/mech2.mjs` 在**同一个页、同一颗种子、来回路过同一站**取账：
    // hub 整帧 首访 **283** → 第 1 遍回 **288** → 第 2 遍回 **288** → 第 3 遍回 **258**，
    // 本体同向 221/226/226/196。掉下去的那 30 个 call 有名字：页面上瞬时的掉落物从 6 件涨到
    // **21 件**再归零（`LootSystem` 的掉落三件套，`DROP_LIFE = 30` 是**真实秒**、被 `dt` 递减），
    // 而数出来的阴影列在这些轮里**一个都不动** —— 掉落件不投影。所以：
    // - 地板只吃**年轻页**（首访 + 首轮/次轮 + 真门那种"CPU 腿之后"的腿后），残局只当交叉核对；
    // - 真门 `npm run perf` 一站只取一次账，永远落在年轻页那一档 ⇒ 门内读数与地板同源；
    // - 门自己交出两份见证（`掉落` 与 `可画件`，判据在 `scripts/harness-readings.mjs` 的 `DRAW附列`），
    //   下一次再出现 20–40 个 call 的差，账本里就有页龄这一列，不必重跑几分钟的探针去猜是谁。
    //
    // **上限表这一片一格都没动**（24 格）。规则给的数（地板 × 1.15 上取整到 10）在 14 格里比现值松，
    // 按"只收不放"保持现值；余量点名：最紧的是 hub 本体 **6.2%**（240 对 226）、hub 整帧 **7.6%**
    // （310 对 288）、gloom 本体 **8.3%**（130 对 120）、radiant 两格 **9.9%/9.8%**。
    // 这就是 B154 关掉时留下的话：**重钉之后那三格仍然紧**，下一片往 hub 加内容之前必须先复测，
    // 否则红的是护栏而不是世界。
    //
    // 为什么不能退回 2026-10-18 那批数当下限：那是**合批之前**的世界、另一把尺子读出来的，
    // 把它钉成地板就等于宣布"以后任何优化都不许把上限压到 396 以下" —— 一条专门拦住
    // 优化的门禁。地板必须由**量出上限的那同一把尺**给（"floor 要来自同一次扫描"）。
    //
    // 于是这条是**双向**的：
    // - 下界：上限必须大于实测最大值，否则 `npm run perf` 永远红，护栏失去意义（旧版只查这半边）。
    // - 上界：上限不许超过实测值的 1.6 倍（推导规则是 ×1.15 上取整到 10 ⇒ 正常最松也远在此内）。
    //   没有这半边，谁都能把某格悄悄改回"合批前的 510"还说自己在收紧预算 —— 表只会被放宽，
    //   永远不会被压紧。
    const 实测 = {
      frame: { hub: 288, fantasy: 267, magic: 593, space: 218, void: 139, abyss: 123, gloom: 184, radiant: 455 },
      body: { hub: 226, fantasy: 213, magic: 551, space: 152, void: 94, abyss: 77, gloom: 120, radiant: 410 },
      shadow: { hub: 62, fantasy: 55, magic: 39, space: 62, void: 45, abyss: 45, gloom: 66, radiant: 45 },
    };
    for (const id of DRAW_CALL_STATION_IDS) {
      const 上 = DRAW_CALL_CEILINGS[id];
      expect(上, `站点 "${id}" 没有上限`).toBeTruthy();
      for (const 列 of ['frame', 'body', 'shadow']) {
        const 读数 = 实测[列][id];
        expect(读数, `站点 "${id}" 缺 ${列} 列的实测值（地板不是从这次扫描来的）`).toBeTruthy();
        expect(上[列], `站点 "${id}" 的 ${列} 上限 ${上[列]} 低于本配方实测 ${读数} ⇒ 门禁会永远红`).toBeGreaterThan(读数);
        expect(上[列], `站点 "${id}" 的 ${列} 上限 ${上[列]} 超过本配方实测 ${读数} 的 1.6 倍 ⇒ 这一格被凭空放宽`).toBeLessThanOrEqual(读数 * 1.6);
      }
    }
  });
});
