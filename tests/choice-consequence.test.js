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
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MAINLINE, objectiveDesc, objectiveRequiresMet, emptyStats, applyStatEvent } from '../src/content/objectives.js';
import { checkObjectiveTable } from '../src/content/registry.js';

const 有变体的行 = MAINLINE.filter((r) => r.descByChoice);

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
  it('表里每一处变体的旗标都有抉择步设过', () => {
    const 毛病 = checkObjectiveTable(MAINLINE).filter((s) => s.includes('descByChoice'));
    expect(毛病, '这些变体引用的旗标没有任何抉择步设过 ⇒ 这一格永远换不了文案').toEqual([]);
  });

  it('写一个不存在的旗标 ⇒ 注册表当场点名（控制组）', () => {
    const 假 = MAINLINE.map((r) => (r.descByChoice
      ? { ...r, descByChoice: { ...r.descByChoice, choice_never_set: 'obj_true_end_desc_sealed' } }
      : r));
    const 毛病 = checkObjectiveTable(假).filter((s) => s.includes('choice_never_set'));
    expect(毛病.length, '写了一个不存在的旗标却没人报错').toBeGreaterThan(0);
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
