/**
 * 演示 / 自动通关的步表：**由主线表推导**，不再手抄（W-D4 切片9）。
 *
 * ## 它修的是什么
 *
 * `npm run e2e` 这条通关门禁上一次真跑是 2026-10-22，那时主线 33 步、走到通关；
 * 十几天后主线长到 78 行，而 `QuestAssistant._buildDemoSteps()` 还是那份手抄的 44 步 ——
 * 于是 clear-r1（2026-11-03）红在 `questIndex=2`：第 3 行 `hub-catacombs` 是 `type: 'dungeon'`，
 * 演示那一步 `dispatch` 的却是 `TRIAL_DUNGEON_IDS` 里那三座试炼副本，账本永远缺那一格。
 * **手抄表的病不是"少写了几行"，而是"少写了几行时没有任何一处会红"** —— 它不读表，
 * 所以表改了什么它不知道，症状只是主线安静地停在某一步。
 *
 * ## 口径
 *
 * 1. **一步 = 一行**，序由 `mainlineIndexAfter` 说（与 `QuestSystem.advance()` 同一条算式）：
 *    表里插一行、改一处 `branchTo`，步表跟着变，没有第二份序列需要人记着改。
 * 2. **效果一律写成事件**（名字都取自 `STAT_EVENTS` 那十格），记账只有 `applyStatEvent` 一份。
 *    改前这里是这四处最坏的样子：`qs.stats.kills[type] += n` / `qs.stats[step.key] = true` /
 *    `qs.stats.chestsOpened = Math.max(…)` / `qs.stats.skillsUnlocked = Math.max(…)` ——
 *    直接写账本绕过了记账表，于是"哪个事件改哪一格"改了而演示照旧通关（演示测的是赋值，不是链）。
 * 3. **三格例外，走真生产者**：`level` / `mind` / `gear` 那三型读的是 `PlayerStats` 推出来的
 *    **读数**（`STAT_READINGS`），赋值进账本就是造一个生产方永远不会发的快照。
 *    步表交 `producer`，浏览器与 node 两侧都调 `PlayerStats` 本身 ⇒ 事件从真源出来，
 *    两侧吃同一份账。
 * 4. **坐标不在这里抄**：一步去哪儿问 `rowWaypoint` / `dungeonWaypoint`（同一个 `getQuestWaypoint`
 *    的读法）。手抄表那 44 行里每行一份 x/z，是"这一步让你去哪儿"的第二套说法（B143 那一族）。
 * 5. **文案键 = 这一步自己的标题**（`objectiveTitle`）：HUD 那一格、日志、完成提示都读它，
 *    演示再开一套 `demo_step_*` 就是同一件事两份词汇（那 26 个键随本片一起删掉）。
 *
 * ## 抉择走哪条
 *
 * 默认 `choices[0]`，由调用方传 `choiceOf` 覆盖。这条参数不是装饰：`tests/demo-walkthrough.test.js`
 * 拿它把**五处抉择的两条路各走一遍**（全取第一条 / 全取第二条），于是"五条分支路走查"
 * 从一次 90 秒的真机轮次变成 3 秒的单测 —— 7e/8a 那条尾巴从此有机器读者。
 */

import {
  MAINLINE, objectiveTitle, rowWaypoint, dungeonWaypoint, mainlineIndexAfter,
} from '../content/objectives.js';

/** 重复 n 次（`target` 那一族：一刀 / 一片 / 一座各是一格事件，账上按条数记） */
const 重复 = (n, make) => Array.from({ length: n }, (_, k) => make(k));

/**
 * 再探那一格要挑**已经清过**的一座。行自己指着它（`waypoint.dungeonId`，`chests` / `dungeon-rerun`
 * 那一族"指一座副本"的写法）；万一没指，回落到主线上第一座副本行 —— 两条都是从表里取，
 * 不在这里写死 `ruin-crypt`。
 */
const 再探那座 = (row) => row.waypoint?.dungeonId
  ?? MAINLINE.find((r) => r.type === 'dungeon')?.dungeonId;

/**
 * 一型一桩"怎么把这一步做到"。
 *
 * 每一桩只准交 `STAT_EVENTS` 里登记过的事件名（`tests/demo-steps.test.js` 逐格核对名册），
 * 或者交一个 `producer`（真生产者档，见文件头口径 3）。缺一个合成器 = `buildDemoSteps`
 * 当场抛，而不是把那一行静默跳过去 —— 主线加一型时最坏的形状是"演示少做一步却照样通关"。
 */
export const ROW_SYNTHESIZERS = {
  // 带门控的那四格也是这一条：`poi-interact` 既记账又走 `QuestSystem._onInteract` 那道门，
  // 条件够不够由 `CONDITIONS` 自己说 —— 演示不许自己再推一遍"还缺哪几样"。
  interact: (row) => ({ events: [{ name: 'poi-interact', detail: { id: row.targetId } }] }),
  hits: (row) => ({ events: 重复(row.target, () => ({ name: 'combat-hit' })) }),
  kills: (row) => ({
    events: 重复(row.target, () => ({ name: 'enemy-defeated', detail: { type: row.enemyType, name: row.enemyType } })),
  }),
  discovery: (row) => ({ events: [{ name: 'discovery', detail: { id: row.targetId } }] }),
  boss: (row) => ({
    events: [{ name: 'enemy-defeated', detail: { type: 'boss', bossId: row.bossId, name: row.bossId } }],
  }),
  spells: (row) => ({ events: 重复(row.target, () => ({ name: 'spell-cast', detail: { charged: false } })) }),
  charged: (row) => ({ events: 重复(row.target, () => ({ name: 'spell-cast', detail: { charged: true } })) }),
  chests: (row) => ({ events: 重复(row.target, (k) => ({ name: 'chest-opened', detail: { id: `demo-${row.id}-${k + 1}` } })) }),
  npc: (row) => ({ events: [{ name: 'npc-talk', detail: { id: row.targetId } }] }),
  dungeon: (row) => ({ events: [{ name: 'dungeon-cleared', detail: { id: row.dungeonId } }] }),
  'dungeon-rerun': (row) => ({ events: [{ name: 'dungeon-cleared', detail: { id: 再探那座(row) } }] }),
  'skills-unlocked': (row) => ({
    events: 重复(row.target, (k) => ({ name: 'weapon-skill-unlocked', detail: { id: `demo-skill-${k + 1}` } })),
  }),
  choice: (row, 选路) => ({ events: [{ name: 'choice-made', detail: { flag: 选路(row) } }] }),
  level: (row) => ({ producer: { kind: 'level', value: row.target } }),
  mind: (row) => ({ producer: { kind: 'mind', value: row.target } }),
  gear: (row) => ({ producer: { kind: 'gear', slot: row.gearSlot } }),
};

/**
 * 主线每一型该由哪一桩合成器负责（`chapter-gate` 除外：门控行不在 `MAINLINE` 里，
 * 玩家没有可做的事，`advance()` 顺带跨过）。门禁拿它与 `OBJECTIVE_TYPES` 逐格对账。
 */
export const UNSYNTHESIZED_TYPES = ['chapter-gate'];

/**
 * 生成步表。
 *
 * @param {{ choiceOf?: (row: object) => string|null }} options
 *   `choiceOf` 决定每一处抉择走哪条（默认第一条）；它只影响**序列**，不影响判据 ——
 *   走哪条都是真表上写着的两条之一。
 * @returns {Array<{ rowId: string, type: string, label: string,
 *   x: number|null, z: number|null, bossId?: string,
 *   events: Array<{name: string, detail?: object}>, producer: object|null }>}
 */
export function buildDemoSteps(options = {}) {
  const 选路 = options.choiceOf ?? ((row) => row.choices?.[0]?.flag ?? null);
  const 已选 = new Set();          // 只喂 `mainlineIndexAfter` 读的那一格（decisions）
  const steps = [];
  let i = 0;
  while (i < MAINLINE.length) {
    const row = MAINLINE[i];
    const 合成 = ROW_SYNTHESIZERS[row.type];
    if (!合成) {
      throw new Error(`演示不认识这一型 "${row.type}"（第 ${i} 行 "${row.id}"）：`
        + '主线加一型，要同时给它一个合成器（否则这一行被静默跳过，演示照样"通关"却少做一步）');
    }
    if (row.type === 'choice') {
      const 旗标 = 选路(row);
      if (!旗标) throw new Error(`第 ${i} 行 "${row.id}" 是抉择步，但 choiceOf 没交回旗标`);
      已选.add(旗标);
    }
    const 效果 = 合成(row, 选路);
    const 路点 = rowWaypoint(row.id) ?? (row.dungeonId ? dungeonWaypoint(row.dungeonId) : null);
    const 标题 = objectiveTitle(row, { decisions: 已选 });
    if (!标题) throw new Error(`第 ${i} 行 "${row.id}" 没有标题键 ⇒ 演示这一步没有话说`);
    steps.push({
      rowId: row.id,
      type: row.type,
      label: 标题,
      // 这一张表**不交 desc**：`discovery` 负载里的那句正文由执行侧现问 `objectiveDesc(行, 账本)`
      // （抉择行的正文随玩家选的那条变，见 `choice-consequence` ② —— 在表里抄一份就成了第二份说法）。
      x: 路点?.x ?? null,
      z: 路点?.z ?? null,
      ...(row.bossId ? { bossId: row.bossId } : {}),
      events: 效果.events ?? [],
      producer: 效果.producer ?? null,
    });
    i = mainlineIndexAfter(row, { decisions: 已选 }, i);
    if (steps.length > MAINLINE.length) {
      throw new Error(`演示的步表绕圈了：走了 ${steps.length} 步却还没有走出 ${MAINLINE.length} 行的主线`);
    }
  }
  return steps;
}
