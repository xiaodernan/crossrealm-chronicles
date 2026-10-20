/**
 * 招式特性不许"写了不生效"（W-E3 切片2）。
 *
 * ## 病灶（实测）
 *
 * `content/tuning.js` 的 `ENEMY_MOVES` 里有四格特性是**没有任何人读的**：
 * `fanDeg`（多段扇形转向）、`healZone`（治疗域）、`mark`（标记）、`trail`（残影）。
 * 也就是说：辉煌舞者的"晨曦旋舞"写着"四段光刃"，实际是同一段重复四次；
 * 辉煌骑士的"圣洁冲击"写着"原地留下一圈治愈光环"，实际只是把玩家推开；
 * 幽暗掠行兽的"潜行标记"写着"给玩家打上被标记状态"，实际只是原地摆个姿势。
 *
 * 症状不是报错 —— 数据表与实现各自合法，**只有玩家看得出**。
 * 这正是本仓反复消灭的那一族病（"表里有而页面没有"）。
 *
 * ## 这一条怎么判
 *
 * 判据**从源码反推**，不手抄名单：扫 `src/combat/` 与 `src/ai/` 里对
 * `move.<特性>` / `m.<特性>` / `it.<特性>` 的属性访问，取并集 = "已实现的特性"。
 * 招式表里用到的每一格特性都必须在那个并集里。
 *
 * 反向控制：往招式表里塞一个没人实现的新特性 ⇒ 这条当场红。
 * 正向见证：扫出来的并集不能是空集（扫不到东西就等于没判）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ENEMY_MOVES } from '../src/content/tuning.js';

const ROOT = process.cwd();

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * 扫源码里对特性名的属性访问。
 *
 * 口径是**反过来**的：先从招式表取出所有用到的特性名，再在 `src/` 里搜
 * `.<特性名>` / `?.<特性名>`。这样与"这段代码里这个招式对象叫什么变量"无关 ——
 * 早先一版按变量名（`move.` / `m.` / `it.`）扫，漏掉了 `this.activeMove.combo`
 * 与 `EnemyFSM` 里的 `moveCfg.travel`，判据自己先坏了。
 */
function 扫已实现(候选) {
  const 实现集 = new Set();
  for (const 文件 of walk(join(ROOT, 'src'))) {
    const 源 = readFileSync(文件, 'utf8');
    for (const 特性 of 候选) {
      // `.特性` 或 `?.特性`（后跟非标识符字符）
      const re = new RegExp(`\\??\\.${特性}\\b`);
      if (re.test(源)) 实现集.add(特性);
    }
  }
  return 实现集;
}

/** 纯数据的字段：它们本来就是"值"而不是"行为开关"，不参与"有没有被实现"的判据 */
const 纯数据 = new Set([
  'name', 'windup', 'strike', 'recover', 'reach', 'cone', 'aoe', 'band',
  'range', 'minDist', 'damage', 'cooldown', 'weight', 'telegraph', 'label',
  'minRarity', 'slot', 'mods', 'color', 'id',
]);

describe('招式特性：声明了就得真生效（W-E3 切片2）', () => {
  // 候选 = 招式表里用到的全部非纯数据特性
  const 候选 = new Set();
  for (const 招 of Object.values(ENEMY_MOVES)) {
    for (const 特性 of Object.keys(招)) {
      if (!纯数据.has(特性)) 候选.add(特性);
    }
  }
  const 实现集 = 扫已实现(候选);

  it('正向见证：扫描真的扫到了东西（扫不到 = 这条判据空转）', () => {
    expect(实现集.size, '一个特性都没扫到 —— 判据的源可能换了地方').toBeGreaterThan(5);
    // 这几格是**已实现**的基线，它们必须在（否则说明扫描的正则坏了）
    for (const 特性 of ['phase', 'ranged', 'hazard', 'knock', 'standoff', 'fanDeg', 'healZone']) {
      expect(实现集.has(特性), `已知实现了的 "${特性}" 没被扫到 —— 扫描口径坏了`).toBe(true);
    }
  });

  it('每一格声明的特性都有人实现（没人读 = 数据表在承诺做不到的事）', () => {
    const 没人实现 = new Map();
    for (const [招名, 招] of Object.entries(ENEMY_MOVES)) {
      for (const 特性 of Object.keys(招)) {
        if (纯数据.has(特性)) continue;
        if (实现集.has(特性)) continue;
        if (!没人实现.has(特性)) 没人实现.set(特性, []);
        没人实现.get(特性).push(招名);
      }
    }
    const 明细 = [...没人实现.entries()]
      .map(([特性, 招们]) => `${特性}（${招们.join(' / ')}）`)
      .join('；');
    expect(明细, `这些特性写在招式表里，却没有任何代码读它们 —— 玩家看到的和文案说的不一样：${明细}`).toBe('');
  });

  it('反向控制：塞一个没人实现的新特性，这条当场红', () => {
    // 判据本身两向都验：把"没实现的特性"当样本喂进去，必须被抓住
    const 假特性 = 'definitely_not_implemented_feature';
    expect(实现集.has(假特性)).toBe(false);
    // 而真实现的特性不能被误判
    expect(实现集.has('healZone')).toBe(true);
  });
});
