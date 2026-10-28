/**
 * 每一座副本都得有人**指名**要玩家下它 —— 没有被指名的那些，逐名记在账本里（W-E3 切片29）。
 *
 * ## 这一片解决什么
 *
 * `sunless-oratory` 是名册上的第十座，也是**第一座没有任何玩家路径指名的副本**：
 * 主线九步各认领一座（`objectives.js` 的 `dungeonId`），三界试炼认领三座
 * （`trial: true`），而这一座两样都不占。它的门口牌子立着、地图上有个点、
 * 文案四句齐备 —— 玩家**能**进去打，但没有任何一处告诉他"该去"。
 *
 * 这不是 bug，是一个**故意留下的半成品状态**：主线那一步要插进 62 步里，
 * 就得动存档语义（`quests.index`）⇒ 必须带一条 v18 → v19 迁移，那是切片30 的活。
 * 把它拆成两片的原因写在 §9 切片28 的尾巴里。
 *
 * ## 为什么不干脆"每座都必须被认领"
 *
 * 因为这一片交付的就是"这座还没被认领"这个状态本身 —— 那条判据今天会红。
 * 所以用的是**死键账本同款口径**（§9 切片26）：集合双向对齐 + 逐名 + 只减不增。
 * 危险从来不是"账本难看"，是**下一个照名册开工的人以为这座有人指路**，
 * 或者再建第十一座时又漏进同一格空白里 —— 那时账本从 1 变 2，这条门当场响。
 *
 * ## 用例分四层
 * ① 认领的口径本身：并集怎么算、算出来的每一枚都在名册里（幽灵认领要红）；
 * ② 账本腿：未认领集合**双向**等于账本，账本只许减不许增，账本里的名字必须在名册里；
 * ③ 认领要答得出"是谁认领的"：每座被认领的副本都指得回那一主线步（不是数出来的空话）；
 * ④ 反面证据：把尺子喂给"删掉一步认领"与"多建一座没认领的"两份假名册，
 *    账本方向必须各自响 —— 这一层不动出货表，只在内存里造。
 */
import { describe, it, expect } from 'vitest';
import { DUNGEON_DEFS, DUNGEON_IDS, TRIAL_DUNGEON_IDS } from '../src/content/dungeons.js';
import { MAINLINE } from '../src/content/objectives.js';

/**
 * 没有玩家路径指名的副本 —— **逐名账本，只许减不许增**。
 *
 * 关闭它的两种做法：① 切片30 把这一座插进主线（要带 v18 → v19 存档迁移）；
 * ② 从名册里删掉这座。把这一格改成别的名字不算关闭 —— 那只是换了一座没人认领的副本。
 */
const 未认领账本 = ['sunless-oratory'];

/**
 * 认领口径：主线步的 `dungeonId` ∪ 三界试炼的 `trial`。
 *
 * 分区支线**不算**认领 —— 它认的是"本区任意一座下过一回"（`sideQuests.js` 的
 * `那位面的副本(zone)` + `some(...)`），从来不指名哪一座；把它算成认领，
 * 这座副本就凭空有了指路人。
 */
function 未认领的(名册, 主线步) {
  const 认领 = new Set([
    ...主线步.filter((r) => r.dungeonId).map((r) => r.dungeonId),
    ...名册.filter((d) => d.trial === true).map((d) => d.id),
  ]);
  return 名册.map((d) => d.id).filter((id) => !认领.has(id));
}

const 今天 = 未认领的(DUNGEON_DEFS, MAINLINE);

describe('① 认领的口径先站得住', () => {
  it('主线指名的副本都在名册里（指着一座不存在的是幽灵，不是认领）', () => {
    const 幽灵 = [...new Set(MAINLINE.filter((r) => r.dungeonId).map((r) => r.dungeonId))]
      .filter((id) => !DUNGEON_IDS.includes(id));
    expect(幽灵.join(','), `主线这些步指着名册里没有的副本：${幽灵.join('、')}`).toBe('');
  });

  it('三界试炼那几座都在名册里，而且不是空集（空集上"每一座都清过"恒真）', () => {
    expect(TRIAL_DUNGEON_IDS.length, '没有一行 `trial: true` ⇒ 试炼成了空集').toBeGreaterThan(0);
    for (const id of TRIAL_DUNGEON_IDS) {
      expect(DUNGEON_IDS, `"${id}" 在试炼名册里，却不在副本名册里`).toContain(id);
    }
  });

  it('认领并集不是从名册抄来的：两个来源各自独立，且并集比名册小', () => {
    const 主线认 = new Set(MAINLINE.filter((r) => r.dungeonId).map((r) => r.dungeonId));
    const 试炼认 = new Set(TRIAL_DUNGEON_IDS);
    const 并集 = new Set([...主线认, ...试炼认]);
    // 并集若是整份名册，"未认领"这一维就恒空 ⇒ 账本成了摆设（这条先把"账本有得记"钉住）
    expect(并集.size, '每一座都有人认领 ⇒ 这条门恒绿，账本记的是空气').toBeLessThan(DUNGEON_DEFS.length);
    // 两个来源都不是名册的切片：抄名册的话，漏了也看不见
    expect(主线认.size, '主线里没有一座副本').toBeGreaterThan(0);
    expect(试炼认.size, '试炼里没有一座副本').toBeGreaterThan(0);
    expect(并集.size, '并集等于其中一个来源 ⇒ 另一个来源没有在说话（口径写重了）')
      .toBeGreaterThanOrEqual(Math.max(主线认.size, 试炼认.size));
  });
});

describe('② 未认领账本：双向对齐 + 只减不增 + 不许有幽灵名字', () => {
  it('今天未认领的就是账本上那几枚（多一座少一座都当场点名）', () => {
    expect([...今天].sort().join(','),
      `这些副本没有任何玩家路径指名要下它：${今天.join('、')} —— 要么给它插一条主线步（切片30 那种，带存档迁移），要么从名册里删掉它`)
      .toBe([...未认领账本].sort().join(','));
  });

  it('数量上限 = 账本长度：再加一座没人认领的副本就是越过上限', () => {
    expect(今天.length, `未认领的副本有 ${今天.length} 座，账本只记了 ${未认领账本.length} 枚 —— 只许减不许增`)
      .toBeLessThanOrEqual(未认领账本.length);
  });

  it('账本里每一枚都还在名册里（账本自己不许变成幽灵名单）', () => {
    for (const id of 未认领账本) {
      expect(DUNGEON_IDS, `账本记着 "${id}"，名册里却没有这座 —— 这座已经不存在了，账本该删这一名`)
        .toContain(id);
    }
  });

  it('账本记的是**副本 id**，不是文件名也不是文案键（防止把账本改成没人读的字符串集）', () => {
    for (const id of 未认领账本) {
      expect(id, `账本这一枚 "${id}" 带着路径或键名的味道，不像是副本 id`).not.match(/[/.'·]/);
      expect(DUNGEON_DEFS.find((d) => d.id === id), `"${id}" 在名册上没有对应行`).toBeTruthy();
    }
  });
});

describe('③ 被认领的每一座都指得回"是哪一步要我去的"', () => {
  it('每一座主线认领的副本都有一个具体的主线步（不是整表一个"打过副本"就算）', () => {
    const 缺 = [];
    for (const id of new Set(MAINLINE.filter((r) => r.dungeonId).map((r) => r.dungeonId))) {
      const 步 = MAINLINE.filter((r) => r.dungeonId === id);
      if (步.length === 0) 缺.push(id);
      // 一座副本被两步同时指名也行，但那一步必须有 id 可指（否则账无从对起）
      for (const s of 步) expect(s.id, `"${id}" 被一步没有 id 的表行认领`).toBeTruthy();
    }
    expect(缺.join(','), `这些副本认来了又没人指路：${缺.join('、')}`).toBe('');
  });

  it('认领一座副本的那一步本身在主线表里是有位置的（下标就是存档语义）', () => {
    const 下标 = MAINLINE.map((r, i) => [r.dungeonId, i]).filter(([id]) => id);
    expect(下标.length, '主线里找不到任何带 `dungeonId` 的行').toBeGreaterThan(0);
    for (const [, i] of 下标) {
      expect(Number.isInteger(i), `第 ${i} 步的下标不是整数 —— 那个下标就是存档里的 quests.index`).toBe(true);
    }
  });
});

describe('④ 反面证据：账本方向在两份假名册上各自响', () => {
  it('把一座副本的主线步删掉 ⇒ 未认领集合当场多一枚（门不是白送的）', () => {
    const 被删 = MAINLINE.filter((r) => r.dungeonId).map((r) => r.dungeonId)[0];
    const 假 = MAINLINE.filter((r) => r.dungeonId !== 被删);
    const 差集 = 未认领的(DUNGEON_DEFS, 假).filter((id) => !今天.includes(id));
    expect(差集, `删掉指着 "${被删}" 的那一步之后，未认领集合没有多出它 ⇒ 上面那两条腿量的是空气`)
      .toEqual([被删]);
  });

  it('多建一座没人认领的 ⇒ 越过上限的那一枚就是它（第十一座偷偷进来时这里响）', () => {
    const 探针 = { ...DUNGEON_DEFS[0], id: 'probe-eleventh', trial: false };
    const 加了 = [...DUNGEON_DEFS, 探针];
    const 未认领 = 未认领的(加了, MAINLINE);
    expect(未认领, '新加一座没认领的副本，未认领集合却没多出它 ⇒ 认领口径在替它说话').toContain('probe-eleventh');
    expect(未认领.length, `账本 ${未认领账本.length} 枚之外又多一枚 ⇒ 只减不增这条必须拦住`)
      .toBeGreaterThan(未认领账本.length);
  });

  it('两维是**并集**不是交集：只关一维，被两维同时认领的那座不许落进未认领', () => {
    const 双认 = TRIAL_DUNGEON_IDS.find((id) => MAINLINE.some((r) => r.dungeonId === id));
    expect(双认, '试炼里没有任何一座也有主线步 ⇒ 下面三条断言量不出并集').toBeTruthy();
    const 无试炼 = DUNGEON_DEFS.map((d) => ({ ...d, trial: false }));
    const 无主线步 = MAINLINE.filter((r) => r.dungeonId !== 双认);
    expect(未认领的(DUNGEON_DEFS, 无主线步), '主线步没了但还在试炼里 ⇒ 关一维不该使它未认领')
      .not.toContain(双认);
    expect(未认领的(无试炼, MAINLINE), '试炼那一维关了但主线还指着它 ⇒ 关一维不该使它未认领')
      .not.toContain(双认);
    expect(未认领的(无试炼, 无主线步), '两维都关掉却还不算未认领 ⇒ 认领口径在凭空替它说话')
      .toContain(双认);
  });
});
