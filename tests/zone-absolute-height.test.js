/**
 * 区内容的高度口径 —— 修 B136（缺陷② 切片G）。
 *
 * ## 这一族是什么
 *
 * B134 修的是"**问错了场**"：摆件去问本区自己的 `sampleHeight`（那是本区对高度场的**贡献**，
 * 不是高度场本身），于是同一坐标上摆件的 `y` 与地面的 `y` 各说各话。
 *
 * B136 是**同一个症状、另一个成因**：有一族摆件**压根没问场**，高度是**手写**的
 * —— `pillar.position.set(lx, h * 0.5, lz)`、`core.position.set(0, 5, 0)`、
 * `ring.position.y = 6 + i * 2`、`tesseract.position.set(-40, 5, -30)`……
 * 它们写死的是"**本区的地在 y = 0 那一层**"这个假设。真实的地有高有低
 * （魔法区外圈低到 −9.87 米），于是这一族在洼地里浮起来、在坡上埋进去。
 *
 * 另一半是 **POI 标记**：`addPOI` 把 `position.y` 当**绝对高度**收，而全世界 52 个
 * 调用点写的都是 0／5／8 这样"离地几米"的小数 —— 那是 authored 的**偏移**。
 * 于是 42 处标记离当地地面 0.9~13.5 米，光柱插在坡里，玩家看不见也点不着。
 *
 * ## 这门禁钉三件事
 *
 * ① **顶层结构必须问场**（结构腿）：区里**直接挂进区组**的那一件（子结构不算 ——
 *    它的偏移是相对父的，父已经问过场了），其高度表达式必须含 `groundYAt`。
 *    反向见证两条：顶层用字面量高度必须被点名；子结构用字面量高度必须放过。
 * ② **`addPOI` 的 `y` 是偏移**（语义腿）：真世界里 `addPOI({x, y: 5, z})` ⇒
 *    标记必须落在"当地场 **+ 5**"；`y` 缺省 ⇒ 落在当地场（精确相等）。
 * ③ **标记不许埋进地里**（行为腿）：真世界里每一个 POI 标记的偏移，
 *    必须落在**源码里出现过的那些偏移值**之内（上限由生产自己给出，不手抄）。
 *
 * ## 读数（本门禁量到的）
 *
 * 改前：904 件（含 POI 标记）里 **276 件埋没超过 0.5 米**，最狠 **−13.53 米**（魔法区那枚水晶）；
 * POI 标记 **42 处**离当地地面 0.9~13.5 米。
 * 改后：埋没降到 **151 件**、最狠 **−2.08 米**，而剩下的那些是**造型刻意**的
 * （山峰把底埋进地里 2 米、石头半埋、最深约 −1.4 米）—— 门禁分得开：
 * 它们走的是 `groundYAt`，只是作者给的偏移本来就是负的/小的。
 * POI 标记的偏移逐个读回，正好是作者写的那些数（1／2／3／4／5／6／8）。
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { WorldManager } from '../src/world/WorldManager.js';
import { attachPopCultureZones } from '../src/world/PopCultureZoneEnhancer.js';

const 读 = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const 区文件 = [
  'src/world/zones/FantasyZone.js',
  'src/world/zones/MagicZone.js',
  'src/world/zones/SpaceZone.js',
  'src/world/zones/VoidZone.js',
  'src/world/zones/AbyssZone.js',
  'src/world/zones/GloomZone.js',
  'src/world/zones/RadiantZone.js',
];
const 彩蛋文件 = [
  'src/world/PopCultureZoneEnhancer.js',
  'src/world/PopCultureZoneEnhancerWave2.js',
  'src/world/PopCultureZoneEnhancerWave3.js',
  'src/world/PopCultureZoneEnhancerWave4.js',
];

const makeScene = () => ({ add() {}, remove() {} });
const makeDialog = () => ({ show() {}, toast() {} });

/** 标识符：允许中文（夹具里用的是中文名），英文与 `$`/`_` 也认 */
const 标识符式 = '[\\p{L}_$][\\p{L}\\p{N}_$]*';
const 标识符全局 = new RegExp(`${标识符式}`, 'gu');

/**
 * 这一份文件里**直接挂进区组**的那些标识符。
 *
 * 判据是"谁被 `…group.add(…)` 收了"：`this.group.add(m)` / `zone.group.add(g)`。
 * 参数里带 `this.` 的（`this.group.add(this.createTree(…))`）不是本地变量，跳过。
 */
const 顶层标识符 = (源) => {
  const 集 = new Set();
  for (const m of 源.matchAll(/(\w+)\.group\.add\(([^)]*)\)/g)) {
    for (const 参 of m[2].split(',')) {
      const 文本 = 参.trim();
      if (!文本 || 文本.includes('this.')) continue;
      for (const 名 of 文本.match(标识符全局) ?? []) 集.add(名);
    }
  }
  return 集;
};

/**
 * 某标识符的高度表达式（`X.position.set(..., y, ...)` 的第二参 / `X.position.y = ...` 的右值）。
 * 找不到就是"它没有自己的高度"（例如它是个组，高度由子结构决定）。
 */
const 高度表达式 = (源, 名) => {
  const 出 = [];
  for (const m of 源.matchAll(new RegExp(`(?<![A-Za-z0-9_$])${名}\\.position\\.set\\(([^)]*)\\)`, 'g'))) {
    const 参数 = m[1].split(',').map((s) => s.trim());
    if (参数.length >= 2) 出.push(参数[1]);
  }
  for (const m of 源.matchAll(new RegExp(`(?<![A-Za-z0-9_$])${名}\\.position\\.y\\s*=\\s*([^;]+);`, 'g'))) {
    出.push(m[1].trim());
  }
  return 出;
};

/**
 * 源码里所有 POI 调用点写下的偏移（`{ x: N, y: N, z: N }`）—— 上限由生产自己给出。
 *
 * 两处调用形状都要认：区里写的是 `addPOI({ x, y, z }, …)`，彩蛋层写的是
 * `registerPoi(world, zone, { x, y, z }, …)` —— 后者的对象字面量前面还有两个参数，
 * 所以按"对象字面量里同时有 x / y / z"来认，比按函数名认更稳。
 */
const 生产偏移集 = () => {
  const 集 = new Set();
  for (const f of [...区文件, ...彩蛋文件]) {
    const 源 = 读(f);
    for (const m of 源.matchAll(/\{[^{}]*\bx\s*:[^{}]*?\by\s*:\s*(-?[\d.]+)\s*,[^{}]*?\bz\s*:/g)) {
      集.add(Number(m[1]));
    }
  }
  return 集;
};

function 建世界() {
  const scene = makeScene();
  const dialog = makeDialog();
  const world = new WorldManager(scene, dialog);
  world.build();
  attachPopCultureZones({ world, dialog, scene });
  return world;
}

describe('① 顶层结构必须问场（不许手写绝对高度）', () => {
  /**
   * 顶层结构的高度必须**问过场** —— 直接问（表达式里含 `groundYAt`），
   * 或者**经由一个场变量**问（`const gy = this.groundYAt(lx, lz)` 后写 `gy + 2.5`），
   * 或者**经由另一个顶层结构**间接问（树冠写的是 `trunk.position.y + 3`，
   * 树干自己问了场 ⇒ 树冠也跟着走）。这是一条**传递闭包**，不是逐行匹配。
   */
  const 问过场的顶层 = (源) => {
    const 顶层 = 顶层标识符(源);
    // 场变量：从 `groundYAt(...)` 赋值而来的本地变量名
    const 场变量 = new Set();
    for (const m of 源.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:this|zone)\.groundYAt\(/g)) {
      场变量.add(m[1]);
    }
    const 合格 = new Set();
    const 问过场 = (名) => {
      const y = 高度表达式(源, 名).join(' ');
      if (/groundYAt/.test(y)) return true;
      if ([...场变量].some((v) => new RegExp(`(?<![\\w$])${v}(?![\\w$])`).test(y))) return true;
      return [...合格].some((已合格) => y.includes(`${已合格}.position.y`));
    };
    for (const 名 of 顶层) if (问过场(名)) 合格.add(名);
    let 变了 = true;
    while (变了) {
      变了 = false;
      for (const 名 of 顶层) {
        if (合格.has(名)) continue;
        if (问过场(名)) { 合格.add(名); 变了 = true; }
      }
    }
    return { 顶层, 合格 };
  };

  it('七座区与四族彩蛋里，直接挂进区组的那一件，高度必须含 `groundYAt`', () => {
    for (const f of [...区文件, ...彩蛋文件]) {
      const 源 = 读(f);
      const { 顶层, 合格 } = 问过场的顶层(源);
      const 违 = [];
      for (const 名 of 顶层) {
        if (合格.has(名)) continue;
        for (const y of 高度表达式(源, 名)) {
          if (!/groundYAt/.test(y)) 违.push(`${名} 的高度 "${y}"`);
        }
      }
      expect(
        违.length,
        `${f} 里 ${违.length} 处顶层结构的手写高度没有问场：${违.join('；')} —— ` +
          '顶层结构的高度必须是"离当地地面的偏移"，不能是手抄的绝对数（B136）'
      ).toBe(0);
    }
  });

  it('反向见证：顶层结构用字面量高度必须被点名', () => {
    const 人造 = [
      'class 假区 {',
      '  buildX() {',
      '    const 石 = new THREE.Mesh();',
      '    石.position.set(0, 5, 0);',
      '    this.group.add(石);',
      '  }',
      '}',
    ].join('\n');
    const 顶层 = 顶层标识符(人造);
    expect([...顶层], '扫法没认出这个顶层结构 ⇒ 这条腿在空转').toContain('石');
    const { 合格 } = 问过场的顶层(人造);
    expect(合格.has('石'), '顶层结构的手写高度没被点名 ⇒ 这条腿在空转').toBe(false);
  });

  it('反向见证：子结构用字面量高度必须放过（它的偏移是相对父的）', () => {
    const 人造 = [
      'class 假区 {',
      '  buildX() {',
      '    const 组 = new THREE.Group();',
      '    const 子 = new THREE.Mesh();',
      '    子.position.set(0, 2, 0);',
      '    组.add(子);',
      '    this.group.add(组);',
      '  }',
      '}',
    ].join('\n');
    const 顶层 = 顶层标识符(人造);
    expect([...顶层], '子结构被误认成顶层 ⇒ 判据的"顶层"认错了').not.toContain('子');
    expect([...顶层]).toContain('组');
  });

  it('传递闭包不是空转：经由树干间接问场的树冠算合格', () => {
    const 人造 = [
      'class 假区 {',
      '  buildX() {',
      '    const 干 = new THREE.Mesh();',
      '    干.position.set(0, this.groundYAt(0, 0) + 2, 0);',
      '    this.group.add(干);',
      '    const 冠 = new THREE.Mesh();',
      '    冠.position.set(0, 干.position.y + 3, 0);',
      '    this.group.add(冠);',
      '  }',
      '}',
    ].join('\n');
    const { 合格 } = 问过场的顶层(人造);
    expect(合格.has('干'), '直接问场的没认出来').toBe(true);
    expect(合格.has('冠'), '经由树干间接问场的没认出来 ⇒ 传递闭包没生效').toBe(true);
  });

  it('扫法不瞎：真文件里确实认得出顶层结构（不是空名单跑过去）', () => {
    const 源 = 读('src/world/zones/RadiantZone.js');
    const 顶层 = 顶层标识符(源);
    expect(顶层.size, 'radiant 一件顶层结构都没认出来 ⇒ 判据扫不出东西').toBeGreaterThan(2);
    expect([...顶层]).toContain('pillar');
  });
});

describe('② `addPOI` 的 `y` 是"离当地地面的偏移"，不是绝对高度', () => {
  it('真世界里 `addPOI({ x, y: 5, z })` ⇒ 标记落在"当地场 + 5"（精确）', () => {
    const world = 建世界();
    const zone = world.zones[0];
    const poi = zone.addPOI({ x: 11, y: 5, z: -13 }, '探针点', () => {}, { id: 'probe-offset' });
    const 场 = world.getGroundHeight(zone.center.x + 11, zone.center.z - 13);
    expect(poi.position.y, '标记没有落在"当地场 + 5" —— `y` 还被当绝对高度收').toBeCloseTo(场 + 5, 9);
    const 标记 = zone.poiMarkers.find((m) => m.poi.id === 'probe-offset');
    expect(标记.marker.position.y, '标记本身没落在"当地场 + 5"').toBeCloseTo(场 + 5, 9);
  });

  it('`y` 缺省 ⇒ 标记落在当地场（精确）', () => {
    const world = 建世界();
    const zone = world.zones[1];
    const poi = zone.addPOI({ x: 7, z: 9 }, '探针点二', () => {}, { id: 'probe-ground' });
    const 场 = world.getGroundHeight(zone.center.x + 7, zone.center.z + 9);
    expect(poi.position.y, '缺省的 `y` 没有落在当地场').toBeCloseTo(场, 9);
  });

  it('反向控制：把 `y` 换回绝对高度收，同一把尺必须判它红', () => {
    const world = 建世界();
    const zone = world.zones[0];
    const poi = zone.addPOI({ x: 11, y: 5, z: -13 }, '探针点', () => {}, { id: 'probe-abs' });
    const 场 = world.getGroundHeight(zone.center.x + 11, zone.center.z - 13);
    const 旧口径 = 5; // 改前 `position.y ?? groundYAt(...)` ⇒ y 给绝对高度就收绝对高度
    expect(Math.abs(poi.position.y - 旧口径) > 0.5, '旧口径与新口径读数一样 ⇒ 这把尺量不出差别').toBe(true);
    expect(Math.abs(poi.position.y - (场 + 5)) < 1e-9).toBe(true);
  });
});

describe('③ POI 标记不许埋进地里', () => {
  it('真世界里每一个 POI 标记的偏移都落在源码里出现过的那些偏移之内', () => {
    const world = 建世界();
    const 允许 = 生产偏移集();
    expect(允许.size, '一个 POI 偏移都没解析出来 ⇒ 这条腿在空转').toBeGreaterThan(2);
    const 违 = [];
    for (const zone of world.zones) {
      for (const { marker, poi } of zone.poiMarkers) {
        const 场 = world.getGroundHeight(poi.position.x, poi.position.z);
        const 偏移 = marker.position.y - 场;
        if (偏移 < -0.001 || !允许.has(Number(偏移.toFixed(6)))) {
          违.push(`${poi.id} 偏移 ${偏移.toFixed(3)}`);
        }
      }
    }
    expect(违.length, `${违.length} 处 POI 标记离当地地面的偏移不在允许集内：${违.slice(0, 8).join('、')}`).toBe(0);
  });

  it('改前的口径会当场被抓住（绝对高度 ⇒ 偏移是负的一大截）', () => {
    const world = 建世界();
    const zone = world.zones[0];
    // 找一个当地场**高**的点：那里"绝对高度 5"必然埋进地里。
    let 高点 = null;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      for (const r of [20, 60, 100]) {
        const lx = Math.cos(a) * r;
        const lz = Math.sin(a) * r;
        const 场 = world.getGroundHeight(zone.center.x + lx, zone.center.z + lz);
        if (!高点 || 场 > 高点.场) 高点 = { lx, lz, 场 };
      }
    }
    expect(高点.场, '这个区到处都不够高 ⇒ 造不出"埋进地里"的样本').toBeGreaterThan(6);
    // 改前：`position.y ?? groundYAt(...)` ⇒ 给了 5 就收 5（绝对）⇒ 偏移 = 5 − 场（负一大截）
    const 旧偏移 = 5 - 高点.场;
    expect(旧偏移, '旧口径在这个点上居然不是埋进地里').toBeLessThan(0);
    const 新偏移 = (高点.场 + 5) - 高点.场;
    expect(新偏移).toBeCloseTo(5, 9);
  });
});
