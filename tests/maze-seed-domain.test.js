/**
 * 迷宫种子的定义域 = 「一颗种子该给出什么」的唯一答案 —— W-B10 切片4a（修 B75）。
 *
 * ## 这一片要修的是什么
 *
 * `world/MazeLayout.js` 里那条流原本是 `s = (s * 16807) % 2147483647; return (s - 1) / 2147483646;`。
 * 它承诺 `[0,1)`，实际给的是 `[-4.66e-10, 0.9999999995]`，而每一个消费方都写 `Math.floor(rnd() * 长度)`
 * 再解构 —— 那一发**负零头**取到 `[-1]`（undefined），于是当场 `TypeError: pick is not iterable`。
 *
 * 台账原来写的是"seed = 0 / 2147483647 / 4294967294 三个值崩"。普查把那句话量正了
 * （`.tmp-20260930/wb10s4a-census2.mjs`，读数 `.tmp-20260930/wb10s4a-census2.out`）：
 *
 * - 坏的不止三个边界值，而是**三块定义域**：`seed ≡ 0 (mod 2^31-1)` 整族（4 颗全崩）、
 *   `seed < 0` **整片**（随机 100 颗负种子里 100 颗第一发就不可用，因为 JS 的 `%` 保留符号）、
 *   以及 `NaN` / `Infinity`；
 * - 而生产侧唯一的调用点递 `Date.now()`，实测它前后各 500 万毫秒里 **0 颗**落进坏值 ——
 *   所以这片修的症状不是"现在进副本就崩"，是**"种子的定义域没人管"**：下一个不递 `Date.now()` 的
 *   调用方（存档里的种子、掷出来的负数、URL 上的字符串）才会把它变成门口的一次崩溃；
 * - 第一轮猜的两条都被自己的读数推翻了："`(s-1)/2147483646` 会在某个同余类上返回恰好 1"（不存在，
 *   20 万颗种子里 `>= 1` 的是 0 颗，最大 0.9999999995）与"`Date.now()` 量级下乘法会让相邻毫秒并档"
 *   （10 万对相邻毫秒的第一发状态相同 0 对；真实损失只是积的最低 2 位被舍到浮点间隔上）。
 *
 * ## 用例分七层
 *
 * 1. **定义域**：25 颗边界种子逐个跑过都不抛，且回出来的布局结构齐全。
 * 2. **不兜底**：`NaN` / `±Infinity` / 字符串 / `null` / 对象 / `BigInt` 各当场抛 `TypeError`，
 *    消息说自己收到的值；不递种子仍走 `Date.now()` 默认。
 * 3. **`[0,1)` 的行为见证**：不复制那条流，只量它的**后果** —— 每个出怪点的偏移严格落在
 *    半开区间 `[-半, +半)`，编组严格落在遭遇表给的 `[min, max]`。一发 `1.0` 会把偏移正好推到 `+半`，
 *    一发负数会掉到 `-半` 之外，两种都跑不掉。
 * 4. **可重现**：同种子幂等、相邻种子不同、相反数不同、`seed ± 2^32` 与 `seed + 2^31` 都不同，
 *    连续 5000 毫秒的相邻两颗也不同（"定义域没人管"的另一半是"每颗种子都要给一个新迷宫"）。
 * 5. **黄金签名**：4 颗固定种子的布局签名冻住 —— 以后换掉 PRNG 必须让这一条红，而不是悄悄换地图。
 * 6. **绝迹**：旧 LCG 的两个常量在 `src/` 全树 0 处（剥注释后），生成器里 `Math.random` 0 处；
 *    反面证据是同那把尺子在原文上量得到。
 * 7. **真入口**：五座副本 × 边界种子走 `ProceduralDungeonGenerator.generate` 不抛，
 *    每座观测到的敌人类型仍等于它自己那一池（换流不许换仗），且 40 颗种子给 40 张不同的图
 *    （这最后一条是第二轮补的：A9「种子不再参与」第一轮在 ⑦ 上没咬住，追下去是这条见证当时不存在）。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { generateMaze } from '../src/world/MazeLayout.js';
import { ProceduralDungeonGenerator } from '../src/world/ProceduralDungeonGenerator.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { dungeonEncounterOf, DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
/** 源文件是 CRLF：不剥 `\r`，跨行正则的 `.` 会带着 `\r` 咬不合，"没扫到"就会伪装成"没有" */
const readSrc = (rel) => readFileSync(join(ROOT, 'src', rel), 'utf8').replace(/\r\n/g, '\n');
/** 说明文字里就抄着旧那行原文（本文件的开头与 `MazeLayout` 的注释都是），所以扫代码必须先剥注释 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}
const FILES = walk(SRC);

const M31 = 2 ** 31 - 1;

/**
 * 边界电池：三块坏定义域的代表（`0 mod M31` 族、整个负半轴、非有限）加上当年丢位的那个大数。
 * `Date.now()` 量级（1.7e12）也在这里 —— 那是生产侧唯一真正递进来的数。
 */
const 电池 = [
  0, 1, 2, -1, -2, M31, -M31, 2 * M31, 3 * M31, -(2 * M31),
  2 ** 31, 2 ** 32, -(2 ** 32), 2 ** 40, Number.MAX_SAFE_INTEGER, -(2 ** 53),
  1.5, -1.5, 0.5, -0.5, 1e300, -1e300, Number.MIN_VALUE, -Number.MIN_VALUE, 12345,
];

/** 只看几何用的遭遇格：一类、1~2 只。黄金签名不许跟着内容表漂，所以不经五座表 */
const 几何格 = { pool: [{ type: 'soldier', weight: 1 }], group: { min: 1, max: 2 } };

/** 布局的可比较签名：房间数、门数、最远房（出口）、每房编组、前 8 个出怪点偏移（6 位小数） */
function 布局签(l) {
  const 编组 = l.rooms.map((r) => r.enemySpawns.length).join('');
  const 偏移 = l.rooms
    .flatMap((r) => r.enemySpawns.map((s) => `${(s.x - r.x).toFixed(6)},${(s.z - r.z).toFixed(6)}`))
    .slice(0, 8)
    .join(';');
  return [l.rooms.length, l.doors.length, l.exit.id, 编组, 偏移].join('|');
}

/**
 * 不截断的签名：⑦ 那条"40 颗种子给 40 张图"要用它。`布局签` 只留前 8 个偏移（够冻黄金，
 * 也够让撞车概率小到可以忽略），但"40 个样本互不相同"这个判据不该建在一个会自然碰撞的短签上。
 * 实测（`.tmp-20260930/wb10s4a-measure2.mjs`）：五座各 40 颗种子，两把尺子都是满 40。
 */
function 全签(l) {
  return l.rooms.map((r) => `${r.id}:${r.enemySpawns.map((s) => `${(s.x - r.x).toFixed(6)},${(s.z - r.z).toFixed(6)}`).join(';')}`).join('|') + `#${l.exit.id}`;
}

const 摇 = (seed, 格 = 几何格) => generateMaze(5, 5, seed, 格);

/** 真入口用的 40 颗种子：正负交替、彼此不共低 32 位，⑦ 两条共用同一批样本 */
const 入口种子 = Array.from({ length: 40 }, (_, i) => (i % 2 ? -1 : 1) * (i + 1) * 7919);

describe('① 定义域：25 颗边界种子逐个跑过都不抛', () => {
  it('电池里每一颗都给出结构齐全的布局（旧流在这里崩三块：0 mod 2^31-1 整族、负半轴整片、NaN/Infinity）', () => {
    const 崩 = [];
    for (const seed of 电池) {
      try {
        const l = 摇(seed);
        if (l.rooms.length !== 25) 崩.push(`${seed}: 房间数 ${l.rooms.length}`);
        if (!l.spawn || !l.exit || !l.bounds) 崩.push(`${seed}: 缺 spawn/exit/bounds`);
        if (l.doors.length !== 24) 崩.push(`${seed}: 门数 ${l.doors.length}（5×5 回溯迷宫应是房间数-1）`);
      } catch (e) {
        崩.push(`${seed}: ${e.name}: ${String(e.message).slice(0, 40)}`);
      }
    }
    expect(崩, `这些种子摇不出迷宫：${崩.join(' / ')}`).toEqual([]);
    expect(电池.length).toBeGreaterThanOrEqual(25);
  });

  it('同一颗种子的两次摇法给出同一个签名，而签名里真的有随机内容（不是常量布局）', () => {
    const 一次 = 布局签(摇(20261001));
    expect(布局签(摇(20261001))).toBe(一次);
    const 出怪数 = 摇(20261001).rooms.reduce((a, r) => a + r.enemySpawns.length, 0);
    expect(出怪数, '这次摇没走到出怪那一步，签名里的"幂等"就是空话').toBeGreaterThan(0);
    expect(/[,;]/.test(一次), '签名里没有坐标偏移，量不到随机流').toBe(true);
  });
});

describe('② 不兜底：非有限与非数字当场红（B71 口径，与 dungeonEncounterOf 同一把尺子）', () => {
  const 坏值 = [
    ['NaN', Number.NaN],
    ['+Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['字符串 "12345"', '12345'],
    ['null', null],
    ['undefined 之外的对象', {}],
    ['数组', []],
    ['BigInt', 12n],
    ['true', true],
  ];

  for (const [名, 值] of 坏值) {
    it(`${名} 抛 TypeError，且消息说自己收到了什么`, () => {
      let 抛 = null;
      try { 摇(值); } catch (e) { 抛 = e; }
      expect(抛, `${名} 本该当场红，却安静地摇出了一座迷宫（静默折成 0 号种子就是"悄悄换了布局"）`).toBeTruthy();
      expect(抛, `${名} 抛的是 ${抛?.name}，要的是 TypeError（调用方递错东西，不是迷宫自己坏）`).toBeInstanceOf(TypeError);
      expect(抛.message).toMatch(/有限/);
      expect(抛.message).toMatch(/种子/);
    });
  }

  it('不递种子仍然可用：默认走 Date.now()，而它落进定义域内', () => {
    expect(() => generateMaze(5, 5, undefined, 几何格)).not.toThrow();
    expect(() => generateMaze(5, 5, Date.now(), 几何格)).not.toThrow();
  });

  it('非整数种子不抛但按整颗算：1.5 与 1 同流，-1.5 与 -2 同流（向下取整，不是截断）', () => {
    expect(布局签(摇(1.5))).toBe(布局签(摇(1)));
    expect(布局签(摇(-1.5))).toBe(布局签(摇(-2)));
    expect(布局签(摇(-0.5))).not.toBe(布局签(摇(0)), '-0.5 若向零截断就和 0 同流：负半轴会多出一次并档');
  });
});

describe('③ [0,1) 的行为见证：量后果，不复制那条流', () => {
  /**
   * 出怪点的偏移由 `(rnd() - 0.5) * (CELL - 6)` 给出。若 `rnd()` 落在 `[0,1)`，偏移就落在
   * 半开区间 `[-半, +半)`；正好 1.0 会给出 `+半`（闭不上），负零头会给出 `< -半`。
   * 这一条不需要把生产的那条流在测试里重写一遍，也不需要导出 `rnd` —— 它是那条承诺的可见后果。
   * `半` 里的 `6` 是生成器自己的内缩量，抄在这里是给半开区间一把尺子；它变了会红，那时改的是几何不是流。
   */
  const 扫 = (种子数) => {
    const 越界 = [];
    let 点数 = 0;
    let 最近 = 0;
    for (const def of DUNGEON_DEFS) {
      const 格 = dungeonEncounterOf(def.id);
      for (let i = 0; i < 种子数; i++) {
        // 三种形状都扫到：正常正种子、负种子（旧流整片崩的那半轴）、M31 的倍数（旧流的 0 态族）
        const seed = i % 3 === 0 ? -(i + 1) : i % 3 === 1 ? i * M31 : i + 1;
        const l = generateMaze(def.gridW, def.gridH, seed, 格);
        const 半 = (l.cellSize - 6) / 2;
        for (const room of l.rooms) {
          for (const sp of room.enemySpawns) {
            点数++;
            const dx = sp.x - room.x;
            const dz = sp.z - room.z;
            最近 = Math.max(最近, Math.abs(dx), Math.abs(dz));
            if (!(dx >= -半 && dx < 半) || !(dz >= -半 && dz < 半)) {
              越界.push(`${def.id}#${seed}/${room.id}: dx=${dx} dz=${dz} 半=${半}`);
            }
          }
        }
      }
    }
    return { 越界, 点数, 最近 };
  };

  it('五座 × 600 颗种子（含负数与 2^31-1 的倍数）里，每个出怪点都落在半开区间内', () => {
    const { 越界, 点数, 最近 } = 扫(600);
    expect(越界, `这些出怪点跑到了房外：${越界.slice(0, 5).join(' / ')}`).toEqual([]);
    expect(点数, '一个出怪点都没摇到 —— 没有样本，"落在区间内"就没有答案').toBeGreaterThan(20000);
    expect(最近).toBeLessThan(6);
    expect(最近, '最大 |偏移| 离半开区间的上界太远，说明这把尺子几乎没被走到').toBeGreaterThan(4);
  });

  it('编组严格落在表给的 [min, max]：边界种子上也不多出、不少出', () => {
    const 越界 = [];
    for (const def of DUNGEON_DEFS) {
      const { min, max } = dungeonEncounterOf(def.id).group;
      for (const seed of 电池) {
        const l = generateMaze(def.gridW, def.gridH, seed, dungeonEncounterOf(def.id));
        for (const room of l.rooms) {
          if (room.isBossArena || !room.hasEnemies) continue;
          const n = room.enemySpawns.length;
          if (n < min || n > max) 越界.push(`${def.id} seed=${seed} 编组 ${n} ∉ [${min}, ${max}]`);
        }
      }
    }
    expect(越界, `这些编组不在表的区间里（一发 <0 给 min-1，一发 >=1 给 max+1）：${越界.slice(0, 6).join(' / ')}`).toEqual([]);
  });

  it('固定编组的遭遇格在边界种子上也固定：min=max=3 就每房 3 只，1 就每房 1 只', () => {
    for (const 固定 of [{ min: 1, max: 1 }, { min: 3, max: 3 }]) {
      const 格 = { pool: [{ type: 'soldier', weight: 1 }, { type: 'drone', weight: 1 }], group: 固定 };
      const 反例 = [];
      for (const seed of 电池) {
        const l = generateMaze(5, 5, seed, 格);
        for (const room of l.rooms) {
          if (room.isBossArena || !room.hasEnemies) continue;
          if (room.enemySpawns.length !== 固定.min) 反例.push(`${seed}/${room.id}: ${room.enemySpawns.length}`);
        }
      }
      expect(反例, `group=${JSON.stringify(固定)} 却有房间不是 ${固定.min} 只：${反例.slice(0, 6).join(' / ')}`).toEqual([]);
    }
  });

  it('遭遇池那道带也不响：25 颗边界种子里没有一次抽样越界（RangeError）', () => {
    const 响 = [];
    for (const seed of 电池) {
      try { 摇(seed, { pool: [{ type: 'soldier', weight: 5 }, { type: 'wraith', weight: 3 }, { type: 'crawler', weight: 2 }], group: { min: 1, max: 4 } }); }
      catch (e) { if (e instanceof RangeError) 响.push(`${seed}: ${e.message}`); else throw e; }
    }
    expect(响, `rnd() 给出发不小于 1 的读数：${响.join(' / ')}`).toEqual([]);
  });
});

describe('④ 可重现：种子这件事要有唯一答案', () => {
  it('同种子幂等：电池里每颗连摇两次都不变', () => {
    const 变 = [];
    for (const seed of 电池) if (布局签(摇(seed)) !== 布局签(摇(seed))) 变.push(String(seed));
    expect(变, `这些种子两次摇出了不同迷宫：${变.join(' / ')}`).toEqual([]);
  });

  it('相邻种子给出不同迷宫：1..3000 与 Date.now() 连续 5000 毫秒都没有并档', () => {
    let 相邻同 = 0;
    for (let s = 1; s < 3000; s++) if (布局签(摇(s)) === 布局签(摇(s + 1))) 相邻同++;
    expect(相邻同, '相邻种子摇出同一座迷宫：种子的分辨率被丢了').toBe(0);
    const now = Date.now();
    let 毫秒同 = 0;
    for (let i = 0; i < 5000; i++) if (布局签(摇(now + i)) === 布局签(摇(now + i + 1))) 毫秒同++;
    expect(毫秒同, '`Date.now()` 相邻毫秒并档：生产侧每进一次副本可能是同一张地图').toBe(0);
  });

  it('相反数、+2^31、+2^32 都给出不同迷宫（32 位状态把高位乘进来了）', () => {
    const now = Date.now();
    const 同 = [];
    for (const [a, b, 名] of [
      [12345, -12345, '相反数'],
      [now, now + 2 ** 32, '差 2^32'],
      [now, now + 2 ** 31, '差 2^31'],
      [2 ** 40, 2 ** 40 + 1, '大数相邻'],
    ]) if (布局签(摇(a)) === 布局签(摇(b))) 同.push(名);
    expect(同, `这几对种子并档了：${同.join(' / ')} —— 低 32 位之外的部分没参与，等于种子被截短`).toEqual([]);
  });

  it('换一颗种子就换一整张图，不是只挪一个点（流被整条重放而不是加性偏移）', () => {
    const 差异 = (a, b) => {
      const x = 布局签(摇(a)).split('|');
      const y = 布局签(摇(b)).split('|');
      return x.filter((行, i) => 行 !== y[i]).length;
    };
    const 只差一点 = [];
    for (const [a, b] of [[1, 2], [7, 8], [20261001, 20261002], [-3, -4]]) if (差异(a, b) <= 1) 只差一点.push(`${a}→${b}`);
    expect(只差一点, `这两颗种子的签名只差 1 段（像"同一个布局挪一格"）：${只差一点.join(' / ')}`).toEqual([]);
  });
});

describe('⑤ 黄金签名：换掉 PRNG 必须让这一条红，而不是悄悄换地图', () => {
  /**
   * 冻的是几何（房间数/门数/出口/每房编组/前 8 个偏移），不是内容 —— 用的是 `几何格` 那张合成遭遇格，
   * 所以五座的池子以后怎么改都不动这一条。它唯一的用处是：这一条流今天给出这一张图。
   * 数值抄自本用例第一次跑红的 `Received:`，并与 `.tmp-20260930/wb10s4a-measure.mjs` N5 独立算出的
   * 编组串与前 3 个偏移逐位对过（两条路同一个数，才敢冻）。
   */
  const 黄金 = [
    [20261001,
      '25|24|r_4_4|2211102122222221102111222|4.183574,-1.607095;-2.557272,4.314557;-4.478636,-3.710369;-0.144820,1.328949;-4.288172,0.610145;3.093412,-2.526570;-4.118066,-0.767830;-1.953443,2.893721'],
    [7,
      '25|24|r_1_1|1120222121121122012211121|-1.470785,-0.430854;-5.074259,-2.067028;-3.344162,2.843333;-1.806725,5.444712;-2.741340,5.086431;4.890717,-3.275774;1.880404,0.674131;5.317406,3.222607'],
    [-3,
      '25|24|r_2_3|2211121212021211101122212|-2.690571,5.280466;1.185466,-1.014632;-4.039132,-3.248165;2.767690,2.923271;2.419226,-4.501669;-3.669431,0.582935;-2.198084,1.658236;4.889219,2.146855'],
    [4294967294,
      '25|24|r_2_0|1212222210110221111211211|5.635276,1.401843;-2.945748,-2.421740;5.942484,-2.213231;-0.125017,4.494640;1.574887,-4.456573;-3.615126,-4.873104;-4.370116,-3.641199;5.562860,3.275076'],
  ];
  for (const [seed, 期望] of 黄金) {
    it(`seed=${seed} 的布局签名`, () => {
      expect(布局签(摇(seed)), `seed=${seed} 的迷宫变了（换流、换几何或换内缩量都会红，先确认动的是哪一个）`).toBe(期望);
    });
  }
});

describe('⑥ 绝迹：旧 LCG 与未播种的随机都不许留在 src/', () => {
  /** 那两颗常量就是这条流的身份证：模 2^31-1 与乘数 16807 */
  const 旧流 = (text) => (stripComments(text).match(/16807|2147483646/g) ?? []);
  const 原文 = [
    '  let s = seed;',
    '  const rnd = () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };',
  ].join('\n');

  it('全树 0 处，且 `world/MazeLayout.js` 里也没有', () => {
    const 命中 = [];
    for (const f of FILES) {
      const n = 旧流(readFileSync(f, 'utf8')).length;
      if (n) 命中.push(`${relative(SRC, f).replaceAll('\\', '/')}:${n}`);
    }
    expect(命中, `这些地方还在用那条 LCG：${命中.join('、')}`).toEqual([]);
    expect(旧流(readSrc('world/MazeLayout.js')).length).toBe(0);
  });

  it('反面证据：这把尺子在旧那两行的原文上量得到 2 处，抄进注释里不算命中', () => {
    expect(旧流(原文).length, '尺子读不出那两条常量，第⑥层的 0 就没意义').toBe(2);
    expect(旧流(`/** 以前是 ${原文} */\nconst a = 1;`).length).toBe(0);
  });

  it('生成器里没有未播种的随机：Math.random 0 处（每一发都必须由种子决定）', () => {
    const 源码 = stripComments(readSrc('world/MazeLayout.js'));
    expect(源码, '迷宫里出现了 Math.random：同种子不再能重现同一张图').not.toMatch(/Math\.random/);
    expect(源码).toMatch(/makeSeededRng\(seed\)/);
    expect(源码).toMatch(/const rnd = makeSeededRng\(seed\)/);
  });

  it('扫描集自证：真的扫到了当前源码树（空集就会一路绿灯）', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(180);
    const 相对 = FILES.map((f) => relative(SRC, f).replaceAll('\\', '/'));
    for (const probe of ['world/MazeLayout.js', 'world/ProceduralDungeonGenerator.js', 'world/DungeonManager.js']) {
      expect(相对, `扫描集里没有 ${probe}`).toContain(probe);
    }
  });

  it('唯一的调用点仍然递 Date.now()，而它不用改（本片收的是定义域，不是把种子塞给玩家）', () => {
    const 源码 = stripComments(readSrc('world/DungeonManager.js'));
    expect(源码).toMatch(/ProceduralDungeonGenerator\.generate\(\s*dungeon\.def,\s*Date\.now\(\)\s*\)/);
  });
});

describe('⑦ 真入口：五座 × 边界种子走 generate()，换流不许换仗', () => {
  it('每一座在每颗边界种子上都进得去（旧流在负种子与 0 mod 2^31-1 上当场崩）', () => {
    const 崩 = [];
    let 次 = 0;
    for (const def of DUNGEON_DEFS) {
      for (const seed of 电池) {
        次++;
        try { ProceduralDungeonGenerator.generate(def, seed); }
        catch (e) { 崩.push(`${def.id} seed=${seed}: ${e.name}`); }
      }
    }
    expect(崩, `这些"进副本"当场抛：${崩.slice(0, 8).join(' / ')}`).toEqual([]);
    expect(次).toBe(DUNGEON_DEFS.length * 电池.length);
  });

  it('每座观测到的类型集合仍等于它自己那一池（换随机流不改遭遇表说了算的那件事）', () => {
    for (const def of DUNGEON_DEFS) {
      const 池子 = new Set(dungeonEncounterOf(def.id).pool.map((e) => e.type));
      const 观测 = new Set();
      for (const seed of 入口种子) {
        const l = ProceduralDungeonGenerator.generate(def, seed);
        for (const r of l.rooms) for (const sp of r.enemySpawns) 观测.add(sp.type);
      }
      const 多出 = [...观测].filter((t) => !池子.has(t));
      const 缺 = [...池子].filter((t) => !观测.has(t));
      expect(多出, `${def.id} 出了它池子外的类型：${多出.join('/')}`).toEqual([]);
      expect(缺, `${def.id} 的 40 颗种子摇不出池子里这几类：${缺.join('/')} —— 流变了，抽样却没变均匀`).toEqual([]);
    }
    expect(Object.keys(DUNGEON_ENCOUNTERS).length).toBe(DUNGEON_DEFS.length);
  });

  /**
   * 这一条是第二轮补进来的，起因是上一轮的 A9（种子不再参与）在 ⑦ 上没咬住。
   * 追下去不是容差松：那一批固定布局**恰好**覆盖了每一座的全池，所以"类型集合 == 池子"
   * 量的从来就不是种子，而是池子成员 —— 我的预测把一条成员见证当成了种子见证用。
   * 补的这条问的才是入口那一步：五座各自 40 颗种子必须给 40 张互不相同的图（实测满值 40）。
   * 它与 ④ 的"相邻种子不并档"不重复：④ 直接摇 `generateMaze` 配合成遭遇格，这一条走真入口，
   * 递的是 def 与五座各自的格子 —— 入口把种子吃掉、或者在半路换成常量，只有这条看得见。
   */
  it('真入口的 40 颗种子给 40 张不同的图（种子递到了迷宫，不是被入口吃掉）', () => {
    for (const def of DUNGEON_DEFS) {
      const 图 = new Set(入口种子.map((s) => 全签(ProceduralDungeonGenerator.generate(def, s))));
      expect(图.size, `${def.id} 的 40 颗种子只摇出 ${图.size} 张图 —— 入口没把种子递给迷宫`).toBe(入口种子.length);
    }
  });

  it('Boss 大房不在编组口径里：它的 enemySpawns 一直是空（守钥者另有名册）', () => {
    for (const def of DUNGEON_DEFS) {
      const l = ProceduralDungeonGenerator.generate(def, 20261001);
      expect(l.exit.isBossArena, `${def.id} 的出口不是 Boss 房`).toBe(true);
      expect(l.exit.enemySpawns, 'Boss 房里混进了小怪编组，那"空"这一条就不是它的承诺').toEqual([]);
    }
  });
});
