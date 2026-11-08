/**
 * 迁移链只许查**当年的表**（W-E3 切片39）。
 *
 * ## 这一片修的是什么
 *
 * 存档里的 `quests.index` 是**位置**。迁移的每一跳收到的都是**那一版**坐标，
 * 可有两处直接查了今天的 `MAINLINE`：
 *
 * - `v17 → v18` 重放旗标 —— 这是**当前故障**，不是理论风险。v17 档停在第 44 位
 *   （era 17 里是 `skills`）时，旧写法拿 44 去查今天的表，停在今天的第 44 位
 *   （`chaos-core`）上 ⇒ 重放范围少了一段 ⇒ `hasChaosCore` 没点亮。
 *   而这个旗标是 `chaos-boss` 的 `requires` ⇒ 那一步永远判不完成
 *   ⇒ **主线软锁**（同一份档里 `infinity` 还要 `chaosBossDefeated`，游戏通不了）。
 * - `v20 → v21` 抄 `currentId` —— 这是**定时炸弹**：今天查得对，只是因为
 *   今天还没在 v21 之后插过步；插一步之后这跳就会把老档认成相邻那一步。
 *
 * 修法不是"再算一遍偏移"，而是把历史从现状里切出来：一张**冻结的作者账本**
 * （`MAINLINE_HISTORY`）记"每一步是哪一版表里第一次出现的"，迁移问 `mainlineAt(版本)`。
 *
 * ## 门禁四条腿
 *
 * ① 账本是今天主线的**超序列**（允许往后插步，不许删/改序；某格消失要点名要求写映射）；
 * ② 每一版的长度是**历史事实**（era 7 = 32 步 … era 20/21 = 65 步）；
 * ③ `Vn_INSERT_POINTS` 与账本**互为见证** —— 按插入点把 era(n) 拼成 era(n+1)，
 *    拼出来的位置与 id 必须逐字等于账本里的下一版；
 * ④ 两处迁移体里**不许出现** `MAINLINE`（静态扫描 + 反向控制）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAINLINE } from '../src/content/objectives.js';
import {
  MAINLINE_HISTORY, mainlineAt, MIGRATIONS, V8_INSERT_POINTS, V9_INSERT_POINTS,
  V10_INSERT_POINTS, V11_INSERT_POINTS, V12_INSERT_POINTS, V13_INSERT_POINTS,
  V14_INSERT_POINTS, V15_INSERT_POINTS, V16_INSERT_POINTS, V17_INSERT_POINTS,
  V18_INSERT_POINTS, V19_INSERT_POINTS,
} from '../src/game/SaveMigrations.js';

const 今天 = MAINLINE.map((r) => r.id);
const 账上 = MAINLINE_HISTORY.map((e) => e.id);

describe('① 账本描述今天的主线：是超序列，不是"另一条线"', () => {
  it('账上每一步今天都还在，且顺序一致（允许往后插步）', () => {
    const 缺 = 账上.filter((id) => !今天.includes(id));
    expect(缺,
      '账本里这些步今天的表上找不到 —— 改名必须写一条迁移把老 id 映射到新 id（W-E3 切片38 的尾巴）. ' + 缺.join('、')).toEqual([]);
    // 顺序：账上的 id 在今天的表里必须按下标递增出现（删/改序会让老档落到别的步上）
    let 上 = -1;
    const 乱序 = [];
    for (const id of 账上) {
      const i = 今天.indexOf(id);
      if (i <= 上) 乱序.push(id);
      上 = i;
    }
    expect(乱序, '账本顺序与今天的主线顺序打架 —— 老档的下标会落到别的步上').toEqual([]);
  });

  it('账本每一条都是 { id, addedIn }，addedIn 是 ≤ 20 的整数（v21 之后的新步不进这张账）', () => {
    expect(MAINLINE_HISTORY.length, '账本是 v21 那一刻的快照，今天它应当是 65 步').toBe(65);
    const 坏 = MAINLINE_HISTORY.filter((e) => !Number.isInteger(e.addedIn) || e.addedIn < 0 || e.addedIn > 20);
    expect(坏, '这些条目的 addedIn 越界 —— v21 之后新增的步不许进这张账（它们不改变任何老版本的表）').toEqual([]);
    expect(new Set(账上).size, '账上 id 重复').toBe(账上.length);
  });
});

describe('② 每一版的长度是历史事实', () => {
  it('era 7 = 32 步（原始表），era 20 / 21 = 65 步（v21 冻结时）', () => {
    expect(mainlineAt(7).length, '原始那 32 步').toBe(32);
    expect(mainlineAt(17).length).toBe(56);
    expect(mainlineAt(18).length).toBe(62);
    expect(mainlineAt(19).length).toBe(63);
    expect(mainlineAt(20).length, 'v20 与 v21 的表相同（最后一跳不插行）').toBe(65);
    expect(mainlineAt(21)).toEqual(mainlineAt(20));
    expect(mainlineAt(4)).toEqual(mainlineAt(7));
  });

  it('v21 之后插进来的步**不进这张账**（它不改变任何老版本的表）', () => {
    // 切片40 插了断誓碑一步，切片41/42/45/46 各插了三步（第 3 / 2 / 1 章与终局）：
    // 它们都是 v21 之后的事，账本必须一动不动。
    for (const id of ['void-oath', 'choice-ascend', 'ascend-observe', 'ascend-retrace', 'choice-second', 'second-ember', 'second-stone', 'choice-first', 'first-arrow', 'first-camp', 'choice-final', 'final-keep', 'final-quiet']) {
      expect(账上, `v21 之后新插的步 "${id}" 进了账 —— 那会让 era 20 凭空长一步`).not.toContain(id);
      expect(今天, `今天的主线里没有 "${id}"？这条腿要跟着内容走`).toContain(id);
    }
    expect(mainlineAt(20)).toHaveLength(65);
    expect(MAINLINE, 'v21 之后插了二十一步（切片40 一步、切片41/42/45/46 各三步、切片67 大主教、切片68 影煞、切片69 幻影、切片70 撕掠者、切片71 凝视者、切片72 裂隙行者、切片73 蛮兽、切片74 潜伏者）—— 账本不该跟着长').toHaveLength(86);
    // 切片67/68/69 那三步也要落在"今天的表里、era 20 账本里没有"这一格
    expect(今天, '今天的主线里没有 archon-hunt —— 插步没上表').toContain('archon-hunt');
    expect(账上, 'archon-hunt 进了 v20 账本 —— 那会让 era 20 凭空长一步').not.toContain('archon-hunt');
    expect(今天, '今天的主线里没有 gloom-shade-hunt —— 插步没上表').toContain('gloom-shade-hunt');
    expect(账上, 'gloom-shade-hunt 进了 v20 账本 —— 那会让 era 20 凭空长一步').not.toContain('gloom-shade-hunt');
    expect(今天, '今天的主线里没有 void-phantom-hunt —— 插步没上表').toContain('void-phantom-hunt');
    expect(账上, 'void-phantom-hunt 进了 v20 账本 —— 那会让 era 20 凭空长一步').not.toContain('void-phantom-hunt');
    expect(今天, '今天的主线里没有 abyss-reaver-hunt —— 插步没上表').toContain('abyss-reaver-hunt');
    expect(账上, 'abyss-reaver-hunt 进了 v20 账本 —— 那会让 era 20 凭空长一步').not.toContain('abyss-reaver-hunt');
    expect(今天, '今天的主线里没有 abyss-watcher-hunt —— 插步没上表').toContain('abyss-watcher-hunt');
    expect(账上, 'abyss-watcher-hunt 进了 v20 账本 —— 那会让 era 20 凭空长一步').not.toContain('abyss-watcher-hunt');
    expect(今天, '今天的主线里没有 void-riftwalker-hunt —— 插步没上表').toContain('void-riftwalker-hunt');
    expect(账上, 'void-riftwalker-hunt 进了 v20 账本 —— 那会让 era 20 凭空长一步').not.toContain('void-riftwalker-hunt');
    expect(今天, '今天的主线里没有 abyss-brute-hunt —— 插步没上表').toContain('abyss-brute-hunt');
    expect(账上, 'abyss-brute-hunt 进了 v20 账本 —— 那会让 era 20 凭空长一步').not.toContain('abyss-brute-hunt');
    expect(今天, '今天的主线里没有 void-lurker-hunt —— 插步没上表').toContain('void-lurker-hunt');
    expect(账上, 'void-lurker-hunt 进了 v20 账本 —— 那会让 era 20 凭空长一步').not.toContain('void-lurker-hunt');
  });
  it('era 20 是冻结的：今天的表往后长，它不动', () => {
    expect(mainlineAt(20)).toEqual(账上);
  });
});

describe('③ 插入点与账本互为见证', () => {
  const 跳 = {
    8: V8_INSERT_POINTS, 9: V9_INSERT_POINTS, 10: V10_INSERT_POINTS, 11: V11_INSERT_POINTS,
    12: V12_INSERT_POINTS, 13: V13_INSERT_POINTS, 14: V14_INSERT_POINTS, 15: V15_INSERT_POINTS,
    16: V16_INSERT_POINTS, 17: V17_INSERT_POINTS, 18: V18_INSERT_POINTS, 19: V19_INSERT_POINTS,
  };
  it('按 era(n) 的插入点拼出来的 era(n+1)，逐格等于账本', () => {
    for (const [版本, 插点] of Object.entries(跳)) {
      const 前 = mainlineAt(Number(版本));
      const 后 = mainlineAt(Number(版本) + 1);
      // 旧下标 → 新下标的映射（与迁移里那条算式同形）
      const 像 = new Set(前.map((_, i) => i + 插点.filter((p) => p <= i).length));
      const 插进去的位置 = [];
      for (let i = 0; i < 后.length; i++) if (!像.has(i)) 插进去的位置.push(i);
      expect(插进去的位置.length, 'v' + 版本 + ' 的插入点说插 ' + 插点.length + ' 步').toBe(插点.length);
      // 拼回：把插进去的那些格子摘掉，剩下的应当逐字等于 era(n)
      const 摘掉 = 后.filter((_, i) => !插进去的位置.includes(i));
      expect(摘掉, '摘掉 v' + 版本 + '→v' + (Number(版本) + 1) + ' 新插的步之后，应当正好是 era ' + 版本).toEqual(前);
      // 插进去的 id，正好是账上 addedIn === 版本+1 的那些
      const 应插 = MAINLINE_HISTORY.filter((e) => e.addedIn === Number(版本) + 1).map((e) => e.id);
      expect(插进去的位置.map((i) => 后[i]), 'v' + (Number(版本) + 1) + ' 新插的步与账本的 addedIn 对不上').toEqual(应插);
    }
  });
});

describe('④ 迁移体里不许再出现 MAINLINE（静态扫描 + 反向控制）', () => {
  /*
   * B162：读进来先归一次 EOL。
   *
   * 下面那把尺找的是 `'\n}\n'` —— 字符串里的 `\n` 是转义出来的 LF，而 `readFileSync` 交回的是
   * **检出环境的字节**。在 CRLF 的检出上它一次也找不到：`indexOf` 交回 −1，`slice(i, -1)` 于是
   * 把**从函数头到文件尾**整段当成"函数体"。实测（`src/game/SaveMigrations.js`，CRLF 平面）：
   *   migrateV17toV18  体长 2661（归一后 719），尾里还带着后面三个迁移函数；
   *   migrateV20toV21  体长 1440（归一后 208）。
   * 两个方向的后果不一样：`not.toMatch(/\bMAINLINE\b/)` 是**过宽**（目标函数真违规仍抓得到，
   * 但后文任何一处无关提及都会把它染红）；`toMatch(/mainlineAt\(/)` 是**空转** —— 目标函数
   * 不再问账本、只要文件里后面任何一个函数还在问，这一格照样绿。它是"绿着的瞎腿"，不是红。
   * 与 B161 同族（那一处是跨行反引号锚点被 vite 归一化吃掉），载体换成 `\n` 转义。
   */
  const 源 = readFileSync(join(process.cwd(), 'src/game/SaveMigrations.js'), 'utf8').replace(/\r\n/g, '\n');
  const 两处 = ['migrateV17toV18', 'migrateV20toV21'];
  /** 摘出一个函数体（到下一个顶层的右花括号 + 换行）；抽不出边界就交回 null，不许悄悄取到文件尾 */
  const 摘 = (文本, 名) => {
    const i = 文本.indexOf('function ' + 名 + '(');
    expect(i, '找不到 ' + 名 + ' => 名字改了？这条腿要跟着改').toBeGreaterThan(-1);
    const j = 文本.indexOf('\n}\n', i);
    // 只判**代码**：注释里提到这个名字是在说"不许查它"，那不是违规；
    // 判据与 quest-save-restore 那处同口径（剥掉行注释与块注释行）。
    const 体 = j < 0 ? null : 文本.slice(i, j).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    return { i, j, 体 };
  };
  it('v17 → v18 与 v20 → v21 两处都问账本，不问现状', () => {
    for (const 名 of 两处) {
      const { 体 } = 摘(源, 名);
      expect(体, 名 + ' 的函数体抽不出边界（找不到 "\\n}\\n"）⇒ 再判下去就是拿文件尾当函数体，见 B162').not.toBeNull();
      expect(体, 名 + ' 还在查今天的 MAINLINE ⇒ 下一次插步就把老档认成相邻那一步').not.toMatch(/\bMAINLINE\b/);
      expect(体, 名 + ' 没有问账本（mainlineAt）').toMatch(/mainlineAt\(/);
    }
  });
  it('边界见证：函数体里不许有顶格的右花括号行（B162 —— 越过自己的右花括号就是取多了）', () => {
    for (const 名 of 两处) {
      const { j, i, 体 } = 摘(源, 名);
      expect(j, 名 + ' 的终止符没找到').toBeGreaterThan(i);
      expect(体, 名 + ' 的"函数体"里有顶格 } ⇒ 抽取越过了它自己的右花括号').not.toMatch(/^\}$/m);
    }
  });
  it('反向控制：CRLF 字节抽不出边界，而旧写法取到的那条尾巴正好被边界见证咬住（B162）', () => {
    // 这里**故意**再裸读一次磁盘：控制要自己造出两种平面，不能依赖上面那把尺已经归一过
    // （否则摘掉归一化的那一臂会把控制一起改绿，控制就见证不了任何东西）。
    const 盘 = readFileSync(join(process.cwd(), 'src/game/SaveMigrations.js'), 'utf8');
    const LF = 盘.replace(/\r\n/g, '\n');
    const CRLF = LF.replace(/\n/g, '\r\n');
    for (const 名 of 两处) {
      const 坏 = 摘(CRLF, 名);
      expect(坏.j, 名 + '：CRLF 字节上 "\\n}\\n" 本该一次也找不到').toBe(-1);
      expect(坏.体, 名 + '：抽不出边界就必须交回 null，不许悄悄取到文件尾').toBeNull();
      // 旧写法（j = -1 时 slice(i, -1)）取到的那条尾巴：边界见证必须咬得住它
      const 尾 = CRLF.slice(坏.i, -1).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      expect(尾, 名 + '：旧写法那条尾巴里没有顶格 } ⇒ 上面那条边界见证是装饰').toMatch(/^\}$/m);
      // 同一份字节归一之后必须抽得出来，且边界见证放行
      const 好 = 摘(CRLF.replace(/\r\n/g, '\n'), 名);
      expect(好.j, 名 + '：归一之后终止符还是找不到 ⇒ 病不在 EOL').toBeGreaterThan(好.i);
      expect(好.体, 名 + '：归一之后边界见证反而红了 ⇒ 见证咬的是不该咬的东西').not.toMatch(/^\}$/m);
    }
  });
  it('反向控制：文件里确实还有 MAINLINE_HISTORY，且顶层不再 import MAINLINE', () => {
    expect(源).toMatch(/MAINLINE_HISTORY/);
    expect(源, '顶层 import 还在把 MAINLINE 拉进来 ⇒ 说明还有别处在查现状').not.toMatch(/import \{ MAINLINE, OBJECTIVES \}/);
  });
});

describe('⑤ 行为腿：老档（v20）抄 id 用的是当年那张表', () => {
  const 造v20 = () => ({ version: 20, quests: { index: 0, completed: false, stats: {} } });
  it('下标 40 抄成 era 20 的第 40 步（choice-void），而不是"今天第 40 步"', () => {
    const d = 造v20();
    d.quests.index = 40;
    MIGRATIONS[20](d);
    expect(d.quests.currentId).toBe(mainlineAt(20)[40]);
    expect(d.quests.currentId, '这一格是 v21 冻结时的表：choice-void').toBe('choice-void');
  });
  it('通关档（下标越界）抄成 null，不抄成最后一步', () => {
    const d = 造v20();
    d.quests.index = mainlineAt(20).length;
    MIGRATIONS[20](d);
    expect(d.quests.currentId).toBeNull();
  });
  it('不是数字的下标抄成 null（数字字符串按数字读，沿用既有口径）', () => {
    const d = 造v20();
    d.quests.index = 'abc';
    MIGRATIONS[20](d);
    expect(d.quests.currentId).toBeNull();
  });
});

describe('⑥ 反向控制：桩件自证 ① 那条腿不是恒真', () => {
  it('账上多一格今天的表里没有的 ⇒ 缺的那一格被点名', () => {
    const 假账 = [...账上.slice(0, 5), 'a-step-that-was-removed', ...账上.slice(5)];
    const 缺 = 假账.filter((id) => !今天.includes(id));
    expect(缺).toEqual(['a-step-that-was-removed']);
  });
});
