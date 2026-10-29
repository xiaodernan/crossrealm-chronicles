/**
 * 真结局的**日志条目**真的分岔（W-E3 切片36）。
 *
 * 为什么单开一条行为腿：`tests/choice-consequence.test.js` 只证明那处算式本身对
 * （`objectiveTitle` / `objectiveJournalByChoice` 取到哪一格），它证明不了
 * **写日志的那一刻问的是它**。切片22 就吃过这一亏：算式写好了、显示侧还在读原值，
 * 所有静态腿都是绿的。
 *
 * 这条腿走真路：`StoryJournal.setupListeners()` 接上 `quest-updated`，
 * 派一条带真结局那一行的更新，再读日志条目里的标题与正文。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StoryJournal } from '../src/game/StoryJournal.js';
import { MAINLINE, emptyStats, applyStatEvent } from '../src/content/objectives.js';
import { setLanguage } from '../src/engine/i18n.js';

const 真结局 = MAINLINE.find((r) => r.id === 'true-end');
const 两条路 = ['choice_void_sealed', 'choice_void_studied'];

describe('真结局的日志条目（W-E3 切片36）', () => {
  let journal;

  beforeEach(() => {
    setLanguage('zh');
    journal = null;
  });

  afterEach(() => {
    journal?.dispose();
    setLanguage('zh');
  });

  const 走一步 = (flag) => {
    const stats = emptyStats();
    if (flag) applyStatEvent(stats, 'choice-made', { flag });
    journal = new StoryJournal({ quests: { chapter: 4, stats } });
    journal.setupListeners();
    window.dispatchEvent(new CustomEvent('quest-updated', {
      detail: { index: 41, current: 真结局, chapter: 4 },
    }));
    return journal.entries[0];
  };

  it('夹具自证：这一行确实带标题与日志两格变体', () => {
    expect(真结局, '表里找不到 true-end 那一行 —— 夹具失效').toBeTruthy();
    expect(Object.keys(真结局.titleByChoice ?? {}).sort()).toEqual([...两条路].sort());
    expect(Object.keys(真结局.journalByChoice ?? {}).sort()).toEqual([...两条路].sort());
  });

  it('选了封印 ⇒ 日志条目叫「真结局：封印虚空」，正文是封印那一句', () => {
    const 条 = 走一步('choice_void_sealed');
    expect(条.title).toBe('真结局：封印虚空');
    expect(条.text).toBe('封印结局：虚空被封，世界照旧。');
  });

  it('选了研习 ⇒ 同一个索引换成另一个名字与另一段日志', () => {
    const 条 = 走一步('choice_void_studied');
    expect(条.title).toBe('真结局：研习虚空');
    expect(条.text).toBe('研习结局：虚空被读，门开了，东西认得你。');
  });

  it('还没选 ⇒ 仍是通用标题，正文仍是进度句（别提前把结局说出口）', () => {
    const 条 = 走一步(null);
    expect(条.title).toBe('真·位面行者');
    expect(条.text).toBe('集齐四枚碎片后触摸世界之锚。');
  });
});