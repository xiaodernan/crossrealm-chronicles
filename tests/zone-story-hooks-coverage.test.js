/**
 * 区域叙事钩子的覆盖门禁 —— 防「看着很大、里面很空」。
 *
 * 病灶（实测，改前）：`ZONE_STORY_HOOKS` 只有 6 个区（hub + 五座旧区），
 * **缺 gloom（幽暗林地）与 radiant（辉煌圣域）**——这两座是 W-B9 后加的，建表时没跟上。
 * `StoryDirector` 在 `zone-changed` 里 `const hook = ZONE_STORY_HOOKS[id]; if (hook) {...}`：
 * 查不到就静默什么都不做，于是玩家第一次走进这两座区时**既没有区域介绍 toast、
 * 也没有日志条目**，而代码里没有任何一处能说出"这里少了两行"。
 *
 * 钉住三件事：
 *  ① 每座真实区域（ZONE_ORDER）+ hub 都必须有钩子；
 *  ② 每个钩子的 toast/journal 都是**文案键**，且中英两表都有、都非空；
 *  ③ 反向控制：corridor / unknown 不该有钩子（它们不是"一处地方"）。
 *
 * 变异判据：删掉任一区的钩子 → ①红；把某个键写成不存在的名字 → ②红。
 */
import { describe, it, expect, vi } from 'vitest';
import { ZONE_ORDER, ZONE_IDS } from '../src/content/ZoneIdentity.js';
import { ZONE_STORY_HOOKS } from '../src/game/LoreFragments.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

const 必须有的区 = [...ZONE_ORDER, ZONE_IDS.HUB];

describe('ZONE_STORY_HOOKS 覆盖全部真实区域', () => {
  it('每座真实区域 + hub 都有钩子（新加区域不许再漏）', () => {
    const missing = 必须有的区.filter((z) => !ZONE_STORY_HOOKS[z]);
    expect(missing, `缺区域钩子：${missing.join(', ')}`).toEqual([]);
  });

  it('每个钩子的 toast/journal 都是双表里真实存在的非空文案键', () => {
    for (const zone of 必须有的区) {
      const hook = ZONE_STORY_HOOKS[zone];
      expect(hook, `${zone} 无钩子`).toBeTruthy();
      for (const field of ['toast', 'journal']) {
        const key = hook[field];
        expect(typeof key, `${zone}.${field} 必须是文案键字符串`).toBe('string');
        expect(String(STRINGS_ZH[key] ?? '').trim(), `${zone}.${field} 的中文键 "${key}" 缺失或为空`).not.toBe('');
        expect(String(STRINGS_EN[key] ?? '').trim(), `${zone}.${field} 的英文键 "${key}" 缺失或为空`).not.toBe('');
      }
    }
  });

  it('反向控制：走廊与哨兵值不该有钩子（它们不是一处地方）', () => {
    expect(ZONE_STORY_HOOKS[ZONE_IDS.CORRIDOR]).toBeUndefined();
    expect(ZONE_STORY_HOOKS[ZONE_IDS.UNKNOWN]).toBeUndefined();
  });
});

describe('行为：新区域首次进入真的会弹介绍与落日志', () => {
  it('gloom / radiant 各触发一次 toast 与日志条目（不再静默）', async () => {
    const { StoryDirector } = await import('../src/game/StoryDirector.js');
    const { scheduler } = await import('../src/engine/Scheduler.js');
    const { emit } = await import('../src/engine/EventBus.js');
    const { t } = await import('../src/engine/i18n.js');

    for (const zoneId of ['gloom', 'radiant']) {
      const game = {
        dialog: { toast: vi.fn(), show: vi.fn() },
        storyJournal: { addSilent: vi.fn() },
        quests: { chapter: 1 },
        onlineServices: { enabled: () => false },
      };
      const dir = new StoryDirector(game);
      emit('zone-changed', {
        zone: { name: `zone_name_${zoneId}`, subtitle: `zone_hook_${zoneId}_toast` },
        zoneId,
      });
      scheduler.update(3); // 推进过 after(2.0)
      expect(game.dialog.toast, `${zoneId} 应有区域介绍 toast`).toHaveBeenCalled();
      const call = game.storyJournal.addSilent.mock.calls[0]?.[0];
      expect(call, `${zoneId} 应有日志条目`).toBeTruthy();
      expect(call.id).toBe(`zone-hook-${zoneId}`);
      expect(call.text).toBe(t(`zone_hook_${zoneId}_journal`));
      dir.dispose();
    }
  });
});
