/**
 * 副本遭遇表 = 「这一座出哪几类、一间房出几只」的唯一真源 —— W-B10 切片3b。
 *
 * ## 这一片要修的是什么
 *
 * 切片1 的普查（`.tmp-20260930/wb10s1-census.mjs`，读数 `.tmp-20260930/wb10s1-census.out` M2）量的是：
 * 五座副本各跑 200 个种子，出怪**完全同分布** —— 只有 `soldier` / `golem` / `drone` 三类、
 * 各约三分之一（实测 34 / 34 / 33）、每房 1~2 只。成因是 `world/MazeLayout.js` 里那两行：
 *
 * ```js
 * const n = 1 + Math.floor(rnd() * 2);
 * type: ['soldier', 'golem', 'drone'][Math.floor(rnd() * 3)],
 * ```
 *
 * 于是"灰白遗城的亡魂、禁书图书馆的咒术、五维裂隙的机械"在实测里不存在。副本 def 里那格
 * `themeType` 曾经声称过同一件事，而它**写 5 处、读 0 处**，切片3a 已删（B74）——
 * 写了没人读的东西不会报错，只会让下一个人以为它在起作用。所以这一片不是"再加一张表"，
 * 是把那句写死的三元式换成真的有人读的表，并且把"没人读的字段"换掉。
 *
 * ## 用例分六层
 *
 * 1. **数据忠实**：表自己说的话 —— 五座各一格、每格两类以上、池里的类型都在名册里、
 *    **五池两两不同**（按类型集合比，顺序换了下照样认得），以及"主线三座编组仍是 1~2 只"
 *    （这一片只换「出谁」，不动难度曲线）。
 * 2. **三元式绝迹**：那句写死的三分在 `src/` 全树出现 0 次；同一把尺子在切片3b 之前的
 *    原文上量得到 1 次（反面证据：扫到 0 不是因为尺子坏了）。
 * 3. **接线**：`generateMaze` 的第 4 个参数必填、认不出就抛；给了池子就按池子出、
 *    给了编组区间就按区间出 —— 用一张真表里没有的合成遭遇格量，免得拿被检对象当基线。
 * 4. **权重起作用**：等权两类各占约一半，9:1 的池子让主类压倒多数；权重是相对值，
 *    和不必凑成 100；五座各自的实测比例也要落在表上那一列附近（不只"主类对"）。
 * 5. **分布读数即验收**：真五座 × 200 个种子（和普查同样本量），每座的观测支撑集
 *    等于它自己那一池，五座的主类互不相同，且没有一座还落在 `soldier/golem/drone` 里。
 * 6. **注册表接线**：kind 挂上了、检的是同一个对象，十张坏表各红各的那一条，
 *    合法侧（等比放大权重）零错。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DUNGEON_ENCOUNTERS, DUNGEON_ENCOUNTER_IDS, dungeonEncounterOf } from '../src/content/dungeonEncounters.js';
import { DUNGEON_DEFS, DUNGEON_IDS } from '../src/content/dungeons.js';
import { ENEMY_ROSTER } from '../src/content/enemies.js';
import { CONTENT_TABLES, checkContent, checkDungeonEncounters, checkTable } from '../src/content/registry.js';
import { generateMaze } from '../src/world/MazeLayout.js';
import { BOSS_SPAN } from '../src/world/dungeonDimensions.js';
import { ProceduralDungeonGenerator } from '../src/world/ProceduralDungeonGenerator.js';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
/** 源文件是 CRLF：不剥 `\r`，跨行正则的 `.` 会带着 `\r` 咬不合，"没扫到"就会伪装成"没有" */
const readSrc = (rel) => readFileSync(join(ROOT, 'src', rel), 'utf8').replace(/\r\n/g, '\n');
/** 扫的是"代码里还写不写这一句"，而说明文字里恰好抄着那句原文（本文件与 MazeLayout 的注释都是） */
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

/** 一池的类型支撑集：排序后的数组。比较用它，不用字符串拼接顺序 */
const 支撑 = (row) => [...new Set(row.pool.map((e) => e.type))].sort();

/** 编组区间的长度（表外的事：区间反了这里给 0 或负，交给注册表去红） */
const 区间长度 = (g) => g.max - g.min + 1;

/**
 * 切片3b 动手之前 `world/MazeLayout.js` 里那两行的**原文**，逐字抄自
 * `git show HEAD~0:src/world/MazeLayout.js`（本切片开工时的 4d38ae2 + 3f12535 里都还是这个样子）。
 * 留着只有一个用处：给第 2 层那把尺子当反面证据 —— 缺席门禁扫到 0 时，必须能证明
 * "这把尺子量的是一句存在过的话"，而不是"这把尺子读不出任何东西"。
 */
const OLD_SPAWN_LINES = [
  "    const n = 1 + Math.floor(rnd() * 2);",
  "      room.enemySpawns.push({",
  "        x: room.x + (rnd() - 0.5) * (CELL - 6),",
  "        z: room.z + (rnd() - 0.5) * (CELL - 6),",
  "        type: ['soldier', 'golem', 'drone'][Math.floor(rnd() * 3)],",
  "      });",
].join('\n');

/** 跑一批种子，回这一座的观测直方图、编组分布与有怪房数 */
function 抽样(def, 种子数) {
  const 直方 = {};
  const 编组 = {};
  let 有怪房 = 0;
  let 房间数 = 0;
  for (let seed = 1; seed <= 种子数; seed++) {
    const layout = ProceduralDungeonGenerator.generate(def, seed);
    for (const room of layout.rooms) {
      房间数++;
      const spawns = room.enemySpawns ?? [];
      if (spawns.length) {
        有怪房++;
        编组[spawns.length] = (编组[spawns.length] ?? 0) + 1;
      }
      for (const e of spawns) 直方[e.type] = (直方[e.type] ?? 0) + 1;
    }
  }
  return { 直方, 编组, 有怪房, 房间数 };
}

/** 直方里的主类（观测频次最高的那一类） */
const 主类 = (直方) => Object.entries(直方).sort((a, b) => b[1] - a[1])[0]?.[0];

describe('① 数据忠实：五座各一格，池子两两不同，且只说"出谁"', () => {
  it('副本表里每一座都有遭遇格，键的顺序就是副本表的顺序（`DUNGEON_ENCOUNTER_IDS` 是推导不是手抄）', () => {
    expect(DUNGEON_ENCOUNTER_IDS).toEqual(Object.keys(DUNGEON_ENCOUNTERS));
    expect(Object.keys(DUNGEON_ENCOUNTERS).sort()).toEqual([...DUNGEON_IDS].sort());
    expect(DUNGEON_ENCOUNTER_IDS).toEqual(DUNGEON_DEFS.map((d) => d.id));
  });

  it('每一池两类以上、类型都在名册里、池内不重复、权重是正整数', () => {
    for (const [id, row] of Object.entries(DUNGEON_ENCOUNTERS)) {
      expect(row.pool.length, `${id} 只有一类敌人，那还是"一座一场仗"的反面`).toBeGreaterThanOrEqual(2);
      const 见过 = new Set();
      for (const e of row.pool) {
        expect(ENEMY_ROSTER[e.type], `${id} 池里的 "${e.type}" 不在敌人名册里`).toBeTruthy();
        expect(见过.has(e.type), `${id} 池里 "${e.type}" 写了不止一行（实际权重是各行相加）`).toBe(false);
        见过.add(e.type);
        expect(Number.isInteger(e.weight) && e.weight >= 1, `${id}.${e.type} 的权重不是正整数：${e.weight}`).toBe(true);
      }
    }
  });

  it('每一池的"最重那一类"唯一 —— 表上要答得出这座副本打头的是谁', () => {
    for (const [id, row] of Object.entries(DUNGEON_ENCOUNTERS)) {
      const 最重 = Math.max(...row.pool.map((e) => e.weight));
      const 并列 = row.pool.filter((e) => e.weight === 最重).map((e) => e.type);
      expect(并列, `${id} 有 ${并列.length} 类并列最重（各 ${最重}）：${并列.join('/')} —— 实测主类会跟着种子区间翻`)
        .toHaveLength(1);
    }
  });

  it('训练木人这类"打不动的摆设"不进任何池（按名册的 canAttack 说话，不点名 id）', () => {
    const 不可攻击 = Object.entries(ENEMY_ROSTER).filter(([, r]) => r.canAttack === false).map(([id]) => id);
    expect(不可攻击, '名册里已经没有一个 canAttack:false 的格子了？那这一条就没在测任何东西').not.toEqual([]);
    for (const [id, row] of Object.entries(DUNGEON_ENCOUNTERS)) {
      for (const t of 支撑(row)) {
        expect(不可攻击, `${id} 的池子里有不可攻击的一类`).not.toContain(t);
      }
    }
  });

  it('五池两两不同（按类型集合比）—— 这一片的立身之本就是别让五座打同一场仗', () => {
    const 全部 = Object.entries(DUNGEON_ENCOUNTERS).map(([id, row]) => [id, 支撑(row)]);
    const 撞 = [];
    for (let i = 0; i < 全部.length; i++) {
      for (let j = i + 1; j < 全部.length; j++) {
        if (全部[i][1].join(' ') === 全部[j][1].join(' ')) 撞.push(`${全部[i][0]} == ${全部[j][0]}`);
      }
    }
    expect(撞, `这几对副本用的是同一批敌人：${撞.join('、')}`).toEqual([]);
  });

  it('这把尺子不被顺序糊弄：抄隔壁那一池、连顺序都倒过来写，照样判成"同一批"', () => {
    const 神龛 = DUNGEON_ENCOUNTERS['forest-shrine'];
    const 抄来的 = { pool: [...神龛.pool].reverse(), group: 神龛.group };
    // 尺子本身：倒序之后支撑集不变 —— 所以"两池相同"判的是集合，不是数组写法
    expect(支撑(抄来的)).toEqual(支撑(神龛));
    // 真正的判据在注册表那一侧：把墓穴那一池写成"倒过来的神龛池"，不变式必须还是认出来
    const 乱序 = CONTENT_TABLES.map((t) => (t.kind === 'dungeonEncounters'
      ? { ...t, table: { ...DUNGEON_ENCOUNTERS, 'hub-catacombs': 抄来的 } }
      : t));
    expect(checkContent(乱序).join('\n'), '换顺序抄隔壁那一池就躲过去了？').toMatch(/同一批敌人/);
  });

  it('主线三座的编组仍是 1~2 只：这一片换的是「出谁」，不是难度曲线', () => {
    const 主线三座 = ['ruin-crypt', 'forbidden-library', 'five-dim-rift'];
    for (const id of 主线三座) {
      expect(DUNGEON_ENCOUNTERS[id].group, `${id} 的编组动了，而动手前是 1 + 摇 2`).toEqual({ min: 1, max: 2 });
    }
    // 反面证据：那两座的编组**不是** 1~2 —— 差别是真的做出来了，不是整表一个样
    expect(DUNGEON_ENCOUNTERS['forest-shrine'].group).not.toEqual({ min: 1, max: 2 });
    expect(DUNGEON_ENCOUNTERS['hub-catacombs'].group.min, '墓穴是可选副本里最重的一座，不该和主线一样 1 只起步').toBeGreaterThan(1);
  });

  it('池行只有 { type, weight } 两格：任何数值都不许在这里重抄名册', () => {
    for (const [id, row] of Object.entries(DUNGEON_ENCOUNTERS)) {
      for (const e of row.pool) {
        expect(Object.keys(e).sort(), `${id} 的池行多出了名册的格子`).toEqual(['type', 'weight']);
      }
      expect(Object.keys(row).sort(), `${id} 的遭遇格多出了别的字段`).toEqual(['group', 'pool']);
    }
  });
});

describe('② 三元式绝迹：那句写死的三分在 src/ 里出现 0 次', () => {
  /** 同一把尺子：代码里的 `['soldier', 'golem', 'drone']` 字面量（剥注释后） */
  const 数三元式 = (text) => (stripComments(text).match(/\[\s*'soldier'\s*,\s*'golem'\s*,\s*'drone'\s*\]/g) ?? []).length;

  it('全树 0 处，且 `world/MazeLayout.js` 里也没有', () => {
    const 命中 = [];
    for (const f of FILES) {
      const n = 数三元式(readFileSync(f, 'utf8'));
      if (n) 命中.push(`${relative(SRC, f).replaceAll('\\', '/')}:${n}`);
    }
    expect(命中, `这些文件还在硬编码那三类：${命中.join('、')}`).toEqual([]);
    expect(数三元式(readSrc('world/MazeLayout.js'))).toBe(0);
  });

  it('反面证据：这把尺子在切片3b 之前的原文上量得到 1 次', () => {
    expect(数三元式(OLD_SPAWN_LINES), '尺子读不出这句原话，那第②层的 0 就没意义').toBe(1);
    // 注释里抄着原话不算命中 —— 本文件与 MazeLayout 的说明文字里都写着它
    expect(数三元式(`/** 以前是 ${OLD_SPAWN_LINES} */\nconst a = 1;`)).toBe(0);
  });

  it('编组那一句也没了，出怪的两件事都改由表说', () => {
    const 源码 = stripComments(readSrc('world/MazeLayout.js'));
    expect(源码, '`1 + 摇 2` 那行回来了').not.toMatch(/const n = 1 \+ Math\.floor\(rnd\(\) \* 2\)/);
    expect(源码).toMatch(/encounters\.group/);
    expect(源码).toMatch(/drawFromPool\(encounters\.pool, rnd\)/);
    expect(readSrc('world/MazeLayout.js')).not.toMatch(/^\s*const n = 1 \+/m);
  });

  it('扫描集自证：真的扫到了当前源码树（空集就会一路绿灯）', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(180);
    const 相对 = FILES.map((f) => relative(SRC, f).replaceAll('\\', '/'));
    for (const probe of ['world/MazeLayout.js', 'world/ProceduralDungeonGenerator.js', 'content/dungeonEncounters.js']) {
      expect(相对, `扫描集里没有 ${probe}`).toContain(probe);
    }
  });

  it('生成器把 def.id 递给遭遇表，认不出就抛（不留默认池）', () => {
    const 源码 = readSrc('world/ProceduralDungeonGenerator.js');
    expect(源码).toContain("import { dungeonEncounterOf } from '../content/dungeonEncounters.js'");
    expect(stripComments(源码)).toMatch(/generateMaze\(\s*gridW,\s*gridH,\s*seed,\s*dungeonEncounterOf\(def\.id\)\s*\)/);
    expect(() => dungeonEncounterOf('ruin-crypts')).toThrow(/遭遇表里没有/);
    expect(() => dungeonEncounterOf('遗城')).toThrow(/已登记：ruin-crypt/);
    expect(dungeonEncounterOf('hub-catacombs').pool.length).toBeGreaterThanOrEqual(2);
  });
});

describe('③ 接线：给池子就按池子出，没给就当场抛', () => {
  const 合成 = (pool, min, max) => ({ pool, group: { min, max } });

  it('第 4 个参数必填：不传、空池、缺 group 都抛，而不是兜到某一座的池子', () => {
    expect(() => generateMaze(5, 5, 1)).toThrow(/需要一张遭遇表/);
    expect(() => generateMaze(5, 5, 1, undefined)).toThrow(/需要一张遭遇表/);
    expect(() => generateMaze(5, 5, 1, { pool: [], group: { min: 1, max: 2 } })).toThrow(/需要一张遭遇表/);
    expect(() => generateMaze(5, 5, 1, { pool: [{ type: 'soldier', weight: 1 }] })).toThrow(/需要一张遭遇表/);
    expect(() => generateMaze(5, 5, 1, null)).toThrow(/需要一张遭遇表/);
  });

  it('单类池 + 固定编组 3..3：每一间有怪的房都恰好三只，全是那一类（表说了算）', () => {
    const 只一种 = 合成([{ type: 'wraith', weight: 1 }], 3, 3);
    let 扫到 = 0;
    for (const seed of [1, 7, 12345, 999983, 424242]) {
      const layout = generateMaze(5, 5, seed, 只一种);
      for (const room of layout.rooms) {
        for (const e of room.enemySpawns) {
          扫到++;
          expect(e.type, '池里只有一类，出别的类型就是没按表走').toBe('wraith');
        }
      }
      const 有怪的 = layout.rooms.filter((r) => r.enemySpawns.length);
      for (const r of 有怪的) {
        expect(r.enemySpawns, `${r.id} 不是恰好 3 只（group 3..3 没起作用）`).toHaveLength(3);
      }
      expect(layout.spawn.enemySpawns, '玩家出生房被遭遇表派了怪').toEqual([]);
      expect(layout.exit.enemySpawns, 'Boss 房里塞了小怪，遭遇表不该管那一间').toEqual([]);
    }
    expect(扫到, '五局迷宫一个出怪点都没扫到（生成器空转）').toBeGreaterThanOrEqual(100);
  });

  it('编组真的跟着区间走：1..2 与 2..5 的观测值集合不一样', () => {
    const 读编组 = (min, max) => {
      const 见 = new Set();
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        for (const r of generateMaze(5, 5, seed, 合成([{ type: 'soldier', weight: 1 }, { type: 'drone', weight: 1 }], min, max)).rooms) {
          if (r.enemySpawns.length) 见.add(r.enemySpawns.length);
        }
      }
      return [...见].sort((a, b) => a - b);
    };
    expect(读编组(1, 2)).toEqual([1, 2]);
    expect(读编组(2, 5)).toEqual([2, 3, 4, 5]);
    // 区间长度由 max-min+1 来：写成 1..1 就每房恰好一只
    expect(读编组(1, 1)).toEqual([1]);
  });

  it('出怪点只带 { x, z, type }：数值仍由名册说，坐标仍由几何说', () => {
    for (const seed of [1, 999]) {
      for (const r of generateMaze(5, 5, seed, dungeonEncounterOf('five-dim-rift')).rooms) {
        for (const e of r.enemySpawns) {
          expect(Object.keys(e).sort(), `${r.id} 的出怪点多带了格子（那是名册或遭遇表的手抄）`).toEqual(['type', 'x', 'z']);
          expect(ENEMY_ROSTER[e.type], `${r.id} 出了一类名册里没有的 ${e.type}`).toBeTruthy();
        }
      }
    }
  });
});

describe('④ 权重是相对值，而且真的起作用', () => {
  const 抽 = (pool, 种子数 = 40) => {
    const 直方 = {};
    let 总 = 0;
    for (const seed of Array.from({ length: 种子数 }, (_, i) => i + 1)) {
      for (const r of generateMaze(5, 5, seed, { pool, group: { min: 3, max: 3 } }).rooms) {
        for (const e of r.enemySpawns) { 直方[e.type] = (直方[e.type] ?? 0) + 1; 总++; }
      }
    }
    return { 直方, 总 };
  };

  it('等权两类：各占约一半（若代码忽略了权重、永远取第一行，这里就 100% 对 0%）', () => {
    const { 直方, 总 } = 抽([{ type: 'soldier', weight: 1 }, { type: 'drone', weight: 1 }]);
    expect(总).toBeGreaterThan(1000);
    const 占比 = 直方.soldier / 总;
    expect(占比, `等权两类的实测占比是 ${(占比 * 100).toFixed(1)}%，不像等权抽样`).toBeGreaterThan(0.4);
    expect(占比, `等权两类的实测占比是 ${(占比 * 100).toFixed(1)}%，不像等权抽样`).toBeLessThan(0.6);
  });

  it('9:1 的池子：主类压倒多数；顺序换过来，主类跟着换（说明读的是权重不是位置）', () => {
    const 正 = 抽([{ type: 'knight', weight: 9 }, { type: 'drone', weight: 1 }]);
    expect(正.直方.knight / 正.总, '9:1 的池子里 knight 没占到多数 = 权重没被读').toBeGreaterThan(0.75);
    const 反 = 抽([{ type: 'drone', weight: 1 }, { type: 'knight', weight: 9 }]);
    expect(反.直方.knight / 反.总, '把权重行颠倒顺序就换了主类 = 抽的是位置不是权重').toBeGreaterThan(0.75);
  });

  it('权重不必凑成 100：5/3/2 与等比放大 10/6/4 抽出同一分布（同种子逐房同类型）', () => {
    const 小 = [{ type: 'soldier', weight: 5 }, { type: 'crawler', weight: 3 }, { type: 'wraith', weight: 2 }];
    const 大 = 小.map((e) => ({ type: e.type, weight: e.weight * 2 }));
    for (const seed of [1, 2, 3]) {
      const a = generateMaze(5, 5, seed, { pool: 小, group: { min: 2, max: 2 } });
      const b = generateMaze(5, 5, seed, { pool: 大, group: { min: 2, max: 2 } });
      expect(
        b.rooms.map((r) => r.enemySpawns.map((e) => e.type).join(',')),
        `种子 ${seed}：等比放大权重就换了出怪，那"相对值"这条口径不成立`
      ).toEqual(a.rooms.map((r) => r.enemySpawns.map((e) => e.type).join(',')));
    }
  });

  it('五座的实测比例都落在表里权重的附近（±8 个百分点，不是只有主类对）', () => {
    for (const def of DUNGEON_DEFS) {
      const row = dungeonEncounterOf(def.id);
      const 总权重 = row.pool.reduce((a, e) => a + e.weight, 0);
      const { 直方 } = 抽样(def, 60);
      // 上一版从这里解构了一个 `总` —— 而 `抽样()` 回的是 `{ 直方, 编组, 有怪房, 房间数 }`，
      // 那个字段从来不存在，于是"实测"恒为 NaN、`NaN > 0.08` 恒为 false，这条判据一次也没跑过
      // （臂 A2/A4/A5 三个都没能让它红，追下去红的是它自己）。分母当场加出来，并钉住样本数：
      // 零样本或 NaN 时分寸先失在这里，而不是失在一个悄悄为真的比较上。
      const 总 = Object.values(直方).reduce((a, b) => a + b, 0);
      expect(总, `${def.id} 一个出怪点都没摇到 —— 没有样本，"比例对不对"就没有答案`).toBeGreaterThan(1000);
      const 偏差 = [];
      for (const e of row.pool) {
        const 实测 = (直方[e.type] ?? 0) / 总;
        const 标称 = e.weight / 总权重;
        if (Math.abs(实测 - 标称) > 0.08) 偏差.push(`${e.type}: 标称 ${(标称 * 100).toFixed(0)}% 实测 ${(实测 * 100).toFixed(0)}%`);
      }
      expect(偏差, `${def.id} 的出怪比例与表上的权重对不上：${偏差.join('、')}`).toEqual([]);
    }
  });
});

describe('⑤ 分布读数即验收：五座各打各的仗（对照普查 M2 的 34/34/33）', () => {
  const 普查 = Object.fromEntries(DUNGEON_DEFS.map((def) => [def.id, 抽样(def, 200)]));

  it('每一座观测到的类型集合 == 它自己那一池（不多不少）', () => {
    for (const def of DUNGEON_DEFS) {
      const 观测 = Object.keys(普查[def.id].直方).sort();
      expect(观测, `${def.id} 实际出的怪与表上的池子不一致`)
        .toEqual(支撑(dungeonEncounterOf(def.id)));
    }
  });

  it('五座的主类互不相同，而且都等于各自池里权重最大的那一类', () => {
    const 主 = DUNGEON_DEFS.map((def) => 主类(普查[def.id].直方));
    expect(new Set(主).size, `这几座副本打的是同一场仗（主类都是 ${主.join('/')}）`).toBe(DUNGEON_DEFS.length);
    DUNGEON_DEFS.forEach((def, i) => {
      const row = dungeonEncounterOf(def.id);
      const 标称主类 = [...row.pool].sort((a, b) => b.weight - a.weight)[0].type;
      expect(主[i], `${def.id} 的主类是 ${主[i]}，表上权重最大的却是 ${标称主类}`).toBe(标称主类);
    });
  });

  it('没有任何一座还只出 `soldier/golem/drone` —— 普查 M2 那句"五座同分布"不再成立', () => {
    const 老三样 = new Set(['soldier', 'golem', 'drone']);
    const 还是老三样 = DUNGEON_DEFS
      .map((def) => Object.keys(普查[def.id].直方))
      .filter((ts) => ts.every((t) => 老三样.has(t)))
      .map((ts) => ts.join('/'));
    expect(还是老三样, `这些副本的出怪仍然全落在旧三元式里：${还是老三样.join('、')}`).toEqual([]);
    // 对照读数：切片1 普查时五座各跑 200 个种子，直方图是 34/34/33 的均匀三分
    expect(OLD_SPAWN_LINES).toContain("['soldier', 'golem', 'drone']");
  });

  it('有怪的房间数与旧口径一致（出生房与 Boss 房恒空，其余每间都派怪）', () => {
    for (const def of DUNGEON_DEFS) {
      const { 有怪房, 房间数 } = 普查[def.id];
      // 一间房 ≠ 一格（切片5d）：Boss 场把 `BOSS_SPAN × BOSS_SPAN` 格并成一间，块内另外三格
      // 连同它们的怪一起从名单里退出。所以"每局房间"这枚减数由跨距说话，不再等于格数。
      const 每局房间 = def.gridW * def.gridH - (BOSS_SPAN * BOSS_SPAN - 1);
      const 每局空房 = 2; // 玩家出生房 + Boss 大房（遭遇表管不着那一间）
      expect(有怪房, `${def.id} 的有怪房数对不上`).toBe(200 * (每局房间 - 每局空房));
      expect(房间数).toBe(200 * 每局房间);
      expect(有怪房).toBeLessThan(房间数);
    }
  });

  it('编组分布落在各自区间内，区间外的值一个都没有', () => {
    for (const def of DUNGEON_DEFS) {
      const g = dungeonEncounterOf(def.id).group;
      const 见 = Object.keys(普查[def.id].编组).map(Number);
      expect(见.length, `${def.id} 一种编组都没观察到（生成器空转）`).toBe(区间长度(g));
      for (const n of 见) {
        expect(n, `${def.id} 摇出 ${n} 只，超出表上的 ${g.min}..${g.max}`).toBeGreaterThanOrEqual(g.min);
        expect(n, `${def.id} 摇出 ${n} 只，超出表上的 ${g.min}..${g.max}`).toBeLessThanOrEqual(g.max);
      }
      // 区间两端都被走到：只观察到一端说明公式退化了
      for (const 端 of [g.min, g.max]) {
        expect(普查[def.id].编组[端], `${def.id} 从没摇出 ${端} 只这一档`).toBeTruthy();
      }
    }
  });
});

describe('⑥ 注册表接线：kind 挂上了，且双向都验', () => {
  const entry = CONTENT_TABLES.find((t) => t.kind === 'dungeonEncounters');

  it('dungeonEncounters 在 CONTENT_TABLES 里，且检的就是 `DUNGEON_ENCOUNTERS` 这一个对象（不是副本）', () => {
    expect(entry, '遭遇表没进注册表 —— 开机断链那一格又空了').toBeTruthy();
    expect(entry.shape).toBe('index');
    expect(entry.table).toBe(DUNGEON_ENCOUNTERS);
    expect(entry.invariant).toBe(checkDungeonEncounters);
  });

  it('真表零错误（`assertContent()` 在加载期已经断过一次，这里是可读的复证）', () => {
    expect(checkContent()).toEqual([]);
    expect(checkDungeonEncounters(DUNGEON_ENCOUNTERS)).toEqual([]);
  });

  it('十张改坏的表各红各的那一条；等比放大权重的合法表零错', () => {
    const 改 = (mut) => CONTENT_TABLES.map((t) => (t.kind === 'dungeonEncounters' ? { ...t, table: mut(DUNGEON_ENCOUNTERS) } : t));
    const 坏 = {
      键写漏字母: () => 改((r) => { const { 'ruin-crypt': 搬走, ...rest } = r; void 搬走; return { ...rest, 'ruin-cryt': { pool: [], group: { min: 1, max: 2 } } }; }),
      野类型: () => 改((r) => ({ ...r, 'ruin-crypt': { ...r['ruin-crypt'], pool: [{ type: 'ghost', weight: 1 }, ...r['ruin-crypt'].pool] } })),
      权重写零: () => 改((r) => ({ ...r, 'ruin-crypt': { ...r['ruin-crypt'], pool: r['ruin-crypt'].pool.map((e, i) => (i === 0 ? { ...e, weight: 0 } : e)) } })),
      抄隔壁池: () => 改((r) => ({ ...r, 'hub-catacombs': { ...r['hub-catacombs'], pool: r['forest-shrine'].pool } })),
      缺一座: () => 改((r) => { const { 'five-dim-rift': 搬走, ...rest } = r; void 搬走; return rest; }),
      编组倒写: () => 改((r) => ({ ...r, 'forest-shrine': { ...r['forest-shrine'], group: { min: 3, max: 1 } } })),
      木人进池: () => 改((r) => ({ ...r, 'ruin-crypt': { ...r['ruin-crypt'], pool: [{ type: 'dummy', weight: 1 }, ...r['ruin-crypt'].pool] } })),
      池子只剩一类: () => 改((r) => ({ ...r, 'five-dim-rift': { ...r['five-dim-rift'], pool: [r['five-dim-rift'].pool[0]] } })),
      同类写两行: () => 改((r) => ({ ...r, 'ruin-crypt': { ...r['ruin-crypt'], pool: [...r['ruin-crypt'].pool, { type: 'soldier', weight: 1 }] } })),
      主类并列: () => 改((r) => ({ ...r, 'ruin-crypt': { ...r['ruin-crypt'], pool: r['ruin-crypt'].pool.map((e) => ({ ...e, weight: 1 })) } })),
    };
    const 咬得住 = {
      键写漏字母: /不在 dungeons 里/,
      野类型: /ghost.*不在 enemyRoster 里/,
      权重写零: /weight.*至少 1/,
      抄隔壁池: /同一批敌人/,
      缺一座: /没有遭遇格/,
      编组倒写: /min 3 > max 1.*都不会出怪/,
      木人进池: /不可攻击/,
      池子只剩一类: /至少要 2 条/,
      同类写两行: /同一池里写了不止一行/,
      主类并列: /并列最重（各 1）.*打头的是谁/,
    };
    for (const [name, mutate] of Object.entries(坏)) {
      const errs = checkContent(mutate()).join('\n');
      expect(errs, `「${name}」这张坏表没被咬住（引擎在空转）`).toMatch(咬得住[name]);
    }
    // 合法侧：权重等比放大（相对值口径）必须零错
    const 放大 = CONTENT_TABLES.map((t) => (t.kind === 'dungeonEncounters'
      ? {
        ...t,
        table: Object.fromEntries(Object.entries(DUNGEON_ENCOUNTERS)
          .map(([id, row]) => [id, { ...row, pool: row.pool.map((e) => ({ ...e, weight: e.weight * 3 })) }])),
      }
      : t));
    expect(checkContent(放大), '等比放大权重也报错 = 校验器把相对值当成了概率').toEqual([]);
  });

  it('副本 id 能被遭遇表认领，反过来名册 id 也能被池子认领（两条 ref 方向都验）', () => {
    expect(entry.keyRef).toEqual({ of: 'dungeons' });
    expect(entry.value.of.pool.of.type).toEqual({ t: 'ref', of: 'enemyRoster' });
    expect(entry.value.of.pool.minLength, '池子没有"两类起步"的下限').toBe(2);
    const 编组 = entry.value.of.group.of;
    expect(编组.min.max, '编组上限没有封顶，写 40 也没人拦').toBe(4);
  });

  it('单独调 `checkTable` 也认得遭遇表 —— `ref` 是字段的属性，不是调用方的礼节', () => {
    expect(checkTable(entry), '不带 ctx 调 checkTable，真表就该零错').toEqual([]);
    const 野 = { ...DUNGEON_ENCOUNTERS, 'ruin-crypt': { ...DUNGEON_ENCOUNTERS['ruin-crypt'], pool: [{ type: 'ghost', weight: 1 }, { type: 'soldier', weight: 1 }] } };
    expect(() => checkTable({ ...entry, table: 野 })).not.toThrow();
    expect(checkTable({ ...entry, table: 野 }).join('\n'), '断链没被单独一次调用查出来').toMatch(/ghost.*不在 enemyRoster 里/);
  });

  it('不变式直调也说同一套话（注册表接线不是唯一入口）', () => {
    const 两座同池 = {
      a: { pool: [{ type: 'soldier', weight: 1 }, { type: 'drone', weight: 1 }], group: { min: 1, max: 2 } },
      b: { pool: [{ type: 'drone', weight: 1 }, { type: 'soldier', weight: 1 }], group: { min: 1, max: 2 } },
    };
    const 报 = checkDungeonEncounters(两座同池).join('\n');
    expect(报, '两格键都不是副本表里的 id，先该被 keyRef 之外的那条覆盖规则说住').toContain('没有遭遇格');
    expect(报).toMatch(/b"\]\.pool: 与 dungeonEncounters\["a"\] 是同一批敌人/);
    expect(checkDungeonEncounters({}), '空表只该说"每座都没登记"这一句').toHaveLength(1);
  });
});
