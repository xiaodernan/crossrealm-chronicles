/**
 * 任务判据的事实闭包（W-B3 切片6）—— 判据读的那一格都要有生产者。
 *
 * ## 这一片防的是什么
 *
 * 判据（`CONDITIONS`）读 `state.stats.<格>`，生产者（`STAT_EVENTS`）写 `s.<格>`。
 * 两份都在同一层内容里，但**没有一处把它们对起来**：
 *
 * - **判据读的那一格没人写** ⇒ 那一格永远 `false` ⇒ 玩家看到一条**永远做不完**的主线步，
 *   而注册表全绿（它只核"条件名在不在 `CONDITIONS` 里"）。
 * - **生产者写了没人读** ⇒ 死账（危害小一些，但同样是不该有的第二份真相）。
 *
 * 这条尾巴从 W-B3 切片5 记到现在 —— W-B12 切片3+ 与切片4+ 都逐字点名"判据仍是闭包"。
 *
 * ## 判据是**推导**出来的，不是手抄的
 *
 * 事实集从**函数体**里抠出来（`src/content/questFacts.js`）。所以本片的用例不能只说
 * "现在是闭的"，还要说**"门禁会咬"** —— 三条变异臂各造一种破口，验证门禁当场变红。
 */
import { describe, it, expect } from 'vitest';
import {
  checkQuestFactClosure, questFactsRead, questFactsWritten, questLedgerShape,
} from '../src/content/questFacts.js';
import {
  CONDITIONS, STAT_EVENTS, BOSS_STAT_KEYS, emptyStats,
} from '../src/content/objectives.js';
import { checkContent } from '../src/content/registry.js';

const 排序 = (s) => [...s].sort();

describe('① 真表闭包成立', () => {
  it('四条规则一条都不破（读 ⊆ 写 ⊆ 账本形状，且账本形状 ⊆ 写）', () => {
    const errs = checkQuestFactClosure();
    expect(errs, `判据闭包破了：\n${errs.join('\n')}`).toEqual([]);
  });

  it('注册表的整表校验也不报闭包这一族（门禁真的接上了，不只是模块里有个函数）', () => {
    const errs = checkContent().filter((e) => /判据读的账本格|生产者写的账本格|账本里有/.test(e));
    expect(errs, `注册表没接上闭包检查：\n${errs.join('\n')}`).toEqual([]);
  });

  it('三份推导是同一组格子（读 = 写 = 账本形状），且不是空集', () => {
    const 读 = 排序(questFactsRead());
    const 写 = 排序(questFactsWritten());
    const 形状 = 排序(questLedgerShape());
    expect(读.length, '推导出的事实是空集 —— 那这道门禁在空集上恒真').toBeGreaterThan(10);
    expect(读).toEqual(写);
    expect(写).toEqual(形状);
  });

  it('Boss 那一族在推导里（计算写 `s[key] = true` 扫不出键，靠名册补）', () => {
    const 读 = questFactsRead();
    for (const k of Object.values(BOSS_STAT_KEYS)) {
      expect(读.has(k), `Boss 账本格 "${k}" 不在推导出的读取集里 —— 计算读漏了`).toBe(true);
    }
  });
});

describe('② 门禁会咬：三条变异臂', () => {
  it('变异臂①：加一条读着没人写那一格的判据 ⇒ 门禁红，且点名那一格', () => {
    CONDITIONS.__probe_dead = (state) => state.stats.nobodyWritesThis;
    try {
      const errs = checkQuestFactClosure();
      expect(errs.length, '门禁没咬住一条永远为假的判据').toBeGreaterThan(0);
      expect(errs.join('\n')).toMatch(/nobodyWritesThis/);
      expect(errs.join('\n')).toMatch(/没有任何生产者/);
    } finally {
      delete CONDITIONS.__probe_dead;
    }
    expect(checkQuestFactClosure(), '变异臂撤掉后门禁不该还红').toEqual([]);
  });

  it('变异臂②：账本里有一格没人写 ⇒ 门禁红（死格）', () => {
    // 删掉一个记账函数 ⇒ 它写的那些格就没有生产者了
    const 备份 = STAT_EVENTS['chest-opened'];
    delete STAT_EVENTS['chest-opened'];
    try {
      const errs = checkQuestFactClosure();
      expect(errs.length, '门禁没咬住一个死格').toBeGreaterThan(0);
      expect(errs.join('\n')).toMatch(/chestsOpened/);
      expect(errs.join('\n')).toMatch(/死格/);
    } finally {
      STAT_EVENTS['chest-opened'] = 备份;
    }
    expect(checkQuestFactClosure()).toEqual([]);
  });

  it('变异臂③：生产者写一格账本里没有的 ⇒ 门禁红（伪账）', () => {
    STAT_EVENTS.__probe_phantom = (s) => { s.notInLedger += 1; };
    try {
      const errs = checkQuestFactClosure();
      expect(errs.length, '门禁没咬住一格伪账').toBeGreaterThan(0);
      expect(errs.join('\n')).toMatch(/notInLedger/);
      expect(errs.join('\n')).toMatch(/伪账/);
    } finally {
      delete STAT_EVENTS.__probe_phantom;
    }
    expect(checkQuestFactClosure()).toEqual([]);
  });
});

describe('③ 交叉证据：推导没有漏', () => {
  it('真跑一遍记账函数，写进去的格子与扫描出来的一致（扫描没漏、也没多）', () => {
    // 扫描是从**源码**抠的 —— 它可能漏。所以这里**实跑**一遍每个记账函数，
    // 看账本上真的变了哪几格。两边对不上 ⇒ 扫描不准（那就是这道门禁自己坏了）。
    const 实跑 = new Set();
    // 探针载荷：通用的一份 + Boss 那一族各一只（计算写要 bossId 才写得进去）。
    const 通用 = { id: 'probe', type: 'soldier', charged: true, level: 5, mind: 3 };
    const 细节们 = (名) => (名 === 'enemy-defeated'
      ? [...Object.keys(BOSS_STAT_KEYS).map((bossId) => ({ ...通用, type: 'boss', bossId })), 通用]
      : [通用]);
    for (const [名, fn] of Object.entries(STAT_EVENTS)) {
      for (const d of 细节们(名)) {
        const 账 = emptyStats();
        const 初 = emptyStats();
        // **跑两遍**：有些记账是"第二次才置位" —— 'dungeon-cleared' 的再探标记
        // （`dungeonRerun`）只有同一座再清一次才成立。跑一遍的话那一格永远看不到它变。
        fn(账, d);
        fn(账, d);
        for (const [k, v] of Object.entries(账)) {
          const 初值 = 初[k];
          const 变了 = v instanceof Set ? v.size > (初值?.size ?? 0)
            : v !== null && typeof v === 'object' ? JSON.stringify(v) !== JSON.stringify(初值)
              : v !== 初值;
          if (变了) 实跑.add(k);
        }
      }
    }
    const 扫 = questFactsWritten();
    const 漏 = [...扫].filter((k) => !实跑.has(k));
    expect(漏, `扫描说这些格有人写，实跑却没人写：${漏.join('、')}`).toEqual([]);
    const 多 = [...实跑].filter((k) => !扫.has(k));
    expect(多, `实跑写进了这些格，扫描却没看见：${多.join('、')}`).toEqual([]);
  });

  it('反向控制：读取不会被当成写入（`stats.hits` 里那个 `s` 不算数）', () => {
    // 判据读的是 `stats.<格>`，记账写的是 `s.<格>`。形参名不同 ⇒ 两套正则必须不同。
    // 若读取正则被写成 `s\.` 也能匹配 `stats.hits`，那么"读"与"写"就分不开了 ——
    // 一条只读不写的判据会被算成"有人写" ⇒ 闭包恒成立 ⇒ 这道门禁变成摆设。
    const 读 = questFactsRead();
    const 写 = questFactsWritten();
    // `hits` 确实两边都有（判据读它、'combat-hit' 写它），所以换一条**只读不写**的：
    // `objectiveDone` 读 `stats.dungeonRerun`，而只有 'dungeon-cleared' 写它 —— 两边都有。
    // 于是用一个更硬的判据：读取集里出现的每一格，其**写入来源**必须是一条真的记账函数。
    const 记账来源 = new Set();
    for (const fn of Object.values(STAT_EVENTS)) {
      const src = fn.toString();
      for (const m of src.matchAll(/(?<![\w$.])s\.([A-Za-z_$][\w$]*)/g)) 记账来源.add(m[1]);
    }
    for (const k of 读) {
      if (!写.has(k)) continue;                       // 闭包坏了的话另有规则管
      expect(
        记账来源.has(k) || Object.values(BOSS_STAT_KEYS).includes(k) || k === 'level' || k === 'mind',
        `读取集里的 "${k}" 在记账函数里找不到写入来源 —— 扫描把读取当成了写入`,
      ).toBe(true);
    }
  });
});
