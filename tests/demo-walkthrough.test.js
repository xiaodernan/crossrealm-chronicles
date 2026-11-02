/**
 * 演示步表的 **node 走查**：真 `QuestSystem` + 真 `PlayerStats` + 真事件总线（W-D4 切片9）。
 *
 * ## 这一片量的是哪一句话
 *
 * `npm run e2e` 那条真机轮次一次要九十秒上下，而它今天红在 `questIndex=2`（clear-r1）——
 * 病因是"演示的步表与主线表是两份真相"。步表现在由 `MAINLINE` 推导，但"推导出来的这份**走得到通关**"
 * 这件事仍需要一个读者。这一片就是那个读者，而且是**秒级**的：
 *
 * - 执行侧全是真件：`emit()` 走真的事件总线（名字不在 `GAME_EVENTS` 里会当场抛 —— 所以
 *   "演示发的每条事件名都合法"不是我自己声明的，是总线判的）；账由 `QuestSystem` 自己记
 *   （`applyStatEvent`），进度由它自己算（`syncProgress` → `advance` → 章节门 → `game-completed`）。
 * - 走查只做演示该做的那件事：**把这一步的那几件事发出去**，然后看任务系统有没有往前走。
 * - 每步执行前核对 `qs.current.id === 步.rowId`：这一条把"步表的序列"与"真判据算出的序列"钉成同一条。
 *   7e/8a 那条"五处分支路各走一遍"的尾巴从此不用等真机轮次。
 *
 * ## 口径
 *
 * 1. **两条抉择路各走一遍**（`choiceOf` 全取第一条 / 全取第二条），两遍都要走到通关。
 *    一条只有默认路能过的表，等于四条分支路没人看过。
 * 2. **反向控制**：抽掉一步、把事件换成另一件真事件（记到别的格上）、摘掉 producer ——
 *    三种破坏都要**卡在那一行**并点名被破坏的那一步（#36）；每条都带"不破坏时是过的"那半边，
 *    否则"卡住"可能只是这一行本来就过不去。两个**已知限度**各自钉在腿上，不装成能抓：
 *    抽掉*最后*一步之后没有下一步来核对落点（那条改问 `completed` 与停在哪儿，并拿"抽倒数
 *    第二步"证明这个钩子不是永远空）；"裸赋值不推快照"也卡不住读数行 —— 装备那一步自己会推
 *    一份快照，把读数字段捎进账本（真读数 probe 量到的），所以那一问缩成最小一段：
 *    **账本只认快照，判据只读账本**。
 * 3. **执行侧的接线**用文本核对（`QuestAssistant` 逐条 `emit`、不再直接写账本；
 *    `PlayerAutoPlay` 认 `step.bossId` 而不是第二个 `action` 字段）—— 行为那半归真机轮次。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installWindowShim } from './helpers/enemyHarness.js';
import { emit } from '../src/engine/EventBus.js';
import { MAINLINE, MAINLINE_BY_ID, STAT_EVENTS, emptyStats, objectiveDone } from '../src/content/objectives.js';
import { rollGear } from '../src/content/gear.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { PlayerStats } from '../src/game/PlayerStats.js';
import { buildDemoSteps } from '../src/ui/demoSteps.js';

const 读源 = (rel) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const 去注释 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** 固定的 gear 骰（理由见 `QuestAssistant` 里 `DEMO_ROLL` 那段：演示不许是随机数的读者） */
const 恒中 = () => 0.5;

/**
 * 把一张步表喂给真的任务系统走一遍。
 *
 * `破坏` 是反向控制用的钩子（对步表做一次改写）。每次走查都重装一次 window
 * （`installWindowShim` 里的 handler 表是新的）：否则上一遍那个 `QuestSystem` 还在听同一条总线，
 * 两遍的账会互相串 —— 而串了的账看起来"更通"，是最难查的一种绿。
 */
function 走一遍(选项 = {}, 破坏 = null) {
  installWindowShim();
  const 喊 = [];
  const qs = new QuestSystem({ toast: (m) => 喊.push(m), play: () => {} });
  const stats = new PlayerStats();
  qs.game = { stats };
  const 步表 = 破坏 ? 破坏(buildDemoSteps(选项)) : buildDemoSteps(选项);

  const 卡 = [];
  步表.forEach((步, n) => {
    const 当前 = qs.current?.id;
    if (当前 !== 步.rowId) {
      卡.push(`第 ${n + 1} 步要走到 "${步.rowId}"，真任务系统停在 "${当前}"（第 ${qs.questIndex} 格）`);
    }
    for (const 事件 of 步.events) emit(事件.name, 事件.detail);
    const 生产 = 步.producer;
    if (生产?.kind === 'level') { stats.level = 生产.value; stats.pushToConsumers(); }
    if (生产?.kind === 'mind') { stats.mind = 生产.value; stats.pushToConsumers(); }
    if (生产?.kind === 'gear') stats.equip(生产.slot, rollGear(恒中, 'default'));
    qs.syncProgress();
  });
  return { 步表, 卡, qs, stats, 喊 };
}

/** 把某一型的步改成"发另一件真事件"：账记到别的格上，判据读的那一格不动 */
const 换事件 = (型, 新名) => (步表) => 步表.map((s) => (s.type === 型
  ? { ...s, events: s.events.map((e) => ({ name: 新名, detail: undefined })) }
  : s));

describe('① 默认那条路：每一步都对得上，走完就是通关', () => {
  let 跑;
  beforeEach(() => { 跑 = 走一遍(); });

  it('每一步的落点都与真任务系统算出的那一格对上（零对不上）', () => {
    expect(跑.卡.join('\n'), '演示与主线表脱节').toBe('');
  });

  it('走完落在表尾：questIndex == 表长、completed 为真、章号不是第 1 章', () => {
    expect(跑.qs.questIndex, `停在第 ${跑.qs.questIndex} 格，表长 ${MAINLINE.length}`).toBe(MAINLINE.length);
    expect(跑.qs.completed, `卡住的那一步：${跑.卡[0] ?? '(没有对不上，是真没通关)'}`).toBe(true);
    expect(跑.qs.chapter).toBeGreaterThan(1);
  });

  it('账本每一格都对得上表：副本一座不少、发现一行不漏、NPC 一个不谈漏、抉择五枚', () => {
    const s = 跑.qs.stats;
    // 只核**这条路真走到的行**：岔口另一边的行（今天如 `first-camp`）默认那条永远不会经过，
    // 账本里没有它不是漏 —— 拿全表来要账，等于要求演示把两条路同时走完。
    const 走到 = new Set(跑.步表.map((st) => st.rowId));
    const 本路 = (型) => MAINLINE.filter((r) => r.type === 型 && 走到.has(r.id));
    const 副本行 = 本路('dungeon');
    expect(副本行.length, '这条路上一个副本都没有：这一条在读空集').toBeGreaterThan(0);
    for (const r of 副本行) expect(s.dungeonsCleared.has(r.dungeonId), `那座 "${r.dungeonId}" 没清`).toBe(true);
    expect(s.dungeonsCleared.size).toBe(副本行.length);
    for (const r of 本路('discovery')) {
      expect(s.discoveries.has(r.targetId), `那处发现 "${r.targetId}" 没记账`).toBe(true);
    }
    for (const r of 本路('npc')) {
      expect(s.npcTalked.has(r.targetId), `那位 NPC "${r.targetId}" 没谈过`).toBe(true);
    }
    for (const r of 本路('kills')) {
      expect(s.kills[r.enemyType] ?? 0, `${r.enemyType} 的击杀数不到 ${r.target}`).toBeGreaterThanOrEqual(r.target);
    }
    for (const r of 本路('choice')) {
      expect(s.decisions.has(r.choices[0].flag), `抉择 "${r.id}" 选了 "${r.choices[0].flag}" 却没记进账`).toBe(true);
    }
    expect(s.dungeonRerun, '再探那一格没成立：两次清空同一座没走通').toBe(true);
  });

  it('三型读数由生产者推进到行上写的那个值', () => {
    for (const 格 of ['level', 'mind']) {
      const r = MAINLINE.find((x) => x.type === 格);
      expect(跑.qs.stats[格], `${格} 没被生产者推到 ${r.target}`).toBe(r.target);
    }
    for (const r of MAINLINE.filter((x) => x.type === 'gear')) {
      expect(跑.qs.stats.gearSlots, `槽位 "${r.gearSlot}" 没穿上`).toContain(r.gearSlot);
    }
  });

  it('完成提示真的喊过（推进经过的是真回报路径，不是只把 index 挪了）', () => {
    const 喊过 = 跑.喊.filter((句) => /完成/.test(句)).length;
    expect(喊过, `整场只喊了 ${喊过} 条完成提示`).toBeGreaterThanOrEqual(跑.步表.length - 12);
  });
});

describe('② 另一条路：五处抉择全取第二条，也要走到通关', () => {
  it('同样零对不上、同样通关（分支不是只有默认那条被看过）', () => {
    const 跑 = 走一遍({ choiceOf: (r) => r.choices?.[1]?.flag ?? null });
    expect(跑.卡.join('\n'), '全取第二条时演示与主线表脱节').toBe('');
    expect(跑.qs.questIndex).toBe(MAINLINE.length);
    expect(跑.qs.completed).toBe(true);
    for (const r of MAINLINE.filter((x) => x.type === 'choice')) {
      expect(跑.qs.stats.decisions.has(r.choices[1].flag), `${r.id} 没走到第二条上`).toBe(true);
    }
  });

  it('两遍步数相同（岔口是"换一行"而不是"少走一行"）', () => {
    const 甲 = 走一遍();
    const 乙 = 走一遍({ choiceOf: (r) => r.choices?.[1]?.flag ?? null });
    expect(乙.步表.length).toBe(甲.步表.length);
    expect(乙.qs.chapter).toBe(甲.qs.chapter);
  });
});

describe('③ 反向控制：链断在哪，就卡在哪一行并点名', () => {
  const 抽掉 = (n) => (步表) => 步表.filter((_, i) => i !== n);
  const 第几步 = (步表, 型) => 步表.findIndex((s) => s.type === 型);

  it('抽掉副本那一步 ⇒ 卡在那一行、completed 为假（不是"少做一步却照样通关"）', () => {
    const 表 = buildDemoSteps();
    const n = 第几步(表, 'dungeon');
    const 目标 = 表[n].rowId;
    const 跑 = 走一遍({}, 抽掉(n));
    expect(跑.qs.completed, `抽掉 "${目标}" 居然还通关 —— 这条走查没在读账本`).toBe(false);
    expect(跑.qs.current?.id, `没卡在被抽掉那一行，而是停在 "${跑.qs.current?.id}"`).toBe(目标);
    expect(跑.卡.length, '落点核对没抓到这一步对不上').toBeGreaterThan(0);
    // #36 的另半边：同一张表不抽的时候是过的（"卡住"不是这一行本来就过不去）
    expect(走一遍().qs.completed).toBe(true);
  });

  it('Boss 那一步改发一件**真事件**（combat-hit）⇒ 记到别的格上，卡在第一位 Boss', () => {
    const 首只 = buildDemoSteps().find((s) => s.type === 'boss').rowId;
    const 跑 = 走一遍({}, 换事件('boss', 'combat-hit'));
    expect(跑.qs.current?.id, `改发别的事件还能过 —— ${首只} 那一格的判据没在读 Boss 旗标`).toBe(首只);
    expect(STAT_EVENTS['combat-hit'], '这半边是空的：combat-hit 早不在记账表里了').toBeTruthy();
    expect(跑.qs.completed).toBe(false);
  });

  it('摘掉 level 那一步的 producer ⇒ 卡在等级那一行（读数不能靠别的东西蒙）', () => {
    const 摘 = (步表) => 步表.map((s) => (s.type === 'level' ? { ...s, producer: null } : s));
    const 跑 = 走一遍({}, 摘);
    const 行 = MAINLINE.find((r) => r.type === 'level');
    expect(跑.qs.current?.id, `摘掉生产者却没卡在 "${行.id}"`).toBe(行.id);
    expect(跑.qs.completed).toBe(false);
    expect(走一遍().qs.completed, '对照半边空了：正常路径本来就没过').toBe(true);
  });

  it('读数那一格只认生产者推出来的快照：裸赋值任务系统看不见，推一把才看见', () => {
    // 真机走查量到过一件事：`stats.equip()` 自己会推一份快照，所以"裸赋值 ⇒ 卡在读数行"
    // 那条前提是假的（装备步在前，读数的字段早被别人的快照捎进账本了）。
    // 这一条因此改问**最小那一段**：判据读的是账本里那一格，账本只由 `stats-changed` 填 ——
    // 于是"赋值"与"赋值+推快照"两种走法，账本一个不动、一个到位。
    installWindowShim();
    const qs = new QuestSystem({ toast: () => {}, play: () => {} });
    const stats = new PlayerStats();
    qs.game = { stats };
    const 读数行 = MAINLINE.filter((r) => ['level', 'mind'].includes(r.type));
    expect(读数行.length, '主线今天没有 level/mind 行：这一条在读空集').toBeGreaterThan(0);
    for (const r of 读数行) {
      const 底 = emptyStats()[r.type];
      expect(r.target, `"${r.id}" 的目标值等于账本初值 ${底}：前后对照失去意义`).not.toBe(底);
      stats[r.type] = r.target;
      qs.syncProgress();
      expect(qs.stats[r.type], `"${r.id}"：裸赋值没推快照就进了账本 —— 那 pushToConsumers 没有读者`)
        .toBe(底);
      expect(objectiveDone(r, qs.stats), `"${r.id}"：账本没变，判据却过了`).toBe(false);
      stats.pushToConsumers();
      qs.syncProgress();
      expect(qs.stats[r.type], `"${r.id}"：推了快照账本里还是 ${底}（生产者那条链断了）`).toBe(r.target);
      expect(objectiveDone(r, qs.stats), `"${r.id}"：账本到位，判据还是没过`).toBe(true);
    }
  });

  it('抽掉最后一步 ⇒ 走完的落点核对抓住"没到表尾"，且 completed 为假', () => {
    // 已知限度（真读数 probe 量到的）：抽掉**最后**那一步，后面再没有一步去核对落点，
    // `卡` 因此是空的 —— "卡在哪一行"这条尺照不到尾巴上那一格。所以这一条不装能，
    // 改核两件真事：任务系统停在被删的那一行，且没通关。
    const 表 = buildDemoSteps();
    const 尾 = 表[表.length - 1];
    const 跑 = 走一遍({}, 抽掉(表.length - 1));
    expect(跑.qs.completed, `抽掉最后一步 "${尾.rowId}" 居然还通关`).toBe(false);
    expect(跑.qs.current?.id, `没停在被抽掉的最后一步，而是 "${跑.qs.current?.id}"`).toBe(尾.rowId);
    // 尺子是活的：倒数第二步被抽掉时 `卡` 抓得到（同一钩子换个位置，不是永远空）
    expect(走一遍({}, 抽掉(表.length - 2)).卡.length, '抽倒数第二步也没抓到：这个钩子是假的').toBeGreaterThan(0);
  });

  it('每一行都真被走到过：MAINLINE 里除门控外没有一格是"跳过去的"', () => {
    const 跑 = 走一遍();
    const 走过 = new Set(跑.步表.map((s) => s.rowId));
    for (const id of 走过) expect(MAINLINE_BY_ID.get(id), `步表里有 "${id}" 这一行不在主线上`).toBeTruthy();
    expect(跑.qs.questIndex).toBe(MAINLINE.length);
  });
});

describe('④ 执行侧的接线（文本核对，行为那半归真机轮次）', () => {
  const 助手 = () => 去注释(读源('src/ui/QuestAssistant.js'));
  const 机器人 = () => 去注释(读源('src/player/PlayerAutoPlay.js'));

  it('两个入口都用同一张推导步表，手抄的步表字面量绝迹', () => {
    const s = 助手();
    expect(s).toMatch(/from '\.\/demoSteps\.js'/);
    expect((s.match(/buildDemoSteps\(/g) ?? []).length, '两个入口里有一个还在用自己的表').toBeGreaterThanOrEqual(2);
    const 手抄尺 = /action:\s*'(tp|poi|hits|kills|boss|discover|chests|npc|dungeons|level|mind|spells|charged|skills|dungeon-rerun|gear|choice)'/;
    expect(手抄尺.test(s), '手抄的步表字面量又长回来了').toBe(false);
    // 尺子是活的：动手之前那份就是这种形状
    expect(手抄尺.test("      { label: 'demo_step_anchor', action: 'tp', x: 0, z: 55 }")).toBe(true);
  });

  it('执行器只发事件与调生产者：那五种"直接写账本"的旧拼法绝迹（逐把尺自带活口）', () => {
    const 旧 = [
      { 尺: /stats\.kills\[[^\]]+\]\s*=/, 字节: 'qs.stats.kills[step.type] = (qs.stats.kills[step.type] || 0) + (step.count ?? 1);' },
      { 尺: /stats\.chestsOpened\s*=\s*Math\.max/, 字节: 'qs.stats.chestsOpened = Math.max(qs.stats.chestsOpened, step.count ?? 5);' },
      { 尺: /stats\.skillsUnlocked\s*=\s*Math\.max/, 字节: 'qs.stats.skillsUnlocked = Math.max(qs.stats.skillsUnlocked, step.count ?? 3);' },
      { 尺: /stats\[step\.key\]\s*=\s*true/, 字节: 'qs.stats[step.key] = true;' },
      { 尺: /stats\.dungeonRerun\s*=\s*true/, 字节: 'qs.stats.dungeonRerun = true;' },
    ];
    const s = 助手();
    for (const { 尺, 字节 } of 旧) {
      expect(尺.test(字节), `这把尺连自己的旧字节都量不到，那条"绝迹"是空的：${字节}`).toBe(true);
      expect(尺.test(s), `直接写账本的旧拼法又回来了：${字节}`).toBe(false);
    }
    expect(s).toMatch(/emit\(事件\.name/);
    expect(s).toMatch(/pushToConsumers\(\)/);
    expect(s).toMatch(/stats\.equip\(/);
  });

  it('机器人认 step.bossId 那一格，不认第二个 action 字段（同一件事只准说一遍）', () => {
    expect(机器人()).toMatch(/if \(step\.bossId\)/);
    expect(/step\.action === 'boss'/.test(机器人()), '又给 Boss 步另写了一个 action 标记').toBe(false);
  });

  it('步表那一侧不 import 任何 UI/游戏对象（它必须能在 node 里被这条门禁直接跑）', () => {
    const s = 读源('src/ui/demoSteps.js');
    const 引 = [...s.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    for (const p of 引) {
      expect(p, `演示步表读了 ${p}：那条依赖会让它在 node 里起不来`).not.toMatch(/three|Game\.js|EventBus|i18n/);
    }
    expect(引.sort()).toEqual(['../content/objectives.js'].sort());
  });
});
