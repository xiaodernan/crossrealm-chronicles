/**
 * 支线页签的位面徽标（W-B12 切片6）—— 那条支线绑在哪座位面。
 *
 * ## 这一片补的是什么
 *
 * 分区支线（`side-zone-<区>` / `side-wisp-<区>`）与单系列致敬支线（`side-<系列>-tour`）
 * 都**绑在某一座位面**上，而页签上 31 张卡排在一起时，玩家分不出"这条是那边的" ——
 * 于是"去那座区做这件事"在纸面上没有着落。
 *
 * 数据早就就绪（每条支线行上的 `zone` 那一格），缺的是**渲染**。
 *
 * ## 三条判据各有一种死法
 *
 * 1. **绑了位面的支线必须挂徽标** —— 漏一条 = 那一条在纸面上没有着落（正是本片要修的病）。
 * 2. **徽标上写的是那位面的显示名** —— 写 id 等于把内部标识漏给玩家；写别的区的名等于说谎。
 * 3. **`global` 的那些不挂徽标** —— 它们不属于任何一座区，挂了等于说谎。
 */
import { describe, it, expect } from 'vitest';
import { SIDE_QUESTS_ALL } from '../src/content/sideQuests.js';
import { ZONE_NAMES, ZONE_ORDER } from '../src/content/ZoneIdentity.js';
import { SideQuestJournalTab } from '../src/ui/SideQuestJournalTab.js';
import { t } from '../src/engine/i18n.js';

/** 面板桩：`refreshKeyText` 会问它要 `[data-keys]` 元素（支线描述里没有那种占位，返回空即可） */
const 造面板 = () => ({ innerHTML: '', querySelectorAll: () => [] });

/** 走真的页签渲染（真 `SIDE_QUESTS_ALL`、真 `t()`） */
function 渲染() {
  const game = { sideQuests: { completed: new Set(), getProgress: () => ({ done: 0, total: SIDE_QUESTS_ALL.length }) } };
  const 面板 = 造面板();
  new SideQuestJournalTab(game).render(面板);
  return 面板.innerHTML;
}

describe('① 位面徽标真的挂上去了', () => {
  const html = 渲染();

  it('绑了位面的支线都挂上了徽标（漏一条 = 那一条在纸面上没有着落）', () => {
    const 绑了的 = SIDE_QUESTS_ALL.filter((q) => q.zone && q.zone !== 'global');
    expect(绑了的.length, '一条绑了位面的支线都没有 —— 判据空转').toBeGreaterThan(10);
    const 徽标数 = (html.match(/class="sq-zone"/g) ?? []).length;
    expect(徽标数, `徽标数 ${徽标数} 与绑了位面的支线数 ${绑了的.length} 对不上`).toBe(绑了的.length);
  });

  it('徽标上写的是那位面的显示名（不是 id，也不是别的区）', () => {
    for (const q of SIDE_QUESTS_ALL) {
      if (!q.zone || q.zone === 'global') continue;
      const 期望 = t('side_quest_zone_badge', { zone: t(ZONE_NAMES[q.zone]) });
      expect(html, `支线 "${q.id}" 的徽标没写着 ${期望}`).toContain(期望);
    }
  });

  it('`global` 的那些不挂徽标（它们不属于任何一座区，挂了等于说谎）', () => {
    const 全局 = SIDE_QUESTS_ALL.filter((q) => q.zone === 'global');
    expect(全局.length, '一条 global 支线都没有 —— 判据空转').toBeGreaterThan(0);
    const 绑了的 = SIDE_QUESTS_ALL.filter((q) => q.zone && q.zone !== 'global');
    const 徽标数 = (html.match(/class="sq-zone"/g) ?? []).length;
    expect(徽标数, 'global 的那些也挂了徽标').toBe(绑了的.length);
  });

  it('徽标不吞掉别的内容（标题 / 描述 / 奖励都还在）', () => {
    expect(html).toContain('sq-title');
    expect(html).toContain('sq-desc');
    expect(html).toContain('sq-reward');
    // 每张卡一个头行（标题 + 徽标）
    const 卡数 = (html.match(/class="sq-card/g) ?? []).length;
    const 头行数 = (html.match(/class="sq-head"/g) ?? []).length;
    expect(卡数, '一张卡都没有').toBe(SIDE_QUESTS_ALL.length);
    expect(头行数, '头行数与卡片数对不上').toBe(卡数);
  });
});

describe('② 每一位面的支线都在页签上有着落', () => {
  it('七座真实位面每一位都至少有一条绑了自己的支线', () => {
    for (const zone of ZONE_ORDER) {
      const n = SIDE_QUESTS_ALL.filter((q) => q.zone === zone).length;
      expect(n, `位面 "${zone}" 没有一条专属支线 —— 页签上它一格都不占`).toBeGreaterThan(0);
    }
  });

  it('每一位面的显示名都登记在案（徽标写的是显示名，不是 id）', () => {
    for (const zone of ZONE_ORDER) {
      expect(ZONE_NAMES[zone], `位面 "${zone}" 没有显示名键 —— 徽标写不出人来`).toBeTruthy();
      expect(t(ZONE_NAMES[zone]), `位面 "${zone}" 的显示名展开成空`).toBeTruthy();
    }
  });
});
