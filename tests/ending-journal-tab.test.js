/**
 * W-Z51「归途残卷」—— 终局后才点亮的那一页：锁/解锁双态 + 终局取名 + 星尘铭文复用。
 *
 * 三件事钉住：
 * 1) 通关前（quests.completed !== true）⇒ 一个锁 + 锁语文案；一枚铭文都不渲
 * 2) 通关后 ⇒ 终局正文按 `endingDialogKey()` 的既有口径反推：
 *    choice_final_keep → 留灯 intro；choice_final_quiet → 熄灯 intro；无抉择 → 通用 intro
 * 3) 解锁口径复用 `ACHIEVEMENTS.unlocked ∩ ECHO_EPITAPHS`：只亮真正解锁的那几枚，
 *    且「x / 17」计数与卡牌一致（不引入第二套判定）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EndingJournalTab } from '../src/ui/EndingJournalTab.js';
import { ECHO_EPITAPHS } from '../src/content/echoEpitaphs.js';
import { setLanguage } from '../src/engine/i18n.js';

function freshTab({ completed = false, decisions = new Set(), unlocked = [] } = {}) {
  const game = {
    quests: { chapter: 5, completed, stats: { decisions } },
    achievements: { unlocked: new Set(unlocked) },
  };
  return new EndingJournalTab(game);
}

const fakePanel = () => ({
  innerHTML: '',
  querySelectorAll: () => [], // refreshKeyText 走这里：空集合即跳过（h2 要的 keyText 直通）
});

beforeEach(() => setLanguage('zh'));

describe('归途残卷（W-Z51）', () => {
  it('通关前：一个锁 + 锁语文案；未渲任何铭文卡', () => {
    const panel = fakePanel();
    freshTab({ completed: false }).render(panel);
    expect(panel.innerHTML).toContain('ending-locked');
    expect(panel.innerHTML).toContain('锚火属于走完这段路的人');
    expect(panel.innerHTML).not.toContain('ach-ept-grid');
    expect(panel.innerHTML).not.toContain('铭文解锁计数'); // sanity: 未渲 unlocked 行
    expect(panel.innerHTML).toContain('归途残卷');
  });

  it('通关 + 未抉择（老档）：通用 intro，17 枚全部🔒', () => {
    const panel = fakePanel();
    freshTab({ completed: true }).render(panel);
    expect(panel.innerHTML).toContain('锚火记得每一位按过 E 的旅人');
    expect(panel.innerHTML).toContain('ending-intro');
    expect(panel.innerHTML).not.toContain('把火留给后来人');
    expect(panel.innerHTML.match(/ending_locked|🔒/g)?.length ?? 0).toBeGreaterThanOrEqual(ECHO_EPITAPHS.length);
    expect(panel.innerHTML).toContain('0 / 17');
  });

  it('通关 + choice_final_keep：留灯 intro', () => {
    const panel = fakePanel();
    freshTab({ completed: true, decisions: new Set(['choice_final_keep']) }).render(panel);
    expect(panel.innerHTML).toContain('把火留给后来人那年，你成了自己的锚');
  });

  it('通关 + choice_final_quiet：熄灯 intro', () => {
    const panel = fakePanel();
    freshTab({ completed: true, decisions: new Set(['choice_final_quiet']) }).render(panel);
    expect(panel.innerHTML).toContain('你亲手熄掉了锚点那年');
  });

  it('铭文解锁态：2 枚亮灯、其余 🔒；计数 = 2 / 17', () => {
    const panel = fakePanel();
    freshTab({
      completed: true,
      unlocked: ['echo-wizard-6', 'echo-space-6'],
    }).render(panel);
    const unlockedCount = (panel.innerHTML.match(/ach-epitaph-unlocked/g) ?? []).length;
    expect(unlockedCount).toBe(2);
    expect(panel.innerHTML).toContain('已解锁 2 / 17 枚星尘铭文');
  });
});
