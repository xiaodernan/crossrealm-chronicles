/**
 * 演示 / 自动通关的步表：**由主线表推导**出来的那一份仍然说同一件事（W-D4 切片9）。
 *
 * ## 为什么要有这道门禁
 *
 * `npm run e2e` 上一次真跑是 2026-10-22（那时主线 33 行、能通关）；十几天后主线长到 79 行，
 * 而演示那侧还是手抄的 44 步。clear-r1（2026-11-03）红在 `questIndex=2`：第 3 行
 * `hub-catacombs` 是 `type:'dungeon'`，演示那一步派发的却是 `TRIAL_DUNGEON_IDS` 那三座 ——
 * 账本永远缺那一格。**手抄表的病不是"少写了几行"，而是少写几行时没有任何一处会红。**
 *
 * 现在步表从 `MAINLINE` 推出来，这一片逐条钉住推导本身：
 *
 * ① 名册对账：主线每一型都要有一个合成器（`UNSYNTHESIZED_TYPES` 那几型除外），两个方向都比 ——
 *    少一型会在 `buildDemoSteps()` 当场抛，多一桩是没人读的僵尸合成器。
 * ② 事件名册：交出去的每个事件名既在 `STAT_EVENTS` 里（记得到账），又在 `GAME_EVENTS` 里
 *    （`emit()` 不会抛）。
 * ③ 记账链在役（这一条最值钱）：拿 `applyStatEvent` 把**这一步自己的那几件事**记进一份干净账本，
 *    前后各问一次 `objectiveDone` —— 没过 → 过了。三族被点名排除并各有自己的腿：门控 `interact` 行
 *    （推进它的是条件成立那一刻的交互）、三型**读数**（`level` / `mind` / `gear`，那一格只有真生产者
 *    发得出，演示给它 `producer` 而不是赋值）、`dungeon-rerun`（判据要的是"同一座第二次"）。
 * ④ 两条抉择路：默认那条与"全取第二条"那条合起来把主线**一行不漏**走完，各自不重复。
 * ⑤ 文案：标签 = 行自己的标题格（有 `titleByChoice` 的那几行跟着这条路念，两路不同名）；
 *    双表都译得出（不回落键名、`${}` 不残留、英文零中文）；旧的 `demo_step_*` 那一族除
 *    POI `magic-castle` 的名字以外绝迹。
 * ⑥ 坐标：每个落点等于 `rowWaypoint` / `dungeonWaypoint` 说的那一个，且 `demoSteps.js` 源码里
 *    **一个坐标字面量都没有**。
 * ⑦ 反向控制：缺合成器、`choiceOf` 交不回旗标、事件名打错 —— 三种坏形状都要当场说话，
 *    并且每条都自带"替换真的发生了"那半边（#36）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_EVENTS } from '../src/engine/events.js';
import { setLanguage, t } from '../src/engine/i18n.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { DUNGEON_DEFS, dungeonDefOf } from '../src/content/dungeons.js';
import {
  MAINLINE, MAINLINE_BY_ID, OBJECTIVES, OBJECTIVE_TYPES, STAT_EVENTS, STAT_READINGS,
  applyObjectiveFlags, applyStatEvent, dungeonWaypoint, emptyStats, interactGateCondition,
  objectiveDone, rowWaypoint,
} from '../src/content/objectives.js';
import { ROW_SYNTHESIZERS, UNSYNTHESIZED_TYPES, buildDemoSteps } from '../src/ui/demoSteps.js';

const 读源 = (rel) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const 去注释 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const 抓错 = (fn) => { try { fn(); return null; } catch (e) { return e; } };

/** 三型**读数**：账本里那一格由 `PlayerStats` 推出来，事件写不了，演示只准交 producer */
const 读数型 = ['level', 'mind', 'gear'];

/** 两条路各拿一遍，并集按 rowId 去重（默认那条先到先得） */
const 默认 = buildDemoSteps();
const 第二条路 = buildDemoSteps({ choiceOf: (r) => r.choices?.[1]?.flag ?? null });
const 全步 = new Map();
for (const s of [...默认, ...第二条路]) if (!全步.has(s.rowId)) 全步.set(s.rowId, s);

describe('① 名册对账：主线每一型都有一个合成器', () => {
  it('合成器名册 ∪ 不合成清单 == OBJECTIVE_TYPES（两个方向都比）', () => {
    const 认识 = [...Object.keys(ROW_SYNTHESIZERS), ...UNSYNTHESIZED_TYPES].sort();
    const 缺 = OBJECTIVE_TYPES.filter((型) => !认识.includes(型));
    const 多 = 认识.filter((型) => !OBJECTIVE_TYPES.includes(型));
    expect(缺, `主线这几型没人合成，表里加一行就当场抛：${缺.join('、')}`).toEqual([]);
    expect(多, `这几个合成器对应的型已不在名册里（僵尸桩，没人会来删）：${多.join('、')}`).toEqual([]);
  });

  it('不合成清单只有门控那一型，而门控行确实不在 MAINLINE 里', () => {
    expect(UNSYNTHESIZED_TYPES).toEqual(['chapter-gate']);
    expect(OBJECTIVE_TYPES).toContain('chapter-gate');
    expect(MAINLINE.filter((r) => UNSYNTHESIZED_TYPES.includes(r.type))).toEqual([]);
    // 尺子是活的：大表里确实有门控行（`MAINLINE` 是它的投影），否则上面那条在读空集
    expect(OBJECTIVES.filter((r) => r.type === 'chapter-gate').length).toBeGreaterThan(0);
  });

  it('在役主线上出现过的每一型都真有实例（名册里不许养一型没人走的步）', () => {
    const 用过的 = new Set(MAINLINE.map((r) => r.type));
    const 没用到 = OBJECTIVE_TYPES.filter((型) => 型 !== 'chapter-gate' && !用过的.has(型));
    expect(没用到, `这几型在 MAINLINE 里没有实例：${没用到.join('、')}`).toEqual([]);
  });
});

describe('② 事件名册：既在记账表里，也在事件总线的名册里', () => {
  it('交出去的每一个事件名都在 STAT_EVENTS 与 GAME_EVENTS 里', () => {
    const 用到的名 = new Set();
    for (const s of 默认) for (const e of s.events) 用到的名.add(e.name);
    const 不在记账 = [...用到的名].filter((n) => !(n in STAT_EVENTS));
    expect(不在记账.join('、'), `这些事件名没人记账（演示发了等于没发）`).toBe('');
    const 不在总线 = [...用到的名].filter((n) => !(n in GAME_EVENTS));
    expect(不在总线.join('、'), '这些事件名 emit() 会当场抛').toBe('');
    expect(用到的名.size, '一个事件名都没用到，上面两条是在读空集').toBeGreaterThan(5);
    // 尺子是活的：编一个名字，两册都该说没有
    expect('demo-fake-event' in STAT_EVENTS).toBe(false);
    expect('demo-fake-event' in GAME_EVENTS).toBe(false);
    expect(Object.keys(GAME_EVENTS).length, 'GAME_EVENTS 空了：上面那条"在总线名册里"是在读空集').toBeGreaterThan(20);
  });

  it('producer 步不交事件，其余每步至少做一件事（不许有"什么都没做也算走了一步"）', () => {
    for (const s of 默认) {
      if (s.producer) expect(s.events, `${s.rowId} 既交 producer 又交事件`).toEqual([]);
      else expect(s.events.length, `${s.rowId}（${s.type}）这一步里一件事也没做`).toBeGreaterThan(0);
    }
    // 哪些步该交 producer 由表说了算（今天有 4 步：`gear` 那一型主线里就有两行），
    // 所以不比"型清单"，比"行 id 清单" —— 表加一行读数，这一条自己跟着变。
    expect(默认.filter((s) => s.producer).map((s) => s.rowId).sort())
      .toEqual(默认.filter((s) => 读数型.includes(s.type)).map((s) => s.rowId).sort());
    expect(默认.filter((s) => s.producer).length, '一个 producer 步也没有：上面三条是在读空集').toBeGreaterThan(0);
  });
});

describe('③ 记账链在役：事件记进账本，判据从"没过"变成"过了"', () => {
  /**
   * 逐行取它自己那一步的事件，记进一份干净的账本，前后各问一次 `objectiveDone`。
   * 前置旗标按表序点亮（与 `advance()` 同一句 `applyObjectiveFlags`）：有些行的 `requires`
   * 指的就是前头某一步点亮的格子。
   *
   * 三族进不了这个"一步一行"的孤立核：门控 `interact` 行（推进它的是条件成立那一刻的交互，
   * 账本判不了）、三型读数（只有真生产者发得出，见 ③b）、`dungeon-rerun`（判据是"同一座第二次"，
   * 孤立的一步必然不是第二次 —— 它由下面那条单独钉）。
   */
  const 排除 = (row) => {
    if (interactGateCondition(row)) return '门控行';
    if (读数型.includes(row.type)) return '读数行';
    if (row.type === 'dungeon-rerun') return '再探行';
    return null;
  };

  it('除门控、读数、再探三族外，每一行都能被自己那一步做完', () => {
    const 坏 = [];
    const 跳过 = [];
    let 检查 = 0;
    MAINLINE.forEach((row) => {
      if (排除(row)) { 跳过.push(row.id); return; }
      const 步 = 全步.get(row.id);
      if (!步) { 坏.push(`${row.id}：两条路都走不到这一行`); return; }
      const stats = emptyStats();
      // 按**大表**（不是 MAINLINE 投影）点灯：门控行也在 `OBJECTIVES` 里，而有些行的
      // `requires` 指的正是门那一跨点亮的格子（`chaos-core` 要 `chapter4Done`，只有
      // `ch4-complete` 这一跨给得出）—— 只重放主线就把它永远挡在门外。
      OBJECTIVES.slice(0, OBJECTIVES.indexOf(row)).forEach((r) => applyObjectiveFlags(stats, r));
      const 前 = objectiveDone(row, stats);
      for (const e of 步.events) applyStatEvent(stats, e.name, e.detail);
      const 后 = objectiveDone(row, stats);
      检查++;
      if (前) 坏.push(`${row.id}：一件事没做就已经算完成了（判据踩空）`);
      if (!后) 坏.push(`${row.id}（${row.type}）：记完自己那 ${步.events.length} 条事件，判据还是没过`);
    });
    expect(坏.join('\n')).toBe('');
    expect(检查, `只核了 ${检查} 行，主线有 ${MAINLINE.length} 行 —— 排除的那 ${跳过.length} 行要数得过来`)
      .toBeGreaterThan(MAINLINE.length - 12);
    // 被排除的三族各自有明确身份（不是"随便哪一行都能被排除"）
    const 该排除 = MAINLINE.filter((r) => 排除(r)).map((r) => r.id);
    expect(跳过).toEqual(该排除);
    expect(该排除.length, '一个都没排除：那上面那条"排除"是我编的').toBeGreaterThan(0);
  });

  it('再探那一行要的是"同一座第二次"：一次不算，两次才算（合成器挑的正是已清过的那座）', () => {
    const 行 = MAINLINE.find((r) => r.type === 'dungeon-rerun');
    const 步 = 全步.get(行.id);
    const 那座 = 步.events[0].detail.id;
    const stats = emptyStats();
    applyStatEvent(stats, 'dungeon-cleared', { id: 那座 });
    expect(objectiveDone(行, stats), '第一次清空就成了"再探" —— 判据读的不是次数').toBe(false);
    applyStatEvent(stats, 'dungeon-cleared', { id: 那座 });
    expect(objectiveDone(行, stats)).toBe(true);
    // 那座必须在主线真清过（否则第二次永远不会发生，这一行就成了一步死棋）
    const 主线清的 = MAINLINE.filter((r) => r.type === 'dungeon').map((r) => r.dungeonId);
    expect(主线清的, `再探指的 "${那座}" 根本没被主线清过 —— 第二次永远不会来`).toContain(那座);
  });

  it('三型读数走 producer 不走事件：赋值进账本就是造一份生产者永远不会发的快照', () => {
    // 条数由表说了算（今天 `gear` 一型主线里就有两行，两条路合起来共 4 步）：
    // 钉死数字等于给下一次加行埋一个假红，所以比"主线读数行数 == 步表读数步数"。
    const 读数行 = MAINLINE.filter((r) => 读数型.includes(r.type));
    const 步表 = [...全步.values()].filter((s) => 读数型.includes(s.type));
    expect(读数行.length, '今天没有读数行：这一条在读空集').toBeGreaterThan(0);
    expect(步表.map((s) => s.rowId).sort(), '步表给的读数步对不上主线读数行')
      .toEqual(读数行.map((r) => r.id).sort());
    const 对应格 = { level: 'level', mind: 'mind', gear: 'gearSlots' };
    for (const s of 步表) {
      expect(s.producer.kind).toBe(s.type);
      expect(STAT_READINGS, `producer "${s.producer.kind}" 填的那一格不是读数，本该由事件记`).toContain(对应格[s.type]);
      expect(s.events, `${s.rowId} 给读数行配了事件 —— 那等于绕过真生产者写账`).toEqual([]);
    }
    // 反向：读数那几格在记账表里只有 `stats-changed` 一个写入者（生产者推快照），
    // 演示不许再发一条别的事件去凑 —— 字符串扫闭包，扫不到就把"有第二个写入者"这件事放过去
    for (const 格 of ['level', 'mind']) {
      const 写它 = Object.entries(STAT_EVENTS).filter(([, fn]) => new RegExp(`s\\.${格}\\s*=[^=]`).test(String(fn)));
      expect(写它.map(([n]) => n), `账本里 \`${格}\` 这一格有第二个写入事件，producer 就不是唯一路径`)
        .toEqual(['stats-changed']);
    }
  });

  it('重复的 rowId 一个都没有（分支跳转不许把同一行走两遍）', () => {
    for (const [名, 路] of [['默认', 默认], ['第二条路', 第二条路]]) {
      const 见过 = new Set();
      const 重复 = 路.filter((s) => (见过.has(s.rowId) ? true : (见过.add(s.rowId), false)));
      expect(重复.map((s) => s.rowId).join('、'), `${名} 里这些行被走了两遍`).toBe('');
    }
  });
});

describe('④ 两条抉择路合起来把整张表走完', () => {
  it('两路 rowId 的并集 == MAINLINE 全集（谁都没被漏掉）', () => {
    const 并集 = new Set([...默认, ...第二条路].map((s) => s.rowId));
    const 漏 = MAINLINE.map((r) => r.id).filter((id) => !并集.has(id));
    expect(漏.join('、'), '两条路都走不到这些行').toBe('');
    expect(并集.size).toBe(MAINLINE.length);
  });

  it('每一条各自都跳过了"没选的那条"，且跳过的正好是分支目标那一行', () => {
    const 甲 = new Set(默认.map((s) => s.rowId));
    const 乙 = new Set(第二条路.map((s) => s.rowId));
    const 只在甲 = MAINLINE.map((r) => r.id).filter((id) => 甲.has(id) && !乙.has(id));
    const 只在乙 = MAINLINE.map((r) => r.id).filter((id) => 乙.has(id) && !甲.has(id));
    expect(只在甲.length, '一条也没跳过任何行 —— `choiceOf` 没真的改变序列').toBeGreaterThan(0);
    expect(只在甲.length).toBe(只在乙.length);
    for (const id of [...只在甲, ...只在乙]) {
      const 被指着 = MAINLINE.some((r) => r.branch && Object.values(r.branch).includes(id));
      expect(被指着, `${id} 不在任何一处抉择的分支目标里，却出现在岔口上 —— 序列跳错了`).toBe(true);
    }
    // 岔口数 = 抉择处数：五处抉择就是五行 × 2
    const 抉择处 = MAINLINE.filter((r) => r.type === 'choice').length;
    expect(只在甲.length, '岔口行数与抉择处数不一致').toBe(抉择处);
  });

  it('步数不超过表长（绕圈的分支会在 buildDemoSteps 里自己抛，这里再钉一次上界）', () => {
    for (const [名, 路] of [['默认', 默认], ['第二条路', 第二条路]]) {
      expect(路.length, `${名} 走了 ${路.length} 步，比主线 ${MAINLINE.length} 行还长`).toBeLessThanOrEqual(MAINLINE.length);
    }
    expect(默认.length).toBe(第二条路.length);
  });
});

describe('⑤ 文案：标签就是这一步自己的标题', () => {
  it('每个标签都来自它那一行自己的标题格，双表都有这一键（两条路各自核一遍）', () => {
    for (const [名, 路] of [['默认', 默认], ['第二条路', 第二条路]]) {
      for (const s of 路) {
        const row = MAINLINE_BY_ID.get(s.rowId);
        expect(row.title, `${s.rowId} 这行没写标题`).toBeTruthy();
        const 候选 = [row.title, ...Object.values(row.titleByChoice ?? {})]
          .filter((键) => 键);
        expect(候选, `${名}：${s.rowId} 的标签不是它自己那一行的标题（也不是它的任何一个变体）`)
          .toContain(s.label);
        expect(STRINGS_ZH[s.label], `中文表没有这个标题键：${s.label}`).toBeTruthy();
        expect(STRINGS_EN[s.label], `英文表没有这个标题键：${s.label}`).toBeTruthy();
      }
    }
  });

  it('有两个名字的那几行：标签跟着这条路走，不是永远念 base', () => {
    // 真读数：`true-end`（封印 / 研习两个名字）与五处抉择行自己都有 `titleByChoice`。
    // 手抄表时代这一格是"某一种写法"，推导以后若忘了问抉择，演示会在玩家研习完虚空之后
    // 仍然念"封印虚空"—— 切片36 在显示侧修过的病，从步表这一侧回来。
    const 甲 = new Map(默认.map((s) => [s.rowId, s.label]));
    const 乙 = new Map(第二条路.map((s) => [s.rowId, s.label]));
    const 两条都走 = (r) => 甲.has(r.id) && 乙.has(r.id);
    const 变体行 = MAINLINE.filter((r) => r.titleByChoice
      && new Set(Object.values(r.titleByChoice)).size > 1 && 两条都走(r));
    expect(变体行.map((r) => r.id), '主线今天没有一行有两个名字：这一条在读空集').not.toEqual([]);
    const 没换 = 变体行.filter((r) => 甲.get(r.id) === 乙.get(r.id)).map((r) => r.id);
    expect(没换.join('、'), '这些行两条路念同一个名字 ⇒ 标签没问抉择').toBe('');
    // 反面（否则上面那条可能是恒绿：标签在乱变）：只有一个名字的行不许两路不同
    const 乱变 = MAINLINE.filter((r) => !r.titleByChoice && 两条都走(r))
      .filter((r) => 甲.get(r.id) !== 乙.get(r.id)).map((r) => r.id);
    expect(乱变.join('、'), '这些行只有一个名字，两条路却念出两个').toBe('');
  });

  it('中英两语都译得出来：不回落键名、`${}` 不残留、英文零中文', () => {
    const 含汉 = /[\u4e00-\u9fff]/;
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      for (const s of 默认) {
        const 文 = t(s.label);
        expect(文, `${lang}：${s.rowId} 的标签没译出来（读到的就是键名 "${s.label}"）`).not.toBe(s.label);
        expect(文.length, `${lang}：${s.rowId} 译成了空串`).toBeGreaterThan(0);
        expect(文, `${lang}：${s.rowId} 的译文留着没展开的插值`).not.toMatch(/\$\{|\{\w+\}/);
        if (lang === 'en') expect(文, `${s.rowId} 的英文标题夹中文`).not.toMatch(含汉);
      }
    }
    setLanguage('zh');
  });

  it('旧的 `demo_step_*` 那一族绝迹（只剩 POI magic-castle 的显示名，而它另有人读）', () => {
    expect(Object.keys(STRINGS_ZH).filter((k) => k.startsWith('demo_step_'))).toEqual(['demo_step_magic_castle']);
    expect(Object.keys(STRINGS_EN).filter((k) => k.startsWith('demo_step_'))).toEqual(['demo_step_magic_castle']);
    for (const f of ['src/ui/demoSteps.js', 'src/ui/QuestAssistant.js', 'src/player/PlayerAutoPlay.js']) {
      expect(去注释(读源(f)), `${f} 里还在引用演示自己那套文案键`).not.toMatch(/demo_step_(?!magic_castle)\w/);
    }
    expect(读源('src/world/zones/MagicZone.js')).toMatch(/demo_step_magic_castle/);
  });
});

describe('⑥ 坐标：一步去哪儿由表说，不在这里抄', () => {
  it('每一步都有落点，且落点等于 `rowWaypoint` / `dungeonWaypoint` 说的那一个', () => {
    for (const s of 默认) {
      expect(Number.isFinite(s.x) && Number.isFinite(s.z), `${s.rowId} 没有坐标（演示会原地转圈）`).toBe(true);
      const row = MAINLINE_BY_ID.get(s.rowId);
      const 表里的 = rowWaypoint(s.rowId) ?? (row.dungeonId ? dungeonWaypoint(row.dungeonId) : null);
      expect(表里的, `${s.rowId} 的坐标在表里查不到却出现在步表里 —— 那是抄的`).toBeTruthy();
      expect({ x: s.x, z: s.z }, `${s.rowId} 的落点与表里说的不是一个点`).toEqual({ x: 表里的.x, z: 表里的.z });
    }
  });

  it('副本行的落点就是那座副本的入口（`dungeonWaypoint` 读的是 `entrance`，不是第二份坐标）', () => {
    const 副本 = 默认.filter((s) => s.type === 'dungeon');
    expect(副本.length, '主线今天没有副本步：这一条在读空集').toBeGreaterThan(0);
    for (const s of 副本) {
      const id = s.events[0].detail.id;
      expect(DUNGEON_DEFS.some((d) => d.id === id), `演示清的那座 "${id}" 不在副本名册里`).toBe(true);
      const def = dungeonDefOf(id);
      expect({ x: s.x, z: s.z }, `${id} 的落点不在它的入口上`).toEqual({ x: def.entrance.x, z: def.entrance.z });
    }
  });

  it('demoSteps.js 的源码里一个坐标字面量都没有（口径 4 的机器版）', () => {
    const 尺 = /\b[xyz]:\s*-?\d/g;
    const 命中 = 去注释(读源('src/ui/demoSteps.js')).match(尺) ?? [];
    expect(命中.join(' / '), '这里开始自己写坐标了').toBe('');
    // 尺子是活的：同一把正则在那份手抄表的形状上量得到
    expect(尺.test("{ label: 'a', action: 'tp', x: -200, z: 0 }")).toBe(true);
  });
});

describe('⑦ 反向控制：坏形状要当场说话，还要点名', () => {
  it('缺一型合成器 ⇒ 抛，并点名是哪一型哪一行；装回去就不抛（#36：证明替换真的发生了）', () => {
    const 键 = 'chests';
    const 点名行 = MAINLINE.find((r) => r.type === 键);
    expect(点名行, `主线今天没有 "${键}" 这一型：摘它的合成器没人会看见`).toBeTruthy();
    const 原 = ROW_SYNTHESIZERS[键];
    try {
      delete ROW_SYNTHESIZERS[键];
      const 错 = 抓错(() => buildDemoSteps());
      expect(错, '少了 `chests` 这一型却没抛：表加一型时演示会静默少做一步').toBeTruthy();
      expect(错.message).toContain(键);
      expect(new RegExp(`第 \\d+ 行 "${点名行.id}"`).test(错.message), `抛话没点名是哪一行：${错.message}`).toBe(true);
      ROW_SYNTHESIZERS[键] = 原;
      expect(() => buildDemoSteps()).not.toThrow();
    } finally {
      ROW_SYNTHESIZERS[键] = 原;
    }
  });

  it('`choiceOf` 交不回旗标 ⇒ 抛，并点名那一处抉择行', () => {
    const 错 = 抓错(() => buildDemoSteps({ choiceOf: () => null }));
    expect(错, '抉择步没旗标也能生成 ⇒ 序列会按一条表上不存在的路走').toBeTruthy();
    expect(错.message).toMatch(/choice/);
  });

  it('事件名打错一个字母 ⇒ 记账说"不改任何计数"，判据还是没过（③ 不是碰巧绿的）', () => {
    const 步 = 全步.get('chests-all');
    expect(步, '找不到 chests-all 那一步：③ 的落脚点变了').toBeTruthy();
    const stats = emptyStats();
    const 记了 = 步.events.map((e) => applyStatEvent(stats, `${e.name}-typo`, e.detail));
    expect(记了.some(Boolean), '改成不存在的事件名竟然还记上了账 —— STAT_EVENTS 那道门是假的').toBe(false);
    expect(objectiveDone(MAINLINE_BY_ID.get('chests-all'), stats)).toBe(false);
    for (const e of 步.events) expect(applyStatEvent(stats, e.name, e.detail)).toBe(true);
    expect(objectiveDone(MAINLINE_BY_ID.get('chests-all'), stats)).toBe(true);
  });

  it('副本 id 指到名册外 ⇒ 判据卡住，而不是"清了一座不存在的副本"算完成', () => {
    const 步 = 默认.find((s) => s.type === 'dungeon');
    const stats = emptyStats();
    expect(applyStatEvent(stats, 'dungeon-cleared', { id: 'no-such-dungeon' })).toBe(true);
    expect(objectiveDone(MAINLINE_BY_ID.get(步.rowId), stats), '行上那座没清，判据却过了').toBe(false);
  });
});
