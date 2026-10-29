/**
 * 抉择的**后果**（W-E3 切片22）。
 *
 * ## 这一片补的是什么
 *
 * 抉择那一族（W-E3 切片18）只把"玩家选了哪条"**记下来** ——
 * 后面的内容完全不看它 ⇒ 抉择成了一句没兑现的话（玩家选封印还是研习，
 * 结局那句话一字不差）。
 *
 * ## 这一片要钉住的
 *
 * ① **一处算式**：`objectiveDesc(row, stats)` —— "这一步的文案键，
 *    若有随抉择而变的变体，按玩家**已经记下**的旗标取那一条"；
 * ② **显示侧都问它**：进度行 / 日志 / 自动通关三处**不许**各自去读 `row.desc`
 *    （那是四份各说各话的真相：改一处另几处不动时不报错，只是文案对不上）；
 * ③ **旗标是真的引用**：变体里的旗标名必须**有抉择步设过** ⇒
 *    注册表的不变式核它（否则这一格永远换不了文案，且没有任何报错）；
 * ④ **玩家的那一路真的被兑现**：选了封印与选了研习 ⇒ 同一行的文案不同。
 *
 * ## 切片36 补的第二层（同一处算式，三格名册）
 *
 * 切片22 只让**进度句**随抉择变；真结局的两个名字与两段结局日志建了格却没人读
 * （死键账本最后 4 枚）。现在 `descByChoice` / `titleByChoice` / `journalByChoice`
 * 三格共用一个查法，显示侧一律问它 —— 谁自己读 `q.title`，谁就可能在真结局那一步把名字说错。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAINLINE, objectiveDesc, objectiveJournalByChoice, objectiveRequiresMet, objectiveTitle,
  emptyStats, applyStatEvent,
} from '../src/content/objectives.js';
import { checkObjectiveTable } from '../src/content/registry.js';

const 有变体的行 = MAINLINE.filter((r) => r.descByChoice);
const 有标题变体的行 = MAINLINE.filter((r) => r.titleByChoice);
const 有日志变体的行 = MAINLINE.filter((r) => r.journalByChoice);
/** 三格名册：一处算式（`按抉择取`）服务的全部格子 */
const 变体格 = ['descByChoice', 'titleByChoice', 'journalByChoice'];

describe('① 一步算式：objectiveDesc', () => {
  it('表里确实有随抉择而变的那一格（口径没空转）', () => {
    expect(有变体的行.length, '表里没有一行带 descByChoice ⇒ 这一片没东西可测').toBeGreaterThan(0);
  });

  it('没做过相关抉择 ⇒ 回原样', () => {
    for (const row of 有变体的行) {
      expect(objectiveDesc(row, emptyStats()), `步 "${row.id}" 没抉择却换了文案`).toBe(row.desc);
    }
  });

  it('没有变体的那一步 ⇒ 回原样', () => {
    const 普通 = MAINLINE.find((r) => !r.descByChoice && r.desc);
    expect(objectiveDesc(普通, emptyStats())).toBe(普通.desc);
  });
});

describe('② 显示侧都问那处算式', () => {
  const 读 = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

  it('进度行 / 日志 / 自动通关都问 `objectiveDesc`（不许各自读 `row.desc`）', () => {
    for (const rel of ['src/game/QuestSystem.js', 'src/game/StoryJournal.js', 'src/ui/QuestAssistant.js']) {
      const s = 读(rel);
      expect(s, `${rel} 没有问那处算式`).toContain('objectiveDesc');
    }
  });

  it('六处显示侧都问 `objectiveTitle`（HUD 两格 / 日志 / 助手 / 指路 / 营火 / 完成提示）', () => {
    for (const rel of [
      'src/ui/HUD.js', 'src/game/StoryJournal.js', 'src/ui/QuestAssistant.js',
      'src/ui/GameGuidePanel.js', 'src/game/RestDialogue.js', 'src/game/QuestSystem.js',
    ]) {
      expect(读(rel), `${rel} 没有问标题那处算式`).toContain('objectiveTitle');
    }
  });

  it('`src/` 里没有第二处直接读主线行的 `desc`（那一格会各说各话）', () => {
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
    const 命中 = [];
    for (const f of walk(join(process.cwd(), 'src'))) {
      if (!f.endsWith('.js')) continue;
      const 相对 = f.slice(process.cwd().length + 1).replace(/\\/g, '/');
      // `content/objectives.js` 是**那一格的主人**（变体的查法就在它一处）⇒ 不扫它
      if (相对 === 'src/content/objectives.js') continue;
      const s = readFileSync(f, 'utf8');
      s.split(/\r?\n/).forEach((l, i) => {
        if (/^\s*(\*|\/\/)/.test(l)) return;
        // 主线行的 desc：q.desc / current.desc / row.desc / step.desc
        if (/\b(q|current|row|step)\??\.desc\b/.test(l)) {
          // 支线那一族有自己的 desc（SideQuestSystem / SideQuestJournalTab）⇒ 不算
          if (f.includes('SideQuest')) return;
          命中.push(`${相对}:${i + 1}: ${l.trim().slice(0, 90)}`);
        }
      });
    }
    expect(命中, '主线那一行的 desc 在别处被自己读了一遍 ⇒ 抉择的后果有两份说法').toEqual([]);
  });
});

describe('③ 旗标是真的引用（注册表核它确有抉择步设过）', () => {
  it('表里每一处变体（三格逐格）的旗标都有抉择步设过', () => {
    const 毛病 = checkObjectiveTable(MAINLINE).filter((s) => 变体格.some((g) => s.includes(g)));
    expect(毛病, '这些变体引用的旗标没有任何抉择步设过 ⇒ 这一格永远不会变').toEqual([]);
  });

  it('三格名册没有空转：标题 / 日志两格今天各有一行真写了', () => {
    expect(有标题变体的行.length, '没有一行带 titleByChoice ⇒ 标题那一格是摆设').toBeGreaterThan(0);
    expect(有日志变体的行.length, '没有一行带 journalByChoice ⇒ 日志那一格是摆设').toBeGreaterThan(0);
  });

  it('写一个不存在的旗标 ⇒ 注册表当场点名（控制组，三格各来一次）', () => {
    for (const [格, 键] of [
      ['descByChoice', 'obj_true_end_desc_sealed'],
      ['titleByChoice', 'obj_true_end_sealed_title'],
      ['journalByChoice', 'obj_true_end_sealed_journal'],
    ]) {
      const 假 = MAINLINE.map((r) => (r[格] ? { ...r, [格]: { ...r[格], choice_never_set: 键 } } : r));
      const 毛病 = checkObjectiveTable(假).filter((s) => s.includes(`${格}.choice_never_set`));
      expect(毛病.length, `${格} 里写了一个不存在的旗标却没人报错`).toBeGreaterThan(0);
    }
  });
});

describe('④ 玩家的那一路真的被兑现', () => {
  it('选了封印与选了研习 ⇒ 同一行的文案不同', () => {
    const row = 有变体的行[0];
    const 旗标们 = Object.keys(row.descByChoice);
    expect(旗标们.length, '这一格只写了一条变体').toBeGreaterThanOrEqual(2);

    const 文案们 = 旗标们.map((flag) => {
      const stats = emptyStats();
      applyStatEvent(stats, 'choice-made', { flag });
      return objectiveDesc(row, stats);
    });
    expect(new Set(文案们).size, '两条路给出的是同一句文案 ⇒ 抉择没有兑现').toBe(文案们.length);
    for (const 文案 of 文案们) expect(文案).toBeTruthy();
  });

  it('资格没齐也要兑现文案：`requires` 管完成，不管这句话怎么说（B155 的复现）', () => {
    const row = 有变体的行[0];
    // 只做过抉择、还没走到这一步 —— 正是切片25 那道 ON 的时候两边都回退成同一句的形状
    expect(Object.keys(row.requires ?? {}).length, '这一行没有 requires ⇒ 这条腿量不到「资格门」').toBeGreaterThan(0);
    expect(objectiveRequiresMet(row, emptyStats()), '夹具失效：没出门就已经够格了').toBe(false);
    for (const [旗标, 键] of Object.entries(row.descByChoice)) {
      const stats = emptyStats();
      applyStatEvent(stats, 'choice-made', { flag: 旗标 });
      expect(objectiveDesc(row, stats), `资格没齐时把「${旗标}」的文案收回去 ⇒ 报酬照付、话却不说`).toBe(键);
    }
  });

  it('控制组：同一行、资格齐了但还没抉择 ⇒ 仍是通用文案（别把变体全放出来）', () => {
    const row = 有变体的行[0];
    const stats = emptyStats();
    for (const [flag, want] of Object.entries(row.requires ?? {})) stats.objectiveFlags[flag] = want;
    expect(objectiveRequiresMet(row, stats), '控制组失效：夹具没把资格喂齐').toBe(true);
    expect(objectiveDesc(row, stats), '还没选就给变体 ⇒ 玩家读到的不是自己做的事').toBe(row.desc);
  });

  it('变体指向的文案键在两表里都登记（缺一个键 ⇒ 玩家看到 [MISSING: …]）', async () => {
    const { STRINGS_ZH, STRING_KEYS: ZH_KEYS } = await import('../src/content/strings.zh.js');
    const { STRING_KEYS: EN_KEYS } = await import('../src/content/strings.en.js');
    for (const row of 有变体的行) {
      for (const [旗标, 键] of Object.entries(row.descByChoice)) {
        expect(ZH_KEYS, `步 "${row.id}" 的变体（${旗标}）在中文表里没有 ${键}`).toContain(键);
        expect(EN_KEYS, `步 "${row.id}" 的变体（${旗标}）在英文表里没有 ${键}`).toContain(键);
        expect(STRINGS_ZH[键], `键 ${键} 在中文表里是空的`).toBeTruthy();
      }
    }
  });
});
describe('⑤ 标题与日志也分岔（W-E3 切片36）', () => {
  const 走 = (row, flag) => {
    const stats = emptyStats();
    applyStatEvent(stats, 'choice-made', { flag });
    return { title: objectiveTitle(row, stats), journal: objectiveJournalByChoice(row, stats) };
  };

  it('没做过相关抉择 ⇒ 标题回原样、分支日志为空（别把结局提前说出口）', () => {
    for (const row of 有标题变体的行) {
      expect(objectiveTitle(row, emptyStats()), `步 "${row.id}" 没抉择却换了名字`).toBe(row.title);
    }
    for (const row of 有日志变体的行) {
      expect(objectiveJournalByChoice(row, emptyStats()), `步 "${row.id}" 没抉择却写下了结局`).toBeUndefined();
    }
  });

  it('两个结局的名字与日志各不相同（同一行，选了哪条读哪条）', () => {
    const row = 有标题变体的行[0];
    const 旗标们 = Object.keys(row.titleByChoice);
    expect(旗标们.length, '这一格只写了一条变体').toBeGreaterThanOrEqual(2);
    const 标题们 = 旗标们.map((f) => 走(row, f).title);
    const 日志们 = 旗标们.map((f) => 走(row, f).journal);
    expect(new Set(标题们).size, '两条路给的是同一个名字 ⇒ 标题没有分岔').toBe(标题们.length);
    expect(new Set(日志们).size, '两条路给的是同一段日志 ⇒ 日志没有分岔').toBe(日志们.length);
    for (const v of [...标题们, ...日志们]) expect(v, '变体键是空的 ⇒ 显示侧会渲染出 undefined').toBeTruthy();
  });

  it('只认写了变体的行：没写的行不许回落成 row.journal（那是支线那套读者的字段）', () => {
    const 普通 = MAINLINE.find((r) => !r.journalByChoice && r.journal);
    expect(普通, '表里没有「带 journal 但不带 journalByChoice」的行 ⇒ 这条腿量不到回落').toBeTruthy();
    const stats = emptyStats();
    for (const flag of Object.keys(普通.requires ?? {})) stats.objectiveFlags[flag] = true;
    expect(objectiveJournalByChoice(普通, stats), '没写变体的行也吐了日志 ⇒ 一夜之间换掉 56 条正文').toBeUndefined();
  });

  it('资格没齐也照样分岔：名字不随 requires 收回去（B155 同一条口径）', () => {
    for (const 格 of ['titleByChoice', 'journalByChoice']) {
      const row = MAINLINE.filter((r) => r[格])[0];
      expect(Object.keys(row.requires ?? {}).length, '这一行没有 requires ⇒ 量不到资格门').toBeGreaterThan(0);
      const stats = emptyStats();
      const [旗标, 键] = Object.entries(row[格])[0];
      applyStatEvent(stats, 'choice-made', { flag: 旗标 });
      expect(objectiveRequiresMet(row, stats), '夹具失效：没出门就已经够格了').toBe(false);
      const got = 格 === 'titleByChoice' ? objectiveTitle(row, stats) : objectiveJournalByChoice(row, stats);
      expect(got, `资格没齐时把「${旗标}」的 ${格} 收回去 ⇒ 玩家拿到的名字不是自己选的那条`).toBe(键);
    }
  });
});
describe('⑥ 三格变体指向的键都在双表里（切片36 补的那一半）', () => {
  it('titleByChoice / journalByChoice 的每个键两张表都登记且非空', async () => {
    const { STRINGS_ZH, STRING_KEYS: ZH_KEYS } = await import('../src/content/strings.zh.js');
    const { STRING_KEYS: EN_KEYS } = await import('../src/content/strings.en.js');
    for (const 格 of ['titleByChoice', 'journalByChoice']) {
      const 行们 = MAINLINE.filter((r) => r[格]);
      expect(行们.length, `没有一行带 ${格} ⇒ 这条腿空转`).toBeGreaterThan(0);
      for (const row of 行们) {
        for (const [旗标, 键] of Object.entries(row[格])) {
          expect(ZH_KEYS, `步 "${row.id}" 的 ${格}（${旗标}）在中文表里没有 ${键}`).toContain(键);
          expect(EN_KEYS, `步 "${row.id}" 的 ${格}（${旗标}）在英文表里没有 ${键}`).toContain(键);
          expect(STRINGS_ZH[键], `键 ${键} 在中文表里是空的`).toBeTruthy();
        }
      }
    }
  });
});