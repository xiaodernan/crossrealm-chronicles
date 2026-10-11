/**
 * W-B10 切片4b —— 迷宫的两次洗牌换成 Fisher–Yates 副本（修 B77）。
 *
 * 台账上 B77 的原话是两处 `arr.sort(() => rnd() - 0.5)`（普查 `.tmp-20261002/wb10s4b-census.mjs`，
 * 在 `git show HEAD:src/world/MazeLayout.js` 的第 109、111 行）。它坏在两层，第二层比第一层难查：
 *
 * 1. **分布不匀**：比较器每比一次吃一发随机，而掷出来的硬币不构成均匀排列。
 *    实测 n=5 的 120 种排列里恒等排列占 9.16%（理论 0.833%），最大偏差 8.3 个百分点。
 * 2. **洗完之后流走到哪儿，由排序实现决定**：n=25 实测吃 65..89 发（Fisher–Yates 恒为 24 发），
 *    于是"同一颗种子给同一座迷宫"只对当前这一个 V8 的排序实现成立。
 *
 * 还有一条不是统计而是**共享状态**的坏：`rooms.sort(...)` 把返回体里的房间数组本体打乱了，
 * 而没有任何消费者声明过它该是随机序。对账（`.tmp-20261002/wb10s4b-reconcile.mjs`，801 颗种子）
 * 量到的是：**房内出怪（类型与坐标）一字不差，0 处不同**，动的只有"哪间房拿到哪篇文献"与数组序本身
 * （出怪循环在洗牌之前，所以它本来就不该动 —— 这一条对得上才说明两片改动各自只管各的事）。
 *
 * ## 这一份门禁按层分工（变异臂的预测照这张表写）
 *
 * 1. **流账单**：`shuffle` 消耗的发数恒为 n−1 —— 只有这一条能量出第 2 层坏。
 * 2. **均匀性**：120 种排列全可达 + 最大偏差 + 恒等排列占比 —— 量第 1 层坏与三种退化洗法。
 * 3. **副本语义与恒定读数的形状**：不碰原件、同宽同集合，`rnd≡0.999…` 给原序、`rnd≡0` 给左旋一发。
 * 4. **名册不被污染**：连摇 600 座前后 `LORE_FRAGMENTS` 的 JSON 快照逐字节相同（顺序与字段都算）。
 * 5. **返回体的房间序是网格序**：电池种子上 + 真入口五座上各一条。
 * 6. **文献落点的玩法不变量**：出自名册、同座不重复、出生/出口房不带、数量与均值界、表头那篇的
 *    落点覆盖、名册每一篇都发得出去、同种子幂等。
 * 7. **文献的黄金签名**：3 颗种子冻住"哪间房拿哪一篇"。这一层存在的理由是一条量程，写在 ⑦ 的注释里。
 * 8. **绝迹**：`src/` 全树 0 处"零参比较器 + 随机读数"，反面证据是同那把尺子在原文上量得到。
 *
 * 界值不是拍脑袋：偏差与发数来自 `.tmp-20261002/wb10s4b-measure2.mjs`（同一张表上量 FY、差一、
 * 定首、comparator、不洗五种），落点覆盖与均值来自 `wb10s4b-measure3.mjs`，重冻的签名来自
 * `wb10s4b-refreeze.mjs`。三条退化洗法的读数写在各自用例的失败消息里，红了就知道是哪一种。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generateMaze, shuffle, cellsOf } from '../src/world/MazeLayout.js';
import { LORE_FRAGMENTS } from '../src/game/LoreFragments.js';
import { ProceduralDungeonGenerator } from '../src/world/ProceduralDungeonGenerator.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';

const ROOT = process.cwd();
/** 源文件是 CRLF：不剥 `\r`，跨行正则的 `.` 会带着 `\r` 咬不合，"没扫到"就会伪装成"没有" */
const readSrc = (abs) => readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
/** `MazeLayout` 的注释里就抄着 B77 那行原文，所以扫代码必须先剥注释 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}
const FILES = walk(join(ROOT, 'src'));

/** 只看几何用的遭遇格：一类、1~2 只。落点判据不许跟着五座内容表漂，所以不经那张表 */
const 几何格 = { pool: [{ type: 'soldier', weight: 1 }], group: { min: 1, max: 2 } };

/**
 * 名册的快照必须在**任何一次 `generateMaze` 之前**取，否则 ④ 就是在跟一份已经被洗过的表比 ——
 * 那正是"就地洗牌"最希望这条门禁做到的事：悄悄绿。600 座的批量因此推迟到用例里第一次要它时才造。
 */
const 名册快照 = JSON.stringify(LORE_FRAGMENTS);
const 名册id = LORE_FRAGMENTS.map((f) => f.id);

/**
 * 每次都要一份**干净**的 5 元素池，所以它是工厂不是常量：共享一份的话，"就地洗牌"这种错会让
 * 下面那 2 万发取样从上一发的尾序起手（分布量的就不再是算法，而是污染链），③ 的两条恒定读数
 * 也会因为姊妹用例先动过同一张表而红 —— 那种红说的是"谁先跑"，不是这一条自己的判据。
 */
const 池5 = () => [0, 1, 2, 3, 4];
const 全排列 = (() => {
  const out = [];
  const dfs = (cur, rest) => {
    if (!rest.length) { out.push(cur.join(',')); return; }
    for (let i = 0; i < rest.length; i++) dfs([...cur, rest[i]], rest.filter((_, k) => k !== i));
  };
  dfs([], 池5());
  return out;
})();
const 样本数 = 20000;
const 排列计数 = (() => {
  const 计数 = new Map(全排列.map((p) => [p, 0]));
  for (let s = 1; s <= 样本数; s++) {
    const 排 = shuffle(池5(), 测试流(s)).join(',');
    计数.set(排, (计数.get(排) ?? 0) + 1);
  }
  return 计数;
})();

/**
 * 均匀性这一层用的是**测试自己的流**：要量的是"这套交换规则给不给均匀排列"，那是算法性质，
 * 对任何 `[0,1)` 流都成立。把样本钉死成种子列表是为了让这条门禁可复现，而不是把它吊在生产
 * 那条流的当前形状上（换流是切片4a 那一层的事，有它自己的门禁）。
 */
function 测试流(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const 电池 = [0, 1, 2, -1, -2, 2147483647, -2147483647, 4294967294, 2 ** 32, Number.MAX_SAFE_INTEGER];

/**
 * 按数组序读出 `r_gx_gz`：网格序的定义就是"下标 i ⇒ gx=i%宽、gz=⌊i/宽⌋"。
 *
 * 切片5d 之后 Boss 场把 2×2 四格并成**锚格那一间**，另外三格从名单里退出（它们的怪与文献随房一起没了），
 * 所以名单是"网格序挖掉块内那三格"。挖哪三格由布局自己说（`cellsOf(场)` 去掉它的锚格），不手抄块坐标；
 * 场站在哪一席也有唯一答案：`合并成场` 排回 `gz*宽+gx`，因为它的 id 说的就是锚格（B86）。
 */
const 数组序 = (l) => l.rooms.map((r) => r.id).join(',');
const 网格序 = (l) => {
  const 场 = l.rooms.find((r) => r.isBossArena);
  const 退格 = new Set(
    场 ? cellsOf(场).filter(([cx, cz]) => cx !== 场.gx || cz !== 场.gz).map(([cx, cz]) => `r_${cx}_${cz}`) : [],
  );
  return Array.from({ length: l.gridW * l.gridH }, (_, i) => `r_${i % l.gridW}_${Math.floor(i / l.gridW)}`)
    .filter((id) => !退格.has(id)).join(',');
};
const 文献串 = (l) => l.rooms.map((r) => (r.lore ? r.lore.id : '-')).join(',');

const 摇样 = Array.from({ length: 600 }, (_, i) => i + 1);
let 批缓存 = null;
/** 600 座共用一批：④ 与 ⑥ 都要它，造两遍只会让"连摇多少次"这个口径变成两处说话 */
const 批量 = () => (批缓存 ??= 摇样.map((s) => generateMaze(5, 5, s, 几何格)));

describe('① 流账单：洗完之后的流走到哪儿要有唯一答案', () => {
  it('长度 n 的池子恰好吃 n−1 发（B77 那种比较器洗法在 n=25 上实测 65..89 发）', () => {
    for (const n of [0, 1, 2, 3, 8, 23, 25, 26]) {
      const 池 = Array.from({ length: n }, (_, i) => i);
      const 应 = Math.max(0, n - 1);
      for (const s of [1, 2, 3, 12345, -7]) {
        const 源 = 测试流(s);
        let 用 = 0;
        shuffle(池, () => { 用++; return 源(); });
        expect(用, `n=${n} 的种子 ${s} 吃了 ${用} 发，要的是 ${应} 发 —— 发数由实现决定就等于由运气决定`).toBe(应);
      }
    }
  });
});

describe('② 均匀性：120 种排列得真的都排得出来', () => {
  it(`每种排列都出现过（${全排列.length} 种一种不少；差一洗法只剩 24 种、定首洗法只剩 1 种）`, () => {
    const 没出现 = 全排列.filter((p) => !排列计数.get(p));
    expect(没出现, `这些排列一次都没排出来（可达性被丢了）：${没出现.slice(0, 5).join(' / ')}`).toEqual([]);
  });

  it(`占比与理论值 1/120 的最大偏差不超过 1 个百分点（comparator 洗法实测 8.3，${样本数} 发下这道界是统计噪声的 5 倍以上）`, () => {
    const 理论 = 100 / 全排列.length;
    let 最大 = 0;
    let 最歪 = 全排列[0];
    for (const p of 全排列) {
      const 偏 = Math.abs((排列计数.get(p) / 样本数) * 100 - 理论);
      if (偏 > 最大) { 最大 = 偏; 最歪 = p; }
    }
    const 实测 = ((排列计数.get(最歪) / 样本数) * 100).toFixed(3);
    expect(最大, `最大偏差 ${最大.toFixed(3)} 个百分点出在排列 ${最歪}（理论 ${理论.toFixed(3)}%、实测 ${实测}%）—— 洗法一有偏好，"哪间房带文献"就有偏好`).toBeLessThanOrEqual(1);
  });

  it('恒等排列（原序）的占比落在 0.5%~1.2%：太密是"洗不动"，为零是"排不出来"', () => {
    const 占比 = (排列计数.get('0,1,2,3,4') / 样本数) * 100;
    expect(占比, `恒等排列占 ${占比.toFixed(2)}%（理论 0.833%）—— comparator 洗法这里读 9.16%，退化不洗读 100%，差一洗法读 0%`).toBeGreaterThan(0.5);
    expect(占比, `恒等排列占 ${占比.toFixed(2)}%，越过上界 1.2% 就是"靠前的东西留在靠前"`).toBeLessThan(1.2);
  });

  it('洗出来的集合与输入同宽同内容（不丢元素、不补 undefined、不复制）', () => {
    for (const n of [1, 2, 5, 26]) {
      const 池 = Array.from({ length: n }, (_, i) => i);
      // 比的是**调用之前**那份输入的账：就地洗会把 `池` 自己改掉，拿活对象当基准就等于让被量的东西记账
      const 原样 = 池.join(',');
      const out = shuffle(池, 测试流(n * 7919));
      expect(out.length, `n=${n} 洗完变成 ${out.length} 个`).toBe(n);
      expect(out.includes(undefined), `n=${n} 的洗后数组里有 undefined（交换越界）`).toBe(false);
      expect([...out].sort((x, y) => x - y).join(','), `n=${n} 洗完元素集合变了`).toBe(原样);
    }
  });
});

describe('③ 副本语义：洗的是副本，恒定读数下的形状要说得出', () => {
  it('返回新数组，传进来的那一个逐元素不动（名册是模块级共享的）', () => {
    const 原件 = ['a', 'b', 'c', 'd', 'e'];
    const 快照 = [...原件];
    const out = shuffle(原件, 测试流(20261001));
    expect(out, '返回的还是同一个数组对象 —— 那洗的就不是副本').not.toBe(原件);
    expect(原件, `原件被就地改写成 ${原件.join(',')} —— 共享表就这么被上一次摇的种子污染`).toEqual(快照);
  });

  it('读数恒为 0.999… 时给出原序（每一发都选"和自己交换"）', () => {
    expect(shuffle(池5(), () => 0.9999999999)).toEqual([0, 1, 2, 3, 4]);
  });

  it('读数恒为 0 时给出左旋一发（每次都跟 0 号位换，从尾往前顶）', () => {
    expect(shuffle(池5(), () => 0)).toEqual([1, 2, 3, 4, 0]);
  });

  it('空池与单元素池不抛、而且一发随机都不吃', () => {
    let 用 = 0;
    const 记 = () => { 用++; return 0.5; };
    expect(shuffle([], 记)).toEqual([]);
    expect(shuffle([7], 记)).toEqual([7]);
    expect(用, `n≤1 的池子吃了 ${用} 发 —— 边界上多消耗一发，后面每一发的位置就都挪了`).toBe(0);
  });
});

describe('④ 名册不被污染：generateMaze 不许在 LORE_FRAGMENTS 上留手印', () => {
  it('连摇 600 座之后那张表逐字节还是原样（顺序与条目字段都算）', () => {
    const 批 = 批量();
    expect(批.length, '批量没造出来（0 座的话这条断言就是空转）').toBe(600);
    expect(JSON.stringify(LORE_FRAGMENTS), 'LORE_FRAGMENTS 被摇过 —— 下一座洗的是上一座重排过的那一份').toBe(名册快照);
  });
});

describe('⑤ 返回体的房间序是网格序（不再有谁也没声明过的随机序）', () => {
  it('电池种子上：名单就是网格序，Boss 场只占它锚格那一席', () => {
    for (const s of 电池) {
      const l = generateMaze(5, 5, s, 几何格);
      expect(数组序(l), `seed=${s} 的 rooms 不是网格序：${数组序(l).slice(0, 40)}…`).toBe(网格序(l));
    }
  });

  it('真入口五座也一样：消费者拿到的房间序与生成序相同', () => {
    for (const def of DUNGEON_DEFS) {
      for (const s of [1, -1, 20261001, 7919]) {
        const l = ProceduralDungeonGenerator.generate(def, s);
        expect(数组序(l), `${def.id} 在 seed=${s} 上的房间序被洗过`).toBe(网格序(l));
      }
    }
  });
});

describe('⑥ 文献落点的玩法不变量：换洗法只许换"哪一篇给哪间"', () => {
  it('每篇文献都出自名册，且同一座迷宫里不发两遍', () => {
    const 坏 = [];
    for (const l of 批量()) {
      const 见 = new Set();
      for (const r of l.rooms) {
        if (!r.lore) continue;
        if (!名册id.includes(r.lore.id)) 坏.push(`${r.id}→${r.lore.id} 不在名册`);
        if (见.has(r.lore.id)) 坏.push(`重复 ${r.id}→${r.lore.id}`);
        见.add(r.lore.id);
      }
    }
    expect(坏.slice(0, 6), `${坏.length} 处文献不在名册里或发了两遍`).toEqual([]);
  });

  it('出生房与出口房永远不带文献（入口是入口，Boss 是 Boss）', () => {
    const 坏 = 批量().filter((l) => l.rooms.some((r) => r.lore && (r.id === l.spawn.id || r.isExit)));
    expect(坏.map((l) => l.spawn.id).slice(0, 6), `${坏.length} 座把文献塞进了出生房或出口房`).toEqual([]);
  });

  it('每座带文献的房间数在 [1, 24] 内，600 座的均值在 7.2~13.5 之间（发放那道闸没走形）', () => {
    const 数 = 批量().map((l) => l.rooms.filter((r) => r.lore).length);
    const 均值 = 数.reduce((a, b) => a + b, 0) / 数.length;
    expect(Math.min(...数), `最少的那座只有 ${Math.min(...数)} 间带文献 —— 下界 1 的意思是"完全发不出"`).toBeGreaterThanOrEqual(1);
    expect(Math.max(...数), `最多的那座有 ${Math.max(...数)} 间，超过 24 间可带文献的房`).toBeLessThanOrEqual(24);
    expect(均值, `均值 ${均值.toFixed(2)} 跑出 7.2~13.5 —— 实测 10.3（23 间可带 × 45% 命中），界是它 ±30%`).toBeGreaterThan(7.2);
    expect(均值, `均值 ${均值.toFixed(2)} 跑出 7.2~13.5（同上：±30% 的界）`).toBeLessThan(13.5);
  });

  it('表头那篇（名册第一条）的落点覆盖除出生房以外的每一间', () => {
    const 批 = 批量();
    const 收到 = new Map();
    for (const l of 批) {
      for (const r of l.rooms) if (r.lore?.id === 名册id[0]) 收到.set(r.id, (收到.get(r.id) ?? 0) + 1);
    }
    const 可带 = new Set(批[0].rooms.map((r) => r.id));
    可带.delete(批[0].spawn.id);
    const 缺 = [...可带].filter((id) => !收到.has(id));
    expect(收到.size, `名册第一条只落到 ${收到.size} 间房 —— 池子不洗时它永远跟着遍历序的第一发通过的房走`).toBeGreaterThan(10);
    expect(缺, `名册第一条在这些房一次都没出现过：${缺.join(' / ')}`).toEqual([]);
    expect(收到.has(批[0].spawn.id), '名册第一条落到了出生房').toBe(false);
  });

  it('名册里每一篇都发得出去（不洗池子时表尾那几篇永远排不到前面）', () => {
    const 发过 = new Set();
    for (const l of 批量()) {
      for (const r of l.rooms) if (r.lore) 发过.add(r.lore.id);
    }
    const 缺 = 名册id.filter((id) => !发过.has(id));
    expect(缺, `这些文献一次都没发出去：${缺.join(' / ')} —— 池子按表序发的话，第 11 篇之后的东西永远轮不到（实测 600 座里每篇都发过 208 次以上）`).toEqual([]);
  });

  it('同一颗种子连摇两次，文献落点一字不差（副本洗法不吃上一次的结果）', () => {
    const 坏 = 摇样.filter((s) => 文献串(generateMaze(5, 5, s, 几何格)) !== 文献串(generateMaze(5, 5, s, 几何格)));
    expect(坏.slice(0, 6), `${坏.length} 颗种子两次摇出不同落点：${坏.slice(0, 3).join(' / ')}`).toEqual([]);
  });
});

describe('⑦ 文献的黄金签名：换洗法必须让这一条红，而不是悄悄换掉谁读到哪一篇', () => {
  /**
   * 冻的是"每间房拿到哪一篇"（按网格序读）。为什么这一层非冻不可 —— 一条如实记下的量程：
   * ⑥ 的覆盖判据对"遍历不再洗 rooms"是**绿**的（池子照旧洗，哪一篇给谁照旧铺满），
   * 而 `maze-seed-domain` 的 `布局签` 量的东西全在洗牌之前（房间数/门数/出口/编组/偏移）——
   * 少冻这一条，那一臂就静默通过。数值两条路各算一次（`.tmp-20261002/wb10s4b-refreeze.mjs` S2
   * 与本用例第一次跑红的 `Received:`），对得上才写进来。
   *
   * **切片5d 重冻**（三颗全换）：场并掉三格之后名单短了三位，"哪一篇给哪间"的落点自然重排。
   * 归因不是"跑红了就换数"：同一份脚本里 `⑤ 网格序` 的两位口径（数组序 vs 由 `cellsOf(场)` 推出的
   * 期望序）在电池 10 颗 + 真入口 28 座上**全绿**，而 ⑥ 的覆盖/不重复/出生出口房不带那些玩法不变量
   * 一条没动 —— 换的只有"哪一间在场"，不是发放那套流。数值同样两条路各算一遍
   * （`.tmp-wb10s5d/pins.mjs` ② 与本用例的 `Received:`）。
   */
  const 黄金 = [
    [20261001, '-,-,lore-broom,lore-saloon,lore-2,-,lore-ai-core,-,lore-inter,-,lore-wizard,-,lore-obelisk,lore-6,lore-speakeasy,-,lore-4,-,-,-,-,-'],
    [7, '-,lore-upside,-,-,lore-1,-,-,lore-6,-,lore-murphy,lore-arcade,-,lore-4,-,-,lore-saloon,-,-,-,lore-wormhole,lore-3,lore-nine'],
    [-3, '-,lore-wizard,-,-,-,lore-speakeasy,lore-wormhole,lore-8,-,lore-cantina,-,lore-ai-core,lore-neon,-,lore-torii,-,-,-,-,lore-jump-gate,lore-4,lore-inter'],
  ];
  for (const [seed, 期望] of 黄金) {
    it(`seed=${seed} 的文献落点签名`, () => {
      expect(文献串(generateMaze(5, 5, seed, 几何格)), `seed=${seed} 的文献发法变了（换流、换洗法或换发放那道闸都会红，先确认动的是哪一个）`).toBe(期望);
    });
  }
});

describe('⑧ 绝迹：比较器掷硬币这种洗法不许留在 src/', () => {
  /** 零参比较器只能读外部状态，而这里的外部状态就是随机流 —— 那正是 B77 的形状 */
  function 找洗法(text) {
    const 剥 = stripComments(text);
    const 命中 = [];
    const 重 = /\.sort\(\s*\(\s*\)\s*=>/g;
    let m;
    while ((m = 重.exec(剥))) {
      const 片段 = 剥.slice(m.index, m.index + 40).replace(/\s+/g, ' ');
      if (/rnd|random/i.test(片段)) 命中.push(片段);
    }
    return 命中;
  }

  it('src/ 全树 0 处，且扫描子自己不是瞎的（180+ 个文件在名单上）', () => {
    expect(FILES.length, '一个源文件都没扫到 —— 这条门禁不能算通过').toBeGreaterThanOrEqual(180);
    const 坏 = [];
    for (const f of FILES) {
      for (const h of 找洗法(readSrc(f))) 坏.push(`${f.replace(/\\/g, '/')}：${h}`);
    }
    expect(坏, `这些地方还在用比较器掷硬币洗牌：${坏.join(' | ')}`).toEqual([]);
  });

  it('反面控制：同一把尺子在 B77 那两行原文上量得到（扫不出来的门禁不算绿）', () => {
    const 原文 = [
      '  const lorePool = [...LORE_FRAGMENTS].sort(() => rnd() - 0.5);',
      '  for (const room of rooms.sort(() => rnd() - 0.5)) {',
    ].join('\n');
    expect(找洗法(原文), '那两行原文都没被点名 —— 这条绝迹门禁在空转').toHaveLength(2);
    // 正常用法不冤枉：带参数的比较器与不含随机的零参写法都不进名单
    expect(找洗法('  arr.sort((a, b) => a.score - b.score);')).toEqual([]);
  });
});
